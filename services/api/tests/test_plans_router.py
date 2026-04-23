from unittest.mock import patch

from app.routers.plans import _build_expanded_plan_response


def test_build_expanded_plan_response_tolerates_bad_cache_row():
    client = object()
    plan_id = "demo-plan-id"
    plan = {
        "id": plan_id,
        "payload_version": 2,
        "payload": {},
        "payload_class_refs": [
            {
                "course_cache_id": "bad-cache-id",
                "course_code": "CSE 101",
                "professor_name": "Prof Example",
                "meetings": [],
                "overrides": {},
            }
        ],
        "title": "Demo",
        "quarter_label": "Fall",
    }

    with (
        patch("app.routers.plans.get_saved_plan", return_value=plan),
        patch("app.routers.plans.get_saved_plan_classes", return_value=[]),
        patch("app.routers.plans.get_course_research_cache_by_id", side_effect=RuntimeError("bad row")),
    ):
        response = _build_expanded_plan_response(client, plan_id)

    assert response["plan_id"] == plan_id
    assert response["payload_version"] == 2
    assert len(response["classes"]) == 1
    assert response["classes"][0]["cache_id"] == "bad-cache-id"
    assert response["classes"][0]["missing"] is True
    assert "Failed to expand cached course" in response["classes"][0]["error"]
