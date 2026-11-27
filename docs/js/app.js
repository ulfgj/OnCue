// OnCue — Stay in flow. Step in on cue. (Static Client with LocalStorage)
const STORAGE_KEY = "oncue_cues_data";
let alarms = [];
let audioCtx = null;
let chimeInterval = null;
let activeTriggerAlarm = null;
let selectedLeadMinutes = null;
let currentView = localStorage.getItem("oncue_view") || "grid";
let defaultSnoozeMinutes = parseInt(localStorage.getItem("oncue_default_snooze"), 10) || 5;
let triggerSnoozeMinutes = defaultSnoozeMinutes;
let lastKnownDay = new Date().getDate();
const triggeredAlarmIdsThisMinute = new Set();

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initViewSwitcher();
  updateDefaultSnoozeDisplay();
  loadAlarms();
  setInterval(tick, 1000);

  const addBtn = document.getElementById("openAddModalBtn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      openAlarmModal();
    });
  }

  const alarmTimeInput = document.getElementById("alarmTime");
  if (alarmTimeInput) {
    alarmTimeInput.addEventListener("input", () => updateLeadPreview());
  }
});

// Lead Time & Event Helpers
function computeAlertTime(eventTimeStr, leadMinutes) {
  if (!eventTimeStr || typeof eventTimeStr !== "string" || !eventTimeStr.includes(":")) {
    return null;
  }
  const [hStr, mStr] = eventTimeStr.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  const lead = Number(leadMinutes);
  if (!Number.isInteger(lead) || lead < 0) {
    return null;
  }
  const totalMins = h * 60 + m - lead;
  if (totalMins < 0) {
    return null;
  }
  const alertH = String(Math.floor(totalMins / 60)).padStart(2, "0");
  const alertM = String(totalMins % 60).padStart(2, "0");
  return `${alertH}:${alertM}`;
}

function normalizeAlarm(alarm) {
  const leadMinutes = Number.isFinite(Number(alarm.lead_minutes))
    ? Math.max(0, Math.trunc(Number(alarm.lead_minutes)))
    : 0;
  const alertTime =
    alarm.alert_time && String(alarm.alert_time).trim()
      ? String(alarm.alert_time).trim()
      : computeAlertTime(alarm.time, leadMinutes) || alarm.time;
  return {
    ...alarm,
    lead_minutes: leadMinutes,
    alert_time: alertTime,
  };
}

function getRingMetaLabel(alarm) {
  const alertTime = alarm.alert_time || alarm.time;
  if (alertTime === alarm.time) {
    return "";
  }
  const leadMinutes = Number(alarm.lead_minutes) || 0;
  if (leadMinutes > 0 && computeAlertTime(alarm.time, leadMinutes) === alertTime) {
    return `Rings ${alertTime} (−${leadMinutes}m)`;
  }
  return `Rings ${alertTime} · Snoozed`;
}

function getEventBufferText(eventTimeStr) {
  if (!eventTimeStr || !eventTimeStr.includes(":")) return "";
  const [h, m] = eventTimeStr.split(":").map(Number);
  const now = new Date();
  const eventDate = new Date();
  eventDate.setHours(h, m, 0, 0);
  const diffMins = Math.round((eventDate - now) / 60000);
  if (diffMins > 0) {
    return `🎯 Event at ${eventTimeStr} · in ${diffMins} min`;
  }
  if (diffMins === 0) {
    return `🎯 Event starts now (${eventTimeStr})`;
  }
  return `🎯 Event was at ${eventTimeStr} (${Math.abs(diffMins)} min ago)`;
}

// Persistence Helpers
function loadAlarms() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    alarms = (raw ? JSON.parse(raw) : []).map(normalizeAlarm);
  } catch (err) {
    console.error("Failed to load cues from localStorage:", err);
    alarms = [];
  }
  renderAlarms();
}

function saveAlarms() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
  } catch (err) {
    console.error("Failed to save cues to localStorage:", err);
  }
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

    const ringTime = alarm.alert_time || alarm.time;
    const [aHours, aMins] = ringTime.split(":").map(Number);
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

