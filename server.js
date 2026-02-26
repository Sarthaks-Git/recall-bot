const express = require("express");
const path = require("path");
const { loadTasks, saveTasks, runFullScan, getAuthUrl, handleAuthCallback } = require("./scanner");
const { loadConfig, saveConfig } = require("./config");
const { sendDigest } = require("./summary");
const { daysLeft } = require("./utils");
const db = require("./db");
const webhook = require("./webhook");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
// Serve the built React frontend in production
app.use(express.static(path.join(__dirname, "client", "dist")));


// ─── API: Auth ────────────────────────────────────────────────────────────────

app.get("/auth/google", (req, res) => {
    try {
        const url = getAuthUrl();
        res.redirect(url);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing authorization code");

    try {
        await handleAuthCallback(code);
        res.redirect("/?auth=success");
    } catch (err) {
        console.error("OAuth callback error:", err.message);
        res.redirect("/?auth=error");
    }
});

app.get("/api/auth/status", async (req, res) => {
    try {
        const { authorize } = require("./scanner");
        await authorize();
        res.json({ authorized: true });
    } catch (err) {
        res.json({ authorized: false, authUrl: getAuthUrl() });
    }
});


// ─── API: Tasks ───────────────────────────────────────────────────────────────

app.get("/api/tasks", async (req, res) => {
    let tasks = await loadTasks();

    // Filters
    const { status, type, priority, search } = req.query;
    if (status) tasks = tasks.filter(t => t.status === status);
    if (type) tasks = tasks.filter(t => t.type === type);
    if (priority) tasks = tasks.filter(t => t.priority === priority);
    if (search) {
        const q = search.toLowerCase();
        tasks = tasks.filter(t =>
            t.title.toLowerCase().includes(q) ||
            (t.summary && t.summary.toLowerCase().includes(q))
        );
    }

    // Recalculate priority based on current date
    tasks = tasks.map(t => ({
        ...t,
        daysLeft: daysLeft(t.due),
        priority: t.status === "done" ? t.priority : require("./config").getPriority(daysLeft(t.due))
    }));

    // Sort: pending first, then by due date
    tasks.sort((a, b) => {
        if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
        return a.daysLeft - b.daysLeft;
    });

    res.json(tasks);
});

app.patch("/api/tasks/:id", async (req, res) => {
    // Try MongoDB first
    if (db.isConnected()) {
        const updates = {};
        if (req.body.status) updates.status = req.body.status;
        if (req.body.priority) updates.priority = req.body.priority;

        const success = await db.updateTask(req.params.id, updates);
        if (!success) return res.status(404).json({ error: "Task not found" });
        const task = await db.getTaskById(req.params.id);
        return res.json(task);
    }

    // Fallback: JSON
    const tasks = await loadTasks();
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    if (req.body.status) task.status = req.body.status;
    if (req.body.priority) task.priority = req.body.priority;

    await saveTasks(tasks);
    res.json(task);
});

app.delete("/api/tasks/:id", async (req, res) => {
    // Try MongoDB first
    if (db.isConnected()) {
        const success = await db.deleteTask(req.params.id);
        if (!success) return res.status(404).json({ error: "Task not found" });
        return res.json({ success: true });
    }

    // Fallback: JSON
    let tasks = await loadTasks();
    const before = tasks.length;
    tasks = tasks.filter(t => t.id !== req.params.id);
    if (tasks.length === before) return res.status(404).json({ error: "Task not found" });

    await saveTasks(tasks);
    res.json({ success: true });
});


// ─── API: Config ──────────────────────────────────────────────────────────────

app.get("/api/config", (req, res) => {
    res.json(loadConfig());
});

app.put("/api/config", (req, res) => {
    const success = saveConfig(req.body);
    if (success) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: "Failed to save config" });
    }
});


// ─── API: Scan ────────────────────────────────────────────────────────────────

let isScanning = false;
let lastScanTime = null;
let lastScanResults = 0;

app.post("/api/scan", async (req, res) => {
    if (isScanning) {
        return res.status(409).json({ error: "Scan already in progress" });
    }

    isScanning = true;
    res.json({ message: "Scan started" });

    try {
        lastScanResults = await runFullScan();
        lastScanTime = new Date().toISOString();
    } catch (err) {
        console.error("Scan error:", err.message);
    } finally {
        isScanning = false;
    }
});

app.get("/api/scan/status", (req, res) => {
    res.json({
        isScanning,
        lastScanTime,
        lastScanResults
    });
});


// ─── API: Stats ───────────────────────────────────────────────────────────────

app.get("/api/stats", async (req, res) => {
    const tasks = await loadTasks();
    const pending = tasks.filter(t => t.status === "pending");

    res.json({
        total: tasks.length,
        pending: pending.length,
        done: tasks.filter(t => t.status === "done").length,
        urgent: pending.filter(t => daysLeft(t.due) <= 1).length,
        overdue: 0,
        dueToday: pending.filter(t => daysLeft(t.due) === 0).length,
        dueTomorrow: pending.filter(t => daysLeft(t.due) === 1).length,
        dueThisWeek: pending.filter(t => { const d = daysLeft(t.due); return d >= 0 && d <= 7; }).length,
        lastScanTime,
        isScanning,
        byType: {
            assignment: pending.filter(t => t.type === "assignment").length,
            exam: pending.filter(t => t.type === "exam").length,
            quiz: pending.filter(t => t.type === "quiz").length,
            lab: pending.filter(t => t.type === "lab").length,
            placement: pending.filter(t => t.type === "placement").length,
            other: pending.filter(t => !["assignment", "exam", "quiz", "lab", "placement"].includes(t.type)).length
        }
    });
});


// ─── API: Send Digest Now ─────────────────────────────────────────────────────

app.post("/api/digest/:time", async (req, res) => {
    const timeOfDay = req.params.time === "evening" ? "evening" : "morning";
    try {
        await sendDigest(timeOfDay);
        res.json({ success: true, message: `${timeOfDay} digest sent!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ─── WhatsApp Webhook ─────────────────────────────────────────────────────────

app.use(webhook);


// ─── SPA fallback ───
app.get("/{*path}", (req, res) => {
    res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});


// ─── Export (used by index.js) ────────────────────────────────────────────────

module.exports = { app, PORT };
