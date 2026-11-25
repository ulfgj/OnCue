import os
import tempfile
import pytest
from app import create_app
from app.database import init_db

@pytest.fixture
def app():
    db_fd, db_path = tempfile.mkstemp()
    app = create_app({
        "TESTING": True,
        "DATABASE_PATH": db_path,
    })

    yield app

    os.close(db_fd)
    os.unlink(db_path)

@pytest.fixture
def client(app):
    return app.test_client()

def test_index_page(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"OnCue" in response.data
    assert b"Stay in flow. Step in on cue." in response.data

def test_empty_alarms_list(client):
    response = client.get("/api/alarms")
    assert response.status_code == 200
    data = response.get_json()
    assert "alarms" in data
    assert len(data["alarms"]) == 0

def test_create_alarm_success(client):
    payload = {
        "title": "Morning Routine",
        "time": "06:45",
        "notes": "Line 1: Meditate\nLine 2: Cold Shower\nLine 3: Coffee",
    }
    response = client.post("/api/alarms", json=payload)
    assert response.status_code == 201
    data = response.get_json()
    assert data["id"] is not None
    assert data["title"] == "Morning Routine"
    assert data["time"] == "06:45"
    assert "Line 1: Meditate\nLine 2: Cold Shower" in data["notes"]
    assert data["is_enabled"] is True

def test_create_alarm_invalid_time(client):
    invalid_times = ["25:00", "12:60", "7:30", "invalid", ""]
    for bad_time in invalid_times:
        response = client.post("/api/alarms", json={"time": bad_time, "title": "Bad"})
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

def test_update_alarm(client):
    create_res = client.post(
        "/api/alarms",
        json={"title": "Team Standup", "time": "09:30", "notes": "Initial note"},
    )
    alarm_id = create_res.get_json()["id"]

    update_payload = {
        "title": "Team Standup (Rescheduled)",
        "time": "10:15",
        "notes": "Updated note:\nReview PR #42",
        "is_enabled": False,
    }
    update_res = client.put(f"/api/alarms/{alarm_id}", json=update_payload)
    assert update_res.status_code == 200
    updated_data = update_res.get_json()
    assert updated_data["time"] == "10:15"
    assert updated_data["title"] == "Team Standup (Rescheduled)"
    assert "Updated note:\nReview PR #42" in updated_data["notes"]
    assert updated_data["is_enabled"] is False

def test_toggle_alarm(client):
    create_res = client.post("/api/alarms", json={"time": "14:00", "title": "Check Email"})
    alarm_id = create_res.get_json()["id"]

    # Initially enabled
    assert create_res.get_json()["is_enabled"] is True

    # Toggle off
    toggle_res1 = client.patch(f"/api/alarms/{alarm_id}/toggle")
    assert toggle_res1.status_code == 200
    assert toggle_res1.get_json()["is_enabled"] is False

    # Toggle back on
    toggle_res2 = client.patch(f"/api/alarms/{alarm_id}/toggle")
    assert toggle_res2.status_code == 200
    assert toggle_res2.get_json()["is_enabled"] is True

def test_delete_alarm(client):
    create_res = client.post("/api/alarms", json={"time": "18:00", "title": "Gym"})
    alarm_id = create_res.get_json()["id"]

    del_res = client.delete(f"/api/alarms/{alarm_id}")
    assert del_res.status_code == 200
    assert del_res.get_json()["success"] is True

    # Verify not found afterwards
    get_res = client.get(f"/api/alarms/{alarm_id}")
    assert get_res.status_code == 404

def test_clear_slate(client):
    # Add multiple cues
    client.post("/api/alarms", json={"time": "09:00", "title": "Cue 1"})
    client.post("/api/alarms", json={"time": "14:00", "title": "Cue 2"})
    client.post("/api/alarms", json={"time": "17:00", "title": "Cue 3"})

    list_res = client.get("/api/alarms")
    assert len(list_res.get_json()["alarms"]) == 3

    # Clear all cues for the day
    clear_res = client.delete("/api/alarms")
    assert clear_res.status_code == 200
    assert clear_res.get_json()["cleared_count"] == 3

    # Verify slate is empty
    empty_res = client.get("/api/alarms")
    assert len(empty_res.get_json()["alarms"]) == 0


def test_not_found_operations(client):
    assert client.get("/api/alarms/9999").status_code == 404
    assert client.put("/api/alarms/9999", json={"time": "12:00"}).status_code == 404
    assert client.patch("/api/alarms/9999/toggle").status_code == 404
    assert client.delete("/api/alarms/9999").status_code == 404

def test_multiline_notes_preservation(client):
    complex_notes = "Line 1: Checklist\n- [x] Item 1\n- [ ] Item 2\n\nNotes with special chars: <>&\"'!"
    res = client.post(
        "/api/alarms",
        json={"title": "Task List", "time": "11:00", "notes": complex_notes},
    )
    assert res.status_code == 201
    alarm = res.get_json()
    assert alarm["notes"] == complex_notes

    # Verify retrieval
    get_res = client.get(f"/api/alarms/{alarm['id']}")
    assert get_res.status_code == 200
    assert get_res.get_json()["notes"] == complex_notes

