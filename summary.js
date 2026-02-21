const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
require("dotenv").config();

const { sendDailySummary } = require("./whatsapp");
const { daysLeft } = require("./utils");

const TASKS_PATH = path.join(__dirname, "tasks.json");

function loadTasks() {
  if (!fs.existsSync(TASKS_PATH)) return [];
  return JSON.parse(fs.readFileSync(TASKS_PATH, "utf8"));
}

function buildSummary() {
  const tasks = loadTasks();

  let today = [];
  let upcoming = [];
  let urgent = [];

  tasks.forEach(task => {
    const days = daysLeft(task.due);

    if (days < 0) return; // past-due, skip

    if (days === 0) {
      today.push(task.title);
      urgent.push(task.title); // due today is also urgent
    } else if (days <= 1) {
      urgent.push(task.title); // due tomorrow is urgent
    } else if (days <= 7) {
      upcoming.push(task.title);
    }
  });

  return {
    today: today.length ? today.join("\n• ") : "None",
    upcoming: upcoming.length ? upcoming.join("\n• ") : "None",
    urgent: urgent.length ? urgent.join("\n• ") : "None"
  };
}

// ⏰ Every day at 8:00 AM
cron.schedule("0 8 * * *", async () => {
  try {
    const summary = buildSummary();

    console.log("📤 Sending daily summary...");

    await sendDailySummary({
      phone: process.env.TO_PHONE_NUMBER,
      today: summary.today,
      upcoming: summary.upcoming,
      urgent: summary.urgent
    });

    console.log("✅ Daily summary sent");
  } catch (err) {
    console.error("❌ Failed to send daily summary:", err.message);
  }
});
