const express = require("express");
const { loadTasks } = require("./scanner");
const { loadConfig } = require("./config");
const { sendCommandResponse } = require("./whatsapp");
const { daysLeft } = require("./utils");
require("dotenv").config();

const router = express.Router();

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "recallbot_verify";


// ─── Webhook Verification (GET) ───────────────────────────────────────────────

router.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ Webhook verified");
        return res.status(200).send(challenge);
    }
    res.sendStatus(403);
});


// ─── Incoming Messages (POST) ─────────────────────────────────────────────────

router.post("/webhook", async (req, res) => {
    // Always respond 200 quickly to avoid Meta retries
    res.sendStatus(200);

    try {
        const body = req.body;
        if (!body.object) return;

        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const messages = value?.messages;

        if (!messages || messages.length === 0) return;

        const msg = messages[0];
        if (msg.type !== "text") return;

        const from = msg.from;
        const text = msg.text.body.trim();
        const config = loadConfig();
        const prefix = config.whatsapp.commandPrefix || "!";

        // Only process commands starting with prefix
        if (!text.startsWith(prefix)) return;

        const command = text.substring(prefix.length).toLowerCase().split(" ");
        const cmd = command[0];

        console.log(`📱 WhatsApp command from ${from}: ${text}`);

        const response = await handleCommand(cmd, command.slice(1));
        await sendCommandResponse(from, response);

    } catch (err) {
        console.error("❌ Webhook error:", err.message);
    }
});


// ─── Command Handler ──────────────────────────────────────────────────────────

async function handleCommand(cmd, args) {
    const tasks = loadTasks().filter(t => t.status === "pending");

    switch (cmd) {
        case "today": {
            const today = tasks.filter(t => daysLeft(t.due) === 0);
            if (today.length === 0) return "✅ *No tasks due today!* You're free 🎉";
            return formatTaskList("📅 *Tasks Due Today:*", today);
        }

        case "tomorrow": {
            const tomorrow = tasks.filter(t => daysLeft(t.due) === 1);
            if (tomorrow.length === 0) return "✅ *Nothing due tomorrow!*";
            return formatTaskList("📅 *Tasks Due Tomorrow:*", tomorrow);
        }

        case "week": {
            const week = tasks.filter(t => {
                const dl = daysLeft(t.due);
                return dl >= 0 && dl <= 7;
            }).sort((a, b) => daysLeft(a.due) - daysLeft(b.due));
            if (week.length === 0) return "✅ *No tasks this week!*";
            return formatTaskList("📅 *Tasks This Week:*", week);
        }

        case "urgent": {
            const urgent = tasks.filter(t => t.priority === "urgent" || daysLeft(t.due) < 0);
            if (urgent.length === 0) return "✅ *No urgent tasks!*";
            return formatTaskList("🔴 *Urgent & Overdue:*", urgent);
        }

        case "all": {
            if (tasks.length === 0) return "✅ *No pending tasks!*";
            const sorted = tasks.sort((a, b) => daysLeft(a.due) - daysLeft(b.due));
            return formatTaskList(`📋 *All Pending Tasks (${tasks.length}):*`, sorted.slice(0, 15));
        }

        case "done": {
            if (!args[0]) return "⚠️ Usage: !done <task-number>\nUse !all to see task numbers.";
            return markDone(parseInt(args[0]));
        }

        case "scan": {
            return "🔍 *Scan triggered!* Check the dashboard for results.\n_Note: Scanning happens in the background._";
        }

        case "stats": {
            const allTasks = loadTasks();
            const pending = allTasks.filter(t => t.status === "pending");
            const done = allTasks.filter(t => t.status === "done");
            const urgent = pending.filter(t => t.priority === "urgent");
            const overdue = pending.filter(t => daysLeft(t.due) < 0);

            return `📊 *RecallBot Stats:*\n\n` +
                `📋 Total tasks: ${allTasks.length}\n` +
                `⏳ Pending: ${pending.length}\n` +
                `✅ Completed: ${done.length}\n` +
                `🔴 Urgent: ${urgent.length}\n` +
                `⚠️ Overdue: ${overdue.length}`;
        }

        case "help":
        default:
            return `🤖 *RecallBot Commands:*\n\n` +
                `!today — Tasks due today\n` +
                `!tomorrow — Tasks due tomorrow\n` +
                `!week — Tasks due this week\n` +
                `!urgent — Urgent & overdue tasks\n` +
                `!all — All pending tasks\n` +
                `!done <#> — Mark task as done\n` +
                `!stats — Quick statistics\n` +
                `!scan — Trigger email scan\n` +
                `!help — Show this menu`;
    }
}


// ─── Formatting Helpers ───────────────────────────────────────────────────────

function formatTaskList(header, tasks) {
    let msg = header + "\n\n";

    tasks.forEach((t, i) => {
        const dl = daysLeft(t.due);
        const daysText = dl === 0 ? "TODAY" : dl === 1 ? "Tomorrow" : dl < 0 ? `${Math.abs(dl)}d OVERDUE` : `${dl}d left`;
        const icon = dl < 0 ? "🔴" : dl === 0 ? "🟠" : dl <= 2 ? "🟡" : "🟢";

        msg += `${icon} *${i + 1}. ${t.title}*\n`;
        msg += `   📅 ${t.due} (${daysText})`;
        if (t.summary) msg += `\n   📝 ${t.summary}`;
        msg += "\n\n";
    });

    return msg.trim();
}

function markDone(index) {
    const { loadTasks: load, saveTasks: save } = require("./scanner");
    const tasks = load();
    const pending = tasks.filter(t => t.status === "pending");

    if (index < 1 || index > pending.length) {
        return `⚠️ Invalid task number. You have ${pending.length} pending tasks.`;
    }

    const task = pending[index - 1];
    const taskInAll = tasks.find(t => t.id === task.id);
    if (taskInAll) taskInAll.status = "done";
    save(tasks);

    return `✅ *Marked as done:* ${task.title}`;
}


module.exports = router;
module.exports.handleCommand = handleCommand;
