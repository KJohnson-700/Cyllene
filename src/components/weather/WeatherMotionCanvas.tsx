import { useEffect, useRef } from "react";
import type { WeatherScene } from "@/hooks/useWeather";
import type { DeviceOrientationState } from "@/hooks/useTelegramSensors";

interface Props {
  scene: WeatherScene | null;
  orientation?: DeviceOrientationState;
  pulse?: boolean;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  size: number;
}

const MAX_DPR = 2;
const BASE_PARTICLES = 320;

function createParticle(w: number, h: number, intensity: number): Particle {
  const z = 0.2 + Math.random() * 0.95;
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    z,
    vx: 0,
    vy: 0,
    life: 0,
    ttl: 1 + Math.random() * 4,
    size: 0.6 + Math.random() * (1.8 + intensity * 2.2),
  };
}

export function WeatherMotionCanvas({ scene, orientation, pulse = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<WeatherScene | null>(scene);
  const orientationRef = useRef<DeviceOrientationState | undefined>(orientation);
  const pulseRef = useRef(pulse);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);
  useEffect(() => {
    orientationRef.current = orientation;
  }, [orientation]);
  useEffect(() => {
    pulseRef.current = pulse;
  }, [pulse]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const root = canvas.parentElement;
    if (!root) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const canvasEl: HTMLCanvasElement = canvas;
    const rootEl: HTMLElement = root;
    const ctx2: CanvasRenderingContext2D = ctx;

    let raf = 0;
    let particles: Particle[] = [];
    let lastTs = performance.now();
    let width = 0;
    let height = 0;
    let flash = 0;
    // Some embedded webviews report non-"visible" states unexpectedly.
    // Only hard-pause on explicit hidden.
    let paused = document.visibilityState === "hidden";
    const reduced = typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

    function resize() {
      const rect = rootEl.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      canvasEl.width = Math.round(width * dpr);
      canvasEl.height = Math.round(height * dpr);
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${height}px`;
      ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = [];
    }

    function ensureParticles(target: number, intensity: number) {
      while (particles.length < target) particles.push(createParticle(width, height, intensity));
      if (particles.length > target) particles.length = target;
    }

    function drawParticle(p: Particle, s: WeatherScene, dt: number, parallaxX: number, parallaxY: number) {
      const windX = Math.sin((s.windFromDeg * Math.PI) / 180);
      const windY = Math.cos((s.windFromDeg * Math.PI) / 180);
      const amp = 0.8 + s.intensity * 2.6;
      const pulseBoost = pulseRef.current ? 1.18 : 1;

      if (s.condition === "rain" || s.condition === "thunder") {
        p.vx = (windX * 110 + 8 * p.z) * amp * pulseBoost;
        p.vy = (240 + p.z * 250 + windY * 16) * amp * pulseBoost;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const len = (6 + 14 * p.z) * (0.7 + s.intensity);
        ctx2.strokeStyle = `rgba(168, 220, 255, ${0.16 + p.z * 0.32})`;
        ctx2.lineWidth = 0.7 + p.z * 1.1;
        ctx2.beginPath();
        ctx2.moveTo(p.x + parallaxX, p.y + parallaxY);
        ctx2.lineTo(p.x - p.vx * 0.022 + parallaxX, p.y - len + parallaxY);
        ctx2.stroke();
      } else if (s.condition === "snow") {
        p.vx = (windX * 30 + Math.sin(p.life * 1.8 + p.z * 6) * 18) * amp;
        p.vy = (24 + p.z * 48) * amp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt;
        ctx2.fillStyle = `rgba(245, 250, 255, ${0.2 + p.z * 0.64})`;
        ctx2.beginPath();
        ctx2.arc(p.x + parallaxX, p.y + parallaxY, p.size, 0, Math.PI * 2);
        ctx2.fill();
      } else if (s.condition === "fog") {
        p.vx = (windX * 8 + Math.sin((p.life + p.z) * 0.8) * 4) * (0.35 + s.intensity);
        p.vy = 4 + Math.sin(p.life * 0.7 + p.z * 4) * 2;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt;
        const radius = (12 + p.z * 28) * (0.75 + s.intensity * 0.25);
        const g = ctx2.createRadialGradient(
          p.x + parallaxX,
          p.y + parallaxY,
          0,
          p.x + parallaxX,
          p.y + parallaxY,
          radius
        );
        g.addColorStop(0, `rgba(205, 220, 240, ${0.14 + p.z * 0.14})`);
        g.addColorStop(1, "rgba(200, 210, 230, 0)");
        ctx2.fillStyle = g;
        ctx2.beginPath();
        ctx2.arc(p.x + parallaxX, p.y + parallaxY, radius, 0, Math.PI * 2);
        ctx2.fill();
      } else if (s.condition === "cloudy") {
        p.vx = (windX * 20 + Math.sin((p.life + p.z) * 1.2) * 12) * (0.5 + s.intensity * 0.3);
        p.vy = (10 + Math.cos(p.life * 0.9 + p.z * 5) * 5) * 0.65;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt;
        ctx2.strokeStyle = `rgba(198, 214, 235, ${0.08 + p.z * 0.16})`;
        ctx2.lineWidth = 0.7 + p.z * 1.3;
        ctx2.beginPath();
        ctx2.moveTo(p.x + parallaxX, p.y + parallaxY);
        ctx2.lineTo(p.x - (10 + p.z * 18) + parallaxX, p.y + Math.sin(p.life * 1.6) * 2 + parallaxY);
        ctx2.stroke();
      } else if (s.condition === "windy") {
        p.vx = (90 + p.z * 180 + windX * 120) * (0.6 + s.intensity);
        p.vy = Math.sin((p.life + p.z) * 4) * 20 + windY * 8;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt;
        ctx2.strokeStyle = `rgba(168, 255, 220, ${0.12 + p.z * 0.2})`;
        ctx2.lineWidth = 0.6 + p.z;
        ctx2.beginPath();
        ctx2.moveTo(p.x + parallaxX, p.y + parallaxY);
        ctx2.lineTo(p.x - (14 + p.z * 20) + parallaxX, p.y - p.vy * 0.09 + parallaxY);
        ctx2.stroke();
      } else {
        // Sunny + clear/night ambiance
        const drift = s.dayPhase === "night" ? 1.3 : 0.9;
        p.vx = Math.sin(p.life * 1.9 + p.z * 6) * 6 * drift;
        p.vy = -6 - p.z * 18;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt;
        const hue = s.dayPhase === "night" ? "190, 220, 255" : "255, 236, 170";
        ctx2.fillStyle = `rgba(${hue}, ${0.16 + p.z * 0.46})`;
        ctx2.beginPath();
        ctx2.arc(p.x + parallaxX, p.y + parallaxY, p.size * (s.dayPhase === "night" ? 1.15 : 0.9), 0, Math.PI * 2);
        ctx2.fill();
      }

      if (p.x < -160 || p.x > width + 160 || p.y < -160 || p.y > height + 160 || p.life > p.ttl) {
        p.x = Math.random() * width;
        p.y = -30 - Math.random() * height * 0.3;
        p.z = 0.2 + Math.random() * 0.95;
        p.life = 0;
        p.ttl = 2 + Math.random() * 5;
        p.size = 0.6 + Math.random() * (1.6 + s.intensity * 2);
      }
    }

    function loop(ts: number) {
      const dt = Math.min(0.033, (ts - lastTs) / 1000);
      lastTs = ts;

      const s = sceneRef.current;
      if (!s || paused || reduced?.matches) {
        ctx2.clearRect(0, 0, width, height);
        raf = requestAnimationFrame(loop);
        return;
      }

      const o = orientationRef.current;
      const parallaxX = o?.supported ? Math.max(-12, Math.min(12, o.gamma * 0.18)) : 0;
      const parallaxY = o?.supported ? Math.max(-10, Math.min(10, o.beta * 0.12)) : 0;
      const density = s.condition === "fog" ? 0.46 : s.condition === "cloudy" ? 0.64 : 1;
      const target = Math.round(BASE_PARTICLES * density * (0.45 + s.intensity * 0.95));
      ensureParticles(target, s.intensity);

      ctx2.clearRect(0, 0, width, height);

      if (s.condition === "thunder" && Math.random() < dt * (0.35 + s.intensity * 0.6)) {
        flash = 0.18 + s.intensity * 0.24;
      }
      flash = Math.max(0, flash - dt * 0.9);

      for (const p of particles) drawParticle(p, s, dt, parallaxX, parallaxY);

      if (flash > 0) {
        ctx2.fillStyle = `rgba(210, 230, 255, ${flash})`;
        ctx2.fillRect(0, 0, width, height);
      }

      raf = requestAnimationFrame(loop);
    }

    let ro: ResizeObserver | null = null;
    const onWindowResize = () => resize();
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => resize());
      ro.observe(rootEl);
    } else {
      window.addEventListener("resize", onWindowResize);
    }
    resize();
    raf = requestAnimationFrame(loop);

    const onVisibility = () => {
      paused = document.visibilityState === "hidden";
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onReducedMotion = () => {
      // no-op; loop checks reduced.matches every frame
    };
    reduced?.addEventListener?.("change", onReducedMotion);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", onWindowResize);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced?.removeEventListener?.("change", onReducedMotion);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="cyllene-atmo__canvas absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden
    />
  );
}

