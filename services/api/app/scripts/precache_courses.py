"""
Pre-cache pipeline: warm course_research_cache from sunset_grade_distributions.

Reads all (normalized_course_code, normalized_professor_name) pairs from the
sunset_grade_distributions table, skips any that are already in course_research_cache,
and runs the tiered pipeline (Tiers 0-3, no Browser Use) for each pending pair.

Usage:
    # Dry-run — see what would be cached, no API calls
    python -m app.scripts.precache_courses --dry-run

    # Cache all CSE + MATH courses
    python -m app.scripts.precache_courses --prefix CSE,MATH

    # Cache one exact course code (space-friendly)
    python -m app.scripts.precache_courses --course MAE 143A

    # Full catalog run (paid Gemini tier — adjust delay as needed)
    python -m app.scripts.precache_courses --delay 2.0

    # Quick test with 5 courses
    python -m app.scripts.precache_courses --prefix CSE --limit 5

    # Re-run only low-quality cached entries (score < 2), no Browser Use
    python -m app.scripts.precache_courses --threshold 2 --prefix CSE --delay 2.0

Rate limiting:
    Each pipeline run makes ~2 Gemini calls (Tier 0.5 + Tier 3).
    --delay 6.0   → safe for Gemini free tier  (10 RPM per call type)
    --delay 2.0   → safe for Gemini paid tier  (~30 pairs/min)
    --delay 1.5   → aggressive, watch for 429s on Reddit

Environment:
    Requires SUPABASE_URL, SUPABASE_KEY (or SUPABASE_SERVICE_KEY), GEMINI_API_KEY.
    Loads from services/api/.env automatically via dotenv.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import re
import sys
from pathlib import Path

# Allow running as `python -m app.scripts.precache_courses` from services/api/
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from dotenv import load_dotenv

load_dotenv()

_log = logging.getLogger("precache")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def _get_client():
    from app.db.client import get_supabase_client
    return get_supabase_client()


def fetch_pairs_from_sunset(client) -> list[tuple[str, str]]:
    """
    Return all distinct (normalized_course_code, normalized_professor_name) pairs
    from sunset_grade_distributions via paginated scan.
    """
    pairs: set[tuple[str, str]] = set()
    offset = 0
    page_size = 1000

    while True:
        resp = (
            client.table("sunset_grade_distributions")
            .select("normalized_course_code,normalized_professor_name")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not resp.data:
            break
        for row in resp.data:
            cc = (row.get("normalized_course_code") or "").strip()
            pn = (row.get("normalized_professor_name") or "").strip()
            if cc:
                pairs.add((cc, pn))
        if len(resp.data) < page_size:
            break
        offset += page_size

    return sorted(pairs)


def fetch_already_cached(client) -> set[tuple[str, str]]:
    """
    Return the set of (normalized_course_code, normalized_professor_name) already
    present in course_research_cache for O(1) skip checks.
    """
    cached: set[tuple[str, str]] = set()
    offset = 0
    page_size = 1000

    while True:
        resp = (
            client.table("course_research_cache")
            .select("normalized_course_code,normalized_professor_name")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not resp.data:
            break
        for row in resp.data:
            cc = (row.get("normalized_course_code") or "").strip()
            pn = (row.get("normalized_professor_name") or "").strip()
            cached.add((cc, pn))
        if len(resp.data) < page_size:
            break
        offset += page_size

    return cached


def fetch_cached_rows_for_scoring(client) -> list[dict]:
    """Fetch cached rows with logistics payload for threshold-based reruns."""
    rows: list[dict] = []
    offset = 0
    page_size = 1000

    while True:
        resp = (
            client.table("course_research_cache")
            .select("normalized_course_code,normalized_professor_name,logistics")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not resp.data:
            break
        rows.extend(resp.data)
        if len(resp.data) < page_size:
            break
        offset += page_size

    return rows


def quality_score(logistics: dict) -> int:
    """Score cache richness using the same 0-5 rubric as audit/enrichment scripts."""
    score = 0
    if logistics.get("professor_info_found", True):
        score += 1
    evidence = logistics.get("evidence") or []
    if len(evidence) >= 1:
        score += 1
    if len(evidence) >= 3:
        score += 1
    if logistics.get("student_sentiment_summary"):
        score += 1
    if logistics.get("grade_breakdown"):
        score += 1
    return score


def fetch_pairs_below_threshold(client, threshold: int) -> list[tuple[str, str]]:
    """Return distinct cached pairs whose logistics quality score is below threshold."""
    rows = fetch_cached_rows_for_scoring(client)
    pairs: set[tuple[str, str]] = set()

    for row in rows:
        cc = (row.get("normalized_course_code") or "").strip()
        pn = (row.get("normalized_professor_name") or "").strip()
        logistics = row.get("logistics") or {}
        if cc and quality_score(logistics) < threshold:
            pairs.add((cc, pn))

    return sorted(pairs)


def filter_by_prefix(
    pairs: list[tuple[str, str]],
    prefixes: list[str],
) -> list[tuple[str, str]]:
    """
    Keep pairs where the first token of normalized_course_code matches one of
    the given prefixes (case-insensitive).

    e.g. prefixes=["CSE", "MATH"] keeps ("cse 120", ...) and ("math 103b", ...).
    """
    prefix_set = {p.upper() for p in prefixes}
    return [
        (cc, pn)
        for (cc, pn) in pairs
        if cc.split()[0].upper() in prefix_set
    ]


def filter_by_exact_course(
    pairs: list[tuple[str, str]],
    course_code: str,
) -> list[tuple[str, str]]:
    """Keep pairs whose normalized course code exactly matches course_code.

    Accepts either spaced or compact input, e.g. "MAE 143A" and "MAE143A".
    """
    from app.utils.normalize import normalize_course_code

    def _normalize_course_arg(raw: str) -> str:
        cleaned = " ".join(raw.upper().split())
        # Accept compact forms like MAE143A by inserting a space before digits.
        if " " not in cleaned:
            m = re.match(r"^([A-Z&]+)(\d.*)$", cleaned)
            if m:
                cleaned = f"{m.group(1)} {m.group(2)}"
        return normalize_course_code(cleaned)

    normalized_target = _normalize_course_arg(course_code)
    return [
        (cc, pn)
        for (cc, pn) in pairs
        if normalize_course_code(cc) == normalized_target
    ]


def is_grad_course(course_code: str) -> bool:
    """
    Return True if the course number is 200 or above (UCSD graduate-level).

    e.g. "CSE 200", "BIOL 220A" → True
         "CSE 120", "MATH 20C"  → False
    """
    import re
    tokens = course_code.split()
    if len(tokens) < 2:
        return False
    # Extract the leading integer from the course number token (e.g. "103B" → 103)
    m = re.match(r"(\d+)", tokens[1])
    if not m:
        return False
    return int(m.group(1)) >= 200


def filter_undergrad_only(pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Drop graduate courses (course number ≥ 200) from the list."""
    return [(cc, pn) for (cc, pn) in pairs if not is_grad_course(cc)]


