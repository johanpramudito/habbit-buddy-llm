const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

// Singleton instance for the database
let dbInstance = null;

async function getDbConnection() {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    const dbPath = path.resolve(__dirname, "..", "..", "data", "habits.sqlite");
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    console.log("Database connection established.");
    dbInstance = db;
    return db;
  } catch (error) {
    console.error("Failed to connect to the database:", error);
    process.exit(1); // Exit if DB connection fails
  }
}

module.exports = { getDbConnection };
