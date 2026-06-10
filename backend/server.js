const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const pool = require("./src/config/db");

const app = express();

app.use(cors());
app.use(express.json());

const VALID_MODES = ["disarmed", "home", "away"];

let memoryEventId = 1;
let memoryNotificationId = 1;
let memoryAccessLogId = 1;
let memoryUserId = 1;

const memorySensors = [
  { id: 1, sensor_name: "motion_living_room", sensor_type: "motion", location: "Living Room", status: "idle", last_value: null },
  { id: 2, sensor_name: "gas_kitchen", sensor_type: "gas", location: "Kitchen", status: "idle", last_value: null },
  { id: 3, sensor_name: "flame_kitchen", sensor_type: "flame", location: "Kitchen", status: "idle", last_value: null },
  { id: 4, sensor_name: "door_main", sensor_type: "door", location: "Main Door", status: "idle", last_value: null },
  { id: 5, sensor_name: "vibration_window", sensor_type: "vibration", location: "Window", status: "idle", last_value: null },
  { id: 6, sensor_name: "nfc_main_door", sensor_type: "nfc", location: "Main Door", status: "idle", last_value: null },
];

const memoryState = {
  id: 1,
  current_mode: "away",
  buzzer_on: false,
  sprinkler_on: false,
  door_locked: true,
  esp_pending_command: null,
  esp_last_seen: null,
  updated_at: new Date().toISOString(),
};

const memoryEvents = [];
const memoryNotifications = [];
const memoryAccessLogs = [];
const memoryUsers = [];

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    created_at: user.created_at,
  };
}

function signUserToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateAuthInput({ name, email, password }, signingUp = false) {
  const normalizedEmail = normalizeEmail(email);
  const cleanName = String(name || "").trim();

  if (signingUp && cleanName.length < 2) {
    const error = new Error("Name must be at least 2 characters");
    error.statusCode = 400;
    throw error;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    const error = new Error("Enter a valid email address");
    error.statusCode = 400;
    throw error;
  }

  if (String(password || "").length < 6) {
    const error = new Error("Password must be at least 6 characters");
    error.statusCode = 400;
    throw error;
  }

  return { name: cleanName, email: normalizedEmail, password: String(password) };
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

function isDbUnavailable(error) {
  return error?.code === "ECONNREFUSED" || error?.code === "ENOTFOUND";
}

function isMissingColumn(error, columnName) {
  return error?.code === "42703" && String(error.message || "").includes(columnName);
}

function touchMemoryState() {
  memoryState.updated_at = new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function getSystemState() {
  try {
    const result = await pool.query(
      "SELECT * FROM system_state ORDER BY id ASC LIMIT 1"
    );
    return result.rows[0];
  } catch (error) {
    if (!isDbUnavailable(error)) throw error;
    return clone(memoryState);
  }
}

async function setSystemMode(mode) {
  if (!VALID_MODES.includes(mode)) {
    const error = new Error("Invalid mode");
    error.statusCode = 400;
    throw error;
  }

  const espCommand = mode === "away" ? "ON" : "OFF";
  const doorLocked = mode === "away";

  try {
    const result = await pool.query(
      `UPDATE system_state
       SET current_mode = $1,
           esp_pending_command = $2,
           door_locked = $3,
           buzzer_on = FALSE,
           sprinkler_on = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING *`,
      [mode, espCommand, doorLocked]
    );

    return result.rows[0];
  } catch (error) {
    if (!isDbUnavailable(error)) throw error;
    memoryState.current_mode = mode;
    memoryState.esp_pending_command = espCommand;
    memoryState.door_locked = doorLocked;
    memoryState.buzzer_on = false;
    memoryState.sprinkler_on = false;
    touchMemoryState();
    return clone(memoryState);
  }
}

async function setPendingEspCommand(command) {
  try {
    const result = await pool.query(
      `UPDATE system_state
       SET esp_pending_command = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING *`,
      [command]
    );

    return result.rows[0];
  } catch (error) {
    if (!isDbUnavailable(error)) throw error;
    memoryState.esp_pending_command = command;
    touchMemoryState();
    return clone(memoryState);
  }
}

async function createUser({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name, email, passwordHash]
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      const duplicateError = new Error("An account with this email already exists");
      duplicateError.statusCode = 409;
      throw duplicateError;
    }
    if (!isDbUnavailable(error)) throw error;

    if (memoryUsers.some((user) => user.email === email)) {
      const duplicateError = new Error("An account with this email already exists");
      duplicateError.statusCode = 409;
      throw duplicateError;
    }

    const user = {
      id: memoryUserId++,
      name,
      email,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    };
    memoryUsers.push(user);
    return publicUser(user);
  }
}

