# 🔍 RecallBot

**Personal Academic Deadline Tracker** — Scans your Gmail inbox for assignment, exam, and placement emails, extracts deadlines, and sends you WhatsApp alerts so you never miss a due date.

> **Gmail → Parse Dates → Store Tasks → WhatsApp Alerts**

---

## ✨ Features

- 📧 **Gmail Scanning** — Fetches relevant academic emails using keyword-based search
- 📅 **Smart Date Extraction** — Regex-based parser supporting 3 date formats (`15th Feb 2026`, `Feb 15, 2026`, `15/02/2026`)
- 🏷️ **Auto-Classification** — Categorizes tasks as `assignment`, `exam`, `registration`, `placement`, or `other`
- 🚨 **Urgent Alerts** — Sends WhatsApp notifications when deadlines are ≤ 1 day away
- 📊 **Daily Summary** — Cron job at 8 AM sends a categorized task summary via WhatsApp
- ⏰ **Nudge Reminders** — Morning (7 AM) and evening (9 PM) WhatsApp check-in nudges
- 🧹 **Deduplication** — Automatically skips already-saved tasks

---

## 🏗️ Architecture

```
Gmail API
   ↓
gmail.js ← emailconfig.js (search rules) ← utils.js (date utils)
   ↓
tasks.json (flat-file DB)
   ↓
whatsapp.js → Meta/WhatsApp Cloud API
   ↓
reminder.js (cron nudges) + summary.js (daily summary)
```

---

## 📁 Project Structure

| File | Purpose |
|------|---------|
| `gmail.js` | **Core engine** — Gmail fetch, parse, classify, save, alert |
| `whatsapp.js` | WhatsApp Cloud API wrapper (3 message templates) |
| `emailconfig.js` | Search keywords, categories, priority rules |
| `reminder.js` | Cron-based morning & evening nudge reminders |
| `summary.js` | Cron-based daily deadline summary sender |
| `utils.js` | Date utility functions (`daysLeft`, `daysBetween`) |
| `sendMessage.js` | Manual WhatsApp test script |
| `tasks.json` | Flat-file task database |
| `generate-report.js` | PDF analysis report generator |

---

## 🚀 Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- Google Cloud project with Gmail API enabled
- Meta WhatsApp Business API account with approved templates

### 1. Clone & Install

```bash
git clone https://github.com/<your-username>/recall-bot.git
cd recall-bot
npm install
```

### 2. Configure Environment

Create a `.env` file:

```env
WHATSAPP_TOKEN="your_whatsapp_cloud_api_token"
PHONE_NUMBER_ID="your_whatsapp_phone_number_id"
TO_PHONE_NUMBER="recipient_phone_with_country_code"
ENABLE_WHATSAPP=true
```

### 3. Gmail API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable the **Gmail API**
3. Create OAuth 2.0 credentials (Desktop app)
4. Download `credentials.json` and place it in the project root
5. On first run, authorize the app and a `token.json` will be generated

### 4. WhatsApp Templates

Ensure these templates are approved in your Meta Business Manager:
- `urgent_deadline_alert` (params: category, task, due)
- `daily_deadline_summary` (params: today, upcoming, urgent)
- `daily_nudge_reminder` (params: message)

---

## 📦 Usage

```bash
# Scan Gmail and extract deadlines (main entry point)
npm start          # or: node gmail.js

# Start daily summary cron (runs at 8 AM)
npm run summary    # or: node summary.js

# Start nudge reminders (7 AM & 9 PM)
npm run reminder   # or: node reminder.js
```

> **Note:** `summary.js` and `reminder.js` are standalone cron processes — they must be run separately and kept alive (e.g., using PM2 or screen).

---

## 🛡️ Security

> ⚠️ **Never commit secrets to git.**

The `.gitignore` protects:
- `.env` — API tokens & phone numbers
- `credentials.json` — Google OAuth client secret
- `token.json` — Gmail refresh token

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (CommonJS) |
| Email | Google Gmail API v1 via `googleapis` |
| Messaging | Meta WhatsApp Cloud API v18.0 via `axios` |
| Scheduling | `node-cron` |
| Storage | Flat JSON file |
| Secrets | `dotenv` |

---

## 📋 Roadmap

- [ ] Unified entry point (`index.js`) for all processes
- [ ] Track processed emails by Gmail message ID
- [ ] Task status management (pending/done/dismissed)
- [ ] Auto-archive expired tasks
- [ ] Replace JSON storage with SQLite
- [ ] Web dashboard for task viewing
- [ ] Full email body parsing with NLP
- [ ] Test suite (Jest)
- [ ] Docker deployment
- [ ] Google Calendar integration

---

## 📝 License

ISC
