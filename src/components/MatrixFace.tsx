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

// ── Config ────────────────────────────────────────────────────────────────────
const CHARS =
  "ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ" +
  "0123456789ABCDEF@#$%&*+=<>|";
const COLS = 72;
const ROWS = 90;

// State → [r, g, b] 0-255
const STATE_RGB: Record<AgentState, [number, number, number]> = {
  idle:       [0,   255, 100],
  reasoning:  [60,  230, 210],
  responding: [0,   200, 255],
  alert:      [255,  50,  50],
};

// ── Anatomical face ────────────────────────────────────────────────────────────
function faceZ(nx: number, ny: number): number {
  const skullW = 0.82 + 0.055 * Math.exp(-(ny - 0.04) * (ny - 0.04) / 0.30);
  const sphere = 1 - (nx / skullW) ** 2 - (ny / 1.05) ** 2;
  if (sphere <= 0) return 0;
  let z = Math.sqrt(sphere) * 0.92;

  // Temple hollows
  for (const tx of [-0.56, 0.56]) {
    const d = Math.hypot((nx - tx) * 1.8, (ny + 0.04) * 2.3);
    if (d < 0.42) z -= Math.pow((0.42 - d) / 0.42, 1.6) * 0.11;
  }
  // Forehead recession
  if (ny < -0.40) z *= 1 - ((-ny - 0.40) / 0.62) * 0.09;

  // Brow ridge
  const bcy = -0.25;
  if (ny > bcy - 0.14 && ny < bcy + 0.09 && Math.abs(nx) < 0.52) {
    const ty = (ny - bcy) / 0.14;
    const txb = nx / 0.48; z += Math.exp(-ty * ty * 2.3) * Math.exp(-txb * txb * 1.2) * 0.14;
  }
  // Eye sockets
  for (const ex of [-0.265, 0.265]) {
    const d = Math.hypot((nx - ex) * 2.45, (ny + 0.105) * 3.15);
    if (d < 0.40) z -= Math.pow((0.40 - d) / 0.40, 1.1) * 0.23;
  }
  // Nose bridge
  const nb = Math.hypot(nx * 5.9, (ny - 0.09) * 4.6);
  if (nb < 0.40) z += Math.pow((0.40 - nb) / 0.40, 0.75) * 0.25;
  // Nose tip
  const nt = Math.hypot(nx * 5.1, (ny - 0.34) * 6.1);
  if (nt < 0.27) z += ((0.27 - nt) / 0.27) * 0.18;
  // Nostril recession
  for (const nw of [-0.13, 0.13]) {
    const d = Math.hypot((nx - nw) * 5.1, (ny - 0.39) * 7.6);
    if (d < 0.19) z -= ((0.19 - d) / 0.19) * 0.06;
  }
  // Cheekbones
  for (const cx of [-0.44, 0.44]) {
    const d = Math.hypot((nx - cx) * 2.1, (ny - 0.08) * 2.7);
    if (d < 0.36) z += Math.pow((0.36 - d) / 0.36, 1.2) * 0.12;
  }
  // Philtrum
  const ph = Math.hypot(nx * 7.6, (ny - 0.43) * 10.2);
  if (ph < 0.21) z -= ((0.21 - ph) / 0.21) * 0.05;
  // Lips
  const lip = Math.hypot(nx * 2.7, (ny - 0.49) * 5.4);
  if (lip < 0.27) z += ((0.27 - lip) / 0.27) * 0.13;
  // Chin
  const ch = Math.hypot(nx * 4.1, (ny - 0.70) * 5.2);
  if (ch < 0.25) z += ((0.25 - ch) / 0.25) * 0.14;

  return Math.max(0, z);
}

// Primary light (upper-left) + fill (right)
const _l1 = [-0.44, -0.60, 0.67], _l1n = Math.hypot(..._l1);
const L1x = _l1[0]/_l1n, L1y = _l1[1]/_l1n, L1z = _l1[2]/_l1n;
const _l2 = [0.52, -0.12, 0.85], _l2n = Math.hypot(..._l2);
const L2x = _l2[0]/_l2n, L2y = _l2[1]/_l2n, L2z = _l2[2]/_l2n;

