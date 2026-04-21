/**
 * Typed API clients for:
 *   - Hermes API Server  (OpenAI-compat) → proxied at /v1  → :8642
 *   - Hermes Web Server  (admin REST)     → proxied at /api → :9119
 */

const API_KEY = import.meta.env.VITE_API_KEY ?? "";
const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const WEB_BASE = import.meta.env.VITE_WEB_BASE ?? "";

/** Avoid stale JSON/SSE responses from browser or intermediary caches (Telegram WebView, etc.). */
const NO_STORE: RequestInit = { cache: "no-store" };

function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

function webUrl(path: string) {
  return `${WEB_BASE}${path}`;
}

function localUrl(path: string) {
  return `${API_BASE}${path}`;
}

function baseHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  if (API_KEY) h.set("Authorization", `Bearer ${API_KEY}`);
  // Required to bypass ngrok's browser interstitial page
  h.set("ngrok-skip-browser-warning", "true");
  return h;
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = baseHeaders(init?.headers);
  const res = await fetch(url, { ...NO_STORE, ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── API Server (/v1) ────────────────────────────────────────────────────────

export interface RunCreated {
  run_id: string;
}

export interface TelegramMiniappResponse {
  ok: boolean;
  reply?: string;
  error?: string;
  detail?: string;
}

export interface ObsidianStatus {
  ok: boolean;
  available: boolean;
  vault: string | null;
  vault_path?: string | null;
  port?: number | null;
  info?: unknown;
  version: string | null;
  mode?: "rest" | "filesystem" | "unavailable";
  file_count?: number;
  error?: string | null;
}

export interface ObsidianSearchResult {
  filename?: string;
  score?: number;
  snippets?: string[];
}

export interface ObsidianCommandResult {
  ok: boolean;
  available?: boolean;
  vault?: string | null;
  vault_path?: string | null;
  port?: number | null;
  status?: number;
  results?: ObsidianSearchResult[];
  body?: unknown;
  error?: string;
}

export interface RunEvent {
  event:
    | "tool.started"
    | "tool.completed"
    | "tool.error"
    | "message.delta"
    | "message.done"
    | "run.completed"
    | "run.failed"
    | "keepalive";
  tool?: string;
  preview?: string;
  delta?: string;
  output?: string;
  error?: string;
  run_id?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  gateway_running: boolean;
  version?: string;
}

/** Start an agent run. Returns run_id immediately (non-blocking). */
export async function startRun(prompt: string, sessionId?: string): Promise<RunCreated> {
  return fetchJSON<RunCreated>(apiUrl("/v1/runs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: prompt,
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
  });
}

/** Send a Mini App turn through gateway Telegram session path. */
export async function telegramMiniappStream(
  text: string,
  initData: string
): Promise<TelegramMiniappResponse> {
  return fetchJSON<TelegramMiniappResponse>(apiUrl("/v1/telegram/stream"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, init_data: initData }),
  });
}

/** Open an SSE stream for a run using fetch (supports custom headers). */
export function streamRun(
  runId: string,
  onEvent: (e: RunEvent) => void,
  onDone: () => void,
  onError: (err: unknown) => void
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(apiUrl(`/v1/runs/${runId}/events`), {
        ...NO_STORE,
        headers: baseHeaders({ Accept: "text/event-stream" }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        onError(new Error(`SSE ${res.status}`));
        onDone();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const event: RunEvent = JSON.parse(data);
            if (event.event === "run.completed" || event.event === "run.failed") {
              onEvent(event);
              onDone();
              return;
            }
            onEvent(event);
          } catch {
            // ignore malformed lines
          }
        }
      }
      onDone();
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        onError(err);
        onDone();
      }
    }
  })();

  return () => controller.abort();
}

/** Health check against the API server. */
export async function getHealth(): Promise<HealthResponse> {
  return fetchJSON<HealthResponse>(apiUrl("/health"));
}

export const obsidianApi = {
  getStatus: () => fetchJSON<ObsidianStatus>(localUrl("/obsidian/status")),
  search: (query: string) =>
    fetchJSON<ObsidianCommandResult>(localUrl("/obsidian/search"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }),
  appendDaily: (content: string) =>
    fetchJSON<ObsidianCommandResult>(localUrl("/obsidian/daily-append"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  listRecent: (n = 20) =>
    fetchJSON<{ files: Array<{ path: string; modified: number; size?: number }> }>(
      localUrl(`/obsidian/recent?n=${n}`)
    ),
  readFile: (path: string) =>
    fetchJSON<{ content: string; path: string }>(
      localUrl(`/obsidian/file?path=${encodeURIComponent(path)}`)
    ),
};

// ── Web Server (/api) ───────────────────────────────────────────────────────

export interface HermesStatus {
  version: string;
  gateway_running: boolean;
  gateway_state: string | null;
  active_sessions: number;
  gateway_platforms: Record<string, { state: string; updated_at: string }>;
}

export interface SessionInfo {
  id: string;
  source: string | null;
  title: string | null;
  started_at: number;
  last_active: number;
  is_active: boolean;
  message_count: number;
  input_tokens: number;
  output_tokens: number;
  preview: string | null;
}

export interface CronJob {
  id: string;
  name?: string;
  prompt: string;
  schedule_display: string;
  enabled: boolean;
  state: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
}

export const webApi = {
  getStatus: () => fetchJSON<HermesStatus>(webUrl("/api/status")),
  getSessions: (limit = 10) =>
    fetchJSON<{ sessions: SessionInfo[]; total: number }>(
      webUrl(`/api/sessions?limit=${limit}`)
    ),
  getCronJobs: () => fetchJSON<CronJob[]>(webUrl("/api/cron/jobs")),
  triggerCronJob: (id: string) =>
    fetchJSON<{ ok: boolean }>(webUrl(`/api/cron/jobs/${id}/trigger`), {
      method: "POST",
    }),
};
