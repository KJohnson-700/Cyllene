import { DragonAtmosphere } from "@/components/DragonAtmosphere";
import { useWeather, conditionLabel, formatWeatherMetrics } from "@/hooks/useWeather";
import type { AgentState } from "@/hooks/useRunStream";
import { useState } from "react";

interface Props {
  agentState: AgentState;
}

export function DragonPage({ agentState: _agentState }: Props) {
  const weather = useWeather();
  const condition = weather?.condition ?? null;
  const [scenePulse, setScenePulse] = useState(false);

  function pulseScene() {
    setScenePulse(true);
    window.setTimeout(() => setScenePulse(false), 900);
  }

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden" onPointerDown={pulseScene}>
      <DragonAtmosphere condition={condition} pulse={scenePulse} />

      <div className="relative z-10 flex flex-col flex-1 min-h-0 min-w-0">
        {/* HUD — single glass card, no duplicate chips */}
        <div className="content-safe-top px-4 pt-3 shrink-0 flex justify-center">
          {weather ? (
            <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-black/35 backdrop-blur-md px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/45 leading-tight">
                    {conditionLabel(weather.condition)}
                  </p>
                  <p className="text-[11px] font-mono text-white/40 mt-2 leading-snug">
                    {formatWeatherMetrics(weather)}
                  </p>
                </div>
                <p className="text-4xl font-extralight tabular-nums text-white/90 tracking-tight shrink-0">
                  {weather.temp}
                  <span className="text-lg font-light text-white/50 ml-0.5">°</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-sm rounded-2xl border border-white/8 bg-black/25 backdrop-blur-sm px-5 py-4">
              <p className="text-[11px] font-mono text-white/35 text-center">Loading weather…</p>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center min-h-0 py-4 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/20 backdrop-blur-sm px-5 py-6 text-center">
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/45">Scene Build In Progress</p>
            <p className="mt-3 text-sm text-white/65 leading-relaxed">
              Weather stage is now the focus. Dragon returns after this visual pass is approved.
            </p>
          </div>
        </div>

        <p className="shrink-0 text-center text-[10px] text-white/25 font-mono pb-3 px-4 content-safe-bottom">
          tap anywhere to stir the weather
        </p>
      </div>
    </div>
  );
}
