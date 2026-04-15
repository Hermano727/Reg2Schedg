"""
Tier 0: Reddit search — no API key required.

Strategy (in order):
  1. Multi-query Reddit public JSON API — runs up to 4 concurrent queries against
     r/ucsd (course code, no-space variant, professor last name, professor+number)
  2. PullPush fallback — api.pullpush.io (Pushshift successor, free, no key needed)

Tier 0.5: Gemini Flash relevance scoring (score_and_filter_reddit_posts).
  After Tier 0 returns raw posts, this function scores each post's relevance to the
  specific (course, professor) and extracts pre-scored EvidenceItems for the synthesizer.

Both return RedditPost / EvidenceItem objects.  All errors return [] silently — callers
never need to handle Reddit failures.

No env vars required for Tier 0; GEMINI_API_KEY is needed for Tier 0.5 (optional).
"""

from __future__ import annotations

import asyncio
import logging
import os

import httpx
from pydantic import BaseModel

from app.models.research import EvidenceItem, RedditPost

_log = logging.getLogger(__name__)

# Reddit's public JSON endpoints require a descriptive User-Agent or they 429.
_USER_AGENT = "Reg2Schedg/1.0 (academic planner; contact via GitHub)"

_REDDIT_SEARCH_URL = "https://www.reddit.com/r/ucsd/search.json"
_PULLPUSH_SEARCH_URL = "https://api.pullpush.io/reddit/search/submission/"

_TIMEOUT = 12.0
_MAX_COMMENT_CHARS = 400
_MAX_BODY_CHARS = 600


# ---------------------------------------------------------------------------
# Public entry point — Tier 0
# ---------------------------------------------------------------------------

