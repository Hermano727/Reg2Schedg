import argparse
import csv
import hashlib
import io
import json
import re
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.request import urlopen

from app.db.client import get_supabase_client


DEFAULT_SUNSET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vQ6KhjyiPM-rof6fqjBcmp7ygy4Dqr1LQ8uJiAOtR2IoihzQEumx-SHX_KKxLpmYGZksN6QsPPk0DNb/"
    "pub?output=csv&single=true"
)
DEFAULT_TABLE_NAME = "sunset_grade_distributions"

GRADE_HEADER_ALIASES = {
    "A+": "a_plus",
    "A": "a",
    "A-": "a_minus",
    "B+": "b_plus",
    "B": "b",
    "B-": "b_minus",
    "C+": "c_plus",
    "C": "c",
    "C-": "c_minus",
    "D": "d",
    "F": "f",
    "P": "p",
    "NP": "np",
    "S": "s",
    "U": "u",
    "W": "w",
    "EW": "ew",
    "I": "i",
}

COURSE_COLUMN_ALIASES = (
    "course",
    "course code",
    "course_code",
    "class",
    "class code",
    "subject course",
)
PROFESSOR_COLUMN_ALIASES = (
    "professor",
    "professor name",
    "instructor",
    "instructor name",
    "teacher",
)
TERM_COLUMN_ALIASES = (
    "term",
    "quarter",
    "quarter label",
    "session",
    "year quarter",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import the public SunSET CSV into Supabase.",
    )
    parser.add_argument(
        "--csv-url",
        default=DEFAULT_SUNSET_CSV_URL,
        help="SunSET CSV export URL",
    )
    parser.add_argument(
        "--table",
        default=DEFAULT_TABLE_NAME,
        help="Target Supabase table name",
    )
    parser.add_argument(
        "--course-column",
        help="Explicit CSV header to use for course code",
    )
    parser.add_argument(
        "--professor-column",
        help="Explicit CSV header to use for professor name",
    )
    parser.add_argument(
        "--term-column",
        help="Explicit CSV header to use for quarter/term label",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Only import the first N rows, useful for testing",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and print a summary without writing to Supabase",
    )
    return parser.parse_args()


def fetch_csv_text(csv_url: str) -> str:
    with urlopen(csv_url) as response:
        return response.read().decode("utf-8-sig")


def normalize_whitespace(value: str | None) -> str:
    return " ".join((value or "").split())


def normalize_course_code(value: str | None) -> str:
    return normalize_whitespace(value).upper()


def normalize_professor_name(value: str | None) -> str:
    return normalize_whitespace(value).upper()


def normalize_header(value: str) -> str:
    return normalize_whitespace(value).lower().replace("_", " ")


def find_header(fieldnames: list[str], explicit: str | None, aliases: tuple[str, ...]) -> str | None:
    if explicit:
        return explicit if explicit in fieldnames else None

    normalized_map = {normalize_header(name): name for name in fieldnames}
    for alias in aliases:
        if alias in normalized_map:
            return normalized_map[alias]
    return None


def detect_course_code(row: dict[str, str], course_column: str | None) -> str | None:
    if course_column:
        return normalize_whitespace(row.get(course_column))

    course_pattern = re.compile(r"\b[A-Z&]{2,5}\s*\d+[A-Z]?\b")
    for value in row.values():
        if not value:
            continue
        match = course_pattern.search(value.upper())
        if match:
            return normalize_whitespace(match.group(0))
    return None


def parse_numeric(value: str | None) -> int | float | None:
    if value is None:
        return None
    stripped = value.strip().replace(",", "")
    if not stripped:
        return None
    try:
        number = float(stripped)
    except ValueError:
        return None
    return int(number) if number.is_integer() else number


