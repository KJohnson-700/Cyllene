# Usage & Examples

This page shows typical user flows and UI sections.

Primary UI
- Chat: Send messages to the assistant. Messages stream from the API using SSE and are persisted to local storage.
- Cyllene (Dragon): Animated companion that reflects agent state (`idle`, `reasoning`, `responding`, `alert`, etc.).
- Monitor/Dashboard: Metrics and run history fetched from the admin web server.

Example: Send a prompt
1. Type a message in the chat input.
2. The UI calls `startRun` then opens a stream via `streamRun` to receive events.
3. Partial output appears as deltas and updates the assistant message in real time.

Obsidian-aware prompts
- If Hermes exposes `obsidian/search`, the app will attempt to include short context snippets to make responses memory-aware. This is enabled automatically when the API returns search results.

Keyboard / Accessibility
- The app follows standard web accessibility practices; test inside Telegram Mini App runtime for device-specific behavior.
