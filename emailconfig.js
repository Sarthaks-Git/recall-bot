module.exports = {
  // 1️⃣ How many emails to read each run
  MAX_EMAILS: 10,

  // 2️⃣ Gmail search keywords (Gmail query syntax)
  SEARCH_QUERY: [
    "assignment",
    "exam",
    "quiz",
    "deadline",
    "registration",
    "placement",
    "internship"
  ],

  // 3️⃣ Categorization rules
  CATEGORIES: {
    assignment: ["assignment", "homework", "submit"],
    exam: ["exam", "quiz", "test", "midsem", "endsem"],
    registration: ["registration", "register", "apply", "form"],
    placement: ["placement", "internship", "company", "drive"]
  },

  // 4️⃣ Priority rules (days left → priority)
  PRIORITY_RULES: {
    urgent: 1,      // due today / tomorrow
    important: 3,   // due in 2–3 days
    normal: 7       // due within a week
  }
};
