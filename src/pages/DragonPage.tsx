import { DragonCompanion } from "@/components/DragonCompanion";
import { useWeather } from "@/hooks/useWeather";
import type { AgentState } from "@/hooks/useRunStream";

const WEATHER_BG: Record<string, string> = {
  sunny:   "from-yellow-950/30 to-orange-950/20",
  cloudy:  "from-slate-900/50 to-slate-950/30",
  rain:    "from-blue-950/40 to-slate-950/30",
  snow:    "from-slate-800/30 to-blue-950/20",
  thunder: "from-purple-950/40 to-slate-950/30",
  fog:     "from-slate-800/40 to-slate-950/20",
  windy:   "from-teal-950/30 to-slate-950/20",
};

interface Props {
  agentState: AgentState;
}

export function DragonPage({ agentState }: Props) {
  // Reuse the shared hook — same geolocation path as ChatPage, no extra fetches
  const weather = useWeather();

  const bg = weather
    ? (WEATHER_BG[weather.condition] ?? WEATHER_BG.cloudy)
    : "from-slate-900/20 to-slate-950/10";

  return (
    <div
      className={`flex flex-col items-center justify-center min-h-full gap-6 bg-gradient-to-b ${bg} transition-all duration-[2000ms] p-6`}
    >
      {/* Weather strip */}
      {weather && (
        <div className="flex items-center gap-2 text-xs font-mono text-white/40 border border-white/8 rounded-full px-3 py-1">
          <span>{weather.condition}</span>
          <span>·</span>
          <span>{weather.temp}°F</span>
        </div>
      )}

      <DragonCompanion agentState={agentState} weather={weather} />

      <p className="text-[10px] text-white/20 font-mono text-center">
        tap to pet · hold for fire colors
      </p>
    </div>
  );
}
