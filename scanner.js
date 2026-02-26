const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const readline = require("readline");
const { v4: uuidv4 } = require("uuid");
const { classifyEmail, summarizeEmail, extractDeadline } = require("./ai");
const { loadConfig, isBlacklisted, isWhitelisted, getPriority } = require("./config");
const { daysLeft } = require("./utils");
const db = require("./db");
require("dotenv").config();

const TOKEN_PATH = path.join(__dirname, "token.json");
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TASKS_PATH = path.join(__dirname, "tasks.json");

// Scopes for both Gmail and Classroom
const SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
    "https://www.googleapis.com/auth/classroom.announcements.readonly"
];


// ─── Task Storage (MongoDB with JSON fallback) ───────────────────────────────

async function loadTasks() {
    // Try MongoDB first
    if (db.isConnected()) {
        try {
            const tasks = await db.getAllTasks();
            // Auto-delete expired tasks
            const deleted = await db.deleteExpiredTasks();
            if (deleted > 0) {
                console.log(`🗑️ Removed ${deleted} past-due tasks from database.`);
            }
            return tasks;
        } catch (err) {
            console.error("⚠️ MongoDB read failed, falling back to JSON:", err.message);
        }
    }

    // Fallback: local JSON
    try {
        if (fs.existsSync(TASKS_PATH)) {
            let tasks = JSON.parse(fs.readFileSync(TASKS_PATH, "utf8"));
            let migrated = false;

            // Remove past-due tasks
            const beforeCount = tasks.length;
            tasks = tasks.filter(t => !(t.due && daysLeft(t.due) < 0));
            if (tasks.length < beforeCount) migrated = true;

            // Migrate v1 tasks
            tasks = tasks.map(t => {
                if (!t.id) { t.id = uuidv4(); migrated = true; }
                if (!t.status) { t.status = "pending"; migrated = true; }
                if (!t.source) { t.source = "gmail"; migrated = true; }
                if (!t.summary) { t.summary = t.title; migrated = true; }
                return t;
            });

            if (migrated) {
                fs.writeFileSync(TASKS_PATH, JSON.stringify(tasks, null, 2));
            }
            return tasks;
        }
    } catch (err) {
        console.error("⚠️ Failed to load tasks:", err.message);
    }
    return [];
}

async function saveTasks(tasks) {
    if (db.isConnected()) {
        // For bulk save, we don't use this path — individual saves go through saveTask
        return;
    }
    fs.writeFileSync(TASKS_PATH, JSON.stringify(tasks, null, 2));
}

async function saveTask(task) {
    // Skip past-due tasks
    if (task.due && daysLeft(task.due) < 0) {
        return false;
    }

    if (db.isConnected()) {
        try {
            // Check duplicates in MongoDB
            const isDupe = await db.findDuplicate(task);
            if (isDupe) {
                console.log("  ⏭️  Skip (duplicate):", task.title);
                return false;
            }
            await db.saveTask(task);
            console.log("  ✅ Saved:", task.title);
            return true;
        } catch (err) {
            console.error("  ❌ MongoDB save failed:", err.message);
            return false;
        }
    }

    // Fallback: local JSON
    const tasks = await loadTasks();

    function getKeywords(title) {
        return (title || "").toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(w => w.length >= 3);
    }

    const taskKeywords = getKeywords(task.title);
    const exists = tasks.some(t => {
        if (task.messageId && t.messageId === task.messageId) return true;
        if (t.title === task.title && t.due === task.due) return true;
        if (t.due === task.due) {
            const existingKw = getKeywords(t.title);
            const shared = taskKeywords.filter(w => existingKw.includes(w));
            if (shared.length >= 2) return true;
        }
        return false;
    });

    if (!exists) {
        tasks.push(task);
        fs.writeFileSync(TASKS_PATH, JSON.stringify(tasks, null, 2));
        console.log("  ✅ Saved:", task.title);
        return true;
    } else {
        console.log("  ⏭️  Skip (duplicate):", task.title);
        return false;
    }
}


// ─── OAuth (env vars + file fallback) ─────────────────────────────────────────

function getCredentials() {
    // Try env vars first (for cloud deployment)
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        return {
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uris: [process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback"]
        };
    }
    // Fallback: credentials.json file
    if (fs.existsSync(CREDENTIALS_PATH)) {
        const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
        return creds.installed || creds.web;
    }
    return null;
}

async function getStoredToken() {
    // Try MongoDB first
    if (db.isConnected()) {
        const token = await db.getToken();
        if (token) return token;
    }
    // Try env var
    if (process.env.GOOGLE_TOKEN) {
        try { return JSON.parse(process.env.GOOGLE_TOKEN); } catch { }
    }
    // Try file
    if (fs.existsSync(TOKEN_PATH)) {
        return JSON.parse(fs.readFileSync(TOKEN_PATH));
    }
    return null;
}

