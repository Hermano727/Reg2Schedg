"""
Tier 0: Reddit API client using asyncpraw.

Searches r/ucsd for posts mentioning a course code and returns structured
RedditPost objects.  All errors are caught and return an empty list — the
caller is never responsible for handling Reddit failures.

Required env vars (all optional — if absent, returns [] silently):
    REDDIT_CLIENT_ID
    REDDIT_CLIENT_SECRET
    REDDIT_USER_AGENT  (default: "Reg2Schedg/1.0")
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

from app.models.research import RedditPost

_log = logging.getLogger(__name__)

_reddit_instance: object | None = None


def _get_reddit() -> object | None:
    """Return a cached asyncpraw.Reddit read-only instance, or None if unconfigured."""
    global _reddit_instance
    if _reddit_instance is not None:
        return _reddit_instance

    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    if not client_id or not client_secret:
        _log.debug("[reddit] REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set — Tier 0 disabled")
        return None

    user_agent = os.getenv("REDDIT_USER_AGENT", "Reg2Schedg/1.0")
    try:
        import asyncpraw  # noqa: PLC0415
        _reddit_instance = asyncpraw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=user_agent,
        )
        return _reddit_instance
    except Exception as exc:
        _log.warning("[reddit] Failed to create asyncpraw client: %s", exc)
        return None


async def search_reddit_ucsd(
    course_code: str,
    *,
    max_posts: int = 10,
    timeout_seconds: float = 8.0,
) -> list[RedditPost]:
    """
    Search r/ucsd for posts mentioning course_code.

    Returns an empty list on any error — callers must tolerate absence.
    Retries with just the numeric part (e.g. '110' from 'CSE 110') when
    the full query yields fewer than 3 results.
    """
    reddit = _get_reddit()
    if reddit is None:
        return []

    try:
        return await asyncio.wait_for(
            _do_search(reddit, course_code, max_posts=max_posts),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError:
        _log.warning("[reddit] search timed out for %s", course_code)
        return []
    except Exception as exc:
        _log.warning("[reddit] search failed for %s: %s", course_code, exc)
        return []


async def _do_search(
    reddit: object,
    course_code: str,
    *,
    max_posts: int,
) -> list[RedditPost]:
    subreddit = await reddit.subreddit("ucsd")  # type: ignore[union-attr]
    posts = await _collect_posts(subreddit, course_code, limit=max_posts)

    # Retry with just the numeric part if too few results
    if len(posts) < 3:
        parts = course_code.strip().split()
        numeric_part = next((p for p in reversed(parts) if p.isdigit() or p[:-1].isdigit()), None)
        if numeric_part and numeric_part != course_code:
            extra = await _collect_posts(subreddit, numeric_part, limit=max_posts - len(posts))
            seen_urls = {p.url for p in posts}
            for p in extra:
                if p.url not in seen_urls:
                    posts.append(p)

    return posts[:max_posts]


async def _collect_posts(subreddit: object, query: str, *, limit: int) -> list[RedditPost]:
    posts: list[RedditPost] = []
    async for submission in subreddit.search(query, sort="relevance", limit=limit):  # type: ignore[union-attr]
        top_comments: list[str] = []
        try:
            await submission.comments.replace_more(limit=0)
            sorted_comments = sorted(
                submission.comments.list(),
                key=lambda c: getattr(c, "score", 0),
                reverse=True,
            )
            top_comments = [
                c.body[:400]
                for c in sorted_comments[:5]
                if hasattr(c, "body") and c.body not in ("[deleted]", "[removed]")
            ]
        except Exception:
            pass  # comments are nice-to-have; don't fail the post

        posts.append(RedditPost(
            title=submission.title,
            body=(submission.selftext or "")[:600],
            url=f"https://reddit.com{submission.permalink}",
            score=submission.score or 0,
            top_comments=top_comments,
        ))

    return posts
