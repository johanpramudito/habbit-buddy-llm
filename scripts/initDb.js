// scripts/initDb.js
const { getDbConnection } = require("../src/utils/db");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

async function initializeDatabase() {
  try {
    const db = await getDbConnection();

    console.log("Creating habits table...");
    await db.exec(`
            CREATE TABLE IF NOT EXISTS habits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                habit_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(user_id, habit_name)
            )
        `);

    console.log("Creating habit_entries table...");
    await db.exec(`
            CREATE TABLE IF NOT EXISTS habit_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                habit_id INTEGER NOT NULL,
                entry_date TEXT NOT NULL,
                FOREIGN KEY (habit_id) REFERENCES habits (id) ON DELETE CASCADE
            )
        `);

    console.log("Database initialized successfully.");
    await db.close();
  } catch (error) {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  }
}

initializeDatabase();
