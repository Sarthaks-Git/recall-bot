/* ═══════════════════════════════════════════════════════════════════
   RecallBot v2 — Dashboard Application Logic
   ═══════════════════════════════════════════════════════════════════ */

// ─── State ────────────────────────────────────────────────────────────────────
let currentTab = "dashboard";
let allTasks = [];
let currentConfig = {};
let activeFilters = { status: "pending", type: null };
let pollInterval = null;


// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();
    loadDashboard();
    updateGreeting();
    checkAuthStatus();
    checkUrlParams();

    // Auto-refresh every 30 seconds
    pollInterval = setInterval(loadDashboard, 30000);
});


// ─── Navigation ───────────────────────────────────────────────────────────────

function setupNavigation() {
    document.querySelectorAll(".nav-item").forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.getAttribute("data-tab");
            switchTab(tab);
        });
    });
}

function switchTab(tab) {
    currentTab = tab;

    // Update nav
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    const navBtn = document.querySelector(`[data-tab="${tab}"]`);
    if (navBtn) navBtn.classList.add("active");

    // Update content
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    const tabContent = document.getElementById(`tab-${tab}`);
    if (tabContent) tabContent.classList.add("active");

    // Load tab-specific data
    if (tab === "tasks") renderAllTasks();
    if (tab === "settings") loadSettings();
}

function updateGreeting() {
    const hour = new Date().getHours();
    let greeting;
    if (hour < 12) greeting = "Good morning! ☀️";
    else if (hour < 17) greeting = "Good afternoon! 🌤️";
    else greeting = "Good evening! 🌙";

    const el = document.getElementById("greeting");
    if (el) el.textContent = `${greeting} Here's your academic overview.`;
}

async function checkAuthStatus() {
    try {
        const res = await fetch("/api/auth/status");
        const data = await res.json();
        const banner = document.getElementById("auth-banner");
        const btn = document.getElementById("btn-auth");

        if (!data.authorized && banner) {
            banner.style.display = "block";
            if (data.authUrl) btn.href = data.authUrl;
        } else if (banner) {
            banner.style.display = "none";
        }
    } catch (err) {
        console.error("Auth status check failed:", err);
    }
}

function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success") {
        showToast("✅ Google account connected successfully!", "success");
        window.history.replaceState({}, document.title, "/");
        checkAuthStatus();
    } else if (params.get("auth") === "error") {
        showToast("❌ Failed to connect Google account.", "error");
        window.history.replaceState({}, document.title, "/");
    }
}


// ─── Data Loading ─────────────────────────────────────────────────────────────

async function loadDashboard() {
    try {
        const [tasksRes, statsRes, scanRes] = await Promise.all([
            fetch("/api/tasks"),
            fetch("/api/stats"),
            fetch("/api/scan/status")
        ]);

        allTasks = await tasksRes.json();
        const stats = await statsRes.json();
        const scan = await scanRes.json();

        renderStats(stats);
        renderUrgentTasks();
        renderCategories(stats);
        updateScanStatus(scan);
        updateBadge();
    } catch (err) {
        console.error("Failed to load dashboard:", err);
    }
}


// ─── Stats Rendering ──────────────────────────────────────────────────────────

function renderStats(stats) {
    animateValue("stat-urgent", stats.urgent);
    animateValue("stat-today", stats.dueToday);
    animateValue("stat-week", stats.dueThisWeek);
    animateValue("stat-pending", stats.pending);
    animateValue("stat-done", stats.done);
    animateValue("stat-overdue", stats.overdue);
}

function animateValue(id, target) {
    const el = document.getElementById(id);
    if (!el) return;

    const current = parseInt(el.textContent) || 0;
    if (current === target) return;

    // Animate number change
    const diff = target - current;
    const steps = Math.min(Math.abs(diff), 20);
    const stepTime = 300 / steps;
    let step = 0;

    const timer = setInterval(() => {
        step++;
        el.textContent = Math.round(current + (diff * step / steps));
        if (step >= steps) {
            el.textContent = target;
            clearInterval(timer);
        }
    }, stepTime);
}

