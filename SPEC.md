# OnCue Specification

> *"Stay in flow. Step in on cue."*

## 1. Overview
OnCue is a calm, precision web application built with Flask designed around **ephemeral, today-only cues**. Like a theater or film daily call sheet, cues are authored strictly for today's specific rhythm and context. Tomorrow begins with a clean, blank slate—eliminating alarm clutter, cognitive load, and lingering chore debt.

## 2. Requirements & Ephemeral Architecture
- **Ephemeral Daily Slate**:
  - Cues belong strictly to today's schedule.
  - Active upcoming cues count down live (`HHh MMm SSs`).
  - Cues that have passed today gracefully transition into a dimmed "Completed Today" state rather than rolling over to tomorrow.
  - At midnight (00:00:00), the app automatically starts fresh for the new day.
  - Users can wipe today's slate clean anytime using the "Clear Slate" action.
- **Dynamic Real-Time Priority ("Next on Cue")**:
  - Upcoming active cues are automatically kept in closest-first order.
  - Inactive/paused cues appear next.
  - Completed/passed cues are positioned unobtrusively at the bottom.
- **Context Briefs**:
  - Editable multiline text field preserving line breaks, checklists, and arbitrary formatting.
- **Audio & Alert Notification**:
  - Gentle, resonant synthesized two-tone theater chime (Web Audio API).
  - Alert modal with "Step In" (Acknowledge) and "Stand by (+5m)" options.

## 3. Architecture & Tech Stack
- **Backend**: Python 3.13, Flask, SQLite (`sqlite3`).
- **Frontend**: Vanilla JavaScript (ES6+), modern CSS3, HTML5, Web Audio API.
- **Testing**: `pytest`.

## 4. API Endpoints
- `GET /` — Serves main web app.
- `GET /api/alarms` — Return JSON list of cues.
- `POST /api/alarms` — Create new cue `{ time: "HH:MM", title: "...", notes: "..." }`.
- `PUT /api/alarms/<id>` — Update cue `{ time, title, notes, is_enabled }`.
- `PATCH /api/alarms/<id>/toggle` — Toggle cue active status.
- `DELETE /api/alarms/<id>` — Remove single cue.
- `DELETE /api/alarms` — Clear today's entire slate.
