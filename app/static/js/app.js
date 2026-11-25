// Precision Alarm Clock Engine
let alarms = [];
let audioCtx = null;
let chimeInterval = null;
let activeTriggerAlarm = null;
const triggeredAlarmIdsThisMinute = new Set();

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  fetchAlarms();
  setInterval(tick, 1000);

  document.getElementById("openAddModalBtn").addEventListener("click", () => {
    openAlarmModal();
  });
});

// Digital Clock in Header
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
}

// Fetch Alarms from Backend
async function fetchAlarms() {
  try {
    const res = await fetch("/api/alarms");
    if (!res.ok) throw new Error("Failed to load alarms");
    const data = await res.json();
    alarms = data.alarms || [];
    renderAlarms();
  } catch (err) {
    console.error("Error fetching alarms:", err);
  }
}

// Calculate Next Occurrence Date & Diff in Milliseconds
function getNextOccurrence(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  if (target <= now) {
    // Already passed today, rolls over to tomorrow
    target.setDate(target.getDate() + 1);
  }

  const diffMs = target - now;
  return { target, diffMs };
}

// Format Milliseconds into "00h 00m 00s"
function formatCountdown(diffMs) {
  if (diffMs <= 0) return "00h 00m 00s";

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
  const currentMinutesKey = `${now.getHours()}:${now.getMinutes()}`;

  // Clear triggered set once minute changes
  if (now.getSeconds() === 0) {
    triggeredAlarmIdsThisMinute.clear();
  }

  // Check if any alarm should trigger
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

  // Re-render countdowns and ensure sorted order
  renderAlarms();
}

// Render and Dynamic Sort: Closest Alarms First
function renderAlarms() {
  const grid = document.getElementById("alarmsList");
  const emptyState = document.getElementById("emptyState");
  const activeCountBadge = document.getElementById("activeCountBadge");

  if (!grid) return;

  const activeCount = alarms.filter(a => a.is_enabled).length;
  if (activeCountBadge) {
    activeCountBadge.textContent = `${activeCount} active`;
  }

  if (alarms.length === 0) {
    grid.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  } else {
    if (emptyState) emptyState.style.display = "none";
  }

  // Calculate countdowns and attach sort score
  const enriched = alarms.map((alarm) => {
    if (!alarm.is_enabled) {
      return { ...alarm, diffMs: Infinity, countdownStr: "Disabled" };
    }
    const { diffMs } = getNextOccurrence(alarm.time);
    return {
      ...alarm,
      diffMs,
      countdownStr: formatCountdown(diffMs),
    };
  });

  // Sort: Enabled alarms with smallest diffMs first, disabled alarms at the end
  enriched.sort((a, b) => a.diffMs - b.diffMs);

  // Identify closest enabled alarm
  const closestId = enriched.length > 0 && enriched[0].is_enabled ? enriched[0].id : null;

  grid.innerHTML = enriched
    .map((alarm) => {
      const isClosest = alarm.id === closestId;
      const isImminent = alarm.is_enabled && alarm.diffMs < 5 * 60 * 1000; // < 5 mins
      const hasNotes = alarm.notes && alarm.notes.trim().length > 0;

      return `
        <div class="alarm-card ${isClosest ? 'closest' : ''} ${!alarm.is_enabled ? 'disabled' : ''}" data-id="${alarm.id}">
          ${isClosest ? '<span class="closest-ribbon">⭐ Next Alarm</span>' : ''}
          <div class="alarm-header">
            <div class="alarm-time-wrapper">
              <span class="alarm-time">${escapeHtml(alarm.time)}</span>
              <span class="alarm-title">${escapeHtml(alarm.title || "Alarm")}</span>
            </div>
            <label class="switch" title="Toggle Alarm">
              <input type="checkbox" ${alarm.is_enabled ? "checked" : ""} onchange="handleToggleAlarm(${alarm.id})">
              <span class="slider"></span>
            </label>
          </div>

          <div class="countdown-box">
            <span class="countdown-label">${alarm.is_enabled ? "Countdown" : "Status"}</span>
            <span class="countdown-val ${isImminent ? 'imminent' : ''}">
              ${alarm.countdownStr}
            </span>
          </div>

          <div class="alarm-notes ${!hasNotes ? 'empty' : ''}">${hasNotes ? escapeHtml(alarm.notes) : 'No notes added.'}</div>

          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="openAlarmModal(${alarm.id})">✏️ Edit</button>
            <button class="btn btn-danger-outline btn-sm" onclick="handleDeleteAlarm(${alarm.id})">🗑️ Delete</button>
          </div>
        </div>
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
    modalTitle.textContent = "Edit Alarm";
    idInput.value = alarm.id;
    timeInput.value = alarm.time;
    titleInput.value = alarm.title;
    notesInput.value = alarm.notes;
    enabledInput.checked = alarm.is_enabled;
    enabledGroup.style.display = "block";
  } else {
    modalTitle.textContent = "Add New Alarm";
    idInput.value = "";
    // Default to next nearest full 15 minutes
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
      if (!res.ok) throw new Error("Failed to update alarm");
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
      if (!res.ok) throw new Error("Failed to create alarm");
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
    if (!res.ok) throw new Error("Failed to toggle alarm");
    const updated = await res.json();
    const idx = alarms.findIndex((a) => a.id === alarmId);
    if (idx !== -1) alarms[idx] = updated;
    renderAlarms();
  } catch (err) {
    alert("Error toggling alarm: " + err.message);
  }
}

// Delete alarm
async function handleDeleteAlarm(alarmId) {
  if (!confirm("Are you sure you want to delete this alarm?")) return;
  try {
    const res = await fetch(`/api/alarms/${alarmId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete alarm");
    alarms = alarms.filter((a) => a.id !== alarmId);
    renderAlarms();
  } catch (err) {
    alert("Error deleting alarm: " + err.message);
  }
}

// Synthesized Audio Alarm Chime via Web Audio API
function playChimeBeep() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    // Pleasant dual chime
    osc.frequency.setValueAtTime(784, audioCtx.currentTime); // G5
    osc.frequency.setValueAtTime(1046.5, audioCtx.currentTime + 0.15); // C6

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.warn("Audio playback not supported or blocked by browser:", e);
  }
}

