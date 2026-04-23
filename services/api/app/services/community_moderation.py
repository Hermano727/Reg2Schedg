from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.db.community import (
    count_recent_severe_block_events,
    create_community_mute,
    get_active_community_mute,
    log_community_moderation_event,
)

SEVERE_TERMS = {
    "faggot",
    "nigger",
    "nigga",
    "retard",
    "tranny",
    "kike",
    "chink",
}

# Pragmatic low-severity list for an academic SaaS community.
LOW_SEVERITY_TERMS = {
    "ass",
    "asshole",
    "bitch",
    "crap",
    "damn",
    "dick",
    "freaking",
    "fuck",
    "fucked",
    "fucker",
    "fucking",
    "hell",
    "idiot",
    "jerk",
    "pissed",
    "shit",
    "shitty",
    "stupid",
}

WORD_PATTERN = re.compile(r"[A-Za-z0-9@$!._'\-]+")
REPEATED_CHAR_PATTERN = re.compile(r"(.)\1{2,}")
LEET_TRANSLATION = str.maketrans(
    {
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "@": "a",
        "$": "s",
        "!": "i",
    }
)
ROLLING_WINDOW = timedelta(hours=24)
SHORT_MUTE = timedelta(hours=1)
LONG_MUTE = timedelta(hours=24)


@dataclass
class ModerationTextResult:
    text: str
    severity: str | None
    matched_terms: list[str]
    action: str | None


def _normalize_token(token: str) -> str:
    normalized = token.lower().translate(LEET_TRANSLATION)
    normalized = re.sub(r"[^a-z]", "", normalized)
    if not normalized:
        return ""
    return REPEATED_CHAR_PATTERN.sub(r"\1\1", normalized)


def _tokenize_with_normalization(text: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for raw in WORD_PATTERN.findall(text):
        normalized = _normalize_token(raw)
        if normalized:
            pairs.append((raw, normalized))
    return pairs


def _mask_token(token: str) -> str:
    if len(token) <= 2:
        return "*" * len(token)
    return f"{token[0]}{'*' * (len(token) - 2)}{token[-1]}"


def _mask_text_for_terms(text: str, terms: set[str]) -> str:
    if not terms:
        return text

    def repl(match: re.Match[str]) -> str:
        token = match.group(0)
        if _normalize_token(token) in terms:
            return _mask_token(token)
        return token

    return WORD_PATTERN.sub(repl, text)


def _scan_text(text: str) -> ModerationTextResult:
    normalized_tokens = {normalized for _, normalized in _tokenize_with_normalization(text)}
    severe_matches = sorted(normalized_tokens & SEVERE_TERMS)
    if severe_matches:
        return ModerationTextResult(
            text=text,
            severity="severe",
            matched_terms=severe_matches,
            action="blocked",
        )

    low_matches = sorted(normalized_tokens & LOW_SEVERITY_TERMS)
    if low_matches:
        return ModerationTextResult(
            text=_mask_text_for_terms(text, set(low_matches)),
            severity="low",
            matched_terms=low_matches,
            action="masked",
        )

    return ModerationTextResult(text=text, severity=None, matched_terms=[], action=None)


def enforce_active_mute(user_id: str) -> None:
    mute_row = get_active_community_mute(user_id)
    if not mute_row:
        return
    ends_at = datetime.fromisoformat(mute_row["ends_at"].replace("Z", "+00:00"))
    remaining = max(0, int((ends_at - datetime.now(timezone.utc)).total_seconds()))
    minutes = max(1, (remaining + 59) // 60)
    raise HTTPException(
        status_code=429,
        detail={
            "code": "COMMUNITY_MUTED",
            "message": f"You are temporarily muted from posting/commenting. Try again in about {minutes} minute(s).",
            "retry_after_seconds": remaining,
        },
    )


def _apply_strike_ladder_if_needed(user_id: str) -> None:
    severe_block_count = count_recent_severe_block_events(user_id, ROLLING_WINDOW)
    if severe_block_count < 3:
        return

    mute_duration = LONG_MUTE if severe_block_count >= 5 else SHORT_MUTE
    now = datetime.now(timezone.utc)
    ends_at = now + mute_duration
    reason = (
        "Repeated severe profanity detections (5 in 24h)."
        if severe_block_count >= 5
        else "Repeated severe profanity detections (3 in 24h)."
    )
    create_community_mute(
        user_id=user_id,
        reason=reason,
        source="profanity_filter",
        starts_at=now,
        ends_at=ends_at,
    )
    log_community_moderation_event(
        user_id=user_id,
        content_type="post",
        content_id=None,
        severity="severe",
        action="muted",
        matched_terms=[],
    )


def moderate_post_content(user_id: str, title: str, body: str) -> tuple[str, str]:
    title_result = _scan_text(title)
    body_result = _scan_text(body)
    if title_result.severity == "severe" or body_result.severity == "severe":
        matched = sorted(set(title_result.matched_terms + body_result.matched_terms))
        log_community_moderation_event(
            user_id=user_id,
            content_type="post",
            content_id=None,
            severity="severe",
            action="blocked",
            matched_terms=matched,
        )
        _apply_strike_ladder_if_needed(user_id)
        raise HTTPException(
            status_code=400,
            detail={
                "code": "PROFANITY_BLOCKED",
                "message": "Your post contains severe terms that are not allowed. Please reword and try again.",
            },
        )

    masked_terms = sorted(set(title_result.matched_terms + body_result.matched_terms))
    if masked_terms:
        log_community_moderation_event(
            user_id=user_id,
            content_type="post",
            content_id=None,
            severity="low",
            action="masked",
            matched_terms=masked_terms,
        )
    return title_result.text, body_result.text


def moderate_reply_content(user_id: str, body: str) -> str:
    body_result = _scan_text(body)
    if body_result.severity == "severe":
        log_community_moderation_event(
            user_id=user_id,
            content_type="reply",
            content_id=None,
            severity="severe",
            action="blocked",
            matched_terms=body_result.matched_terms,
        )
        _apply_strike_ladder_if_needed(user_id)
        raise HTTPException(
            status_code=400,
            detail={
                "code": "PROFANITY_BLOCKED",
                "message": "Your comment contains severe terms that are not allowed. Please reword and try again.",
            },
        )

    if body_result.matched_terms:
        log_community_moderation_event(
            user_id=user_id,
            content_type="reply",
            content_id=None,
            severity="low",
            action="masked",
            matched_terms=body_result.matched_terms,
        )
    return body_result.text
