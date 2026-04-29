import {
  useState,
  useCallback,
  useRef,
  useEffect,
  createContext,
  useContext,
  createElement,
  type ReactNode,
} from "react";
import { obsidianApi, startRun, streamRun, type RunEvent } from "@/lib/api";
import {
  getOrCreateSessionId,
  saveMessages,
  loadMessages,
  clearPersistedMessages,
} from "@/lib/session";
import { pushLogEvent } from "@/lib/eventLog";

/**
 * Memory model (this mini app):
 * - **Short-term:** In-memory `messages` + `agentState` / `isRunning` in this provider — one
 *   React tree shares it so Chat and Monitor never fight the same `localStorage` keys.
 * - **Mid-term:** `cyllene:messages` in localStorage and a stable `session_id` in
 *   `getOrCreateSessionId()` (Telegram: `miniapp-tg-<user_id>`) so Hermes continues server-side
 *   after reload; same id is sent on `startRun` and Telegram `/v1/telegram/stream`.
 * - **Long-term / RAG-style:** `buildMemoryAwarePrompt` enriches the user text with a bounded
 *   fragment from the Obsidian vault via `obsidianApi.search` before the run.
 */

export type AgentState = "idle" | "reasoning" | "responding" | "alert" | "angry" | "sad" | "laughing" | "dancing";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/** Reply shown in Chat / Monitor: only when the thread tail is an assistant (avoids stale prior reply while the last line is a user / in-flight turn — e.g. Telegram bridge before reply arrives). */
export function tailAssistantMessage(messages: Message[]): Message | undefined {
  const tail = messages.at(-1);
  return tail?.role === "assistant" ? tail : undefined;
}

export interface RunStreamState {
  messages: Message[];
  agentState: AgentState;
  activeTool: string | null;
  tokenCount: number;
  isRunning: boolean;
  error: string | null;
}

export type RunStreamApi = RunStreamState & {
  sendMessage: (prompt: string) => Promise<void>;
  cancel: () => void;
  clearMessages: () => void;
  /** Same id passed to `startRun` and Telegram stream — single Hermes session for this user/app. */
  sessionId: string;
};

const RunStreamContext = createContext<RunStreamApi | null>(null);

async function buildMemoryAwarePrompt(prompt: string): Promise<string> {
  // Search the vault directly — proxy handles REST→filesystem fallback internally.
  // If search fails for any reason we silently fall back to the bare prompt.
  try {
    const result = await obsidianApi.search(prompt);
    if (!result.ok) return prompt;

    const context = (result.results ?? [])
      .flatMap((item) => {
        const header = item.filename ? [`File: ${item.filename}`] : [];
        const snippets = (item.snippets ?? []).map((snippet) => `- ${snippet}`);
        return [...header, ...snippets];
      })
      .join("\n")
      .trim();

    if (!context) return prompt;

    const excerpt = context.slice(0, 3000);
    return [
      "Relevant memory from the user's Obsidian vault:",
      excerpt,
      "",
      "Use it only when it is actually relevant. If it conflicts with the user's current request, prefer the current request.",
      "",
      `User message: ${prompt}`,
    ].join("\n");
  } catch {
    return prompt;
  }
}

