/**
 * Global in-memory event log — written by useRunStream, read by StreamPanel.
 * Max 150 events; oldest are dropped when the cap is hit.
 */

export interface LogEvent {
  id: string;
  ts: number;
  kind: 'tool_start' | 'tool_done' | 'reply' | 'done' | 'fail';
  label: string;   // tool name or truncated reply
  detail?: string; // extra context
}

const MAX_EVENTS = 150;

let events: LogEvent[] = [];
const subscribers = new Set<() => void>();

export function pushLogEvent(ev: Omit<LogEvent, 'id' | 'ts'>): void {
  const full: LogEvent = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    ...ev,
  };
  events = [full, ...events].slice(0, MAX_EVENTS);
  subscribers.forEach((fn) => fn());
}

export function getLogEvents(): LogEvent[] {
  return events;
}

/**
 * Subscribe to log updates. Returns an unsubscribe function.
 * Subscriber is called synchronously after each push.
 */
export function subscribeLog(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
