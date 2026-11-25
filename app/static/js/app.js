// OnCue — Stay in flow. Step in on cue.
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

  // Clear triggered set once minute changes
  if (now.getSeconds() === 0) {
    triggeredAlarmIdsThisMinute.clear();
  }

  // Check if any cue should trigger
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

// Render and Dynamic Sort: Next on Cue (Closest First)
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
      return { ...alarm, diffMs: Infinity, countdownStr: "Inactive" };
    }
    const { diffMs } = getNextOccurrence(alarm.time);
    return {
      ...alarm,
      diffMs,
      countdownStr: formatCountdown(diffMs),
    };
  });

  // Sort: Active cues with smallest diffMs first, inactive cues at the end
  enriched.sort((a, b) => a.diffMs - b.diffMs);

  // Identify next upcoming cue
  const closestId = enriched.length > 0 && enriched[0].is_enabled ? enriched[0].id : null;

  grid.innerHTML = enriched
    .map((alarm) => {
      const isClosest = alarm.id === closestId;
      const isImminent = alarm.is_enabled && alarm.diffMs < 5 * 60 * 1000; // < 5 mins
      const hasNotes = alarm.notes && alarm.notes.trim().length > 0;

      return `
        <div class="alarm-card ${isClosest ? 'closest' : ''} ${!alarm.is_enabled ? 'disabled' : ''}" data-id="${alarm.id}">
          ${isClosest ? '<span class="closest-ribbon">⭐ Next on Cue</span>' : ''}
          <div class="alarm-header">
            <div class="alarm-time-wrapper">
              <span class="alarm-time">${escapeHtml(alarm.time)}</span>
              <span class="alarm-title">${escapeHtml(alarm.title || "Cue")}</span>
            </div>
            <label class="switch" title="Toggle Cue Active">
              <input type="checkbox" ${alarm.is_enabled ? "checked" : ""} onchange="handleToggleAlarm(${alarm.id})">
              <span class="slider"></span>
            </label>
          </div>

          <div class="countdown-box">
            <span class="countdown-label">${alarm.is_enabled ? "Time to Cue" : "Status"}</span>
            <span class="countdown-val ${isImminent ? 'imminent' : ''}">
              ${alarm.countdownStr}
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
    modalTitle.textContent = "Schedule Cue";
    idInput.value = "";
    // Default to next nearest 15 minutes
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
    chimeInterval = setInterval(playChimeBeep, 1400); // Gentle 1.4s interval
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
    // Standby: schedule temporary 5-minute future cue
    const snoozeTime = new Date();
    snoozeTime.setMinutes(snoozeTime.getMinutes() + 5);
    const h = String(snoozeTime.getHours()).padStart(2, "0");
    const m = String(snoozeTime.getMinutes()).padStart(2, "0");

    fetch("/api/alarms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        time: `${h}:${m}`,
        title: `[Standby] ${activeTriggerAlarm.title || "Cue"}`,
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
