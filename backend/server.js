const express = require("express");
const cors = require("cors");
require("dotenv").config();
const pool = require("./src/config/db");

const app = express();

app.use(cors());
app.use(express.json());

const VALID_MODES = ["disarmed", "home", "away"];

async function getSystemState() {
  const result = await pool.query(
    "SELECT * FROM system_state ORDER BY id ASC LIMIT 1"
  );
  return result.rows[0];
}

async function setSystemMode(mode) {
  if (!VALID_MODES.includes(mode)) {
    const error = new Error("Invalid mode");
    error.statusCode = 400;
    throw error;
  }

  const result = await pool.query(
    `UPDATE system_state
     SET current_mode = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1
     RETURNING *`,
    [mode]
  );

  return result.rows[0];
}

async function processSensorEvent(sensorName, source = "simulation") {
  if (!sensorName) {
    const error = new Error("sensor_name is required");
    error.statusCode = 400;
    throw error;
  }

  const sensorResult = await pool.query(
    "SELECT * FROM sensors WHERE sensor_name = $1 LIMIT 1",
    [sensorName]
  );

  if (sensorResult.rows.length === 0) {
    const error = new Error("Sensor not found");
    error.statusCode = 404;
    throw error;
  }

  const sensor = sensorResult.rows[0];
  const systemState = await getSystemState();
  const mode = systemState.current_mode;

  const isDisarmed = mode === "disarmed";
  const isHome = mode === "home";
  const isAway = mode === "away";

  let eventType = "";
  let severity = "low";
  let message = "";
  let actionTaken = "logged only";
  let shouldTriggerAlarm = false;

  if (sensor.sensor_type === "motion") {
    eventType = "motion_detected";
    message = `Motion detected in ${sensor.location}`;
    shouldTriggerAlarm = isAway;
    severity = shouldTriggerAlarm ? "high" : "low";
  } else if (sensor.sensor_type === "door") {
    eventType = "door_breach";
    message = `Main door opened / breached at ${sensor.location}`;
    shouldTriggerAlarm = isHome || isAway;
    severity = shouldTriggerAlarm ? "high" : "low";
  } else if (
    sensor.sensor_type === "vibration" ||
    sensor.sensor_type === "window_vibration"
  ) {
    eventType = "window_vibration_detected";
    message = `Window vibration detected at ${sensor.location}`;
    shouldTriggerAlarm = isHome || isAway;
    severity = shouldTriggerAlarm ? "high" : "low";
  } else if (sensor.sensor_type === "gas" || sensor.sensor_type === "smoke") {
    eventType = "gas_detected";
    severity = "high";
    message = `Gas leak detected in ${sensor.location}`;
    shouldTriggerAlarm = true;
  } else if (sensor.sensor_type === "flame") {
    eventType = "flame_detected";
    severity = "critical";
    message = `Fire detected in ${sensor.location}`;
    shouldTriggerAlarm = true;

    await pool.query(
      `UPDATE system_state
       SET sprinkler_on = TRUE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`
    );

    actionTaken = "sprinkler activated";
  } else {
    const error = new Error("Unsupported sensor type");
    error.statusCode = 400;
    throw error;
  }

  if (shouldTriggerAlarm) {
    await pool.query(
      `UPDATE system_state
       SET buzzer_on = TRUE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`
    );

    actionTaken =
      actionTaken === "logged only"
        ? "buzzer activated"
        : `buzzer activated + ${actionTaken}`;
  }

  await pool.query(
    `UPDATE sensors
     SET status = 'triggered',
         last_value = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [eventType, sensor.id]
  );

  const eventInsert = await pool.query(
    `INSERT INTO events (sensor_id, event_type, severity, message, action_taken)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [sensor.id, eventType, severity, message, actionTaken]
  );

  await pool.query(
    `INSERT INTO notifications (title, body)
     VALUES ($1, $2)`,
    [`Alert: ${eventType}`, `${message} [mode: ${mode}, source: ${source}]`]
  );

  return {
    success: true,
    event: eventInsert.rows[0],
    mode,
    shouldTriggerAlarm,
    actionTaken,
  };
}

