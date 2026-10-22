#!/usr/bin/env bash
# Usage: launch.sh [port]   (default 3123). Starts `next dev` in its own process group and waits until usable.
set -euo pipefail
PORT="${1:-3123}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
STATE=/tmp/campus-lms-verify
mkdir -p "$STATE"
PIDFILE="$STATE/dev-$PORT.pid"
LOG="$STATE/dev-$PORT.log"

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  echo "port $PORT is already in use; refusing to drive an instance this run did not start. Pick another port." >&2
  exit 1
fi
[ -d "$ROOT/node_modules/next" ] || { echo "node_modules missing: run npm install in $ROOT" >&2; exit 1; }
grep -qE '^SESSION_SECRET=.+' "$ROOT/.env.local" 2>/dev/null || { echo "$ROOT/.env.local needs SESSION_SECRET=<64 hex chars> (openssl rand -hex 32)" >&2; exit 1; }

cd "$ROOT"
setsid nohup npx next dev -p "$PORT" >"$LOG" 2>&1 &
echo $! >"$PIDFILE"

for _ in $(seq 1 120); do
  grep -q "Ready in" "$LOG" 2>/dev/null && break
  kill -0 "$(cat "$PIDFILE")" 2>/dev/null || { echo "next dev exited early:" >&2; cat "$LOG" >&2; exit 1; }
  sleep 0.5
done
grep -q "Ready in" "$LOG" || { echo "no 'Ready in' within 60s; see $LOG" >&2; exit 1; }
curl -fsS -o /dev/null --max-time 120 "http://localhost:$PORT/login" || { echo "/login did not answer; see $LOG" >&2; exit 1; }
echo "ready: http://localhost:$PORT  pid=$(cat "$PIDFILE")  log=$LOG"
