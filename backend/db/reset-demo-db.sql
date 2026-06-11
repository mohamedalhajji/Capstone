BEGIN;

TRUNCATE TABLE events, notifications, access_logs, users RESTART IDENTITY;

INSERT INTO system_state (id, current_mode, buzzer_on, sprinkler_on, door_locked, esp_pending_command, updated_at)
VALUES (1, 'away', FALSE, FALSE, TRUE, 'RESETOUTPUTS', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE
SET current_mode = EXCLUDED.current_mode,
    buzzer_on = EXCLUDED.buzzer_on,
    sprinkler_on = EXCLUDED.sprinkler_on,
    door_locked = EXCLUDED.door_locked,
    esp_pending_command = EXCLUDED.esp_pending_command,
    updated_at = CURRENT_TIMESTAMP;

UPDATE sensors
SET status = 'idle',
    last_value = NULL,
    updated_at = CURRENT_TIMESTAMP;

COMMIT;
