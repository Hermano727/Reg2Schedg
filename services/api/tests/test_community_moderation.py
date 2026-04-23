from fastapi import HTTPException

from app.services import community_moderation as cm


def test_low_severity_terms_are_masked(monkeypatch):
    events = []
    monkeypatch.setattr(cm, "log_community_moderation_event", lambda **kwargs: events.append(kwargs))
    title, body = cm.moderate_post_content(
        user_id="u1",
        title="This class is damn hard",
        body="The homework is shitty but fair",
    )
    assert "damn" not in title.lower()
    assert "shitty" not in body.lower()
    assert "*" in title
    assert "*" in body
    assert any(event["action"] == "masked" for event in events)


def test_low_severity_obfuscated_term_is_masked(monkeypatch):
    events = []
    monkeypatch.setattr(cm, "log_community_moderation_event", lambda **kwargs: events.append(kwargs))
    title, body = cm.moderate_post_content(
        user_id="u1",
        title="Nothing bad here",
        body="This is sh!tty but manageable",
    )
    assert "sh!tty" not in body.lower()
    assert "*" in body
    assert title == "Nothing bad here"
    assert any(event["action"] == "masked" for event in events)


def test_severe_terms_block_post(monkeypatch):
    recorded = []
    monkeypatch.setattr(cm, "count_recent_severe_block_events", lambda *_: 1)
    monkeypatch.setattr(cm, "create_community_mute", lambda **_: None)
    monkeypatch.setattr(cm, "log_community_moderation_event", lambda **kwargs: recorded.append(kwargs))

    try:
        cm.moderate_post_content(user_id="u2", title="Normal title", body="contains nigger term")
        assert False, "Expected moderation block"
    except HTTPException as exc:
        assert exc.status_code == 400
        assert exc.detail["code"] == "PROFANITY_BLOCKED"

    assert any(event["action"] == "blocked" for event in recorded)


def test_severe_obfuscated_term_blocks_post(monkeypatch):
    recorded = []
    monkeypatch.setattr(cm, "count_recent_severe_block_events", lambda *_: 1)
    monkeypatch.setattr(cm, "create_community_mute", lambda **_: None)
    monkeypatch.setattr(cm, "log_community_moderation_event", lambda **kwargs: recorded.append(kwargs))

    try:
        cm.moderate_post_content(user_id="u2", title="Normal title", body="n.i.g.g.a in separators")
        assert False, "Expected moderation block"
    except HTTPException as exc:
        assert exc.status_code == 400
        assert exc.detail["code"] == "PROFANITY_BLOCKED"

    assert any(event["action"] == "blocked" for event in recorded)


def test_strike_ladder_creates_short_mute(monkeypatch):
    created_mutes = []
    monkeypatch.setattr(cm, "count_recent_severe_block_events", lambda *_: 3)
    monkeypatch.setattr(cm, "create_community_mute", lambda **kwargs: created_mutes.append(kwargs))
    monkeypatch.setattr(cm, "log_community_moderation_event", lambda **_: None)

    try:
        cm.moderate_reply_content(user_id="u3", body="retard")
        assert False, "Expected moderation block"
    except HTTPException:
        pass

    assert len(created_mutes) == 1
    mute = created_mutes[0]
    assert mute["source"] == "profanity_filter"
    assert "3 in 24h" in mute["reason"]


def test_active_mute_blocks_submission(monkeypatch):
    monkeypatch.setattr(
        cm,
        "get_active_community_mute",
        lambda _user_id: {"ends_at": "2099-01-01T00:00:00+00:00"},
    )
    try:
        cm.enforce_active_mute("u4")
        assert False, "Expected active mute to block action"
    except HTTPException as exc:
        assert exc.status_code == 429
        assert exc.detail["code"] == "COMMUNITY_MUTED"
