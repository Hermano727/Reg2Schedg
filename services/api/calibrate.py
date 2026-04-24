"""
Fit-analysis calibration runner.

Usage:
    python calibrate.py                        # run all scenarios
    python calibrate.py --filter cse120        # run scenarios whose id contains 'cse120'
    python calibrate.py --add                  # interactively add a new scenario
    python calibrate.py --tolerance 1.0        # widen pass threshold (default 0.5)

Edit calibrations.yaml to add/change scenarios. Each entry needs:
  id, label, expected [min, max], why, courses[]
"""

import argparse
import sys
import textwrap
from pathlib import Path

import yaml

from app.models.course_parse import SectionMeeting
from app.models.research import CourseLogistics, CourseResearchResult, RateMyProfessorStats
from app.services.fit_analysis import analyze_fit

CALIBRATIONS_FILE = Path(__file__).parent / "calibrations.yaml"
TOLERANCE = 0.5


def _build_course(c: dict) -> CourseResearchResult:
    meetings = [
        SectionMeeting(
            section_type=m["type"],
            days=m["days"],
            start_time=m["start"],
            end_time=m["end"],
            location="TBD",
        )
        for m in c.get("meetings", [])
    ]
    logistics = CourseLogistics(
        rate_my_professor=RateMyProfessorStats(difficulty=c.get("rmp_difficulty")),
        attendance_required=c.get("attendance"),
        textbook_required=c.get("textbook"),
        podcasts_available=c.get("podcasts"),
        grade_breakdown=c.get("grade_breakdown"),
    )
    return CourseResearchResult(
        course_code=c["code"],
        professor_name=c.get("professor", "Staff"),
        meetings=meetings,
        logistics=logistics,
    )


def run_scenarios(scenarios: list[dict], tolerance: float) -> tuple[int, int]:
    passed = failed = 0
    for s in scenarios:
        lo, hi = s["expected"]
        lo_t, hi_t = lo - tolerance, hi + tolerance
        courses = [_build_course(c) for c in s["courses"]]

        print(f"\n{'─'*60}")
        print(f"  {s['label']}")
        print(f"  Expected: {lo}–{hi}  (tolerance ±{tolerance})")

        result = analyze_fit(courses)
        score = result.fitness_score
        ok = lo_t <= score <= hi_t
        status = "PASS ✓" if ok else "FAIL ✗"
        print(f"  Got:      {score:.1f}  [{result.trend_label}]  {status}")

        if not ok:
            failed += 1
            delta = score - hi if score > hi_t else lo_t - score
            direction = "HIGH" if score > hi_t else "LOW"
            print(f"  → {direction} by {delta:.1f}  |  why: {textwrap.shorten(str(s.get('why','')), 80)}")
        else:
            passed += 1

    return passed, failed


def interactive_add() -> None:
    print("\nAdd a new calibration scenario")
    print("Press Ctrl-C to cancel.\n")

    sid = input("ID (slug, no spaces): ").strip()
    label = input("Label (human-readable): ").strip()
    lo = float(input("Expected score MIN (e.g. 5.5): "))
    hi = float(input("Expected score MAX (e.g. 7.5): "))
    why = input("Why this range?: ").strip()

    courses = []
    while True:
        print(f"\nCourse {len(courses)+1} (leave 'code' blank to finish):")
        code = input("  Course code (e.g. CSE 120): ").strip()
        if not code:
            break
        professor = input("  Professor: ").strip() or "Staff"
        rmp = float(input("  RMP difficulty (1-5): ") or "3.0")
        attendance = input("  Attendance required? (y/n): ").lower().startswith("y")
        textbook = input("  Textbook required? (y/n): ").lower().startswith("y")
        podcasts = input("  Podcasts available? (y/n): ").lower().startswith("y")
        breakdown = input("  Grade breakdown (e.g. HW 30%, Final 70%): ").strip() or None

        meetings = []
        while True:
            mtype = input(f"  Meeting type (Lecture/Discussion/Lab, blank to stop): ").strip()
            if not mtype:
                break
            days = input(f"    Days (e.g. MWF, TuTh): ").strip()
            start = input(f"    Start (e.g. 10:00 AM): ").strip()
            end = input(f"    End (e.g. 10:50 AM): ").strip()
            meetings.append({"type": mtype, "days": days, "start": start, "end": end})

        courses.append({
            "code": code,
            "professor": professor,
            "rmp_difficulty": rmp,
            "attendance": attendance,
            "textbook": textbook,
            "podcasts": podcasts,
            **({"grade_breakdown": breakdown} if breakdown else {}),
            "meetings": meetings,
        })

    if not courses:
        print("No courses entered — nothing saved.")
        return

    scenario = {
        "id": sid,
        "label": label,
        "expected": [lo, hi],
        "why": why,
        "courses": courses,
    }

    data = yaml.safe_load(CALIBRATIONS_FILE.read_text(encoding="utf-8"))
    data["scenarios"].append(scenario)
    CALIBRATIONS_FILE.write_text(yaml.dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
    print(f"\n✓ Saved '{sid}' to calibrations.yaml")
    print("Run 'python calibrate.py' to test it.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fit-analysis calibration runner")
    parser.add_argument("--filter", metavar="SUBSTR", help="Only run scenarios whose id contains this string")
    parser.add_argument("--add", action="store_true", help="Interactively add a new scenario")
    parser.add_argument("--tolerance", type=float, default=TOLERANCE, help=f"Score tolerance (default {TOLERANCE})")
    args = parser.parse_args()

    if args.add:
        interactive_add()
        return

    data = yaml.safe_load(CALIBRATIONS_FILE.read_text(encoding="utf-8"))
    scenarios = data.get("scenarios", [])

    if args.filter:
        scenarios = [s for s in scenarios if args.filter.lower() in s["id"].lower()]
        if not scenarios:
            print(f"No scenarios match filter '{args.filter}'")
            sys.exit(1)

    print(f"Running {len(scenarios)} scenario(s) with tolerance ±{args.tolerance}...")
    passed, failed = run_scenarios(scenarios, args.tolerance)

    print(f"\n{'═'*60}")
    print(f"  {passed} passed  |  {failed} failed  |  {len(scenarios)} total")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
