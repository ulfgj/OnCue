# Alarm Clock Web App Specification

## 1. Overview
A lightweight Flask web application that allows users to create, manage, and monitor multiple alarms set for exact times of day. Features real-time countdowns, automatic dynamic sorting by earliest next trigger, and editable multiline arbitrary data notes.

## 2. Requirements & Features
- **Alarms List**: Multiple alarms per user/session stored in local SQLite database.
- **Time Setting**: Exact time of day (`HH:MM` in 24-hour format).
- **Next Occurrence Logic**: Automatically computes next trigger:
  - If target time is later today, triggers today.
  - If target time has already passed today, rolls over to tomorrow.
- **Dynamic Real-Time Sorting**: Alarms are always displayed with the closest trigger first, updating live every second as time passes or when an alarm is updated.
- **Live Countdown**: Each alarm card shows a ticking countdown (`HHh MMm SSs`).
- **Arbitrary Data / Notes**: Each alarm contains an editable multiline text field preserving line breaks and arbitrary text.
- **Editing & Controls**:
  - Edit time, label, and notes at any time.
  - Enable / disable toggle for each alarm.
  - Delete alarm.
  - Active alarm alert with synthesized audio chime (Web Audio API) and visual modal/banner with Dismiss and Snooze (5 min).

## 3. Architecture & Tech Stack
- **Backend**: Python 3.13, Flask, SQLite (`sqlite3`).
- **Frontend**: Vanilla JavaScript (ES6+), modern CSS3, HTML5, Web Audio API.
- **Testing**: `pytest`.

## 4. API Endpoints
- `GET /` — Serves main web app.
- `GET /api/alarms` — Return JSON list of alarms.
- `POST /api/alarms` — Create new alarm `{ time: "HH:MM", title: "...", notes: "..." }`.
- `PUT /api/alarms/<id>` — Update alarm `{ time, title, notes, is_enabled }`.
- `PATCH /api/alarms/<id>/toggle` — Toggle alarm enabled status.
- `DELETE /api/alarms/<id>` — Remove alarm.
