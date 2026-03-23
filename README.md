# Doosan Jamsil Alert MVP

## Purpose
- Detect cancellation ticket availability for games where Doosan plays at Jamsil.
- Notify the user as quickly as possible through in-app alerts and push-ready hooks.
- Separate monitoring, delivery, and app UX so the system can be operated reliably.

## Structure
- `backend/`
  - Node.js monitoring server with no third-party dependencies
  - KBO schedule fetch, ticket page check, alert dedupe, SSE stream, push adapter
- `app/`
  - Web app that can run in browser now
  - Capacitor-ready shell for Android packaging later

## What is automated
- Schedule fetch from KBO
- Filtering to games where Doosan plays at Jamsil
- Repeated ticket page polling
- Alert deduplication
- SSE alert fan-out
- Push adapter hook

## What still needs live credentials
- Real remote push delivery for a packaged Android app
- `FCM_SERVER_KEY` or equivalent provider credentials

## Quick start
1. Run backend
```powershell
node backend/server.js
```
2. Open app
```powershell
start app/www/index.html
```

## Main endpoints
- `GET /api/health`
- `GET /api/games`
- `GET /api/alerts`
- `POST /api/monitor/run`
- `GET /api/stream`
- `POST /api/devices/register`
- `POST /api/settings`

## Notes
- The current implementation is designed to be production-usable as an MVP, but ticket page HTML can change without notice.
- For the most reliable packaged-app push, connect the backend push adapter to Firebase Cloud Messaging before release.

## Deployment
- This repo includes a `Dockerfile` and `render.yaml` for cloud deployment.
- For remote hosting, set these environment variables:
  - `PORT`
  - `PUSH_PROVIDER`
  - `FCM_SERVER_KEY`
  - `DATA_FILE`
