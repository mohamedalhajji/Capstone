const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const pool = require("../src/config/db");

async function resetDemoDatabase() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query("TRUNCATE TABLE events, notifications, access_logs, users RESTART IDENTITY");

    await client.query(`
      INSERT INTO system_state (id, current_mode, buzzer_on, sprinkler_on, door_locked, esp_pending_command, updated_at)
      VALUES (1, 'disarmed', FALSE, FALSE, TRUE, 'RESETOUTPUTS', CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE
      SET current_mode = EXCLUDED.current_mode,
          buzzer_on = EXCLUDED.buzzer_on,
          sprinkler_on = EXCLUDED.sprinkler_on,
          door_locked = EXCLUDED.door_locked,
          esp_pending_command = EXCLUDED.esp_pending_command,
          updated_at = CURRENT_TIMESTAMP
    `);

    await client.query(`
      UPDATE sensors
      SET status = 'idle',
          last_value = NULL,
          updated_at = CURRENT_TIMESTAMP
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

resetDemoDatabase()
  .then(() => {
    console.log("Demo database reset completed.");
  })
  .catch((error) => {
    console.error("Demo database reset failed:");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
