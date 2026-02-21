/**
 * sendmessage.js
 * Manual WhatsApp template test script
 */

require("dotenv").config();
const { sendUrgentAlert } = require("./whatsapp");

async function testWhatsApp() {
  console.log("📤 Sending test WhatsApp message...");

  await sendUrgentAlert({
    phone: process.env.TO_PHONE_NUMBER,
    category: "test",
    task: "RecallBot WhatsApp test",
    due: "Today"
  });

  console.log("✅ Test message triggered");
}

testWhatsApp();
