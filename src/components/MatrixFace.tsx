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

// ── Halfwidth katakana + digits + symbols ──────────────────────────────────────
const CHARS =
  "ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ" +
  "0123456789ABCDEF@#$%&*+=<>|";
const COLS = 64;
const ROWS = 80;

const STATE_RGB: Record<string, [number, number, number]> = {
  idle:       [0,   255, 100],
  reasoning:  [60,  230, 210],
  responding: [0,   200, 255],
  alert:      [255,  50,  50],
  angry:      [255,  65,  45],
  sad:        [90,  120, 210],
};

// ── Anatomical face geometry ───────────────────────────────────────────────────
function faceZ(nx: number, ny: number): number {
  const skullW = 0.82 + 0.055 * Math.exp(-((ny - 0.04) * (ny - 0.04)) / 0.30);
  const sphere = 1 - (nx / skullW) * (nx / skullW) - (ny / 1.05) * (ny / 1.05);
  if (sphere <= 0) return 0;
  let z = Math.sqrt(sphere) * 0.92;

  // Temple hollows
  for (const tx of [-0.56, 0.56]) {
    const d = Math.hypot((nx - tx) * 1.8, (ny + 0.04) * 2.3);
    if (d < 0.42) z -= Math.pow((0.42 - d) / 0.42, 1.6) * 0.11;
  }
  // Forehead taper
  if (ny < -0.40) z *= 1 - ((-ny - 0.40) / 0.62) * 0.09;

  // Brow ridge
  const bcy = -0.25;
  if (ny > bcy - 0.14 && ny < bcy + 0.09 && Math.abs(nx) < 0.52) {
    const ty = (ny - bcy) / 0.14;
    const txb = nx / 0.48;
    z += Math.exp(-ty * ty * 2.3) * Math.exp(-txb * txb * 1.2) * 0.14;
  }
  // Eye sockets (concave)
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
  // Lip ridge
  const lip = Math.hypot(nx * 2.7, (ny - 0.49) * 5.4);
  if (lip < 0.27) z += ((0.27 - lip) / 0.27) * 0.13;
  // Chin
  const ch = Math.hypot(nx * 4.1, (ny - 0.70) * 5.2);
  if (ch < 0.25) z += ((0.25 - ch) / 0.25) * 0.14;

  return Math.max(0, z);
}

// Primary light: upper-left  /  Fill light: right
const _L1 = [-0.44, -0.60, 0.67], _L1n = Math.hypot(-0.44, -0.60, 0.67);
const L1x = _L1[0] / _L1n, L1y = _L1[1] / _L1n, L1z = _L1[2] / _L1n;
const _L2 = [0.52, -0.12, 0.85], _L2n = Math.hypot(0.52, -0.12, 0.85);
const L2x = _L2[0] / _L2n, L2y = _L2[1] / _L2n, L2z = _L2[2] / _L2n;

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
  const diff1 = Math.max(0, (l1xS / l1len) * snx + (l1yS / l1len) * sny + (L1z / l1len) * snz);
  const diff2 = Math.max(0, L2x * snx + L2y * sny + L2z * snz) * 0.22;

  // Blinn-Phong specular
  const hx = l1xS / l1len, hy = l1yS / l1len, hz = L1z / l1len + 1;
  const hl = Math.hypot(hx, hy, hz);
  const spec = Math.pow(Math.max(0, (hx / hl) * snx + (hy / hl) * sny + (hz / hl) * snz), 38) * 0.80;
  // Rim
  const rim = Math.pow(Math.max(0, 1 - snz), 3) * 0.12;

  return Math.min(1, 0.03 + diff1 * 0.98 + diff2 + spec + rim);
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
    return {
      onFace,
      baseLight: onFace ? faceLighting(nx, ny, lxShift, lyShift) : 0,
      nx, ny, depth,
    };
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

