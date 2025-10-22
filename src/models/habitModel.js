const { getDbConnection } = require("../utils/db");

async function addHabit(userId, habitName) {
  const db = await getDbConnection();
  await db.run(
    "INSERT INTO habits (user_id, habit_name, created_at) VALUES (?, ?, ?)",
    [userId, habitName, new Date().toISOString()]
  );
}

async function findHabit(userId, habitName) {
  const db = await getDbConnection();
  return await db.get(
    "SELECT * FROM habits WHERE user_id = ? AND habit_name = ?",
    [userId, habitName]
  );
}

async function removeHabit(userId, habitName) {
  const db = await getDbConnection();
  const result = await db.run(
    "DELETE FROM habits WHERE user_id = ? AND habit_name = ?",
    [userId, habitName]
  );
  return result.changes > 0;
}

async function getAllHabitsForUser(userId) {
  const db = await getDbConnection();
  return await db.all(
    "SELECT * FROM habits WHERE user_id = ? ORDER BY habit_name",
    [userId]
  );
}

async function markHabitDone(habitId) {
  const db = await getDbConnection();
  const today = new Date().toISOString().split("T")[0];

  // Check if already marked today
  const existing = await db.get(
    "SELECT * FROM habit_entries WHERE habit_id = ? AND date(entry_date) = ?",
    [habitId, today]
  );

  if (existing) {
    return { alreadyDone: true };
  }

  await db.run(
    "INSERT INTO habit_entries (habit_id, entry_date) VALUES (?, ?)",
    [habitId, new Date().toISOString()]
  );
  return { alreadyDone: false };
}

async function getHabitStatus(habitId) {
  const db = await getDbConnection();
  const entries = await db.all(
    "SELECT entry_date FROM habit_entries WHERE habit_id = ? ORDER BY entry_date DESC",
    [habitId]
  );

  if (entries.length === 0) {
    return { streak: 0, totalEntries: 0 };
  }

  let currentStreak = 0;
  let expectedDate = new Date();
  expectedDate.setHours(0, 0, 0, 0);

  // Check if the latest entry is today or yesterday
  const latestEntryDate = new Date(entries[0].entry_date);
  latestEntryDate.setHours(0, 0, 0, 0);

  const dayDiff =
    (expectedDate.getTime() - latestEntryDate.getTime()) /
    (1000 * 60 * 60 * 24);

  if (dayDiff > 1) {
    return { streak: 0, totalEntries: entries.length }; // Streak broken
  }

  // If latest entry is yesterday, start checking from yesterday
  if (dayDiff === 1) {
    expectedDate.setDate(expectedDate.getDate() - 1);
  }

  for (const entry of entries) {
    const entryDate = new Date(entry.entry_date);
    entryDate.setHours(0, 0, 0, 0);

    if (entryDate.getTime() === expectedDate.getTime()) {
      currentStreak++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else if (entryDate.getTime() < expectedDate.getTime()) {
      // A gap was found, break the loop
      break;
    }
  }
  return { streak: currentStreak, totalEntries: entries.length };
}

async function undoLastEntry(habitId) {
  const db = await getDbConnection();
  const lastEntry = await db.get(
    "SELECT id FROM habit_entries WHERE habit_id = ? ORDER BY entry_date DESC LIMIT 1",
    [habitId]
  );

  if (!lastEntry) {
    return false;
  }

  await db.run("DELETE FROM habit_entries WHERE id = ?", [lastEntry.id]);
  return true;
}

module.exports = {
  addHabit,
  findHabit,
  removeHabit,
  getAllHabitsForUser,
  markHabitDone,
  getHabitStatus,
  undoLastEntry,
};