function useRunStreamState(): RunStreamApi {
  const sessionIdRef = useRef<string>(getOrCreateSessionId());

  const [state, setState] = useState<RunStreamState>(() => ({
    messages: loadMessages(),   // restore from localStorage on mount
    agentState: "idle",
    activeTool: null,
    tokenCount: 0,
    isRunning: false,
    error: null,
  }));

  // Persist messages whenever they change
  useEffect(() => {
    saveMessages(state.messages);
  }, [state.messages]);

  const cancelRef = useRef<(() => void) | null>(null);
  const assistantBufferRef = useRef<string>("");
  const assistantIdRef = useRef<string>("");

  const sendMessage = useCallback(async (prompt: string) => {
    if (state.isRunning) return;

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };

    assistantBufferRef.current = "";
    assistantIdRef.current = crypto.randomUUID();

    setState((s) => ({
      ...s,
      messages: [...s.messages, userMsg],
      agentState: "reasoning",
      isRunning: true,
      error: null,
      tokenCount: 0,
    }));

    let run: { run_id: string };
    try {
      const promptWithMemory = await buildMemoryAwarePrompt(prompt);
      run = await startRun(promptWithMemory, sessionIdRef.current);
    } catch (err) {
      setState((s) => ({
        ...s,
        agentState: "alert",
        isRunning: false,
        error: String(err),
      }));
      return;
    }

    const cancel = streamRun(
      run.run_id,
      (event: RunEvent) => {
        setState((s) => {
          switch (event.event) {
            case "tool.started":
              pushLogEvent({ kind: 'tool_start', label: event.tool ?? 'tool' });
              return {
                ...s,
                agentState: "reasoning",
                activeTool: event.tool ?? null,
                tokenCount: s.tokenCount + 1,
              };

            case "tool.completed":
              pushLogEvent({ kind: 'tool_done', label: event.tool ?? '' });
              return { ...s, activeTool: null };

            case "message.delta": {
              assistantBufferRef.current += event.delta ?? "";
              const updated = s.messages.find(
                (m) => m.id === assistantIdRef.current
              );
              if (updated) {
                return {
                  ...s,
                  agentState: "responding",
                  messages: s.messages.map((m) =>
                    m.id === assistantIdRef.current
                      ? { ...m, content: assistantBufferRef.current }
                      : m
                  ),
                };
              }
              return {
                ...s,
                agentState: "responding",
                messages: [
                  ...s.messages,
                  {
                    id: assistantIdRef.current,
                    role: "assistant" as const,
                    content: assistantBufferRef.current,
                    timestamp: Date.now(),
                  },
                ],
              };
            }

            case "run.completed": {
              pushLogEvent({
                kind: 'done',
                label: 'run complete',
                detail: assistantBufferRef.current.slice(0, 120),
              });
              // Final output if no deltas came through
              const finalText = event.output ?? "";
              if (finalText && !assistantBufferRef.current) {
                assistantBufferRef.current = finalText;
                return {
                  ...s,
                  messages: [
                    ...s.messages,
                    {
                      id: assistantIdRef.current,
                      role: "assistant" as const,
                      content: finalText,
                      timestamp: Date.now(),
                    },
                  ],
                };
              }
              return s;
            }

            case "run.failed":
              pushLogEvent({ kind: 'fail', label: event.error ?? 'failed' });
              setTimeout(() => {
                setState((s) => ({ ...s, agentState: "idle", error: null }));
              }, 4000);
              return {
                ...s,
                agentState: "sad",
                activeTool: null,
                isRunning: false,
                error: event.error ?? "Run failed",
              };

            default:
              return s;
          }
        });
      },
      () => {
        // Run completed successfully — briefly celebrate, then idle
        setState((s) => ({
          ...s,
          agentState: "dancing",
          activeTool: null,
          isRunning: false,
        }));
        setTimeout(() => {
          setState((s) => ({
            ...s,
            agentState: s.agentState === "dancing" ? "idle" : s.agentState,
          }));
        }, 3500);
      },
      () => {
        setState((s) => ({
          ...s,
          agentState: "alert",
          isRunning: false,
          error: "Connection lost",
        }));
      }
    );

    cancelRef.current = cancel;
  }, [state.isRunning]);

  const cancel = useCallback(() => {
    cancelRef.current?.();
    setState((s) => ({ ...s, agentState: "idle", isRunning: false }));
  }, []);

  const clearMessages = useCallback(() => {
    clearPersistedMessages();
    setState((s) => ({ ...s, messages: [], error: null }));
    // Keep the same session ID — Hermes remembers even if the UI is cleared
  }, []);

  return {
    ...state,
    sendMessage,
    cancel,
    clearMessages,
    sessionId: sessionIdRef.current,
  };
}

export function RunStreamProvider({ children }: { children: ReactNode }) {
  const value = useRunStreamState();
  return createElement(RunStreamContext.Provider, { value }, children);
}

export function useRunStream(): RunStreamApi {
  const v = useContext(RunStreamContext);
  if (!v) {
    throw new Error("useRunStream must be used within RunStreamProvider");
  }
  return v;
}
