const cron = require("node-cron");
const { loadConfig } = require("./config");
const { loadTasks } = require("./scanner");
const { sendRichDigest, sendUrgentAlert } = require("./whatsapp");
const { daysLeft } = require("./utils");
require("dotenv").config();

const phone = process.env.TO_PHONE_NUMBER;

// ─── Build Digest from Tasks ──────────────────────────────────────────────────

async function getRelevantTasks(timeOfDay) {
  const tasks = await loadTasks();
  const config = await loadConfig();
  const pending = tasks.filter(t => t.status === "pending");

  if (timeOfDay === "morning") {
    // Morning: show today + next 7 days (skip overdue)
    return pending.filter(t => {
      const dl = daysLeft(t.due);
      return dl >= 0 && dl <= 7;
    }).sort((a, b) => daysLeft(a.due) - daysLeft(b.due));
  } else {
    // Evening: show today + next 3 days (skip overdue)
    return pending.filter(t => {
      const dl = daysLeft(t.due);
      return dl >= 0 && dl <= 3;
    }).sort((a, b) => daysLeft(a.due) - daysLeft(b.due));
  }
}

// ─── Send Digest ───

async function sendDigest(timeOfDay) {
  try {
    console.log(`\n📨 Preparing ${timeOfDay} digest...`);

    if (!phone) {
      console.log("⚠️ TO_PHONE_NUMBER not set. Skipping WhatsApp.");
      return;
    }

    const config = await loadConfig();
    if (!config.whatsapp?.enabled) {
      console.log("⚠️ WhatsApp disabled in config.");
      return;
    }

    const tasks = await getRelevantTasks(timeOfDay);
    console.log(`  Found ${tasks.length} relevant tasks`);

    await sendRichDigest(phone, tasks, timeOfDay);

    // Also send urgent alerts for anything due today/tomorrow
    const urgentTasks = tasks.filter(t => daysLeft(t.due) <= (config.priority?.urgent || 1));
    for (const task of urgentTasks) {
      await sendUrgentAlert({
        phone,
        category: task.type,
        task: task.title,
        due: task.due
      });
    }

  } catch (err) {
    console.error("❌ SendDigest Fatal Error:", err);
    throw err;
  }
}


// ─── Start Cron Jobs ──────────────────────────────────────────────────────────

let morningJob = null;
let eveningJob = null;

async function startReminderCrons() {
  const config = await loadConfig();

  if (!config.reminders?.enabled) {
    console.log("⚠️ Reminders disabled in config.");
    return;
  }

  // Parse times from config (format: "07:00", "21:00")
  const [morningH, morningM] = (config.reminders.morning || "07:00").split(":").map(Number);
  const [eveningH, eveningM] = (config.reminders.evening || "21:00").split(":").map(Number);

  // Stop existing jobs if restarting
  if (morningJob) morningJob.stop();
  if (eveningJob) eveningJob.stop();

  // Morning digest
  morningJob = cron.schedule(`${morningM} ${morningH} * * *`, () => {
    sendDigest("morning");
  });

  // Evening digest
  eveningJob = cron.schedule(`${eveningM} ${eveningH} * * *`, () => {
    sendDigest("evening");
  });

  console.log(`⏰ Reminders scheduled: Morning ${config.reminders.morning}, Evening ${config.reminders.evening}`);
}

function stopReminderCrons() {
  if (morningJob) { morningJob.stop(); morningJob = null; }
  if (eveningJob) { eveningJob.stop(); eveningJob = null; }
}


module.exports = {
  sendDigest,
  getRelevantTasks,
  startReminderCrons,
  stopReminderCrons
};

// Run directly for testing
if (require.main === module) {
  sendDigest("morning");
}
