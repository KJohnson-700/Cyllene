/**
 * GhostFace — animated ghost character with per-state expressions.
 *
 * States
 *   idle       → gentle float, rosy cheeks, soft smile
 *   reasoning  → squinting asymmetric eyes, leaning, thought particles
 *   responding → talking mouth, energetic bounce, bigger wriggle
 *   alert      → huge eyes, arms raised, erratic dart, fear face
 *
 * No shadowBlur used anywhere — safe for Telegram WKWebView.
 * All ctx.save/restore guards removed; state reset in catch block.
 */
import { useEffect, useRef } from "react";
import type { AgentState } from "@/hooks/useRunStream";

interface Props {
  agentState: AgentState;
  activeTool?: string | null;
  tokenCount?: number;
  amplitude?: number;
  weather?: { condition: string; temp: number } | null;
  orientation?: { beta: number; gamma: number } | null;
  onDoubleTap?: () => void;
}

// State → [r, g, b] — ghost glow color
const STATE_RGB: Record<AgentState, [number, number, number]> = {
  idle:       [120, 255, 180],
  reasoning:  [80,  220, 255],
  responding: [160, 200, 255],
  alert:      [255,  90,  90],
};

// ── Expression ────────────────────────────────────────────────────────────────
interface Expr {
  eyeOpenL:    number;  // 0=closed … 1=normal … 1.8=wide
  eyeOpenR:    number;
  eyeOffsetY:  number;  // -1..1, shifts both eyes up/down relative
  pupilOffX:   number;  // -1..1 pupil horizontal offset
  pupilOffY:   number;
  xEyes:       number;  // 0=normal eyes, 1=X eyes (KO/error)
  mouthOpen:   number;  // 0=shut, 1=full open oval
  smile:       number;  // -1=frown … 1=big smile (when mouthOpen≈0)
  tilt:        number;  // body lean (radians)
  wriggle:     number;  // tail wave amplitude 0..1
  armRaise:    number;  // 0=no arms, 1=arms fully raised
  blush:       number;  // 0..1
  squishY:     number;  // body scale Y — squish on bounce
  floatAmp:    number;  // float amplitude scale
  floatSpeed:  number;  // float frequency scale
  driftAmp:    number;  // horizontal drift amplitude
  spinSpeed:   number;  // full rotations per second (0 = no spin)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function lerpE(a: Expr, b: Expr, t: number): Expr {
  return {
    eyeOpenL:   lerp(a.eyeOpenL,   b.eyeOpenL,   t),
    eyeOpenR:   lerp(a.eyeOpenR,   b.eyeOpenR,   t),
    eyeOffsetY: lerp(a.eyeOffsetY, b.eyeOffsetY, t),
    pupilOffX:  lerp(a.pupilOffX,  b.pupilOffX,  t),
    pupilOffY:  lerp(a.pupilOffY,  b.pupilOffY,  t),
    xEyes:      lerp(a.xEyes,      b.xEyes,      t),
    mouthOpen:  lerp(a.mouthOpen,  b.mouthOpen,  t),
    smile:      lerp(a.smile,      b.smile,      t),
    tilt:       lerp(a.tilt,       b.tilt,       t),
    wriggle:    lerp(a.wriggle,    b.wriggle,    t),
    armRaise:   lerp(a.armRaise,   b.armRaise,   t),
    blush:      lerp(a.blush,      b.blush,      t),
    squishY:    lerp(a.squishY,    b.squishY,    t),
    floatAmp:   lerp(a.floatAmp,   b.floatAmp,   t),
    floatSpeed: lerp(a.floatSpeed, b.floatSpeed, t),
    driftAmp:   lerp(a.driftAmp,   b.driftAmp,   t),
    spinSpeed:  lerp(a.spinSpeed,  b.spinSpeed,  t),
  };
}

