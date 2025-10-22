const fs = require("fs");
const path = require("path");

const logDir = path.join(__dirname, "..", "..", "logs"); // Define log directory
const logFile = path.join(logDir, "bot.log"); // Define log file path
const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();
const DISCORD_CHAR_LIMIT = 2000;

// --- ADD THIS BLOCK ---
// Ensure the log directory exists before trying to write
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true }); // Create directory if it doesn't exist
    console.log(`Log directory created at: ${logDir}`);
  } catch (err) {
    console.error(`Error creating log directory: ${err.message}`);
    // Decide if you want to exit or continue without logging to file
    process.exit(1); // Exit if log directory creation fails
  }
}
// --- END ADDED BLOCK ---

function log(level, msg) {
  const timestamp = new Date().toISOString();
  // Ensure msg is a string, handle potential objects/errors passed directly
  const messageString =
    typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
  const line = `[${timestamp}] [${level.toUpperCase()}] ${messageString}`;

  const levelMap = { debug: 1, info: 2, warn: 3, error: 4 };

  // Log to console based on level
  if (levelMap[level] >= levelMap[LOG_LEVEL]) {
    if (level === "error") {
      console.error(line); // Use console.error for errors
    } else if (level === "warn") {
      console.warn(line); // Use console.warn for warnings
    } else {
      console.log(line);
    }
  }

  // Append to log file
  try {
    fs.appendFileSync(logFile, line + "\n");
  } catch (writeErr) {
    // Log write error to console, but don't crash the app
    console.error(
      `!!! Failed to write to log file ${logFile}: ${writeErr.message}`
    );
  }
}

/**
 * Splits a long message into chunks respecting Discord's character limit.
 * Tries to split at newlines first, then spaces, then forcefully cuts.
 * @param {string} text The text to split.
 * @returns {string[]} An array of message chunks.
 */
function splitMessage(text) {
  if (text.length <= DISCORD_CHAR_LIMIT) {
    return [text];
  }

  const chunks = [];
  let currentChunk = "";

  // Prioritize splitting by newline
  const lines = text.split("\n");
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 <= DISCORD_CHAR_LIMIT) {
      currentChunk += (currentChunk ? "\n" : "") + line;
    } else {
      // If adding the line exceeds limit, push the current chunk
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // If the line itself is too long, split it further (simple split for now)
      if (line.length > DISCORD_CHAR_LIMIT) {
        let remainingLine = line;
        while (remainingLine.length > DISCORD_CHAR_LIMIT) {
          // Try splitting at the last space within the limit
          let splitPoint = remainingLine.lastIndexOf(" ", DISCORD_CHAR_LIMIT);
          // If no space found, force split
          if (splitPoint === -1 || splitPoint === 0) {
            splitPoint = DISCORD_CHAR_LIMIT;
          }
          chunks.push(remainingLine.substring(0, splitPoint));
          remainingLine = remainingLine.substring(splitPoint).trimStart();
        }
        currentChunk = remainingLine; // Start new chunk with the remainder
      } else {
        currentChunk = line; // Start new chunk with this line
      }
    }
  }

  // Add the last chunk if it exists
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  // Final check in case a chunk somehow still exceeds the limit (force split)
  const finalChunks = [];
  chunks.forEach((chunk) => {
    let remaining = chunk;
    while (remaining.length > DISCORD_CHAR_LIMIT) {
      finalChunks.push(remaining.substring(0, DISCORD_CHAR_LIMIT));
      remaining = remaining.substring(DISCORD_CHAR_LIMIT);
    }
    if (remaining.length > 0) {
      finalChunks.push(remaining);
    }
  });

  return finalChunks.length > 0 ? finalChunks : [""]; // Return empty string array if text was empty
}

module.exports = { log, splitMessage }; // Jangan lupa export fungsi baru