async def search_reddit_ucsd(
    course_code: str,
    *,
    professor_name: str | None = None,
    max_posts: int = 10,
    timeout_seconds: float = _TIMEOUT,
) -> list[RedditPost]:
    """
    Search r/ucsd for posts about course_code (optionally anchored to professor_name).

    Runs multiple queries concurrently:
      - "CSE 120"        (as-written)
      - "CSE120"         (no-space — students commonly write this)
      - "Voelker 120"    (professor last name + course number, if professor known)
      - "Voelker"        (professor last name alone, captures sentiment threads)

    Falls back to PullPush if all Reddit JSON queries return fewer than 3 total posts.
    Returns [] on any error.
    """
    try:
        return await asyncio.wait_for(
            _search_with_fallback(
                course_code,
                professor_name=professor_name,
                max_posts=max_posts,
            ),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError:
        _log.warning("[reddit] search timed out for %s", course_code)
        return []
    except Exception as exc:
        _log.warning("[reddit] search failed for %s: %s", course_code, exc)
        return []


# ---------------------------------------------------------------------------
# Internal: query builder
# ---------------------------------------------------------------------------

def _build_queries(course_code: str, professor_name: str | None) -> list[str]:
    """
    Build an ordered, deduplicated list of search queries for r/ucsd.

    Intentionally excludes the numeric-only fallback (e.g. "120") because it is
    too noisy — "120" matches CSE 120, COGS 120, MATH 120, etc. simultaneously.
    PullPush fallback on the primary query handles the thin-results case instead.
    """
    seen: set[str] = set()
    queries: list[str] = []

    def add(q: str) -> None:
        q = q.strip()
        if q and q not in seen:
            queries.append(q)
            seen.add(q)

    # "CSE 120"
    add(course_code)
    # "CSE120" — students frequently omit the space
    add(course_code.replace(" ", ""))

    if professor_name and professor_name.strip():
        # Normalized DB format is "LAST, FIRST MIDDLE" (e.g. "COTTRELL, GARRISON W").
        # Extract the surname (part before comma) to avoid grabbing middle initials.
        name = professor_name.strip()
        surname_part = name.split(",")[0].strip() if "," in name else name
        last = surname_part.split()[-1]  # last word of surname handles "SOOSAI RAJ" → "RAJ"
        numeric = _extract_numeric_part(course_code)  # "120" from "CSE 120"

        # "Voelker 120"
        if numeric:
            add(f"{last} {numeric}")

        # "Voelker"
        add(last)

    return queries


# ---------------------------------------------------------------------------
# Internal: Reddit public JSON API (Tier 0a)
# ---------------------------------------------------------------------------

async def _search_reddit_json(
    query: str,
    *,
    limit: int,
    client: httpx.AsyncClient,
    _stagger: float = 0.0,
) -> list[RedditPost]:
    """Hit reddit.com/r/ucsd/search.json — no auth, just User-Agent."""
    if _stagger:
        await asyncio.sleep(_stagger)
    try:
        params = {
            "q": query,
            "restrict_sr": "1",
            "sort": "relevance",
            "type": "link",
            "limit": str(min(limit, 25)),  # Reddit caps at 25 without auth
            "t": "all",
        }
        resp = await client.get(_REDDIT_SEARCH_URL, params=params)
        # Single retry on 429/403 — Reddit uses both as rate-limit signals.
        # Back off 2s then try once more before giving up.
        if resp.status_code in (429, 403):
            await asyncio.sleep(2.0)
            resp = await client.get(_REDDIT_SEARCH_URL, params=params)
        if resp.status_code != 200:
            _log.debug("[reddit:json] status %s for %r", resp.status_code, query)
            return []

        data = resp.json()
        children = data.get("data", {}).get("children", [])
        posts: list[RedditPost] = []
        for child in children:
            p = child.get("data", {})
            title = p.get("title", "").strip()
            if not title:
                continue
            permalink = p.get("permalink", "")
            url = f"https://www.reddit.com{permalink}" if permalink else p.get("url", "")
            body = (p.get("selftext") or "")[:_MAX_BODY_CHARS]
            score = p.get("score", 0) or 0

            # Comment body fetches (.json on individual posts) are universally
            # 403-blocked by Reddit for unauthenticated requests. Skipping them
            # eliminates ~40 wasted sequential requests per course and the 12s
            # timeout that results for popular courses with many search hits.
            # Post titles + body snippets from search are sufficient for synthesis.

            posts.append(RedditPost(
                title=title,
                body=body,
                url=url,
                score=score,
                top_comments=[],
            ))

        return posts

    except Exception as exc:
        _log.debug("[reddit:json] error for %r: %s", query, exc)
        return []


async def _fetch_comments_reddit_json(
    permalink: str,
    *,
    client: httpx.AsyncClient,
) -> list[str]:
    """Fetch the top 5 comments for a post via the .json endpoint."""
    if not permalink:
        return []
    try:
        url = f"https://www.reddit.com{permalink}.json?limit=5&sort=top"
        resp = await client.get(url)
        if resp.status_code != 200:
            return []
        data = resp.json()
        # data[1] is the comments listing
        if not isinstance(data, list) or len(data) < 2:
            return []
        comments_listing = data[1].get("data", {}).get("children", [])
        result: list[str] = []
        for child in comments_listing:
            body = child.get("data", {}).get("body", "")
            if body and body not in ("[deleted]", "[removed]"):
                result.append(body[:_MAX_COMMENT_CHARS])
            if len(result) >= 5:
                break
        return result
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Internal: PullPush fallback (Tier 0b)
# ---------------------------------------------------------------------------

async def _search_pullpush(
    query: str,
    *,
    limit: int,
    client: httpx.AsyncClient,
) -> list[RedditPost]:
    """
    Query PullPush (https://pullpush.io) — free Pushshift successor, no auth.
    Returns Reddit posts from r/ucsd sorted by most recent.
    """
    try:
        resp = await client.get(
            _PULLPUSH_SEARCH_URL,
            params={
                "q": query,
                "subreddit": "ucsd",
                "size": str(min(limit, 25)),
                "sort": "desc",
                "sort_type": "score",
            },
        )
        if resp.status_code != 200:
            _log.debug("[pullpush] status %s for %r", resp.status_code, query)
            return []

        data = resp.json()
        items = data.get("data", [])
        posts: list[RedditPost] = []
        for item in items:
            title = item.get("title", "").strip()
            if not title:
                continue
            permalink = item.get("permalink", "")
            if permalink and not permalink.startswith("http"):
                permalink = f"https://www.reddit.com{permalink}"
            elif not permalink:
                post_id = item.get("id", "")
                subreddit = item.get("subreddit", "ucsd")
                permalink = f"https://www.reddit.com/r/{subreddit}/comments/{post_id}/"

            body = (item.get("selftext") or "")[:_MAX_BODY_CHARS]
            score = item.get("score", 0) or 0

            posts.append(RedditPost(
                title=title,
                body=body,
                url=permalink,
                score=score,
                top_comments=[],  # PullPush submission API doesn't include comments
            ))

        return posts

    except Exception as exc:
        _log.debug("[pullpush] error for %r: %s", query, exc)
        return []


# ---------------------------------------------------------------------------
# Internal: combined multi-query search with fallback
# ---------------------------------------------------------------------------

async def _search_with_fallback(
    course_code: str,
    *,
    professor_name: str | None,
    max_posts: int,
) -> list[RedditPost]:
    headers = {"User-Agent": _USER_AGENT}
    queries = _build_queries(course_code, professor_name)

    async with httpx.AsyncClient(
        headers=headers,
        timeout=_TIMEOUT,
        follow_redirects=True,
    ) as client:
        # Stagger query starts by 0.6s to avoid Reddit rate-limiting bursts.
        # All 4 queries still run concurrently — the stagger just spreads the
        # first-request spike over ~1.8s instead of firing all at t=0.
        results = await asyncio.gather(
            *[
                _search_reddit_json(q, limit=max_posts, client=client, _stagger=i * 0.6)
                for i, q in enumerate(queries)
            ],
            return_exceptions=True,
        )

        # Merge, deduplicate by URL, preserve order
        seen_urls: set[str] = set()
        posts: list[RedditPost] = []
        for batch in results:
            if isinstance(batch, Exception):
                continue
            for p in batch:
                if p.url not in seen_urls:
                    seen_urls.add(p.url)
                    posts.append(p)

        _log.info(
            "[reddit] %d unique posts from %d queries for %r",
            len(posts), len(queries), course_code,
        )

        # PullPush fallback on primary query only if still thin
        if len(posts) < 3:
            _log.info("[reddit] thin results, trying PullPush for %r", queries[0])
            pp_posts = await _search_pullpush(queries[0], limit=max_posts, client=client)
            for p in pp_posts:
                if p.url not in seen_urls:
                    seen_urls.add(p.url)
                    posts.append(p)
            _log.info("[reddit] %d posts after PullPush fallback for %r", len(posts), course_code)

    return posts[:max_posts]


def _extract_numeric_part(course_code: str) -> str | None:
    """'CSE 110' → '110', 'CSE 110L' → '110L'. Returns None if no numeric part found."""
    parts = course_code.strip().split()
    for part in reversed(parts):
        if part[0].isdigit() or (len(part) > 1 and part[:-1].isdigit()):
            return part
    return None


# ---------------------------------------------------------------------------
# Tier 0.5: Gemini Flash relevance scoring
# ---------------------------------------------------------------------------

class _ScoredPost(BaseModel):
    url: str
    relevance_score: float  # 0.0–1.0
    evidence_quote: str | None = None  # verbatim quote, only when score >= evidence_threshold


class _RedditScoringResponse(BaseModel):
    scored_posts: list[_ScoredPost]


async def score_and_filter_reddit_posts(
    posts: list[RedditPost],
    course_code: str,
    professor_name: str | None,
    *,
    relevance_threshold: float = 0.3,
    evidence_threshold: float = 0.6,
    gemini_model: str = "gemini-2.5-flash",
) -> tuple[list[RedditPost], list[EvidenceItem]]:
    """
    Tier 0.5: Use Gemini Flash to score each Reddit post's relevance to
    (course_code, professor_name), then filter and extract pre-scored evidence.

    Returns:
        (filtered_posts, pre_extracted_evidence_items)

    - Posts below relevance_threshold (0.3) are dropped.
    - Posts above evidence_threshold (0.6) have a verbatim quote extracted as EvidenceItem.
    - On any Gemini error, returns (original_posts, []) — never blocks the pipeline.
    - Does nothing if posts is empty (no Gemini call, zero cost).
    """
    if not posts:
        return posts, []

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        _log.warning("[reddit:score] GEMINI_API_KEY not set, skipping Tier 0.5 scoring")
        return posts, []

    try:
        from google import genai
        from google.genai import types

        # Build compact prompt — title + truncated body + top comments per post
        post_lines: list[str] = []
        for post in posts:
            comments_preview = " | ".join(c[:150] for c in post.top_comments[:3])
            post_lines.append(
                f"URL: {post.url}\n"
                f"TITLE: {post.title}\n"
                f"BODY: {post.body[:300]}\n"
                f"COMMENTS: {comments_preview or '(none)'}"
            )
        posts_block = "\n\n".join(post_lines)

        prof_clause = f" taught by {professor_name}" if professor_name else ""
        prompt = (
            f"You are scoring Reddit posts from r/ucsd for relevance to the course "
            f"{course_code}{prof_clause}.\n\n"
            f"For each post, identified by its exact URL, return:\n"
            f"- relevance_score: 0.0–1.0 "
            f"(1.0 = directly discusses this specific course or professor, "
            f"0.0 = unrelated)\n"
            f"- evidence_quote: a single verbatim sentence from the post or its comments "
            f"that best captures a student opinion or fact about the course/professor. "
            f"Only include if relevance_score >= {evidence_threshold}, else null.\n\n"
            f"Posts to score:\n\n{posts_block}\n\n"
            f"Return a JSON object with a 'scored_posts' array containing one entry per post URL."
        )

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=gemini_model,
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_RedditScoringResponse,
            ),
        )
        scoring = _RedditScoringResponse.model_validate_json(response.text)

    except Exception as exc:
        _log.warning(
            "[reddit:score] Gemini scoring failed for %s — using unfiltered posts: %s",
            course_code, exc,
        )
        return posts, []

    # Build URL → scored result map
    score_map: dict[str, _ScoredPost] = {s.url: s for s in scoring.scored_posts}

    filtered: list[RedditPost] = []
    evidence: list[EvidenceItem] = []

    for post in posts:
        scored = score_map.get(post.url)
        if scored is None:
            # Gemini didn't return a score for this URL — keep it (safe default)
            filtered.append(post)
            continue
        if scored.relevance_score < relevance_threshold:
            _log.debug(
                "[reddit:score] dropping low-relevance post (%.2f): %s",
                scored.relevance_score, post.url,
            )
            continue
        filtered.append(post)
        if scored.relevance_score >= evidence_threshold and scored.evidence_quote:
            evidence.append(EvidenceItem(
                source="Reddit Insight",
                content=scored.evidence_quote,
                url=post.url,
                relevance_score=round(scored.relevance_score, 3),
            ))

    _log.info(
        "[reddit:score] %d/%d posts kept, %d evidence items for %s",
        len(filtered), len(posts), len(evidence), course_code,
    )
    return filtered, evidence