function startChime() {
  playChimeBeep();
  if (!chimeInterval) {
    chimeInterval = setInterval(playChimeBeep, 800);
  }
}

function stopChime() {
  if (chimeInterval) {
    clearInterval(chimeInterval);
    chimeInterval = null;
  }
}

// Trigger Alarm Event
function triggerAlarm(alarm) {
  activeTriggerAlarm = alarm;
  startChime();

  const modal = document.getElementById("triggerModal");
  const timeDisplay = document.getElementById("alertTimeDisplay");
  const titleDisplay = document.getElementById("alertTitleDisplay");
  const notesDisplay = document.getElementById("alertNotesDisplay");

  if (timeDisplay) timeDisplay.textContent = alarm.time;
  if (titleDisplay) titleDisplay.textContent = alarm.title || "Alarm";
  if (notesDisplay) notesDisplay.textContent = alarm.notes || "No notes provided.";

  if (modal) modal.style.display = "flex";

  // Browser Notification if supported
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(`Alarm: ${alarm.title || alarm.time}`, {
      body: alarm.notes || `It is now ${alarm.time}`,
      icon: "⏰",
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
    // Snooze by setting a temporary 5-minute future time or alert
    const snoozeTime = new Date();
    snoozeTime.setMinutes(snoozeTime.getMinutes() + 5);
    const h = String(snoozeTime.getHours()).padStart(2, "0");
    const m = String(snoozeTime.getMinutes()).padStart(2, "0");

    // Create snooze alarm
    fetch("/api/alarms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        time: `${h}:${m}`,
        title: `[Snoozed] ${activeTriggerAlarm.title || "Alarm"}`,
        notes: activeTriggerAlarm.notes,
      }),
    })
      .then((r) => r.json())
      .then((newAlarm) => {
        alarms.push(newAlarm);
        renderAlarms();
      })
      .catch((e) => console.error("Failed to snooze:", e));
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