const E_IDLE: Expr = {
  eyeOpenL: 1, eyeOpenR: 1, eyeOffsetY: 0,
  pupilOffX: 0, pupilOffY: 0, xEyes: 0,
  mouthOpen: 0, smile: 0.75,
  tilt: 0, wriggle: 0.22,
  armRaise: 0, blush: 0.65,
  squishY: 1, floatAmp: 1, floatSpeed: 1, driftAmp: 0.5, spinSpeed: 0,
};
const E_REASONING: Expr = {
  eyeOpenL: 0.55, eyeOpenR: 1.25, eyeOffsetY: -0.25,
  pupilOffX: 0.4, pupilOffY: -0.3, xEyes: 0,
  mouthOpen: 0, smile: -0.15,
  tilt: 0.18, wriggle: 0.14,
  armRaise: 0, blush: 0,
  squishY: 1.05, floatAmp: 0.6, floatSpeed: 0.7, driftAmp: 0.3, spinSpeed: 0,
};
const E_RESPONDING_A: Expr = {
  eyeOpenL: 1.1, eyeOpenR: 1.1, eyeOffsetY: 0.05,
  pupilOffX: 0, pupilOffY: 0, xEyes: 0,
  mouthOpen: 0.38, smile: 0,
  tilt: 0, wriggle: 0.42,
  armRaise: 0, blush: 0.2,
  squishY: 1, floatAmp: 1.3, floatSpeed: 1.8, driftAmp: 0.4, spinSpeed: 0,
};
const E_RESPONDING_B: Expr = {
  eyeOpenL: 0.85, eyeOpenR: 0.85, eyeOffsetY: 0.05,
  pupilOffX: 0, pupilOffY: 0, xEyes: 0,
  mouthOpen: 0.78, smile: 0,
  tilt: 0, wriggle: 0.52,
  armRaise: 0, blush: 0.15,
  squishY: 1.12, floatAmp: 1.3, floatSpeed: 1.8, driftAmp: 0.4, spinSpeed: 0,
};
const E_ALERT: Expr = {
  eyeOpenL: 0, eyeOpenR: 0, eyeOffsetY: 0,
  pupilOffX: 0, pupilOffY: 0, xEyes: 1,
  mouthOpen: 0.55, smile: 0,
  tilt: 0, wriggle: 0.72,
  armRaise: 0, blush: 0,
  squishY: 0.92, floatAmp: 1.8, floatSpeed: 2.2, driftAmp: 1.6, spinSpeed: 1.4,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── Particle system (reasoning: thought bubbles) ───────────────────────────────
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number; alpha: number; life: number; maxLife: number;
}
function spawnParticle(cx: number, cy: number, R: number): Particle {
  const angle = Math.random() * Math.PI * 2;
  const dist  = R * (0.8 + Math.random() * 0.6);
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 0.5,
    vy: -0.4 - Math.random() * 0.5,
    r: 2 + Math.random() * 5,
    alpha: 0,
    life: 0,
    maxLife: 50 + Math.random() * 60,
  };
}

// ── roundRect polyfill ─────────────────────────────────────────────────────────
function rRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number | [number, number, number, number],
) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y,      x + w, y + tr,     tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h,  x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x,       y + h, x, y + h - bl,    bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x,       y,     x + tl, y,         tl);
  ctx.closePath();
}

