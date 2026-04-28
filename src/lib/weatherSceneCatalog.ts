import type { DayPhase, SkyClarity, WeatherCondition, WeatherScene } from "@/hooks/useWeather";

export interface SceneVisualConfig {
  key: string;
  horizonVariant: "clear" | "soft-cloud" | "overcast" | "storm" | "snow" | "fog" | "wind";
  windowGlow: number;
  treeSway: number;
  smoke: boolean;
}

export function getSceneVisualKey(scene: Pick<WeatherScene, "condition" | "skyClarity" | "dayPhase">): string {
  return `${scene.condition}__${scene.skyClarity}__${scene.dayPhase}`;
}

const BASE_BY_CONDITION: Record<WeatherCondition, Omit<SceneVisualConfig, "key">> = {
  sunny: { horizonVariant: "clear", windowGlow: 0.45, treeSway: 0.25, smoke: true },
  cloudy: { horizonVariant: "soft-cloud", windowGlow: 0.65, treeSway: 0.34, smoke: true },
  rain: { horizonVariant: "overcast", windowGlow: 0.78, treeSway: 0.4, smoke: false },
  snow: { horizonVariant: "snow", windowGlow: 0.84, treeSway: 0.2, smoke: true },
  thunder: { horizonVariant: "storm", windowGlow: 0.82, treeSway: 0.45, smoke: false },
  fog: { horizonVariant: "fog", windowGlow: 0.72, treeSway: 0.16, smoke: false },
  windy: { horizonVariant: "wind", windowGlow: 0.62, treeSway: 0.55, smoke: true },
};

function tuneBySky(clarity: SkyClarity, cfg: Omit<SceneVisualConfig, "key">): Omit<SceneVisualConfig, "key"> {
  if (clarity === "clear") {
    return {
      ...cfg,
      horizonVariant: cfg.horizonVariant === "overcast" ? "soft-cloud" : cfg.horizonVariant,
      windowGlow: Math.max(0.35, cfg.windowGlow - 0.12),
      treeSway: Math.max(0.12, cfg.treeSway - 0.08),
      smoke: true,
    };
  }
  if (clarity === "partly") {
    return {
      ...cfg,
      horizonVariant: cfg.horizonVariant === "overcast" ? "soft-cloud" : cfg.horizonVariant,
      windowGlow: Math.max(0.45, cfg.windowGlow - 0.05),
    };
  }
  return cfg;
}

function tuneByPhase(phase: DayPhase, cfg: Omit<SceneVisualConfig, "key">): Omit<SceneVisualConfig, "key"> {
  if (phase === "day") return { ...cfg, windowGlow: Math.max(0.35, cfg.windowGlow - 0.2) };
  if (phase === "dawn" || phase === "dusk") return { ...cfg, windowGlow: cfg.windowGlow + 0.05 };
  return cfg;
}

export function resolveSceneVisual(
  scene: Pick<WeatherScene, "condition" | "skyClarity" | "dayPhase">
): SceneVisualConfig {
  const key = getSceneVisualKey(scene);
  const base = BASE_BY_CONDITION[scene.condition];
  const skyTuned = tuneBySky(scene.skyClarity, base);
  const phaseTuned = tuneByPhase(scene.dayPhase, skyTuned);
  return { key, ...phaseTuned };
}
