#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT / "frontend"
API_DIR = ROOT / "services" / "api"


def _bin(name: str) -> str:
    if os.name == "nt":
        if name == "npm":
            return "npm.cmd"
        if name == "npx":
            return "npx.cmd"
    return name


def run(cmd: list[str], cwd: Path, env: dict[str, str] | None = None) -> None:
    print(f"\n==> {shlex.join(cmd)}")
    print(f"    cwd: {cwd}")
    completed = subprocess.run(cmd, cwd=str(cwd), env=env)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def build_frontend_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("NEXT_TELEMETRY_DISABLED", "1")
    return env


def run_frontend(skip_build: bool) -> None:
    env = build_frontend_env()
    run([_bin("npm"), "run", "lint"], FRONTEND_DIR, env)
    run([_bin("npx"), "tsc", "--noEmit"], FRONTEND_DIR, env)
    if not skip_build:
        run([_bin("npm"), "run", "build"], FRONTEND_DIR, env)


def run_backend() -> None:
    run([sys.executable, "-m", "pytest", "tests", "-q"], API_DIR)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the local pre-push checks for frontend and backend.",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip the frontend production build step.",
    )
    parser.add_argument(
        "--frontend-only",
        action="store_true",
        help="Run only the frontend checks.",
    )
    parser.add_argument(
        "--backend-only",
        action="store_true",
        help="Run only the backend checks.",
    )
    args = parser.parse_args()

    if args.frontend_only and args.backend_only:
        parser.error("Choose at most one of --frontend-only or --backend-only.")

    print("Running Reg2Schedg preflight checks...")
    print(f"Repo root: {ROOT}")

    if not args.backend_only:
        run_frontend(skip_build=args.skip_build)

    if not args.frontend_only:
        run_backend()

    print("\nAll preflight checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
