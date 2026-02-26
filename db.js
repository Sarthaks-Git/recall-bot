const { MongoClient } = require("mongodb");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "recallbot";

let client = null;
let db = null;

// ─── Connect ──────────────────────────────────────────────────────────────────

async function connect() {
    if (db) return db;

    if (!MONGODB_URI) {
        console.log("⚠️ MONGODB_URI not set. Using local JSON fallback.");
        return null;
    }

    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);

        // Create indexes for fast queries
        await db.collection("tasks").createIndex({ messageId: 1 });
        await db.collection("tasks").createIndex({ due: 1 });
        await db.collection("tasks").createIndex({ status: 1 });

        console.log("🗄️  MongoDB: connected");
        return db;
    } catch (err) {
        console.error("❌ MongoDB connection failed:", err.message);
        return null;
    }
}

function getDb() {
    return db;
}

function isConnected() {
    return db !== null;
}


// ─── Tasks Collection ─────────────────────────────────────────────────────────

async function getAllTasks() {
    if (!db) return [];
    return await db.collection("tasks").find({}).toArray();
}

async function getTaskById(id) {
    if (!db) return null;
    return await db.collection("tasks").findOne({ id });
}

async function saveTask(task) {
    if (!db) return false;
    await db.collection("tasks").insertOne(task);
    return true;
}

async function updateTask(id, updates) {
    if (!db) return false;
    const result = await db.collection("tasks").updateOne(
        { id },
        { $set: updates }
    );
    return result.modifiedCount > 0;
}

async function deleteTask(id) {
    if (!db) return false;
    const result = await db.collection("tasks").deleteOne({ id });
    return result.deletedCount > 0;
}

async function deleteExpiredTasks() {
    if (!db) return 0;
    const today = new Date().toISOString().split("T")[0];
    const result = await db.collection("tasks").deleteMany({
        due: { $lt: today }
    });
    return result.deletedCount;
}

async function findDuplicate(task) {
    if (!db) return false;

    // Check exact messageId
    if (task.messageId) {
        const byId = await db.collection("tasks").findOne({ messageId: task.messageId });
        if (byId) return true;
    }

    // Check exact title+due
    const byTitleDue = await db.collection("tasks").findOne({
        title: task.title,
        due: task.due
    });
    if (byTitleDue) return true;

    // Fuzzy: same due date + shared keywords
    if (task.due) {
        const sameDue = await db.collection("tasks").find({ due: task.due }).toArray();
        const taskKeywords = getKeywords(task.title);
        for (const t of sameDue) {
            const existingKw = getKeywords(t.title);
            const shared = taskKeywords.filter(w => existingKw.includes(w));
            if (shared.length >= 2) return true;
        }
    }

    return false;
}

function getKeywords(title) {
    return (title || "").toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length >= 3);
}


// ─── Config Collection ────────────────────────────────────────────────────────

async function getConfig() {
    if (!db) return null;
    return await db.collection("config").findOne({ _key: "main" });
}

async function saveConfig(config) {
    if (!db) return false;
    await db.collection("config").updateOne(
        { _key: "main" },
        { $set: { ...config, _key: "main" } },
        { upsert: true }
    );
    return true;
}


// ─── Token Storage ────────────────────────────────────────────────────────────

async function getToken() {
    if (!db) return null;
    const doc = await db.collection("auth").findOne({ _key: "google_token" });
    return doc ? doc.token : null;
}

async function saveToken(token) {
    if (!db) return false;
    await db.collection("auth").updateOne(
        { _key: "google_token" },
        { $set: { _key: "google_token", token } },
        { upsert: true }
    );
    return true;
}


// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function close() {
    if (client) {
        await client.close();
        db = null;
        client = null;
    }
}


module.exports = {
    connect,
    getDb,
    isConnected,
    getAllTasks,
    getTaskById,
    saveTask,
    updateTask,
    deleteTask,
    deleteExpiredTasks,
    findDuplicate,
    getConfig,
    saveConfig,
    getToken,
    saveToken,
    close
};
