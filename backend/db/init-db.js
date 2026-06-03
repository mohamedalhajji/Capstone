const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const pool = require("../src/config/db");

async function main() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");

  await pool.query(schema);
  const health = await pool.query("SELECT NOW() AS initialized_at");

  console.log("Database initialized:", health.rows[0].initialized_at);
}

main()
  .catch((error) => {
    console.error("Database initialization failed:");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