async function storeToken(token) {
    // Save to MongoDB if connected
    if (db.isConnected()) {
        await db.saveToken(token);
    }
    // Always save to file too (for local dev)
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
}

function createOAuthClient() {
    const creds = getCredentials();
    if (!creds) {
        throw new Error("No Google credentials found. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env vars or provide credentials.json");
    }
    return new google.auth.OAuth2(
        creds.client_id,
        creds.client_secret,
        creds.redirect_uris[0]
    );
}

function getAuthUrl() {
    const oAuth2Client = createOAuthClient();
    return oAuth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: SCOPES
    });
}

async function handleAuthCallback(code) {
    const oAuth2Client = createOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    await storeToken(tokens);
    console.log("✅ Google OAuth token saved.");
    return oAuth2Client;
}

async function authorize() {
    const oAuth2Client = createOAuthClient();
    const token = await getStoredToken();

    if (token) {
        oAuth2Client.setCredentials(token);

        // Set up auto-refresh
        oAuth2Client.on("tokens", async (newTokens) => {
            const current = await getStoredToken() || {};
            const updated = { ...current, ...newTokens };
            await storeToken(updated);
        });

        return oAuth2Client;
    }

    // No token — check if we're in a terminal (local dev) or cloud
    if (process.stdin.isTTY) {
        return await getNewToken(oAuth2Client);
    }

    // Cloud: user needs to authorize via dashboard
    throw new Error("NOT_AUTHORIZED");
}

function getNewToken(oAuth2Client) {
    return new Promise((resolve, reject) => {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: "offline",
            scope: SCOPES
        });

        console.log("\n🔐 Authorize RecallBot by visiting:\n");
        console.log(authUrl);
        console.log("");

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question("Enter the code: ", async (code) => {
            rl.close();
            try {
                const { tokens } = await oAuth2Client.getToken(code);
                oAuth2Client.setCredentials(tokens);
                await storeToken(tokens);
                console.log("✅ Token saved");
                resolve(oAuth2Client);
            } catch (err) {
                reject(err);
            }
        });
    });
}


// ─── Gmail Scanner ────────────────────────────────────────────────────────────

async function scanGmail(auth) {
    const config = loadConfig();
    const gmail = google.gmail({ version: "v1", auth });

    const searchQuery = config.whitelist.keywords
        .slice(0, 15)
        .join(" OR ");

    console.log("\n📧 Scanning Gmail...");
    console.log("  Query:", searchQuery.substring(0, 80) + "...");

    try {
        const res = await gmail.users.messages.list({
            userId: "me",
            q: searchQuery,
            maxResults: config.scanning.maxEmails
        });

        const messages = res.data.messages || [];
        console.log(`  📬 Found ${messages.length} emails\n`);

        let newTasks = 0;

        for (const msg of messages) {
            try {
                const data = await gmail.users.messages.get({
                    userId: "me",
                    id: msg.id,
                    format: "full"
                });

                const headers = data.data.payload.headers;
                const subject = headers.find(h => h.name === "Subject")?.value || "";
                const from = headers.find(h => h.name === "From")?.value || "";
                const snippet = data.data.snippet || "";

                let body = "";
                try { body = extractBody(data.data.payload); } catch { }

                const fullText = subject + " " + snippet + " " + body;

                if (isBlacklisted(fullText, from, config)) {
                    console.log("  🚫 Blacklisted:", subject.substring(0, 60));
                    continue;
                }

                const classification = await classifyEmail(subject, snippet, from);

                if (!classification.isRelevant && !isWhitelisted(fullText, from, config)) {
                    console.log("  ⏭️  Not relevant:", subject.substring(0, 60));
                    continue;
                }

                const due = await extractDeadline(subject, body || snippet);
                if (!due) {
                    console.log("  📅 No deadline found:", subject.substring(0, 60));
                    continue;
                }

                const summary = await summarizeEmail(subject, body || snippet);

                const dl = daysLeft(due);
                const task = {
                    id: uuidv4(),
                    source: "gmail",
                    messageId: msg.id,
                    type: classification.category,
                    title: cleanTitle(subject),
                    summary: summary,
                    due: due,
                    sender: from,
                    link: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
                    priority: getPriority(dl, config),
                    status: "pending",
                    confidence: classification.confidence,
                    createdAt: new Date().toISOString()
                };

                if (await saveTask(task)) newTasks++;

                console.log(`  📌 ${task.priority.toUpperCase()} | ${task.type} | ${task.title} | Due: ${due}`);

            } catch (err) {
                console.error("  ❌ Error processing email:", err.message);
            }
        }

        console.log(`\n✅ Gmail scan done. ${newTasks} new tasks saved.`);
        return newTasks;

    } catch (err) {
        console.error("❌ Gmail API error:", err.message);
        return 0;
    }
}


