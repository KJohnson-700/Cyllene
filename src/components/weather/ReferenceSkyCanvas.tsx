/**
 * 2D sky stage ported from HERMES Mini App.html `WeatherCanvas` — sun/moon, clouds,
 * rain, lightning, snow, wind streaks, fog + city silhouette. Driven by live
 * `ReferenceSkyCondition` + day/night from Open-Meteo scene data.
 */

import { useEffect, useRef } from "react";
import type { ReferenceSkyCondition } from "@/lib/referenceSkyCondition";

interface Props {
  condition: ReferenceSkyCondition;
  isDay: boolean;
}

const MAX_DPR = 2;

function clampf(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

type RainDrop = { x: number; y: number; speed: number; len: number };
type SnowFlake = {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  phase: number;
};
type WindLine = { y: number; x: number; speed: number; len: number; alpha: number };
type FogBand = { y: number; x: number; speed: number; alpha: number; h: number };
type LightningPt = { x: number; y: number };

export function ReferenceSkyCanvas({ condition, isDay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ condition, isDay, frame: 0 });
  stateRef.current = { ...stateRef.current, condition, isDay };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("2d");
    if (!gl) return;
    const ctx: CanvasRenderingContext2D = gl;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    let rainDrops: RainDrop[] = [];
    let snowFlakes: SnowFlake[] = [];
    let windLines: WindLine[] = [];
    let fogBands: FogBand[] = [];

    function initRain(W: number, H: number, count = 80) {
      rainDrops = Array.from({ length: count }, () => ({
        x: Math.random() * W * 1.4 - W * 0.2,
        y: Math.random() * H,
        speed: 8 + Math.random() * 6,
        len: 12 + Math.random() * 18,
      }));
    }
    function initSnow(W: number, H: number, count = 60) {
      snowFlakes = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 2 + Math.random() * 4,
        speed: 0.5 + Math.random() * 1.2,
        drift: Math.random() * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
      }));
    }
    function initWind(_W: number, H: number) {
      windLines = Array.from({ length: 14 }, (_, i) => ({
        y: H * (0.2 + i * 0.055),
        x: -80,
        speed: 3 + Math.random() * 4,
        len: 40 + Math.random() * 80,
        alpha: 0.1 + Math.random() * 0.22,
      }));
    }
    function initFog(_W: number, H: number) {
      fogBands = Array.from({ length: 6 }, (_, i) => ({
        y: H * (0.35 + i * 0.11),
        x: 0,
        speed: 0.3 + Math.random() * 0.5,
        alpha: 0.06 + Math.random() * 0.09,
        h: H * 0.09,
      }));
    }

    let raf = 0;
    let f = 0;
    let lastCond: ReferenceSkyCondition | "" = "";
    let lastW = 0;
    let lastH = 0;
    let lightningTimer = 0;
    let lightningOn = false;
    let lightningBolt: LightningPt[] = [];
    let lightningThreshold = 140;
    const reduced = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

    function genLightning(W: number, H: number): LightningPt[] {
      const pts: LightningPt[] = [{ x: W * 0.35 + Math.random() * W * 0.3, y: H * 0.05 }];
      let cx = pts[0].x;
      let cy = pts[0].y;
      while (cy < H * 0.75) {
        cx += (Math.random() - 0.5) * W * 0.18;
        cy += H * 0.08 + Math.random() * H * 0.06;
        pts.push({ x: clampf(cx, W * 0.1, W * 0.9), y: cy });
      }
      return pts;
    }

    function drawCloud(
      ch: number,
      cx: number,
      cy: number,
      scale: number,
      alpha: number,
      col = "rgba(80,100,130,"
    ) {
      ctx.globalAlpha = alpha;
      const pts: [number, number, number][] = [
        [0, 0, 1],
        [-0.5, -0.1, 0.65],
        [0.5, -0.05, 0.75],
        [-0.25, -0.2, 0.55],
        [0.25, -0.22, 0.6],
      ];
      for (const [ox, oy, sz] of pts) {
        ctx.fillStyle = `${col}1)`;
        ctx.beginPath();
        ctx.arc(cx + ox * ch * 0.22 * scale, cy + oy * ch * 0.12 * scale, ch * 0.085 * sz * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawMoon(mx: number, my: number, mr: number) {
      const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr);
      mg.addColorStop(0, "#e8e4d0");
      mg.addColorStop(0.7, "#c4bea0");
      mg.addColorStop(1, "#8a8470");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.arc(mx + mr * 0.3, my - mr * 0.05, mr * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    const draw = () => {
      if (reduced?.matches) {
        const r = canvas.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          ctx.fillStyle = "#07101a";
          ctx.fillRect(0, 0, r.width, r.height);
        }
        return;
      }
      raf = requestAnimationFrame(draw);

      f++;
      const { condition: cond, isDay: day } = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      if (W <= 0 || H <= 0) return;

      if (cond !== lastCond || W !== lastW || H !== lastH) {
        lastCond = cond;
        lastW = W;
        lastH = H;
        initRain(W, H);
        initSnow(W, H);
        initWind(W, H);
        initFog(W, H);
        lightningThreshold = 80 + Math.floor(Math.random() * 120);
      }

      const sky = ctx.createLinearGradient(0, 0, 0, H);
      if (day) {
        if (cond === "SUNNY") {
          sky.addColorStop(0, "#0a1a3a");
          sky.addColorStop(1, "#1a3a6a");
        } else if (cond === "STORMY") {
          sky.addColorStop(0, "#060810");
          sky.addColorStop(1, "#0e1220");
        } else {
          sky.addColorStop(0, "#0a1224");
          sky.addColorStop(1, "#14283c");
        }
      } else {
        sky.addColorStop(0, "#030508");
        sky.addColorStop(1, "#07101a");
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      if (!day) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        for (let s = 0; s < 40; s++) {
          const sx = ((s * 317 + f * 0.02) % 1) * W;
          const sy = ((s * 211) % 1) * H * 0.55;
          const sa = 0.4 + 0.4 * Math.sin(f * 0.03 + s);
          ctx.globalAlpha = sa;
          ctx.beginPath();
          ctx.arc(sx, sy, s % 3 === 0 ? 0.8 : 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (cond === "SUNNY") {
        const sx = W * 0.5;
        const sy = H * 0.35;
        const cp = 0.7 + 0.3 * Math.sin(f * 0.04);
        const cg = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.42);
        cg.addColorStop(0, `rgba(255,210,40,${0.18 * cp})`);
        cg.addColorStop(0.5, `rgba(255,165,0,${0.06 * cp})`);
        cg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = cg;
        ctx.fillRect(0, 0, W, H);
        for (let ri = 0; ri < 12; ri++) {
          const ang = (ri / 12) * Math.PI * 2 + f * 0.008;
          const r1 = H * 0.14;
          const r2 = H * 0.26 + H * 0.03 * Math.sin(f * 0.05 + ri);
          ctx.strokeStyle = `rgba(255,220,60,${0.18 + 0.07 * Math.sin(f * 0.04 + ri)})`;
          ctx.lineWidth = 2 + Math.sin(f * 0.06 + ri) * 1.5;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(ang) * r1, sy + Math.sin(ang) * r1);
          ctx.lineTo(sx + Math.cos(ang) * r2, sy + Math.sin(ang) * r2);
          ctx.stroke();
        }
        const sg = ctx.createRadialGradient(sx - H * 0.04, sy - H * 0.04, 0, sx, sy, H * 0.12);
        sg.addColorStop(0, "#fff5a0");
        sg.addColorStop(0.5, "#ffd620");
        sg.addColorStop(1, "#ff9900");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(sx, sy, H * 0.115, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,220,80,.3)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (!day && (cond === "SUNNY" || cond === "PARTLY_CLOUDY" || cond === "CLOUDY")) {
        drawMoon(W * 0.5, H * 0.32, H * 0.1);
      }
      if (!day && cond === "SUNNY") {
        const mg = ctx.createRadialGradient(W * 0.5, H * 0.32, 0, W * 0.5, H * 0.32, H * 0.35);
        mg.addColorStop(0, "rgba(200,190,140,.12)");
        mg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = mg;
        ctx.fillRect(0, 0, W, H);
      }

      if (cond === "PARTLY_CLOUDY") {
        if (day) {
          const sx2 = W * 0.38;
          const sy2 = H * 0.3;
          const sg2 = ctx.createRadialGradient(sx2, sy2, 0, sx2, sy2, H * 0.1);
          sg2.addColorStop(0, "#fff5a0");
          sg2.addColorStop(0.5, "#ffd620");
          sg2.addColorStop(1, "#ff9900");
          ctx.fillStyle = sg2;
          ctx.beginPath();
          ctx.arc(sx2, sy2, H * 0.09, 0, Math.PI * 2);
          ctx.fill();
        } else {
          drawMoon(W * 0.38, H * 0.3, H * 0.08);
        }
        const drift = Math.sin(f * 0.006) * W * 0.015;
        drawCloud(H, W * 0.58 + drift, H * 0.36, 1.1, 0.82);
      }

      if (cond === "CLOUDY") {
        const d1 = Math.sin(f * 0.005) * W * 0.02;
        const d2 = Math.cos(f * 0.007) * W * 0.015;
        drawCloud(H, W * 0.3 + d1, H * 0.28, 0.9, 0.75);
        drawCloud(H, W * 0.62 + d2, H * 0.32, 1.1, 0.85);
        drawCloud(H, W * 0.5 + d1 * 0.5, H * 0.24, 0.75, 0.65);
      }

      if (cond === "RAINY" || cond === "STORMY") {
        const d1 = Math.sin(f * 0.005) * W * 0.01;
        drawCloud(H, W * 0.3 + d1, H * 0.18, 0.9, 0.9, "rgba(50,55,80,");
        drawCloud(H, W * 0.6 + d1 * 0.5, H * 0.15, 1.15, 0.95, "rgba(45,50,75,");
        drawCloud(H, W * 0.5, H * 0.2, 0.8, 0.85, "rgba(40,45,70,");
        ctx.strokeStyle = "rgba(120,170,220,0.6)";
        ctx.lineWidth = 1.2;
        for (const d of rainDrops) {
          d.y += d.speed;
          d.x -= d.speed * 0.25;
          if (d.y > H + 20) {
            d.y = -20;
            d.x = Math.random() * W * 1.4 - W * 0.2;
          }
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.len * 0.2, d.y - d.len);
          ctx.stroke();
        }
        if (cond === "STORMY") {
          lightningTimer++;
          if (!lightningOn && lightningTimer > lightningThreshold) {
            lightningTimer = 0;
            lightningOn = true;
            lightningBolt = genLightning(W, H);
            lightningThreshold = 80 + Math.floor(Math.random() * 120);
            window.setTimeout(() => {
              lightningOn = false;
            }, 120);
          }
          if (lightningOn && lightningBolt.length > 0) {
            ctx.globalAlpha = 0.8 + Math.random() * 0.2;
            ctx.fillStyle = `rgba(180,160,255,${0.12 + Math.random() * 0.1})`;
            ctx.fillRect(0, 0, W, H);
            ctx.strokeStyle = "rgba(220,200,255,0.9)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(lightningBolt[0].x, lightningBolt[0].y);
            for (const pt of lightningBolt.slice(1)) ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
            ctx.lineWidth = 6;
            ctx.strokeStyle = "rgba(220,200,255,0.2)";
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      if (cond === "SNOWY") {
        drawCloud(H, W * 0.5, H * 0.2, 1.0, 0.8, "rgba(100,115,135,");
        for (const s of snowFlakes) {
          s.y += s.speed;
          s.phase += 0.02;
          s.x += Math.sin(s.phase) * 0.5;
          if (s.y > H + 10) {
            s.y = -10;
            s.x = Math.random() * W;
          }
          const a = 0.5 + 0.3 * Math.sin(s.phase * 2);
          ctx.strokeStyle = `rgba(180,210,240,${a})`;
          ctx.lineWidth = 1.2;
          for (let ar = 0; ar < 6; ar++) {
            const ang = (ar * Math.PI) / 3;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x + Math.cos(ang) * s.r * 2.5, s.y + Math.sin(ang) * s.r * 2.5);
            ctx.stroke();
          }
          ctx.fillStyle = `rgba(200,225,248,${a})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (cond === "WINDY") {
        if (day) {
          const sg3 = ctx.createRadialGradient(W * 0.28, H * 0.28, 0, W * 0.28, H * 0.28, H * 0.09);
          sg3.addColorStop(0, "#fff5a0");
          sg3.addColorStop(0.5, "#ffd620");
          sg3.addColorStop(1, "#ff9900");
          ctx.fillStyle = sg3;
          ctx.beginPath();
          ctx.arc(W * 0.28, H * 0.28, H * 0.085, 0, Math.PI * 2);
          ctx.fill();
        } else {
          drawMoon(W * 0.28, H * 0.28, H * 0.07);
        }
        drawCloud(H, W * 0.58, H * 0.3, 1.0, 0.8);
        for (const wl of windLines) {
          wl.x += wl.speed;
          if (wl.x > W + 100) wl.x = -120;
          const yw = wl.y + Math.sin(f * 0.04 + wl.y * 0.02) * H * 0.01;
          ctx.strokeStyle = `rgba(120,200,180,${wl.alpha})`;
          ctx.lineWidth = 1.8;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(wl.x, yw);
          ctx.bezierCurveTo(
            wl.x + wl.len * 0.3,
            yw - 8,
            wl.x + wl.len * 0.7,
            yw + 5,
            wl.x + wl.len,
            yw - 3
          );
          ctx.stroke();
        }
      }

      if (cond === "FOGGY") {
        ctx.fillStyle = "rgba(20,28,36,0.9)";
        const blds: [number, number, number, number][] = [
          [0.1, 0.6, 0.12, 0.35],
          [0.2, 0.55, 0.09, 0.42],
          [0.28, 0.62, 0.14, 0.3],
          [0.38, 0.58, 0.08, 0.37],
          [0.44, 0.52, 0.1, 0.44],
          [0.52, 0.6, 0.12, 0.36],
          [0.6, 0.55, 0.08, 0.4],
          [0.66, 0.58, 0.13, 0.37],
          [0.76, 0.62, 0.1, 0.33],
          [0.82, 0.56, 0.09, 0.4],
          [0.88, 0.6, 0.11, 0.35],
        ];
        for (const [bx, by, bw, bh] of blds) {
          ctx.fillRect(bx * W, by * H, bw * W, bh * H);
          ctx.fillStyle = "rgba(255,200,80,.08)";
          for (let wr = 0; wr < 3; wr++)
            for (let wc = 0; wc < 2; wc++)
              ctx.fillRect((bx + 0.01 + wc * 0.03) * W, (by + 0.05 + wr * 0.08) * H, bw * 0.25 * W, bh * 0.12 * H);
          ctx.fillStyle = "rgba(20,28,36,0.9)";
        }
        for (const fb of fogBands) {
          fb.x += fb.speed;
          if (fb.x > W) fb.x = -W * 0.3;
          const fg2 = ctx.createLinearGradient(fb.x, 0, fb.x + W * 0.6, 0);
          fg2.addColorStop(0, "rgba(0,0,0,0)");
          fg2.addColorStop(0.3, `rgba(100,115,128,${fb.alpha})`);
          fg2.addColorStop(0.7, `rgba(110,125,138,${fb.alpha})`);
          fg2.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = fg2;
          ctx.beginPath();
          ctx.ellipse(fb.x + W * 0.3, fb.y, W * 0.5, fb.h, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 0.015;
      ctx.fillStyle = "#000";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1.1);
      ctx.globalAlpha = 1;
    };

    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ro.observe(canvas);
    {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 block h-full w-full pointer-events-none"
      aria-hidden
    />
  );
}
