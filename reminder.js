/**
 * reminder.js
 * Light daily WhatsApp nudges
 */

require("dotenv").config();
const cron = require("node-cron");
const { sendNudgeReminder } = require("./whatsapp");

// 🌞 Morning reminder – 7 AM
cron.schedule("0 7 * * *", async () => {
  console.log("🌞 Sending morning reminder");

  await sendNudgeReminder({
    phone: process.env.TO_PHONE_NUMBER,
    message: "Good morning! Check today’s deadlines."
  });
});

// 🌙 Evening reminder – 9 PM
cron.schedule("0 21 * * *", async () => {
  console.log("🌙 Sending evening reminder");

  await sendNudgeReminder({
    phone: process.env.TO_PHONE_NUMBER,
    message: "Night check: any assignment or exam tomorrow?"
  });
});
