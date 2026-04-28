import type { WeatherCondition } from "@/hooks/useWeather";

/** WMO weather interpretation → app condition (Open-Meteo current & daily codes). */
export function wmoCodeToCondition(code: number, windMph: number): WeatherCondition {
  if (code === 0 || code === 1) return "sunny";
  if (code === 2 || code === 3) return windMph > 20 ? "windy" : "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  return "cloudy";
}
