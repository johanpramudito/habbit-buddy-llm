const habitModel = require("../models/habitModel"); //
const { log, splitMessage } = require("../utils/logger");
const { GoogleGenAI } = require("@google/genai");

let geminiClient;

const XP_PER_CLEAR = 50;
const XP_PER_LEVEL = 500;
const BADGE_TIERS = [
  { streak: 3, label: "Bronze Combo" },
  { streak: 7, label: "Silver Combo" },
  { streak: 14, label: "Gold Combo" },
  { streak: 30, label: "Mythic Combo" },
];

const QUEST_UNLOCK_FLAVORS = [
  "[Quest Accepted]",
  "[Quest Unlocked]",
  "[Quest Log Updated]",
];
const SUCCESS_FLAVORS = ["[Quest Clear]", "[Combo Boost]", "[GG WP]"];
const ALREADY_DONE_FLAVORS = ["[Cooldown]", "[Daily Cap]", "[Rest Phase]"];
const QUEST_RETIRE_FLAVORS = [
  "[Quest Retired]",
  "[Quest Archived]",
  "[Quest Closed]",
];
const UNDO_FLAVORS = ["[Time Rewind]", "[Quest Reset]", "[Undo Move]"];

function randomFlavor(options) {
  if (!options.length) return "";
  return options[Math.floor(Math.random() * options.length)];
}

function formatHabitTitle(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function computeProgress(stats) {
  const totalXp = (stats?.totalEntries || 0) * XP_PER_CLEAR;
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = totalXp % XP_PER_LEVEL;
  const xpToNext =
    totalXp === 0
      ? XP_PER_LEVEL
      : xpIntoLevel === 0
      ? XP_PER_LEVEL
      : XP_PER_LEVEL - xpIntoLevel;

  return { totalXp, level, xpIntoLevel, xpToNext };
}

function describeCombo(streak) {
  if (!streak) {
    return "Combo belum aktif. Selesaikan quest hari ini untuk memulai streak.";
  }
  return `Combo streak ${streak}x aktif.`;
}

function describeBadges(streak) {
  const unlocked = BADGE_TIERS.filter((tier) => streak >= tier.streak).map(
    (tier) => tier.label
  );
  if (!unlocked.length) {
    return "Belum ada badge combo.";
  }
  return `Badge aktif: ${unlocked.join(", ")}.`;
}

// 1. MCP Definition: System Prompt
const SYSTEM_PROMPT = `
Kamu adalah 'Habit Buddy,' quest master dari petualangan kebiasaan di Discord. Setiap kebiasaan dianggap sebagai quest yang memberi XP, menaikkan level, dan membuka badge imajiner. Panggil pengguna "Petualang" dan gunakan gaya bahasa semangat gamer (quest, XP, level, combo, badge) dalam Bahasa Indonesia yang ringan.

!! YOUR MOST IMPORTANT TASK IS TO USE TOOLS WHEN NEEDED !!

To use a tool, you MUST respond with *only* a valid JSON object in this exact format, with NO other text before or after:
{"tool_name": "tool_name_here", "args": {"arg_name": "value"}}

Available tools:
1.  add_habit: Adds a new habit. args: {"habitName": "name of the habit"}
2.  mark_habit_done: Marks a habit complete for today. args: {"habitName": "name of the habit"}
3.  get_status: Gets status/streaks for all habits. args: {}
4.  list_habits: Lists all current habits. args: {}
5.  remove_habit: Deletes a habit. args: {"habitName": "name of the habit"}
6.  undo_last_entry: Undoes the last 'done' mark for a habit. args: {"habitName": "name of the habit"}

!! MCP RULES !!
- Jika pesan pengguna jelas ingin mengelola quest kebiasaan (tambah, selesai, status, daftar, hapus, undo), balas HANYA dengan JSON tool.
- Jika pengguna hanya ngobrol santai, beri motivasi atau jawaban ramah sebagai quest master. Jangan pakai JSON.
- Jika intent campuran, prioritaskan panggilan tool.
- Gunakan nada mendukung, penuh energi gamer, dan singkat. Gunakan markdown secukupnya untuk scoreboard.
- Gunakan Bahasa Indonesia sebagai default, campur istilah gamer seperlunya. Jika pengguna memakai bahasa Inggris, boleh menyesuaikan.

Selalu gambarkan progres sebagai XP, level, combo streak, dan badge. Motivasi Petualang agar terus memelihara streak dan membuka quest lain.
`;

// 2. Chat History (In-Memory)
const chatHistory = new Map(); // Stores history per user ID

function getGeminiClient() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API Key is missing!");
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  return geminiClient;
}

