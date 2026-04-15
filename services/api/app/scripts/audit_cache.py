"""
Cache quality audit: inspect course_research_cache for thin/empty entries.

Scores each cached entry on evidence richness and flags ones that need
Browser Use enrichment. Can also export a CSV for easy review.

Usage:
    # Print full report, all departments
    python -m app.scripts.audit_cache

    # Filter to specific prefixes
    python -m app.scripts.audit_cache --prefix CSE,MATH

    # Show only poor entries (score < threshold)
    python -m app.scripts.audit_cache --show-poor --threshold 2

    # Export CSV for spreadsheet review
    python -m app.scripts.audit_cache --csv poor_entries.csv

    # Print total counts only (no per-row output)
    python -m app.scripts.audit_cache --summary-only

Quality score (0-5):
    +1  professor_info_found is True
    +1  evidence[] has >= 1 item
    +1  evidence[] has >= 3 items
    +1  student_sentiment_summary is populated
    +1  grade_breakdown is populated
    Score 0-1 → POOR   (should run Browser Use)
    Score 2-3 → FAIR   (may benefit from enrichment)
    Score 4-5 → GOOD
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from dotenv import load_dotenv
load_dotenv()

_log = logging.getLogger("audit_cache")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _score(logistics: dict) -> tuple[int, list[str]]:
    """Return (score 0-5, list of missing signals)."""
    score = 0
    missing: list[str] = []

    if logistics.get("professor_info_found", True):
        score += 1
    else:
        missing.append("no_prof_info")

    evidence = logistics.get("evidence") or []
    if len(evidence) >= 1:
        score += 1
    else:
        missing.append("no_evidence")

    if len(evidence) >= 3:
        score += 1
    else:
        missing.append(f"thin_evidence({len(evidence)})")

    if logistics.get("student_sentiment_summary"):
        score += 1
    else:
        missing.append("no_sentiment")

    if logistics.get("grade_breakdown"):
        score += 1
    else:
        missing.append("no_grade_breakdown")

    return score, missing


def _tier(score: int) -> str:
    if score <= 1:
        return "POOR"
    if score <= 3:
        return "FAIR"
    return "GOOD"


# ---------------------------------------------------------------------------
# Data fetch
# ---------------------------------------------------------------------------

def fetch_all_cache_rows(client, prefixes: list[str] | None) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    page_size = 1000

    while True:
        query = client.table("course_research_cache").select(
            "course_code,professor_name,normalized_course_code,normalized_professor_name,"
            "logistics,data_source,updated_at"
        )
        resp = query.range(offset, offset + page_size - 1).execute()
        if not resp.data:
            break
        rows.extend(resp.data)
        if len(resp.data) < page_size:
            break
        offset += page_size

    if prefixes:
        prefix_set = {p.upper() for p in prefixes}
        rows = [
            r for r in rows
            if (r.get("normalized_course_code") or "").split()[0].upper() in prefix_set
        ]

    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Audit course_research_cache quality")
    parser.add_argument("--prefix", help="Comma-separated dept prefixes, e.g. CSE,MATH")
    parser.add_argument("--threshold", type=int, default=2,
                        help="Score threshold for --show-poor (default: 2)")
    parser.add_argument("--show-poor", action="store_true",
                        help="Print only entries below --threshold")
    parser.add_argument("--summary-only", action="store_true",
                        help="Print counts only, skip per-row output")
    parser.add_argument("--csv", metavar="FILE", help="Export results to CSV")
    args = parser.parse_args()

    prefixes = [p.strip().upper() for p in args.prefix.split(",")] if args.prefix else None

    from app.db.client import get_supabase_client
    client = get_supabase_client()

    _log.info("Fetching cache rows%s…", f" (prefix: {args.prefix})" if args.prefix else "")
    rows = fetch_all_cache_rows(client, prefixes)
    _log.info("%d rows loaded", len(rows))

    counts = {"GOOD": 0, "FAIR": 0, "POOR": 0}
    results: list[dict] = []

    for row in rows:
        logistics: dict = row.get("logistics") or {}
        score, missing = _score(logistics)
        tier = _tier(score)
        counts[tier] += 1

        entry = {
            "course_code": row.get("course_code") or row.get("normalized_course_code"),
            "professor_name": row.get("professor_name") or row.get("normalized_professor_name"),
            "score": score,
            "tier": tier,
            "missing": ",".join(missing),
            "data_source": row.get("data_source", ""),
            "updated_at": (row.get("updated_at") or "")[:10],
        }
        results.append(entry)

        if not args.summary_only:
            if args.show_poor and score >= args.threshold:
                continue
            color = "\033[91m" if tier == "POOR" else "\033[93m" if tier == "FAIR" else "\033[92m"
            reset = "\033[0m"
            print(
                f"{color}[{tier:4s} {score}/5]{reset} "
                f"{entry['course_code']:<12} / {entry['professor_name']:<35} "
                f"| {entry['missing'] or 'all_signals_present'}"
            )

    # Summary
    total = len(rows)
    print()
    print("=" * 60)
    print(f"Cache audit complete  —  {total} entries")
    print(f"  GOOD (4-5): {counts['GOOD']:>4}  ({100*counts['GOOD']//max(total,1)}%)")
    print(f"  FAIR (2-3): {counts['FAIR']:>4}  ({100*counts['FAIR']//max(total,1)}%)")
    print(f"  POOR (0-1): {counts['POOR']:>4}  ({100*counts['POOR']//max(total,1)}%)")
    print("=" * 60)

    poor = [r for r in results if r["score"] < args.threshold]
    if poor:
        print(f"\n{len(poor)} entries below threshold {args.threshold} — candidates for Browser Use enrichment.")
        print("Re-run with --csv poor.csv to export, then feed to browser_use_enrich.py")

    if args.csv:
        path = Path(args.csv)
        with path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["course_code", "professor_name", "score", "tier", "missing", "data_source", "updated_at"])
            writer.writeheader()
            writer.writerows(results)
        print(f"\nExported {len(results)} rows → {path}")


if __name__ == "__main__":
    main()
