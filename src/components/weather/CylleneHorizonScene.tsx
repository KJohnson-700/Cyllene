import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { WeatherScene } from "@/hooks/useWeather";
import { resolveSceneVisual } from "@/lib/weatherSceneCatalog";

interface Props {
  scene: WeatherScene | null;
}

export function CylleneHorizonScene({ scene }: Props) {
  const style = useMemo(() => {
    if (!scene) return undefined;
    const visual = resolveSceneVisual(scene);
    return {
      "--cyllene-horizon-wind": String(Math.cos((scene.windFromDeg * Math.PI) / 180)),
      "--cyllene-horizon-intensity": String(scene.intensity),
      "--cyllene-horizon-tree-sway": String(visual.treeSway),
      "--cyllene-horizon-window-glow": String(visual.windowGlow),
    } as CSSProperties;
  }, [scene]);

  const phase = scene?.dayPhase ?? "day";
  const clarity = scene?.skyClarity ?? "partly";
  const visual = scene ? resolveSceneVisual(scene) : null;
  const variant = visual?.horizonVariant ?? "soft-cloud";

  return (
    <div
      className={`cyllene-horizon cyllene-horizon--${phase} cyllene-horizon--${clarity} cyllene-horizon--variant-${variant}`}
      style={style}
      aria-hidden
    >
      <div className="cyllene-horizon__sky-band" />
      <div className="cyllene-horizon__ridge cyllene-horizon__ridge--far" />
      <div className="cyllene-horizon__ridge cyllene-horizon__ridge--mid" />
      <div className="cyllene-horizon__trees" />
      <div className="cyllene-horizon__house">
        <span className="cyllene-horizon__roof" />
        <span className="cyllene-horizon__chimney" />
        <span className="cyllene-horizon__window" />
        {visual?.smoke && (
          <>
            <span className="cyllene-horizon__smoke cyllene-horizon__smoke--a" />
            <span className="cyllene-horizon__smoke cyllene-horizon__smoke--b" />
          </>
        )}
      </div>
    </div>
  );
}
