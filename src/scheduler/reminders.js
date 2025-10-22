const cron = require("node-cron");
const { getAllHabitsForUser } = require("../models/habitModel"); //
const { getDbConnection } = require("../utils/db"); //
const { log, splitMessage } = require("../utils/logger"); //

function startScheduler(client) {
  // client is now the Discord client
  // Schedule a daily reminder every day at 8 AM local time (based on server)
  cron.schedule("0 8 * * *", async () => {
    log("info", "Running daily reminder cron job...");
    try {
      const db = await getDbConnection();
      // user_id in the database now corresponds to the Discord User ID
      const users = await db.all("SELECT DISTINCT user_id FROM habits");

      if (!users || users.length === 0) {
        log("info", "No users with habits found for reminders.");
        return;
      }

      log("info", `Found ${users.length} users with habits.`);

      for (const userRow of users) {
        const userId = userRow.user_id;
        const habits = await getAllHabitsForUser(userId);

        if (habits.length > 0) {
          const habitList = habits
            .map((h) => `> • ${h.habit_name}`) // Use Discord quote formatting
            .join("\n");
          const message = `🌞 Pagi! Jangan lupa untuk menyelesaikan kebiasaanmu hari ini:\n\n${habitList}\n\nAyo semangat! 💪`;

          try {
            // Fetch the Discord User object using the ID
            const user = await client.users.fetch(userId);
            if (user) {
              const reminderChunks = splitMessage(message);
              for (const chunk of reminderChunks) {
                if (chunk.trim()) {
                  await user.send(chunk);
                  await new Promise((resolve) => setTimeout(resolve, 250)); // Jeda
                }
              }
              log(
                "info",
                `Sent reminder DM (${reminderChunks.length} chunk(s)) to user ${user.tag} (${userId})`
              );
            } else {
              log("warn", `Could not find Discord user with ID: ${userId}`);
            }
          } catch (dmError) {
            // Common errors: User left the server, blocked the bot, or disabled DMs
            if (dmError.code === 50007) {
              // Cannot send messages to this user
              log(
                "warn",
                `Cannot send DM to user ${userId}. They might have DMs disabled or blocked the bot.`
              );
            } else {
              log(
                "warn",
                `Failed to send DM to user ${userId}: ${dmError.message}`
              );
            }
          }
        }
      }
      log("info", "Daily reminders process finished.");
    } catch (error) {
      log("error", `Failed during daily reminders cron job: ${error.message}`);
    }
  });

  log(
    "info",
    "🗓️ Daily reminder scheduler started (runs at 8:00 AM server time)."
  );
}

module.exports = { startScheduler };
