import { useEffect, useState } from "react";
import { obsidianApi, getHealth, type ObsidianStatus, type HealthResponse } from "@/lib/api";
import { BookOpen, Cpu, Zap, ChevronRight } from "lucide-react";
import { PSBPanel } from "@/components/monitor/PSBPanel";

// ── helpers ───────────────────────────────────────────────────────────────────

function Badge({ ok, pulse = false }: { ok: boolean; pulse?: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${ok ? "bg-green-400" : "bg-red-400"} ${pulse && ok ? "animate-pulse" : ""}`}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/45 p-3">
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function StatCard({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/50 p-2 flex flex-col gap-1">
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
  const [error, setError] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const h = await getHealth();
        if (!cancelled) {
          setHealth(h);
          setError(false);
          setLastError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(true);
          const msg = e instanceof Error ? e.message : String(e);
          setLastError(msg.length > 280 ? `${msg.slice(0, 280)}…` : msg);
        }
      }
    };
    poll();
    const t = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [intervalMs]);

  return { health, error, lastError };
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

// ── Main widget ───────────────────────────────────────────────────────────────

function hardRefreshMiniApp() {
  const u = new URL(window.location.href);
  u.searchParams.set("_cb", String(Date.now()));
  window.location.replace(u.toString());
}

export function MonitorWidgets() {
  const { health, error: healthError, lastError } = useHealth();
  const vault = useVaultStatus();
  const apiBase = import.meta.env.VITE_API_BASE ?? "";
  const buildTime = import.meta.env.VITE_APP_BUILD_TIME ?? "—";

  const gatewayOk = health?.gateway_running ?? false;
  const vaultOk   = vault?.available ?? false;

  return (
    <div className="flex flex-col gap-3 p-4">

      {/* PSB trading bot — live command center */}
      <PSBPanel />

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

      <Section title="Hermes connection">
        <div className="flex flex-col gap-2 text-[10px] font-mono text-white/45 leading-relaxed">
          <p>
            Chat, runs, Obsidian, and TTS use <span className="text-white/55">/health</span>,{" "}
            <span className="text-white/55">/v1/*</span>, <span className="text-white/55">/obsidian/*</span> on{" "}
            <span className="text-white/55">this app’s origin</span>
            {apiBase ? ` (API base: ${apiBase})` : " (same-origin)"}. Production forwards those paths via{" "}
            <span className="text-white/55">vercel.json</span> to your Hermes tunnel or host.
          </p>
          <p className="text-white/35">
            If you see <span className="text-amber-400/70">404 + ngrok HTML</span>, the tunnel is offline or the URL
            changed — update rewrite destinations in <span className="text-white/50">vercel.json</span> and redeploy.
            TTS uses <span className="text-white/50">POST /v1/tts</span>; Hermes must still expose that route after
            backend changes.
          </p>
          <p className="text-white/30">Build: {buildTime}</p>
          {healthError && lastError && (
            <p className="text-red-400/55 text-[9px] break-words" title={lastError}>
              Last /health error: {lastError}
            </p>
          )}
          <button
            type="button"
            onClick={hardRefreshMiniApp}
            className="mt-1 self-center rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-mono text-white/55 hover:bg-white/10 hover:text-white/75 transition-colors"
          >
            Hard refresh (cache bust)
          </button>
        </div>
      </Section>

    </div>
  );
}
