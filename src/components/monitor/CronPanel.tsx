import { useState } from "react";
import { Play } from "lucide-react";
import { useCronJobs } from "@/hooks/useCronJobs";
import { webApi, type CronJob } from "@/lib/api";
import { summarizeCronParity, vaultTitleForJob } from "@/lib/hermesCronReference";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/45 p-3">
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-2">{title}</h3>
      {children}
    </div>
  );
}

const PROMPT_MAX = 140;

function truncatePrompt(s: string): string {
  const t = s.trim();
  if (t.length <= PROMPT_MAX) return t;
  return `${t.slice(0, PROMPT_MAX)}…`;
}

function formatWhen(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return iso;
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CronJobRow({
  job,
  triggering,
  onTrigger,
}: {
  job: CronJob;
  triggering: boolean;
  onTrigger: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const vaultLabel = vaultTitleForJob(job);
  const longPrompt = job.prompt.length > PROMPT_MAX;

  return (
    <div className="rounded-md bg-black/50 border border-white/10 px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] font-mono text-white/90 truncate" title={job.id}>
              {job.name?.trim() || job.id}
            </p>
            {vaultLabel && (
              <span
                className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-400/80 shrink-0"
                title="Second Brain note (cron-reference)"
              >
                {vaultLabel}
              </span>
            )}
          </div>
          <p className="text-[10px] font-mono text-white/40 mt-1">{job.schedule_display}</p>
        </div>
        <button
          type="button"
          onClick={() => onTrigger(job.id)}
          disabled={triggering || !job.enabled}
          className="shrink-0 flex items-center gap-1 rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-mono text-white/70 hover:bg-black/70 hover:text-white disabled:opacity-40 transition-colors"
        >
          <Play size={10} className="opacity-80" />
          {!job.enabled ? "off" : triggering ? "…" : "run"}
        </button>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-mono text-white/35">
        <span>
          <span className="text-white/25">state</span> {job.state}
        </span>
        <span>
          <span className="text-white/25">on</span> {job.enabled ? "yes" : "no"}
        </span>
        <span>
          <span className="text-white/25">last</span> {formatWhen(job.last_run_at)}
        </span>
        <span>
          <span className="text-white/25">next</span> {formatWhen(job.next_run_at)}
        </span>
      </div>

      {job.prompt && (
        <div>
          <p className="text-[10px] font-mono text-white/50 leading-relaxed break-words">
            {expanded ? job.prompt : truncatePrompt(job.prompt)}
          </p>
          {longPrompt && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-[9px] font-mono text-cyan-500/60 hover:text-cyan-400/80 mt-0.5"
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CronPanel() {
  const { jobs, loading, error, lastUpdatedAt, refetch } = useCronJobs();
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const parity = summarizeCronParity(jobs);

  async function handleTrigger(id: string) {
    setActionError(null);
    setTriggeringId(id);
    try {
      await webApi.triggerCronJob(id);
      await refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setTriggeringId(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-3 p-4">
      <Section title="Summary">
        <p className="text-[10px] font-mono text-white/45 leading-relaxed break-words">
          {parity.monitorLine}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-[9px] font-mono text-white/30">
            {lastUpdatedAt ? `updated ${new Date(lastUpdatedAt).toLocaleTimeString()}` : "not yet updated"}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded border border-white/20 px-2 py-0.5 text-[9px] font-mono text-white/55 hover:text-white/80 hover:bg-white/5 transition-colors"
          >
            refresh
          </button>
        </div>
      </Section>

      {loading && jobs.length === 0 && (
        <p className="text-center text-white/30 text-[11px] font-mono py-6">loading crons…</p>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          <p className="text-[10px] font-mono text-red-400/80 break-words">{error}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
          <p className="text-[10px] font-mono text-amber-300/85 break-words">{actionError}</p>
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <p className="text-center text-white/25 text-[11px] font-mono py-6">no cron jobs</p>
      )}

      {jobs.length > 0 && (
        <Section title="Jobs">
          <div className="flex flex-col gap-2">
            {jobs.map((job) => (
              <CronJobRow
                key={job.id}
                job={job}
                triggering={triggeringId === job.id}
                onTrigger={handleTrigger}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
