// Lightweight event bus for triggering Cyllene companion reactions
// from anywhere (ChatPage, useRunStream, etc.) without circular imports.

type CompanionEvent = "laugh";
type Listener = (event: CompanionEvent) => void;

const listeners = new Set<Listener>();

export function onCompanionEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitCompanionEvent(event: CompanionEvent): void {
  listeners.forEach((fn) => fn(event));
}
