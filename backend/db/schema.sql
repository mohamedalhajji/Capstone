CREATE TABLE IF NOT EXISTS system_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_mode VARCHAR(20) NOT NULL DEFAULT 'disarmed'
    CHECK (current_mode IN ('disarmed', 'home', 'away')),
  buzzer_on BOOLEAN NOT NULL DEFAULT FALSE,
  sprinkler_on BOOLEAN NOT NULL DEFAULT FALSE,
  door_locked BOOLEAN NOT NULL DEFAULT TRUE,
  esp_pending_command VARCHAR(40),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE system_state
ADD COLUMN IF NOT EXISTS esp_pending_command VARCHAR(40);

CREATE TABLE IF NOT EXISTS sensors (
  id SERIAL PRIMARY KEY,
  sensor_name VARCHAR(80) NOT NULL UNIQUE,
  sensor_type VARCHAR(40) NOT NULL,
  location VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'idle',
  last_value VARCHAR(120),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  sensor_id INTEGER REFERENCES sensors(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'low',
  message TEXT NOT NULL,
  action_taken TEXT NOT NULL DEFAULT 'logged only',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS access_logs (
  id SERIAL PRIMARY KEY,
  nfc_uid VARCHAR(80) NOT NULL,
  user_name VARCHAR(120) NOT NULL,
  access_result VARCHAR(20) NOT NULL
    CHECK (access_result IN ('granted', 'denied')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_state (id, current_mode, buzzer_on, sprinkler_on, door_locked)
VALUES (1, 'disarmed', FALSE, FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sensors (sensor_name, sensor_type, location)
VALUES
  ('motion_living_room', 'motion', 'Living Room'),
  ('gas_kitchen', 'gas', 'Kitchen'),
  ('flame_kitchen', 'flame', 'Kitchen'),
  ('door_main', 'door', 'Main Door'),
  ('vibration_window', 'vibration', 'Window'),
  ('nfc_main_door', 'nfc', 'Main Door')
ON CONFLICT (sensor_name) DO UPDATE
SET sensor_type = EXCLUDED.sensor_type,
    location = EXCLUDED.location,
    updated_at = CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensors_sensor_name ON sensors(sensor_name);