const E_IDLE:      Expr = { mouthOpen: 0.05, mouthRound: 0,    eyeOpenness: 0.95, browFurrow: 0,   browHeight: 0,     smileAmt: 0.55, browSplit: 0   };
const E_REASONING: Expr = { mouthOpen: 0,    mouthRound: 0,    eyeOpenness: 0.50, browFurrow: 1.0, browHeight: -0.16, smileAmt: 0,    browSplit: 0.9 };
const E_TALK_A:    Expr = { mouthOpen: 0.32, mouthRound: 0,    eyeOpenness: 1.0,  browFurrow: 0,   browHeight: 0.03,  smileAmt: 0.3,  browSplit: 0   };
const E_TALK_B:    Expr = { mouthOpen: 0.62, mouthRound: 0,    eyeOpenness: 0.94, browFurrow: 0.08,browHeight: 0,     smileAmt: 0.15, browSplit: 0.1 };
const E_TALK_C:    Expr = { mouthOpen: 0.55, mouthRound: 0.80, eyeOpenness: 1.1,  browFurrow: 0,   browHeight: 0.07,  smileAmt: 0.1,  browSplit: 0   };
const E_TALK_D:    Expr = { mouthOpen: 0.45, mouthRound: 1.0,  eyeOpenness: 1.0,  browFurrow: 0,   browHeight: 0,     smileAmt: 0,    browSplit: 0   };
const E_ALERT:     Expr = { mouthOpen: 0.26, mouthRound: 0.2,  eyeOpenness: 1.55, browFurrow: 0.3, browHeight: 0.24,  smileAmt: 0,    browSplit: 0.4 };
const TALK_FRAMES = [E_TALK_A, E_TALK_B, E_TALK_C, E_TALK_D];

function applyExpr(cell: Cell, e: Expr): number {
  if (!cell.onFace) return 0;
  let l = cell.baseLight;
  const { nx, ny } = cell;

  // Eye sockets — close down or open up
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
  // Brow furrow shadow
  const browY = -0.26 + e.browHeight * 0.09;
  const bx2 = (nx * nx) / 0.012;
  const by2 = ((ny - browY) * (ny - browY)) / 0.0038;
  if (bx2 < 9 && by2 < 9) l -= Math.exp(-bx2) * Math.exp(-by2) * e.browFurrow * 0.52;
  // Brow split highlight
  if (e.browSplit > 0) {
    for (const bsx of [-0.14, 0.14]) {
      const sd2 = Math.hypot((nx - bsx) / 0.13, (ny - browY - 0.07) / 0.065);
      if (sd2 < 1) l += (1 - sd2) * e.browSplit * 0.18;
    }
  }
  // Mouth cavity
  const mRx = 0.22 * (1 - e.mouthRound * 0.32);
  const mRy = 0.052 + e.mouthOpen * 0.20 + e.mouthRound * 0.075;
  const mD = Math.hypot(nx / mRx, (ny - 0.49) / mRy);
  if (mD < 1) l -= (1 - mD) * e.mouthOpen * 0.98;
  // Teeth highlight
  if (e.mouthOpen > 0.18) {
    const tD = Math.hypot(nx / (mRx * 0.72), (ny - 0.455) / (mRy * 0.34));
    if (tD < 1) l += (1 - tD) * (e.mouthOpen - 0.18) * 0.48;
  }
  // Smile creases
  for (const lx of [-0.175, 0.175]) {
    const lcd = Math.hypot((nx - lx) / 0.068, (ny - 0.465) / 0.048);
    if (lcd < 1) l += (1 - lcd) * e.smileAmt * 0.28;
  }
  return Math.max(0, Math.min(1, l));
}

