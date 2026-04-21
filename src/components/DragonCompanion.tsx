import { useState, useEffect, useCallback, useRef, useId } from "react";
import type { AgentState } from "@/hooks/useRunStream";
import type { WeatherCondition } from "@/hooks/useWeather";
import { haptic } from "@/lib/telegram";
import { CylleneWeatherAmbience } from "@/components/CylleneWeatherAmbience";

type DayPhase = "night" | "morning" | "midday" | "evening";

function dayPhaseFromHour(h: number): DayPhase {
  if (h >= 22 || h < 6) return "night";
  if (h < 11) return "morning";
  if (h < 17) return "midday";
  return "evening";
}

const DEFAULT_WEATHER_SWAY: WeatherCondition = "cloudy";

const WEATHER_CONDITIONS: readonly WeatherCondition[] = [
  "sunny", "cloudy", "rain", "snow", "thunder", "fog", "windy",
];

function isWeatherCondition(s: string): s is WeatherCondition {
  return (WEATHER_CONDITIONS as readonly string[]).includes(s);
}

type DragonMood = "neutral" | "excited" | "alert" | "sleepy" | "happy" | "petted";
type EvolutionStage = "hatchling" | "juvenile" | "adult" | "elder" | "legendary";

/** Vector companion — chibi dragon with clear hatchling→legendary read (not an egg). */
function CyllenePetGraphic({
  stage,
  mood,
  fireColor,
}: {
  stage: EvolutionStage;
  mood: DragonMood;
  fireColor: string;
}) {
  const safe = useId().replace(/:/g, "");
  const bodyId = `pet-body-${safe}`;
  const fireId = `pet-fire-${safe}`;
  const wingId = `pet-wing-${safe}`;

  const rank =
    stage === "hatchling" ? 0
    : stage === "juvenile" ? 1
    : stage === "adult" ? 2
    : stage === "elder" ? 3
    : 4;

  const bodyRx = 26 + rank * 2.2;
  const bodyRy = 21 + rank * 1.6;
  const headRx = 14 + rank * 0.85;
  const hornH = 5.5 + rank * 2.4;
  const wingLift = rank * 1.5;
  const eyeR = rank === 0 ? 4.1 : 3.35;
  const scale = 0.9 + rank * 0.028;
  const sleepy = mood === "sleepy";
  const perk = mood === "excited" || mood === "petted";

  return (
    <svg
      viewBox="0 0 120 118"
      className="h-[4.75rem] w-[4.75rem] sm:h-[5.5rem] sm:w-[5.5rem] transition-transform duration-300 drop-shadow-[0_8px_32px_rgba(45,212,191,0.42)]"
      style={{
        transform: `scale(${perk ? 1.1 * scale : scale})`,
        filter:
          mood === "alert"
            ? "hue-rotate(292deg) saturate(1.18) drop-shadow(0 0 12px rgba(248,113,113,0.35))"
            : mood === "sleepy"
              ? "brightness(0.8) saturate(0.88)"
              : "none",
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id={bodyId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="45%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0d5c55" />
        </linearGradient>
        <linearGradient id={wingId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0d9488" stopOpacity={0.95} />
          <stop offset="100%" stopColor="#115e59" stopOpacity={0.92} />
        </linearGradient>
        <radialGradient id={fireId} cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor={fireColor} stopOpacity={0.85} />
          <stop offset="70%" stopColor={fireColor} stopOpacity={0.35} />
          <stop offset="100%" stopColor={fireColor} stopOpacity={0.08} />
        </radialGradient>
      </defs>

      {/* Tail — S-curve, longer with rank */}
      <path
        fill={`url(#${bodyId})`}
        stroke="#0f766e"
        strokeOpacity={0.35}
        strokeWidth={0.45}
        d={`M14 ${78 - rank} C2 ${62 - rank} 4 ${44 - rank * 0.5} 18 ${36 + rank * 0.3} C24 ${52 + rank} 30 ${68 + rank * 0.5} 38 ${76 + rank * 0.3} C28 ${84 + rank} 18 ${82 + rank} 14 ${78 - rank}Z`}
      />

      {/* Far wing */}
      <path
        fill={`url(#${wingId})`}
        d={`M30 ${46 - wingLift} Q6 ${28 - wingLift} 14 ${10 + rank} Q34 ${18 - wingLift} 44 ${40 - wingLift} Z`}
        opacity={0.82}
      />

      {/* Body */}
      <ellipse
        cx="54"
        cy="66"
        rx={bodyRx}
        ry={bodyRy}
        fill={`url(#${bodyId})`}
        stroke="#0f766e"
        strokeOpacity={0.28}
        strokeWidth={0.5}
      />

      {/* Back ridges (juvenile+) */}
      {rank >= 1 && (
        <g fill="#134e4a" opacity={0.85}>
          <path d={`M${38 - rank} ${48 - rank * 0.4} l4 -${5 + rank * 0.3} l4 ${5 + rank * 0.3}z`} />
          <path d={`M${48 - rank} ${44 - rank * 0.5} l5 -${6 + rank * 0.4} l5 ${6 + rank * 0.4}z`} />
          {rank >= 3 && <path d={`M${58 - rank} ${42 - rank * 0.5} l6 -${7 + rank * 0.3} l6 ${7 + rank * 0.3}z`} />}
        </g>
      )}

      {/* Belly + core glow */}
      <ellipse cx="54" cy="70" rx={bodyRx * 0.48} ry={bodyRy * 0.42} fill={`url(#${fireId})`} opacity={0.72} />
      <ellipse cx="54" cy="71" rx={bodyRx * 0.28} ry={bodyRy * 0.22} fill={fireColor} opacity={0.28} />

      {/* Neck */}
      <path
        fill={`url(#${bodyId})`}
        d="M58 42 C68 28 80 22 86 32 C90 42 84 52 74 54 C66 50 58 46 58 42Z"
      />

      {/* Head */}
      <ellipse cx="88" cy="34" rx={headRx} ry={12.5 + rank * 0.35} fill={`url(#${bodyId})`} stroke="#0f766e" strokeOpacity={0.22} strokeWidth={0.45} />

      {/* Snout */}
      <ellipse cx="106" cy="36" rx={12 + rank * 0.25} ry={9.5} fill={`url(#${bodyId})`} />
      <ellipse cx="114" cy="36" rx="2.1" ry="1.6" fill="#042f2e" opacity={0.55} />
      <ellipse cx="110" cy="35" rx="1.5" ry="1.2" fill="#042f2e" opacity={0.45} />

      {/* Near wing */}
      <path
        fill={`url(#${wingId})`}
        d={`M42 ${50 - wingLift} Q18 ${34 - wingLift} 22 ${12 + rank * 0.8} Q40 ${22 - wingLift} 52 ${46 - wingLift} Z`}
        opacity={0.94}
      />

      {/* Horns */}
      <path fill="#ecfdf5" d={`M78 ${22 - rank * 0.2} L82 ${22 - hornH} L86 ${22 - rank * 0.1} Z`} opacity={0.95} />
      <path fill="#ecfdf5" d={`M90 ${20 - rank * 0.2} L96 ${18 - hornH * 1.05} L98 ${20 - rank * 0.15} Z`} opacity={0.95} />

      {/* Eye */}
      {!sleepy ? (
        <g>
          <circle cx="98" cy="30" r={eyeR} fill="#042f2e" />
          <circle cx="99.3" cy="28.6" r={1.35} fill="#ecfdf5" opacity={0.94} />
        </g>
      ) : (
        <path
          stroke="#042f2e"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
          d="M92 30 Q98 27 104 30"
        />
      )}

      {/* Feet */}
      <ellipse cx="38" cy="88" rx="7" ry="5" fill="#0f766e" opacity={0.55} />
      <ellipse cx="58" cy="90" rx="7.5" ry="5" fill="#0f766e" opacity={0.55} />

      {/* Legendary halo */}
      {stage === "legendary" && (
        <g opacity={0.92}>
          <circle cx="44" cy="14" r="2.6" fill="#fde68a" />
          <circle cx="62" cy="8" r="1.9" fill="#fde68a" />
          <circle cx="30" cy="22" r="1.5" fill="#fde68a" />
          <path d="M72 6l1.2 3.5h3.8l-3 2.2 1.1 3.6-3-2.1-3 2.1 1.1-3.6-3-2.2h3.8z" fill="#fbbf24" opacity={0.85} />
        </g>
      )}
    </svg>
  );
}

/** Tiny vector flames — matches chosen fire color, no emoji font dependency. */
function FireBurstSvg({ color }: { color: string }) {
  const flame = (
    <path
      fill={color}
      d="M12 28c-4-6-6-12-4-18 1-4 3-6 4-8 1 3 3 6 4 10 1-4 3-7 6-9 0 8-2 16-10 25z"
      opacity={0.95}
    />
  );
  return (
    <div className="flex gap-1 h-7 items-end justify-center" style={{ filter: `drop-shadow(0 0 8px ${color}55)` }} aria-hidden>
      <svg className="w-[22px] h-[26px]" viewBox="0 0 24 32" aria-hidden>
        {flame}
      </svg>
      <svg className="w-[22px] h-[26px]" viewBox="0 0 24 32" aria-hidden>
        {flame}
      </svg>
    </div>
  );
}

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
  const [clock, setClock]               = useState(() => new Date());
  const [thunderFlash, setThunderFlash] = useState(false);

  const idleTimerRef  = useRef<ReturnType<typeof setTimeout>>(undefined);
  const moodTimerRef  = useRef<ReturnType<typeof setTimeout>>(undefined);
  const holdTimerRef  = useRef<ReturnType<typeof setTimeout>>(undefined);
  const holdFiredRef  = useRef(false);
  const colorHideRef  = useRef<ReturnType<typeof setTimeout>>(undefined);
  const thunderRef    = useRef<ReturnType<typeof setTimeout>>(undefined);
  const thunderOffRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevThunderFlash = useRef(false);

  const stage = computeStage(interactions, consecutiveDays);

  const wx =
    weather?.condition && isWeatherCondition(weather.condition)
      ? weather.condition
      : null;
  const swayKey = wx ?? DEFAULT_WEATHER_SWAY;
  const dayPhase = dayPhaseFromHour(clock.getHours());
  const timeShellClass =
    dayPhase === "midday" ? "cyllene-time-midday" : `cyllene-time-${dayPhase}`;

  // Wall-clock tick (day/night shell on .cyllene-pet-scene)
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Thunder: lightning flashes + Telegram haptic on strike (rising edge)
  useEffect(() => {
    clearTimeout(thunderRef.current);
    clearTimeout(thunderOffRef.current);
    if (wx !== "thunder") {
      setThunderFlash(false);
      return;
    }
    let cancelled = false;
    function schedule() {
      thunderRef.current = window.setTimeout(() => {
        if (cancelled) return;
        setThunderFlash(true);
        thunderOffRef.current = window.setTimeout(() => {
          if (!cancelled) setThunderFlash(false);
        }, 70 + Math.random() * 60);
        schedule();
      }, 2200 + Math.random() * 5200);
    }
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(thunderRef.current);
      clearTimeout(thunderOffRef.current);
    };
  }, [wx]);

  useEffect(() => {
    if (wx !== "thunder") {
      prevThunderFlash.current = false;
      return;
    }
    if (thunderFlash && !prevThunderFlash.current) {
      haptic.notification("warning");
    }
    prevThunderFlash.current = thunderFlash;
  }, [thunderFlash, wx]);

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
    wx === "rain" || wx === "snow" ? "🫰" :
    wx === "sunny"                 ? "🦅" :
    wx === "windy"                 ? "🌬️" : null;

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
        <div className={`cyllene-pet-scene ${timeShellClass}`}>
          <div className="cyllene-pet-dragon-stack">
            <div className={`cyllene-pet-outer-breathe cyllene-sway-${swayKey}`}>
              <div className="cyllene-pet-weather-inner">
                <CyllenePetGraphic stage={stage} mood={mood} fireColor={fireColor} />
              </div>
            </div>
          </div>

          <CylleneWeatherAmbience
            condition={wx}
            tempF={weather?.temp ?? null}
            thunderFlash={thunderFlash}
          />
        </div>

        {/* Mood badge */}
        <div className="text-2xl -mt-2 transition-all duration-200">{MOOD_EMOJI[mood]}</div>

        {/* Fire burst */}
        {(mood === "excited" || mood === "petted") && (
          <div className="animate-bounce">
            <FireBurstSvg color={fireColor} />
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
