from typing import Any, Dict
from flask import Blueprint, jsonify, render_template, request
from app.database import get_db
from app.models import (
    clear_all_alarms,
    compute_alert_time,
    create_alarm,
    delete_alarm,
    get_alarm_by_id,
    get_all_alarms,
    parse_lead_minutes,
    toggle_alarm,
    update_alarm,
    validate_alarm_time,
)

bp = Blueprint("main", __name__)

@bp.route("/")
def index():
    return render_template("index.html")

@bp.route("/api/alarms", methods=["GET"])
def list_alarms():
    db = get_db()
    alarms = get_all_alarms(db)
    return jsonify({"alarms": alarms}), 200

@bp.route("/api/alarms", methods=["DELETE"])
def clear_slate():
    db = get_db()
    count = clear_all_alarms(db)
    return jsonify({"success": True, "cleared_count": count}), 200

@bp.route("/api/alarms", methods=["POST"])
def add_alarm():
    data: Dict[str, Any] = request.get_json(silent=True) or {}
    time_str = data.get("time", "")
    title = data.get("title", "")
    notes = data.get("notes", "")

    if not validate_alarm_time(time_str):
        return jsonify({"error": "Invalid time format. Please use HH:MM (24-hour format)."}), 400

    lead_minutes = parse_lead_minutes(data.get("lead_minutes", 0))
    if lead_minutes is None:
        return jsonify({"error": "Invalid lead_minutes. Must be an integer between 0 and 1439."}), 400

    alert_time = compute_alert_time(time_str, lead_minutes)
    if alert_time is None:
        return jsonify({"error": "Ring ahead lead time cannot place the alert before midnight (00:00)."}), 400

    db = get_db()
    alarm = create_alarm(
        db,
        title=title,
        time_str=time_str,
        notes=notes,
        lead_minutes=lead_minutes,
        alert_time=alert_time,
    )
    return jsonify(alarm), 201

@bp.route("/api/alarms/<int:alarm_id>", methods=["GET"])
def get_single_alarm(alarm_id: int):
    db = get_db()
    alarm = get_alarm_by_id(db, alarm_id)
    if not alarm:
        return jsonify({"error": "Alarm not found"}), 404
    return jsonify(alarm), 200

@bp.route("/api/alarms/<int:alarm_id>", methods=["PUT"])
def edit_alarm(alarm_id: int):
    data: Dict[str, Any] = request.get_json(silent=True) or {}
    time_str = data.get("time", "")
    title = data.get("title", "")
    notes = data.get("notes", "")
    is_enabled = data.get("is_enabled", True)

    if not validate_alarm_time(time_str):
        return jsonify({"error": "Invalid time format. Please use HH:MM (24-hour format)."}), 400

    db = get_db()
    existing = get_alarm_by_id(db, alarm_id)
    if not existing:
        return jsonify({"error": "Alarm not found"}), 404

    if "lead_minutes" in data:
        lead_minutes = parse_lead_minutes(data.get("lead_minutes"))
        if lead_minutes is None:
            return jsonify({"error": "Invalid lead_minutes. Must be an integer between 0 and 1439."}), 400
    else:
        lead_minutes = existing["lead_minutes"]

    if "alert_time" in data and data["alert_time"] is not None:
        raw_alert_time = data["alert_time"]
        if not isinstance(raw_alert_time, str) or not validate_alarm_time(raw_alert_time):
            return jsonify({"error": "Invalid alert_time format. Please use HH:MM (24-hour format)."}), 400
        alert_time = raw_alert_time.strip()
    else:
        alert_time = compute_alert_time(time_str, lead_minutes)
        if alert_time is None:
            return jsonify({"error": "Ring ahead lead time cannot place the alert before midnight (00:00)."}), 400

    alarm = update_alarm(
        db,
        alarm_id=alarm_id,
        title=title,
        time_str=time_str,
        notes=notes,
        is_enabled=is_enabled,
        lead_minutes=lead_minutes,
        alert_time=alert_time,
    )
    if not alarm:
        return jsonify({"error": "Alarm not found"}), 404
    return jsonify(alarm), 200

@bp.route("/api/alarms/<int:alarm_id>/toggle", methods=["PATCH"])
def toggle_alarm_status(alarm_id: int):
    db = get_db()
    alarm = toggle_alarm(db, alarm_id)
    if not alarm:
        return jsonify({"error": "Alarm not found"}), 404
    return jsonify(alarm), 200

@bp.route("/api/alarms/<int:alarm_id>", methods=["DELETE"])
def remove_alarm(alarm_id: int):
    db = get_db()
    success = delete_alarm(db, alarm_id)
    if not success:
        return jsonify({"error": "Alarm not found"}), 404
    return jsonify({"success": True}), 200
