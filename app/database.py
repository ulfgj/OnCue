import os
import sqlite3
from typing import Optional
from flask import Flask, current_app, g

def get_db(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Open a new database connection if there is none yet for the current app context."""
    if "db" not in g:
        if db_path:
            path = db_path
        elif current_app:
            path = current_app.config.get("DATABASE_PATH", "alarm.db")
        else:
            path = os.environ.get("DATABASE_PATH", "alarm.db")
        g.db = sqlite3.connect(path)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db

def close_db(e=None) -> None:
    """Close the database at the end of the request."""
    db = g.pop("db", None)
    if db is not None:
        db.close()

def init_db(db_path: Optional[str] = None) -> None:
    """Initialize database tables and apply idempotent schema migrations."""
    path = db_path or os.environ.get("DATABASE_PATH") or "alarm.db"
    conn = sqlite3.connect(path)
    try:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS alarms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL DEFAULT '',
                    time TEXT NOT NULL,
                    lead_minutes INTEGER NOT NULL DEFAULT 0,
                    alert_time TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    is_enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            columns = {
                row[1] for row in conn.execute("PRAGMA table_info(alarms)").fetchall()
            }
            if "lead_minutes" not in columns:
                conn.execute(
                    "ALTER TABLE alarms ADD COLUMN lead_minutes INTEGER NOT NULL DEFAULT 0"
                )
            if "alert_time" not in columns:
                conn.execute(
                    "ALTER TABLE alarms ADD COLUMN alert_time TEXT NOT NULL DEFAULT ''"
                )
            conn.execute(
                "UPDATE alarms SET alert_time = time WHERE alert_time IS NULL OR alert_time = ''"
            )
    finally:
        conn.close()