// Render and Dynamic Ephemeral Sort
function renderAlarms() {
  const grid = document.getElementById("alarmsList");
  const tableContainer = document.getElementById("alarmsTableContainer");
  const tableBody = document.getElementById("alarmsTableBody");
  const emptyState = document.getElementById("emptyState");
  const activeCountBadge = document.getElementById("activeCountBadge");

  if (!grid || !tableBody) return;

  const activeCues = alarms.filter(a => a.is_enabled);
  if (activeCountBadge) {
    activeCountBadge.textContent = `${activeCues.length} active today`;
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
    const ringTime = alarm.alert_time || alarm.time;
    const { isPassed, diffMs } = getTodayCueStatus(ringTime);

    if (isPassed) {
      return {
        ...alarm,
        ringTime,
        isPassed: true,
        diffMs,
        sortGroup: 2,
        statusText: "Passed today",
      };
    }

    if (!alarm.is_enabled) {
      return {
        ...alarm,
        ringTime,
        isPassed: false,
        diffMs,
        sortGroup: 1,
        statusText: "Paused",
      };
    }

    return {
      ...alarm,
      ringTime,
      isPassed: false,
      diffMs,
      sortGroup: 1,
      statusText: formatCountdown(diffMs),
    };
  });

  // Sort groups:
  // Group 1: Today's upcoming cues (both active & paused, ascending by scheduled time / diffMs)
  // Group 2: Passed today (descending)
  enriched.sort((a, b) => {
    if (a.sortGroup !== b.sortGroup) {
      return a.sortGroup - b.sortGroup;
    }
    if (a.sortGroup === 1) {
      return a.diffMs - b.diffMs;
    }
    if (a.sortGroup === 2) {
      return b.diffMs - a.diffMs;
    }
    return 0;
  });

  // 1. Render Grid View
  grid.innerHTML = enriched
    .map((alarm) => {
      const isImminent = alarm.sortGroup === 1 && alarm.diffMs < 5 * 60 * 1000; // < 5 mins
      const isPassed = alarm.sortGroup === 2;
      const hasNotes = alarm.notes && alarm.notes.trim().length > 0;
      const ringMetaLabel = getRingMetaLabel(alarm);

      return `
        <div class="alarm-card ${!alarm.is_enabled ? 'disabled' : ''} ${isPassed ? 'passed' : ''}" data-id="${alarm.id}">
          ${isPassed ? '<span class="passed-ribbon">✓ Completed Today</span>' : ''}
          <div class="alarm-header">
            <div class="alarm-time-wrapper">
              <span class="alarm-time">${escapeHtml(alarm.time)}</span>
              ${ringMetaLabel ? `<span class="alarm-ring-badge">🔔 ${escapeHtml(ringMetaLabel)}</span>` : ''}
              <span class="alarm-title">${escapeHtml(alarm.title || "Cue")}</span>
            </div>
            <label class="switch" title="${isPassed ? 'Cue has already passed today' : 'Toggle Cue Active'}">
              <input type="checkbox" ${alarm.is_enabled ? "checked" : ""} ${isPassed ? 'disabled' : ''} onchange="handleToggleAlarm(${alarm.id})">
              <span class="slider"></span>
            </label>
          </div>

          <div class="countdown-box">
            <span class="countdown-label">${isPassed ? 'Status' : (alarm.is_enabled ? (ringMetaLabel ? 'Rings in' : 'Time to Cue') : 'Status')}</span>
            <span class="countdown-val ${isImminent ? 'imminent' : ''} ${isPassed ? 'passed-val' : (!alarm.is_enabled ? 'paused-val' : '')}">
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
      const isImminent = alarm.sortGroup === 1 && alarm.diffMs < 5 * 60 * 1000;
      const isPassed = alarm.sortGroup === 2;
      const hasNotes = alarm.notes && alarm.notes.trim().length > 0;
      const ringMetaLabel = getRingMetaLabel(alarm);

      let statusBadge = '<span class="badge badge-info">Active</span>';
      if (isPassed) {
        statusBadge = '<span class="passed-ribbon" style="margin-bottom: 0;">✓ Done</span>';
      } else if (!alarm.is_enabled) {
        statusBadge = '<span class="badge" style="background:#334155; color:#94a3b8;">Paused</span>';
      }

      return `
        <tr class="${isPassed ? 'row-passed' : (!alarm.is_enabled ? 'row-disabled' : '')}" data-id="${alarm.id}">
          <td class="td-status">${statusBadge}</td>
          <td class="td-time">
            <div class="table-event-time">${escapeHtml(alarm.time)}</div>
            ${ringMetaLabel ? `<div class="table-ring-meta">🔔 ${escapeHtml(ringMetaLabel)}</div>` : ''}
          </td>
          <td class="td-cue">
            <div class="cue-row-title">${escapeHtml(alarm.title || "Cue")}</div>
            ${hasNotes ? `<div class="cue-row-notes" title="${escapeHtml(alarm.notes)}">${escapeHtml(alarm.notes)}</div>` : '<div class="cue-row-notes" style="font-style: italic;">No context brief</div>'}
          </td>
          <td class="td-countdown">
            <span class="countdown-val ${isImminent ? 'imminent' : ''} ${isPassed ? 'passed-val' : (!alarm.is_enabled ? 'paused-val' : '')}">
              ${alarm.statusText}
            </span>
          </td>
          <td class="td-toggle">
            <label class="switch" title="${isPassed ? 'Cue has already passed today' : 'Toggle Cue Active'}">
              <input type="checkbox" ${alarm.is_enabled ? "checked" : ""} ${isPassed ? 'disabled' : ''} onchange="handleToggleAlarm(${alarm.id})">
              <span class="slider"></span>
            </label>
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
    const found = alarms.find((a) => a.id === alarmId);
    if (!found) return;
    const alarm = normalizeAlarm(found);
    modalTitle.textContent = "Edit Cue";
    idInput.value = alarm.id;
    timeInput.value = alarm.time;
    titleInput.value = alarm.title;
    notesInput.value = alarm.notes;
    enabledInput.checked = alarm.is_enabled;
    enabledGroup.style.display = "block";
    setSelectedLeadMinutes(alarm.lead_minutes);
  } else {
    modalTitle.textContent = "Schedule Today's Cue";
    idInput.value = "";
    // Default to now + 30 minutes today (clamped to 23:59)
    const now = new Date();
    const targetMins = Math.min(now.getHours() * 60 + now.getMinutes() + 30, 23 * 60 + 59);
    const defH = String(Math.floor(targetMins / 60)).padStart(2, "0");
    const defM = String(targetMins % 60).padStart(2, "0");
    timeInput.value = `${defH}:${defM}`;
    enabledGroup.style.display = "none";
    enabledInput.checked = true;
    setSelectedLeadMinutes(0);
  }

  modal.style.display = "flex";
}