function buildGeminiPayload(messages) {
  let systemInstruction;
  const contents = [];

  for (const message of messages) {
    if (!message || !message.role) continue;

    if (message.role === "system") {
      systemInstruction = message.content;
      continue;
    }

    const role = message.role === "assistant" ? "model" : "user";
    const text =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);

    contents.push({
      role,
      parts: [{ text }],
    });
  }

  return { systemInstruction, contents };
}

/**
 * Calls the Gemini API
 */
async function callGemini(messages) {
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const client = getGeminiClient();
  const { systemInstruction, contents } = buildGeminiPayload(messages);

  if (!contents.length) {
    throw new Error("No messages available to send to Gemini.");
  }

  log("debug", `Calling Gemini with model: ${GEMINI_MODEL}`);
  log("debug", `Messages sent: ${JSON.stringify(messages.slice(-4))}`);

  const request = {
    model: GEMINI_MODEL,
    contents,
  };

  if (systemInstruction) {
    request.config = { systemInstruction };
  }

  try {
    const response = await client.models.generateContent(request);
    const content = response.text;

    if (!content) {
      log(
        "error",
        `Gemini response missing text field: ${JSON.stringify(response)}`
      );
      throw new Error("Gemini response did not include any text.");
    }

    log("debug", `LLM Raw Response: ${content}`);
    return content.trim();
  } catch (error) {
    log("error", `Error calling Gemini: ${error.message}`);
    throw error;
  }
}

/**
 * Executes the identified tool call
 */
