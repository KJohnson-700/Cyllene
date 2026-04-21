import { useEffect, useState, useCallback } from "react";
import { obsidianApi, getHealth, type ObsidianStatus, type HealthResponse } from "@/lib/api";
import { loadMessages } from "@/lib/session";
import type { Message } from "@/hooks/useRunStream";
import { BookOpen, Cpu, Search, Zap, ChevronRight, Clock } from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function Badge({ ok, pulse = false }: { ok: boolean; pulse?: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${ok ? "bg-green-400" : "bg-red-400"} ${pulse && ok ? "animate-pulse" : ""}`}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/3 p-3">
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function StatCard({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/3 p-2 flex flex-col gap-1">
      <div className="flex items-center gap-1 text-white/40">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Badge ok={ok} pulse={ok} />
        <span className="text-xs font-mono text-white/80">{value}</span>
      </div>
    </div>
  );
}

// ── hooks ─────────────────────────────────────────────────────────────────────

function useHealth(intervalMs = 15_000) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error,  setError]  = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const h = await getHealth();
        if (!cancelled) { setHealth(h); setError(false); }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    poll();
    const t = setInterval(poll, intervalMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [intervalMs]);

  return { health, error };
}

function useVaultStatus(intervalMs = 30_000) {
  const [vault, setVault] = useState<ObsidianStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await obsidianApi.getStatus();
        if (!cancelled) setVault(s);
      } catch {
        if (!cancelled) setVault(null);
      }
    };
    poll();
    const t = setInterval(poll, intervalMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [intervalMs]);

  return vault;
}

// ── Vault search ──────────────────────────────────────────────────────────────

interface SearchResult { filename?: string; snippets?: string[] }

function VaultSearch() {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran,     setRan]     = useState(false);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setRan(true);
    try {
      const r = await obsidianApi.search(q);
      setResults(r.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="search your notes…"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/25 font-mono focus:outline-none focus:border-cyan-500/40"
        />
        <button
          onClick={search}
          disabled={!query.trim() || loading}
          className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/25 text-cyan-400 text-xs font-mono hover:bg-cyan-500/25 disabled:opacity-30 transition-colors"
        >
          <Search size={12} />
        </button>
      </div>

      {loading && (
        <p className="text-center text-white/30 text-[11px] font-mono py-1">searching…</p>
      )}

      {!loading && ran && results.length === 0 && (
        <p className="text-center text-white/25 text-[11px] font-mono py-1">no results</p>
      )}

      {results.slice(0, 4).map((r, i) => (
        <div key={i} className="rounded-md bg-white/4 border border-white/6 px-3 py-2">
          {r.filename && (
            <p className="text-[10px] font-mono text-cyan-400/70 mb-1 truncate">{r.filename}</p>
          )}
          {(r.snippets ?? []).slice(0, 2).map((s, j) => (
            <p key={j} className="text-[11px] text-white/55 leading-snug line-clamp-2">{s}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Daily note append ─────────────────────────────────────────────────────────

function DailyNoteAppend() {
  const [text,    setText]    = useState("");
  const [status,  setStatus]  = useState<"idle"|"saving"|"ok"|"err">("idle");

  const save = useCallback(async () => {
    const t = text.trim();
    if (!t) return;
    setStatus("saving");
    try {
      await obsidianApi.appendDaily(t);
      setText("");
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("err");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }, [text]);

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) save(); }}
        rows={2}
        placeholder="quick note → today's daily note…"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/25 font-mono focus:outline-none focus:border-cyan-500/40 resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/25 font-mono">⌘↵ to save</span>
        <button
          onClick={save}
          disabled={!text.trim() || status === "saving"}
          className={`px-3 py-1 rounded-lg text-xs font-mono border transition-colors ${
            status === "ok"
              ? "bg-green-500/15 border-green-500/30 text-green-400"
              : status === "err"
              ? "bg-red-500/15 border-red-500/30 text-red-400"
              : "bg-white/5 border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 disabled:opacity-30"
          }`}
        >
          {status === "saving" ? "saving…" : status === "ok" ? "saved ✓" : status === "err" ? "failed ✗" : "append"}
        </button>
      </div>
    </div>
  );
}

// ── Local session history ─────────────────────────────────────────────────────

function LocalHistory() {
  const messages: Message[] = loadMessages();
  const pairs: { user: string; assistant: string; ts: number }[] = [];

  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].role === "user" && messages[i + 1].role === "assistant") {
      pairs.push({
        user:      messages[i].content.slice(0, 60),
        assistant: messages[i + 1].content.slice(0, 80),
        ts:        messages[i].timestamp,
      });
    }
  }

  const recent = [...pairs].reverse().slice(0, 4);

  if (recent.length === 0) {
    return <p className="text-white/25 text-[11px] font-mono">no conversations yet</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {recent.map((p, i) => (
        <div key={i} className="rounded-md bg-white/4 border border-white/6 px-3 py-2 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-cyan-300/70 font-mono truncate flex-1">{p.user}{p.user.length >= 60 ? "…" : ""}</p>
            <span className="text-[10px] text-white/25 font-mono shrink-0 ml-2 flex items-center gap-1">
              <Clock size={9} />{timeAgo(p.ts)}
            </span>
          </div>
          <p className="text-[11px] text-white/45 leading-snug line-clamp-2">{p.assistant}{p.assistant.length >= 80 ? "…" : ""}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function MonitorWidgets() {
  const { health, error: healthError } = useHealth();
  const vault = useVaultStatus();

  const gatewayOk = health?.gateway_running ?? false;
  const vaultOk   = vault?.available ?? false;

  return (
    <div className="flex flex-col gap-3 p-4">

      {/* Status grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<Cpu size={14} />}
          label="Gateway"
          value={healthError ? "unreachable" : health ? (gatewayOk ? "online" : "offline") : "checking…"}
          ok={gatewayOk && !healthError}
        />
        <StatCard
          icon={<Zap size={14} />}
          label="Version"
          value={health?.version ?? "—"}
          ok={!!health && !healthError}
        />
        <StatCard
          icon={<BookOpen size={14} />}
          label="Memory"
          value={vault === null ? "checking…" : vaultOk ? (vault.mode === "rest" ? "live vault" : "filesystem") : "no vault"}
          ok={vaultOk}
        />
        <StatCard
          icon={<ChevronRight size={14} />}
          label="Notes"
          value={vault?.file_count != null ? `${vault.file_count} files` : "—"}
          ok={vaultOk}
        />
      </div>

      {/* Vault details */}
      {vaultOk && (
        <Section title="Second Brain">
          <div className="flex flex-col gap-1 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-white/40">mode</span>
              <span className={vault!.mode === "rest" ? "text-green-400/80" : "text-yellow-400/80"}>
                {vault!.mode === "rest" ? "obsidian live" : "filesystem fallback"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">vault</span>
              <span className="text-white/60 truncate max-w-[160px]" title={vault!.vault ?? ""}>{vault!.vault ?? "—"}</span>
            </div>
            {vault!.error && (
              <p className="text-yellow-400/60 text-[10px] pt-1 leading-relaxed">{vault!.error}</p>
            )}
          </div>
        </Section>
      )}

      {/* Vault search */}
      {vaultOk && (
        <Section title="Search Notes">
          <VaultSearch />
        </Section>
      )}

      {/* Quick-capture */}
      {vaultOk && (
        <Section title="Daily Note">
          <DailyNoteAppend />
        </Section>
      )}

      {/* Local history */}
      <Section title="Recent (this device)">
        <LocalHistory />
      </Section>

      {/* Web admin note */}
      <div className="rounded-lg border border-white/5 bg-white/2 px-3 py-2 text-center">
        <p className="text-[10px] font-mono text-white/20">
          sessions · cron · platforms → web admin unavailable
        </p>
        <p className="text-[10px] font-mono text-white/15 mt-0.5">
          requires hermes web server auth fix
        </p>
      </div>

    </div>
  );
}
