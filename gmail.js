const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const readline = require("readline");
const config = require("./emailconfig");
const { daysLeft } = require("./utils");
require("dotenv").config();

const { sendUrgentAlert } = require("./whatsapp");

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const TOKEN_PATH = path.join(__dirname, "token.json");
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");

// 🔒 Safety switch
const ENABLE_WHATSAPP = process.env.ENABLE_WHATSAPP !== "false";

/* ------------------ EMAIL CLASSIFICATION ------------------ */

function detectType(text = "") {
  text = text.toLowerCase();

  for (const [category, keywords] of Object.entries(config.CATEGORIES)) {
    for (const word of keywords) {
      if (text.includes(word)) return category;
    }
  }
  return "other";
}

/* ------------------ DATE EXTRACTION ------------------ */

function extractDate(text) {
  if (!text) return null;
  text = text.toLowerCase();

  let match = text.match(
    /(\d{1,2})(st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*(\d{4})?/i
  );

  if (match) {
    const months = {
      jan: "01", feb: "02", mar: "03", apr: "04",
      may: "05", jun: "06", jul: "07", aug: "08",
      sep: "09", sept: "09", oct: "10", nov: "11", dec: "12"
    };
    const day = match[1].padStart(2, "0");
    const month = months[match[3]];
    const year = match[4] || new Date().getFullYear();
    return `${year}-${month}-${day}`;
  }

  match = text.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*(\d{1,2})(st|nd|rd|th)?\s*(\d{4})?/i
  );

  if (match) {
    const months = {
      jan: "01", feb: "02", mar: "03", apr: "04",
      may: "05", jun: "06", jul: "07", aug: "08",
      sep: "09", sept: "09", oct: "10", nov: "11", dec: "12"
    };
    const day = match[2].padStart(2, "0");
    const month = months[match[1]];
    const year = match[4] || new Date().getFullYear();
    return `${year}-${month}-${day}`;
  }

  match = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3].length === 2 ? "20" + match[3] : match[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

/* ------------------ TASK STORAGE ------------------ */

function saveTask(task) {
  const file = path.join(__dirname, "tasks.json");
  let tasks = [];

  if (fs.existsSync(file)) {
    tasks = JSON.parse(fs.readFileSync(file, "utf8"));
  }

  const exists = tasks.some(
    t => t.title === task.title && t.due === task.due
  );

  if (!exists) {
    tasks.push(task);
    fs.writeFileSync(file, JSON.stringify(tasks, null, 2));
    console.log("✅ Task saved:", task.title);
  } else {
    console.log("⚠️ Duplicate task skipped:", task.title);
  }
}

/* ------------------ GMAIL AUTH ------------------ */

function authorize(callback) {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    callback(oAuth2Client);
  } else {
    getNewToken(oAuth2Client, callback);
  }
}

function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES
  });

  console.log("Authorize this app by visiting:\n", authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question("Enter the code: ", code => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error(err);
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
      callback(oAuth2Client);
    });
  });
}

/* ------------------ MAIN EMAIL LOOP ------------------ */

function listEmails(auth) {
  const gmail = google.gmail({ version: "v1", auth });

  gmail.users.messages.list(
    {
      userId: "me",
      q: config.SEARCH_QUERY.join(" OR "),
      maxResults: config.MAX_EMAILS
    },
    async (err, res) => {
      if (err) return console.error("API error:", err);

      const messages = res.data.messages || [];
      console.log(`📬 Found ${messages.length} emails\n`);

      for (const msg of messages) {
        const data = await gmail.users.messages.get({
          userId: "me",
          id: msg.id
        });

        const headers = data.data.payload.headers;
        const subject = headers.find(h => h.name === "Subject")?.value || "";
        const snippet = data.data.snippet || "";

        const due = extractDate(subject) || extractDate(snippet);
        const type = detectType(subject);

        if (!due) continue;

        saveTask({ type, title: subject, due });

        if (ENABLE_WHATSAPP && daysLeft(due) <= config.PRIORITY_RULES.urgent) {
          console.log("📞 Sending urgent WhatsApp to:", process.env.TO_PHONE_NUMBER);

          await sendUrgentAlert({
            phone: process.env.TO_PHONE_NUMBER,
            category: type,
            task: subject,
            due
          });
        }

        console.log("📌", type, "|", subject, "| Due:", due);
      }
    }
  );
}

try {
  authorize(listEmails);
} catch (err) {
  console.error("❌ Failed to start RecallBot:", err.message);
  process.exit(1);
}
