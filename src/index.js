const { Client, GatewayIntentBits, Partials } = require("discord.js");
const dotenv = require("dotenv");
const { log } = require("./utils/logger"); //
const { handleMessage } = require("./handlers/agentHandler"); // The new brain
const { startScheduler } = require("./scheduler/reminders"); //

dotenv.config();
log("info", "🚀 Starting Discord Habit Buddy...");

if (!process.env.DISCORD_BOT_TOKEN) {
  log("error", "DISCORD_BOT_TOKEN is missing in your .env file!");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  log("error", "GEMINI_API_KEY is missing in your .env file!");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // Needed for server context, even if unused
    GatewayIntentBits.GuildMessages, // Needed for message events in servers (if you expand later)
    GatewayIntentBits.MessageContent, // REQUIRED to read message content
    GatewayIntentBits.DirectMessages, // REQUIRED for DMs
  ],
  partials: [Partials.Channel], // REQUIRED for DMs
});

client.once("ready", () => {
  log("info", `✅ Bot is ready! Logged in as ${client.user.tag}`);
  // Start the cron jobs once the client is ready
  startScheduler(client);
});

client.on("messageCreate", async (message) => {
  // Ignore messages from other bots
  if (message.author.bot) return;

  // IMPORTANT: Process ONLY Direct Messages for this personal bot
  // If you want it to work in channels, you'd check `message.guild`
  // and maybe `message.mentions.has(client.user)` here.
  if (message.channel.type !== 1) {
    // 1 represents DMChannel
    // Optional: Respond if mentioned in a server channel
    // if (message.mentions.has(client.user)) {
    //     await message.reply("You can chat with me directly in DMs!");
    // }
    return;
  }

  log(
    "info",
    `Message from ${message.author.tag} (${message.author.id}) in DM: "${message.content}"`
  );

  try {
    // Create an "adapter" layer so agentHandler doesn't need to know about Discord.
    // This keeps agentHandler compatible with cli.js too.
    const adaptedMessage = {
      from: message.author.id, // Use Discord User ID as the unique identifier
      body: message.content,
    };

    const adaptedClient = {
      // This function matches the expected signature from the old whatsapp client
      sendMessage: async (userId, text) => {
        try {
          // In DMs, message.channel refers to the DM channel directly
          await message.channel.send(text);
        } catch (sendError) {
          log(
            "error",
            `Failed to send DM reply to ${userId}: ${sendError.message}`
          );
          // You might want more robust error handling here, e.g., if DMs are blocked
        }
      },
    };

    // Call the core agent logic
    await handleMessage(adaptedClient, adaptedMessage);
  } catch (err) {
    log("error", `Handler error: ${err?.stack || err}`);
    try {
      await message.reply(
        "Maaf, terjadi kesalahan internal saat memproses pesanmu. 😥"
      );
    } catch (replyError) {
      log("error", `Failed to send error reply via DM: ${replyError.message}`);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

process.on("unhandledRejection", (reason, promise) => {
  // Log the full reason (which is often the error object)
  log("error", `Unhandled Rejection at: ${promise}, reason:`, reason);

  // Log the stack trace if 'reason' is an error object
  if (reason instanceof Error && reason.stack) {
    log("error", `Stack Trace: ${reason.stack}`);
  } else {
    log("error", `Reason (non-Error): ${JSON.stringify(reason)}`);
  }

  // Optional: Exit gracefully after logging, though sometimes it might exit before logging completes
  // process.exit(1);
});

process.on("uncaughtException", (err, origin) => {
  log("error", `Uncaught Exception: ${err.message} at ${origin}`);
  if (err.stack) {
    log("error", `Stack Trace: ${err.stack}`);
  }
  process.exit(1); // Exit on uncaught exceptions
});
