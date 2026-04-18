import { useEffect, useState } from "react";
import { useHermesStatus } from "@/hooks/useHermesStatus";
import { obsidianApi, webApi, type ObsidianStatus } from "@/lib/api";
import { Activity, BookOpen, Clock, Cpu, Zap } from "lucide-react";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts * 1000) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function Badge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-400" : "bg-red-400"}`}
    />
  );
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
    const t = window.setInterval(poll, intervalMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [intervalMs]);

  return vault;
}

export function MonitorWidgets() {
  const { status, sessions, cronJobs, loading, error } = useHermesStatus(10_000);
  const vault = useVaultStatus();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-white/30 text-sm font-mono">
        connecting to hermes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <span className="text-red-400 text-sm font-mono">⚠ {error}</span>
        <span className="text-white/30 text-xs">is hermes running?</span>
      </div>
    );
  }

  const activeSessions = sessions.filter((s) => s.is_active);
  const upcomingCron = cronJobs
    .filter((j) => j.enabled && j.next_run_at)
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<Cpu size={14} />}
          label="Gateway"
          value={status?.gateway_running ? "online" : "offline"}
          ok={status?.gateway_running ?? false}
        />
        <StatCard
          icon={<Activity size={14} />}
          label="Sessions"
          value={String(activeSessions.length)}
          ok={true}
        />
        <StatCard
          icon={<Zap size={14} />}
          label="Version"
          value={status?.version ?? "—"}
          ok={true}
        />
        <StatCard
          icon={<BookOpen size={14} />}
          label="Memory"
          value={
            vault === null
              ? "checking..."
              : vault.available
                ? vault.mode === "rest" ? "live vault" : "filesystem"
                : "no vault"
          }
          ok={vault?.available ?? false}
        />
      </div>

      {/* Vault detail */}
      {vault?.available && (
        <Section title="Second Brain">
          <div className="flex flex-col gap-1 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-white/40">mode</span>
              <span className={`${vault.mode === "rest" ? "text-green-400/80" : "text-yellow-400/80"}`}>
                {vault.mode === "rest" ? "obsidian live" : "filesystem fallback"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/40">vault</span>
              <span className="text-white/60 truncate max-w-[160px]" title={vault.vault ?? ""}>
                {vault.vault ?? "—"}
              </span>
            </div>
            {vault.file_count != null && (
              <div className="flex items-center justify-between">
                <span className="text-white/40">notes</span>
                <span className="text-white/60">{vault.file_count} files</span>
              </div>
            )}
            {vault.error && (
              <p className="text-yellow-400/60 text-[10px] pt-1 leading-relaxed">{vault.error}</p>
            )}
          </div>
        </Section>
      )}

      {/* Platform states */}
      {status?.gateway_platforms && Object.keys(status.gateway_platforms).length > 0 && (
        <Section title="Platforms">
          <div className="flex flex-col gap-1">
            {Object.entries(status.gateway_platforms).map(([name, p]) => (
              <div key={name} className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <Badge ok={p.state === "connected"} />
                  <span className="text-white/60 capitalize">{name}</span>
                </div>
                <span className="text-white/30">{p.state}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <Section title="Recent Sessions">
          <div className="flex flex-col gap-2">
            {sessions.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-start gap-2">
                <Badge ok={s.is_active} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/70 truncate">
                    {s.preview ?? s.title ?? "untitled"}
                  </p>
                  <p className="text-[10px] text-white/30 font-mono">
                    {s.source ?? "cli"} · {timeAgo(s.last_active)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Cron jobs */}
      {upcomingCron.length > 0 && (
        <Section title="Scheduled">
          <div className="flex flex-col gap-2">
            {upcomingCron.map((job) => (
              <div key={job.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock size={11} className="text-white/30 shrink-0" />
                  <span className="text-xs text-white/60 truncate">
                    {job.name ?? job.prompt.slice(0, 30)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-white/30 font-mono">
                    {job.schedule_display}
                  </span>
                  <button
                    onClick={() => webApi.triggerCronJob(job.id)}
                    className="text-[10px] text-cyan-400/70 hover:text-cyan-400 font-mono transition-colors"
                  >
                    run
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {sessions.length === 0 && cronJobs.length === 0 && (
        <p className="text-center text-white/20 text-xs py-4 font-mono">
          no activity yet
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/3 p-3">
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  ok,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/3 p-2 flex flex-col gap-1">
      <div className="flex items-center gap-1 text-white/40">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <Badge ok={ok} />
        <span className="text-xs font-mono text-white/80">{value}</span>
      </div>
    </div>
  );
}
