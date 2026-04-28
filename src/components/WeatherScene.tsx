/**
 * WeatherScene — animated canvas background for the Cyllene pet companion.
 * Renders an immersive weather environment that mirrors real local conditions.
 *
 * No shadowBlur anywhere — safe for Telegram WKWebView.
 * All coordinates in CSS pixels; DPR handled via setTransform.
 */
import { useEffect, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type WeatherCondition = "sunny" | "cloudy" | "rain" | "snow" | "thunder" | "fog" | "windy";

interface RainDrop   { x: number; y: number; vx: number; vy: number; length: number; width: number; alpha: number; }
interface SnowFlake  { x: number; y: number; vy: number; radius: number; wobble: number; wobbleFreq: number; wobblePhase: number; alpha: number; }
interface SunMote    { angle: number; orbitR: number; orbitSpeed: number; radius: number; alpha: number; alphaPhase: number; }
interface CloudBlob  { x: number; y: number; vx: number; radii: number[]; offsets: [number, number][]; alpha: number; }
interface FogBand    { y: number; amplitude: number; frequency: number; speed: number; phase: number; thickness: number; alpha: number; }
interface WindStreak { x: number; y: number; vy: number; vx: number; length: number; width: number; alpha: number; age: number; maxAge: number; }

interface SplashRipple { x: number; y: number; r: number; maxR: number; age: number; maxAge: number; }

interface LightningBolt {
  segments: [number, number][];
  branches: [number, number][][];
  spawnTime: number;
  duration: number;
}
interface ThunderFlash { spawnTime: number; duration: number; intensity: number; }

interface SnowAccum { heights: Float32Array; width: number; }

interface Transition { from: WeatherCondition | null; to: WeatherCondition; progress: number; active: boolean; }

// ── Background configs ────────────────────────────────────────────────────────

const BG: Record<string, [string, string, string]> = {
  rain:    ["#04090f", "#060a12", "#030508"],
  thunder: ["#060413", "#040310", "#02020a"],
  snow:    ["#080b12", "#070912", "#04060d"],
  sunny:   ["#0d0900", "#0a0a0f", "#060408"],
  cloudy:  ["#080c14", "#06090f", "#040608"],
  fog:     ["#08090e", "#07090d", "#05060a"],
  windy:   ["#050a0d", "#060b0d", "#040809"],
  default: ["#070a0f", "#060810", "#04050a"],
};

const AMBIENT: Record<string, [number, number, number]> = {
  rain:    [20,  40,  80],
  thunder: [50,  20, 100],
  snow:    [60,  80, 120],
  sunny:   [80,  50,   0],
  cloudy:  [30,  40,  60],
  fog:     [60,  65,  70],
  windy:   [20,  60,  60],
  default: [30,  40,  55],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function rnd(lo: number, hi: number) { return lo + Math.random() * (hi - lo); }
function rndInt(lo: number, hi: number) { return Math.floor(rnd(lo, hi + 1)); }

function normalizeCondition(c: string | undefined | null): WeatherCondition {
  const valid = new Set(["sunny","cloudy","rain","snow","thunder","fog","windy"]);
  return (c && valid.has(c) ? c : "cloudy") as WeatherCondition;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// ── Particle factories ────────────────────────────────────────────────────────

function makeRainDrop(W: number, H: number, heavy = false): RainDrop {
  const vx = heavy ? rnd(-3, -1) : rnd(-1.2, -0.3);
  return {
    x: rnd(0, W + 50), y: rnd(-H, H),
    vx, vy: rnd(14, heavy ? 24 : 22),
    length: rnd(6, 14), width: rnd(0.8, 1.4),
    alpha: rnd(0.25, 0.55),
  };
}

function makeSnowFlake(W: number, H: number): SnowFlake {
  return {
    x: rnd(0, W), y: rnd(-H, H),
    vy: rnd(0.6, 2.0),
    radius: rnd(1.5, 4.5),
    wobble: rnd(4, 14),
    wobbleFreq: rnd(0.025, 0.055),
    wobblePhase: rnd(0, Math.PI * 2),
    alpha: rnd(0.45, 0.85),
  };
}

function makeSunMote(): SunMote {
  return {
    angle: rnd(0, Math.PI * 2),
    orbitR: rnd(20, 220),
    orbitSpeed: rnd(0.003, 0.010),
    radius: rnd(1.0, 3.5),
    alpha: rnd(0.15, 0.50),
    alphaPhase: rnd(0, Math.PI * 2),
  };
}

function makeCloud(W: number, H: number, yFrac: number): CloudBlob {
  const count    = rndInt(5, 7);
  const baseR    = rnd(30, 55);
  const radii    = Array.from({ length: count }, () => baseR * rnd(0.5, 1.1));
  const offsets  = radii.map((_, i) => [
    (i - count / 2) * baseR * 0.85 + rnd(-10, 10),
    rnd(-baseR * 0.4, baseR * 0.4),
  ] as [number, number]);
  return { x: rnd(0, W), y: H * yFrac + rnd(-20, 20), vx: rnd(0.06, 0.22), radii, offsets, alpha: rnd(0.06, 0.15) };
}

function makeFogBand(H: number, yFrac: number): FogBand {
  return {
    y: H * yFrac + rnd(-15, 15),
    amplitude:  rnd(10, 28),
    frequency:  rnd(0.005, 0.011),
    speed:      rnd(0.4, 1.1),
    phase:      rnd(0, Math.PI * 2),
    thickness:  rnd(22, 60),
    alpha:      rnd(0.05, 0.13),
  };
}

function makeWindStreak(_W: number, H: number): WindStreak {
  const len = rnd(25, 100);
  const maxAge = rndInt(18, 55);
  return {
    x: -len, y: rnd(0, H),
    vx: rnd(12, 24), vy: rnd(-0.8, 0.8),
    length: len, width: rnd(0.4, 1.1),
    alpha: rnd(0.08, 0.25),
    age: 0, maxAge,
  };
}

// ── Lightning bolt generator ──────────────────────────────────────────────────

function generateBolt(W: number, H: number): LightningBolt {
  const x1 = rnd(W * 0.15, W * 0.85), y1 = 0;
  const x2 = x1 + rnd(-W * 0.15, W * 0.15), y2 = rnd(H * 0.45, H * 0.80);

  // Build trunk with 4 levels of midpoint displacement
  let pts: [number, number][] = [[x1, y1], [x2, y2]];
  for (let level = 0; level < 4; level++) {
    const next: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      next.push([ax, ay]);
      next.push([
        (ax + bx) / 2 + rnd(-1, 1) * (W * 0.10 / (level + 1)),
        (ay + by) / 2 + rnd(-0.1, 0.9) * 20,
      ]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }

  // 1–2 branches off mid-trunk
  const branches: [number, number][][] = [];
  const branchCount = Math.random() < 0.6 ? 1 : 2;
  for (let b = 0; b < branchCount; b++) {
    const si = rndInt(Math.floor(pts.length * 0.25), Math.floor(pts.length * 0.65));
    const [bx, by] = pts[si];
    const ex = bx + rnd(-W * 0.2, W * 0.2), ey = by + rnd(H * 0.18, H * 0.32);
    let bpts: [number, number][] = [[bx, by], [ex, ey]];
    for (let level = 0; level < 2; level++) {
      const nb: [number, number][] = [];
      for (let i = 0; i < bpts.length - 1; i++) {
        const [ax, ay] = bpts[i], [bxp, byp] = bpts[i + 1];
        nb.push([ax, ay]);
        nb.push([(ax + bxp) / 2 + rnd(-20, 20), (ay + byp) / 2 + rnd(-5, 15)]);
      }
      nb.push(bpts[bpts.length - 1]);
      bpts = nb;
    }
    branches.push(bpts);
  }

  return { segments: pts, branches, spawnTime: performance.now(), duration: rnd(80, 140) };
}

// ── Background draw helpers ───────────────────────────────────────────────────

function drawBg(ctx: CanvasRenderingContext2D, condition: string, W: number, H: number) {
  const [top, mid, bot] = BG[condition] ?? BG.default;
  const [tr, tg, tb] = hexToRgb(top);
  const [mr, mg, mb] = hexToRgb(mid);
  const [br, bg, bb] = hexToRgb(bot);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0,   `rgb(${tr},${tg},${tb})`);
  g.addColorStop(0.5, `rgb(${mr},${mg},${mb})`);
  g.addColorStop(1,   `rgb(${br},${bg},${bb})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Ambient tint radial from top centre
  const [ar, ag, ab] = AMBIENT[condition] ?? AMBIENT.default;
  try {
    const a = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 0.85);
    a.addColorStop(0, `rgba(${ar},${ag},${ab},0.06)`);
    a.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, W, H);
  } catch { /* skip */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  weather: { condition: string; temp: number } | null;
  className?: string;
  style?: React.CSSProperties;
}

export function WeatherScene({ weather, className, style }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const cssWRef    = useRef(300);
  const cssHRef    = useRef(500);
  const condRef    = useRef<WeatherCondition>("cloudy");
  const transRef   = useRef<Transition>({ from: null, to: "cloudy", progress: 1, active: false });

  // Condition change → trigger transition
  useEffect(() => {
    const next = normalizeCondition(weather?.condition);
    if (next !== condRef.current) {
      transRef.current = {
        from: condRef.current,
        to:   next,
        progress: 0,
        active: condRef.current !== null,
      };
      condRef.current = next;
    }
  }, [weather?.condition]);

  // ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.floor(r.width * dpr), h = Math.floor(r.height * dpr);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w; canvas.height = h;
        const ctx2 = canvas.getContext("2d");
        if (ctx2) ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
        cssWRef.current = r.width;
        cssHRef.current = r.height;
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => ro.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Particle pools ──
    const rainDrops:   RainDrop[]    = [];
    const snowFlakes:  SnowFlake[]   = [];
    const sunMotes:    SunMote[]     = [];
    const clouds:      CloudBlob[]   = [0.05,0.12,0.20,0.28,0.38].map(f => makeCloud(cssWRef.current, cssHRef.current, f));
    const fogBands:    FogBand[]     = [0.20,0.35,0.48,0.60,0.72,0.85].map(f => makeFogBand(cssHRef.current, f));
    const windStreaks:  WindStreak[]  = [];
    const splashRipples: SplashRipple[] = [];

    let bolt:   LightningBolt | null = null;
    let flash:  ThunderFlash  | null = null;
    let nextBoltTime = performance.now() + rnd(3000, 6000);
    let snowAccum: SnowAccum = { heights: new Float32Array(Math.ceil(cssWRef.current / 4)), width: cssWRef.current };

    let frame = 0, rafId = 0;
    const t0 = performance.now();

    // ── Sun rays (static geometry, updated each frame) ──
    const RAY_COUNT = 12;
    const sunRayAngles  = Array.from({ length: RAY_COUNT }, (_, i) => Math.PI * 0.55 + i * (Math.PI * 0.40 / (RAY_COUNT - 1)));
    const sunRayLengths = Array.from({ length: RAY_COUNT }, (_, i) => i % 2 === 0 ? rnd(120, 280) : rnd(60, 140));

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw);
      frame++;
      const t  = (now - t0) / 1000;
      const W  = cssWRef.current;
      const H  = cssHRef.current;
      if (W <= 0 || H <= 0) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cond  = condRef.current;
      const trans = transRef.current;

      // Advance transition
      if (trans.active) {
        trans.progress = Math.min(1, trans.progress + 1 / 120);
        if (trans.progress >= 1) trans.active = false;
      }

      // Rebuild snow accumulation array if width changed
      if (snowAccum.width !== W) {
        snowAccum = { heights: new Float32Array(Math.ceil(W / 4)), width: W };
      }

      // ── SPAWN particles ──────────────────────────────────────────────────
      const heavy = cond === "thunder";
      if (cond === "rain" || heavy) {
        while (rainDrops.length < 110) rainDrops.push(makeRainDrop(W, H, heavy));
      }
      if (cond === "snow") {
        while (snowFlakes.length < 55) snowFlakes.push(makeSnowFlake(W, H));
      }
      if (cond === "sunny") {
        while (sunMotes.length < 35) sunMotes.push(makeSunMote());
      }
      if (cond === "windy") {
        for (let s = 0; s < 3 && windStreaks.length < 80; s++) windStreaks.push(makeWindStreak(W, H));
      }

      // Thunder bolt scheduling
      if (cond === "thunder" && now >= nextBoltTime && !bolt) {
        bolt  = generateBolt(W, H);
        flash = { spawnTime: now, duration: rnd(60, 90), intensity: rnd(0.12, 0.28) };
        nextBoltTime = now + rnd(3000, 6000);
      }

      // ── DRAW ─────────────────────────────────────────────────────────────

      // 1. Background
      drawBg(ctx, cond, W, H);

      // 2. Atmosphere / Layer A
      if (cond === "sunny") drawSunRays(ctx, W, H, t, sunRayAngles, sunRayLengths);
      if (cond === "cloudy" || cond === "thunder" || cond === "rain") drawClouds(ctx, clouds, W);
      if (cond === "fog")   drawFog(ctx, fogBands, W, t);
      if (cond === "rain" || cond === "thunder") drawWetGround(ctx, W, H);
      if (cond === "snow")  drawSnowAccum(ctx, snowAccum, W, H);

      // 3. Particles / Layer B
      if (cond === "rain" || cond === "thunder") updateDrawRain(ctx, rainDrops, W, H, heavy);
      if (cond === "snow")  updateDrawSnow(ctx, snowFlakes, snowAccum, W, H);
      if (cond === "sunny") updateDrawMotes(ctx, sunMotes, W, H, t);
      if (cond === "windy") updateDrawWind(ctx, windStreaks, W, H);

      // 4. Special FX
      if (cond === "thunder") {
        if (flash) drawFlash(ctx, flash, W, H, now);
        if (bolt)  drawBolt(ctx, bolt, now);
        if (bolt  && now - bolt.spawnTime  > bolt.duration)  bolt  = null;
        if (flash && now - flash.spawnTime > flash.duration) flash = null;
        // Splash ripples also appear in thunder
        updateDrawRipples(ctx, splashRipples, W, H, now);
      }
      if (cond === "rain") {
        updateDrawRipples(ctx, splashRipples, W, H, now);
        // Spawn new ripples occasionally
        if (frame % 7 === 0 && splashRipples.length < 8) {
          splashRipples.push({ x: rnd(W*0.1, W*0.9), y: H * rnd(0.88, 0.98), r: 1, maxR: rnd(5, 10), age: 0, maxAge: 18 });
        }
      }

      // 5. Transition crossfade — fade out previous condition's atmosphere
      if (trans.active && trans.from) {
        ctx.globalAlpha = Math.max(0, 1 - trans.progress);
        drawBg(ctx, trans.from, W, H);
        ctx.globalAlpha = 1;
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    />
  );
}

// ── Draw helpers ──────────────────────────────────────────────────────────────

function drawSunRays(
  ctx: CanvasRenderingContext2D, W: number, H: number, t: number,
  angles: number[], lengths: number[],
) {
  const ox = W * 0.88, oy = H * 0.06;
  for (let i = 0; i < angles.length; i++) {
    const a   = angles[i] + Math.sin(t * 0.4 + i * 0.3) * 0.012;
    const len = lengths[i];
    const alp = 0.045 + 0.018 * Math.sin(t * 1.8 + i * 0.5);
    const hw  = 0.018; // half-angle of ray triangle
    const lx  = ox + Math.cos(a - hw) * 8, ly  = oy + Math.sin(a - hw) * 8;
    const rx  = ox + Math.cos(a + hw) * 8, ry  = oy + Math.sin(a + hw) * 8;
    const tipX = ox + Math.cos(a) * len, tipY = oy + Math.sin(a) * len;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(rx, ry);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,175,55,${alp.toFixed(3)})`;
    ctx.fill();
  }
}

function drawClouds(ctx: CanvasRenderingContext2D, clouds: CloudBlob[], W: number) {
  for (const c of clouds) {
    c.x += c.vx;
    if (c.x > W + 220) c.x = -220;
    for (let i = 0; i < c.radii.length; i++) {
      const [dx, dy] = c.offsets[i];
      ctx.beginPath();
      ctx.arc(c.x + dx, c.y + dy, c.radii[i], 0, Math.PI * 2);
      ctx.fillStyle = `rgba(55,65,85,${c.alpha.toFixed(3)})`;
      ctx.fill();
    }
  }
}

function drawFog(ctx: CanvasRenderingContext2D, bands: FogBand[], W: number, t: number) {
  for (const b of bands) {
    b.phase += b.speed * 0.015;
    const step = 4;
    ctx.beginPath();
    ctx.moveTo(0, b.y);
    for (let x = 0; x <= W + step; x += step) {
      const wave = Math.sin(x * b.frequency + b.phase) * b.amplitude + Math.sin(t * 0.3 + x * 0.003) * b.amplitude * 0.3;
      ctx.lineTo(x, b.y + wave - b.thickness * 0.5);
    }
    for (let x = W + step; x >= 0; x -= step) {
      const wave = Math.sin(x * b.frequency + b.phase) * b.amplitude + Math.sin(t * 0.3 + x * 0.003) * b.amplitude * 0.3;
      ctx.lineTo(x, b.y + wave + b.thickness * 0.5);
    }
    ctx.closePath();
    const alpha = b.alpha * (0.85 + 0.15 * Math.sin(t * 0.6 + b.phase));
    ctx.fillStyle = `rgba(140,150,165,${alpha.toFixed(3)})`;
    ctx.fill();
  }
}

function drawWetGround(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const strip = H * 0.12;
  try {
    const g = ctx.createLinearGradient(0, H - strip, 0, H);
    g.addColorStop(0, "rgba(20,60,120,0.10)");
    g.addColorStop(1, "rgba(10,30,60,0.04)");
    ctx.fillStyle = g;
    ctx.fillRect(0, H - strip, W, strip);
  } catch { /* skip */ }
}

function drawSnowAccum(ctx: CanvasRenderingContext2D, accum: SnowAccum, W: number, H: number) {
  const bucketSize = 4;
  const count = accum.heights.length;
  if (count === 0) return;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let i = 0; i < count; i++) {
    ctx.lineTo(i * bucketSize, H - accum.heights[i]);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  try {
    const g = ctx.createLinearGradient(0, H - 60, 0, H);
    g.addColorStop(0, "rgba(210,225,255,0.55)");
    g.addColorStop(1, "rgba(180,200,240,0.22)");
    ctx.fillStyle = g;
  } catch {
    ctx.fillStyle = "rgba(200,220,255,0.35)";
  }
  ctx.fill();
}

function updateDrawRain(ctx: CanvasRenderingContext2D, drops: RainDrop[], W: number, H: number, heavy: boolean) {
  ctx.lineCap = "round";
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.x += d.vx; d.y += d.vy;
    if (d.y > H + 20) {
      drops.splice(i, 1);
      drops.push(makeRainDrop(W, H, heavy));
      continue;
    }
    ctx.strokeStyle = `rgba(140,180,220,${d.alpha.toFixed(2)})`;
    ctx.lineWidth   = d.width;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + d.vx * 0.55, d.y - d.length);
    ctx.stroke();
  }
}

function updateDrawSnow(ctx: CanvasRenderingContext2D, flakes: SnowFlake[], accum: SnowAccum, W: number, H: number) {
  const bucketSize = 4;
  for (let i = flakes.length - 1; i >= 0; i--) {
    const f = flakes[i];
    f.wobblePhase += f.wobbleFreq;
    f.x += Math.sin(f.wobblePhase) * f.wobble * 0.05;
    f.y += f.vy;

    // Accumulation check
    const bucket = Math.floor(f.x / bucketSize);
    if (bucket >= 0 && bucket < accum.heights.length) {
      const groundY = H - accum.heights[bucket];
      if (f.y + f.radius >= groundY) {
        accum.heights[bucket] = Math.min(H * 0.14, accum.heights[bucket] + f.radius * 0.45);
        flakes.splice(i, 1);
        flakes.push(makeSnowFlake(W, H));
        continue;
      }
    }
    if (f.y > H + 10) {
      flakes.splice(i, 1);
      flakes.push(makeSnowFlake(W, H));
      continue;
    }
    ctx.fillStyle = `rgba(210,230,255,${f.alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateDrawMotes(ctx: CanvasRenderingContext2D, motes: SunMote[], W: number, H: number, t: number) {
  const ox = W * 0.88, oy = H * 0.06;
  for (const m of motes) {
    m.angle += m.orbitSpeed;
    const x   = ox + Math.cos(m.angle) * m.orbitR;
    const y   = oy + Math.sin(m.angle) * m.orbitR * 0.55;
    const alp = m.alpha * (0.7 + 0.3 * Math.sin(t * 2.5 + m.alphaPhase));
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    ctx.fillStyle = `rgba(255,195,70,${alp.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, m.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateDrawWind(ctx: CanvasRenderingContext2D, streaks: WindStreak[], W: number, _H: number) {
  ctx.lineCap = "round";
  for (let i = streaks.length - 1; i >= 0; i--) {
    const s = streaks[i];
    s.x  += s.vx;
    s.y  += s.vy;
    s.age++;
    if (s.x > W + s.length) {
      streaks.splice(i, 1);
      continue;
    }
    const fadeIn  = s.age < 10 ? s.age / 10 : 1;
    const fadeOut = s.age > s.maxAge - 10 ? (s.maxAge - s.age) / 10 : 1;
    const alp     = s.alpha * Math.min(fadeIn, fadeOut);
    ctx.strokeStyle = `rgba(200,220,240,${alp.toFixed(2)})`;
    ctx.lineWidth   = s.width;
    ctx.beginPath();
    ctx.moveTo(s.x - s.length, s.y);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
  }
}

function updateDrawRipples(ctx: CanvasRenderingContext2D, ripples: SplashRipple[], _W: number, _H: number, now: number) {
  void now;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.r = r.maxR * (r.age / r.maxAge);
    r.age++;
    if (r.age >= r.maxAge) { ripples.splice(i, 1); continue; }
    const alpha = (1 - r.age / r.maxAge) * 0.08;
    ctx.strokeStyle = `rgba(100,160,220,${alpha.toFixed(3)})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.r, r.r * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawFlash(ctx: CanvasRenderingContext2D, flash: ThunderFlash, W: number, H: number, now: number) {
  const age = (now - flash.spawnTime) / flash.duration;
  if (age >= 1) return;
  ctx.fillStyle = `rgba(200,210,255,${(flash.intensity * (1 - age)).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
}

function drawBolt(ctx: CanvasRenderingContext2D, bolt: LightningBolt, now: number) {
  const age = (now - bolt.spawnTime) / bolt.duration;
  if (age >= 1) return;
  const flicker     = 0.7 + 0.3 * Math.sin(age * Math.PI * 14);
  const alpha       = (1 - age) * flicker;
  const strokeWidth = 2.5 * (1 - age * 0.4);

  const drawPath = (pts: [number, number][], w: number, color: string) => {
    if (pts.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth   = w;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };

  // Halo (glow substitute — wide semi-transparent stroke, no shadowBlur)
  drawPath(bolt.segments, strokeWidth * 6, `rgba(130,150,255,${(alpha * 0.18).toFixed(3)})`);
  // Core trunk
  drawPath(bolt.segments, strokeWidth,     `rgba(210,225,255,${(alpha * 0.92).toFixed(3)})`);
  // Branches
  for (const b of bolt.branches) {
    drawPath(b, strokeWidth * 0.45, `rgba(180,200,255,${(alpha * 0.55).toFixed(3)})`);
  }
}
