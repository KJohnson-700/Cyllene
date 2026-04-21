import { useState, useEffect, useCallback, useRef } from "react";
import type { AgentState } from "@/hooks/useRunStream";
import { haptic } from "@/lib/telegram";

type DragonMood = "neutral" | "excited" | "alert" | "sleepy" | "happy" | "petted";
type EvolutionStage = "hatchling" | "juvenile" | "adult" | "elder" | "legendary";

const STAGE_EMOJI: Record<EvolutionStage, string> = {
  hatchling:  "🥚",
  juvenile:   "🐉",
  adult:      "🐲",
  elder:      "✨🐲",
  legendary:  "🌟🐲",
};

const MOOD_EMOJI: Record<DragonMood, string> = {
  neutral:  "😐",
  excited:  "🤩",
  alert:    "😤",
  sleepy:   "😴",
  happy:    "😄",
  petted:   "🥰",
};

const FIRE_COLORS = [
  { hex: "#ff6600", label: "Ember"    },
  { hex: "#00ffff", label: "Frost"    },
  { hex: "#a855f7", label: "Arcane"   },
  { hex: "#ffd700", label: "Solar"    },
  { hex: "#22c55e", label: "Nature"   },
  { hex: "#ff2d55", label: "Infernal" },
];

const IDLE_ACTIONS = ["yawn", "look left", "look right", "scratch", "sniff"] as const;

interface DragonPersisted {
  interactions:   number;
  lastSeen:       string;
  consecutiveDays: number;
  stage:          EvolutionStage;
  color:          string;
}

function loadDragonState(): DragonPersisted | null {
  try {
    const raw = localStorage.getItem("cyllene_dragon");
    if (raw) return JSON.parse(raw) as DragonPersisted;
  } catch {}
  return null;
}

function computeStage(interactions: number, days: number): EvolutionStage {
  if (days >= 30)                         return "legendary";
  if (interactions >= 5000 || days >= 7)  return "elder";
  if (interactions >= 2000)               return "adult";
  if (interactions >= 500)                return "juvenile";
  return "hatchling";
}

// ── Particle effect ───────────────────────────────────────────────────────────
interface Particle { id: number; dx: number; dy: number; emoji: string; }
let pid = 0;
const PARTICLE_POOL = ["✨", "💫", "⭐", "🌟", "💥"];

interface Props {
  agentState: AgentState;
  weather?: { condition: string; temp: number } | null;
}

