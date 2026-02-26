const { app, PORT } = require("./server");
const { runFullScan } = require("./scanner");
const { startReminderCrons } = require("./summary");
const { loadConfig } = require("./config");
const db = require("./db");
const cron = require("node-cron");
require("dotenv").config();

console.log("╔═══════════════════════════════════════════════╗");
console.log("║     🔍 RecallBot v2 — AI Academic Assistant   ║");
console.log("╚═══════════════════════════════════════════════╝");
console.log("");

// ─── Start App ────────────────────────────────────────────────────────────────

async function start() {
    // Connect to MongoDB (if configured)
    await db.connect();

    // Start Express Server
    app.listen(PORT, () => {
        console.log(`🌐 Dashboard: http://localhost:${PORT}`);
        console.log("");
    });

    // Start reminders
    startReminderCrons();

    // Periodic scanning
    const config = loadConfig();
    const interval = config.scanning.scanIntervalMinutes || 60;

    // Initial scan after 5 seconds
    setTimeout(() => {
        console.log("\n🚀 Running initial scan...\n");
        runFullScan().catch(err => {
            if (err.message === "NOT_AUTHORIZED") {
                console.log("💡 Authorize via the dashboard: http://localhost:" + PORT);
            } else {
                console.error("Initial scan failed:", err.message);
                console.log("💡 Make sure credentials.json exists and you've authorized the app.");
            }
        });
    }, 5000);

    // Scheduled scans
    const cronExpression = `*/${interval} * * * *`;
    cron.schedule(cronExpression, () => {
        console.log("\n🔄 Running scheduled scan...\n");
        runFullScan().catch(err => console.error("Scheduled scan failed:", err.message));
    });

    console.log(`🔄 Auto-scan: every ${interval} minutes`);
    console.log("");
    console.log("─── Press Ctrl+C to stop ───");
    console.log("");
}

start().catch(err => {
    console.error("❌ Failed to start RecallBot:", err.message);
    process.exit(1);
});
