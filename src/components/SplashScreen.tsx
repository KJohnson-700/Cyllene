import { useEffect, useRef, useState } from "react";

interface Props {
  onDone: () => void;
}

export function SplashScreen({ onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  // Trigger fade-out after hold
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 400);
    const t2 = setTimeout(() => setPhase("out"), 2200);
    const t3 = setTimeout(() => onDone(), 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  // Particle canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let frame = 0;
    let raf: number;

    const W = canvas.width = window.innerWidth;
    const H = canvas.height = window.innerHeight;

    // Stars / embers
    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.5 + Math.random() * 1.5,
      speed: 0.1 + Math.random() * 0.3,
      drift: (Math.random() - 0.5) * 0.2,
      opacity: 0.2 + Math.random() * 0.6,
      gold: Math.random() > 0.5,
    }));

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Background gradient — dark mountain sky
      const bg = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.8);
      bg.addColorStop(0, "#1a1200");
      bg.addColorStop(0.5, "#0d0a00");
      bg.addColorStop(1, "#050503");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Mountain silhouette
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, H * 0.72);
      ctx.lineTo(W * 0.12, H * 0.55);
      ctx.lineTo(W * 0.22, H * 0.65);
      ctx.lineTo(W * 0.35, H * 0.42);   // peak left
      ctx.lineTo(W * 0.5, H * 0.58);
      ctx.lineTo(W * 0.62, H * 0.38);   // peak centre (Cyllene)
      ctx.lineTo(W * 0.75, H * 0.52);
      ctx.lineTo(W * 0.85, H * 0.44);   // peak right
      ctx.lineTo(W, H * 0.62);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = "#080600";
      ctx.fill();

      // Mountain ridge glow
      const ridge = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.65);
      ridge.addColorStop(0, "rgba(200,150,12,0.12)");
      ridge.addColorStop(1, "rgba(200,150,12,0)");
      ctx.fillStyle = ridge;
      ctx.fill();

      // Ambient golden glow behind peak
      const glow = ctx.createRadialGradient(W * 0.62, H * 0.38, 0, W * 0.62, H * 0.38, W * 0.35);
      glow.addColorStop(0, `rgba(255,200,50,${0.06 + 0.03 * Math.sin(frame * 0.02)})`);
      glow.addColorStop(1, "rgba(255,200,50,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Particles
      for (const p of particles) {
        p.y -= p.speed;
        p.x += p.drift;
        if (p.y < 0) { p.y = H; p.x = Math.random() * W; }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.gold
          ? `rgba(255,200,60,${p.opacity * (0.7 + 0.3 * Math.sin(frame * 0.03 + p.x))})`
          : `rgba(255,255,255,${p.opacity * 0.4})`;
        ctx.fill();
      }

      frame++;
      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{
        opacity: phase === "in" ? 0 : phase === "hold" ? 1 : 0,
        transition: phase === "in"
          ? "opacity 0.6s ease-out"
          : phase === "out"
          ? "opacity 0.7s ease-in"
          : "none",
        background: "#050503",
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-5 select-none">

        {/* Caduceus SVG */}
        <svg width="52" height="72" viewBox="0 0 52 72" fill="none" xmlns="http://www.w3.org/2000/svg"
          style={{ filter: "drop-shadow(0 0 12px rgba(200,150,12,0.7))" }}>
          {/* Staff */}
          <line x1="26" y1="4" x2="26" y2="68" stroke="#c8960c" strokeWidth="2.5" strokeLinecap="round"/>
          {/* Wings */}
          <path d="M26 14 C16 8, 4 10, 2 18 C8 16, 16 18, 26 22" fill="#c8960c" opacity="0.9"/>
          <path d="M26 14 C36 8, 48 10, 50 18 C44 16, 36 18, 26 22" fill="#c8960c" opacity="0.9"/>
          {/* Snakes */}
          <path d="M26 24 C20 28, 32 34, 26 40 C20 46, 32 52, 26 58"
            stroke="#ffd700" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
          <path d="M26 24 C32 28, 20 34, 26 40 C32 46, 20 52, 26 58"
            stroke="#c8960c" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
          {/* Top orb */}
          <circle cx="26" cy="8" r="4" fill="#ffd700" opacity="0.9"/>
        </svg>

        {/* Name */}
        <div className="flex flex-col items-center gap-1">
          <h1
            className="text-5xl tracking-[0.25em] uppercase font-light"
            style={{
              color: "#ffd700",
              fontFamily: "'Georgia', 'Times New Roman', serif",
              textShadow: "0 0 30px rgba(200,150,12,0.6), 0 0 60px rgba(200,150,12,0.3)",
              letterSpacing: "0.3em",
            }}
          >
            Cyllene
          </h1>
          <p
            className="text-[11px] tracking-[0.4em] uppercase"
            style={{ color: "rgba(200,150,12,0.5)", letterSpacing: "0.4em" }}
          >
            birthplace of hermes
          </p>
        </div>

        {/* Pulse line */}
        <div className="flex items-center gap-2 mt-2">
          <div className="h-px w-12" style={{ background: "linear-gradient(90deg, transparent, rgba(200,150,12,0.4))" }} />
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: "#ffd700",
              boxShadow: "0 0 8px #ffd700",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          <div className="h-px w-12" style={{ background: "linear-gradient(90deg, rgba(200,150,12,0.4), transparent)" }} />
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
