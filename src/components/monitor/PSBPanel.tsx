import { useEffect, useState } from "react";
import {
  Activity, Cpu, Gauge, HardDrive, Wifi, WifiOff,
  TrendingUp, TrendingDown, AlertTriangle, Bot,
} from "lucide-react";

// ── types ───────────────────────────────────────────────────────────────────
interface Health {
  ts?: string;
  priority?: string;
  rss_mb?: number;
  cycle_ms?: number;
  scanner_sync_ms?: number;
  daily_trades?: number;
  blind05?: number;
  loss_streak?: number;
  session_wr?: string | number;
  closed?: number;
  worst_lane?: string;
  worst_wr?: string | number;
  worst_alert?: string;
  errors?: number;
  geoblock?: number;
  wss?: string;
  price_age_s?: number;
  exit_verdict?: string;
  exit_payoff?: string | number;
  exit_green_stops?: string | number;
  realized_pnl?: number;
  worst_lane_pnl?: number;
  swap_mb?: number;
  mainpid?: number;
  nrestarts?: number;
  session?: string;
}
interface StatusFile {
  generated_at?: string;
  generated_epoch?: number;
  ok?: boolean;
  error?: string;
  health?: Health;
}

type Tone = "green" | "amber" | "red";

// ── helpers ──────────────────────────────────────────────────────────────────
const n = (v: unknown): number | null => {
  if (v == null) return null;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
};
const money = (v?: number | null) =>
  v == null ? "—" : (v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`);
const secs = (v?: number | null) => (v == null ? "—" : v >= 600 ? `${(v / 60).toFixed(0)}m` : `${Math.round(v)}s`);

const TONE = {
  green: { dot: "bg-green-400", text: "text-green-400", word: "HEALTHY" },
  amber: { dot: "bg-amber-400", text: "text-amber-400", word: "WATCH" },
  red: { dot: "bg-red-400", text: "text-red-400", word: "PROBLEM" },
} as const;

/** Derive a single status pill from the freshest row + wall-clock freshness. */
function derive(s: StatusFile | null, ageS: number | null): { tone: Tone; note: string } {
  if (!s) return { tone: "amber", note: "loading…" };
  if (s.ok === false) return { tone: "red", note: `VPS unreachable${s.error ? ` — ${s.error}` : ""}` };
  if (ageS != null && ageS > 900) return { tone: "red", note: `data ${secs(ageS)} old — observability lost` };
  if (ageS != null && ageS > 600) return { tone: "amber", note: `data ${secs(ageS)} old` };

  const h = s.health ?? {};
  if (!h.mainpid) return { tone: "red", note: "no MainPID — bot may be down" };
  if (n(h.errors)) return { tone: "red", note: `${h.errors} error(s) in log` };

  const wr = n(h.session_wr), closed = n(h.closed);
  if (wr != null && closed != null && closed >= 10 && wr < 35)
    return { tone: "amber", note: `WR ${wr}% on ${closed} closed — bleeding` };
  if (n(h.loss_streak)! >= 4) return { tone: "amber", note: `loss streak ${h.loss_streak}` };
  if (n(h.swap_mb)! > 350) return { tone: "amber", note: `swap ${h.swap_mb}MB climbing` };
  if (n(h.price_age_s)! > 180) return { tone: "amber", note: `price-age ${h.price_age_s}s` };
  if (n(h.cycle_ms)! > 30000) return { tone: "amber", note: `scanner lag ${(n(h.cycle_ms)! / 1000).toFixed(0)}s` };
  return { tone: "green", note: "all systems nominal" };
}

// ── presentational ───────────────────────────────────────────────────────────
function Gauge2({ icon, label, value, sub, flag }:
  { icon: React.ReactNode; label: string; value: string; sub?: string; flag?: Tone }) {
  const ring = flag === "red" ? "border-red-400/40" : flag === "amber" ? "border-amber-400/40" : "border-white/10";
  return (
    <div className={`rounded-lg border ${ring} bg-black/50 p-2 flex flex-col gap-0.5`}>
      <div className="flex items-center gap-1 text-white/40">
        {icon}<span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-sm font-mono text-white/85">{value}</span>
      {sub && <span className="text-[9px] font-mono text-white/35">{sub}</span>}
    </div>
  );
}

// ── hook ─────────────────────────────────────────────────────────────────────
function usePSBStatus(intervalMs = 30_000) {
  const [data, setData] = useState<StatusFile | null>(null);
  const [age, setAge] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const headers = { "ngrok-skip-browser-warning": "true" };
    const poll = async () => {
      // Prod: served through the ngrok tunnel by proxy.py. Dev fallback: static public file.
      for (const url of [`/api/psb/status?_=${Date.now()}`, `/psb_status.json?_=${Date.now()}`]) {
        try {
          const res = await fetch(url, { cache: "no-store", headers });
          if (!res.ok) continue;
          const j: StatusFile = await res.json();
          if (!cancelled) setData(j);
          return;
        } catch {
          /* try next */
        }
      }
      if (!cancelled) setData((d) => d ?? { ok: false, error: "fetch failed" });
    };
    poll();
    const t = setInterval(poll, intervalMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [intervalMs]);

  // recompute freshness every second off the last payload
  useEffect(() => {
    const tick = () => {
      const ep = data?.generated_epoch;
      setAge(ep ? Date.now() / 1000 - ep : null);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data]);

  return { data, age };
}

// ── main panel ───────────────────────────────────────────────────────────────
export function PSBPanel() {
  const { data, age } = usePSBStatus();
  const h = data?.health ?? {};
  const { tone, note } = derive(data, age);
  const t = TONE[tone];

  const pnl = n(h.realized_pnl);
  const wr = n(h.session_wr);
  const cyc = n(h.cycle_ms);
  const page = n(h.price_age_s);
  const swap = n(h.swap_mb);
  const rss = n(h.rss_mb);
  const sess = h.session ? `…${h.session.slice(-6)}` : "—";

  const cycFlag: Tone | undefined = cyc != null ? (cyc > 30000 ? "amber" : undefined) : undefined;
  const pageFlag: Tone | undefined = page != null ? (page > 180 ? "amber" : undefined) : undefined;
  const swapFlag: Tone | undefined = swap != null ? (swap > 350 ? "amber" : undefined) : undefined;
  const wssOk = (h.wss ?? "") === "connected";

  return (
    <div className="rounded-xl border border-white/10 bg-black/50 p-3 flex flex-col gap-3">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-white/60" />
          <span className="text-xs font-mono uppercase tracking-widest text-white/50">PSB Bot</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${t.dot} ${tone === "green" ? "animate-pulse" : ""}`} />
          <span className={`text-[11px] font-mono font-semibold ${t.text}`}>{t.word}</span>
        </div>
      </div>

      {/* note line */}
      <div className={`text-[10px] font-mono ${t.text}/80 -mt-1`}>{note}</div>

      {/* P&L hero */}
      <div className="flex items-end justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-[9px] font-mono uppercase tracking-wider text-white/35">Session P&amp;L</span>
          <span className={`text-2xl font-mono font-bold ${pnl != null && pnl < 0 ? "text-red-400" : "text-green-400"}`}>
            {money(pnl)}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="text-xs font-mono text-white/70 flex items-center gap-1">
            {pnl != null && pnl < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
            WR {wr ?? "—"}%
          </span>
          <span className="text-[10px] font-mono text-white/40">{h.closed ?? "—"} closed · {h.daily_trades ?? "—"} today</span>
        </div>
      </div>

      {/* worst lane */}
      {h.worst_lane && h.worst_lane !== "-" && (
        <div className="flex items-center justify-between rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-1.5">
          <span className="text-[10px] font-mono text-white/45">worst lane</span>
          <span className="text-[11px] font-mono text-red-400/80">{h.worst_lane} {money(n(h.worst_lane_pnl))}</span>
        </div>
      )}

      {/* gauges */}
      <div className="grid grid-cols-3 gap-2">
        <Gauge2 icon={<Gauge size={13} />} label="Cycle"
          value={cyc != null ? `${(cyc / 1000).toFixed(1)}s` : "—"} sub="scan loop" flag={cycFlag} />
        <Gauge2 icon={<Activity size={13} />} label="Price age"
          value={page != null ? `${Math.round(page)}s` : "—"} sub={pageFlag ? "elevated" : "feed"} flag={pageFlag} />
        <Gauge2 icon={wssOk ? <Wifi size={13} /> : <WifiOff size={13} />} label="WSS"
          value={h.wss ?? "—"} flag={wssOk ? undefined : "amber"} />
        <Gauge2 icon={<Cpu size={13} />} label="RSS"
          value={rss != null ? `${rss}MB` : "—"} flag={rss != null && rss > 750 ? "red" : undefined} />
        <Gauge2 icon={<HardDrive size={13} />} label="Swap"
          value={swap != null ? `${swap}MB` : "—"} flag={swapFlag} />
        <Gauge2 icon={<Bot size={13} />} label="PID"
          value={h.mainpid ? String(h.mainpid) : "down"} sub={`${h.nrestarts ?? 0} restarts`}
          flag={h.mainpid ? undefined : "red"} />
      </div>

      {/* exits (diagnostic) */}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-1.5">
        <span className="text-[10px] font-mono text-white/40 flex items-center gap-1">
          <AlertTriangle size={11} className="text-amber-400/60" /> exits
        </span>
        <span className="text-[10px] font-mono text-white/55">
          payoff {h.exit_payoff ?? "—"} · {n(h.exit_green_stops) != null ? `${Math.round(n(h.exit_green_stops)! * 100)}% cut winners` : "—"}
        </span>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between text-[9px] font-mono text-white/30">
        <span>{sess}</span>
        <span>updated {secs(age)} ago</span>
      </div>
    </div>
  );
}