// ── Ghost draw (all pixel coords) ─────────────────────────────────────────────
function drawGhost(
  ctx:        CanvasRenderingContext2D,
  cx:         number,
  cy:         number,
  R:          number,  // head radius
  t:          number,  // time counter (frames)
  e:          Expr,
  sr:         number, sg: number, sb: number,
  spinAngle:  number,  // accumulated spin in radians
) {
  // Body geometry
  const sw    = t * 0.018;
  const lean  = e.tilt * Math.sin(sw * 1.8) * 0.6 + e.tilt;  // subtle sway
  const bodyH = R * 0.85 * e.squishY;                          // tail height
  const midY  = cy + bodyH;                                    // scallop baseline

  // ── Ghost body path helper ──
  const bodyPath = () => {
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, 0, false);
    ctx.lineTo(cx + R, midY);
    for (let i = 0; i < 3; i++) {
      const x2 = cx + R - (i + 0.5) * (R * 2 / 3);
      const x3 = cx + R - (i + 1) * (R * 2 / 3);
      const wobble = Math.sin(t * 0.09 + i * 2.09) * R * e.wriggle;
      ctx.quadraticCurveTo(x2, midY + R * 0.42 + wobble, x3, midY);
    }
    ctx.closePath();
  };

  ctx.save();
  // Lean + spin
  ctx.translate(cx, cy);
  ctx.rotate(lean + spinAngle);
  ctx.translate(-cx, -cy);

  // ── Glow layers — 5 concentric expanding strokes ──
  for (let g = 5; g >= 1; g--) {
    bodyPath();
    ctx.strokeStyle = `rgba(${sr},${sg},${sb},${0.035 * g})`;
    ctx.lineWidth   = g * 6;
    ctx.stroke();
  }

  // ── Body fill — radial gradient for depth ──
  bodyPath();
  try {
    const bodyGrad = ctx.createRadialGradient(
      cx - R * 0.28, cy - R * 0.30, R * 0.08,
      cx,            cy,            R * 1.55,
    );
    bodyGrad.addColorStop(0.0, "rgba(248,255,252,0.97)");
    bodyGrad.addColorStop(0.5, "rgba(210,242,232,0.94)");
    bodyGrad.addColorStop(1.0, `rgba(${Math.floor(sr * 0.55 + 140)},${Math.floor(sg * 0.45 + 170)},${Math.floor(sb * 0.45 + 170)},0.86)`);
    ctx.fillStyle = bodyGrad;
  } catch {
    ctx.fillStyle = "rgba(230,248,240,0.94)";
  }
  ctx.fill();

  // ── Outline ──
  bodyPath();
  ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.65)`;
  ctx.lineWidth   = 1.8;
  ctx.stroke();

  // ── Inner highlight — top-left sheen ──
  ctx.beginPath();
  ctx.arc(cx - R * 0.24, cy - R * 0.32, R * 0.48, Math.PI * 1.1, Math.PI * 1.85, false);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth   = R * 0.09;
  ctx.stroke();

  // ── Arms — only in alert state ──
  if (e.armRaise > 0.08) {
    const armWobble = Math.sin(t * 0.18) * 0.12;
    for (const side of [-1, 1]) {
      const ax = cx + side * R * 0.92;
      const ay = cy + R * 0.1;
      const tipX = cx + side * (R * 1.55 + e.armRaise * R * 0.3);
      const tipY = cy - R * (0.3 + e.armRaise * 0.55 + armWobble * side);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(
        cx + side * R * 1.38, ay - R * 0.35,
        tipX, tipY,
      );
      ctx.strokeStyle = "rgba(240,252,248,0.93)";
      ctx.lineWidth   = R * 0.21;
      ctx.lineCap     = "round";
      ctx.stroke();

      // Tiny hand/stub at tip
      ctx.beginPath();
      ctx.arc(tipX, tipY, R * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(240,252,248,0.93)";
      ctx.fill();
    }
  }

  // ── Eyes ──
  const eyeBaseY  = cy - R * 0.10 + e.eyeOffsetY * R * 0.22;
  const eyeSpread = R * 0.36;
  const eyeRX     = R * 0.175;
  const eyeRYbase = R * 0.22;

  for (let side = -1; side <= 1; side += 2) {
    const ex      = cx + side * eyeSpread;
    const eyeOpen = side < 0 ? e.eyeOpenL : e.eyeOpenR;
    const eyeRY   = eyeRYbase * clamp(eyeOpen, 0.04, 1.8);

    if (e.xEyes > 0.05) {
      // ── X eyes (KO / error state) ──
      const xS = eyeRX * 1.1 * Math.min(e.xEyes + 0.4, 1);
      ctx.strokeStyle = `rgba(8,14,22,${0.7 + e.xEyes * 0.25})`;
      ctx.lineWidth   = R * 0.08;
      ctx.lineCap     = "round";
      ctx.beginPath();
      ctx.moveTo(ex - xS, eyeBaseY - xS); ctx.lineTo(ex + xS, eyeBaseY + xS);
      ctx.moveTo(ex + xS, eyeBaseY - xS); ctx.lineTo(ex - xS, eyeBaseY + xS);
      ctx.stroke();
    } else {
      // ── Normal eyes ──
      ctx.fillStyle = "rgba(8, 14, 22, 0.93)";
      ctx.beginPath();
      ctx.ellipse(ex, eyeBaseY, eyeRX, eyeRY, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupil / iris tint
      if (eyeOpen > 0.2) {
        const pox = e.pupilOffX * eyeRX * 0.5;
        const poy = e.pupilOffY * eyeRY * 0.5;
        ctx.fillStyle = `rgba(${Math.floor(sr * 0.4)},${Math.floor(sg * 0.4)},${Math.floor(sb * 0.4)},0.6)`;
        ctx.beginPath();
        ctx.ellipse(ex + pox, eyeBaseY + poy, eyeRX * 0.56, eyeRY * 0.56, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Glint
      if (eyeOpen > 0.25) {
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.beginPath();
        ctx.ellipse(
          ex - eyeRX * 0.28, eyeBaseY - eyeRY * 0.28,
          eyeRX * 0.26, eyeRY * 0.26,
          -0.4, 0, Math.PI * 2,
        );
        ctx.fill();
      }

      // Happy-eyes — arc below (UwU) when blinking in idle
      if (eyeOpen < 0.12 && e.smile > 0.3) {
        ctx.strokeStyle = "rgba(8,14,22,0.85)";
        ctx.lineWidth   = eyeRX * 0.45;
        ctx.lineCap     = "round";
        ctx.beginPath();
        ctx.arc(ex, eyeBaseY, eyeRX * 0.7, 0, Math.PI, false);
        ctx.stroke();
      }
    }
  }

  // ── Blush circles ──
  if (e.blush > 0.02) {
    for (const side of [-1, 1]) {
      const bx = cx + side * eyeSpread * 1.15;
      const by = eyeBaseY + eyeRYbase * 1.15;
      ctx.fillStyle = `rgba(255,140,160,${e.blush * 0.26})`;
      ctx.beginPath();
      ctx.ellipse(bx, by, eyeRX * 1.55, eyeRX * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Mouth ──
  const mouthCY = cy + R * 0.44;   // well clear of the eyes
  const mouthW  = R * 0.30;

  if (e.mouthOpen > 0.06) {
    const mH = R * 0.22 * e.mouthOpen;
    ctx.fillStyle = "rgba(8,14,22,0.88)";
    ctx.beginPath();
    ctx.ellipse(cx, mouthCY, mouthW * (0.55 + e.mouthOpen * 0.72), Math.max(3, mH), 0, 0, Math.PI * 2);
    ctx.fill();

    // Teeth (upper) when mouth wide
    if (e.mouthOpen > 0.35) {
      const tW = mouthW * (0.4 + e.mouthOpen * 0.5);
      const tH = mH * 0.32;
      ctx.fillStyle = "rgba(240,248,244,0.90)";
      ctx.beginPath();
      ctx.ellipse(cx, mouthCY - mH * 0.26, tW, tH, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Smile / frown — quadratic bezier, no arc math needed
    // Positive smile = control point below endpoints = upward curve on face
    const depth = mouthW * 0.62 * e.smile;
    ctx.strokeStyle = "rgba(8,14,22,0.80)";
    ctx.lineWidth   = R * 0.072;
    ctx.lineCap     = "round";
    ctx.beginPath();
    ctx.moveTo(cx - mouthW, mouthCY);
    ctx.quadraticCurveTo(cx, mouthCY + depth, cx + mouthW, mouthCY);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Sparkle helper (reasoning particles) ──────────────────────────────────────
function drawSparkle(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  alpha: number, sr: number, sg: number, sb: number,
) {
  ctx.fillStyle = `rgba(${sr},${sg},${sb},${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ── Component ─────────────────────────────────────────────────────────────────
export function GhostFace({
  agentState, activeTool, tokenCount = 0, amplitude = 0,
  weather, orientation, onDoubleTap,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef  = useRef({ agentState, activeTool, tokenCount, amplitude, weather, orientation });
  propsRef.current = { agentState, activeTool, tokenCount, amplitude, weather, orientation };
  const prevState = useRef<AgentState>(agentState);
  const lastTap   = useRef(0);

  // Haptics on state transition
  useEffect(() => {
    if (agentState === prevState.current) return;
    prevState.current = agentState;
    try {
      const hf = (window as any).Telegram?.WebApp?.HapticFeedback;
      if (!hf) return;
      if (agentState === "alert")           hf.notificationOccurred?.("error");
      else if (agentState === "reasoning")  hf.impactOccurred?.("soft");
      else if (agentState === "responding") hf.impactOccurred?.("light");
    } catch { /* ignore */ }
  }, [agentState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // ── Resize ──────────────────────────────────────────────────────────────
    const resize = () => {
      try {
        const rect = canvas.getBoundingClientRect();
        const w    = Math.floor(rect.width  * dpr);
        const h    = Math.floor(rect.height * dpr);
        if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
          canvas.width  = w;
          canvas.height = h;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      } catch { /* ignore */ }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const twa  = (window as any).Telegram?.WebApp;
    const onVP = () => resize();
    twa?.onEvent?.("viewportChanged", onVP);

    const onClick = () => {
      const now = Date.now();
      if (now - lastTap.current < 320) onDoubleTap?.();
      lastTap.current = now;
    };
    canvas.addEventListener("click", onClick);

    // ── Animation state ──────────────────────────────────────────────────────
    let frame        = 0;
    let raf          = 0;
    let expr: Expr   = { ...E_IDLE };
    let talkPhase    = 0;
    let blinkTimer   = 0, blinkNext = 220, blinkAmt = 0;

    // Float physics
    let floatPhaseY  = Math.random() * Math.PI * 2;
    let floatPhaseX  = Math.random() * Math.PI * 2;
    let alertOffX    = 0, alertOffY = 0;
    let alertVX      = (Math.random() - 0.5) * 2;
    let alertVY      = (Math.random() - 0.5) * 2;
    let spinAngle    = 0;

    // Particles (reasoning mode)
    const particles: Particle[] = [];

    // ── Draw loop ────────────────────────────────────────────────────────────
    const draw = () => {
      raf = requestAnimationFrame(draw);
      try {
        frame++;
        const { agentState: state, amplitude: level, orientation: ori } = propsRef.current;
        const rect  = canvas.getBoundingClientRect();
        const W     = rect.width, H = rect.height;
        if (W <= 0 || H <= 0) return;

        // Layout
        const PAD  = 6;
        const HDR  = 30;
        const FOOT = 22;
        const gL   = PAD + 2;
        const gT   = PAD + HDR + 1;
        const gW   = W - gL - PAD - 2;
        const gH   = H - gT - FOOT - PAD;

        const [sr, sg, sb] = STATE_RGB[state];

        // Ghost size — fills about 55% of available height
        const R  = Math.min(gW * 0.30, gH * 0.28);
        const cx = gL + gW * 0.5;
        const cy = gT + gH * 0.42;  // slightly above centre for tail room

        // ── Expression target ──────────────────────────────────────────────
        let target: Expr;

        if (state === "reasoning") {
          target = E_REASONING;
        } else if (state === "alert") {
          target = E_ALERT;
        } else if (state === "responding") {
          const spd = level > 0.06 ? level * 14 : 0.06;
          talkPhase = (talkPhase + spd) % (Math.PI * 2);
          const talkT = (Math.sin(talkPhase) + 1) / 2; // 0..1
          target = lerpE(E_RESPONDING_A, E_RESPONDING_B, talkT);
          if (level > 0.04) target = { ...target, mouthOpen: clamp(level * 2.0, 0.15, 1.0) };
        } else {
          target = { ...E_IDLE };
        }

        // Blink
        blinkTimer++;
        if (blinkTimer > blinkNext) {
          blinkAmt  = 1;
          blinkTimer = 0;
          blinkNext  = 160 + Math.random() * 280;
        }
        if (blinkAmt > 0) {
          const blinkFrac = Math.max(0, 1 - (blinkTimer / 8));
          target = { ...target, eyeOpenL: target.eyeOpenL * (1 - blinkFrac * 0.96), eyeOpenR: target.eyeOpenR * (1 - blinkFrac * 0.96) };
          if (blinkFrac < 0.05) blinkAmt = 0;
        }

        expr = lerpE(expr, target, 0.10);

        // ── Float position ─────────────────────────────────────────────────
        floatPhaseY += 0.022 * expr.floatSpeed;
        floatPhaseX += 0.015 * expr.floatSpeed;
        const floatY = Math.sin(floatPhaseY) * R * 0.20 * expr.floatAmp;
        const floatX = Math.sin(floatPhaseX) * R * 0.12 * expr.driftAmp;

        // Orientation tilt shifts
        const orientX = clamp((ori?.gamma ?? 0) / 40, -1, 1) * R * 0.10;
        const orientY = clamp(((ori?.beta ?? 45) - 45) / 40, -1, 1) * R * 0.08;

        // Alert: erratic dart physics
        if (state === "alert") {
          alertVX += (Math.random() - 0.5) * 1.2;
          alertVY += (Math.random() - 0.5) * 1.2;
          alertVX  = clamp(alertVX, -3, 3);
          alertVY  = clamp(alertVY, -3, 3);
          alertOffX = clamp(alertOffX + alertVX * 0.25, -R * 0.35, R * 0.35);
          alertOffY = clamp(alertOffY + alertVY * 0.25, -R * 0.25, R * 0.25);
        } else {
          alertOffX *= 0.92;
          alertOffY *= 0.92;
        }

        // Spin — accumulate angle based on expr.spinSpeed (rotations/sec at 60fps)
        spinAngle += (expr.spinSpeed * Math.PI * 2) / 60;

        const ghostCX = cx + floatX + orientX + alertOffX;
        const ghostCY = cy + floatY + orientY + alertOffY;

        // ── Particles ──────────────────────────────────────────────────────
        if (state === "reasoning" && frame % 18 === 0) {
          particles.push(spawnParticle(ghostCX, ghostCY, R));
        }
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life++;
          p.x += p.vx;
          p.y += p.vy;
          p.vy -= 0.008;
          const frac = p.life / p.maxLife;
          p.alpha = frac < 0.2 ? frac / 0.2 : 1 - (frac - 0.2) / 0.8;
          if (p.life >= p.maxLife) { particles.splice(i, 1); }
        }
        // Clear dead particles
        if (state !== "reasoning" && particles.length > 0) {
          for (let i = particles.length - 1; i >= 0; i--) {
            if (particles[i].alpha < 0.05) particles.splice(i, 1);
          }
        }

        // ── CLEAR ─────────────────────────────────────────────────────────
        ctx.fillStyle = "#010a05";
        ctx.fillRect(0, 0, W, H);

        // Subtle bg vignette
        try {
          const vg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
          vg.addColorStop(0, `rgba(${Math.floor(sr * 0.04)},${Math.floor(sg * 0.06)},${Math.floor(sb * 0.04)},0.35)`);
          vg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = vg;
          ctx.fillRect(0, 0, W, H);
        } catch { /* skip */ }

        // Alert bg pulse
        if (state === "alert") {
          const k = 0.04 + 0.03 * Math.sin(frame * 0.18);
          ctx.fillStyle = `rgba(60,2,2,${k})`;
          ctx.fillRect(0, 0, W, H);
        }

        // ── Draw particles ─────────────────────────────────────────────────
        for (const p of particles) {
          drawSparkle(ctx, p.x, p.y, p.r * p.alpha, p.alpha * 0.9, sr, sg, sb);
        }

        // ── Draw ghost ─────────────────────────────────────────────────────
        drawGhost(ctx, ghostCX, ghostCY, R, frame, expr, sr, sg, sb, spinAngle);

        // ── Scanlines ──────────────────────────────────────────────────────
        ctx.globalAlpha = 0.018;
        ctx.fillStyle   = "#000";
        for (let y = gT; y < gT + gH; y += 3) ctx.fillRect(gL, y, gW, 1.1);
        ctx.globalAlpha = 1;

        // ── Weather FX ─────────────────────────────────────────────────────
        const wx = propsRef.current.weather;
        if (wx?.condition === "rain" || wx?.condition === "thunder") {
          ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.04)`;
          ctx.lineWidth   = 1;
          for (let i = 0; i < 5; i++) {
            const rx = gL + ((frame * 2 + i * 73) % gW);
            const ry = gT + ((frame * 4 + i * 47) % gH);
            ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 1, ry + 6); ctx.stroke();
          }
        }

        // ── Chrome ─────────────────────────────────────────────────────────
        const shellCss = `rgb(${sr},${sg},${sb})`;
        const CR = 10;

        // Outer glow border (no shadowBlur — double stroke trick)
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.18)`;
        ctx.lineWidth   = 6;
        rRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, CR + 1);
        ctx.stroke();
        ctx.strokeStyle = shellCss;
        ctx.lineWidth   = 1.5;
        rRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, CR);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.18)`;
        ctx.lineWidth   = 1;
        rRect(ctx, PAD + 3, PAD + 3, W - PAD * 2 - 6, H - PAD * 2 - 6, CR - 2);
        ctx.stroke();

        // Title bar bg
        ctx.fillStyle = "rgba(0,4,2,0.96)";
        rRect(ctx, PAD + 1, PAD + 1, W - PAD * 2 - 2, HDR, [CR - 1, CR - 1, 0, 0]);
        ctx.fill();

        // Title separator
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.14)`;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(PAD + 12, PAD + HDR + 0.5);
        ctx.lineTo(W - PAD - 12, PAD + HDR + 0.5);
        ctx.stroke();

        // Yellow smiley
        const icX = PAD + 16, icY = PAD + HDR / 2;
        ctx.fillStyle = "#f5d020";
        ctx.beginPath(); ctx.arc(icX, icY, 7.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.88)";
        ctx.beginPath();
        ctx.arc(icX - 2.5, icY - 1.8, 1.1, 0, Math.PI * 2);
        ctx.arc(icX + 2.5, icY - 1.8, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.88)";
        ctx.lineWidth   = 1.2;
        ctx.beginPath(); ctx.arc(icX, icY + 0.5, 3.8, 0.15, Math.PI - 0.15); ctx.stroke();

        // State pulse dot
        const pk = state !== "idle"
          ? 0.5 + 0.5 * Math.sin(frame * (state === "alert" ? 0.22 : 0.07))
          : 0.90;
        ctx.fillStyle = `rgba(${sr},${sg},${sb},${pk})`;
        ctx.beginPath(); ctx.arc(PAD + 28, icY, 2.8, 0, Math.PI * 2); ctx.fill();

        // HERMES
        ctx.font      = "bold 11px ui-monospace,'SF Mono','Courier New',monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = shellCss;
        ctx.fillText("HERMES", PAD + 38, icY + 4);

        // Active tool (centre)
        const tool = propsRef.current.activeTool;
        if (tool) {
          ctx.font      = "9px ui-monospace,'SF Mono','Courier New',monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = `rgba(${sr},${sg},${sb},0.55)`;
          ctx.fillText(tool.replace(/_/g, " ").toUpperCase().slice(0, 18), W / 2, icY + 4);
        }

        // Window controls
        ctx.font      = "10px ui-monospace,'SF Mono','Courier New',monospace";
        ctx.textAlign = "right";
        ctx.fillStyle = `rgba(${sr},${sg},${sb},0.55)`;
        ctx.fillText("... □ ×", W - PAD - 8, icY + 4);

        // Footer bg
        ctx.fillStyle = "rgba(0,4,2,0.96)";
        rRect(ctx, PAD + 1, H - PAD - FOOT, W - PAD * 2 - 2, FOOT, [0, 0, CR - 1, CR - 1]);
        ctx.fill();

        // Footer separator
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.12)`;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(PAD + 12, H - PAD - FOOT + 0.5);
        ctx.lineTo(W - PAD - 12, H - PAD - FOOT + 0.5);
        ctx.stroke();

        const footY = H - PAD - FOOT / 2 + 3.5;
        ctx.font = "9px ui-monospace,'SF Mono','Courier New',monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = `rgba(${sr},${sg},${sb},0.65)`;
        ctx.fillText("CMD>", PAD + 12, footY);

        ctx.textAlign = "center";
        ctx.fillStyle = shellCss;
        ctx.fillText(state.toUpperCase(), W / 2, footY);

        ctx.textAlign = "right";
        ctx.fillStyle = `rgba(${sr},${sg},${sb},0.55)`;
        const rightTxt = state === "reasoning" && tokenCount > 0 ? `${tokenCount} OPS`
          : wx ? `${wx.temp}°` : "—";
        ctx.fillText(rightTxt, W - PAD - 12, footY);

        // Alert overlay pulse
        if (state === "alert") {
          ctx.fillStyle = `rgba(255,0,0,${0.04 + 0.03 * Math.sin(frame * 0.15)})`;
          rRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, CR);
          ctx.fill();
        }

      } catch (err) {
        console.error("GhostFace draw error:", err);
        try {
          ctx.globalAlpha              = 1;
          ctx.globalCompositeOperation = "source-over";
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } catch { /* ignore */ }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("click", onClick);
      twa?.offEvent?.("viewportChanged", onVP);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full" style={{ minHeight: 420 }}>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: 420, display: "block" }}
      />
    </div>
  );
}