// ─── Google Classroom Scanner ─────────────────────────────────────────────────

async function scanClassroom(auth) {
    const config = loadConfig();

    if (!config.scanning.sources.includes("classroom")) {
        console.log("\n📚 Classroom scanning disabled in config");
        return 0;
    }

    const classroom = google.classroom({ version: "v1", auth });

    console.log("\n📚 Scanning Google Classroom...");

    try {
        const coursesRes = await classroom.courses.list({
            courseStates: ["ACTIVE"],
            pageSize: 20
        });

        const courses = coursesRes.data.courses || [];
        console.log(`  📖 Found ${courses.length} active courses`);

        let newTasks = 0;

        for (const course of courses) {
            try {
                const workRes = await classroom.courses.courseWork.list({
                    courseId: course.id,
                    courseWorkStates: ["PUBLISHED"],
                    pageSize: 10,
                    orderBy: "dueDate desc"
                });

                const items = workRes.data.courseWork || [];

                for (const item of items) {
                    let due = null;
                    if (item.dueDate) {
                        const y = item.dueDate.year;
                        const m = String(item.dueDate.month).padStart(2, "0");
                        const d = String(item.dueDate.day).padStart(2, "0");
                        due = `${y}-${m}-${d}`;
                    }

                    if (!due) continue;

                    const dl = daysLeft(due);
                    if (dl < -7) continue;

                    const description = item.description || "";
                    const summary = await summarizeEmail(
                        `[${course.name}] ${item.title}`,
                        description
                    );

                    const task = {
                        id: uuidv4(),
                        source: "classroom",
                        messageId: `classroom_${course.id}_${item.id}`,
                        type: item.workType === "ASSIGNMENT" ? "assignment" : "quiz",
                        title: `[${course.name}] ${item.title}`,
                        summary: summary,
                        due: due,
                        sender: course.name,
                        link: item.alternateLink || `https://classroom.google.com/c/${course.id}/a/${item.id}/details`,
                        priority: getPriority(dl, loadConfig()),
                        status: "pending",
                        confidence: 1.0,
                        createdAt: new Date().toISOString()
                    };

                    if (await saveTask(task)) newTasks++;
                    console.log(`  📌 ${task.type} | ${task.title} | Due: ${due}`);
                }

            } catch (err) {
                if (!err.message.includes("403")) {
                    console.error(`  ⚠️ Error scanning course ${course.name}:`, err.message);
                }
            }
        }

        console.log(`\n✅ Classroom scan done. ${newTasks} new tasks saved.`);
        return newTasks;

    } catch (err) {
        if (err.message.includes("403") || err.message.includes("not enabled")) {
            console.log("  ⚠️ Classroom API not enabled or no access. Skipping.");
        } else {
            console.error("❌ Classroom API error:", err.message);
        }
        return 0;
    }
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractBody(payload) {
    let text = "";

    if (payload.body && payload.body.data) {
        text = Buffer.from(payload.body.data, "base64").toString("utf8");
    }

    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.mimeType === "text/plain" && part.body && part.body.data) {
                text += Buffer.from(part.body.data, "base64").toString("utf8");
            }
            if (part.parts) {
                text += extractBody(part);
            }
        }
    }

    return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanTitle(subject) {
    return subject
        .replace(/^(Re:|Fwd:|FW:|RE:)\s*/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 120);
}


// ─── Full Scan (both sources) ─────────────────────────────────────────────────

async function runFullScan() {
    console.log("═══════════════════════════════════════════");
    console.log("🔍 RecallBot v2 — Starting Full Scan");
    console.log("  Time:", new Date().toLocaleString());
    console.log("═══════════════════════════════════════════");

    try {
        const auth = await authorize();
        const gmailNew = await scanGmail(auth);
        const classroomNew = await scanClassroom(auth);

        const total = gmailNew + classroomNew;
        console.log(`\n🎯 Scan complete: ${total} new tasks found`);
        return total;
    } catch (err) {
        if (err.message === "NOT_AUTHORIZED") {
            console.log("\n⚠️ Google not authorized. Please authorize via the dashboard.");
            return 0;
        }
        console.error("❌ Scan failed:", err.message);
        return 0;
    }
}


// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    authorize,
    getAuthUrl,
    handleAuthCallback,
    scanGmail,
    scanClassroom,
    runFullScan,
    loadTasks,
    saveTasks,
    saveTask
};

// Run directly if called with: node scanner.js
if (require.main === module) {
    runFullScan();
}