function closeAlarmModal() {
  document.getElementById("alarmModal").style.display = "none";
}

function openTimePicker() {
  const timeInput = document.getElementById("alarmTime");
  if (!timeInput) return;
  timeInput.focus();
  if (typeof timeInput.showPicker === "function") {
    try {
      timeInput.showPicker();
    } catch (err) {
      // Fallback when browser restricts programmatic showPicker
    }
  }
}

function resetLeadSelection() {
  selectedLeadMinutes = null;
  const hiddenInput = document.getElementById("alarmLeadMinutes");
  const customInput = document.getElementById("customLeadInput");
  const errorEl = document.getElementById("leadError");
  if (hiddenInput) hiddenInput.value = "";
  if (customInput) customInput.value = "";
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }
  document.querySelectorAll(".btn-lead-preset").forEach((btn) => {
    btn.classList.remove("active");
  });
  updateLeadPreview();
}

function setSelectedLeadMinutes(val, updateCustomField = true) {
  const parsed = Number(val);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 720) {
    return;
  }
  selectedLeadMinutes = parsed;
  const hiddenInput = document.getElementById("alarmLeadMinutes");
  const customInput = document.getElementById("customLeadInput");
  const errorEl = document.getElementById("leadError");

  if (hiddenInput) hiddenInput.value = String(parsed);
  if (updateCustomField && customInput) {
    customInput.value = String(parsed);
  }
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }

  document.querySelectorAll(".btn-lead-preset").forEach((btn) => {
    const btnLead = Number(btn.dataset.lead);
    btn.classList.toggle("active", btnLead === parsed);
  });

  updateLeadPreview();
}

function selectLeadPreset(minutes) {
  setSelectedLeadMinutes(minutes, true);
}

