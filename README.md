# OnCue

> *"Stay in flow. Step in on cue."*

A calm, precision web application built with Flask for **ephemeral, today-only cues**. Features real-time countdowns, automatic dynamic sorting by nearest upcoming cue, multiline context briefs, and dual presentation views (Cards and Table).

---

## Quick Start & Running

Activate your virtual environment and start the application:

```bash
source .venv/bin/activate
```

### Development & Testing (with Live Reload & Debugger)
To launch the server in debug mode and automatically open your browser after 1 second:

```bash
(sleep 1 && open http://127.0.0.1:5000) & FLASK_DEBUG=1 python run.py
```

### Daily Safe Use (Debug OFF)
For all-day use or when accessing from other devices on your local Wi-Fi:

```bash
(sleep 1 && open http://127.0.0.1:5000) & python run.py
```

---

## Running Tests

```bash
pytest
```

---

## Documentation
- See [SPEC.md](SPEC.md) for full architecture, data model, and API specifications.
- See [AGENTS.md](AGENTS.md) for codebase guidelines and developer guardrails.
