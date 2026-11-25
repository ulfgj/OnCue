// OnCue — Stay in flow. Step in on cue. (Ephemeral Daily Slate)
let alarms = [];
let audioCtx = null;
let chimeInterval = null;
let activeTriggerAlarm = null;
let currentView = localStorage.getItem("oncue_view") || "grid";
let lastKnownDay = new Date().getDate();
const triggeredAlarmIdsThisMinute = new Set();

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initViewSwitcher();
  fetchAlarms();
  setInterval(tick, 1000);

  document.getElementById("openAddModalBtn").addEventListener("click", () => {
    openAlarmModal();
  });
});

// View Switcher (Grid vs. Table)
function initViewSwitcher() {
  switchView(currentView, false);
}

function switchView(view, save = true) {
  currentView = view;
  if (save) {
    localStorage.setItem("oncue_view", view);
  }

  const gridBtn = document.getElementById("viewGridBtn");
  const tableBtn = document.getElementById("viewTableBtn");
  const gridContainer = document.getElementById("alarmsList");
  const tableContainer = document.getElementById("alarmsTableContainer");

  if (view === "table") {
    if (gridBtn) gridBtn.classList.remove("active");
    if (tableBtn) tableBtn.classList.add("active");
    if (gridContainer) gridContainer.style.display = "none";
    if (tableContainer) tableContainer.style.display = "block";
  } else {
    if (tableBtn) tableBtn.classList.remove("active");
    if (gridBtn) gridBtn.classList.add("active");
    if (tableContainer) tableContainer.style.display = "none";
    if (gridContainer) gridContainer.style.display = "grid";
  }

  renderAlarms();
}

// Digital Clock in Header & Midnight Date Flip Detection
function initClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const digitalTimeEl = document.getElementById("digitalTime");
  const digitalDateEl = document.getElementById("digitalDate");
  if (digitalTimeEl) digitalTimeEl.textContent = timeStr;
  if (digitalDateEl) digitalDateEl.textContent = dateStr;

  // Detect midnight boundary (new calendar day)
  if (now.getDate() !== lastKnownDay) {
    lastKnownDay = now.getDate();
    triggeredAlarmIdsThisMinute.clear();
    // Fresh slate for the new day
    renderAlarms();
  }
}

// Fetch Cues from Backend
async function fetchAlarms() {
  try {
    const res = await fetch("/api/alarms");
    if (!res.ok) throw new Error("Failed to load cues");
    const data = await res.json();
    alarms = data.alarms || [];
    renderAlarms();
  } catch (err) {
    console.error("Error fetching cues:", err);
  }
}

// Calculate Today-Bound Time Diff (Strictly for Today)
function getTodayCueStatus(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  const diffMs = target - now;

  if (diffMs <= 0) {
    return { isPassed: true, diffMs, target };
  }
  return { isPassed: false, diffMs, target };
}