function adjustCustomLead(delta) {
  const base = selectedLeadMinutes === null ? 0 : selectedLeadMinutes;
  const next = Math.max(0, Math.min(720, base + delta));
  setSelectedLeadMinutes(next, true);
}

function handleCustomLeadInput(e) {
  const raw = e.target.value.trim();
  const errorEl = document.getElementById("leadError");
  if (raw === "") {
    selectedLeadMinutes = null;
    const hiddenInput = document.getElementById("alarmLeadMinutes");
    if (hiddenInput) hiddenInput.value = "";
    document.querySelectorAll(".btn-lead-preset").forEach((btn) => btn.classList.remove("active"));
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.style.display = "none";
    }
    updateLeadPreview();
    return;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 720) {
    selectedLeadMinutes = null;
    const hiddenInput = document.getElementById("alarmLeadMinutes");
    if (hiddenInput) hiddenInput.value = "";
    document.querySelectorAll(".btn-lead-preset").forEach((btn) => btn.classList.remove("active"));
    if (errorEl) {
      errorEl.textContent = "Enter a whole number between 0 and 720 minutes.";
      errorEl.style.display = "block";
    }
    updateLeadPreview();
    return;
  }
  setSelectedLeadMinutes(parsed, false);
}

function updateLeadPreview() {
  const previewEl = document.getElementById("leadPreview");
  const timeInput = document.getElementById("alarmTime");
  if (!previewEl) return;

  const eventTime = timeInput ? timeInput.value : "";
  if (selectedLeadMinutes === null) {
    previewEl.className = "lead-preview neutral";
    previewEl.textContent = "Choose how far ahead the alarm should ring.";
    return;
  }

  if (!eventTime) {
    previewEl.className = "lead-preview neutral";
    previewEl.textContent = "Enter an event time above to preview when the alarm rings.";
    return;
  }

  const alertTime = computeAlertTime(eventTime, selectedLeadMinutes);
  if (!alertTime) {
    previewEl.className = "lead-preview error";
    previewEl.textContent = `Cannot ring ${selectedLeadMinutes}m before ${eventTime} — that would be before midnight (00:00).`;
    return;
  }

  previewEl.className = "lead-preview";
  if (selectedLeadMinutes === 0) {
    previewEl.textContent = `Rings at ${alertTime} (at event start time)`;
  } else {
    previewEl.textContent = `Rings at ${alertTime} — ${selectedLeadMinutes} min before ${eventTime}`;
  }
}

// Form Submission (Add or Edit with LocalStorage)
function handleAlarmSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("alarmId").value;
  const time = document.getElementById("alarmTime").value;
  const title = document.getElementById("alarmTitle").value;
  const notes = document.getElementById("alarmNotes").value;
  const is_enabled = document.getElementById("alarmEnabled").checked;
  const errorEl = document.getElementById("leadError");

  if (!time) {
    alert("Please specify a valid time.");
    return;
  }

  if (selectedLeadMinutes === null) {
    if (errorEl) {
      errorEl.textContent = "Please choose how far ahead the alarm should ring.";
      errorEl.style.display = "block";
    }
    return;
  }

  const computedAlert = computeAlertTime(time, selectedLeadMinutes);
  if (!computedAlert) {
    if (errorEl) {
      errorEl.textContent = "Ring ahead lead time cannot place the alert before midnight (00:00).";
      errorEl.style.display = "block";
    }
    return;
  }

  if (id) {
    // Edit existing
    const idx = alarms.findIndex((a) => a.id === Number(id));
    if (idx !== -1) {
      alarms[idx].time = time.trim();
      alarms[idx].lead_minutes = selectedLeadMinutes;
      alarms[idx].alert_time = computedAlert;
      alarms[idx].title = title.trim();
      alarms[idx].notes = notes;
      alarms[idx].is_enabled = is_enabled;
      alarms[idx].updated_at = new Date().toISOString();
    }
  } else {
    // Create new
    const newCue = {
      id: Date.now(),
      time: time.trim(),
      lead_minutes: selectedLeadMinutes,
      alert_time: computedAlert,
      title: title.trim(),
      notes: notes,
      is_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    alarms.push(newCue);
  }

  saveAlarms();
  closeAlarmModal();
  renderAlarms();
}