function updateBadge() {
    const pending = allTasks.filter(t => t.status === "pending").length;
    const badge = document.getElementById("task-badge");
    if (badge) {
        badge.textContent = pending;
        badge.style.display = pending > 0 ? "inline-block" : "none";
    }
}


// ─── Task Rendering ───────────────────────────────────────────────────────────

function renderUrgentTasks() {
    const container = document.getElementById("urgent-tasks");
    const urgent = allTasks.filter(t =>
        t.status === "pending" && (t.daysLeft >= 0 && t.daysLeft <= 2)
    ).slice(0, 5);

    if (urgent.length === 0) {
        container.innerHTML = '<div class="empty-state">No urgent tasks — you\'re all caught up! 🎉</div>';
        return;
    }

    container.innerHTML = urgent.map(t => createTaskHTML(t, false)).join("");
}

function renderAllTasks() {
    const container = document.getElementById("all-tasks");
    let tasks = [...allTasks];

    // Always hide expired tasks
    tasks = tasks.filter(t => t.status !== "expired");

    // Apply filters
    if (activeFilters.status !== "all") {
        tasks = tasks.filter(t => t.status === activeFilters.status);
    }
    if (activeFilters.type) {
        tasks = tasks.filter(t => t.type === activeFilters.type);
    }

    // Apply search
    const search = document.getElementById("task-search")?.value?.toLowerCase();
    if (search) {
        tasks = tasks.filter(t =>
            t.title.toLowerCase().includes(search) ||
            (t.summary && t.summary.toLowerCase().includes(search))
        );
    }

    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No tasks match your filters. Try a different search or click "Scan Emails".</div>';
        return;
    }

    container.innerHTML = tasks.map(t => createTaskHTML(t, true)).join("");
}

function createTaskHTML(task, showActions) {
    const daysText = getDaysText(task.daysLeft);
    const dueClass = task.daysLeft < 0 ? "due-urgent" : task.daysLeft <= 1 ? "due-soon" : task.daysLeft <= 3 ? "due-soon" : "due-ok";
    const priorityIcon = task.priority === "urgent" ? "🔴" : task.priority === "important" ? "🟡" : task.daysLeft < 0 ? "🔴" : "🟢";
    const tagClass = `tag-${task.type || "other"}`;
    const sourceIcon = task.source === "classroom" ? "📚" : "📧";

    const titleHTML = task.link
        ? `<a href="${escapeHTML(task.link)}" target="_blank" rel="noopener" class="task-title task-link">${escapeHTML(task.title)}</a>`
        : `<div class="task-title">${escapeHTML(task.title)}</div>`;

    const actions = showActions ? `
    <div class="task-actions">
      ${task.status === "pending" ? `
        <button class="task-action-btn done-btn" onclick="markTaskDone('${task.id}')">✅ Done</button>
      ` : `
        <button class="task-action-btn" onclick="markTaskPending('${task.id}')">↩️ Undo</button>
      `}
      <button class="task-action-btn delete-btn" onclick="deleteTask('${task.id}')">🗑️</button>
    </div>
  ` : "";

    return `
    <div class="task-item ${task.status === 'done' ? 'done' : ''}">
      <div class="task-priority">${priorityIcon}</div>
      <div class="task-body">
        ${titleHTML}
        ${task.summary ? `<div class="task-summary">${escapeHTML(task.summary)}</div>` : ""}
        <div class="task-meta">
          <span class="task-tag ${tagClass}">${task.type || "other"}</span>
          <span class="task-due ${dueClass}">📅 ${task.due} (${daysText})</span>
          <span class="task-source">${sourceIcon} ${task.source || "gmail"}</span>
        </div>
      </div>
      ${actions}
    </div>
  `;
}

function getDaysText(days) {
    if (days < -1) return `${Math.abs(days)} days OVERDUE`;
    if (days === -1) return "1 day OVERDUE";
    if (days === 0) return "TODAY";
    if (days === 1) return "Tomorrow";
    return `${days} days left`;
}


// ─── Category Chart ───────────────────────────────────────────────────────────