function faceLighting(nx: number, ny: number, lxShift = 0, lyShift = 0): number {
  const z = faceZ(nx, ny);
  if (z <= 0) return 0;
  const eps = 0.013;
  const dzdx = (faceZ(nx + eps, ny) - faceZ(nx - eps, ny)) / (2 * eps);
  const dzdy = (faceZ(nx, ny + eps) - faceZ(nx, ny - eps)) / (2 * eps);
  const nl = Math.hypot(dzdx, dzdy, 1);
  const snx = -dzdx / nl, sny = -dzdy / nl, snz = 1 / nl;

  const l1xS = L1x + lxShift, l1yS = L1y + lyShift;
  const l1len = Math.hypot(l1xS, l1yS, L1z);
  const diff1 = Math.max(0, (l1xS/l1len)*snx + (l1yS/l1len)*sny + L1z*snz/l1len);
  const diff2 = Math.max(0, L2x*snx + L2y*sny + L2z*snz) * 0.22;

  // Blinn-Phong specular
  const hx = l1xS/l1len, hy = l1yS/l1len, hz = (L1z/l1len + 1);
  const hl = Math.hypot(hx, hy, hz);
  const spec = Math.pow(Math.max(0, hx/hl*snx + hy/hl*sny + hz/hl*snz), 38) * 0.80;
  // Rim
  const rim = Math.pow(Math.max(0, 1 - snz), 3) * 0.12;

  return Math.min(1, 0.03 + diff1 * 0.95 + diff2 + spec + rim);
}

// ── Pre-computed cell table ────────────────────────────────────────────────────
interface Cell { onFace: boolean; baseLight: number; nx: number; ny: number; depth: number }

function buildCells(gW: number, gH: number, lxShift = 0, lyShift = 0): Cell[] {
  const aspect = (gW / gH) * 0.94;
  return Array.from({ length: ROWS * COLS }, (_, i) => {
    const r = Math.floor(i / COLS), c = i % COLS;
    const nx = ((c / (COLS - 1)) * 2 - 1) * aspect;
    const ny = (r / (ROWS - 1)) * 2 - 1;
    const depth = faceZ(nx, ny);
    const onFace = depth > 0;
    return { onFace, baseLight: onFace ? faceLighting(nx, ny, lxShift, lyShift) : 0, nx, ny, depth };
  });
}

