#!/usr/bin/env node
const readline = require("readline");
const dotenv = require("dotenv");

dotenv.config();

const { handleMessage } = require("./src/handlers/agentHandler");
const { log } = require("./src/utils/logger");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "👤 Kamu > ",
});

const CLI_USER_ID = "cli-user";

const cliClient = {
  /**
   * Mimics the Discord client API used by handleMessage.
   * @param {string} _userId - unused, kept for compatibility
   * @param {string} text - response from the agent
   */
  sendMessage: async (_userId, text) => {
    console.log(`🤖 Buddy: ${text}`);
    console.log("---");
  },
};

console.log("🚀 Habit Buddy – Mode CLI");
console.log("Ketik pesanmu lalu tekan Enter. Ketik 'exit' untuk keluar.\n---");
rl.prompt();

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    rl.prompt();
    return;
  }

  if (trimmed.toLowerCase() === "exit") {
    rl.close();
    return;
  }

  const message = {
    from: CLI_USER_ID,
    body: trimmed,
  };

  try {
    await handleMessage(cliClient, message);
  } catch (err) {
    log(
      "error",
      `Kesalahan saat memproses pesan CLI: ${err?.message || err.toString()}`
    );
    console.log("🤖 Buddy: Waduh, ada error di mode CLI. Coba lagi ya!");
    console.log("---");
  }

  rl.prompt();
});

rl.on("close", () => {
  console.log("👋 Sampai jumpa di quest berikutnya!");
  process.exit(0);
});
