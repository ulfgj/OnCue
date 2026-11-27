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
    lead_minutes: int
    alert_time: str
    sound: str
    notes: str
    is_enabled: bool
    created_at: str
    updated_at: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "time": self.time,
            "lead_minutes": int(self.lead_minutes),
            "alert_time": self.alert_time,
            "sound": getattr(self, "sound", "chime") or "chime",
            "notes": self.notes,
            "is_enabled": bool(self.is_enabled),
            "created_at": str(self.created_at),
            "updated_at": str(self.updated_at),
        }

def validate_alarm_time(time_str: str) -> bool:
    """Validate 24h time format HH:MM."""
    return bool(time_str and TIME_REGEX.match(time_str.strip()))

def parse_lead_minutes(raw_value: Any) -> Optional[int]:
    """Parse non-negative lead minutes in [0, 1439], rejecting booleans and invalid types."""
    if raw_value is None:
        return 0
    if isinstance(raw_value, (bool, float)):
        return None
    if isinstance(raw_value, str):
        stripped = raw_value.strip()
        if stripped == "":
            return 0
        try:
            val = int(stripped)
        except ValueError:
            return None
    elif isinstance(raw_value, int):
        val = raw_value
    else:
        return None
    return val if 0 <= val <= 1439 else None

def compute_alert_time(event_time: str, lead_minutes: int) -> Optional[str]:
    """Subtract lead_minutes from event_time (HH:MM); return None if before 00:00."""
    if not validate_alarm_time(event_time):
        return None
    hours_str, mins_str = event_time.strip().split(":")
    total_minutes = int(hours_str) * 60 + int(mins_str) - lead_minutes
    if total_minutes < 0:
        return None
    alert_h, alert_m = divmod(total_minutes, 60)
    return f"{alert_h:02d}:{alert_m:02d}"

def _row_to_alarm_dict(row: sqlite3.Row) -> Dict[str, Any]:
    lead_minutes = int(row["lead_minutes"] or 0)
    alert_time = row["alert_time"] or row["time"]
    sound = row["sound"] if "sound" in row.keys() and row["sound"] else "chime"
    return Alarm(
        id=row["id"],
        title=row["title"],
        time=row["time"],
        lead_minutes=lead_minutes,
        alert_time=alert_time,
        sound=sound,
        notes=row["notes"],
        is_enabled=bool(row["is_enabled"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    ).to_dict()

def get_all_alarms(db: sqlite3.Connection) -> List[Dict[str, Any]]:
    cursor = db.execute(
        """
        SELECT id, title, time, lead_minutes, alert_time, sound, notes, is_enabled, created_at, updated_at
        FROM alarms
        ORDER BY COALESCE(NULLIF(alert_time, ''), time) ASC, time ASC
        """
    )
    rows = cursor.fetchall()
    return [_row_to_alarm_dict(row) for row in rows]

def get_alarm_by_id(db: sqlite3.Connection, alarm_id: int) -> Optional[Dict[str, Any]]:
    cursor = db.execute(
        """
        SELECT id, title, time, lead_minutes, alert_time, sound, notes, is_enabled, created_at, updated_at
        FROM alarms
        WHERE id = ?
        """,
        (alarm_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    return _row_to_alarm_dict(row)

def create_alarm(
    db: sqlite3.Connection,
    title: str,
    time_str: str,
    notes: str,
    lead_minutes: int = 0,
    alert_time: Optional[str] = None,
    sound: str = "chime",
) -> Dict[str, Any]:
    time_str = time_str.strip()
    title = title.strip()
    sound = sound.strip() if sound else "chime"
    if sound not in ("chime", "pulse"):
        sound = "chime"
    resolved_alert_time = (
        alert_time.strip()
        if alert_time is not None
        else compute_alert_time(time_str, lead_minutes)
    )
    if resolved_alert_time is None:
        raise ValueError("Lead time places alert before midnight (00:00).")
    cursor = db.execute(
        """
        INSERT INTO alarms (title, time, lead_minutes, alert_time, sound, notes, is_enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        """,
        (title, time_str, lead_minutes, resolved_alert_time, sound, notes),
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
    lead_minutes: int = 0,
    alert_time: Optional[str] = None,
    sound: str = "chime",
) -> Optional[Dict[str, Any]]:
    time_str = time_str.strip()
    title = title.strip()
    sound = sound.strip() if sound else "chime"
    if sound not in ("chime", "pulse"):
        sound = "chime"
    resolved_alert_time = (
        alert_time.strip()
        if alert_time is not None
        else compute_alert_time(time_str, lead_minutes)
    )
    if resolved_alert_time is None:
        raise ValueError("Lead time places alert before midnight (00:00).")
    cursor = db.execute(
        """
        UPDATE alarms
        SET title = ?, time = ?, lead_minutes = ?, alert_time = ?, sound = ?, notes = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (title, time_str, lead_minutes, resolved_alert_time, sound, notes, 1 if is_enabled else 0, alarm_id),
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

def clear_all_alarms(db: sqlite3.Connection) -> int:
    """Clear all cues from today's slate."""
    cursor = db.execute("DELETE FROM alarms")
    db.commit()
    return cursor.rowcount