def extract_grade_distribution(row: dict[str, str]) -> dict[str, int | float]:
    distribution: dict[str, int | float] = {}
    for header, canonical in GRADE_HEADER_ALIASES.items():
        value = None
        for key, raw in row.items():
            if normalize_header(key) == header.lower():
                value = raw
                break
        parsed = parse_numeric(value)
        if parsed is not None:
            distribution[canonical] = parsed

    if distribution:
        return distribution

    fallback_distribution: dict[str, int | float] = {}
    for key, raw in row.items():
        parsed = parse_numeric(raw)
        if parsed is None:
            continue
        header = normalize_header(key)
        if any(alias in header for alias in ("grade", "count", "students")):
            fallback_distribution[header.replace(" ", "_")] = parsed
    return fallback_distribution


def build_source_row_hash(row: dict[str, str]) -> str:
    stable_json = json.dumps(row, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(stable_json.encode("utf-8")).hexdigest()


def build_import_rows(
    csv_text: str,
    *,
    course_column: str | None,
    professor_column: str | None,
    term_column: str | None,
    source_url: str,
    limit: int | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    fieldnames = reader.fieldnames or []
    if not fieldnames:
        raise RuntimeError("CSV appears to have no header row.")

    resolved_course_column = find_header(fieldnames, course_column, COURSE_COLUMN_ALIASES)
    resolved_professor_column = find_header(fieldnames, professor_column, PROFESSOR_COLUMN_ALIASES)
    resolved_term_column = find_header(fieldnames, term_column, TERM_COLUMN_ALIASES)

    rows: list[dict[str, Any]] = []
    skipped: list[str] = []
    imported_at = datetime.now(timezone.utc).isoformat()

    for index, raw_row in enumerate(reader, start=1):
        if limit is not None and len(rows) >= limit:
            break

        row = {key: (value or "").strip() for key, value in raw_row.items() if key}
        course_code = detect_course_code(row, resolved_course_column)
        if not course_code:
            skipped.append(f"row {index}: missing course code")
            continue

        professor_name = normalize_whitespace(row.get(resolved_professor_column or "", "")) if resolved_professor_column else ""
        term_label = normalize_whitespace(row.get(resolved_term_column or "", "")) if resolved_term_column else None
        grade_distribution = extract_grade_distribution(row)

        rows.append(
            {
                "source_row_hash": build_source_row_hash(row),
                "course_code": course_code,
                "professor_name": professor_name,
                "term_label": term_label or None,
                "normalized_course_code": normalize_course_code(course_code),
                "normalized_professor_name": normalize_professor_name(professor_name),
                "grade_distribution": grade_distribution,
                "source_url": source_url,
                "raw_row": row,
                "updated_at": imported_at,
            }
        )

    return rows, skipped


def upsert_rows(table_name: str, rows: list[dict[str, Any]]) -> None:
    client = get_supabase_client()
    batch_size = 250
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        client.table(table_name).upsert(
            batch,
            on_conflict="source_row_hash",
        ).execute()


def main() -> None:
    args = parse_args()
    csv_text = fetch_csv_text(args.csv_url)
    rows, skipped = build_import_rows(
        csv_text,
        course_column=args.course_column,
        professor_column=args.professor_column,
        term_column=args.term_column,
        source_url=args.csv_url,
        limit=args.limit,
    )

    print(f"Prepared {len(rows)} SunSET rows for import.", file=sys.stderr)
    if skipped:
        print(f"Skipped {len(skipped)} rows.", file=sys.stderr)
        for sample in skipped[:10]:
            print(f"  - {sample}", file=sys.stderr)

    if rows:
        sample = rows[0]
        print(
            json.dumps(
                {
                    "sample_course_code": sample["course_code"],
                    "sample_professor_name": sample["professor_name"],
                    "sample_term_label": sample["term_label"],
                    "sample_grade_distribution": sample["grade_distribution"],
                },
                indent=2,
            ),
            file=sys.stderr,
        )

    if args.dry_run:
        print("Dry run only; no rows were written.", file=sys.stderr)
        return

    upsert_rows(args.table, rows)
    print(f"Imported {len(rows)} rows into {args.table}.", file=sys.stderr)


if __name__ == "__main__":
    main()
