# FAQ & Troubleshooting

Q: The app shows "Connection lost" or streaming stalls.
A: Ensure `VITE_API_BASE` points to a reachable Hermes API and that `/v1/runs/:id/events` SSE endpoint is working. Check browser console/network and the API server logs.

Q: App looks different inside Telegram than in browser.
A: Telegram injects theme and viewport params. Use the dev Mini App simulator or tunnel the app over HTTPS to test inside Telegram.

Q: Obsidian search returns nothing.
A: Confirm the Hermes gateway has Obsidian access and that `obsidian/search` returns results. The client gracefully falls back if unavailable.

Q: Where are messages persisted?
A: Messages are stored in `localStorage` by default and loaded on mount. Clearing storage clears the chat history.

Q: How do I enable secure hosting for Mini App?
A: Host the built app on HTTPS. Tools like ngrok or Cloudflare Tunnel can expose a local dev server over TLS for testing.
