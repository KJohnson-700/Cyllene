/**
 * Persistent miniapp session management.
 *
 * - Session ID is stored in localStorage and reused across restarts.
 * - When running inside Telegram, the session ID is derived from the user's
 *   Telegram ID so the same Hermes session is always used for this user,
 *   regardless of which device they open the miniapp on.
 * - Messages are also persisted so the chat UI restores exactly as the user
 *   left it.
 */

import type { Message } from "@/hooks/useRunStream";

const SESSION_KEY  = "cyllene:session-id";
const MESSAGES_KEY = "cyllene:messages";

/** Return a stable session ID, creating one if none exists yet. */
export function getOrCreateSessionId(): string {
  try {
    // Prefer Telegram user ID for cross-device stability
    const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser?.id) {
      const id = `miniapp-tg-${tgUser.id}`;
      localStorage.setItem(SESSION_KEY, id);
      return id;
    }
    // Fallback: generate once and reuse
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `miniapp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `miniapp-fallback-${Date.now()}`;
  }
}

/** Replace with a brand-new session ID (user explicitly starts fresh). */
export function resetSessionId(): string {
  try {
    const id = `miniapp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `miniapp-fallback-${Date.now()}`;
  }
}

/** Persist the current message list. */
export function saveMessages(messages: Message[]): void {
  try {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  } catch { /* storage quota exceeded — silently ignore */ }
}

/** Load previously persisted messages (empty array if none). */
export function loadMessages(): Message[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch {
    return [];
  }
}

/** Clear only the UI messages — the Hermes session itself is preserved. */
export function clearPersistedMessages(): void {
  try {
    localStorage.removeItem(MESSAGES_KEY);
  } catch { /* ignore */ }
}
