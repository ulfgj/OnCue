# OnCue Specification

> *"Stay in flow. Step in on cue."*

## 1. Overview
OnCue is a calm, precision web application built with Flask designed around **ephemeral, today-only cues**. Like a theater or film daily call sheet, cues are authored strictly for today's specific rhythm and context. Tomorrow begins with a clean, blank slate—eliminating alarm clutter, cognitive load, and lingering chore debt.

## 2. Requirements & Ephemeral Architecture
- **Ephemeral Daily Slate**:
  - Cues belong strictly to today's schedule.
  - Each cue captures an **Event Time** (`time`) and a **Ring Ahead (Lead Time)** setting (`lead_minutes`, defaulting to `At time` / `0m` and adjustable via quick presets `5m`–`60m` or a custom stepper/input), computing a same-day `alert_time` with a live preview.
  - Active upcoming cues count down live (`HHh MMm SSs`) to their `alert_time` ("Rings in" when lead time is set), display **Event Time** as the primary white headline with a subtle amber `Rings HH:MM` badge whenever `alert_time` differs from Event Time, and keep the Context Brief free from scheduling metadata.
  - Cues that have passed today gracefully transition into a dimmed "Completed Today" state rather than rolling over to tomorrow.
  - At midnight (00:00:00), the app automatically starts fresh for the new day.
  - Users can wipe today's slate clean anytime using the "Clear Slate" action.
- **Dynamic Real-Time Priority**:
  - Upcoming cues (both active and paused) are kept in chronological, closest-first order by `alert_time` so pausing a cue retains its exact position in the timeline.
  - Completed/passed cues are positioned unobtrusively at the bottom.
- **Context Briefs**:
  - Editable multiline text field preserving line breaks, checklists, and arbitrary formatting.
- **Dual Presentation Views**:
  - **Card Grid View**: Spatially distinct cards with Event Time as the white headline, subtle amber ring-time badge, and prominent countdowns.
  - **Table / List View**: Compact, row-oriented table showing status, Event Time (with optional ring-time badge), context brief, countdown, active switch, and quick actions.
  - Layout choice is persisted in browser storage (`localStorage`) across sessions.
- **Settings & Protected Actions**:
  - **Header Settings Access**: Gear icon (`⚙️`) in top right header opens a modular Settings & Preferences dialog.
  - **Isolated Danger Zone**: "Clear Today's Slate" is sequestered inside Settings away from everyday controls to avoid accidental trigger.
  - **Double-Safety Confirmation**: Requires explicit confirmation in a secondary prompt showing the number of affected cues before wiping today's slate.
- **Audio & Alert Notification**:
  - Gentle, resonant synthesized two-tone theater chime (Web Audio API).
  - Alert modal with remaining buffer to Event Time, "Dismiss" (Acknowledge), and adjustable "Snooze" options (snoozing shifts `alert_time` while preserving Event Time).

## 3. Architecture & Tech Stack
- **Dual Deployment Model**:
  - **Static / GitHub Pages Mode (`docs/`)**: Fully functional client-side app hosted on GitHub Pages, utilizing `localStorage` persistence, Web Audio API, and zero backend requirement.
  - **Server Mode (Flask)**: Python 3.13, Flask, SQLite (`sqlite3`) for local development or custom cloud instances.
- **Frontend**: Vanilla JavaScript (ES6+), modern CSS3, HTML5, Web Audio API.
- **Testing**: `pytest` for backend API and endpoints.

## 4. API Endpoints
- `GET /` — Serves main web app.
- `GET /api/alarms` — Return JSON list of cues.
- `POST /api/alarms` — Create new cue `{ time: "HH:MM", lead_minutes?: int, title: "...", notes: "..." }` (computes `alert_time`).
- `PUT /api/alarms/<id>` — Update cue `{ time, lead_minutes?, alert_time?, title, notes, is_enabled }`.
- `PATCH /api/alarms/<id>/toggle` — Toggle cue active status.
- `DELETE /api/alarms/<id>` — Remove single cue.
- `DELETE /api/alarms` — Clear today's entire slate.