function renderCategories(stats) {
    const container = document.getElementById("category-bars");
    const types = stats.byType;
    const total = Object.values(types).reduce((a, b) => a + b, 0) || 1;

    const colors = {
        assignment: "var(--blue)",
        exam: "var(--red)",
        quiz: "var(--orange)",
        lab: "var(--green)",
        placement: "var(--accent-light)",
        other: "var(--text-muted)"
    };

    const icons = {
        assignment: "📝",
        exam: "📖",
        quiz: "❓",
        lab: "🔬",
        placement: "💼",
        other: "📌"
    };

    container.innerHTML = Object.entries(types).map(([type, count]) => `
    <div class="category-bar">
      <span class="category-bar-label">${icons[type] || "📌"} ${type}</span>
      <div class="category-bar-track">
        <div class="category-bar-fill" style="width: ${(count / total) * 100}%; background: ${colors[type] || 'var(--text-muted)'}"></div>
      </div>
      <span class="category-bar-count">${count}</span>
    </div>
  `).join("");
}


// ─── Filters ──────────────────────────────────────────────────────────────────

function setFilter(filterType, value, btn) {
    if (filterType === "status") {
        activeFilters.status = value;
        activeFilters.type = null;
        // Update chips
        document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
    } else if (filterType === "type") {
        if (activeFilters.type === value) {
            activeFilters.type = null;
            btn.classList.remove("active");
        } else {
            document.querySelectorAll(`.filter-chip[data-filter="${activeFilters.type}"]`).forEach(c => c.classList.remove("active"));
            activeFilters.type = value;
            btn.classList.add("active");
        }
    }
    renderAllTasks();
}

function filterTasks() {
    renderAllTasks();
}


// ─── Task Actions ─────────────────────────────────────────────────────────────

async function markTaskDone(id) {
    try {
        await fetch(`/api/tasks/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "done" })
        });
        showToast("✅ Task marked as done!", "success");
        await loadDashboard();
        if (currentTab === "tasks") renderAllTasks();
    } catch (err) {
        showToast("Failed to update task", "error");
    }
}

async function markTaskPending(id) {
    try {
        await fetch(`/api/tasks/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "pending" })
        });
        showToast("↩️ Task marked as pending", "info");
        await loadDashboard();
        if (currentTab === "tasks") renderAllTasks();
    } catch (err) {
        showToast("Failed to update task", "error");
    }
}

async function deleteTask(id) {
    if (!confirm("Delete this task permanently?")) return;

    try {
        await fetch(`/api/tasks/${id}`, { method: "DELETE" });
        showToast("🗑️ Task deleted", "info");
        await loadDashboard();
        if (currentTab === "tasks") renderAllTasks();
    } catch (err) {
        showToast("Failed to delete task", "error");
    }
}


// ─── Scan ─────────────────────────────────────────────────────────────────────

async function triggerScan() {
    const btn = document.getElementById("btn-scan");
    btn.classList.add("scanning");
    btn.querySelector("span:last-child").textContent = "Scanning...";
    showToast("🔍 Scan started! This may take a moment...", "info");

    try {
        await fetch("/api/scan", { method: "POST" });

        // Poll for completion
        const poll = setInterval(async () => {
            const res = await fetch("/api/scan/status");
            const data = await res.json();

            if (!data.isScanning) {
                clearInterval(poll);
                btn.classList.remove("scanning");
                btn.querySelector("span:last-child").textContent = "Scan Now";
                showToast(`✅ Scan complete! ${data.lastScanResults} new tasks found.`, "success");
                await loadDashboard();
                if (currentTab === "tasks") renderAllTasks();
            }
        }, 2000);

    } catch (err) {
        btn.classList.remove("scanning");
        btn.querySelector("span:last-child").textContent = "Scan Now";
        showToast("❌ Scan failed. Check console.", "error");
    }
}

function updateScanStatus(scan) {
    const el = document.getElementById("scan-status");
    if (scan.lastScanTime) {
        const time = new Date(scan.lastScanTime);
        el.textContent = `Last scan: ${time.toLocaleTimeString()}`;
    } else {
        el.textContent = "Last scan: Never";
    }
}


