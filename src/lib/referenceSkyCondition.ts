import type { WeatherCondition, WeatherScene } from "@/hooks/useWeather";
import { wmoCodeToCondition } from "@/lib/wmoWeatherCode";

/** Keys matching HERMES Mini App.html `WeatherCanvas` / `COND_META`. */
export type ReferenceSkyCondition =
  | "SUNNY"
  | "PARTLY_CLOUDY"
  | "CLOUDY"
  | "RAINY"
  | "STORMY"
  | "SNOWY"
  | "WINDY"
  | "FOGGY";

export function weatherToReferenceSky(
  condition: WeatherCondition,
  scene: Pick<WeatherScene, "skyClarity" | "isDay">
): ReferenceSkyCondition {
  switch (condition) {
    case "thunder":
      return "STORMY";
    case "rain":
      return "RAINY";
    case "snow":
      return "SNOWY";
    case "windy":
      return "WINDY";
    case "fog":
      return "FOGGY";
    case "cloudy":
      return scene.skyClarity === "partly" ? "PARTLY_CLOUDY" : "CLOUDY";
    case "sunny":
    default:
      if (scene.skyClarity === "clear") return "SUNNY";
      if (scene.skyClarity === "partly") return "PARTLY_CLOUDY";
      return "CLOUDY";
  }
}

export const REFERENCE_SKY_ACCENT: Record<ReferenceSkyCondition, string> = {
  SUNNY: "#ffd60a",
  PARTLY_CLOUDY: "#4ab0e8",
  CLOUDY: "#8aa0b8",
  RAINY: "#5ba0cc",
  STORMY: "#8a70cc",
  SNOWY: "#a8d4f0",
  WINDY: "#70c0b0",
  FOGGY: "#90a8b8",
};

/** Map WMO code + wind (daily max wind) to canvas/HUD sky key for forecast rows. */
export function referenceSkyFromDailyWeatherCode(code: number, windMph: number): ReferenceSkyCondition {
  const condition = wmoCodeToCondition(code, windMph);
  const skyClarity: WeatherScene["skyClarity"] =
    code <= 1 ? "clear" : code <= 3 ? "partly" : "overcast";
  return weatherToReferenceSky(condition, { skyClarity, isDay: true });
}

export function referenceSkyLabel(cond: ReferenceSkyCondition): string {
  const labels: Record<ReferenceSkyCondition, string> = {
    SUNNY: "Sunny",
    PARTLY_CLOUDY: "Partly Cloudy",
    CLOUDY: "Cloudy",
    RAINY: "Rainy",
    STORMY: "Stormy",
    SNOWY: "Snowy",
    WINDY: "Windy",
    FOGGY: "Foggy",
  };
  return labels[cond];
}
