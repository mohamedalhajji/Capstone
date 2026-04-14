const express = require("express");
const cors = require("cors");
require("dotenv").config();
const pool = require("./src/config/db");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Home Security System API is running" });
});

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/system-state", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM system_state ORDER BY id ASC LIMIT 1"
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/system-mode", async (req, res) => {
  const mode = req.body?.mode;

  if (!mode) {
    return res.status(400).json({ error: "Mode is required in request body" });
  }

  if (!["disarmed", "home", "away"].includes(mode)) {
    return res.status(400).json({ error: "Invalid mode" });
  }

  try {
    const result = await pool.query(
      `UPDATE system_state
       SET current_mode = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING *`,
      [mode]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sensors", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM sensors ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/notifications", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10"
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/simulate-event", async (req, res) => {
  const { sensor_name } = req.body ?? {};

  if (!sensor_name) {
    return res.status(400).json({ error: "sensor_name is required" });
  }

  try {
    const sensorResult = await pool.query(
      "SELECT * FROM sensors WHERE sensor_name = $1 LIMIT 1",
      [sensor_name]
    );

    if (sensorResult.rows.length === 0) {
      return res.status(404).json({ error: "Sensor not found" });
    }

    const sensor = sensorResult.rows[0];

    const stateResult = await pool.query(
      "SELECT * FROM system_state WHERE id = 1"
    );

    const systemState = stateResult.rows[0];
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

      if (isAway) {
        severity = "high";
        shouldTriggerAlarm = true;
      } else {
        severity = "low";
      }
    } else if (sensor.sensor_type === "door") {
      eventType = "door_breach";
      message = `Main door opened / breached at ${sensor.location}`;

      if (isHome || isAway) {
        severity = "high";
        shouldTriggerAlarm = true;
      } else {
        severity = "low";
      }
    } else if (sensor.sensor_type === "vibration") {
      eventType = "window_vibration_detected";
      message = `Window vibration detected at ${sensor.location}`;

      if (isHome || isAway) {
        severity = "high";
        shouldTriggerAlarm = true;
      } else {
        severity = "low";
      }
    } else if (sensor.sensor_type === "gas") {
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
      return res.status(400).json({ error: "Unsupported sensor type" });
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
      [`Alert: ${eventType}`, `${message} [mode: ${mode}]`]
    );

    res.json({
      success: true,
      event: eventInsert.rows[0],
      mode,
      shouldTriggerAlarm,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/simulate-nfc", async (req, res) => {
  const { authorized } = req.body ?? {};

  if (typeof authorized !== "boolean") {
    return res.status(400).json({ error: "authorized must be true or false" });
  }

  try {
    const stateResult = await pool.query(
      "SELECT * FROM system_state WHERE id = 1"
    );

    const systemState = stateResult.rows[0];
    const previousMode = systemState.current_mode;

    if (authorized) {
      let newMode = previousMode;
      let modeChangeMessage = "mode unchanged";

      // Smart rule:
      // if door unlock is successful while system is away,
      // automatically switch to home
      if (previousMode === "away") {
        newMode = "home";
        modeChangeMessage = "system switched from away to home";
      }

      await pool.query(
        `UPDATE system_state
         SET door_locked = FALSE,
             buzzer_on = FALSE
             current_mode = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [newMode]
      );

      await pool.query(`
        INSERT INTO access_logs (nfc_uid, user_name, access_result)
        VALUES ('123ABC', 'Authorized User', 'granted')
      `);

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

      res.json({
        message: "Access granted",
        previousMode,
        newMode,
      });
    } else {
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

      res.json({ message: "Access denied - alarm triggered" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
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
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/access-logs", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM access_logs ORDER BY created_at DESC LIMIT 10"
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
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
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});