# OnCue Specification

> *"Stay in flow. Step in on cue."*

## 1. Overview
OnCue is a calm, precision web application built with Flask that gives you peace of mind to focus deeply, knowing you will be smoothly cued right on time. Features real-time countdowns, automatic dynamic sorting by nearest upcoming cue, multiline context briefs, and a soothing theater chime.

## 2. Requirements & Features
- **Cues List**: Multiple cues per user/session stored in local SQLite database.
- **Time Setting**: Exact time of day (`HH:MM` in 24-hour format).
- **Next Occurrence Logic**: Automatically computes next trigger:
  - If target time is later today, triggers today.
  - If target time has already passed today, rolls over to tomorrow.
- **Dynamic Real-Time Sorting ("Next on Cue")**: Cues are always displayed with the closest trigger first, updating live every second as time passes or when a cue is updated.
- **Live Countdown ("Time to Cue")**: Each cue card shows a ticking countdown (`HHh MMm SSs`).
- **Context Briefs / Notes**: Each cue contains an editable multiline text field preserving line breaks, checklists, and arbitrary formatting.
- **Editing & Controls**:
  - Edit time, label, and context brief at any time.
  - Active toggle for each cue.
  - Delete cue.
  - Active cue notification with a synthesized two-tone theater chime (Web Audio API) and visual modal/banner with "Step In" (Acknowledge) and "Stand by (+5m)" options.

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
- `DELETE /api/alarms/<id>` — Remove cue.
