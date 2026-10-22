#!/usr/bin/env bash
# Usage: stop.sh [port]   Stops only the dev server launch.sh started on that port. Evidence is never touched.
set -euo pipefail
PORT="${1:-3123}"
PIDFILE="/tmp/campus-lms-verify/dev-$PORT.pid"
if [ ! -f "$PIDFILE" ]; then
  echo "no pid file for port $PORT; nothing this skill started" >&2
  exit 0
fi
PID="$(cat "$PIDFILE")"
kill -TERM -- "-$PID" 2>/dev/null || true
for _ in $(seq 1 20); do
  ss -ltn 2>/dev/null | grep -q ":$PORT " || break
  sleep 0.25
done
if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  echo "port $PORT still listening after TERM" >&2
  exit 1
fi
rm -f "$PIDFILE"
echo "stopped dev server on port $PORT"
