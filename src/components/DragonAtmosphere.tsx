import type { WeatherCondition } from "@/hooks/useWeather";

interface Props {
  condition: WeatherCondition | null;
}

/**
 * Full-viewport weather stage behind the pet — gradients + CSS motion only.
 * Cloudy uses a dark “ceiling” slab, not decorative cloud shapes.
 */
export function DragonAtmosphere({ condition }: Props) {
  const c = condition ?? "cloudy";

  return (
    <div
      className={`cyllene-atmo cyllene-atmo--${c} absolute inset-0 z-0 overflow-hidden pointer-events-none`}
      aria-hidden
    >
      <div className="cyllene-atmo__sky" />
      {c === "cloudy" && <div className="cyllene-atmo__cloud-ceiling" />}
      {(c === "rain" || c === "thunder") && (
        <>
          <div className="cyllene-atmo__storm-cap" />
          <div className="cyllene-atmo__rain cyllene-atmo__rain--a" />
          <div className="cyllene-atmo__rain cyllene-atmo__rain--b" />
        </>
      )}
      {c === "thunder" && <div className="cyllene-atmo__lightning" />}
      {c === "snow" && (
        <>
          <div className="cyllene-atmo__snow cyllene-atmo__snow--a" />
          <div className="cyllene-atmo__snow cyllene-atmo__snow--b" />
        </>
      )}
      {c === "fog" && <div className="cyllene-atmo__fog" />}
      {c === "windy" && <div className="cyllene-atmo__wind" />}
      {c === "sunny" && <div className="cyllene-atmo__sun" />}
      <div className="cyllene-atmo__vignette" />
    </div>
  );
}
