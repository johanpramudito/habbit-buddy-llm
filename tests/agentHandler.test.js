// Import modul yang akan diuji
const {
  handleMessage,
  __test__: {
    buildGeminiPayload,
    computeProgress,
    describeCombo,
    describeBadges,
    formatHabitTitle,
    randomFlavor,
    XP_PER_CLEAR,
    XP_PER_LEVEL,
    BADGE_TIERS,
  },
} = require("../src/handlers/agentHandler"); // <-- PATH DIPERBAIKI

// --- Mocks ---

// 1. Mock habitModel
const mockHabitModel = {
  findHabit: jest.fn(),
  addHabit: jest.fn(),
  markHabitDone: jest.fn(),
  getHabitStatus: jest.fn(),
  getAllHabitsForUser: jest.fn(),
  removeHabit: jest.fn(),
  undoLastEntry: jest.fn(),
};
// Mock path yang benar
jest.mock("../src/models/habitModel", () => mockHabitModel); // <-- PATH DIPERBAIKI

// 2. Mock logger
const mockLogger = {
  log: jest.fn(),
  splitMessage: jest.fn((msg) => [msg]),
};
// Mock path yang benar
jest.mock("../src/utils/logger", () => mockLogger); // <-- PATH DIPERBAIKI

// 3. Mock GoogleGenAI
const mockGenerateContent = jest.fn();
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}));

// --- End Mocks ---

