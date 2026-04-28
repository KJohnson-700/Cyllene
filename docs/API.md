# API & Configuration

Cyllene relies on a Hermes-compatible backend and an optional admin web server.

Main endpoints used by the app (configured via `VITE_API_BASE` and `VITE_WEB_BASE`):

- `POST /v1/runs` — Start an agent run. Returns `{ run_id }`.
- `GET /v1/runs/:run_id/events` — Server-Sent Events (SSE) stream for run events (message.delta, tool.started, run.completed, etc.).
- `GET /health` — Health check for API server.

Obsidian integration (optional): proxied under the same API base:
- `POST /obsidian/search` — Search the user's vault for context snippets.
- `GET /obsidian/status` — Status and availability of the Obsidian integration.

Admin web server (optional, `VITE_WEB_BASE`):
- `/api/status` — Hermes gateway status
- `/api/sessions` — Session list for the dashboard

Headers & auth
- `VITE_API_KEY` if provided will be sent as `Authorization: Bearer <key>`.
- The client sets `ngrok-skip-browser-warning` to bypass ngrok interstitials when applicable.

Local proxies
- The repository contains `proxy.py` and `start.sh` scripts used to forward local ports for development. Inspect them if you need custom port mappings or TLS.
