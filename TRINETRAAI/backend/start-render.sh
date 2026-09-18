#!/usr/bin/env sh
set -eu

PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"
SEED_CAMERA_REGISTRY="${SEED_CAMERA_REGISTRY:-true}"

mkdir -p uploads data

if [ "$SEED_CAMERA_REGISTRY" = "true" ]; then
  echo "[trinetra] Seeding canonical 30-camera registry (no demo events)..."
  python -m scripts.seed_live_registry
fi

echo "[trinetra] Starting backend on ${HOST}:${PORT}"
exec uvicorn app.main:app --host "$HOST" --port "$PORT"
