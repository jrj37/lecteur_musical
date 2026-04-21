#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

backend_pid=""
frontend_pid=""

cleanup() {
  local exit_code=$?

  if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
  fi

  if [[ -n "$frontend_pid" ]] && kill -0 "$frontend_pid" 2>/dev/null; then
    kill "$frontend_pid" 2>/dev/null || true
  fi

  wait "$backend_pid" 2>/dev/null || true
  wait "$frontend_pid" 2>/dev/null || true

  exit "$exit_code"
}

trap cleanup INT TERM EXIT

(cd backend && ./run.sh) &
backend_pid=$!

(cd frontend && ./run.sh) &
frontend_pid=$!

echo "Retro-Amp startup in progress"
echo "Backend:  http://localhost:8787"
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop both services"

while true; do
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    wait "$backend_pid"
    break
  fi

  if ! kill -0 "$frontend_pid" 2>/dev/null; then
    wait "$frontend_pid"
    break
  fi

  sleep 1
done