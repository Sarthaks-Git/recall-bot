const axios = require("axios");
require("dotenv").config();

const API_URL = `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;
const HEADERS = {
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  "Content-Type": "application/json"
};

/* ================================
   1️⃣ Urgent Deadline Alert
   Template: urgent_deadline_alert
================================ */

const sendUrgentAlert = async ({ phone, category, task, due }) => {
  try {
    await axios.post(
      API_URL,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "urgent_deadline_alert",
          language: { code: "en_US" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: category },
                { type: "text", text: task },
                { type: "text", text: due }
              ]
            }
          ]
        }
      },
      { headers: HEADERS }
    );

    console.log("🚨 Urgent WhatsApp alert sent");
  } catch (err) {
    console.error(
      "Urgent WhatsApp alert failed:",
      err.response?.data || err.message
    );
  }
};

/* ================================
   2️⃣ Daily Deadline Summary
   Template: daily_deadline_summary
================================ */

const sendDailySummary = async ({ phone, today, upcoming, urgent }) => {
  try {
    await axios.post(
      API_URL,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "daily_deadline_summary",
          language: { code: "en_US" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: today },
                { type: "text", text: upcoming },
                { type: "text", text: urgent }
              ]
            }
          ]
        }
      },
      { headers: HEADERS }
    );

    console.log("📅 Daily summary sent");
  } catch (err) {
    console.error(
      "Daily summary WhatsApp failed:",
      err.response?.data || err.message
    );
  }
};

const sendNudgeReminder = async ({ phone, message }) => {
  try {
    await axios.post(
      API_URL,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "daily_nudge_reminder",
          language: { code: "en_US" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: message }
              ]
            }
          ]
        }
      },
      { headers: HEADERS }
    );

    console.log("🔔 Reminder sent");
  } catch (err) {
    console.error(
      "Reminder WhatsApp failed:",
      err.response?.data || err.message
    );
  }
};
module.exports = {
  sendUrgentAlert,
  sendDailySummary,
  sendNudgeReminder
};

