const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");

// Default config (used if config.json doesn't exist)
const DEFAULT_CONFIG = {
    scanning: {
        maxEmails: 25,
        scanIntervalMinutes: 60,
        sources: ["gmail", "classroom"]
    },
    whitelist: {
        keywords: [
            "assignment", "quiz", "tutorial", "lab", "lab activity",
            "class activity", "examination", "mid term", "midterm",
            "term end", "tee", "internship", "placement", "hackathon",
            "project", "submission", "deadline", "viva", "seminar",
            "workshop", "registration", "endsem", "midsem"
        ],
        senders: []
    },
    blacklist: {
        keywords: [
            "club", "fest", "cultural", "sports day", "recreational",
            "dance", "music", "drama", "photography", "literary",
            "annual day", "farewell", "freshers", "prom", "carnival",
            "concert", "open mic", "standup", "comedy night"
        ],
        senders: []
    },
    reminders: {
        morning: "07:00",
        evening: "21:00",
        enabled: true
    },
    priority: {
        urgent: 1,
        important: 3,
        normal: 7
    },
    whatsapp: {
        enabled: true,
        commandPrefix: "!"
    }
};

/**
 * Load config from config.json (creates with defaults if missing)
 */
function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
            return { ...DEFAULT_CONFIG };
        }
        const raw = fs.readFileSync(CONFIG_PATH, "utf8");
        return JSON.parse(raw);
    } catch (err) {
        console.error("⚠️ Failed to load config, using defaults:", err.message);
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * Save config to config.json
 */
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        return true;
    } catch (err) {
        console.error("❌ Failed to save config:", err.message);
        return false;
    }
}

/**
 * Check if text matches any blacklist keywords
 */
function isBlacklisted(text, sender, config) {
    const lower = text.toLowerCase();
    const cfg = config || loadConfig();

    // Check blacklist keywords
    for (const kw of cfg.blacklist.keywords) {
        if (lower.includes(kw.toLowerCase())) return true;
    }

    // Check blacklisted senders
    if (sender) {
        for (const s of cfg.blacklist.senders) {
            if (sender.toLowerCase().includes(s.toLowerCase())) return true;
        }
    }

    return false;
}

/**
 * Check if text matches whitelist keywords or sender
 */
function isWhitelisted(text, sender, config) {
    const lower = text.toLowerCase();
    const cfg = config || loadConfig();

    // Check whitelist keywords
    for (const kw of cfg.whitelist.keywords) {
        if (lower.includes(kw.toLowerCase())) return true;
    }

    // Check whitelisted senders
    if (sender) {
        for (const s of cfg.whitelist.senders) {
            if (sender.toLowerCase().includes(s.toLowerCase())) return true;
        }
    }

    return false;
}

/**
 * Get priority level based on days left
 */
function getPriority(daysRemaining, config) {
    const cfg = config || loadConfig();
    if (daysRemaining <= cfg.priority.urgent) return "urgent";
    if (daysRemaining <= cfg.priority.important) return "important";
    if (daysRemaining <= cfg.priority.normal) return "normal";
    return "low";
}

module.exports = {
    loadConfig,
    saveConfig,
    isBlacklisted,
    isWhitelisted,
    getPriority,
    DEFAULT_CONFIG,
    CONFIG_PATH
};
