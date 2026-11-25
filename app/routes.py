from typing import Any, Dict
from flask import Blueprint, jsonify, render_template, request
from app.database import get_db
from app.models import (
    clear_all_alarms,
    create_alarm,
    delete_alarm,
    get_alarm_by_id,
    get_all_alarms,
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

    db = get_db()
    alarm = create_alarm(db, title=title, time_str=time_str, notes=notes)
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
    alarm = update_alarm(
        db,
        alarm_id=alarm_id,
        title=title,
        time_str=time_str,
        notes=notes,
        is_enabled=is_enabled,
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
