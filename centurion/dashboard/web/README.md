# Centurion dashboard (React + Vite)

The operator UI: balance, mission progress, capital split, per-strategy
performance, live activity, spend velocity, system health, the approval queue,
and the remote pause / kill / autonomy controls. It polls the Flask backend's
`/api/state` every 3s and drives the agent through token-protected control
endpoints.

## Build it once (served by the Flask backend)
```bash
cd dashboard/web
npm install
npm run build        # outputs dist/, which dashboard/app.py serves at /
```
Then run the backend and open it:
```bash
cd ../..                     # back to centurion/
CENTURION_DASHBOARD_TOKEN=yourtoken python dashboard/app.py
# http://localhost:8000
```
The first control action (pause, autonomy change, etc.) prompts for that token
and remembers it in the browser. Read-only viewing needs no token.

## Develop with hot reload
```bash
# terminal 1: backend
CENTURION_DASHBOARD_TOKEN=yourtoken python dashboard/app.py
# terminal 2: vite dev server (proxies /api to :8000)
cd dashboard/web && npm run dev      # http://localhost:5173
```

## Docker
`deploy/Dockerfile` builds this automatically (multi-stage), so
`docker compose up` serves the real UI with no manual `npm` step.

## Notes
- If `dist/` isn't built, the backend serves a simple fallback page with a link
  to the live JSON, so nothing breaks.
- Tailwind is loaded via its Play CDN in `index.html` to keep the build
  config-free; swap for a PostCSS/Tailwind setup if you want fully offline
  assets.
