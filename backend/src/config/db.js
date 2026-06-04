const { Pool } = require("pg");
require("dotenv").config();

const rawDatabaseUrl = process.env.DATABASE_URL;
const databaseUrl =
  rawDatabaseUrl && !rawDatabaseUrl.includes("your_neon_connection_string_here")
    ? rawDatabaseUrl
    : "";

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl:
        process.env.DB_SSL === "false"
          ? false
          : {
              rejectUnauthorized: false,
            },
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

module.exports = pool;
