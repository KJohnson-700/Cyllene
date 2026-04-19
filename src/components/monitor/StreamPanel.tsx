/**
 * StreamPanel — live thought stream for the Monitor page.
 * Shows current tool activity while a run is in progress, then a scrollable
 * history of LogEvents (newest first).
 */
import { useEffect, useState } from "react";
import {
  Wrench, Check, MessageSquare, CheckCircle, XCircle,
} from "lucide-react";
import { getLogEvents, subscribeLog, type LogEvent } from "@/lib/eventLog";
import type { AgentState, Message } from "@/hooks/useRunStream";

interface Props {
  messages: Message[];
  agentState: AgentState;
  activeTool: string | null;
  isRunning: boolean;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function EventRow({ ev }: { ev: LogEvent }) {
  switch (ev.kind) {
    case 'tool_start':
      return (
        <div className="flex items-center gap-2 py-1.5 border-b border-white/4">
          <Wrench size={11} className="text-cyan-400 shrink-0" />
          <span className="text-[11px] font-mono text-cyan-400 truncate flex-1">
            {ev.label.replace(/_/g, ' ')}
          </span>
          <span className="text-[10px] font-mono text-white/20 shrink-0">{timeAgo(ev.ts)}</span>
        </div>
      );
    case 'tool_done':
      return (
        <div className="flex items-center gap-2 py-1.5 border-b border-white/4">
          <Check size={11} className="text-cyan-400/40 shrink-0" />
          <span className="text-[11px] font-mono text-cyan-400/40 truncate flex-1">
            {ev.label.replace(/_/g, ' ')} done
          </span>
          <span className="text-[10px] font-mono text-white/20 shrink-0">{timeAgo(ev.ts)}</span>
        </div>
      );
    case 'reply':
      return (
        <div className="flex items-start gap-2 py-1.5 border-b border-white/4">
          <MessageSquare size={11} className="text-white/50 shrink-0 mt-0.5" />
          <span className="text-[11px] font-mono text-white/50 line-clamp-2 flex-1 leading-relaxed">
            {(ev.detail ?? ev.label).slice(0, 80)}
          </span>
          <span className="text-[10px] font-mono text-white/20 shrink-0">{timeAgo(ev.ts)}</span>
        </div>
      );
    case 'done':
      return (
        <div className="flex items-start gap-2 py-1.5 border-b border-white/4">
          <CheckCircle size={11} className="text-green-400/60 shrink-0 mt-0.5" />
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-[11px] font-mono text-green-400/60">run complete</span>
            {ev.detail && (
              <span className="text-[10px] font-mono text-white/30 line-clamp-2 leading-relaxed mt-0.5">
                {ev.detail}
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono text-white/20 shrink-0">{timeAgo(ev.ts)}</span>
        </div>
      );
    case 'fail':
      return (
        <div className="flex items-center gap-2 py-1.5 border-b border-white/4">
          <XCircle size={11} className="text-red-400/60 shrink-0" />
          <span className="text-[11px] font-mono text-red-400/60 truncate flex-1">{ev.label}</span>
          <span className="text-[10px] font-mono text-white/20 shrink-0">{timeAgo(ev.ts)}</span>
        </div>
      );
  }
}

export function StreamPanel({ messages, agentState, activeTool, isRunning }: Props) {
  const [logEvents, setLogEvents] = useState<LogEvent[]>(getLogEvents);

  useEffect(() => {
    const unsub = subscribeLog(() => setLogEvents(getLogEvents()));
    return unsub;
  }, []);

  // Last assistant message preview
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const preview = lastAssistant ? lastAssistant.content.slice(-200) : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Live status strip */}
      {isRunning && (
        <div className="px-4 pt-3 pb-2 border-b border-white/8 flex flex-col gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-white/30">
              {agentState === 'reasoning' ? 'reasoning' : 'responding'}
            </span>
            {activeTool && (
              <span className="px-2 py-0.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-[10px] font-mono text-cyan-400 animate-pulse">
                {activeTool.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          {preview && (
            <p className="text-[11px] font-mono text-white/40 leading-relaxed line-clamp-3">
              {preview}
            </p>
          )}
        </div>
      )}

      {/* Event log */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {logEvents.length === 0 ? (
          <p className="text-[11px] font-mono text-white/20 text-center py-8">
            waiting for hermes…
          </p>
        ) : (
          <div className="flex flex-col">
            {logEvents.map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
