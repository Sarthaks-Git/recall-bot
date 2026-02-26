const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// ─── AI Availability Check ────────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY;
const AI_ENABLED = apiKey && !apiKey.includes("YOUR_") && apiKey.length > 10;

let model = null;
if (AI_ENABLED) {
    const genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    console.log("🤖 Gemini AI: enabled");
} else {
    console.log("🤖 Gemini AI: disabled (no API key). Using regex fallbacks.");
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
let requestCount = 0;
let lastResetTime = Date.now();
const MAX_RPM = 14; // Stay under 15 RPM limit
let aiDisabledThisSession = false; // Auto-disable after first network failure

function canMakeRequest() {
    if (!AI_ENABLED || aiDisabledThisSession) return false;
    const now = Date.now();
    if (now - lastResetTime > 60000) {
        requestCount = 0;
        lastResetTime = now;
    }
    return requestCount < MAX_RPM;
}

function trackRequest() {
    requestCount++;
}

// Wrap AI calls with a 10-second timeout to prevent hanging
function withTimeout(promise, ms = 10000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("AI request timed out")), ms))
    ]);
}


// ─── Classify Email ───────────────────────────────────────────────────────────
/**
 * Uses AI to classify an email as academic or recreational
 * @returns {{ category: string, isRelevant: boolean, confidence: number }}
 */
async function classifyEmail(subject, snippet, sender) {
    if (!canMakeRequest()) {
        return fallbackClassify(subject + " " + snippet);
    }

    try {
        trackRequest();
        const prompt = `You are an academic email classifier for a college student in India.

Classify this email:
- Subject: "${subject}"
- Preview: "${snippet}"
- From: "${sender || 'unknown'}"

Return ONLY a JSON object (no markdown, no backticks):
{
  "category": "assignment" | "exam" | "quiz" | "tutorial" | "lab" | "placement" | "hackathon" | "internship" | "registration" | "workshop" | "seminar" | "other",
  "isRelevant": true/false,
  "confidence": 0.0 to 1.0
}

Rules:
- isRelevant = true for: assignments, exams, quizzes, tutorials, labs, placements, hackathons, internships, registrations, workshops, seminars, deadlines, submissions, viva
- isRelevant = false for: club events, fests, cultural activities, recreational events, spam, newsletters, promotional emails
- Focus on the ACADEMIC importance`;

        const result = await withTimeout(model.generateContent(prompt));
        const text = result.response.text().trim();

        // Parse the JSON response (handle if wrapped in markdown code blocks)
        const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(jsonStr);

        return {
            category: parsed.category || "other",
            isRelevant: parsed.isRelevant !== false,
            confidence: parsed.confidence || 0.5
        };
    } catch (err) {
        if (!aiDisabledThisSession) {
            console.error("⚠️ AI unavailable (network issue?). Switching to regex for this session.");
            aiDisabledThisSession = true;
        }
        return fallbackClassify(subject + " " + snippet);
    }
}


// ─── Summarize Email ──────────────────────────────────────────────────────────
/**
 * Generate a concise 1-2 sentence summary of an email
 * @returns {string}
 */
async function summarizeEmail(subject, body) {
    if (!canMakeRequest()) {
        return subject;
    }

    try {
        trackRequest();
        const content = body ? `Subject: ${subject}\n\nBody: ${body.substring(0, 2000)}` : `Subject: ${subject}`;

        const prompt = `Summarize this college email in exactly 1-2 short sentences. Focus on: what needs to be done, the deadline, and any key details. Be concise and actionable.

${content}

Return ONLY the summary text, nothing else.`;

        const result = await withTimeout(model.generateContent(prompt));
        return result.response.text().trim();
    } catch (err) {
        if (!aiDisabledThisSession) {
            console.error("⚠️ AI unavailable (network issue?). Switching to regex for this session.");
            aiDisabledThisSession = true;
        }
        return subject;
    }
}


// ─── Extract Deadline ─────────────────────────────────────────────────────────
/**
 * Uses AI to extract a deadline date from email text
 * @returns {string|null} ISO date string or null
 */
async function extractDeadline(subject, body) {
    if (!canMakeRequest()) {
        return regexExtractDate(subject + " " + (body || ""));
    }

    try {
        trackRequest();
        const today = new Date().toISOString().split("T")[0];
        const content = body ? `Subject: ${subject}\nBody: ${body.substring(0, 1500)}` : `Subject: ${subject}`;

        const prompt = `Extract the deadline or due date from this college email. Today is ${today}.

${content}

Rules:
- If a specific date is mentioned, return it in YYYY-MM-DD format
- If "tomorrow" is mentioned, calculate the actual date
- If "next Monday/Friday" etc, calculate the actual date
- If no clear deadline exists, return "null"

Return ONLY the date (YYYY-MM-DD) or the word null. Nothing else.`;

        const result = await withTimeout(model.generateContent(prompt));
        const text = result.response.text().trim();

        if (text === "null" || !text) return regexExtractDate(subject + " " + (body || ""));

        // Validate it looks like a date
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

        return regexExtractDate(subject + " " + (body || ""));
    } catch (err) {
        if (!aiDisabledThisSession) {
            console.error("⚠️ AI unavailable (network issue?). Switching to regex for this session.");
            aiDisabledThisSession = true;
        }
        return regexExtractDate(subject + " " + (body || ""));
    }
}


// ─── Fallback Classifiers (regex-based, no AI) ───────────────────────────────

function fallbackClassify(text) {
    const lower = (text || "").toLowerCase();

    const categories = {
        assignment: ["assignment", "homework", "submit", "submission", "project"],
        exam: ["exam", "examination", "midsem", "endsem", "mid term", "term end", "tee"],
        quiz: ["quiz", "test", "mcq"],
        tutorial: ["tutorial", "class activity"],
        lab: ["lab", "laboratory", "practical", "lab activity"],
        placement: ["placement", "internship", "company", "drive", "recruit"],
        hackathon: ["hackathon", "coding", "competition"],
        registration: ["registration", "register", "apply", "form", "enroll"],
        workshop: ["workshop", "seminar", "webinar", "session"]
    };

    for (const [cat, keywords] of Object.entries(categories)) {
        for (const kw of keywords) {
            if (lower.includes(kw)) return { category: cat, isRelevant: true, confidence: 0.7 };
        }
    }

    return { category: "other", isRelevant: false, confidence: 0.3 };
}

function regexExtractDate(text) {
    if (!text) return null;
    text = text.toLowerCase();

    // Format: 15th Feb 2026
    let match = text.match(
        /(\d{1,2})(st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*(\d{4})?/i
    );
    if (match) {
        const months = {
            jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
            jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12"
        };
        return `${match[4] || new Date().getFullYear()}-${months[match[3]]}-${match[1].padStart(2, "0")}`;
    }

    // Format: Feb 15, 2026
    match = text.match(
        /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*(\d{1,2})(st|nd|rd|th)?\s*,?\s*(\d{4})?/i
    );
    if (match) {
        const months = {
            jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
            jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12"
        };
        return `${match[4] || new Date().getFullYear()}-${months[match[1]]}-${match[2].padStart(2, "0")}`;
    }

    // Format: 15/02/2026 or 15-02-2026
    match = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (match) {
        const year = match[3].length === 2 ? "20" + match[3] : match[3];
        return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    }

    return null;
}


module.exports = {
    classifyEmail,
    summarizeEmail,
    extractDeadline,
    fallbackClassify,
    regexExtractDate
};