# ---------------------------------------------------------------------------
# Per-pair caching
# ---------------------------------------------------------------------------

async def precache_one(
    client,
    course_code: str,
    professor_name: str | None,
) -> str:
    """
    Run the tiered pipeline for (course_code, professor_name) and upsert the result
    into course_research_cache with data_source='prepopulate_job'.

    Returns a status string: "cached" or "error: <msg>".
    """
    from app.services.course_research import _research_via_tiered_pipeline
    from app.db.service import upsert_course_research_cache

    outcome = await _research_via_tiered_pipeline(
        course_code=course_code,
        professor_name=professor_name,
    )

    upsert_course_research_cache(
        client,
        course_code=course_code,
        professor_name=professor_name,
        course_title=None,
        logistics=outcome.logistics.model_dump(mode="json"),
        model="gemini-2.5-flash",
        data_source="prepopulate_job",
    )

    return "cached"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main(
    prefixes: list[str] | None,
    exact_course_code: str | None,
    threshold: int | None,
    dry_run: bool,
    limit: int | None,
    offset: int,
    delay_seconds: float,
    force: bool,
) -> None:
    client = _get_client()

    if threshold is not None:
        if force:
            _log.info("Ignoring --force because --threshold targets existing cached rows only")
        _log.info("Fetching cached entries below quality threshold %d...", threshold)
        pending = fetch_pairs_below_threshold(client, threshold)
        _log.info("Found %d cached pairs below threshold %d", len(pending), threshold)
    else:
        _log.info("Fetching pairs from sunset_grade_distributions...")
        all_pairs = fetch_pairs_from_sunset(client)
        _log.info("Found %d (course, professor) pairs in sunset_grade_distributions", len(all_pairs))

        # Always skip graduate courses (course number ≥ 200) — they're out of scope.
        all_pairs = filter_undergrad_only(all_pairs)
        _log.info("After skipping grad courses (≥200): %d pairs remain", len(all_pairs))

        if not force:
            _log.info("Fetching already-cached pairs...")
            already_cached = fetch_already_cached(client)
            _log.info("Already cached: %d pairs — will skip these", len(already_cached))
            pending = [(cc, pn) for (cc, pn) in all_pairs if (cc, pn) not in already_cached]
            _log.info("Pending (cache miss): %d pairs", len(pending))
        else:
            _log.info("--force: re-caching all pairs (including existing cache rows)")
            pending = list(all_pairs)
            _log.info("Pending (--force): %d pairs", len(pending))

    if prefixes:
        pending = filter_by_prefix(pending, prefixes)
        _log.info("After --prefix %s: %d pairs", ",".join(prefixes), len(pending))

    if exact_course_code:
        pending = filter_by_exact_course(pending, exact_course_code)
        _log.info("After --course %s: %d pairs", exact_course_code, len(pending))

    if offset:
        pending = pending[offset:]
        _log.info("After --offset %d: %d pairs remaining", offset, len(pending))

    if limit:
        pending = pending[:limit]
        _log.info("After --limit %d: %d pairs", limit, len(pending))

    if not pending:
        _log.info("Nothing to cache. Exiting.")
        return

    if dry_run:
        print(f"\n{'='*60}")
        print(f"DRY RUN — {len(pending)} pairs would be cached:")
        print(f"{'='*60}")
        for cc, pn in pending:
            print(f"  {cc:<30} / {pn or '(no professor)'}")
        print(f"{'='*60}")
        print(f"Estimated cost: ~${len(pending) * 0.0005:.4f} (at $0.0005/course)")
        print(f"Estimated time: ~{len(pending) * delay_seconds / 60:.1f} min (at {delay_seconds}s delay)")
        return

    _log.info(
        "Starting cache run: %d pairs | delay=%.1fs | est. cost=$%.4f | est. time=%.1f min",
        len(pending),
        delay_seconds,
        len(pending) * 0.0005,
        len(pending) * delay_seconds / 60,
    )

    ok = errors = 0
    total = len(pending)

    for i, (cc, pn) in enumerate(pending, start=1):
        prof_display = pn or "(no professor)"
        try:
            status = await precache_one(client, cc, pn or None)
            ok += 1
            _log.info("[%d/%d] OK    %s / %s", i, total, cc, prof_display)
        except Exception as exc:
            errors += 1
            _log.warning("[%d/%d] ERROR %s / %s: %s", i, total, cc, prof_display, exc)

        # Rate limiting between pipeline runs
        if i < total:
            await asyncio.sleep(delay_seconds)

    print(f"\n{'='*60}")
    print(f"Pre-cache complete: OK={ok}  Errors={errors}  Total={total}")
    print(f"{'='*60}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Pre-warm course_research_cache from sunset_grade_distributions",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m app.scripts.precache_courses --dry-run
  python -m app.scripts.precache_courses --prefix CSE,MATH,COGS --dry-run
    python -m app.scripts.precache_courses --course MAE 143A --dry-run
    python -m app.scripts.precache_courses --threshold 2 --prefix CSE --delay 2.0
  python -m app.scripts.precache_courses --prefix CSE,MATH --delay 2.0
  python -m app.scripts.precache_courses --prefix CSE --limit 5

Rate limiting guide:
  --delay 6.0   Gemini free tier  (10 RPM; 2 calls/course → 5 pairs/min)
  --delay 2.0   Gemini paid tier  (~30 pairs/min)
  --delay 1.5   Aggressive — watch for Reddit 429s
        """,
    )
    parser.add_argument(
        "--prefix",
        type=str,
        default=None,
        help="Comma-separated course code prefixes to filter (e.g. CSE,MATH,COGS)",
    )
    parser.add_argument(
        "--course",
        nargs="+",
        default=None,
        help="Exact course code to filter (spaces allowed), e.g. --course MAE 143A",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=None,
        help="Re-run only cached entries with quality score below this value (e.g. 2)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be cached without making any API calls",
    )
    parser.add_argument(
        "--offset",
        type=int,
        default=0,
        help="Skip the first N pairs (use to resume a --force run from a specific entry)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max number of pairs to process (useful for testing)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=2.0,
        help="Seconds to sleep between pipeline runs (default: 2.0)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-cache pairs that are already in course_research_cache (overwrite)",
    )
    args = parser.parse_args()

    prefixes = [p.strip().upper() for p in args.prefix.split(",")] if args.prefix else None
    exact_course_code = " ".join(args.course).strip() if args.course else None

    asyncio.run(main(
        prefixes=prefixes,
        exact_course_code=exact_course_code,
        threshold=args.threshold,
        dry_run=args.dry_run,
        offset=args.offset,
        limit=args.limit,
        delay_seconds=args.delay,
        force=args.force,
    ))