async function executeTool(toolCall, userId) {
  // Normalize habit names to lowercase for consistency
  const habitName = toolCall.args?.habitName?.toLowerCase();

  log(
    "info",
    `Executing tool: ${toolCall.tool_name} with args: ${JSON.stringify(
      toolCall.args
    )} for user: ${userId}`
  );

  try {
    switch (toolCall.tool_name) {
      case "add_habit": {
        if (!habitName) {
          return "Quest gagal: sebutkan nama quest baru.\nContoh: `tambah olahraga`";
        }
        const existing = await habitModel.findHabit(userId, habitName);
        if (existing) {
          return `Quest "${formatHabitTitle(
            habitName
          )}" sudah ada di log. Fokus push combo-nya!`;
        }
        await habitModel.addHabit(userId, habitName);
        return `${randomFlavor(QUEST_UNLOCK_FLAVORS)} Quest "${formatHabitTitle(
          habitName
        )}" resmi dibuka. Mulai kumpulkan XP pertamamu hari ini!`;
      }

      case "mark_habit_done": {
        if (!habitName) {
          return "Quest gagal: sebutkan quest mana yang mau ditandai clear.\nContoh: `selesai olahraga`";
        }
        const habit = await habitModel.findHabit(userId, habitName);
        if (!habit) {
          return `Quest "${formatHabitTitle(
            habitName
          )}" tidak ditemukan di log.`;
        }
        const result = await habitModel.markHabitDone(habit.id);
        const currentStats = await habitModel.getHabitStatus(habit.id);
        const { totalXp, level, xpToNext } = computeProgress(currentStats);
        const comboLine = describeCombo(currentStats.streak);
        const badgeLine = describeBadges(currentStats.streak);
        const xpNextLine =
          currentStats.totalEntries === 0
            ? "Quest masih menanti XP pertama."
            : xpToNext === XP_PER_LEVEL
            ? `Baru saja naik level! Target berikutnya ${XP_PER_LEVEL} XP lagi.`
            : `${xpToNext} XP lagi menuju level ${level + 1}.`;
        const questTitle = formatHabitTitle(habitName);
        return result.alreadyDone
          ? `${randomFlavor(
              ALREADY_DONE_FLAVORS
            )} Quest "${questTitle}" sudah clear hari ini. ${comboLine} ${badgeLine} ${xpNextLine}`
          : `${randomFlavor(
              SUCCESS_FLAVORS
            )} Quest "${questTitle}" clear! +${XP_PER_CLEAR} XP (Total ${totalXp} XP). Level ${level}. ${comboLine} ${badgeLine} ${xpNextLine}`;
      }

      case "get_status": {
        const habitsStatus = await habitModel.getAllHabitsForUser(userId);
        if (habitsStatus.length === 0) {
          return "Quest log masih kosong. Tambahkan quest baru dengan `tambah [nama kebiasaan]`";
        }
        let report = "[Quest Log]\n";
        const statuses = await Promise.all(
          habitsStatus.map((h) => habitModel.getHabitStatus(h.id))
        );
        habitsStatus.forEach((h, index) => {
          const stats = statuses[index];
          const { totalXp, level, xpToNext } = computeProgress(stats);
          const comboLine = stats.streak
            ? `Combo ${stats.streak}x`
            : "Belum ada combo";
          const badgeLine = describeBadges(stats.streak);
          const xpLine =
            stats.totalEntries === 0
              ? "Perlu satu clear untuk mendapatkan XP."
              : xpToNext === XP_PER_LEVEL
              ? `Baru naik level! ${XP_PER_LEVEL} XP lagi ke level berikutnya.`
              : `${xpToNext} XP lagi ke level ${level + 1}.`;
          report += `- ${formatHabitTitle(
            h.habit_name
          )}: Lv ${level} | ${totalXp} XP | ${comboLine}. ${badgeLine} ${xpLine}\n`;
        });
        return report.trimEnd();
      }

      case "list_habits": {
        const allHabits = await habitModel.getAllHabitsForUser(userId);
        if (allHabits.length === 0) {
          return "Quest log masih kosong. Tambahkan quest baru dengan `tambah [nama kebiasaan]`";
        }
        const habitList = allHabits
          .map((h, i) => `${i + 1}. ${formatHabitTitle(h.habit_name)}`)
          .join("\n");
        return `[Quest List]\n${habitList}`;
      }

      case "remove_habit": {
        if (!habitName) {
          return "Quest gagal: sebutkan quest mana yang ingin dipensiunkan.\nContoh: `hapus olahraga`";
        }
        const success = await habitModel.removeHabit(userId, habitName);
        return success
          ? `${randomFlavor(QUEST_RETIRE_FLAVORS)} Quest "${formatHabitTitle(
              habitName
            )}" dipindahkan ke arsip guild. Siap buka quest baru!`
          : `Quest "${formatHabitTitle(habitName)}" tidak ditemukan di log.`;
      }

      case "undo_last_entry": {
        if (!habitName) {
          return "Quest gagal: sebutkan quest yang ingin diputar ulang.\nContoh: `batal olahraga`";
        }
        const habitToUndo = await habitModel.findHabit(userId, habitName);
        if (!habitToUndo) {
          return `Quest "${formatHabitTitle(
            habitName
          )}" tidak ditemukan di log.`;
        }
        const undone = await habitModel.undoLastEntry(habitToUndo.id);
        if (!undone) {
          return "Tidak ada progress yang bisa diputar ulang untuk quest itu.";
        }
        const updatedStatus = await habitModel.getHabitStatus(habitToUndo.id);
        const { totalXp: xpAfterUndo, level: levelAfterUndo } =
          computeProgress(updatedStatus);
        return `${randomFlavor(
          UNDO_FLAVORS
        )} Progress terakhir quest "${formatHabitTitle(
          habitName
        )}" dibatalkan. Sekarang Lv ${levelAfterUndo} dengan ${xpAfterUndo} XP. ${describeCombo(
          updatedStatus.streak
        )}`;
      }

      default:
        log("warn", `Unknown tool called: ${toolCall.tool_name}`);
        return `Perintah tool "${toolCall.tool_name}" belum tersedia di quest log.`;
    }
  } catch (dbError) {
    log(
      "error",
      `Database error executing tool ${toolCall.tool_name}: ${dbError.message}`
    );
    return "Guild database lagi error. Coba ulang sebentar lagi, Petualang.";
  }
}

