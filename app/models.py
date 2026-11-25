import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import sqlite3

TIME_REGEX = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

@dataclass
class Alarm:
    id: int
    title: str
    time: str
    notes: str
    is_enabled: bool
    created_at: str
    updated_at: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "time": self.time,
            "notes": self.notes,
            "is_enabled": bool(self.is_enabled),
            "created_at": str(self.created_at),
            "updated_at": str(self.updated_at),
        }

def validate_alarm_time(time_str: str) -> bool:
    """Validate 24h time format HH:MM."""
    return bool(time_str and TIME_REGEX.match(time_str.strip()))

def get_all_alarms(db: sqlite3.Connection) -> List[Dict[str, Any]]:
    cursor = db.execute(
        "SELECT id, title, time, notes, is_enabled, created_at, updated_at FROM alarms ORDER BY time ASC"
    )
    rows = cursor.fetchall()
    return [
        Alarm(
            id=row["id"],
            title=row["title"],
            time=row["time"],
            notes=row["notes"],
            is_enabled=bool(row["is_enabled"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        ).to_dict()
        for row in rows
    ]

def get_alarm_by_id(db: sqlite3.Connection, alarm_id: int) -> Optional[Dict[str, Any]]:
    cursor = db.execute(
        "SELECT id, title, time, notes, is_enabled, created_at, updated_at FROM alarms WHERE id = ?",
        (alarm_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    return Alarm(
        id=row["id"],
        title=row["title"],
        time=row["time"],
        notes=row["notes"],
        is_enabled=bool(row["is_enabled"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    ).to_dict()

def create_alarm(db: sqlite3.Connection, title: str, time_str: str, notes: str) -> Dict[str, Any]:
    time_str = time_str.strip()
    title = title.strip()
    cursor = db.execute(
        """
        INSERT INTO alarms (title, time, notes, is_enabled, updated_at)
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
        """,
        (title, time_str, notes),
    )
    db.commit()
    return get_alarm_by_id(db, cursor.lastrowid)  # type: ignore

def update_alarm(
    db: sqlite3.Connection,
    alarm_id: int,
    title: str,
    time_str: str,
    notes: str,
    is_enabled: bool,
) -> Optional[Dict[str, Any]]:
    time_str = time_str.strip()
    title = title.strip()
    cursor = db.execute(
        """
        UPDATE alarms
        SET title = ?, time = ?, notes = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (title, time_str, notes, 1 if is_enabled else 0, alarm_id),
    )
    db.commit()
    if cursor.rowcount == 0:
        return None
    return get_alarm_by_id(db, alarm_id)

def toggle_alarm(db: sqlite3.Connection, alarm_id: int) -> Optional[Dict[str, Any]]:
    cursor = db.execute(
        """
        UPDATE alarms
        SET is_enabled = CASE WHEN is_enabled = 1 THEN 0 ELSE 1 END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (alarm_id,),
    )
    db.commit()
    if cursor.rowcount == 0:
        return None
    return get_alarm_by_id(db, alarm_id)

def delete_alarm(db: sqlite3.Connection, alarm_id: int) -> bool:
    cursor = db.execute("DELETE FROM alarms WHERE id = ?", (alarm_id,))
    db.commit()
    return cursor.rowcount > 0