export function DragonCompanion({ agentState, weather }: Props) {
  const saved = loadDragonState();
  const [interactions, setInteractions] = useState(saved?.interactions ?? 0);
  const [consecutiveDays]               = useState(saved?.consecutiveDays ?? 0);
  const [mood, setMood]                 = useState<DragonMood>("neutral");
  const [idleAction, setIdleAction]     = useState<string | null>(null);
  const [fireColor, setFireColor]       = useState(saved?.color ?? "#ff6600");
  const [showColors, setShowColors]     = useState(false);
  const [particles, setParticles]       = useState<Particle[]>([]);

  const idleTimerRef  = useRef<ReturnType<typeof setTimeout>>(undefined);
  const moodTimerRef  = useRef<ReturnType<typeof setTimeout>>(undefined);
  const holdTimerRef  = useRef<ReturnType<typeof setTimeout>>(undefined);
  const holdFiredRef  = useRef(false);
  const colorHideRef  = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stage = computeStage(interactions, consecutiveDays);

  // ── Agent state → mood ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mood === "petted") return;
    switch (agentState) {
      case "reasoning":
      case "responding": setMood("excited"); break;
      case "alert":      setMood("alert");   break;
      case "idle":       setMood("neutral"); break;
    }
  }, [agentState, mood]);

  // ── Idle animations every 30-60 s ──────────────────────────────────────────
  useEffect(() => {
    function scheduleIdle() {
      idleTimerRef.current = setTimeout(() => {
        if (mood === "neutral") {
          const action = IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)];
          setIdleAction(action);
          setTimeout(() => setIdleAction(null), 2000);
        }
        scheduleIdle();
      }, 30_000 + Math.random() * 30_000);
    }
    scheduleIdle();
    return () => clearTimeout(idleTimerRef.current);
  }, [mood]);

  // ── Sleepy after 2 min idle ─────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(moodTimerRef.current);
    if (agentState === "idle") {
      moodTimerRef.current = setTimeout(() => setMood("sleepy"), 120_000);
    }
    return () => clearTimeout(moodTimerRef.current);
  }, [agentState]);

  // ── Persist ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const today   = new Date().toISOString().slice(0, 10);
    const lastSeen = saved?.lastSeen ?? today;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const newDays = lastSeen === today ? consecutiveDays
                  : lastSeen === yesterday ? consecutiveDays + 1
                  : 1;
    localStorage.setItem("cyllene_dragon", JSON.stringify({
      interactions, consecutiveDays: newDays,
      lastSeen: today, stage, color: fireColor,
    } satisfies DragonPersisted));
  }, [interactions, stage, fireColor, consecutiveDays, saved?.lastSeen]);

  // ── Pet (tap) ───────────────────────────────────────────────────────────────
  const pet = useCallback(() => {
    haptic.impact("medium");
    setMood("petted");
    setInteractions((n) => n + 1);
    clearTimeout(moodTimerRef.current);
    moodTimerRef.current = setTimeout(() => setMood("neutral"), 1800);

    // burst of 6 particles in random directions
    const burst: Particle[] = Array.from({ length: 6 }, () => ({
      id:    pid++,
      dx:    (Math.random() - 0.5) * 120,
      dy:    -(Math.random() * 80 + 20),
      emoji: PARTICLE_POOL[Math.floor(Math.random() * PARTICLE_POOL.length)],
    }));
    setParticles((prev) => [...prev, ...burst]);
    setTimeout(() => setParticles((prev) => prev.filter((p) => !burst.includes(p))), 700);
  }, []);

  // ── Pointer hold → reveal color picker ─────────────────────────────────────
  const handlePointerDown = useCallback(() => {
    holdFiredRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      holdFiredRef.current = true;
      haptic.impact("heavy");
      setShowColors(true);
      clearTimeout(colorHideRef.current);
      // Auto-hide after 5 s of inactivity
      colorHideRef.current = setTimeout(() => setShowColors(false), 5_000);
    }, 480);
  }, []);

  const handlePointerUp = useCallback(() => {
    clearTimeout(holdTimerRef.current);
    if (!holdFiredRef.current) {
      // Short press = tap = pet
      pet();
    }
  }, [pet]);

  const handlePointerLeave = useCallback(() => {
    clearTimeout(holdTimerRef.current);
    holdFiredRef.current = false;
  }, []);

  const pickColor = useCallback((hex: string) => {
    haptic.selection();
    setFireColor(hex);
    // Reset the auto-hide timer when a color is picked
    clearTimeout(colorHideRef.current);
    colorHideRef.current = setTimeout(() => setShowColors(false), 5_000);
  }, []);

  // ── Weather → wings ─────────────────────────────────────────────────────────
  const wingsLabel =
    weather?.condition === "rain" || weather?.condition === "snow" ? "🫰" :
    weather?.condition === "sunny"                                 ? "🦅" :
    weather?.condition === "windy"                                 ? "🌬️" : null;

  return (
    <div className="flex flex-col items-center gap-5 select-none">

      {/* Dragon body ─────────────────────────────────────────────────────── */}
      <div
        className="relative flex flex-col items-center gap-1 cursor-pointer active:scale-95 transition-transform touch-none"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        role="button"
        aria-label="Pet your dragon — hold for fire colors"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") pet(); }}
      >
        {/* Dragon emoji */}
        <div
          className="text-7xl transition-all duration-300"
          style={{
            filter:    mood === "alert"  ? "hue-rotate(340deg)"
                     : mood === "sleepy" ? "brightness(0.65)"
                     : "none",
            transform: mood === "excited" || mood === "petted" ? "scale(1.12)" : "scale(1)",
          }}
        >
          {STAGE_EMOJI[stage]}
        </div>

        {/* Mood badge */}
        <div className="text-2xl -mt-2 transition-all duration-200">{MOOD_EMOJI[mood]}</div>

        {/* Fire burst */}
        {(mood === "excited" || mood === "petted") && (
          <div className="flex gap-1 animate-bounce" style={{ color: fireColor }}>
            🔥🔥
          </div>
        )}

        {/* Wings */}
        {wingsLabel && <div className="text-sm opacity-50">{wingsLabel}</div>}

        {/* Idle bubble */}
        {idleAction && (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-black/75 text-xs text-white/80 px-2 py-1 rounded-full whitespace-nowrap border border-white/10 pointer-events-none">
            *{idleAction}*
          </div>
        )}

        {/* Particle burst on pet */}
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute pointer-events-none text-lg"
            style={{
              animation: "particle-fly 0.65s ease-out forwards",
              // CSS custom props drive the keyframe
              ["--dx" as string]: `${p.dx}px`,
              ["--dy" as string]: `${p.dy}px`,
            }}
          >
            {p.emoji}
          </span>
        ))}
      </div>

      {/* Color picker (hold-revealed) ───────────────────────────────────── */}
      <div
        className={`flex flex-col items-center gap-2 transition-all duration-300 overflow-hidden ${
          showColors ? "opacity-100 max-h-24" : "opacity-0 max-h-0"
        }`}
        aria-hidden={!showColors}
      >
        <p className="text-[10px] text-white/30 font-mono tracking-widest uppercase">fire color</p>
        <div className="flex gap-3">
          {FIRE_COLORS.map(({ hex, label }) => (
            <button
              key={hex}
              onClick={() => pickColor(hex)}
              title={label}
              className="w-6 h-6 rounded-full border-2 transition-all duration-200"
              style={{
                background:  hex,
                borderColor: fireColor === hex ? "white" : "rgba(255,255,255,0.15)",
                transform:   fireColor === hex ? "scale(1.35)" : "scale(1)",
                boxShadow:   fireColor === hex ? `0 0 10px ${hex}` : "none",
              }}
              aria-label={`${label} fire`}
            />
          ))}
        </div>
      </div>

      {/* Stats ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-3 text-xs font-mono text-white/35">
        <span>{interactions} pets</span>
        <span>·</span>
        <span>{stage}</span>
        <span>·</span>
        <span>{consecutiveDays}d streak</span>
      </div>

      {/* Evolution bar ──────────────────────────────────────────────────── */}
      <div className="w-48">
        <div className="flex justify-between text-[10px] text-white/25 mb-1 font-mono">
          <span>evolution</span>
          <span>{Math.min(100, Math.round((interactions / 5000) * 100))}%</span>
        </div>
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width:      `${Math.min(100, (interactions / 5000) * 100)}%`,
              background: `linear-gradient(90deg, #00ffff, ${fireColor})`,
              boxShadow:  `0 0 6px ${fireColor}60`,
            }}
          />
        </div>
      </div>

    </div>
  );
}
