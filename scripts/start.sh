#!/usr/bin/env bash
# Run backend + frontend locally (Ubuntu / Debian).
# Backend on :8001, frontend on :3000.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[start] Backend on http://localhost:8001"
(
  cd backend
  source .venv/bin/activate
  exec uvicorn server:app --host 0.0.0.0 --port 8001 --reload
) &
BACK_PID=$!

trap 'echo "[stop] Stopping backend ($BACK_PID)"; kill $BACK_PID 2>/dev/null || true' EXIT INT TERM

echo "[start] Frontend on http://localhost:3000"
cd frontend
exec yarn start