async function processNfcAccess({ authorized, nfc_uid, user_name }) {
  if (typeof authorized !== "boolean") {
    const error = new Error("authorized must be true or false");
    error.statusCode = 400;
    throw error;
  }

  const systemState = await getSystemState();
  const previousMode = systemState.current_mode;

  if (authorized) {
    let newMode = previousMode;
    let modeChangeMessage = "mode unchanged";

    if (previousMode === "away") {
      newMode = "home";
      modeChangeMessage = "system switched from away to home";
    }

    await pool.query(
      `UPDATE system_state
       SET door_locked = FALSE,
           buzzer_on = FALSE,
           current_mode = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [newMode]
    );

    await pool.query(
      `INSERT INTO access_logs (nfc_uid, user_name, access_result)
       VALUES ($1, $2, 'granted')`,
      [nfc_uid || "123ABC", user_name || "Authorized User"]
    );

    await pool.query(
      `INSERT INTO events (event_type, severity, message, action_taken)
       VALUES ($1, $2, $3, $4)`,
      [
        "authorized_access",
        "low",
        `Authorized NFC access granted (${previousMode} -> ${newMode})`,
        `door unlocked, ${modeChangeMessage}`,
      ]
    );

    await pool.query(
      `INSERT INTO notifications (title, body)
       VALUES ($1, $2)`,
      [
        "Access Granted",
        `Authorized NFC tag used successfully. ${modeChangeMessage}.`,
      ]
    );

    return {
      message: "Access granted",
      previousMode,
      newMode,
    };
  }

  await pool.query(
    `INSERT INTO access_logs (nfc_uid, user_name, access_result)
     VALUES ($1, $2, 'denied')`,
    [nfc_uid || "unknown", user_name || "Unknown User"]
  );

  await pool.query(`
    INSERT INTO events (event_type, severity, message, action_taken)
    VALUES ('unauthorized_access', 'high', 'Unauthorized NFC attempt', 'alarm triggered')
  `);

  await pool.query(`
    INSERT INTO notifications (title, body)
    VALUES ('Alert: unauthorized_access', 'Unauthorized NFC attempt at main door')
  `);

  await pool.query(`
    UPDATE system_state
    SET buzzer_on = TRUE,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `);

  return { message: "Access denied - alarm triggered" };
}

function sendError(res, error) {
  const status = error.statusCode || 500;
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({ error: error.message });
}

app.get("/", (req, res) => {
  res.json({ message: "Home Security System API is running" });
});

app.get("/api/health", async (req, res) => {
  try {
    const db = await pool.query("SELECT NOW()");
    res.json({ ok: true, databaseTime: db.rows[0].now });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/system-state", async (req, res) => {
  try {
    res.json(await getSystemState());
  } catch (error) {
    sendError(res, error);
  }
});

app.put("/api/system-mode", async (req, res) => {
  try {
    res.json(await setSystemMode(req.body?.mode));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/system-mode", async (req, res) => {
  try {
    res.json(await setSystemMode(req.body?.mode));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/sensors", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM sensors ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT events.*, sensors.sensor_name, sensors.location
      FROM events
      LEFT JOIN sensors ON events.sensor_id = sensors.id
      ORDER BY events.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/notifications", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10"
    );
    res.json(result.rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/simulate-event", async (req, res) => {
  try {
    res.json(await processSensorEvent(req.body?.sensor_name, "simulation"));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/simulate-nfc", async (req, res) => {
  try {
    res.json(await processNfcAccess(req.body ?? {}));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/reset-system", async (req, res) => {
  try {
    await pool.query(`
      UPDATE system_state
      SET buzzer_on = FALSE,
          sprinkler_on = FALSE,
          door_locked = TRUE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    await pool.query(`
      UPDATE sensors
      SET status = 'idle',
          last_value = NULL,
          updated_at = CURRENT_TIMESTAMP
    `);

    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/access-logs", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM access_logs ORDER BY created_at DESC LIMIT 10"
    );
    res.json(result.rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/full-reset", async (req, res) => {
  try {
    await pool.query("DELETE FROM events");
    await pool.query("DELETE FROM notifications");
    await pool.query("DELETE FROM access_logs");

    await pool.query(`
      UPDATE system_state
      SET current_mode = 'disarmed',
          buzzer_on = FALSE,
          sprinkler_on = FALSE,
          door_locked = TRUE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    await pool.query(`
      UPDATE sensors
      SET status = 'idle',
          last_value = NULL,
          updated_at = CURRENT_TIMESTAMP
    `);

    res.json({ success: true, message: "Full system reset completed" });
  } catch (error) {
    sendError(res, error);
  }
});

// ESP32 integration points. The firmware can POST sensor/NFC events here, then
// poll commands to learn the current app-selected mode and actuator state.
app.post("/api/esp/sensor-event", async (req, res) => {
  try {
    const sensorName = req.body?.sensor_name || req.body?.sensorName;
    res.json(await processSensorEvent(sensorName, "esp32"));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/esp/nfc-access", async (req, res) => {
  try {
    res.json(await processNfcAccess(req.body ?? {}));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/esp/commands", async (req, res) => {
  try {
    const state = await getSystemState();
    res.json({
      mode: state.current_mode,
      buzzer_on: state.buzzer_on,
      sprinkler_on: state.sprinkler_on,
      door_locked: state.door_locked,
      updated_at: state.updated_at,
    });
  } catch (error) {
    sendError(res, error);
  }
});

const PORT = Number(process.env.PORT || 55000);
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
