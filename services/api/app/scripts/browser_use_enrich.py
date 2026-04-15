"""
Browser Use enrichment pass: run Browser Use on poor-quality cache entries.

Reads course_research_cache, scores each entry, and re-runs Browser Use for
any entry below the quality threshold. Overwrites the cache row with the
richer result. Designed as a one-time pre-launch job, NOT a per-user pipeline.

Usage:
    # Dry-run: show what would be re-researched
    python -m app.scripts.browser_use_enrich --dry-run

    # Enrich all POOR entries (score 0-1) across CSE
    python -m app.scripts.browser_use_enrich --prefix CSE --threshold 2

    # Specific course/professor (targeted fix)
    python -m app.scripts.browser_use_enrich --course "CSE 123" --professor "Shalev, Aaron D"

    # Enrich first 10 poor entries only (cost-check run)
    python -m app.scripts.browser_use_enrich --limit 10 --threshold 2

    # Enrich entries that came from tiered_pipeline but have thin evidence
    python -m app.scripts.browser_use_enrich --prefix CSE,MATH,COGS --threshold 3

Cost estimate:
    Browser Use Cloud costs ~$0.05-0.20 per run depending on depth.
    With --threshold 2, expect ~30-50% of cached entries to qualify.
    For 136 CSE entries at $0.10 avg → ~$8-14 for a full CSE pass.
    Use --limit N for a budget-capped test first.

Rate limiting:
    --delay 5.0  (default) — conservative; Browser Use runs are heavy (10-30s each)
    --delay 3.0  — more aggressive, safe on paid Browser Use tier
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from dotenv import load_dotenv
load_dotenv()

_log = logging.getLogger("browser_use_enrich")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)


# ---------------------------------------------------------------------------
# Quality scoring (mirrors audit_cache.py)
# ---------------------------------------------------------------------------

def _score(logistics: dict) -> int:
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


# ---------------------------------------------------------------------------
# Candidate selection
# ---------------------------------------------------------------------------

def fetch_poor_entries(
    client,
    threshold: int,
    prefixes: list[str] | None,
    course_filter: str | None,
    professor_filter: str | None,
) -> list[dict]:
    """Paginate through course_research_cache and return rows below threshold."""
    rows: list[dict] = []
    offset = 0
    page_size = 1000

    while True:
        resp = (
            client.table("course_research_cache")
            .select(
                "course_code,professor_name,normalized_course_code,"
                "normalized_professor_name,logistics,data_source"
            )
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not resp.data:
            break
        rows.extend(resp.data)
        if len(resp.data) < page_size:
            break
        offset += page_size

    candidates: list[dict] = []
    for row in rows:
        cc = (row.get("normalized_course_code") or "").strip()
        pn = (row.get("normalized_professor_name") or "").strip()

        # Prefix filter
        if prefixes:
            dept = cc.split()[0].upper() if cc else ""
            if dept not in prefixes:
                continue

        # Specific course/professor filter
        if course_filter:
            from app.utils.normalize import normalize_course_code
            if normalize_course_code(course_filter) != cc:
                continue
        if professor_filter:
            from app.utils.normalize import normalize_professor_name
            if normalize_professor_name(professor_filter) != pn:
                continue

        logistics: dict = row.get("logistics") or {}
        score = _score(logistics)
        if score < threshold:
            candidates.append(row)

    return candidates


# ---------------------------------------------------------------------------
# Enrichment run
# ---------------------------------------------------------------------------

async def enrich_one(
    row: dict,
    *,
    db_client,
    bu_client,
    model: str,
) -> tuple[bool, str]:
    """
    Run Browser Use for one cache row and upsert the result.
    Returns (success, message).
    """
    from app.services.browser_use import run_course_logistics, CourseResearchRunError
    from app.db.service import upsert_course_research_cache

    course_code = row.get("course_code") or row.get("normalized_course_code") or ""
    professor_name = row.get("professor_name") or row.get("normalized_professor_name") or ""

    try:
        outcome = await run_course_logistics(bu_client, course_code, professor_name, model)
        logistics_dict = outcome.logistics.model_dump(mode="json")

        upsert_course_research_cache(
            db_client,
            course_code=course_code,
            professor_name=professor_name,
            course_title=None,
            logistics=logistics_dict,
            model=model,
            data_source="browser_use_enrichment",
        )
        new_score = _score(logistics_dict)
        return True, f"score {new_score}/5 | cost ${outcome.cost.total_cost_usd:.4f}"

    except Exception as exc:  # noqa: BLE001
        return False, str(exc)[:120]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def async_main(args: argparse.Namespace) -> None:
    prefixes = [p.strip().upper() for p in args.prefix.split(",")] if args.prefix else None

    from app.db.client import get_supabase_client
    db_client = get_supabase_client()

    _log.info("Scanning cache for entries below score %d…", args.threshold)
    candidates = fetch_poor_entries(
        db_client,
        threshold=args.threshold,
        prefixes=prefixes,
        course_filter=args.course or None,
        professor_filter=args.professor or None,
    )

    if args.limit:
        candidates = candidates[: args.limit]

    total = len(candidates)
    if total == 0:
        print("No entries below threshold — cache looks healthy.")
        return

    print(f"\n{'DRY RUN — ' if args.dry_run else ''}Found {total} candidate(s) for Browser Use enrichment:\n")
    for i, row in enumerate(candidates, 1):
        cc = row.get("course_code") or row.get("normalized_course_code")
        pn = row.get("professor_name") or row.get("normalized_professor_name")
        score = _score(row.get("logistics") or {})
        print(f"  [{i:>3}/{total}] {cc:<12} / {pn:<35} (score {score}/5)")

    if args.dry_run:
        print("\nDry-run — no Browser Use calls made.")
        return

    # Confirm if running more than 5 entries without --yes
    if total > 5 and not args.yes:
        est_cost = total * 0.10
        print(f"\n~{total} Browser Use runs at ~$0.10 each ≈ ${est_cost:.0f} estimated.")
        answer = input("Proceed? [y/N] ").strip().lower()
        if answer != "y":
            print("Aborted.")
            return

    from app.services.browser_use import resolve_browser_use_api_key, create_browser_use_client
    api_key = resolve_browser_use_api_key()
    bu_client = create_browser_use_client(api_key)

    ok = err = 0
    for i, row in enumerate(candidates, 1):
        cc = row.get("course_code") or row.get("normalized_course_code")
        pn = row.get("professor_name") or row.get("normalized_professor_name")
        _log.info("[%d/%d] Browser Use → %s / %s", i, total, cc, pn)

        success, msg = await enrich_one(row, db_client=db_client, bu_client=bu_client, model=args.model)
        if success:
            ok += 1
            _log.info("[%d/%d] OK    %s / %s  (%s)", i, total, cc, pn, msg)
        else:
            err += 1
            _log.warning("[%d/%d] ERR   %s / %s  — %s", i, total, cc, pn, msg)

        if i < total:
            await asyncio.sleep(args.delay)

    print()
    print("=" * 60)
    print(f"Enrichment complete: OK={ok}  Errors={err}  Total={total}")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(description="Browser Use enrichment pass for thin cache entries")
    parser.add_argument("--prefix", help="Comma-separated dept prefixes, e.g. CSE,MATH")
    parser.add_argument("--threshold", type=int, default=2,
                        help="Enrich entries with score strictly below this value (default: 2)")
    parser.add_argument("--course", help="Target a specific course code, e.g. 'CSE 123'")
    parser.add_argument("--professor", help="Target a specific professor name")
    parser.add_argument("--limit", type=int, default=0,
                        help="Max entries to process (0 = no limit)")
    parser.add_argument("--delay", type=float, default=5.0,
                        help="Seconds between Browser Use calls (default: 5.0)")
    parser.add_argument("--model", default="claude-3-5-sonnet",
                        help="Browser Use model to use (default: claude-3-5-sonnet)")
    parser.add_argument("--dry-run", action="store_true",
                        help="List candidates without running Browser Use")
    parser.add_argument("--yes", "-y", action="store_true",
                        help="Skip confirmation prompt for large batches")
    args = parser.parse_args()

    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()
