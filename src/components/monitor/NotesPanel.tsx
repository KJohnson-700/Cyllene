/**
 * NotesPanel — recent vault notes with a 14-day activity timeline.
 * Requires /obsidian/recent endpoint on Hermes.
 */
import { useEffect, useState } from "react";
import { obsidianApi } from "@/lib/api";

interface VaultFile {
  path: string;
  modified: number;
  size?: number;
}

// Is the filename a daily note? (YYYY-MM-DD anywhere in basename)
const DAILY_RE = /\d{4}-\d{2}-\d{2}/;

function basename(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function estWords(size?: number): number {
  return size != null ? Math.round(size / 5) : 0;
}

// ── 14-day timeline ────────────────────────────────────────────────────────────
function Timeline({ files }: { files: VaultFile[] }) {
  const days: { date: Date; count: number; label: string }[] = [];
  const now = Date.now();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    d.setHours(0, 0, 0, 0);
    const dayStart = d.getTime();
    const dayEnd   = dayStart + 86400_000;
    const count    = files.filter((f) => f.modified >= dayStart && f.modified < dayEnd).length;
    days.push({
      date: d,
      count,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    });
  }

  const max = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="flex gap-1 items-end">
      {days.map((day, i) => {
        const intensity = day.count === 0 ? 0 : 0.15 + (day.count / max) * 0.85;
        const bg = day.count === 0
          ? "bg-white/5"
          : `bg-cyan-400`;
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-0.5 group relative"
            title={`${day.label}: ${day.count} note${day.count !== 1 ? "s" : ""}`}
          >
            <div
              className={`w-full rounded-sm ${bg} transition-opacity`}
              style={{
                height: 16,
                opacity: day.count === 0 ? 0.08 : intensity,
              }}
            />
            {/* tooltip on hover */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-black/80 border border-white/10 rounded px-1.5 py-0.5 text-[9px] font-mono text-white/70 whitespace-nowrap z-10 pointer-events-none">
              {day.label} · {day.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Note card ──────────────────────────────────────────────────────────────────
function NoteCard({ file }: { file: VaultFile }) {
  const name    = basename(file.path);
  const isDaily = DAILY_RE.test(name);
  const words   = estWords(file.size);

  return (
    <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono text-white/75 truncate flex-1">{name}</span>
        {isDaily ? (
          <span className="px-1.5 py-0.5 rounded-full bg-green-500/15 border border-green-500/25 text-[9px] font-mono text-green-400/80 shrink-0">
            daily
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/8 text-[9px] font-mono text-white/30 shrink-0">
            note
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-white/30">{timeAgo(file.modified)}</span>
        <div className="flex items-center gap-1.5">
          {words > 0 && (
            <span className="text-[10px] font-mono text-white/25">~{words} words</span>
          )}
          {(file.size ?? 0) > 2000 && (
            <span className="px-1 py-0.5 rounded bg-white/4 text-[9px] font-mono text-white/20">long</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function NotesPanel() {
  const [files,   setFiles]   = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await obsidianApi.listRecent(20);
      setFiles(res.files ?? []);
      setError(null);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("404")) {
        setError("vault file listing unavailable — needs /obsidian/recent endpoint");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-[11px] font-mono text-white/25 animate-pulse">loading vault…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 flex flex-col gap-2">
        <p className="text-[11px] font-mono text-yellow-400/60 leading-relaxed">{error}</p>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="self-start text-[10px] font-mono text-white/30 hover:text-white/60 border border-white/10 rounded px-2 py-1 transition-colors"
        >
          retry
        </button>
      </div>
    );
  }

  const recent8 = files.slice(0, 8);

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Timeline */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/30">
          14-day activity
        </h3>
        <Timeline files={files} />
        <div className="flex justify-between">
          <span className="text-[9px] font-mono text-white/20">14 days ago</span>
          <span className="text-[9px] font-mono text-white/20">today</span>
        </div>
      </div>

      {/* Note cards */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/30">
          recent notes
        </h3>
        {recent8.length === 0 ? (
          <p className="text-[11px] font-mono text-white/20 py-2">no notes found</p>
        ) : (
          recent8.map((f) => <NoteCard key={f.path} file={f} />)
        )}
      </div>

      <p className="text-[10px] font-mono text-white/15 text-center pb-1">
        {files.length} notes · refreshes every 60s
      </p>
    </div>
  );
}
