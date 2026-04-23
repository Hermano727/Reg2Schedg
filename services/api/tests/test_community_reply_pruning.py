from app.db.community import _prune_deleted_reply_subtrees


def _row(reply_id: str, parent_reply_id: str | None, is_deleted: bool) -> dict:
    return {
        "id": reply_id,
        "parent_reply_id": parent_reply_id,
        "is_deleted": is_deleted,
    }


def test_prunes_fully_deleted_branch():
    rows = [
        _row("a", None, True),
        _row("b", "a", True),
        _row("c", "b", True),
    ]
    pruned = _prune_deleted_reply_subtrees(rows)
    assert pruned == []


def test_keeps_deleted_ancestor_for_visible_descendant():
    rows = [
        _row("a", None, True),
        _row("b", "a", True),
        _row("c", "b", False),
    ]
    pruned = _prune_deleted_reply_subtrees(rows)
    ids = [row["id"] for row in pruned]
    assert ids == ["a", "b", "c"]


def test_keeps_non_deleted_roots_and_prunes_deleted_leaf_chain():
    rows = [
        _row("a", None, False),
        _row("b", "a", True),
        _row("c", "b", True),
        _row("d", "a", False),
    ]
    pruned = _prune_deleted_reply_subtrees(rows)
    ids = [row["id"] for row in pruned]
    assert ids == ["a", "d"]