// ── Expressions ───────────────────────────────────────────────────────────────
interface Expr {
  mouthOpen: number; mouthRound: number; eyeOpenness: number;
  browFurrow: number; browHeight: number; smileAmt: number; browSplit: number;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpE = (a: Expr, b: Expr, t: number): Expr => ({
  mouthOpen:   lerp(a.mouthOpen,   b.mouthOpen,   t),
  mouthRound:  lerp(a.mouthRound,  b.mouthRound,  t),
  eyeOpenness: lerp(a.eyeOpenness, b.eyeOpenness, t),
  browFurrow:  lerp(a.browFurrow,  b.browFurrow,  t),
  browHeight:  lerp(a.browHeight,  b.browHeight,  t),
  smileAmt:    lerp(a.smileAmt,    b.smileAmt,    t),
  browSplit:   lerp(a.browSplit,   b.browSplit,    t),
});

const E_IDLE:      Expr = { mouthOpen:0.05, mouthRound:0,    eyeOpenness:0.95, browFurrow:0,    browHeight:0,     smileAmt:0.55, browSplit:0   };
const E_REASONING: Expr = { mouthOpen:0,    mouthRound:0,    eyeOpenness:0.50, browFurrow:1.0,  browHeight:-0.16, smileAmt:0,    browSplit:0.9 };
const E_TALK_A:    Expr = { mouthOpen:0.32, mouthRound:0,    eyeOpenness:1.0,  browFurrow:0,    browHeight:0.03,  smileAmt:0.3,  browSplit:0   };
const E_TALK_B:    Expr = { mouthOpen:0.62, mouthRound:0,    eyeOpenness:0.94, browFurrow:0.08, browHeight:0,     smileAmt:0.15, browSplit:0.1 };
const E_TALK_C:    Expr = { mouthOpen:0.55, mouthRound:0.80, eyeOpenness:1.1,  browFurrow:0,    browHeight:0.07,  smileAmt:0.1,  browSplit:0   };
const E_TALK_D:    Expr = { mouthOpen:0.45, mouthRound:1.0,  eyeOpenness:1.0,  browFurrow:0,    browHeight:0,     smileAmt:0,    browSplit:0   };
const E_ALERT:     Expr = { mouthOpen:0.26, mouthRound:0.2,  eyeOpenness:1.55, browFurrow:0.3,  browHeight:0.24,  smileAmt:0,    browSplit:0.4 };
const TALK_FRAMES = [E_TALK_A, E_TALK_B, E_TALK_C, E_TALK_D];

function applyExpr(cell: Cell, e: Expr): number {
  if (!cell.onFace) return 0;
  let l = cell.baseLight;
  const { nx, ny } = cell;

  // Eyes
  for (const ex of [-0.265, 0.265]) {
    const sd = Math.hypot((nx - ex) / 0.20, (ny + 0.105) / 0.155);
    if (sd < 1) {
      const inner = 1 - sd;
      l += inner * (1 - e.eyeOpenness) * 0.34;
      l -= inner * Math.max(0, e.eyeOpenness - 1) * 0.20;
    }
  }
  // Pupil glint
  if (e.eyeOpenness > 0.85) {
    for (const ex of [-0.265, 0.265]) {
      const pd = Math.hypot((nx - ex) / 0.032, (ny + 0.10) / 0.032);
      if (pd < 1) l += (1 - pd) * (e.eyeOpenness - 0.85) * 0.65;
    }
  }
  // Brow furrow
  const browY = -0.26 + e.browHeight * 0.09;
  const bx2 = nx * nx / 0.012, by2 = (ny - browY) ** 2 / 0.0038;
  if (bx2 < 9 && by2 < 9) l -= Math.exp(-bx2) * Math.exp(-by2) * e.browFurrow * 0.52;
  // Brow split
  if (e.browSplit > 0) {
    for (const bsx of [-0.14, 0.14]) {
      const sd2 = Math.hypot((nx - bsx) / 0.13, (ny - browY - 0.07) / 0.065);
      if (sd2 < 1) l += (1 - sd2) * e.browSplit * 0.18;
    }
  }
  // Mouth
  const mRx = 0.22 * (1 - e.mouthRound * 0.32);
  const mRy = 0.052 + e.mouthOpen * 0.20 + e.mouthRound * 0.075;
  const mD = Math.hypot(nx / mRx, (ny - 0.49) / mRy);
  if (mD < 1) l -= (1 - mD) * e.mouthOpen * 0.98;
  // Teeth
  if (e.mouthOpen > 0.18) {
    const tD = Math.hypot(nx / (mRx * 0.72), (ny - 0.455) / (mRy * 0.34));
    if (tD < 1) l += (1 - tD) * (e.mouthOpen - 0.18) * 0.48;
  }
  // Smile
  for (const lx of [-0.175, 0.175]) {
    const lcd = Math.hypot((nx - lx) / 0.068, (ny - 0.465) / 0.048);
    if (lcd < 1) l += (1 - lcd) * e.smileAmt * 0.28;
  }
  return Math.max(0, Math.min(1, l));
}

// ── Rain columns ───────────────────────────────────────────────────────────────
interface Col { chars: string[]; ages: Uint8Array; head: number; speed: number }
function makeCols(): Col[] {
  return Array.from({ length: COLS }, () => ({
    chars: Array.from({ length: ROWS }, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
    ages: new Uint8Array(ROWS),
    head: Math.random() * ROWS,
    speed: 0.3 + Math.random() * 1.0,
  }));
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ── roundRect polyfill (Telegram WebView doesn't support ctx.roundRect) ───────
function rRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number | [number, number, number, number],
) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y,         x + w, y + tr,      tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h,     x + w - br, y + h,  br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x,      y + h,    x, y + h - bl,       bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x,      y,        x + tl, y,            tl);
  ctx.closePath();
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MatrixFace({
  agentState, activeTool, tokenCount = 0, amplitude = 0, weather,
  orientation, onDoubleTap,
}: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const propsRef   = useRef({ agentState, activeTool, tokenCount, amplitude, weather, orientation });
  propsRef.current = { agentState, activeTool, tokenCount, amplitude, weather, orientation };
  const prevState  = useRef<AgentState>(agentState);
  const lastTap    = useRef(0);

  // Haptics on state change
  useEffect(() => {
    if (agentState === prevState.current) return;
    prevState.current = agentState;
    const hf = (window as any).Telegram?.WebApp?.HapticFeedback;
    if (!hf) return;
    if (agentState === "alert")      hf.notificationOccurred?.("error");
    else if (agentState === "reasoning")  hf.impactOccurred?.("soft");
    else if (agentState === "responding") hf.impactOccurred?.("light");
  }, [agentState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width  = canvas.clientWidth  * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const cols = makeCols();
    let cells: Cell[] = [];
    let gridSz = { w: 0, h: 0 };
    let expr: Expr = { ...E_IDLE };
    let talkT = 0;
    let blinkTimer = 0, blinkNext = 200, blinkPhase = 0;
    let frame = 0, raf = 0;
    let prevLxShift = 0, prevLyShift = 0;

    // Double-tap
    canvas.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastTap.current < 300) onDoubleTap?.();
      lastTap.current = now;
    });

    const draw = () => {
      frame++;
      const { agentState: state, amplitude: level, orientation: ori } = propsRef.current;
      const W = canvas.clientWidth, H = canvas.clientHeight;

      // Layout — face fills almost full canvas
      const PAD = 6, HDR = 32, FOOT = 24;
      const gL = PAD + 2, gT = PAD + HDR + 1;
      const gW = W - gL - PAD - 2, gH = H - gT - FOOT - PAD;
      const cellW = gW / COLS, cellH = gH / ROWS;

      // Orientation-driven light shift
      const lxTarget = clamp((ori?.gamma ?? 0) / 45, -1, 1) * 0.20;
      const lyTarget = clamp(((ori?.beta ?? 45) - 45) / 45, -1, 1) * 0.20;
      prevLxShift = lerp(prevLxShift, lxTarget, 0.05);
      prevLyShift = lerp(prevLyShift, lyTarget, 0.05);

      // Rebuild cell table if needed
      if (gridSz.w !== gW || gridSz.h !== gH) {
        gridSz = { w: gW, h: gH };
        cells = buildCells(gW, gH, prevLxShift, prevLyShift);
      }

      // Blink
      blinkTimer++;
      if (state === "idle" && blinkTimer > blinkNext) {
        blinkPhase = 10; blinkTimer = 0; blinkNext = 160 + Math.random() * 260;
      }
      const blinkAmt = blinkPhase > 0 ? Math.sin((blinkPhase / 10) * Math.PI) : 0;
      if (blinkPhase > 0) blinkPhase--;

      // Expression target
      let target: Expr;
      if (state === "reasoning") {
        target = E_REASONING;
      } else if (state === "alert") {
        target = E_ALERT;
      } else if (state === "responding") {
        const spd = level > 0.06 ? level * 12 : 0.05;
        talkT = (talkT + spd) % 4;
        const tf = TALK_FRAMES[Math.floor(talkT)];
        target = level > 0.04 ? { ...tf, mouthOpen: clamp(level * 1.9, 0.12, 1.0) } : tf;
      } else {
        const p = 0.5 + 0.5 * Math.sin(frame * 0.007);
        target = { ...E_IDLE, smileAmt: 0.30 + p * 0.58 };
      }
      target = { ...target, eyeOpenness: target.eyeOpenness * clamp(1 - blinkAmt * 0.98, 0.02, 1) };
      expr = lerpE(expr, target, 0.09);

      // Update columns
      const driveSpeed = state === "alert" ? 1.40 : state === "reasoning" ? 0.90 : 0.48;
      for (const col of cols) {
        col.head += col.speed * driveSpeed;
        if (col.head > ROWS + 14) col.head = -(3 + Math.random() * 10);
        for (let r = 0; r < ROWS; r++) {
          col.ages[r]++;
          if (col.ages[r] > (Math.abs(col.head - r) < 4 ? 1 : 20)) {
            col.chars[r] = CHARS[Math.floor(Math.random() * CHARS.length)];
            col.ages[r] = 0;
          }
        }
      }
      // Reasoning glitch
      if (state === "reasoning" && Math.random() < 0.007)
        cols[Math.floor(Math.random() * COLS)].head += Math.random() * 3;

      // ── CLEAR ─────────────────────────────────────────────────────────────
      ctx.fillStyle = "#000703";
      ctx.fillRect(0, 0, W, H);
      if (state === "alert") { ctx.fillStyle = "rgba(50,2,2,0.28)"; ctx.fillRect(0, 0, W, H); }

      // ── CHARACTER RENDER ──────────────────────────────────────────────────
      const [sr, sg, sb] = STATE_RGB[state];
      const fSize = Math.max(5.5, Math.min(cellH * 0.90, cellW * 1.25));
      ctx.font = `${fSize}px 'Courier New',monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Bloom cell list
      const bloom: Array<{ px: number; py: number; ch: string; brite: number }> = [];

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const px = gL + (c + 0.5) * cellW;
          const py = gT + (r + 0.5) * cellH;
          const cell = cells[r * COLS + c];
          const col  = cols[c];

          const fBrite = applyExpr(cell, expr);

          // Rain — only forward from head, kept very dim in background
          const hd = col.head - r;
          const rainBrite = (hd >= 0 && hd < 1) ? 1.0
            : (hd < 0 || hd >= 18) ? 0.012
            : Math.exp(-hd * 0.35);

          // Composite: face completely dominates, background near-invisible
          let final: number;
          if (fBrite > 0.15) {
            final = fBrite;                           // face pixel — full brightness
          } else if (fBrite > 0.04) {
            final = fBrite * 0.7 + rainBrite * 0.10;
          } else {
            final = rainBrite * 0.13 + 0.005;         // background: nearly black
          }
          final = clamp(final, 0, 1);

          // Depth tint: raised → warmer, recessed → cooler
          const dt = cell.onFace ? cell.depth * 0.65 : 0;
          let rc: number, gc: number, bc: number;
          if (state === "alert") {
            if (!cell.onFace || fBrite <= 0.08) {
              rc = Math.floor(rainBrite * 200); gc = Math.floor(rainBrite * 35); bc = Math.floor(rainBrite * 25);
            } else {
              rc = Math.floor(final * (sr + dt * 10));
              gc = Math.floor(final * Math.max(8, sg - fBrite * 30));
              bc = Math.floor(final * sb);
            }
          } else {
            rc = clamp(Math.floor(final * (sr + dt * 80)), 0, 255);
            gc = clamp(Math.floor(final * sg), 0, 255);
            bc = clamp(Math.floor(final * Math.max(0, sb - dt * 45)), 0, 255);
          }

          const alpha = clamp(
            cell.onFace && fBrite > 0.12 ? final * 1.25 : final * 1.4,
            0.005, 1
          );
          ctx.fillStyle = `rgba(${rc},${gc},${bc},${alpha})`;
          ctx.fillText(col.chars[r], px, py);

          if (cell.onFace && fBrite > 0.50)
            bloom.push({ px, py, ch: col.chars[r], brite: fBrite });
        }
      }

      // ── BLOOM PASS — phosphor glow on bright face pixels ─────────────────
      if (bloom.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.shadowColor = `rgba(${sr},${sg},${sb},1)`;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = 0.50;
        ctx.fillStyle = `rgb(${sr},${sg},${sb})`;
        for (const { px, py, ch } of bloom) ctx.fillText(ch, px, py);
        ctx.restore();
      }

      // ── SCANLINES ─────────────────────────────────────────────────────────
      ctx.save();
      ctx.globalAlpha = 0.028;
      ctx.fillStyle = "#000";
      for (let y = gT; y < gT + gH; y += 3) ctx.fillRect(gL, y, gW, 1.5);
      ctx.restore();

      // ── VIGNETTE ─────────────────────────────────────────────────────────
      const vg = ctx.createRadialGradient(W/2, gT + gH/2, gH*0.12, W/2, gT + gH/2, gH*0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = vg;
      ctx.fillRect(gL, gT, gW, gH);

      // ── WEATHER ──────────────────────────────────────────────────────────
      const wx = propsRef.current.weather;
      if (wx?.condition === "rain" || wx?.condition === "thunder") {
        ctx.strokeStyle = "rgba(80,200,120,0.06)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 7; i++) {
          const rx = gL + ((frame * 2 + i * 57) % gW);
          const ry = gT + ((frame * 4 + i * 41) % gH);
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 2, ry + 8); ctx.stroke();
        }
      }
      if (wx?.condition === "thunder" && frame % 80 < 5) {
        ctx.fillStyle = "rgba(180,220,255,0.04)"; ctx.fillRect(gL, gT, gW, gH);
      }

      // ── CHROME ────────────────────────────────────────────────────────────
      const shellRgb = `${sr},${sg},${sb}`;
      const shellCss = `rgb(${shellRgb})`;
      const r12 = 11;

      // Outer glow border
      ctx.save();
      ctx.shadowColor = shellCss;
      ctx.shadowBlur = state === "alert" ? 16 : 10;
      ctx.strokeStyle = shellCss;
      ctx.lineWidth = 1.5;
      rRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, r12);
      ctx.stroke();
      ctx.restore();

      // Inner dim border
      ctx.strokeStyle = `rgba(${shellRgb},0.20)`;
      ctx.lineWidth = 1;
      rRect(ctx, PAD + 2, PAD + 2, W - PAD*2 - 4, H - PAD*2 - 4, r12 - 2);
      ctx.stroke();

      // Title bar fill
      ctx.fillStyle = "rgba(0,5,2,0.97)";
      rRect(ctx, PAD + 1, PAD + 1, W - PAD*2 - 2, HDR, [r12 - 1, r12 - 1, 0, 0]);
      ctx.fill();

      // Title separator
      ctx.strokeStyle = `rgba(${shellRgb},0.15)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD + 14, PAD + HDR + 0.5);
      ctx.lineTo(W - PAD - 14, PAD + HDR + 0.5);
      ctx.stroke();

      // Smiley
      const icX = PAD + 17, icY = PAD + HDR / 2;
      ctx.fillStyle = "#f6d22a";
      ctx.shadowColor = "#f6d22a88"; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(icX, icY, 8.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.92)";
      ctx.beginPath();
      ctx.arc(icX - 2.8, icY - 2, 1.2, 0, Math.PI * 2);
      ctx.arc(icX + 2.8, icY - 2, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.92)"; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(icX, icY + 0.5, 4.2, 0.2, Math.PI - 0.2); ctx.stroke();

      // State pulse dot
      const pulseK = state !== "idle" ? 0.6 + 0.4 * Math.sin(frame * (state === "alert" ? 0.20 : 0.07)) : 0.92;
      ctx.fillStyle = `rgba(${shellRgb},${pulseK})`;
      ctx.shadowColor = shellCss; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(PAD + 30, icY, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      // HERMES title
      ctx.font = "bold 12px ui-monospace,'SF Mono',monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = shellCss;
      ctx.shadowColor = shellCss; ctx.shadowBlur = 5;
      ctx.fillText("HERMES", PAD + 42, icY + 4);
      ctx.shadowBlur = 0;

      // Active tool (centre)
      const tool = propsRef.current.activeTool;
      if (tool) {
        ctx.font = "9px ui-monospace,'SF Mono',monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(${shellRgb},0.55)`;
        ctx.fillText(tool.replace(/_/g, " ").toUpperCase().slice(0, 18), W / 2, icY + 4);
      }

      // Window controls (top-right) — terminal style
      const ctrlY = icY;
      // — minimize
      ctx.strokeStyle = `rgba(${shellRgb},0.50)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(W - PAD - 52, ctrlY); ctx.lineTo(W - PAD - 44, ctrlY); ctx.stroke();
      // □ maximise
      ctx.strokeStyle = `rgba(${shellRgb},0.60)`;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(W - PAD - 36, ctrlY - 4, 8, 8);
      // ✕ close
      ctx.strokeStyle = `rgba(${shellRgb},0.75)`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(W - PAD - 20, ctrlY - 4); ctx.lineTo(W - PAD - 12, ctrlY + 4);
      ctx.moveTo(W - PAD - 12, ctrlY - 4); ctx.lineTo(W - PAD - 20, ctrlY + 4);
      ctx.stroke();

      // Footer fill
      ctx.fillStyle = "rgba(0,5,2,0.97)";
      rRect(ctx, PAD + 1, H - PAD - FOOT, W - PAD*2 - 2, FOOT - 1, [0, 0, r12 - 1, r12 - 1]);
      ctx.fill();

      // Footer separator
      ctx.strokeStyle = `rgba(${shellRgb},0.12)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD + 14, H - PAD - FOOT + 0.5);
      ctx.lineTo(W - PAD - 14, H - PAD - FOOT + 0.5);
      ctx.stroke();

      // Footer text
      ctx.font = "9px ui-monospace,'SF Mono',monospace";
      ctx.fillStyle = `rgba(${shellRgb},0.65)`;
      ctx.textAlign = "left";
      ctx.fillText("CMD ▸", PAD + 14, H - PAD - FOOT / 2 + 3);
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(${shellRgb},0.80)`;
      ctx.fillText(state.toUpperCase(), W / 2, H - PAD - FOOT / 2 + 3);
      ctx.textAlign = "right";
      ctx.fillStyle = `rgba(${shellRgb},0.55)`;
      ctx.fillText(
        state === "reasoning" && tokenCount > 0 ? `${tokenCount} OPS`
          : wx ? `${wx.temp}°` : "—",
        W - PAD - 14, H - PAD - FOOT / 2 + 3
      );

      // Alert pulse overlay
      if (state === "alert") {
        const alertK = 0.06 + 0.04 * Math.sin(frame * 0.15);
        ctx.fillStyle = `rgba(255,0,0,${alertK})`;
        rRect(ctx, PAD, PAD, W - PAD*2, H - PAD*2, r12);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
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