// Toggle enabled status
function handleToggleAlarm(alarmId) {
  const idx = alarms.findIndex((a) => a.id === alarmId);
  if (idx !== -1) {
    alarms[idx].is_enabled = !alarms[idx].is_enabled;
    alarms[idx].updated_at = new Date().toISOString();
    saveAlarms();
    renderAlarms();
  }
}

// Delete cue
function handleDeleteAlarm(alarmId) {
  if (!confirm("Are you sure you want to remove this cue?")) return;
  alarms = alarms.filter((a) => a.id !== alarmId);
  saveAlarms();
  renderAlarms();
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

function confirmClearSlate() {
  alarms = [];
  saveAlarms();
  closeClearSlateModal();
  closeSettingsModal();
  renderAlarms();
}

// Snooze / Standby Interval Controls (+ / -)
function updateDefaultSnoozeDisplay() {
  const el = document.getElementById("defaultSnoozeDisplay");
  if (el) el.textContent = `${defaultSnoozeMinutes} min`;
}

function adjustDefaultSnooze(delta) {
  defaultSnoozeMinutes = Math.max(5, Math.min(120, defaultSnoozeMinutes + delta));
  localStorage.setItem("oncue_default_snooze", defaultSnoozeMinutes);
  updateDefaultSnoozeDisplay();
}

function updateTriggerSnoozeDisplay() {
  const displayEl = document.getElementById("triggerSnoozeDisplay");
  const btnEl = document.getElementById("triggerSnoozeBtn");
  if (displayEl) displayEl.textContent = `${triggerSnoozeMinutes} min`;
  if (btnEl) btnEl.textContent = `💤 Snooze (+${triggerSnoozeMinutes}m)`;
}

function adjustTriggerSnooze(delta) {
  triggerSnoozeMinutes = Math.max(5, Math.min(120, triggerSnoozeMinutes + delta));
  updateTriggerSnoozeDisplay();
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

    // First bell: G5 (783.99Hz)
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

    // Second bell: C6 (1046.5Hz)
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
  triggerSnoozeMinutes = defaultSnoozeMinutes;
  updateTriggerSnoozeDisplay();
  startChime();

  const ringTime = alarm.alert_time || alarm.time;
  const modal = document.getElementById("triggerModal");
  const timeDisplay = document.getElementById("alertTimeDisplay");
  const eventMetaDisplay = document.getElementById("alertEventMeta");
  const titleDisplay = document.getElementById("alertTitleDisplay");
  const notesDisplay = document.getElementById("alertNotesDisplay");

  if (timeDisplay) timeDisplay.textContent = ringTime;
  if (eventMetaDisplay) {
    if (ringTime !== alarm.time) {
      eventMetaDisplay.textContent = getEventBufferText(alarm.time);
      eventMetaDisplay.style.display = "inline-block";
    } else {
      eventMetaDisplay.textContent = "";
      eventMetaDisplay.style.display = "none";
    }
  }
  if (titleDisplay) titleDisplay.textContent = alarm.title || "Cue";
  if (notesDisplay) notesDisplay.textContent = alarm.notes || "No context brief provided.";

  if (modal) modal.style.display = "flex";

  // Browser Notification if permitted
  if ("Notification" in window && Notification.permission === "granted") {
    const eventInfo = ringTime !== alarm.time ? `Event at ${alarm.time}. ` : "";
    new Notification(`OnCue: ${alarm.title || ringTime}`, {
      body: alarm.notes
        ? `${eventInfo}${alarm.notes}`
        : `${eventInfo}It is now ${ringTime}. Step in on cue.`,
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
    const cueToUpdate = activeTriggerAlarm;
    const now = new Date();
    const snoozeTotalMins = Math.min(
      now.getHours() * 60 + now.getMinutes() + triggerSnoozeMinutes,
      23 * 60 + 59
    );
    const h = String(Math.floor(snoozeTotalMins / 60)).padStart(2, "0");
    const m = String(snoozeTotalMins % 60).padStart(2, "0");
    const newTime = `${h}:${m}`;

    const idx = alarms.findIndex((a) => a.id === cueToUpdate.id);
    if (idx !== -1) {
      alarms[idx].alert_time = newTime;
      alarms[idx].is_enabled = true;
      alarms[idx].updated_at = new Date().toISOString();
      saveAlarms();
      renderAlarms();
    }
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