// ── Rain columns ───────────────────────────────────────────────────────────────
interface RainCol { chars: string[]; ages: Uint8Array; head: number; speed: number }
function makeCols(): RainCol[] {
  return Array.from({ length: COLS }, () => ({
    chars: Array.from({ length: ROWS }, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
    ages:  new Uint8Array(ROWS),
    head:  Math.random() * ROWS,
    speed: 0.3 + Math.random() * 1.0,
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** arcTo-based roundRect — ctx.roundRect not available in Telegram WKWebView */
function rRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number | [number, number, number, number],
) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y,      x + w, y + tr,      tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h,  x + w - br, y + h,  br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h,      x, y + h - bl,       bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y,          x + tl, y,            tl);
  ctx.closePath();
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MatrixFace({
  agentState, activeTool, tokenCount = 0, amplitude = 0,
  weather, orientation, onDoubleTap,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef  = useRef({ agentState, activeTool, tokenCount, amplitude, weather, orientation });
  propsRef.current = { agentState, activeTool, tokenCount, amplitude, weather, orientation };
  const prevState = useRef<AgentState>(agentState);
  const lastTap   = useRef(0);

  // Haptic feedback on state change
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

    // ── Resize — getBoundingClientRect is reliable in Telegram WKWebView ──────
    const resize = () => {
      try {
        const rect = canvas.getBoundingClientRect();
        const w = Math.floor(rect.width  * dpr);
        const h = Math.floor(rect.height * dpr);
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

    const twa = (window as any).Telegram?.WebApp;
    const onVP = () => resize();
    twa?.onEvent?.("viewportChanged", onVP);

    // Double-tap detection
    const onClick = () => {
      const now = Date.now();
      if (now - lastTap.current < 320) onDoubleTap?.();
      lastTap.current = now;
    };
    canvas.addEventListener("click", onClick);

    // ── State ─────────────────────────────────────────────────────────────────
    const rainCols = makeCols();
    let cells: Cell[]   = [];
    let gridKey = "";
    let expr: Expr      = { ...E_IDLE };
    let talkT           = 0;
    let blinkTimer      = 0, blinkNext = 200, blinkPhase = 0;
    let frame           = 0, raf = 0;
    let lxSmooth        = 0, lySmooth = 0;

    // ── Draw loop ─────────────────────────────────────────────────────────────
    const draw = () => {
      raf = requestAnimationFrame(draw);

      // All rendering is wrapped — if anything throws, we log but keep looping
      try {
        frame++;
        const { agentState: state, amplitude: level, orientation: ori } = propsRef.current;
        const rect = canvas.getBoundingClientRect();
        const W = rect.width, H = rect.height;
        if (W <= 0 || H <= 0) return;

        // Layout constants
        const PAD  = 6;
        const HDR  = 30;
        const FOOT = 22;
        const gL   = PAD + 2;
        const gT   = PAD + HDR + 1;
        const gW   = W - gL - PAD - 2;
        const gH   = H - gT - FOOT - PAD;
        const cellW = gW / COLS;
        const cellH = gH / ROWS;
        const fSize = Math.max(5, Math.min(cellH * 0.92, cellW * 1.30));

        // Smooth orientation light-shift
        const lxTarget = clamp((ori?.gamma ?? 0) / 45, -1, 1) * 0.18;
        const lyTarget = clamp(((ori?.beta ?? 45) - 45) / 45, -1, 1) * 0.18;
        lxSmooth = lerp(lxSmooth, lxTarget, 0.05);
        lySmooth = lerp(lySmooth, lyTarget, 0.05);

        // Rebuild cell table only when layout changes
        const gKey = `${gW.toFixed(0)}x${gH.toFixed(0)}`;
        if (gKey !== gridKey) {
          gridKey = gKey;
          cells = buildCells(gW, gH, lxSmooth, lySmooth);
        }

        // Blink timer
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
        // Apply blink
        target = { ...target, eyeOpenness: target.eyeOpenness * clamp(1 - blinkAmt * 0.98, 0.02, 1) };
        expr = lerpE(expr, target, 0.09);

        // Advance rain
        const driveSpeed = state === "alert" ? 1.5 : state === "reasoning" ? 0.95 : 0.50;
        for (const col of rainCols) {
          col.head += col.speed * driveSpeed;
          if (col.head > ROWS + 14) col.head = -(3 + Math.random() * 10);
          for (let r = 0; r < ROWS; r++) {
            col.ages[r]++;
            const near = Math.abs(col.head - r) < 4;
            if (col.ages[r] > (near ? 1 : 22)) {
              col.chars[r] = CHARS[Math.floor(Math.random() * CHARS.length)];
              col.ages[r] = 0;
            }
          }
        }
        if (state === "reasoning" && Math.random() < 0.007) {
          rainCols[Math.floor(Math.random() * COLS)].head += Math.random() * 3;
        }

        // ── CLEAR ─────────────────────────────────────────────────────────────
        ctx.fillStyle = "#000a04";
        ctx.fillRect(0, 0, W, H);
        if (state === "alert") {
          ctx.fillStyle = "rgba(45,2,2,0.25)";
          ctx.fillRect(0, 0, W, H);
        }

        // ── CHARACTER GRID ────────────────────────────────────────────────────
        const [sr, sg, sb] = STATE_RGB[state];
        ctx.font = `${fSize}px 'Courier New',monospace`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";

        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const px   = gL + (c + 0.5) * cellW;
            const py   = gT + (r + 0.5) * cellH;
            const cell = cells[r * COLS + c];
            const col  = rainCols[c];

            const fBrite = applyExpr(cell, expr);

            // Rain brightness — head is brightest, trails off fast
            const hd = col.head - r;
            let rainBrite: number;
            if   (hd >= 0 && hd < 1)  rainBrite = 1.0;
            else if (hd < 0 || hd >= 18) rainBrite = 0.010;
            else                       rainBrite = Math.exp(-hd * 0.38);

            // Face dominates completely — background near-invisible
            let final: number;
            if (fBrite > 0.18) {
              final = fBrite;                         // face: full brightness
            } else if (fBrite > 0.06) {
              final = fBrite * 0.85 + rainBrite * 0.08;
            } else {
              final = rainBrite * 0.10 + 0.004;       // background: almost black
            }
            final = clamp(final, 0, 1);

            // Depth tint: raised = warmer, recessed = cooler
            const dt = cell.onFace ? cell.depth * 0.65 : 0;
            let rc: number, gc: number, bc: number;

            if (state === "alert") {
              if (!cell.onFace || fBrite <= 0.08) {
                rc = Math.floor(rainBrite * 180);
                gc = Math.floor(rainBrite * 30);
                bc = Math.floor(rainBrite * 22);
              } else {
                rc = clamp(Math.floor(final * (sr + dt * 10)), 0, 255);
                gc = clamp(Math.floor(final * Math.max(8, sg - fBrite * 30)), 0, 255);
                bc = clamp(Math.floor(final * sb), 0, 255);
              }
            } else {
              rc = clamp(Math.floor(final * (sr + dt * 80)), 0, 255);
              gc = clamp(Math.floor(final * sg), 0, 255);
              bc = clamp(Math.floor(final * Math.max(0, sb - dt * 45)), 0, 255);
            }

            const alpha = clamp(
              cell.onFace && fBrite > 0.12 ? final * 1.30 : final * 1.5,
              0.004, 1
            );

            ctx.fillStyle = `rgba(${rc},${gc},${bc},${alpha})`;
            ctx.fillText(col.chars[r], px, py);
          }
        }

        // ── SCANLINES (subtle CRT feel) ────────────────────────────────────────
        // No ctx.save() needed — just a quick fillRect pass
        ctx.globalAlpha = 0.022;
        ctx.fillStyle = "#000";
        for (let y = gT; y < gT + gH; y += 3) {
          ctx.fillRect(gL, y, gW, 1.2);
        }
        ctx.globalAlpha = 1;

        // ── VIGNETTE ──────────────────────────────────────────────────────────
        // NOTE: createRadialGradient is safe — no save/restore needed
        try {
          const vg = ctx.createRadialGradient(W / 2, gT + gH / 2, gH * 0.12, W / 2, gT + gH / 2, gH * 0.62);
          vg.addColorStop(0, "rgba(0,0,0,0)");
          vg.addColorStop(1, "rgba(0,0,0,0.42)");
          ctx.fillStyle = vg;
          ctx.fillRect(gL, gT, gW, gH);
        } catch { /* gradient fallback — skip */ }

        // ── WEATHER FX ────────────────────────────────────────────────────────
        const wx = propsRef.current.weather;
        if (wx?.condition === "rain" || wx?.condition === "thunder") {
          ctx.strokeStyle = "rgba(80,200,120,0.05)";
          ctx.lineWidth   = 1;
          for (let i = 0; i < 6; i++) {
            const rx = gL + ((frame * 2 + i * 61) % gW);
            const ry = gT + ((frame * 4 + i * 43) % gH);
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx - 2, ry + 7);
            ctx.stroke();
          }
        }
        if (wx?.condition === "thunder" && frame % 80 < 5) {
          ctx.fillStyle = "rgba(180,220,255,0.04)";
          ctx.fillRect(gL, gT, gW, gH);
        }

        // ── CHROME ────────────────────────────────────────────────────────────
        const shellCss = `rgb(${sr},${sg},${sb})`;
        const R = 10; // corner radius

        // Glow border — NOTE: no shadowBlur, just a double-stroke for glow effect
        // Outer glow stroke (faint, wide-ish)
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.20)`;
        ctx.lineWidth   = 5;
        rRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, R + 1);
        ctx.stroke();
        // Main border
        ctx.strokeStyle = shellCss;
        ctx.lineWidth   = 1.5;
        rRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, R);
        ctx.stroke();
        // Inner subtle border
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.18)`;
        ctx.lineWidth   = 1;
        rRect(ctx, PAD + 3, PAD + 3, W - PAD * 2 - 6, H - PAD * 2 - 6, R - 2);
        ctx.stroke();

        // Title bar background
        ctx.fillStyle = "rgba(0,4,2,0.96)";
        rRect(ctx, PAD + 1, PAD + 1, W - PAD * 2 - 2, HDR, [R - 1, R - 1, 0, 0]);
        ctx.fill();

        // Title separator line
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.14)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD + 12, PAD + HDR + 0.5);
        ctx.lineTo(W - PAD - 12, PAD + HDR + 0.5);
        ctx.stroke();

        // Yellow smiley icon
        const icX = PAD + 16, icY = PAD + HDR / 2;
        ctx.fillStyle = "#f5d020";
        ctx.beginPath(); ctx.arc(icX, icY, 7.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.88)";
        ctx.beginPath();
        ctx.arc(icX - 2.5, icY - 1.8, 1.1, 0, Math.PI * 2);
        ctx.arc(icX + 2.5, icY - 1.8, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.88)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(icX, icY + 0.6, 3.8, 0.15, Math.PI - 0.15);
        ctx.stroke();

        // State pulse dot
        const pulseK = state !== "idle"
          ? 0.55 + 0.45 * Math.sin(frame * (state === "alert" ? 0.22 : 0.07))
          : 0.90;
        ctx.fillStyle = `rgba(${sr},${sg},${sb},${pulseK})`;
        ctx.beginPath();
        ctx.arc(PAD + 28, icY, 2.8, 0, Math.PI * 2);
        ctx.fill();

        // "HERMES" title
        ctx.font      = "bold 11px ui-monospace,'SF Mono','Courier New',monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = shellCss;
        ctx.fillText("HERMES", PAD + 38, icY + 4);

        // Active tool label (centred)
        const tool = propsRef.current.activeTool;
        if (tool) {
          ctx.font      = "9px ui-monospace,'SF Mono','Courier New',monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = `rgba(${sr},${sg},${sb},0.55)`;
          ctx.fillText(tool.replace(/_/g, " ").toUpperCase().slice(0, 18), W / 2, icY + 4);
        }

        // Window controls — top right: "... □ ×"
        const ctrlY = icY + 3.5;
        ctx.font      = "10px ui-monospace,'SF Mono','Courier New',monospace";
        ctx.textAlign = "right";
        ctx.fillStyle = `rgba(${sr},${sg},${sb},0.55)`;
        ctx.fillText("... □ ×", W - PAD - 8, ctrlY);

        // Footer background
        ctx.fillStyle = "rgba(0,4,2,0.96)";
        rRect(ctx, PAD + 1, H - PAD - FOOT, W - PAD * 2 - 2, FOOT, [0, 0, R - 1, R - 1]);
        ctx.fill();

        // Footer separator line
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.12)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD + 12, H - PAD - FOOT + 0.5);
        ctx.lineTo(W - PAD - 12, H - PAD - FOOT + 0.5);
        ctx.stroke();

        const footY = H - PAD - FOOT / 2 + 3.5;
        ctx.font = "9px ui-monospace,'SF Mono','Courier New',monospace";

        // CMD> bottom-left
        ctx.textAlign = "left";
        ctx.fillStyle = `rgba(${sr},${sg},${sb},0.65)`;
        ctx.fillText("CMD>", PAD + 12, footY);

        // State label centred
        ctx.textAlign = "center";
        ctx.fillStyle = shellCss;
        ctx.fillText(state.toUpperCase(), W / 2, footY);

        // Right info
        ctx.textAlign = "right";
        ctx.fillStyle = `rgba(${sr},${sg},${sb},0.55)`;
        const rightTxt = state === "reasoning" && tokenCount > 0
          ? `${tokenCount} OPS`
          : wx ? `${wx.temp}°` : "—";
        ctx.fillText(rightTxt, W - PAD - 12, footY);

        // Alert pulse overlay
        if (state === "alert") {
          const alertK = 0.05 + 0.04 * Math.sin(frame * 0.15);
          ctx.fillStyle = `rgba(255,0,0,${alertK})`;
          rRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, R);
          ctx.fill();
        }

      } catch (e) {
        console.error("MatrixFace draw error:", e);
        // Reset context state defensively
        try {
          ctx.globalAlpha               = 1;
          ctx.globalCompositeOperation  = "source-over";
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