/**
 * Main message handler function
 */
async function handleMessage(client, message) {
  const userId = message.from; // Discord User ID or CLI user ID
  const userInput = message.body;

  // 1. Retrieve or initialize chat history
  if (!chatHistory.has(userId)) {
    // Start with the system prompt
    chatHistory.set(userId, [{ role: "system", content: SYSTEM_PROMPT }]);
  }
  const userHistory = chatHistory.get(userId);

  // Add the new user message to history
  userHistory.push({ role: "user", content: userInput });

  let finalResponse = "Maaf, aku sedang bingung. Coba lagi ya."; // Default error message

  try {
    // 3. Call the LLM
    const llmResponse = await callGemini(userHistory);

    // 4. MCP Enforcement: Check if the response is a tool call or conversation
    let isToolCall = false;
    let toolCallResult = null;
    try {
      // Strict check: Is the response *only* JSON?
      const parsedResponse = JSON.parse(llmResponse);
      // Check if it looks like our defined tool call structure
      if (
        parsedResponse &&
        parsedResponse.tool_name &&
        typeof parsedResponse.args === "object"
      ) {
        isToolCall = true;
        toolCallResult = await executeTool(parsedResponse, userId);
        finalResponse = toolCallResult;
      } else {
        // It's JSON, but not the format we expect for a tool call. Treat as conversation.
        log("warn", `Received unexpected JSON format: ${llmResponse}`);
        finalResponse = llmResponse;
      }
    } catch (e) {
      // JSON.parse failed, so it's a conversational response
      isToolCall = false;
      finalResponse = llmResponse;
    }

    // Add the *final* assistant response to history
    userHistory.push({ role: "assistant", content: finalResponse });

    // Optional: Prune history to prevent exceeding context limits
    // Keep system prompt + last N messages (e.g., 10 messages = 5 turns)
    const maxHistoryLength = 11; // 1 system + 10 user/assistant
    if (userHistory.length > maxHistoryLength) {
      // Keep the system prompt (index 0) and the last X messages
      const cutoffIndex = userHistory.length - (maxHistoryLength - 1);
      chatHistory.set(userId, [
        userHistory[0],
        ...userHistory.slice(cutoffIndex),
      ]);
      log(
        "debug",
        `Pruned history for user ${userId}. New length: ${
          chatHistory.get(userId).length
        }`
      );
    }
  } catch (llmError) {
    log("error", `LLM processing failed: ${llmError.message}`);
    finalResponse =
      "Aduh, sepertinya otakku lagi korslet. Coba tanyakan lagi nanti ya!";
    // Don't add error messages to history? Or maybe add a generic error marker.
    // userHistory.push({ role: "assistant", content: finalResponse });
  }

  // 5. Split and send the final response back to the user
  const messageChunks = splitMessage(finalResponse);
  for (const chunk of messageChunks) {
    if (chunk.trim()) {
      // Jangan kirim chunk kosong
      await client.sendMessage(userId, chunk);
      // Tambahkan jeda singkat jika perlu, untuk menghindari rate limit Discord
      await new Promise((resolve) => setTimeout(resolve, 250)); // Jeda 250ms
    }
  }
}

module.exports = {
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
};