// Format Milliseconds into "00h 00m 00s"
function formatCountdown(diffMs) {
  if (diffMs <= 0) return "Passed";

  const totalSecs = Math.floor(diffMs / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`;
}

// Tick function running every second
function tick() {
  const now = new Date();

  // Clear triggered set once minute changes
  if (now.getSeconds() === 0) {
    triggeredAlarmIdsThisMinute.clear();
  }

  // Check if any cue should trigger today
  alarms.forEach((alarm) => {
    if (!alarm.is_enabled) return;

    const [aHours, aMins] = alarm.time.split(":").map(Number);
    if (
      now.getHours() === aHours &&
      now.getMinutes() === aMins &&
      now.getSeconds() === 0 &&
      !triggeredAlarmIdsThisMinute.has(alarm.id)
    ) {
      triggeredAlarmIdsThisMinute.add(alarm.id);
      triggerAlarm(alarm);
    }
  });

  // Re-render countdowns and maintain closest-first sorted order
  renderAlarms();
}

// Render and Dynamic Ephemeral Sort:
// 1. Upcoming active cues (closest first)
// 2. Inactive cues
// 3. Passed cues from earlier today
function renderAlarms() {
  const grid = document.getElementById("alarmsList");
  const tableContainer = document.getElementById("alarmsTableContainer");
  const tableBody = document.getElementById("alarmsTableBody");
  const emptyState = document.getElementById("emptyState");
  const activeCountBadge = document.getElementById("activeCountBadge");
  const dangerZone = document.getElementById("dangerZone");

  if (!grid || !tableBody) return;

  const activeCues = alarms.filter(a => a.is_enabled);
  if (activeCountBadge) {
    activeCountBadge.textContent = `${activeCues.length} active today`;
  }

  if (dangerZone) {
    dangerZone.style.display = alarms.length > 0 ? "block" : "none";
  }

  if (alarms.length === 0) {
    grid.innerHTML = "";
    tableBody.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    if (tableContainer) tableContainer.style.display = "none";
    if (grid) grid.style.display = "none";
    return;
  } else {
    if (emptyState) emptyState.style.display = "none";
    if (currentView === "table") {
      if (tableContainer) tableContainer.style.display = "block";
      if (grid) grid.style.display = "none";
    } else {
      if (grid) grid.style.display = "grid";
      if (tableContainer) tableContainer.style.display = "none";
    }
  }

  // Calculate status for each cue strictly today
  const enriched = alarms.map((alarm) => {
    if (!alarm.is_enabled) {
      return { ...alarm, isPassed: false, diffMs: Infinity, sortGroup: 2, statusText: "Paused" };
    }

    const { isPassed, diffMs } = getTodayCueStatus(alarm.time);

    if (isPassed) {
      return {
        ...alarm,
        isPassed: true,
        diffMs,
        sortGroup: 3,
        statusText: "Passed today",
      };
    }

    return {
      ...alarm,
      isPassed: false,
      diffMs,
      sortGroup: 1,
      statusText: formatCountdown(diffMs),
    };
  });

  // Sort groups:
  // Group 1: Upcoming active (ascending by remaining diffMs)
  // Group 2: Paused/Inactive
  // Group 3: Passed today (descending, so most recently passed is at top of passed group)
  enriched.sort((a, b) => {
    if (a.sortGroup !== b.sortGroup) {
      return a.sortGroup - b.sortGroup;
    }
    if (a.sortGroup === 1) {
      return a.diffMs - b.diffMs;
    }
    if (a.sortGroup === 3) {
      return b.diffMs - a.diffMs;
    }
    return 0;
  });

  // Identify next upcoming cue
  const nextCue = enriched.find(a => a.sortGroup === 1);
  const closestId = nextCue ? nextCue.id : null;

  // 1. Render Grid View
  grid.innerHTML = enriched
    .map((alarm) => {
      const isClosest = alarm.id === closestId;
      const isImminent = alarm.sortGroup === 1 && alarm.diffMs < 5 * 60 * 1000; // < 5 mins
      const isPassed = alarm.sortGroup === 3;
      const hasNotes = alarm.notes && alarm.notes.trim().length > 0;

      return `
        <div class="alarm-card ${isClosest ? 'closest' : ''} ${!alarm.is_enabled ? 'disabled' : ''} ${isPassed ? 'passed' : ''}" data-id="${alarm.id}">
          ${isClosest ? '<span class="closest-ribbon">⭐ Next on Cue</span>' : ''}
          ${isPassed ? '<span class="passed-ribbon">✓ Completed Today</span>' : ''}
          <div class="alarm-header">
            <div class="alarm-time-wrapper">
              <span class="alarm-time">${escapeHtml(alarm.time)}</span>
              <span class="alarm-title">${escapeHtml(alarm.title || "Cue")}</span>
            </div>
            ${isPassed ? '' : `
            <label class="switch" title="Toggle Cue Active">
              <input type="checkbox" ${alarm.is_enabled ? "checked" : ""} onchange="handleToggleAlarm(${alarm.id})">
              <span class="slider"></span>
            </label>
            `}
          </div>

          <div class="countdown-box">
            <span class="countdown-label">${isPassed ? 'Status' : (alarm.is_enabled ? 'Time to Cue' : 'Status')}</span>
            <span class="countdown-val ${isImminent ? 'imminent' : ''} ${isPassed ? 'passed-val' : ''}">
              ${alarm.statusText}
            </span>
          </div>

          <div class="alarm-notes ${!hasNotes ? 'empty' : ''}">${hasNotes ? escapeHtml(alarm.notes) : 'No context brief provided.'}</div>

          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="openAlarmModal(${alarm.id})">✏️ Edit</button>
            <button class="btn btn-danger-outline btn-sm" onclick="handleDeleteAlarm(${alarm.id})">🗑️ Delete</button>
          </div>
        </div>
      `;
    })
    .join("");

  // 2. Render Table View
  tableBody.innerHTML = enriched
    .map((alarm) => {
      const isClosest = alarm.id === closestId;
      const isImminent = alarm.sortGroup === 1 && alarm.diffMs < 5 * 60 * 1000;
      const isPassed = alarm.sortGroup === 3;
      const hasNotes = alarm.notes && alarm.notes.trim().length > 0;

      let statusBadge = '<span class="badge badge-info">Active</span>';
      if (isClosest) {
        statusBadge = '<span class="closest-ribbon" style="margin-bottom: 0;">⭐ Next</span>';
      } else if (isPassed) {
        statusBadge = '<span class="passed-ribbon" style="margin-bottom: 0;">✓ Done</span>';
      } else if (!alarm.is_enabled) {
        statusBadge = '<span class="badge" style="background:#334155; color:#94a3b8;">Paused</span>';
      }

      return `
        <tr class="${isClosest ? 'row-closest' : ''} ${isPassed ? 'row-passed' : ''}" data-id="${alarm.id}">
          <td class="td-status">${statusBadge}</td>
          <td class="td-time">${escapeHtml(alarm.time)}</td>
          <td class="td-cue">
            <div class="cue-row-title">${escapeHtml(alarm.title || "Cue")}</div>
            ${hasNotes ? `<div class="cue-row-notes" title="${escapeHtml(alarm.notes)}">${escapeHtml(alarm.notes)}</div>` : '<div class="cue-row-notes" style="font-style: italic;">No context brief</div>'}
          </td>
          <td class="td-countdown">
            <span class="countdown-val ${isImminent ? 'imminent' : ''} ${isPassed ? 'passed-val' : ''}">
              ${alarm.statusText}
            </span>
          </td>
          <td class="td-toggle">
            ${isPassed ? '<span class="passed-mark" title="Passed for today">✓</span>' : `
            <label class="switch" title="Toggle Cue Active">
              <input type="checkbox" ${alarm.is_enabled ? "checked" : ""} onchange="handleToggleAlarm(${alarm.id})">
              <span class="slider"></span>
            </label>
            `}
          </td>
          <td class="td-actions">
            <div class="card-actions">
              <button class="btn btn-secondary btn-sm" onclick="openAlarmModal(${alarm.id})" title="Edit Cue">✏️</button>
              <button class="btn btn-danger-outline btn-sm" onclick="handleDeleteAlarm(${alarm.id})" title="Delete Cue">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

// Modal Handling
function openAlarmModal(alarmId = null) {
  const modal = document.getElementById("alarmModal");
  const modalTitle = document.getElementById("modalTitle");
  const form = document.getElementById("alarmForm");
  const idInput = document.getElementById("alarmId");
  const timeInput = document.getElementById("alarmTime");
  const titleInput = document.getElementById("alarmTitle");
  const notesInput = document.getElementById("alarmNotes");
  const enabledGroup = document.getElementById("enabledFieldGroup");
  const enabledInput = document.getElementById("alarmEnabled");

  form.reset();

  if (alarmId) {
    const alarm = alarms.find((a) => a.id === alarmId);
    if (!alarm) return;
    modalTitle.textContent = "Edit Cue";
    idInput.value = alarm.id;
    timeInput.value = alarm.time;
    titleInput.value = alarm.title;
    notesInput.value = alarm.notes;
    enabledInput.checked = alarm.is_enabled;
    enabledGroup.style.display = "block";
  } else {
    modalTitle.textContent = "Schedule Today's Cue";
    idInput.value = "";
    // Default to next nearest 15 minutes today
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);
    const defH = String(now.getHours()).padStart(2, "0");
    const defM = String(now.getMinutes()).padStart(2, "0");
    timeInput.value = `${defH}:${defM}`;
    enabledGroup.style.display = "none";
    enabledInput.checked = true;
  }

  modal.style.display = "flex";
}

function closeAlarmModal() {
  document.getElementById("alarmModal").style.display = "none";
}

// Form Submission (Add or Edit)
async function handleAlarmSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("alarmId").value;
  const time = document.getElementById("alarmTime").value;
  const title = document.getElementById("alarmTitle").value;
  const notes = document.getElementById("alarmNotes").value;
  const is_enabled = document.getElementById("alarmEnabled").checked;

  try {
    if (id) {
      // Edit
      const res = await fetch(`/api/alarms/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time, title, notes, is_enabled }),
      });
      if (!res.ok) throw new Error("Failed to update cue");
      const updated = await res.json();
      const idx = alarms.findIndex((a) => a.id === Number(id));
      if (idx !== -1) alarms[idx] = updated;
    } else {
      // Create
      const res = await fetch("/api/alarms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time, title, notes }),
      });
      if (!res.ok) throw new Error("Failed to create cue");
      const created = await res.json();
      alarms.push(created);
    }

    closeAlarmModal();
    renderAlarms();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// Toggle enabled status
async function handleToggleAlarm(alarmId) {
  try {
    const res = await fetch(`/api/alarms/${alarmId}/toggle`, { method: "PATCH" });
    if (!res.ok) throw new Error("Failed to toggle cue status");
    const updated = await res.json();
    const idx = alarms.findIndex((a) => a.id === alarmId);
    if (idx !== -1) alarms[idx] = updated;
    renderAlarms();
  } catch (err) {
    alert("Error toggling cue: " + err.message);
  }
}

// Delete cue
async function handleDeleteAlarm(alarmId) {
  if (!confirm("Are you sure you want to remove this cue?")) return;
  try {
    const res = await fetch(`/api/alarms/${alarmId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to remove cue");
    alarms = alarms.filter((a) => a.id !== alarmId);
    renderAlarms();
  } catch (err) {
    alert("Error removing cue: " + err.message);
  }
}

// Settings Modal
function openSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (modal) modal.style.display = "flex";
}

function closeSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (modal) modal.style.display = "none";
}

// Clear Today's Slate Danger Modal
function openClearSlateModal() {
  const modal = document.getElementById("clearSlateModal");
  const countEl = document.getElementById("clearSlateCount");
  if (countEl) {
    const cueCount = alarms.length;
    countEl.textContent = `${cueCount} cue${cueCount === 1 ? '' : 's'}`;
  }
  if (modal) modal.style.display = "flex";
}

function closeClearSlateModal() {
  const modal = document.getElementById("clearSlateModal");
  if (modal) modal.style.display = "none";
}

async function confirmClearSlate() {
  try {
    const res = await fetch("/api/alarms", { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to clear today's slate");
    alarms = [];
    closeClearSlateModal();
    closeSettingsModal();
    renderAlarms();
  } catch (err) {
    alert("Error clearing slate: " + err.message);
  }
}

// Calm, Resonant Two-Tone Theater Chime via Web Audio API
function playChimeBeep() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const t = audioCtx.currentTime;

    // First bell: G5 (784Hz)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(783.99, t);
    gain1.gain.setValueAtTime(0.22, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(t);
    osc1.stop(t + 0.65);

    // Second bell: C6 (1046.5Hz) - harmonious step-in chime
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1046.5, t + 0.18);
    gain2.gain.setValueAtTime(0.25, t + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(t + 0.18);
    osc2.stop(t + 1.0);
  } catch (e) {
    console.warn("Audio playback not supported or blocked by browser:", e);
  }
}

function startChime() {
  playChimeBeep();
  if (!chimeInterval) {
    chimeInterval = setInterval(playChimeBeep, 1400);
  }
}

function stopChime() {
  if (chimeInterval) {
    clearInterval(chimeInterval);
    chimeInterval = null;
  }
}

// Trigger Cue Event
function triggerAlarm(alarm) {
  activeTriggerAlarm = alarm;
  startChime();

  const modal = document.getElementById("triggerModal");
  const timeDisplay = document.getElementById("alertTimeDisplay");
  const titleDisplay = document.getElementById("alertTitleDisplay");
  const notesDisplay = document.getElementById("alertNotesDisplay");

  if (timeDisplay) timeDisplay.textContent = alarm.time;
  if (titleDisplay) titleDisplay.textContent = alarm.title || "Cue";
  if (notesDisplay) notesDisplay.textContent = alarm.notes || "No context brief provided.";

  if (modal) modal.style.display = "flex";

  // Browser Notification if permitted
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(`OnCue: ${alarm.title || alarm.time}`, {
      body: alarm.notes || `It is now ${alarm.time}. Step in on cue.`,
      icon: "🎭",
    });
  }
}

function dismissCurrentAlarm() {
  stopChime();
  const modal = document.getElementById("triggerModal");
  if (modal) modal.style.display = "none";
  activeTriggerAlarm = null;
}

function snoozeCurrentAlarm() {
  stopChime();
  const modal = document.getElementById("triggerModal");
  if (modal) modal.style.display = "none";

  if (activeTriggerAlarm) {
    // Standby: schedule temporary 5-minute future cue today
    const snoozeTime = new Date();
    snoozeTime.setMinutes(snoozeTime.getMinutes() + 5);
    const h = String(snoozeTime.getHours()).padStart(2, "0");
    const m = String(snoozeTime.getMinutes()).padStart(2, "0");

    fetch("/api/alarms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        time: `${h}:${m}`,
        title: `[Snoozed] ${activeTriggerAlarm.title || "Cue"}`,
        notes: activeTriggerAlarm.notes,
      }),
    })
      .then((r) => r.json())
      .then((newAlarm) => {
        alarms.push(newAlarm);
        renderAlarms();
      })
      .catch((e) => console.error("Failed to set standby cue:", e));
  }

  activeTriggerAlarm = null;
}

// Utility: escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