describe("Agent Handler", () => {
  let mockClient;
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    process.env.GEMINI_API_KEY = "test-api-key";
    process.env.GEMINI_MODEL = "test-model";

    mockClient = {
      sendMessage: jest.fn(),
    };

    mockLogger.splitMessage.mockImplementation((msg) => [msg]);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // --- 1. Test Helper Functions (Total 18 tes) ---
  describe("__test__ helper functions", () => {
    describe("formatHabitTitle", () => {
      it("should capitalize words correctly", () => {
        expect(formatHabitTitle("baca buku")).toBe("Baca Buku");
      });
      it("should handle single words", () => {
        expect(formatHabitTitle("olahraga")).toBe("Olahraga");
      });
      it("should handle empty strings", () => {
        expect(formatHabitTitle("")).toBe("");
      });
      it("should handle extra spaces", () => {
        expect(formatHabitTitle("  minum   air  ")).toBe("Minum Air");
      });
      it("should handle existing capitalization", () => {
        expect(formatHabitTitle("makan Siang")).toBe("Makan Siang");
      });
      it("should handle null or undefined", () => {
        expect(formatHabitTitle(undefined)).toBe("");
        expect(formatHabitTitle(null)).toBe("");
      });
    });

    describe("computeProgress", () => {
      it("should handle level 1 (no entries)", () => {
        const stats = { totalEntries: 0 };
        const progress = computeProgress(stats);
        expect(progress).toEqual({
          totalXp: 0, level: 1, xpIntoLevel: 0, xpToNext: XP_PER_LEVEL,
        });
      });
      it("should handle level 1 (one entry)", () => {
        const stats = { totalEntries: 1 }; // 50 XP
        const progress = computeProgress(stats);
        expect(progress).toEqual({
          totalXp: XP_PER_CLEAR, level: 1, xpIntoLevel: XP_PER_CLEAR, xpToNext: XP_PER_LEVEL - XP_PER_CLEAR,
        });
      });
      it("should handle exact level up (Level 2)", () => {
        const entries = XP_PER_LEVEL / XP_PER_CLEAR; // 10 entries = 500 XP
        const stats = { totalEntries: entries };
        const progress = computeProgress(stats);
        expect(progress).toEqual({
          totalXp: 500, level: 2, xpIntoLevel: 0, xpToNext: XP_PER_LEVEL,
        });
      });
      it("should handle mid-level (Level 2)", () => {
        const entries = XP_PER_LEVEL / XP_PER_CLEAR + 2; // 12 entries = 600 XP
        const stats = { totalEntries: entries };
        const progress = computeProgress(stats);
        expect(progress).toEqual({
          totalXp: 600, level: 2, xpIntoLevel: 100, xpToNext: 400,
        });
      });
      it("should handle null stats", () => {
         const progress = computeProgress(null);
         expect(progress).toEqual({
          totalXp: 0, level: 1, xpIntoLevel: 0, xpToNext: XP_PER_LEVEL,
        });
      });
    });

    describe("describeCombo", () => {
      it("should return no combo message for 0 streak", () => {
        expect(describeCombo(0)).toContain("Combo belum aktif");
      });
      it("should return active combo message for > 0 streak", () => {
        expect(describeCombo(5)).toBe("Combo streak 5x aktif.");
      });
    });

    describe("describeBadges", () => {
      it("should return no badge message", () => {
        expect(describeBadges(2)).toBe("Belum ada badge combo.");
      });
      it("should return Bronze badge", () => {
        expect(describeBadges(3)).toBe("Badge aktif: Bronze Combo.");
      });
      it("should return multiple badges", () => {
        expect(describeBadges(15)).toBe(
          "Badge aktif: Bronze Combo, Silver Combo, Gold Combo."
        );
      });
      it("should return all badges", () => {
        expect(describeBadges(30)).toBe(
          "Badge aktif: Bronze Combo, Silver Combo, Gold Combo, Mythic Combo."
        );
      });
    });
  });

  // --- 2. Test Tool Executor (Total 11 tes) ---
  describe("executeTool", () => {
    const userId = "user-123";

    it("add_habit: should add a new habit", async () => {
      mockHabitModel.findHabit.mockResolvedValue(null);
      const toolCall = { tool_name: "add_habit", args: { habitName: "olahraga" } };
      const response = await executeTool(toolCall, userId);
      expect(mockHabitModel.addHabit).toHaveBeenCalledWith(userId, "olahraga");
      expect(response).toContain("Quest \"Olahraga\" resmi dibuka");
    });
    
    it("add_habit: should handle existing habit", async () => {
      mockHabitModel.findHabit.mockResolvedValue({ id: 1, habit_name: "olahraga" });
      const toolCall = { tool_name: "add_habit", args: { habitName: "olahraga" } };
      const response = await executeTool(toolCall, userId);
      expect(mockHabitModel.addHabit).not.toHaveBeenCalled();
      expect(response).toContain("Quest \"Olahraga\" sudah ada di log");
    });

    it("mark_habit_done: should mark habit complete", async () => {
      mockHabitModel.findHabit.mockResolvedValue({ id: 1, habit_name: "olahraga" });
      mockHabitModel.markHabitDone.mockResolvedValue({ alreadyDone: false });
      mockHabitModel.getHabitStatus.mockResolvedValue({ streak: 5, totalEntries: 12 }); // 600 XP
      const toolCall = { tool_name: "mark_habit_done", args: { habitName: "olahraga" } };
      const response = await executeTool(toolCall, userId);
      expect(response).toContain("Quest \"Olahraga\" clear!");
      expect(response).toContain("Total 600 XP");
    });

    it("mark_habit_done: should handle 'already done'", async () => {
      mockHabitModel.findHabit.mockResolvedValue({ id: 1, habit_name: "olahraga" });
      mockHabitModel.markHabitDone.mockResolvedValue({ alreadyDone: true });
      mockHabitModel.getHabitStatus.mockResolvedValue({ streak: 5, totalEntries: 12 });
      const toolCall = { tool_name: "mark_habit_done", args: { habitName: "olahraga" } };
      const response = await executeTool(toolCall, userId);
      expect(response).toContain("Quest \"Olahraga\" sudah clear hari ini");
    });

    it("mark_habit_done: should handle habit not found", async () => {
      mockHabitModel.findHabit.mockResolvedValue(null);
      const toolCall = { tool_name: "mark_habit_done", args: { habitName: "ngoding" } };
      const response = await executeTool(toolCall, userId);
      expect(response).toContain("Quest \"Ngoding\" tidak ditemukan");
    });
    
    it("get_status: should return status for all habits", async () => {
      mockHabitModel.getAllHabitsForUser.mockResolvedValue([
        { id: 1, habit_name: "olahraga" },
      ]);
      mockHabitModel.getHabitStatus.mockResolvedValueOnce({ streak: 5, totalEntries: 12 });
      const toolCall = { tool_name: "get_status", args: {} };
      const response = await executeTool(toolCall, userId);
      expect(response).toContain("[Quest Log]");
      expect(response).toContain("- Olahraga: Lv 2 | 600 XP | Combo 5x");
    });

    it("get_status: should handle no habits", async () => {
      mockHabitModel.getAllHabitsForUser.mockResolvedValue([]);
      const toolCall = { tool_name: "get_status", args: {} };
      const response = await executeTool(toolCall, userId);
      expect(response).toContain("Quest log masih kosong");
    });

    it("remove_habit: should remove a habit", async () => {
      mockHabitModel.removeHabit.mockResolvedValue(true);
      const toolCall = { tool_name: "remove_habit", args: { habitName: "coding" } };
      const response = await executeTool(toolCall, userId);
      expect(mockHabitModel.removeHabit).toHaveBeenCalledWith(userId, "coding");
      expect(response).toContain("Quest \"Coding\" dipindahkan ke arsip");
    });

    it("remove_habit: should handle habit not found", async () => {
      mockHabitModel.removeHabit.mockResolvedValue(false);
      const toolCall = { tool_name: "remove_habit", args: { habitName: "main game" } };
      const response = await executeTool(toolCall, userId);
      expect(response).toContain("Quest \"Main Game\" tidak ditemukan");
    });

    it("undo_last_entry: should undo an entry", async () => {
      mockHabitModel.findHabit.mockResolvedValue({ id: 1, habit_name: "olahraga" });
      mockHabitModel.undoLastEntry.mockResolvedValue(true);
      mockHabitModel.getHabitStatus.mockResolvedValue({ streak: 4, totalEntries: 11 });
      const toolCall = { tool_name: "undo_last_entry", args: { habitName: "olahraga" } };
      const response = await executeTool(toolCall, userId);
      expect(response).toContain("Progress terakhir quest \"Olahraga\" dibatalkan");
      expect(response).toContain("Lv 2 dengan 550 XP");
    });
    
    it("undo_last_entry: should handle habit not found", async () => {
      mockHabitModel.findHabit.mockResolvedValue(null);
      const toolCall = { tool_name: "undo_last_entry", args: { habitName: "ngoding" } };
      const response = await executeTool(toolCall, userId);
      expect(response).toContain("Quest \"Ngoding\" tidak ditemukan");
      expect(mockHabitModel.undoLastEntry).not.toHaveBeenCalled();
    });
  });

  // --- 3. Test Main Handler (Total 6 tes) ---
  describe("handleMessage", () => {
    const userId = "user-123";
    const message = { from: userId, body: "" };

    it("should handle conversational response", async () => {
      message.body = "Halo buddy!";
      const llmResponse = "Halo Petualang! Siap grinding quest hari ini?";
      mockGenerateContent.mockResolvedValue({ text: llmResponse });
      await handleMessage(mockClient, message);
      expect(mockGenerateContent).toHaveBeenCalled();
      expect(mockHabitModel.addHabit).not.toHaveBeenCalled();
      expect(mockClient.sendMessage).toHaveBeenCalledWith(userId, llmResponse);
    });

    it("should handle tool call (add_habit)", async () => {
      message.body = "tambah quest baru: olahraga";
      const llmResponse = '{"tool_name": "add_habit", "args": {"habitName": "olahraga"}}';
      mockGenerateContent.mockResolvedValue({ text: llmResponse });
      mockHabitModel.findHabit.mockResolvedValue(null);
      await handleMessage(mockClient, message);
      expect(mockGenerateContent).toHaveBeenCalled();
      expect(mockHabitModel.addHabit).toHaveBeenCalledWith(userId, "olahraga");
      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        userId, expect.stringContaining("Quest \"Olahraga\" resmi dibuka")
      );
    });

    it("should handle tool call that results in an error (e.g., habit not found)", async () => {
      message.body = "selesai ngoding";
      const llmResponse = '{"tool_name": "mark_habit_done", "args": {"habitName": "ngoding"}}';
      mockGenerateContent.mockResolvedValue({ text: llmResponse });
      // Mock 'findHabit' untuk mengembalikan null (habit tidak ditemukan)
      mockHabitModel.findHabit.mockResolvedValue(null);
      
      await handleMessage(mockClient, message);
      
      expect(mockGenerateContent).toHaveBeenCalled();
      expect(mockHabitModel.findHabit).toHaveBeenCalledWith(userId, "ngoding");
      expect(mockHabitModel.markHabitDone).not.toHaveBeenCalled();
      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        userId, expect.stringContaining("Quest \"Ngoding\" tidak ditemukan")
      );
    });

    it("should handle LLM error gracefully", async () => {
      message.body = "error dong";
      mockGenerateContent.mockRejectedValue(new Error("LLM Error"));
      await handleMessage(mockClient, message);
      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        userId, expect.stringContaining("otakku lagi korslet")
      );
    });

    it("should handle unexpected JSON as conversation", async () => {
      message.body = "json aneh";
      const llmResponse = '{"bukan": "tool_call"}';
      mockGenerateContent.mockResolvedValue({ text: llmResponse });
      await handleMessage(mockClient, message);
      expect(mockHabitModel.addHabit).not.toHaveBeenCalled();
      expect(mockClient.sendMessage).toHaveBeenCalledWith(userId, llmResponse);
    });

    it("should prune chat history", async () => {
      const maxHistoryLength = 11; // 1 system + 10 user/assistant
      const conversationalResponse = "Siap, laksanakan!";

      // Panggil 6 kali (1 sys + 6 user + 6 assist = 13 pesan)
      for (let i = 1; i <= 6; i++) {
        mockGenerateContent.mockResolvedValue({ text: `${conversationalResponse} ${i}` });
        await handleMessage(mockClient, { from: userId, body: `Pesan user ${i}` });
      }

      // Panggil ke-7
      mockGenerateContent.mockResolvedValue({ text: `${conversationalResponse} 7` });
      await handleMessage(mockClient, { from: userId, body: `Pesan user 7` });
      
      // Cek panggilan LLM ke-7. 
      // Harusnya histori sudah dipangkas.
      // 13 pesan -> pangkas ke 11 (sys, user2-6, assist2-6)
      // Panggilan ke-7 menambah user7 (total 12 pesan dikirim ke LLM)
      // buildGeminiPayload memisahkan 1 sys, mengirim 11 'contents'
      const lastCallArgs = mockGenerateContent.mock.calls[6][0];
      expect(lastCallArgs.contents.length).toBe(11); // 5 putaran lama + 1 user baru
      // Cek bahwa 'Pesan user 1' sudah terpotong
      expect(lastCallArgs.contents[0].parts[0].text).toBe("Pesan user 2"); 
      expect(lastCallArgs.contents[10].parts[0].text).toBe("Pesan user 7");
    });
  });
});