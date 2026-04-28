import { useState, useEffect, useCallback, useRef } from "react";
import type { AgentState } from "@/hooks/useRunStream";
import { haptic } from "@/lib/telegram";

type CompanionMood =
  | "neutral" | "excited" | "alert"  | "sleepy"
  | "happy"   | "petted"  | "angry"  | "sad" | "laughing";

type EvolutionStage = "hatchling" | "juvenile" | "adult" | "elder" | "legendary";

const STAGE_NAMES: Record<EvolutionStage, string> = {
  hatchling: "hatchling", juvenile: "juvenile", adult: "guardian",
  elder: "elder", legendary: "legendary",
};

const FIRE_COLORS = [
  { hex: "#ff6600", label: "Ember"    },
  { hex: "#00ffff", label: "Frost"    },
  { hex: "#a855f7", label: "Arcane"   },
  { hex: "#ffd700", label: "Solar"    },
  { hex: "#22c55e", label: "Nature"   },
  { hex: "#ff2d55", label: "Infernal" },
];

// ── Per-mood floating indicators ──────────────────────────────────────────────
interface IndicatorCfg {
  symbols:  string[];
  color:    [number, number, number];
  orbitR:   number;   // multiplier of sz
  orbitRY:  number;   // vertical squeeze of orbit
  speed:    number;   // radians / second
  fontSize: number;   // multiplier of sz
  mode:     "orbit" | "drift-up" | "pulse-fixed";
}

const MOOD_INDICATORS: Partial<Record<CompanionMood, IndicatorCfg>> = {
  excited: {
    symbols:  ["⚡", "⚡", "⚡"],
    color:    [80, 210, 255],
    orbitR:   1.2, orbitRY: 0.48,
    speed:    2.6, fontSize: 0.22,
    mode:     "orbit",
  },
  alert: {
    symbols:  ["!", "!"],
    color:    [255, 185, 30],
    orbitR:   1.1, orbitRY: 0.5,
    speed:    0.7, fontSize: 0.28,
    mode:     "pulse-fixed",
  },
  angry: {
    symbols:  ["!", "!!", "!"],
    color:    [255, 50, 30],
    orbitR:   1.08, orbitRY: 0.44,
    speed:    3.4, fontSize: 0.25,
    mode:     "orbit",
  },
  sad: {
    symbols:  ["·", "·", "·", "·"],
    color:    [100, 140, 220],
    orbitR:   1.0, orbitRY: 0.55,
    speed:    0.35, fontSize: 0.22,
    mode:     "drift-up",
  },
  happy: {
    symbols:  ["♪", "♫", "♪"],
    color:    [255, 215, 55],
    orbitR:   1.18, orbitRY: 0.42,
    speed:    0.85, fontSize: 0.23,
    mode:     "drift-up",
  },
  petted: {
    symbols:  ["♡", "♡"],
    color:    [255, 120, 160],
    orbitR:   1.15, orbitRY: 0.5,
    speed:    0.6, fontSize: 0.2,
    mode:     "orbit",
  },
  laughing: {
    symbols:  ["HA", "ha", "HA", "ha"],
    color:    [255, 230, 80],
    orbitR:   1.25, orbitRY: 0.5,
    speed:    3.8, fontSize: 0.21,
    mode:     "drift-up",
  },
};

interface DragonPersisted {
  interactions:    number;
  lastSeen:        string;
  consecutiveDays: number;
  stage:           EvolutionStage;
  color:           string;
}

function loadDragonState(): DragonPersisted | null {
  try {
    const raw = localStorage.getItem("cyllene_dragon");
    if (raw) return JSON.parse(raw) as DragonPersisted;
  } catch {}
  return null;
}

