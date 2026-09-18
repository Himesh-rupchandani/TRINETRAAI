#!/usr/bin/env sh
set -eu

PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"

mkdir -p uploads data

echo "[trinetra] Starting backend on ${HOST}:${PORT}"
exec uvicorn app.main:app --host "$HOST" --port "$PORT"
