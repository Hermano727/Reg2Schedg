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

    # Full catalog run (paid Gemini tier — adjust delay as needed)
    python -m app.scripts.precache_courses --delay 2.0

    # Quick test with 5 courses
    python -m app.scripts.precache_courses --prefix CSE --limit 5

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
    dry_run: bool,
    limit: int | None,
    offset: int,
    delay_seconds: float,
    force: bool,
) -> None:
    client = _get_client()

    _log.info("Fetching pairs from sunset_grade_distributions...")
    all_pairs = fetch_pairs_from_sunset(client)
    _log.info("Found %d (course, professor) pairs in sunset_grade_distributions", len(all_pairs))

    if not force:
        _log.info("Fetching already-cached pairs...")
        already_cached = fetch_already_cached(client)
        _log.info("Already cached: %d pairs — will skip these", len(already_cached))
        pending = [(cc, pn) for (cc, pn) in all_pairs if (cc, pn) not in already_cached]
    else:
        _log.info("--force: re-caching all pairs (including existing cache rows)")
        pending = list(all_pairs)

    _log.info("Pending (cache miss): %d pairs", len(pending))

    if prefixes:
        pending = filter_by_prefix(pending, prefixes)
        _log.info("After --prefix %s: %d pairs", ",".join(prefixes), len(pending))

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

    asyncio.run(main(
        prefixes=prefixes,
        dry_run=args.dry_run,
        offset=args.offset,
        limit=args.limit,
        delay_seconds=args.delay,
        force=args.force,
    ))
