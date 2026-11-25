# Agent Guidelines

Consult `SPEC.md` for product requirements, architecture, and API details.

## Tech Stack & Structure
- Python 3 / Flask
- SQLite database (`app/alarm.db` or configured via app config)
- Vanilla JS & CSS (no heavy node build steps)
- `tests/` with pytest

## Build, Dev & Test Commands
- Create venv: `python3 -m venv .venv && source .venv/bin/activate`
- Install dependencies: `pip install -r requirements.txt`
- Run development server: `python run.py` (accessible at http://127.0.0.1:5000)
- Run tests: `pytest`

## Standards & Safety Guardrails
- Keep scripts modular, readable, and well-typed.
- Never hardcode secrets or local absolute paths.
- All database queries must use parameterized inputs to prevent SQL injection.
- Preserve Conventional Commit workflow (`feat:`, `fix:`, `docs:`, `chore:`).
