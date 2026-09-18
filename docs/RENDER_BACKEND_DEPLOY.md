# Render backend deployment guide for TRINETRA AI

This is the fastest path to get a **public backend URL** for the existing Vercel frontend.

## What this gives you

- public FastAPI backend URL
- `/api/cameras` from your backend
- `/api/cameras/{id}/stream` from your backend
- same Vercel frontend can then run in **full live mode**

## Before you start

You need:

- GitHub repo connected to Render
- Sentinel access values available **privately**:
  - `SENTINEL_EMAIL`
  - `SENTINEL_PASSWORD`

Do **not** put these in Git.

## 1. Push this branch

Use the latest branch that contains the deployment helpers.

## 2. Create a new Render Web Service

In Render:

1. Click **New +**
2. Choose **Blueprint** or **Web Service**
3. Connect this GitHub repository
4. Select branch: `arena/01a0b2d3-trinetraai`

If Render detects `render.yaml`, approve it.

## 3. Environment variables

Set these values in Render:

```env
APP_ENV=production
DEBUG=false
HOST=0.0.0.0
PORT=8000
DEMO_MODE=false
AUTO_START_CAMERAS=false
VEHICLE_DETECTION_ENABLED=false
SEED_CAMERA_REGISTRY=true
DATABASE_URL=sqlite:///./trinetra.db
UPLOAD_DIR=uploads
EVIDENCE_ROOT=data/evidence
SENTINEL_CATALOGUE_URL=https://cctv.corp8.cloud/cameras.json
SENTINEL_HLS_BASE_URL=https://cctv.corp8.cloud
SENTINEL_RTSP_HOST=103.250.160.189
SENTINEL_RTSP_PORT=8554
SENTINEL_EMAIL=your-approved-email
SENTINEL_PASSWORD=your-access-password
```

## 4. Deploy

Render will build `TRINETRAAI/backend/Dockerfile` and run `start-render.sh`.

That startup script does two things:

1. seeds the **30 camera registry only**
2. starts `uvicorn` on the Render port

It does **not** seed demo alerts/events/watchlist.

## 5. Verify backend

After deploy, open:

- `https://YOUR-BACKEND.onrender.com/api/health`
- `https://YOUR-BACKEND.onrender.com/api/cameras`

Expected:

- health returns JSON
- cameras returns 30 rows

## 6. Connect Vercel frontend to this backend

In Vercel, set:

```env
VITE_USE_MOCKS=false
BACKEND_ORIGIN=https://YOUR-BACKEND.onrender.com
VITE_REALTIME_TRANSPORT=sse
SENTINEL_EMAIL=your-approved-email
SENTINEL_PASSWORD=your-access-password
SENTINEL_WHEP_ORIGIN=http://103.250.160.189:8889
SENTINEL_HLS_ORIGIN=http://103.250.160.189
```

Then redeploy Vercel.

## 7. Verify frontend

Check these URLs on your Vercel site:

- `/api/health`
- `/api/cameras`
- open a camera card and click **Watch live video**

## If something fails

### 401 Unauthorized
Your Sentinel credentials are wrong or not approved.

### 503 on `/api/*` from Vercel
`BACKEND_ORIGIN` is missing in Vercel.

### 503 on `/sentinel/*` from Vercel
`SENTINEL_EMAIL` / `SENTINEL_PASSWORD` are missing in Vercel.

### Cameras list works but video does not
Backend is fine, but Sentinel live stream access is failing.

### Build succeeds but backend restarts lose state
This setup uses SQLite in the container for simplicity. For persistent data later, move to Postgres.
