const axios = require("axios");
require("dotenv").config();

const API_URL = `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;
const HEADERS = {
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  "Content-Type": "application/json"
};


// ─── Send Template Message (for approved templates) ───────────────────────────

async function sendTemplate(phone, templateName, params) {
  try {
    await axios.post(API_URL, {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en_US" },
        components: [{
          type: "body",
          parameters: params.map(p => ({ type: "text", text: String(p) }))
        }]
      }
    }, { headers: HEADERS });
    return true;
  } catch (err) {
    console.error(`❌ Template "${templateName}" failed:`, err.response?.data?.error?.message || err.message);
    return false;
  }
}


// ─── Send Free-form Text (within 24h customer window) ─────────────────────────

async function sendTextMessage(phone, text) {
  try {
    await axios.post(API_URL, {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: text }
    }, { headers: HEADERS });
    return true;
  } catch (err) {
    console.error("❌ Text message failed:", err.response?.data?.error?.message || err.message);
    return false;
  }
}


// ─── Specific Message Functions ───────────────────────────────────────────────

async function sendUrgentAlert({ phone, category, task, due }) {
  console.log("🚨 Sending urgent alert...");
  return sendTemplate(phone, "urgent_deadline_alert", [category, task, due]);
}

async function sendDailySummary({ phone, today, upcoming, urgent }) {
  console.log("📅 Sending daily summary...");
  return sendTemplate(phone, "daily_deadline_summary", [today, upcoming, urgent]);
}

async function sendNudgeReminder({ phone, message }) {
  console.log("🔔 Sending nudge...");
  return sendTemplate(phone, "daily_nudge_reminder", [message]);
}


// ─── Rich Digest Message (with AI summaries) ─────────────────────────────────

async function sendRichDigest(phone, tasks, timeOfDay) {
  if (!tasks || tasks.length === 0) {
    const msg = timeOfDay === "morning"
      ? "☀️ *Good morning!* No urgent deadlines today. You're all caught up! 🎉"
      : "🌙 *Good evening!* No pending deadlines for tomorrow. Rest well! 😊";
    return sendTextMessage(phone, msg);
  }

  const header = timeOfDay === "morning"
    ? "☀️ *Good Morning! Here's your academic update:*\n"
    : "🌙 *Evening Check-in:*\n";

  let msg = header + "\n";

  // Group by priority
  const urgent = tasks.filter(t => t.priority === "urgent");
  const important = tasks.filter(t => t.priority === "important");
  const normal = tasks.filter(t => t.priority === "normal" || t.priority === "low");

  if (urgent.length > 0) {
    msg += "🔴 *URGENT:*\n";
    urgent.forEach((t, i) => {
      msg += `${i + 1}. *${t.title}*\n`;
      msg += `   📅 Due: ${t.due} | 📝 ${t.summary || "No summary"}\n\n`;
    });
  }

  if (important.length > 0) {
    msg += "🟡 *IMPORTANT:*\n";
    important.forEach((t, i) => {
      msg += `${i + 1}. *${t.title}*\n`;
      msg += `   📅 Due: ${t.due} | 📝 ${t.summary || "No summary"}\n\n`;
    });
  }

  if (normal.length > 0) {
    msg += "🟢 *UPCOMING:*\n";
    normal.forEach((t, i) => {
      msg += `${i + 1}. ${t.title} — Due: ${t.due}\n`;
    });
  }

  msg += `\n📊 Total: ${tasks.length} pending | ${urgent.length} urgent`;
  msg += "\n\n_Type !help for commands_";

  return sendTextMessage(phone, msg);
}


// ─── Command Response ─────────────────────────────────────────────────────────

async function sendCommandResponse(phone, text) {
  return sendTextMessage(phone, text);
}


module.exports = {
  sendTemplate,
  sendTextMessage,
  sendUrgentAlert,
  sendDailySummary,
  sendNudgeReminder,
  sendRichDigest,
  sendCommandResponse
};
