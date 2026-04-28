import { WeatherMotionCanvas } from "@/components/weather/WeatherMotionCanvas";
import { ReferenceSkyCanvas } from "@/components/weather/ReferenceSkyCanvas";
import type { DeviceOrientationState } from "@/hooks/useTelegramSensors";
import type { WeatherCondition, WeatherScene } from "@/hooks/useWeather";
import { weatherToReferenceSky } from "@/lib/referenceSkyCondition";
import { useMemo } from "react";
import type { CSSProperties } from "react";

interface Props {
  condition: WeatherCondition | null;
  scene?: WeatherScene | null;
  orientation?: DeviceOrientationState;
  pulse?: boolean;
}

/**
 * Full-viewport weather stage behind the horizon. When Open-Meteo scene is ready,
 * uses the HERMES Mini App–style canvas sky (`ReferenceSkyCanvas`); otherwise CSS + particles.
 */
export function DragonAtmosphere({ condition, scene = null, orientation, pulse = false }: Props) {
  const c = condition ?? "cloudy";
  const phaseClass = scene ? `cyllene-atmo--phase-${scene.dayPhase}` : "";
  const clarityClass = scene ? `cyllene-atmo--sky-${scene.skyClarity}` : "";
  const hasSkyState = !!scene;
  const useReferenceSky = hasSkyState;
  // Live scene uses ReferenceSkyCanvas for the full sky; CSS ornaments only while loading (no scene).
  const showStars = !scene && c === "sunny";
  const showSun = !scene && c === "sunny";
  const showMoon = false;
  const showCloudBands = !scene && (c === "cloudy" || c === "rain" || c === "thunder");
  const referenceSky = useMemo(
    () => (scene ? weatherToReferenceSky(scene.condition, scene) : null),
    [scene]
  );
  const vars = useMemo(() => {
    if (!scene) return undefined;
    return {
      "--cyllene-intensity": String(scene.intensity),
      "--cyllene-cloud-cover": String(scene.cloudCover / 100),
      "--cyllene-wind-cos": String(Math.cos((scene.windFromDeg * Math.PI) / 180)),
      "--cyllene-wind-sin": String(Math.sin((scene.windFromDeg * Math.PI) / 180)),
      "--cyllene-day-night": scene.isDay ? "0" : "1",
      "--cyllene-dayphase-dawn": scene.dayPhase === "dawn" ? "1" : "0",
      "--cyllene-dayphase-dusk": scene.dayPhase === "dusk" ? "1" : "0",
      "--cyllene-dayphase-night": scene.dayPhase === "night" ? "1" : "0",
    } as CSSProperties;
  }, [scene]);

  return (
    <div
      className={`cyllene-atmo cyllene-atmo--${c} ${phaseClass} ${clarityClass} ${pulse ? "cyllene-atmo--pulse" : ""} absolute inset-0 z-0 overflow-hidden pointer-events-none`}
      style={vars}
      aria-hidden
    >
      {useReferenceSky && referenceSky ? (
        <ReferenceSkyCanvas condition={referenceSky} isDay={scene.isDay} />
      ) : (
        <div className="cyllene-atmo__sky" />
      )}
      {!useReferenceSky && <div className="cyllene-atmo__motion" />}
      {showStars && <div className="cyllene-atmo__stars" />}
      {showCloudBands && (
        <>
          <div className="cyllene-atmo__cloud-ceiling" />
          <div className="cyllene-atmo__cloud-band cyllene-atmo__cloud-band--near" />
          <div className="cyllene-atmo__cloud-band cyllene-atmo__cloud-band--mid" />
          <div className="cyllene-atmo__cloud-band cyllene-atmo__cloud-band--far" />
        </>
      )}
      {!useReferenceSky && (c === "rain" || c === "thunder") && (
        <>
          <div className="cyllene-atmo__storm-cap" />
          <div className="cyllene-atmo__rain cyllene-atmo__rain--a" />
          <div className="cyllene-atmo__rain cyllene-atmo__rain--b" />
        </>
      )}
      {!useReferenceSky && c === "thunder" && <div className="cyllene-atmo__lightning" />}
      {!useReferenceSky && c === "snow" && (
        <>
          <div className="cyllene-atmo__snow cyllene-atmo__snow--a" />
          <div className="cyllene-atmo__snow cyllene-atmo__snow--b" />
        </>
      )}
      {!useReferenceSky && c === "fog" && <div className="cyllene-atmo__fog" />}
      {!useReferenceSky && c === "windy" && <div className="cyllene-atmo__wind" />}
      {showSun && <div className="cyllene-atmo__sun" />}
      {showMoon && <div className="cyllene-atmo__moon" />}
      {!useReferenceSky && <WeatherMotionCanvas scene={scene} orientation={orientation} pulse={pulse} />}
      <div className="cyllene-atmo__vignette" />
    </div>
  );
}