// ─── Digest ───────────────────────────────────────────────────────────────────

async function sendDigest(time) {
    showToast(`📱 Sending ${time} digest...`, "info");
    try {
        const res = await fetch(`/api/digest/${time}`, { method: "POST" });
        const data = await res.json();
        if (data.success) {
            showToast("✅ Digest sent to WhatsApp!", "success");
        } else {
            showToast("⚠️ " + (data.error || "Failed"), "error");
        }
    } catch (err) {
        showToast("❌ Failed to send digest", "error");
    }
}


// ─── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
    try {
        const res = await fetch("/api/config");
        currentConfig = await res.json();
        populateSettings(currentConfig);
    } catch (err) {
        showToast("Failed to load settings", "error");
    }
}

function populateSettings(config) {
    document.getElementById("whitelist-keywords").value = (config.whitelist?.keywords || []).join("\n");
    document.getElementById("blacklist-keywords").value = (config.blacklist?.keywords || []).join("\n");
    document.getElementById("whitelist-senders").value = (config.whitelist?.senders || []).join("\n");
    document.getElementById("blacklist-senders").value = (config.blacklist?.senders || []).join("\n");

    document.getElementById("morning-time").value = config.reminders?.morning || "07:00";
    document.getElementById("evening-time").value = config.reminders?.evening || "21:00";
    document.getElementById("reminders-enabled").checked = config.reminders?.enabled !== false;

    document.getElementById("max-emails").value = config.scanning?.maxEmails || 25;
    document.getElementById("scan-interval").value = config.scanning?.scanIntervalMinutes || 60;
    document.getElementById("source-gmail").checked = (config.scanning?.sources || []).includes("gmail");
    document.getElementById("source-classroom").checked = (config.scanning?.sources || []).includes("classroom");

    document.getElementById("priority-urgent").value = config.priority?.urgent || 1;
    document.getElementById("priority-important").value = config.priority?.important || 3;
    document.getElementById("priority-normal").value = config.priority?.normal || 7;

    document.getElementById("whatsapp-enabled").checked = config.whatsapp?.enabled !== false;
    document.getElementById("command-prefix").value = config.whatsapp?.commandPrefix || "!";
}

async function saveSettings() {
    const parseTextarea = (id) => document.getElementById(id).value
        .split("\n")
        .map(s => s.trim())
        .filter(s => s.length > 0);

    const sources = [];
    if (document.getElementById("source-gmail").checked) sources.push("gmail");
    if (document.getElementById("source-classroom").checked) sources.push("classroom");

    const config = {
        scanning: {
            maxEmails: parseInt(document.getElementById("max-emails").value),
            scanIntervalMinutes: parseInt(document.getElementById("scan-interval").value),
            sources
        },
        whitelist: {
            keywords: parseTextarea("whitelist-keywords"),
            senders: parseTextarea("whitelist-senders")
        },
        blacklist: {
            keywords: parseTextarea("blacklist-keywords"),
            senders: parseTextarea("blacklist-senders")
        },
        reminders: {
            morning: document.getElementById("morning-time").value,
            evening: document.getElementById("evening-time").value,
            enabled: document.getElementById("reminders-enabled").checked
        },
        priority: {
            urgent: parseInt(document.getElementById("priority-urgent").value),
            important: parseInt(document.getElementById("priority-important").value),
            normal: parseInt(document.getElementById("priority-normal").value)
        },
        whatsapp: {
            enabled: document.getElementById("whatsapp-enabled").checked,
            commandPrefix: document.getElementById("command-prefix").value || "!"
        }
    };

    try {
        const res = await fetch("/api/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config)
        });

        const data = await res.json();
        if (data.success) {
            showToast("💾 Settings saved successfully!", "success");
            currentConfig = config;
        } else {
            showToast("❌ Failed to save settings", "error");
        }
    } catch (err) {
        showToast("❌ Failed to save settings", "error");
    }
}


// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}


// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
