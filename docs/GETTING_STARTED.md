# Getting Started

This guide walks through running Cyllene locally and preparing a Hermes-compatible backend.

1) Install dependencies

```
npm install
```

2) Provide environment variables
- Create a `.env` (or use your environment) with:
  - `VITE_API_BASE` — e.g. `http://localhost:8642` (Hermes API)
  - `VITE_API_KEY` — optional API key
  - `VITE_WEB_BASE` — optional admin web server base URL

3) Run dev server

```
npm run dev
```

4) Accessing inside Telegram
- Host the built app on HTTPS (Telegram requires secure URLs) or use a tunneling service (ngrok) to expose the dev server, then configure the Mini App URL in your Telegram bot settings.

Notes
- If you plan to use Obsidian integration, run the Hermes gateway with access to an Obsidian vault or a proxy that exposes `obsidian/*` endpoints (see docs/API.md).
