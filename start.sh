#!/usr/bin/env bash
set -euo pipefail

# start.sh - start frontend and backend together
# Usage:
#   ./start.sh           # start both services (no installs)
#   ./start.sh --install # install deps then start both services

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL="no"
case "${1:-}" in
	install|--install|-i) INSTALL="yes" ;;
	-h|--help) printf "Usage: %s [--install]\n  no args: start services (no install)\n  --install: install deps then start\n" "$(basename "$0")" ; exit 0 ;;
esac

FRONTEND_PID=""
BACKEND_PID=""

cleanup() {
	trap - INT TERM EXIT
	echo "Shutting down services..."
	[[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
	[[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
	wait 2>/dev/null || true
}

start_frontend() {
	if [[ ! -d "$ROOT/frontend" ]]; then
		echo "Directory $ROOT/frontend not found" >&2
		return 1
	fi
	pushd "$ROOT/frontend" >/dev/null
	if [[ "$INSTALL" == "yes" ]]; then
		echo "[frontend] Installing npm dependencies..."
		npm install
	fi
	echo "[frontend] Starting (npm start)..."
	npm start &
	FRONTEND_PID=$!
	popd >/dev/null
}

start_backend() {
	if [[ ! -d "$ROOT/services/api" ]]; then
		echo "Directory $ROOT/services/api not found" >&2
		return 1
	fi
	pushd "$ROOT/services/api" >/dev/null
	if [[ "$INSTALL" == "yes" ]]; then
		echo "[backend] Installing pip dependencies..."
		pip install -r requirements.txt
	fi
	echo "[backend] Starting (uvicorn main:app)..."
	uvicorn main:app --host 0.0.0.0 --port 8000 &
	BACKEND_PID=$!
	popd >/dev/null
}

echo "Starting services (install=${INSTALL})..."
trap cleanup INT TERM EXIT

start_frontend || exit 1
start_backend || exit 1

# Wait until one of the services exits (requires bash with wait -n).
if wait -n 2>/dev/null; then
	echo "A service exited; cleaning up."
else
	# Fallback: block until any background PID disappears
	while true; do
		sleep 1
		if [[ -n "$FRONTEND_PID" ]] && ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
			echo "[frontend] exited"
			break
		fi
		if [[ -n "$BACKEND_PID" ]] && ! kill -0 "$BACKEND_PID" 2>/dev/null; then
			echo "[backend] exited"
			break
		fi
	done
fi

cleanup

exit 0