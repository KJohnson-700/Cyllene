import { DragonAtmosphere } from "@/components/DragonAtmosphere";
import { CylleneHorizonScene } from "@/components/weather/CylleneHorizonScene";
import { ReferenceWeatherIcon } from "@/components/weather/ReferenceWeatherIcon";
import { useWeather, formatWeatherMetrics } from "@/hooks/useWeather";
import type { AgentState } from "@/hooks/useRunStream";
import { useTelegramOrientation } from "@/hooks/useTelegramSensors";
import { haptic } from "@/lib/telegram";
import {
  REFERENCE_SKY_ACCENT,
  referenceSkyFromDailyWeatherCode,
  referenceSkyLabel,
  weatherToReferenceSky,
} from "@/lib/referenceSkyCondition";
import { useEffect, useRef, useState } from "react";

interface Props {
  agentState: AgentState;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

export function DragonPage({ agentState: _agentState }: Props) {
  const weather = useWeather();
  const condition = weather?.condition ?? null;
  const scene = weather?.scene ?? null;
  const orientation = useTelegramOrientation();
  const [scenePulse, setScenePulse] = useState(false);
  const thunderHapticAtRef = useRef(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  function pulseScene() {
    setScenePulse(true);
    window.setTimeout(() => setScenePulse(false), 900);
  }

  useEffect(() => {
    if (!scene || scene.condition !== "thunder") return;
    const ts = Date.now();
    if (ts - thunderHapticAtRef.current < 5000) return;
    if (Math.random() < 0.22 + scene.intensity * 0.28) {
      haptic.notification("warning");
      thunderHapticAtRef.current = ts;
    }
  }, [scene]);

  const skyKey = weather ? weatherToReferenceSky(weather.condition, weather.scene) : null;
  const accent = skyKey ? REFERENCE_SKY_ACCENT[skyKey] : "#8aa0b8";
  const label = skyKey ? referenceSkyLabel(skyKey) : "Weather";
  const isDay = weather?.scene.isDay ?? true;
  const todayDow = DOW[now.getDay()];
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden" onPointerDown={pulseScene}>
      <DragonAtmosphere condition={condition} scene={scene} orientation={orientation} pulse={scenePulse} />

      <div className="relative z-10 flex flex-col flex-1 min-h-0 min-w-0 pointer-events-none">
        {/* Top HUD — HERMES Mini App.html WeatherPage strip */}
        <div className="content-safe-top px-3.5 pt-2.5 shrink-0 flex justify-between items-start gap-2">
          <div className="flex flex-col min-w-0">
            <span className="font-mono text-[15px] uppercase tracking-[0.12em] text-white/85 font-bold truncate">
              {todayDow}
            </span>
            <span className="font-mono text-[13px] text-white/45 tracking-[0.08em]">{timeStr}</span>
          </div>

          <div
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[10px] tracking-[0.1em]"
            style={{
              background: isDay ? "rgba(255,210,40,.12)" : "rgba(160,160,220,.10)",
              borderColor: isDay ? "rgba(255,210,40,.3)" : "rgba(160,160,220,.28)",
              color: isDay ? "rgba(255,210,100,.9)" : "rgba(180,180,240,.9)",
            }}
          >
            {isDay ? (
              <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="5" fill="#ffd620" />
                {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                  <line
                    key={a}
                    x1={12 + Math.cos((a * Math.PI) / 180) * 8}
                    y1={12 + Math.sin((a * Math.PI) / 180) * 8}
                    x2={12 + Math.cos((a * Math.PI) / 180) * 11}
                    y2={12 + Math.sin((a * Math.PI) / 180) * 11}
                    stroke="#ffd620"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                ))}
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                  fill="rgba(180,180,240,.9)"
                />
              </svg>
            )}
            {isDay ? "DAY" : "NIGHT"}
          </div>

          <div className="font-mono text-[13px] tracking-[0.08em] text-white/55 flex items-center gap-1 shrink-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            LOCAL
          </div>
        </div>

        <div className="flex-1 min-h-0 py-3 px-4 pointer-events-none">
          <div className="relative w-full h-full">
            <CylleneHorizonScene scene={scene} />
          </div>
        </div>

        {/* Current condition overlay — matches reference lower stack (no 7-day without API) */}
        {weather && skyKey ? (
          <>
            <div className="px-5 pb-1 shrink-0 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="font-mono text-[11px] uppercase tracking-[0.14em] mb-0.5"
                  style={{ color: accent }}
                >
                  {label}
                </div>
                <div
                  className="text-[56px] font-bold leading-none text-white/90 tracking-tight"
                  style={{ textShadow: `0 0 40px ${accent}44` }}
                >
                  {weather.temp}
                  <span className="text-2xl font-light text-white/50">°</span>
                </div>
                {weather.todayHi != null && weather.todayLo != null && (
                  <div className="font-mono text-[11px] text-white/35 tracking-[0.06em] mt-0.5">
                    HI {weather.todayHi}° · LO {weather.todayLo}°
                  </div>
                )}
                <div className="font-mono text-[11px] text-white/35 tracking-[0.06em] mt-0.5">
                  {formatWeatherMetrics(weather)}
                </div>
              </div>
              <div className="opacity-85 shrink-0 pb-1">
                <ReferenceWeatherIcon cond={skyKey} size={64} />
              </div>
            </div>

            {weather.daily.length > 0 && (
              <div
                className="relative z-[3] shrink-0 border-t border-white/[0.08] bg-black py-2 px-0 pointer-events-auto"
                role="region"
                aria-label="7-day forecast"
              >
                <div className="grid grid-cols-7 gap-0 min-w-0">
                  {weather.daily.map((fc) => {
                    const rowSky = referenceSkyFromDailyWeatherCode(fc.weatherCode, fc.windMphMax);
                    const fcAccent = REFERENCE_SKY_ACCENT[rowSky];
                    return (
                      <div
                        key={fc.date}
                        className={`flex flex-col items-center gap-1 py-1.5 px-0.5 min-w-0 ${
                          fc.isToday ? "bg-white/[0.06]" : ""
                        } relative border-r border-white/[0.05] last:border-r-0`}
                      >
                        {fc.isToday && (
                          <span
                            className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-0.5 rounded-full opacity-70"
                            style={{ background: fcAccent }}
                          />
                        )}
                        <span
                          className={`font-mono text-[9px] tracking-[0.1em] ${
                            fc.isToday ? "text-white/80 font-bold" : "text-white/30"
                          }`}
                        >
                          {fc.dowLabel}
                        </span>
                        <ReferenceWeatherIcon cond={rowSky} size={26} />
                        <span
                          className={`font-mono text-[10px] font-bold ${
                            fc.isToday ? "text-white/90" : "text-white/55"
                          }`}
                        >
                          {fc.hi}°
                        </span>
                        <span className="font-mono text-[9px] text-white/25">{fc.lo}°</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-5 pb-2 shrink-0 flex justify-center">
            <div className="w-full max-w-sm rounded-2xl border border-white/8 bg-black/25 backdrop-blur-sm px-5 py-3">
              <p className="text-[11px] font-mono text-white/35 text-center">Loading weather…</p>
            </div>
          </div>
        )}

        <p className="shrink-0 text-center text-[10px] text-white/25 font-mono pb-3 px-4 content-safe-bottom pointer-events-none">
          tap anywhere to stir the weather
        </p>
      </div>
    </div>
  );
}
