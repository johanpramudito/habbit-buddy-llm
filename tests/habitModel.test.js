// Impor fungsi-fungsi yang akan diuji
const {
  addHabit,
  findHabit,
  removeHabit,
  getAllHabitsForUser,
  markHabitDone,
  getHabitStatus,
  undoLastEntry,
} = require("../src/models/habitModel"); // <-- PATH DIPERBAIKI

// --- Mocks ---

// Buat mock untuk fungsi db
const mockDb = {
  run: jest.fn(),
  get: jest.fn(),
  all: jest.fn(),
};

// Mock modul '../utils/db'
// getDbConnection sekarang akan me-return mockDb kita
jest.mock("../src/utils/db", () => ({ // <-- PATH DIPERBAIKI
  getDbConnection: jest.fn(() => Promise.resolve(mockDb)),
}));

// --- End Mocks ---

describe("Habit Model", () => {
  // Tentukan tanggal yang konsisten untuk semua tes
  const FAKE_DATE = "2023-10-27T10:00:00.000Z";
  const FAKE_TODAY = "2023-10-27"; // YYYY-MM-DD
  const FAKE_YESTERDAY = "2023-10-26";

  beforeEach(() => {
    // Reset semua mock sebelum setiap tes
    jest.clearAllMocks();
    mockDb.run.mockReset();
    mockDb.get.mockReset();
    mockDb.all.mockReset();

    // Gunakan timer palsu dan atur ke tanggal yang konsisten
    jest.useFakeTimers().setSystemTime(new Date(FAKE_DATE));
  });

  afterEach(() => {
    // Kembalikan ke timer sungguhan
    jest.useRealTimers();
  });

  // --- 1. Tes untuk addHabit (Total 1) ---
  describe("addHabit", () => {
    it("should insert a new habit with the correct SQL and parameters", async () => {
      await addHabit("user123", "olahraga");

      // Verifikasi bahwa db.run dipanggil dengan query yang benar
      expect(mockDb.run).toHaveBeenCalledTimes(1);
      expect(mockDb.run).toHaveBeenCalledWith(
        "INSERT INTO habits (user_id, habit_name, created_at) VALUES (?, ?, ?)",
        ["user123", "olahraga", FAKE_DATE]
      );
    });
  });

  // --- 2. Tes untuk findHabit (Total 2) ---
  describe("findHabit", () => {
    it("should query for a specific habit and return it", async () => {
      const mockHabit = { id: 1, user_id: "user123", habit_name: "olahraga" };
      mockDb.get.mockResolvedValue(mockHabit);

      const result = await findHabit("user123", "olahraga");

      expect(mockDb.get).toHaveBeenCalledTimes(1);
      expect(mockDb.get).toHaveBeenCalledWith(
        "SELECT * FROM habits WHERE user_id = ? AND habit_name = ?",
        ["user123", "olahraga"]
      );
      expect(result).toBe(mockHabit);
    });

    it("should return undefined if habit is not found", async () => {
      mockDb.get.mockResolvedValue(undefined);
      const result = await findHabit("user123", "makan");
      expect(result).toBeUndefined();
    });
  });

  // --- 3. Tes untuk removeHabit (Total 2) ---
  describe("removeHabit", () => {
    it("should return true if a habit was successfully deleted", async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });
      const result = await removeHabit("user123", "olahraga");

      expect(mockDb.run).toHaveBeenCalledTimes(1);
      expect(mockDb.run).toHaveBeenCalledWith(
        "DELETE FROM habits WHERE user_id = ? AND habit_name = ?",
        ["user123", "olahraga"]
      );
      expect(result).toBe(true);
    });

    it("should return false if no habit was found to delete", async () => {
      mockDb.run.mockResolvedValue({ changes: 0 });
      const result = await removeHabit("user123", "coding");
      expect(result).toBe(false);
    });
  });

  // --- 4. Tes untuk getAllHabitsForUser (Total 2) ---
  describe("getAllHabitsForUser", () => {
    it("should return a list of all habits for a user", async () => {
      const mockHabits = [
        { id: 1, habit_name: "baca" },
        { id: 2, habit_name: "olahraga" },
      ];
      mockDb.all.mockResolvedValue(mockHabits);

      const result = await getAllHabitsForUser("user123");
      expect(mockDb.all).toHaveBeenCalledWith(
        "SELECT * FROM habits WHERE user_id = ? ORDER BY habit_name",
        ["user123"]
      );
      expect(result).toBe(mockHabits);
    });

    it("should return an empty array if user has no habits", async () => {
      mockDb.all.mockResolvedValue([]);
      const result = await getAllHabitsForUser("user456");
      expect(result).toEqual([]);
    });
  });

  // --- 5. Tes untuk markHabitDone (Total 2) ---
  describe("markHabitDone", () => {
    it("should insert a new entry and return {alreadyDone: false}", async () => {
      mockDb.get.mockResolvedValue(undefined);
      const result = await markHabitDone(1); // habitId = 1

      expect(mockDb.get).toHaveBeenCalledWith(
        "SELECT * FROM habit_entries WHERE habit_id = ? AND date(entry_date) = ?",
        [1, FAKE_TODAY] // "2023-10-27"
      );
      expect(mockDb.run).toHaveBeenCalledWith(
        "INSERT INTO habit_entries (habit_id, entry_date) VALUES (?, ?)",
        [1, FAKE_DATE] // "2023-10-27T10:00:00.000Z"
      );
      expect(result).toEqual({ alreadyDone: false });
    });

    it("should return {alreadyDone: true} if an entry already exists", async () => {
      mockDb.get.mockResolvedValue({ id: 99, habit_id: 1 });
      const result = await markHabitDone(1);
      expect(mockDb.get).toHaveBeenCalledTimes(1);
      expect(mockDb.run).not.toHaveBeenCalled();
      expect(result).toEqual({ alreadyDone: true });
    });
  });

  // --- 6. Tes untuk getHabitStatus (Total 6) ---
  describe("getHabitStatus", () => {
    it("should return {streak: 0, totalEntries: 0} for no entries", async () => {
      mockDb.all.mockResolvedValue([]);
      const result = await getHabitStatus(1);
      expect(result).toEqual({ streak: 0, totalEntries: 0 });
    });
    
    it("should return {streak: 1, totalEntries: 1} for a single entry today", async () => {
      const entries = [{ entry_date: FAKE_DATE }]; // Hari ini
      mockDb.all.mockResolvedValue(entries);
      const result = await getHabitStatus(1);
      expect(result).toEqual({ streak: 1, totalEntries: 1 });
    });
    
    it("should return {streak: 1, totalEntries: 1} for a single entry yesterday", async () => {
      const entries = [{ entry_date: "2023-10-26T12:00:00Z" }]; // Kemarin
      mockDb.all.mockResolvedValue(entries);
      const result = await getHabitStatus(1);
      expect(result).toEqual({ streak: 1, totalEntries: 1 });
    });

    it("should return {streak: 0, totalEntries: 1} if streak is broken (last entry 2 days ago)", async () => {
      const entries = [{ entry_date: "2023-10-25T12:00:00Z" }];
      mockDb.all.mockResolvedValue(entries);
      const result = await getHabitStatus(1);
      expect(result).toEqual({ streak: 0, totalEntries: 1 });
    });

    it("should correctly calculate a 3-day streak ending today", async () => {
      const entries = [
        { entry_date: "2023-10-27T01:00:00Z" }, // Hari ini
        { entry_date: "2023-10-26T02:00:00Z" }, // Kemarin
        { entry_date: "2023-10-25T03:00:00Z" }, // 2 hari lalu
        { entry_date: "2023-10-23T04:00:00Z" }, // Putus (ada gap)
      ];
      mockDb.all.mockResolvedValue(entries);
      const result = await getHabitStatus(1);
      expect(result).toEqual({ streak: 3, totalEntries: 4 });
    });

    it("should handle multiple entries on the same day", async () => {
      const entries = [
        { entry_date: "2023-10-27T08:00:00Z" }, // Hari ini (pagi)
        { entry_date: "2023-10-27T01:00:00Z" }, // Hari ini (subuh)
        { entry_date: "2023-10-26T02:00:00Z" }, // Kemarin
      ];
      mockDb.all.mockResolvedValue(entries);
      const result = await getHabitStatus(1);
      expect(result).toEqual({ streak: 2, totalEntries: 3 });
    });
  });

  // --- 7. Tes untuk undoLastEntry (Total 2) ---
  describe("undoLastEntry", () => {
    it("should find and delete the last entry", async () => {
      mockDb.get.mockResolvedValue({ id: 999 });
      const result = await undoLastEntry(1); // habitId = 1

      expect(mockDb.get).toHaveBeenCalledWith(
        "SELECT id FROM habit_entries WHERE habit_id = ? ORDER BY entry_date DESC LIMIT 1",
        [1]
      );
      expect(mockDb.run).toHaveBeenCalledWith("DELETE FROM habit_entries WHERE id = ?", [
        999,
      ]);
      expect(result).toBe(true);
    });

    it("should return false if no entry was found to delete", async () => {
      mockDb.get.mockResolvedValue(undefined);
      const result = await undoLastEntry(1);
      expect(mockDb.get).toHaveBeenCalledTimes(1);
      expect(mockDb.run).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});