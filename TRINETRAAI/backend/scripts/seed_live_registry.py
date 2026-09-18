"""Seed only the 30-camera live registry for production-style deployments.

This script intentionally DOES NOT create demo events, alerts or watchlist
records. It only ensures the canonical 30 Sentinel camera rows exist so a
fresh backend deployment can serve `/api/cameras` and issue live stream
tickets immediately.

Usage:
    cd TRINETRAAI/backend
    python -m scripts.seed_live_registry
"""
from __future__ import annotations

import sys
from pathlib import Path

backend_root = Path(__file__).resolve().parents[1]
project_root = Path(__file__).resolve().parents[2]
for p in [str(project_root), str(backend_root)]:
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from app.database.database import SessionLocal, init_db
from app.database.models import Camera
from scripts.seed_demo import seed_cameras


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        before = db.query(Camera).count()
        seed_cameras(db)
        after = db.query(Camera).count()
        print(f"Live camera registry ready: {before} -> {after} cameras")
    finally:
        db.close()


if __name__ == "__main__":
    main()