function computeStage(interactions: number, days: number): EvolutionStage {
  if (days >= 30)                        return "legendary";
  if (interactions >= 5000 || days >= 7) return "elder";
  if (interactions >= 2000)              return "adult";
  if (interactions >= 500)               return "juvenile";
  return "hatchling";
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

interface Ripple     { id: number; x: number; y: number; ts: number; }
interface FloatHeart { id: number; x: number; y: number; vx: number; vy: number; ts: number; }
interface FloatText  { id: number; x: number; y: number; text: string; vx: number; ts: number; }
let ripId = 0, hrtId = 0, txtId = 0;

interface Props {
  agentState: AgentState;
  weather?: { condition: string; temp: number } | null;
}

export function DragonCompanion({ agentState, weather: _weather }: Props) {
  const saved            = loadDragonState();
  const [interactions, setInteractions] = useState(saved?.interactions ?? 0);
  const [consecutiveDays]               = useState(saved?.consecutiveDays ?? 0);
  const [mood, setMood]                 = useState<CompanionMood>("neutral");
  const [fireColor, setFireColor]       = useState(saved?.color ?? "#ff6600");
  const [showColors, setShowColors]     = useState(false);

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const cssWRef      = useRef(300);
  const cssHRef      = useRef(400);
  const ripples      = useRef<Ripple[]>([]);
  const hearts       = useRef<FloatHeart[]>([]);
  const floatTexts   = useRef<FloatText[]>([]);
  const moodRef      = useRef<CompanionMood>(mood);
  const fireRef      = useRef(fireColor);
  const stageRef     = useRef<EvolutionStage>(computeStage(interactions, consecutiveDays));
  const moodTimer    = useRef<ReturnType<typeof setTimeout>>(undefined);
  const holdTimer    = useRef<ReturnType<typeof setTimeout>>(undefined);
  const holdFired    = useRef(false);
  const colorHide    = useRef<ReturnType<typeof setTimeout>>(undefined);
  const raf          = useRef(0);
  const t0           = useRef(performance.now());
  const tapTimes     = useRef<number[]>([]);
  // Smooth expression state
  const expr = useRef({
    smile: 0, openMouth: 0, angerBrow: 0, heartEye: 0, crescentEye: 0,
    pupilScale: 1, eyeOpenness: 1, eyeTiltL: 0, eyeTiltR: 0, squint: 0,
    wriggle: 0,
  });
  // Laugh "HA" burst throttle
  const lastHaBurst = useRef(0);

  const stage = computeStage(interactions, consecutiveDays);
  
  // Tunable physics parameters for the pet (spring-like, lightweight)
  const PHYS = {
    floatBase: 0.11,      // base vertical float amplitude (scale of sz)
    floatSpeed: 0.88,     // base float frequency (Hz factor)
    breatheAmp: 0.018,    // breathing amplitude
    laughShakeMag: 0.12,  // laugh shake multiplier
    wingIdleAmp: 0.06,
    wingExcitedAmp: 0.20,
    wingIdleSpeed: 1.4,
    wingExcitedSpeed: 5.8,
    tailFreq: 0.09,
    lerpDefault: 0.09,
    lerpFast: 0.14,
  } as const;
  
  function weatherToParams(w?: { condition: string; temp: number } | null) {
    if (!w) return {
      floatMul: 1, floatSpeedMul: 1, breatheMul: 1,
      wingAmpMul: 1, wingSpeedMul: 1, tailFreqMul: 1,
      colorTint: null, idleActivity: 1,
    };
    const c = w.condition.toLowerCase();
    const t = w.temp ?? 15;
    // base mapping
    let p = { floatMul: 1, floatSpeedMul: 1, breatheMul: 1, wingAmpMul: 1, wingSpeedMul: 1, tailFreqMul: 1, colorTint: null, idleActivity: 1 } as const;
    if (c.includes("storm") || c.includes("thunder") || c.includes("severe")) {
      return { ...p, floatMul: 1.25, floatSpeedMul: 1.15, breatheMul: 1.1, wingAmpMul: 1.05, wingSpeedMul: 1.4, tailFreqMul: 1.6, colorTint: [80,80,120], idleActivity: 1.35 };
    }
    if (c.includes("rain") || c.includes("drizzle")) {
      return { ...p, floatMul: 1.1, floatSpeedMul: 0.95, breatheMul: 0.95, wingAmpMul: 0.85, wingSpeedMul: 0.9, tailFreqMul: 1.1, colorTint: [120,150,200], idleActivity: 0.9 };
    }
    if (c.includes("snow") || c.includes("sleet") || c.includes("blizzard")) {
      return { ...p, floatMul: 0.92, floatSpeedMul: 0.8, breatheMul: 0.9, wingAmpMul: 0.7, wingSpeedMul: 0.75, tailFreqMul: 0.9, colorTint: [200,220,255], idleActivity: 0.75 };
    }
    if (c.includes("clear") || c.includes("sun") || c.includes("sunny")) {
      return { ...p, floatMul: 1.08, floatSpeedMul: 1.05, breatheMul: 1.05, wingAmpMul: 1.12, wingSpeedMul: 1.05, tailFreqMul: 1.0, colorTint: [255,240,200], idleActivity: 1.15 };
    }
    if (c.includes("cloud") || c.includes("overcast")) {
      return { ...p, floatMul: 0.98, floatSpeedMul: 0.95, breatheMul: 0.98, wingAmpMul: 0.95, wingSpeedMul: 0.95, tailFreqMul: 0.95, colorTint: [220,220,230], idleActivity: 0.95 };
    }
    if (c.includes("fog") || c.includes("mist")) {
      return { ...p, floatMul: 0.9, floatSpeedMul: 0.85, breatheMul: 0.9, wingAmpMul: 0.7, wingSpeedMul: 0.8, tailFreqMul: 0.85, colorTint: [200,200,210], idleActivity: 0.6 };
    }
    if (c.includes("wind") || c.includes("breez")) {
      return { ...p, floatMul: 1.18, floatSpeedMul: 1.25, breatheMul: 1.05, wingAmpMul: 1.25, wingSpeedMul: 1.45, tailFreqMul: 1.6, colorTint: [200,220,240], idleActivity: 1.5 };
    }
    // temperature tweak: cold (below 5) reduces wing energy, hot increases
    const tempMul = t < 5 ? 0.9 : t > 25 ? 1.08 : 1;
    return { ...p, wingAmpMul: tempMul, floatMul: 1, idleActivity: 1 };
  }
  useEffect(() => { moodRef.current = mood; }, [mood]);
  useEffect(() => { fireRef.current = fireColor; }, [fireColor]);
  useEffect(() => { stageRef.current = stage; }, [stage]);

  // ── Agent state → mood ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mood === "petted" || mood === "laughing") return;
    switch (agentState) {
      case "reasoning":
      case "responding": setMood("excited");  break;
      case "alert":      setMood("alert");    break;
      case "angry":      setMood("angry");    break;
      case "sad":        setMood("sad");      break;
      case "idle":       setMood("neutral");  break;
    }
  }, [agentState, mood]);


  // Sleepy after 2 min idle
  useEffect(() => {
    clearTimeout(moodTimer.current);
    if (agentState === "idle") {
      moodTimer.current = setTimeout(() => setMood("sleepy"), 120_000);
    }
    return () => clearTimeout(moodTimer.current);
  }, [agentState]);

  // ── Persist ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const today     = new Date().toISOString().slice(0, 10);
    const lastSeen  = saved?.lastSeen ?? today;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const newDays   = lastSeen === today ? consecutiveDays
                    : lastSeen === yesterday ? consecutiveDays + 1 : 1;
    localStorage.setItem("cyllene_dragon", JSON.stringify({
      interactions, consecutiveDays: newDays, lastSeen: today, stage, color: fireColor,
    } satisfies DragonPersisted));
  }, [interactions, stage, fireColor, consecutiveDays, saved?.lastSeen]);

  // ── Canvas draw loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = (now: number) => {
      const t   = (now - t0.current) / 1000;
      const W   = cssWRef.current;
      const H   = cssHRef.current;
      const dpr = window.devicePixelRatio || 1;
      const m   = moodRef.current;
      const fc  = fireRef.current;
      const st  = stageRef.current;
      const [fr, fg, fb] = hexToRgb(fc);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // ── Expression targets ──
      const ex   = expr.current;
      const isLaugh  = m === "laughing";
      const isDance  = false;
      const tgt = {
        smile:       isLaugh || isDance || m === "happy" || m === "petted" || m === "excited" ? 1
                   : m === "angry" || m === "sad" ? -1 : 0,
        openMouth:   isLaugh ? 1 : isDance ? 0.7 : m === "excited" ? 0.8 : m === "petted" ? 0.5 : 0,
        angerBrow:   m === "angry" ? 1 : 0,
        heartEye:    m === "petted" ? 1 : 0,
        crescentEye: isLaugh || isDance || m === "happy" ? 1 : 0,
        pupilScale:  m === "alert" || m === "excited" ? 1.22 : m === "sleepy" ? 0.6 : 0.88,
        eyeOpenness: isLaugh ? 0.08 : isDance ? 0.25 : m === "sleepy" ? 0.15 : m === "sad" ? 0.65 : 1,
        eyeTiltL:    m === "sad" ? 0.25 : m === "angry" ? -0.18 : 0,
        eyeTiltR:    m === "sad" ? -0.25 : m === "angry" ? 0.18 : 0,
        squint:      m === "angry" ? 0.5 : isLaugh ? 0.6 : isDance ? 0.4 : 0,
      };
      const lp = isLaugh || isDance ? PHYS.lerpFast : PHYS.lerpDefault;
      for (const k of Object.keys(tgt) as (keyof typeof tgt)[]) {
        (ex as Record<string, number>)[k] = lerp((ex as Record<string, number>)[k], tgt[k], lp);
      }

      // Stage scale
      const stScale = st === "hatchling" ? 0.62 : st === "juvenile" ? 0.80 : 1.0;
      const sz = Math.min(W, H) * 0.36 * stScale;

      // Weather-influenced float, breathe, laugh-shake, dance and idle micro-motions
      const wp = weatherToParams(_weather);
      const floatSpeedEff = PHYS.floatSpeed * (wp.floatSpeedMul ?? 1);
      const floatBaseEff  = PHYS.floatBase * (wp.floatMul ?? 1);
      const floatY        = Math.sin(t * floatSpeedEff) * sz * floatBaseEff;
      const breathe       = 1 + Math.sin(t * 1.25) * (PHYS.breatheAmp * (wp.breatheMul ?? 1));
      const laughShake    = isLaugh ? Math.sin(t * 11.5) * PHYS.laughShakeMag : 0;
      const laughBounce   = isLaugh ? Math.abs(Math.sin(t * 11.5)) * sz * 0.04 : 0;
      // Dance: side-to-side sway + rhythmic up-hop (4/4 beat feel)
      const danceSwayAng = isDance ? Math.sin(t * 5.2) * 0.22 : 0;
      const danceHop     = isDance ? Math.abs(Math.sin(t * 5.2)) * sz * 0.07 : 0;
      // small idle micro-motions (head tilt/eye bob) influenced by weather's idleActivity
      const idleMicro = Math.sin(t * 0.72) * 0.004 * (wp.idleActivity ?? 1);
      const tiltAng  = laughShake + danceSwayAng + idleMicro +
        (m === "excited" ? Math.sin(t * 3.4) * 0.1 : Math.sin(t * 0.52) * 0.035);

      const cx = W / 2;
      const cy = H * 0.44 + floatY - laughBounce - danceHop;

      // ── Aura glow ──
      if (m !== "sleepy") {
        const auraA = isLaugh || isDance ? 0.6 : m === "excited" || m === "petted" ? 0.5 : m === "angry" ? 0.42 : 0.22;
        const [ar, ag, ab] = isLaugh ? [255, 220, 60] : isDance ? [180, 120, 255] : [fr, fg, fb];
        const aGrad = ctx.createRadialGradient(cx, cy + sz * 0.9, 0, cx, cy + sz * 0.9, sz * 0.85);
        aGrad.addColorStop(0, `rgba(${ar},${ag},${ab},${auraA})`);
        aGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = aGrad;
        ctx.beginPath();
        ctx.ellipse(cx, cy + sz * 0.9, sz * 0.85, sz * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Dragon body ──
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tiltAng);
      const bodyScaleX = breathe + (isLaugh ? Math.sin(t * 11.5) * 0.02 : 0);
      ctx.scale(bodyScaleX, breathe);

      // Dragon anatomy dimensions (all relative to sz)
      const bW = sz * 0.34;   // body half-width
      const bH = sz * 0.44;   // body half-height
      const hR = sz * 0.30;   // head radius
      const hY = -bH * 0.62;  // head centre Y (relative to dragon centre)

      const bodyA = m === "sleepy" ? 0.52 : 0.86;
      const tr = Math.min(255, fr * 0.25 + 160);
      const tg = Math.min(255, fg * 0.25 + 160);
      const tb = Math.min(255, fb * 0.25 + 175);

      // ── Tail (behind body, drawn first) ──
      {
      const txS = bW * 0.72, tyS = bH * 0.72;
      ctx.fillStyle   = `rgba(${tr},${tg},${tb},${bodyA * 0.88})`;
      ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.18)`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(txS - sz * 0.04, tyS - sz * 0.04);
      ctx.bezierCurveTo(txS + sz * 0.24, tyS + sz * 0.04, txS + sz * 0.50, tyS + sz * 0.02, txS + sz * 0.56, tyS - sz * 0.06);
      ctx.lineTo(txS + sz * 0.64, tyS - sz * 0.22);   // spike tip
      ctx.bezierCurveTo(txS + sz * 0.52, tyS + sz * 0.06, txS + sz * 0.28, tyS + sz * 0.17, txS - sz * 0.04, tyS + sz * 0.06);
      // add subtle tail wobble influenced by expression wriggle
      const R = hR;
      for (let i = 0; i < 3; i++) {
        const x2 = cx + R - (i + 0.5) * (R * 2 / 3);
        const x3 = cx + R - (i + 1) * (R * 2 / 3);
        const wobble = Math.sin(t * (PHYS.tailFreq * (wp.tailFreqMul ?? 1)) + i * 2.09) * R * (expr.current.wriggle ?? 0.22);
        ctx.quadraticCurveTo(x2, tyS + R * 0.42 + wobble, x3, tyS);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      }

      // ── Wings (behind body, always present — bigger on adult+) ──
      {
        const wingSpeedBase = m === "excited" ? PHYS.wingExcitedSpeed : PHYS.wingIdleSpeed;
        const wingAmpBase   = m === "excited" ? PHYS.wingExcitedAmp : PHYS.wingIdleAmp;
        const wingSpeed = wingSpeedBase * (wp.wingSpeedMul ?? 1);
        const wingAmp   = wingAmpBase * (wp.wingAmpMul ?? 1);
        const wingFlap = Math.sin(t * wingSpeed) * wingAmp;
        const wScale   = st === "hatchling" ? 0.60 : st === "juvenile" ? 0.80 : 1.0;
        const wAttachY = -bH * 0.18;

        for (const side of [-1, 1] as const) {
          const s     = side as number;
          const fSway = wingFlap * s;
          const tipX  = s * (bW * 1.88 + fSway * bW * 1.2) * wScale;
          const tipY  = (wAttachY - bH * 0.60 + Math.abs(wingFlap) * bH * 0.25) * wScale;
          const loX   = s * bW * 1.52 * wScale;
          const loY   = (wAttachY + bH * 0.14) * wScale;

          const wGrad = ctx.createLinearGradient(s * bW * 0.8, wAttachY, tipX, tipY);
          wGrad.addColorStop(0, `rgba(${fr},${fg},${fb},0.65)`);
          wGrad.addColorStop(1, `rgba(${fr},${fg},${fb},0.06)`);
          ctx.fillStyle   = wGrad;
          ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.22)`;
          ctx.lineWidth   = 1;

          ctx.beginPath();
          ctx.moveTo(s * bW * 0.82, wAttachY - bH * 0.04);
          ctx.quadraticCurveTo(s * bW * 1.28 * wScale, wAttachY - bH * 0.44 * wScale, tipX, tipY);
          ctx.quadraticCurveTo(s * bW * 1.72 * wScale, wAttachY - bH * 0.08, loX, loY);
          ctx.quadraticCurveTo(s * bW * 1.38 * wScale + fSway * bW * 0.5, wAttachY - bH * 0.22 * wScale, s * bW * 0.84, wAttachY + bH * 0.04);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Wing bones
          ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.30)`;
          ctx.lineWidth   = 0.8;
          ctx.lineCap     = "round";
          ctx.beginPath(); ctx.moveTo(s * bW * 0.82, wAttachY); ctx.lineTo(tipX, tipY); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(s * bW * 0.82, wAttachY); ctx.lineTo(loX,  loY);  ctx.stroke();
        }
      }

      // ── Body torso ──
      {
        const bodyGrad = ctx.createLinearGradient(-bW, -bH, bW * 0.5, bH);
        bodyGrad.addColorStop(0,   `rgba(235,245,255,${bodyA})`);
        bodyGrad.addColorStop(0.6, `rgba(215,228,255,${bodyA})`);
        bodyGrad.addColorStop(1,   `rgba(${tr},${tg},${tb},${bodyA * 0.85})`);
        ctx.fillStyle   = bodyGrad;
        ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.18)`;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, bH * 0.08, bW, bH, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Belly highlight
        const bellyG = ctx.createRadialGradient(0, bH * 0.22, 0, 0, bH * 0.22, bW * 0.74);
        bellyG.addColorStop(0, `rgba(248,252,255,${bodyA * 0.55})`);
        bellyG.addColorStop(1, `rgba(248,252,255,0)`);
        ctx.fillStyle = bellyG;
        ctx.beginPath();
        ctx.ellipse(0, bH * 0.22, bW * 0.58, bH * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Feet ──
      {
        const footY = bH * 1.02;
        for (const side of [-1, 1] as const) {
          ctx.fillStyle   = `rgba(${tr},${tg},${tb},${bodyA * 0.90})`;
          ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.20)`;
          ctx.lineWidth   = 1;
          ctx.beginPath();
          ctx.ellipse(side * bW * 0.52, footY, bW * 0.26, bH * 0.13, side * 0.18, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.35)`;
          ctx.lineWidth   = 1.2;
          ctx.lineCap     = "round";
          for (let c = -1; c <= 1; c++) {
            ctx.beginPath();
            ctx.moveTo(side * bW * 0.52 + c * bW * 0.10, footY + bH * 0.07);
            ctx.lineTo(side * bW * 0.52 + c * bW * 0.15, footY + bH * 0.18);
            ctx.stroke();
          }
        }
      }

      // ── Head ──
      {
        const headGrad = ctx.createRadialGradient(-hR * 0.18, hY - hR * 0.12, hR * 0.08, 0, hY, hR * 1.1);
        headGrad.addColorStop(0,   `rgba(242,250,255,${bodyA})`);
        headGrad.addColorStop(0.7, `rgba(218,232,255,${bodyA})`);
        headGrad.addColorStop(1,   `rgba(${tr},${tg},${tb},${bodyA * 0.82})`);
        ctx.fillStyle   = headGrad;
        ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.18)`;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(0, hY, hR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // ── Horns ──
      for (const side of [-1, 1] as const) {
        const hx  = side * hR * 0.48;
        const hby = hY - hR * 0.70;
        ctx.fillStyle   = `rgba(${fr},${fg},${fb},0.80)`;
        ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.22)`;
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(hx - side * hR * 0.14, hby);
        ctx.quadraticCurveTo(hx + side * hR * 0.05, hby - hR * 0.50, hx + side * hR * 0.02, hby - hR * 0.58);
        ctx.quadraticCurveTo(hx + side * hR * 0.22, hby - hR * 0.28, hx + side * hR * 0.16, hby);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // ── Ear frills (juvenile+) ──
      if (st !== "hatchling") {
        for (const side of [-1, 1] as const) {
          ctx.fillStyle   = `rgba(${fr},${fg},${fb},0.28)`;
          ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.14)`;
          ctx.lineWidth   = 0.8;
          ctx.beginPath();
          ctx.moveTo(side * hR * 0.86, hY - hR * 0.08);
          ctx.quadraticCurveTo(side * hR * 1.30, hY - hR * 0.52, side * hR * 1.14, hY + hR * 0.12);
          ctx.quadraticCurveTo(side * hR * 1.00, hY + hR * 0.22, side * hR * 0.90, hY + hR * 0.18);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      // ── Snout ──
      const snoutY = hY + hR * 0.44;
      {
        const snoutG = ctx.createRadialGradient(0, snoutY, 0, 0, snoutY, hR * 0.44);
        snoutG.addColorStop(0, `rgba(242,250,255,${bodyA * 0.88})`);
        snoutG.addColorStop(1, `rgba(${tr},${tg},${tb},${bodyA * 0.55})`);
        ctx.fillStyle   = snoutG;
        ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.14)`;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.ellipse(0, snoutY, hR * 0.36, hR * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Nostrils
        ctx.fillStyle = `rgba(${fr},${fg},${fb},0.38)`;
        for (const side of [-1, 1] as const) {
          ctx.beginPath();
          ctx.ellipse(side * hR * 0.13, snoutY - hR * 0.04, hR * 0.055, hR * 0.038, side * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Eyes (placed on the head) ──
      const eyeSpread = hR * 0.36;
      const eyeBaseY  = hY - hR * 0.10;
      const eRX = hR * 0.18;
      const eRY = hR * 0.15;

      for (const [i, side] of ([-1, 1] as const).entries()) {
        const exPos  = side * eyeSpread;
        const eyTilt = i === 0 ? ex.eyeTiltL : ex.eyeTiltR;

        ctx.save();
        ctx.translate(exPos, eyeBaseY);
        ctx.rotate(eyTilt);

        if (ex.heartEye > 0.5) {
          const hs = eRX * 0.85 * ex.heartEye;
          ctx.fillStyle = `rgba(${fr},${fg},${fb},${0.7 + ex.heartEye * 0.25})`;
          ctx.beginPath();
          ctx.moveTo(0, hs * 0.25);
          ctx.bezierCurveTo(0, -hs * 0.3, -hs, -hs * 0.3, -hs, hs * 0.25);
          ctx.bezierCurveTo(-hs, hs * 0.75, 0, hs * 1.3, 0, hs * 1.5);
          ctx.bezierCurveTo(0, hs * 1.3, hs, hs * 0.75, hs, hs * 0.25);
          ctx.bezierCurveTo(hs, -hs * 0.3, 0, -hs * 0.3, 0, hs * 0.25);
          ctx.fill();

        } else if (ex.crescentEye > 0.5 || ex.eyeOpenness < 0.2) {
          ctx.strokeStyle = "rgba(30,30,60,0.82)";
          ctx.lineWidth   = eRX * 0.38;
          ctx.lineCap     = "round";
          ctx.beginPath();
          ctx.arc(0, eRY * 0.15, eRX * 0.72, Math.PI + 0.18, -0.18, false);
          ctx.stroke();
          if (isLaugh) {
            const blushA = 0.18 + Math.sin(t * 1.5) * 0.06;
            ctx.fillStyle = `rgba(255,140,120,${blushA})`;
            ctx.beginPath();
            ctx.ellipse(0, eRY * 1.6, eRX * 1.1, eRY * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
          }

        } else {
          const openH = eRY * ex.eyeOpenness;
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(0, 0, eRX * 1.1, openH + eRY * ex.squint * 0.5, 0, 0, Math.PI * 2);
          ctx.clip();

          ctx.fillStyle = "rgba(18,18,52,0.88)";
          ctx.beginPath();
          ctx.ellipse(0, 0, eRX * ex.pupilScale, eRY * ex.pupilScale, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "rgba(255,255,255,0.88)";
          ctx.beginPath();
          ctx.ellipse(-eRX * 0.28, -eRY * 0.28, eRX * 0.22, eRY * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();

          if (m === "excited") {
            const spa = 0.55 + Math.sin(t * 4.5) * 0.3;
            ctx.fillStyle = `rgba(${fr},${fg},${fb},${spa})`;
            ctx.beginPath();
            ctx.arc(eRX * 0.38, -eRY * 0.32, eRX * 0.18, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        ctx.restore();
      }

      // ── Anger brows ──
      if (ex.angerBrow > 0.05) {
        const browBaseY = eyeBaseY - eRY * 1.8;
        const browW     = eRX * 1.1;
        const slope     = browW * ex.angerBrow * 0.5;
        ctx.strokeStyle = `rgba(200,35,20,${ex.angerBrow * 0.9})`;
        ctx.lineWidth   = hR * 0.065;
        ctx.lineCap     = "round";
        ctx.beginPath();
        for (const side of [-1, 1] as const) {
          const bx = side * eyeSpread;
          ctx.moveTo(bx - side * browW, browBaseY + slope);
          ctx.lineTo(bx + side * browW, browBaseY - slope);
        }
        ctx.stroke();
      }

      // ── Mouth (on snout) ──
      {
        const mouthY   = snoutY + hR * 0.08;
        const smileR   = hR * 0.20;
        const smileMag = Math.abs(ex.smile);
        ctx.strokeStyle = "rgba(25,25,55,0.72)";
        ctx.lineWidth   = hR * 0.052;
        ctx.lineCap     = "round";

        if (ex.openMouth > 0.15) {
          const mW = smileR * (isLaugh ? 0.92 : 0.70) * ex.openMouth;
          const mH = hR * 0.12 * (isLaugh ? 0.95 : 0.70) * ex.openMouth;
          ctx.fillStyle = "rgba(18,18,52,0.42)";
          ctx.beginPath();
          ctx.ellipse(0, mouthY, mW, mH, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Fire breath on excited/laughing
          if ((m === "excited" || isLaugh) && ex.openMouth > 0.5) {
            const fA   = (0.38 + Math.sin(t * 8.5) * 0.22) * ex.openMouth;
            const fLen = hR * (isLaugh ? 0.9 : 0.6);
            const fGrad = ctx.createLinearGradient(0, mouthY, 0, mouthY + fLen);
            fGrad.addColorStop(0,   `rgba(${fr},${fg},${fb},${fA})`);
            fGrad.addColorStop(0.5, `rgba(${Math.min(255, fr + 60)},${Math.min(255, fg + 20)},${Math.max(0, fb - 20)},${fA * 0.6})`);
            fGrad.addColorStop(1,   `rgba(${fr},${fg},${fb},0)`);
            ctx.fillStyle = fGrad;
            ctx.beginPath();
            ctx.ellipse(0, mouthY + fLen * 0.5, mW * 0.7, fLen * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          if (isLaugh && ex.openMouth > 0.6) {
            ctx.fillStyle = `rgba(255,255,255,${ex.openMouth * 0.82})`;
            ctx.beginPath();
            ctx.ellipse(0, mouthY - mH * 0.2, mW * 0.82, mH * 0.38, 0, Math.PI, Math.PI * 2);
            ctx.fill();
          }
        } else if (smileMag > 0.05) {
          ctx.beginPath();
          if (ex.smile > 0) {
            ctx.arc(0, mouthY - smileR * smileMag, smileR * smileMag, 0.18, Math.PI - 0.18, false);
          } else {
            ctx.arc(0, mouthY + smileR * smileMag, smileR * smileMag, Math.PI + 0.2, 2 * Math.PI - 0.2, false);
          }
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(-hR * 0.12, mouthY);
          ctx.lineTo( hR * 0.12, mouthY);
          ctx.stroke();
        }
      }

      // ── Crown (elder / legendary) ──
      if (st === "elder" || st === "legendary") {
        const crY   = hY - hR * 0.90;
        const crW   = hR * 0.50;
        const crH   = hR * 0.28;
        const crCol = st === "legendary" ? `rgba(${fr},${fg},${fb},0.95)` : "rgba(255,208,55,0.92)";
        ctx.fillStyle   = crCol;
        ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.3)`;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(-crW, crY + crH);
        ctx.lineTo(-crW, crY);
        ctx.lineTo(-crW * 0.38, crY + crH * 0.5);
        ctx.lineTo(0, crY - crH * 0.08);
        ctx.lineTo(crW * 0.38, crY + crH * 0.5);
        ctx.lineTo(crW, crY);
        ctx.lineTo(crW, crY + crH);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // ── Legendary aura ring ──
      if (st === "legendary") {
        const ringA = 0.3 + Math.sin(t * 1.8) * 0.1;
        ctx.strokeStyle = `rgba(${fr},${fg},${fb},${ringA})`;
        ctx.lineWidth   = 2.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(0, hY * 0.3, hR * 1.45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore(); // end body transform

      // ── ZZZ (sleepy) ──
      if (ex.eyeOpenness < 0.55) {
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        for (let i = 0; i < 3; i++) {
          const phase  = ((t * 0.55 + i * 0.42) % 1.2);
          const zA     = phase < 0.2 ? phase / 0.2 : phase > 0.9 ? Math.max(0, (1.2 - phase) / 0.3) : 1;
          const zAlpha = zA * 0.65 * (1 - ex.eyeOpenness / 0.55);
          if (zAlpha < 0.04) continue;
          ctx.font      = `bold ${Math.round(sz * (0.14 + i * 0.04))}px monospace`;
          ctx.fillStyle = `rgba(170,190,225,${zAlpha})`;
          ctx.fillText("z", cx + sz * 0.65 + i * sz * 0.09, cy - sz * 0.55 - phase * 38 - i * 14);
        }
      }

      // ── Floating state indicators ──────────────────────────────────────────
      const indCfg = MOOD_INDICATORS[m];
      if (indCfg) {
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        const count = indCfg.symbols.length;
        const [ir, ig, ib] = indCfg.color;

        for (let i = 0; i < count; i++) {
          const baseAngle = t * indCfg.speed + (i * Math.PI * 2) / count;
          const pulseSz   = sz * indCfg.fontSize * (0.85 + 0.18 * Math.sin(t * 2.1 + i * 1.4));
          const alpha     = 0.45 + 0.3 * Math.sin(t * 1.8 + i * 2.1);

          let ix: number, iy: number;

          if (indCfg.mode === "orbit") {
            ix = cx + Math.cos(baseAngle) * sz * indCfg.orbitR;
            iy = cy + Math.sin(baseAngle) * sz * indCfg.orbitRY - sz * 0.1;
          } else if (indCfg.mode === "pulse-fixed") {
            // Hover in place, just pulse in size/alpha
            const spreadX = sz * indCfg.orbitR * (i === 0 ? -1 : 1);
            ix = cx + spreadX;
            iy = cy - sz * 0.65;
          } else {
            // drift-up: each symbol slowly floats upward at a staggered phase
            const phase = ((t * indCfg.speed * 0.25 + i / count) % 1);
            ix = cx + (i - (count - 1) / 2) * sz * 0.38 + Math.sin(t * 1.2 + i) * sz * 0.1;
            iy = cy - sz * 0.2 - phase * sz * 1.2;
          }

          ctx.font      = `bold ${Math.round(pulseSz)}px ui-monospace,'SF Mono',monospace`;
          ctx.fillStyle = `rgba(${ir},${ig},${ib},${alpha})`;
          ctx.fillText(indCfg.symbols[i], ix, iy);
        }
      }

      // ── Ripples ──
      const now2 = performance.now();
      ripples.current = ripples.current.filter(r => now2 - r.ts < 700);
      for (const r of ripples.current) {
        const age = (now2 - r.ts) / 700;
        ctx.strokeStyle = `rgba(${fr},${fg},${fb},${(1 - age) * 0.55})`;
        ctx.lineWidth   = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(r.x, r.y, age * sz * 1.4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── Floating hearts (tap burst) ──
      hearts.current = hearts.current.filter(h => now2 - h.ts < 1000);
      for (const h of hearts.current) {
        const age  = Math.max(0, (now2 - h.ts) / 1000);
        const hAlp = (1 - age) * 0.88;
        ctx.globalAlpha  = hAlp;
        ctx.font         = `${13 + age * 5}px serif`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle    = `rgb(${fr},${fg},${fb})`;
        ctx.fillText("♥", h.x + h.vx * age * 45, h.y + h.vy * age * 55);
        ctx.globalAlpha = 1;
      }

      // ── Floating HA/ha (laugh burst) ──
      floatTexts.current = floatTexts.current.filter(f => now2 - f.ts < 1100);
      for (const f of floatTexts.current) {
        const age  = Math.max(0, (now2 - f.ts) / 1100);
        const fAlp = age < 0.15 ? age / 0.15 : (1 - age) * 0.95;
        ctx.globalAlpha  = fAlp;
        ctx.font         = `bold ${Math.round(sz * (0.18 + age * 0.08))}px ui-monospace,monospace`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle    = "rgba(255,230,60,1)";
        ctx.fillText(f.text, f.x + f.vx * age * 30, f.y - age * sz * 0.9);
        ctx.globalAlpha = 1;
      }

      // ── Auto-spawn HA bubbles while laughing ──
      if (m === "laughing" && now2 - lastHaBurst.current > 280) {
        lastHaBurst.current = now2;
        const words = ["HA", "HA", "ha", "haha", "HA"];
        const word  = words[Math.floor(Math.random() * words.length)];
        floatTexts.current.push({
          id: txtId++,
          x:  cx + (Math.random() - 0.5) * sz * 1.1,
          y:  cy - sz * 0.1,
          text: word,
          vx: (Math.random() - 0.5) * 2,
          ts: now2,
        });
      }

      raf.current = requestAnimationFrame(draw);
    };

    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  // ── ResizeObserver ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr  = window.devicePixelRatio || 1;
      cssWRef.current   = rect.width;
      cssHRef.current   = rect.height;
      canvas.width      = rect.width  * dpr;
      canvas.height     = rect.height * dpr;
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Pet / tap ───────────────────────────────────────────────────────────────
  const triggerLaugh = useCallback(() => {
    haptic.impact("heavy");
    setMood("laughing");
    clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(() => setMood("happy"), 3200);
  }, []);

  const pet = useCallback((x: number, y: number) => {
    // Triple-tap detection → laugh
    const now = performance.now();
    tapTimes.current = [...tapTimes.current.filter(ts => now - ts < 1200), now];
    if (tapTimes.current.length >= 3) {
      tapTimes.current = [];
      triggerLaugh();
      return;
    }

    haptic.impact("medium");
    setMood("petted");
    setInteractions(n => n + 1);
    clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(() => setMood("neutral"), 2100);

    ripples.current.push({ id: ripId++, x, y, ts: performance.now() });
    for (let i = 0; i < 6; i++) {
      hearts.current.push({
        id: hrtId++, x, y,
        vx: (Math.random() - 0.5) * 2.6,
        vy: -(Math.random() * 1.6 + 0.6),
        ts: performance.now() + i * 55,
      });
    }
  }, [triggerLaugh]);

  const handlePointerDown = useCallback(() => {
    holdFired.current = false;
    holdTimer.current = setTimeout(() => {
      holdFired.current = true;
      haptic.impact("heavy");
      setShowColors(true);
      clearTimeout(colorHide.current);
      colorHide.current = setTimeout(() => setShowColors(false), 5_000);
    }, 480);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    clearTimeout(holdTimer.current);
    if (!holdFired.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      pet(e.clientX - rect.left, e.clientY - rect.top);
    }
  }, [pet]);

  const handlePointerLeave = useCallback(() => {
    clearTimeout(holdTimer.current);
    holdFired.current = false;
  }, []);

  const pickColor = useCallback((hex: string) => {
    haptic.selection();
    setFireColor(hex);
    clearTimeout(colorHide.current);
    colorHide.current = setTimeout(() => setShowColors(false), 5_000);
  }, []);

  // ── Evolution bar ───────────────────────────────────────────────────────────
  const stageProgress = (() => {
    const thresholds = [0, 500, 2000, 5000, 5000];
    const idx  = (["hatchling","juvenile","adult","elder","legendary"] as EvolutionStage[]).indexOf(stage);
    const from = thresholds[idx] ?? 0;
    const to   = thresholds[idx + 1] ?? 5000;
    if (to === from) return 100;
    return Math.min(100, ((interactions - from) / (to - from)) * 100);
  })();

  return (
    <div className="flex flex-col items-center w-full h-full select-none">

      {/* Canvas */}
      <div className="flex-1 w-full min-h-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-pointer"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerLeave}
          style={{ touchAction: "none" }}
        />
      </div>

      {/* Aura color picker (hold-revealed) */}
      <div
        className={`flex flex-col items-center gap-2 transition-all duration-300 overflow-hidden shrink-0 ${
          showColors ? "opacity-100 max-h-24 pb-1" : "opacity-0 max-h-0"
        }`}
      >
        <p className="text-[10px] text-white/30 font-mono tracking-widest uppercase">aura color</p>
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
              aria-label={`${label} aura`}
            />
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 text-[11px] font-mono text-white/35 py-1 shrink-0">
        <span>{interactions} pets</span>
        <span>·</span>
        <span>{STAGE_NAMES[stage]}</span>
        <span>·</span>
        <span>{consecutiveDays}d streak</span>
      </div>

      {/* Evolution bar */}
      <div className="w-44 pb-3 shrink-0">
        <div className="flex justify-between text-[10px] text-white/22 mb-1 font-mono">
          <span>evolution</span>
          <span>{Math.round(stageProgress)}%</span>
        </div>
        <div className="h-[3px] bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width:      `${stageProgress}%`,
              background: `linear-gradient(90deg, rgba(140,170,255,0.7), ${fireColor})`,
            }}
          />
        </div>
      </div>

    </div>
  );
}