async function findUserByEmail(email) {
  try {
    const result = await pool.query(
      "SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    return result.rows[0] || null;
  } catch (error) {
    if (!isDbUnavailable(error)) throw error;
    return memoryUsers.find((user) => user.email === email) || null;
  }
}

async function findUserById(id) {
  try {
    const result = await pool.query(
      "SELECT id, name, email, password_hash, created_at FROM users WHERE id = $1 LIMIT 1",
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    if (!isDbUnavailable(error)) throw error;
    return memoryUsers.find((item) => item.id === Number(id)) || null;
  }
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      const error = new Error("Missing auth token");
      error.statusCode = 401;
      throw error;
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(payload.sub);

    if (!user) {
      const error = new Error("Invalid or expired session");
      error.statusCode = 401;
      throw error;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      error.statusCode = 401;
      error.message = "Invalid or expired session";
    }
    sendError(res, error);
  }
}

async function processSensorEvent(sensorName, source = "simulation") {
  if (!sensorName) {
    const error = new Error("sensor_name is required");
    error.statusCode = 400;
    throw error;
  }

  let sensor;

  try {
    const sensorResult = await pool.query(
      "SELECT * FROM sensors WHERE sensor_name = $1 LIMIT 1",
      [sensorName]
    );

    if (sensorResult.rows.length === 0) {
      const error = new Error("Sensor not found");
      error.statusCode = 404;
      throw error;
    }

    sensor = sensorResult.rows[0];
  } catch (error) {
    if (!isDbUnavailable(error)) throw error;
    sensor = memorySensors.find((item) => item.sensor_name === sensorName);
  }

  if (!sensor) {
    const error = new Error("Sensor not found");
    error.statusCode = 404;
    throw error;
  }

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

    memoryState.sprinkler_on = true;
    touchMemoryState();

    try {
      await pool.query(
        `UPDATE system_state
         SET sprinkler_on = TRUE,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`
      );
    } catch (error) {
      if (!isDbUnavailable(error)) throw error;
    }

    actionTaken = "sprinkler activated";
  } else {
    const error = new Error("Unsupported sensor type");
    error.statusCode = 400;
    throw error;
  }

  if (shouldTriggerAlarm) {
    memoryState.buzzer_on = true;
    touchMemoryState();

    try {
      await pool.query(
        `UPDATE system_state
         SET buzzer_on = TRUE,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`
      );
    } catch (error) {
      if (!isDbUnavailable(error)) throw error;
    }

    actionTaken =
      actionTaken === "logged only"
        ? "buzzer activated"
        : `buzzer activated + ${actionTaken}`;
  }

  const memorySensor = memorySensors.find((item) => item.sensor_name === sensor.sensor_name);
  if (memorySensor) {
    memorySensor.status = "triggered";
    memorySensor.last_value = eventType;
    memorySensor.updated_at = new Date().toISOString();
  }

  let event = {
    id: memoryEventId++,
    sensor_id: sensor.id,
    event_type: eventType,
    severity,
    message,
    action_taken: actionTaken,
    created_at: new Date().toISOString(),
    sensor_name: sensor.sensor_name,
    location: sensor.location,
  };

  memoryEvents.unshift(event);
  memoryNotifications.unshift({
    id: memoryNotificationId++,
    title: `Alert: ${eventType}`,
    body: `${message} [mode: ${mode}, source: ${source}]`,
    created_at: new Date().toISOString(),
  });

  try {
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

    event = eventInsert.rows[0];
  } catch (error) {
    if (!isDbUnavailable(error)) throw error;
  }

  return {
    success: true,
    event,
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
  const nfcStatusValue = authorized ? "authorized_access" : "unauthorized_access";

  const nfcSensor = memorySensors.find((sensor) => sensor.sensor_name === "nfc_main_door");
  if (nfcSensor) {
    nfcSensor.status = "triggered";
    nfcSensor.last_value = nfcStatusValue;
    nfcSensor.updated_at = new Date().toISOString();
  }

  try {
    await pool.query(
      `UPDATE sensors
       SET status = 'triggered',
           last_value = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE sensor_name = 'nfc_main_door'`,
      [nfcStatusValue]
    );
  } catch (error) {
    if (!isDbUnavailable(error)) throw error;
  }

  if (authorized) {
    let newMode = previousMode;
    let modeChangeMessage = "mode unchanged";

    if (previousMode === "away") {
      newMode = "home";
      modeChangeMessage = "system switched from away to home";
    }
    const modeChanged = previousMode !== newMode;
    const authorizedAccessMessage = modeChanged
      ? `Authorized NFC access granted (${previousMode} -> ${newMode})`
      : "Authorized NFC access granted";

    memoryState.door_locked = false;
    memoryState.buzzer_on = false;
    memoryState.current_mode = newMode;
    touchMemoryState();

    memoryAccessLogs.unshift({
      id: memoryAccessLogId++,
      nfc_uid: nfc_uid || "123ABC",
      user_name: user_name || "Authorized User",
      access_result: "granted",
      created_at: new Date().toISOString(),
    });
    memoryEvents.unshift({
      id: memoryEventId++,
      event_type: "authorized_access",
      severity: "low",
      message: authorizedAccessMessage,
      action_taken: `door unlocked, ${modeChangeMessage}`,
      created_at: new Date().toISOString(),
    });
    memoryNotifications.unshift({
      id: memoryNotificationId++,
      title: "Access Granted",
      body: `Authorized NFC tag used successfully. ${modeChangeMessage}.`,
      created_at: new Date().toISOString(),
    });

    try {
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
          authorizedAccessMessage,
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
    } catch (error) {
      if (!isDbUnavailable(error)) throw error;
    }

    return {
      message: "Access granted",
      previousMode,
      newMode,
    };
  }

  memoryAccessLogs.unshift({
    id: memoryAccessLogId++,
    nfc_uid: nfc_uid || "unknown",
    user_name: user_name || "Unknown User",
    access_result: "denied",
    created_at: new Date().toISOString(),
  });
  memoryEvents.unshift({
    id: memoryEventId++,
    event_type: "unauthorized_access",
    severity: "high",
    message: "Unauthorized NFC attempt",
    action_taken: "alarm triggered",
    created_at: new Date().toISOString(),
  });
  memoryNotifications.unshift({
    id: memoryNotificationId++,
    title: "Alert: unauthorized_access",
    body: "Unauthorized NFC attempt at main door",
    created_at: new Date().toISOString(),
  });
  memoryState.buzzer_on = true;
  touchMemoryState();

  try {
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
  } catch (error) {
    if (!isDbUnavailable(error)) throw error;
  }

  return { message: "Access denied - alarm triggered" };
}

function sendError(res, error) {
  const status = error.statusCode || 500;
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({ error: error.message || error.code || "Server error" });
}

app.get("/", (req, res) => {
  res.json({ message: "Home Security System API is running" });
});

app.get("/api/health", async (req, res) => {
  try {
    const db = await pool.query("SELECT NOW()");
    res.json({ ok: true, databaseTime: db.rows[0].now });
  } catch (error) {
    if (!isDbUnavailable(error)) return sendError(res, error);
    res.json({ ok: true, database: "memory-fallback", databaseError: error.code });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const input = validateAuthInput(req.body ?? {}, true);
    const user = await createUser(input);
    const token = signUserToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const input = validateAuthInput(req.body ?? {}, false);
    const user = await findUserByEmail(input.email);
    const valid = user ? await bcrypt.compare(input.password, user.password_hash) : false;

    if (!valid) {
      const error = new Error("Invalid email or password");
      error.statusCode = 401;
      throw error;
    }

    const token = signUserToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      const error = new Error("Missing auth token");
      error.statusCode = 401;
      throw error;
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(payload.sub);

    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 401;
      throw error;
    }

    res.json({ user: publicUser(user) });
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      error.statusCode = 401;
      error.message = "Invalid or expired session";
    }
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

app.post("/api/auth/verify-password", requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const valid = currentPassword.length > 0 && await bcrypt.compare(currentPassword, req.user.password_hash);

    if (!valid) {
      const error = new Error("Current password is incorrect");
      error.statusCode = 401;
      throw error;
    }

    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const valid = currentPassword.length > 0 && await bcrypt.compare(currentPassword, req.user.password_hash);

    if (!valid) {
      const error = new Error("Current password is incorrect");
      error.statusCode = 401;
      throw error;
    }

    if (newPassword.length < 6) {
      const error = new Error("Password must be at least 6 characters");
      error.statusCode = 400;
      throw error;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    try {
      await pool.query(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        [passwordHash, req.user.id]
      );
    } catch (error) {
      if (!isDbUnavailable(error)) throw error;
      const memoryUser = memoryUsers.find((user) => user.id === req.user.id);
      if (memoryUser) memoryUser.password_hash = passwordHash;
    }

    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/system-state", requireAuth, async (req, res) => {
  try {
    res.json(await getSystemState());
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/storage-status", requireAuth, async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ storage: "postgres", persistent: true });
  } catch (error) {
    if (!isDbUnavailable(error)) return sendError(res, error);
    res.json({ storage: "memory-fallback", persistent: false, databaseError: error.code });
  }
});

app.put("/api/system-mode", requireAuth, async (req, res) => {
  try {
    res.json(await setSystemMode(req.body?.mode));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/system-mode", requireAuth, async (req, res) => {
  try {
    res.json(await setSystemMode(req.body?.mode));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/sensors", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM sensors ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    if (!isDbUnavailable(error)) return sendError(res, error);
    res.json(clone(memorySensors));
  }
});

app.get("/api/events", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT events.*, sensors.sensor_name, sensors.location
      FROM events
      LEFT JOIN sensors ON events.sensor_id = sensors.id
      ORDER BY events.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    if (!isDbUnavailable(error)) return sendError(res, error);
    res.json(clone(memoryEvents));
  }
});

app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10"
    );
    res.json(result.rows);
  } catch (error) {
    if (!isDbUnavailable(error)) return sendError(res, error);
    res.json(clone(memoryNotifications.slice(0, 10)));
  }
});

