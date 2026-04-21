import type { WeatherCondition } from "@/hooks/useWeather";

interface Props {
  condition: WeatherCondition | null;
  pulse?: boolean;
}

/**
 * Full-viewport weather stage behind the pet — gradients + CSS motion only.
 * Cloudy uses a dark “ceiling” slab, not decorative cloud shapes.
 */
export function DragonAtmosphere({ condition, pulse = false }: Props) {
  const c = condition ?? "cloudy";

  return (
    <div
      className={`cyllene-atmo cyllene-atmo--${c} ${pulse ? "cyllene-atmo--pulse" : ""} absolute inset-0 z-0 overflow-hidden pointer-events-none`}
      aria-hidden
    >
      <div className="cyllene-atmo__sky" />
      <div className="cyllene-atmo__motion" />
      {(c === "cloudy" || c === "rain" || c === "thunder") && (
        <>
          <div className="cyllene-atmo__cloud-ceiling" />
          <div className="cyllene-atmo__cloud-band cyllene-atmo__cloud-band--near" />
          <div className="cyllene-atmo__cloud-band cyllene-atmo__cloud-band--mid" />
          <div className="cyllene-atmo__cloud-band cyllene-atmo__cloud-band--far" />
        </>
      )}
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
