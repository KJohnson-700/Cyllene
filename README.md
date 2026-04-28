# Cyllene

Cyllene is a Telegram Mini App front-end that provides a conversational assistant, an animated "Dragon" companion, and monitoring utilities. It integrates with a Hermes-compatible agent gateway and (optionally) an Obsidian vault for memory-aware prompts.

Key features
- Lightweight React + Vite Mini App UI optimized for Telegram WebApp
- Chat-based assistant with streaming responses
- Animated Dragon companion that reacts to agent state
- Obsidian integration for memory-aware prompting (optional)
- Works in a browser for local development and inside Telegram as a Mini App

Quick links
- Getting started: [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)
- Usage & examples: [docs/USAGE.md](docs/USAGE.md)
- API & config: [docs/API.md](docs/API.md)
- FAQ & troubleshooting: [docs/FAQ.md](docs/FAQ.md)

Basic requirements
- Node.js 18+ and npm/yarn/pnpm
- Hermes-compatible backend (API server) reachable from the app (see docs/API.md)

Environment variables
- `VITE_API_BASE` — Base URL for the Hermes API (e.g. https://localhost:8642)
- `VITE_API_KEY` — Optional API key for Hermes-compatible gateway
- `VITE_WEB_BASE` — Base URL for the admin web server (optional)

Local development
1. Install dependencies:

```
npm install
```

2. Create a `.env` file (optional) with the variables above.

3. Run the dev server:

```
npm run dev
```

Deployment
- Build: `npm run build`
- Preview: `npm run preview`

Contributing
- See `CONTRIBUTING.md` (if present) and open issues or PRs for bugs and feature requests.

License
- Repository license (if any) lives at the project root. If none exists, ask the project owner which license to use.