app.post("/api/reset-system", requireAuth, async (req, res) => {
  try {
    await pool.query(`
      UPDATE system_state
      SET current_mode = 'away',
          buzzer_on = FALSE,
          sprinkler_on = FALSE,
          door_locked = TRUE,
          esp_pending_command = 'RESETOUTPUTS',
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
    if (!isDbUnavailable(error)) return sendError(res, error);
    memoryState.buzzer_on = false;
    memoryState.sprinkler_on = false;
    memoryState.door_locked = true;
    memoryState.current_mode = "away";
    memoryState.esp_pending_command = "RESETOUTPUTS";
    touchMemoryState();
    for (const sensor of memorySensors) {
      sensor.status = "idle";
      sensor.last_value = null;
      sensor.updated_at = new Date().toISOString();
    }
    res.json({ success: true, storage: "memory-fallback" });
  }
});

app.post("/api/esp/request-wifi-reset", requireAuth, async (req, res) => {
  try {
    const state = await setPendingEspCommand("RESETWIFI");

    res.json({
      success: true,
      command: "RESETWIFI",
      state,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/esp/clear-pending-command", requireAuth, async (req, res) => {
  try {
    let state;

    try {
      const result = await pool.query(
        `UPDATE system_state
         SET esp_pending_command = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1
         RETURNING *`
      );
      state = result.rows[0];
    } catch (error) {
      if (!isDbUnavailable(error)) throw error;
      memoryState.esp_pending_command = null;
      touchMemoryState();
      state = clone(memoryState);
    }

    res.json({ success: true, state });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/access-logs", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM access_logs ORDER BY created_at DESC LIMIT 10"
    );
    res.json(result.rows);
  } catch (error) {
    if (!isDbUnavailable(error)) return sendError(res, error);
    res.json(clone(memoryAccessLogs.slice(0, 10)));
  }
});

app.post("/api/full-reset", requireAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM events");
    await pool.query("DELETE FROM notifications");
    await pool.query("DELETE FROM access_logs");

    await pool.query(`
      UPDATE system_state
      SET current_mode = 'away',
          buzzer_on = FALSE,
          sprinkler_on = FALSE,
          door_locked = TRUE,
          esp_pending_command = 'RESETOUTPUTS',
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
    if (!isDbUnavailable(error)) return sendError(res, error);
    memoryEvents.length = 0;
    memoryNotifications.length = 0;
    memoryAccessLogs.length = 0;
    memoryState.current_mode = "away";
    memoryState.buzzer_on = false;
    memoryState.sprinkler_on = false;
    memoryState.door_locked = true;
    memoryState.esp_pending_command = "RESETOUTPUTS";
    touchMemoryState();
    for (const sensor of memorySensors) {
      sensor.status = "idle";
      sensor.last_value = null;
      sensor.updated_at = new Date().toISOString();
    }
    res.json({ success: true, message: "Full system reset completed", storage: "memory-fallback" });
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

app.post("/api/esp/system-state", async (req, res) => {
  try {
    const allowedFields = {
      mode: "current_mode",
      door_locked: "door_locked",
      buzzer_on: "buzzer_on",
      sprinkler_on: "sprinkler_on",
    };

    const updates = [];
    const values = [];

    for (const [requestKey, dbColumn] of Object.entries(allowedFields)) {
      if (req.body?.[requestKey] === undefined) continue;

      if (requestKey === "mode" && !VALID_MODES.includes(req.body[requestKey])) {
        const error = new Error("Invalid mode");
        error.statusCode = 400;
        throw error;
      }

      values.push(req.body[requestKey]);
      updates.push(`${dbColumn} = $${values.length}`);
    }

    if (updates.length === 0) {
      const error = new Error("No valid system_state fields provided");
      error.statusCode = 400;
      throw error;
    }

    const result = await pool.query(
      `UPDATE system_state
       SET ${updates.join(", ")},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (!isDbUnavailable(error)) return sendError(res, error);

    if (req.body?.mode !== undefined) {
      if (!VALID_MODES.includes(req.body.mode)) {
        const invalidModeError = new Error("Invalid mode");
        invalidModeError.statusCode = 400;
        return sendError(res, invalidModeError);
      }
      memoryState.current_mode = req.body.mode;
    }
    if (req.body?.door_locked !== undefined) memoryState.door_locked = Boolean(req.body.door_locked);
    if (req.body?.buzzer_on !== undefined) memoryState.buzzer_on = Boolean(req.body.buzzer_on);
    if (req.body?.sprinkler_on !== undefined) memoryState.sprinkler_on = Boolean(req.body.sprinkler_on);
    touchMemoryState();

    res.json(clone(memoryState));
  }
});

app.get("/api/esp/commands", async (req, res) => {
  try {
    let state;

    try {
      try {
        const result = await pool.query(
          `UPDATE system_state
           SET esp_last_seen = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = 1
           RETURNING *`
        );
        state = result.rows[0];
      } catch (error) {
        if (!isMissingColumn(error, "esp_last_seen")) throw error;

        const result = await pool.query(
          `UPDATE system_state
           SET updated_at = CURRENT_TIMESTAMP
           WHERE id = 1
           RETURNING *`
        );
        state = result.rows[0];
      }
    } catch (error) {
      if (!isDbUnavailable(error)) throw error;
      memoryState.esp_last_seen = new Date().toISOString();
      touchMemoryState();
      state = clone(memoryState);
    }

    const command = state.esp_pending_command || null;

    if (command) {
      try {
        await pool.query(
          `UPDATE system_state
           SET esp_pending_command = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = 1`
        );
      } catch (error) {
        if (!isDbUnavailable(error)) throw error;
        memoryState.esp_pending_command = null;
        touchMemoryState();
      }
    }

    res.json({
      mode: state.current_mode,
      buzzer_on: state.buzzer_on,
      sprinkler_on: state.sprinkler_on,
      door_locked: state.door_locked,
      command,
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
