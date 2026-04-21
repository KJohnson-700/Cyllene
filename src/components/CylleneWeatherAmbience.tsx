import type { WeatherCondition } from "@/hooks/useWeather";

/** °F threshold: “scorching” desert layer (cactus + dust devil). */
const HEAT_HOT_F = 88;
const HEAT_SCORCH_F = 95;

interface Props {
  condition: WeatherCondition | null;
  /** Fahrenheit — drives hot-day extras when sunny. */
  tempF: number | null;
  thunderFlash: boolean;
}

/**
 * Decorative weather stage around the pet — CSS/SVG only, pointer-events none.
 * Pairs with Telegram: parent may fire {@link import("@/lib/telegram").haptic} on thunder.
 */
export function CylleneWeatherAmbience({ condition, tempF, thunderFlash }: Props) {
  if (!condition) return null;

  const hot = tempF != null && tempF >= HEAT_HOT_F;
  const scorch = tempF != null && tempF >= HEAT_SCORCH_F;

  return (
    <div className="cyllene-wx-ambience" aria-hidden>
      {condition === "sunny" && (
        <SunnyLayer hot={hot} scorch={scorch} tempF={tempF} />
      )}

      {condition === "cloudy" && <CloudyLayer />}

      {(condition === "rain" || condition === "thunder") && (
        <RainLayer intense={condition === "thunder"} />
      )}

      {condition === "thunder" && (
        <ThunderLayer flash={thunderFlash} />
      )}

      {condition === "windy" && <WindLayer />}

      {condition === "snow" && <SnowLayer />}

      {condition === "fog" && <FogLayer />}
    </div>
  );
}

function SunnyLayer({
  hot,
  scorch,
  tempF,
}: {
  hot: boolean;
  scorch: boolean;
  tempF: number | null;
}) {
  return (
    <>
      <div className="cyllene-wx-sun-glow" />
      {!hot && (
        <>
          <Butterfly className="cyllene-bf cyllene-bf-a" />
          <Butterfly className="cyllene-bf cyllene-bf-b" />
          <Butterfly className="cyllene-bf cyllene-bf-c" />
          <div className="cyllene-wx-flowers">
            <Flower />
            <Flower />
            <Flower />
            <Flower />
          </div>
        </>
      )}
      {hot && (
        <>
          <div className="cyllene-wx-heat-haze" data-scorch={scorch ? "true" : "false"} />
          <div className="cyllene-wx-cactus-wrap">
            <CactusSvg />
          </div>
          <div className="cyllene-wx-dust-devil" />
          {tempF != null && (
            <div className="cyllene-wx-heat-badge">
              {scorch ? "scorching" : "hot"} · {tempF}°F
            </div>
          )}
        </>
      )}
    </>
  );
}

function Butterfly({ className }: { className: string }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 24 20" className="h-4 w-5" fill="none" aria-hidden>
        <path
          d="M12 10c-1.2-2-3.5-3.5-6-3 1.5 2 2 4.5 1.5 6.5.8-.5 2.2-.5 3 0-.5-2 0-4.5 1.5-6.5-2.5-.5-4.8 1-6 3Z"
          fill="#fde68a"
          fillOpacity={0.9}
        />
        <path
          d="M12 10c1.2-2 3.5-3.5 6-3-1.5 2-2 4.5-1.5 6.5-.8-.5-2.2-.5-3 0 .5-2 0-4.5-1.5-6.5 2.5-.5 4.8 1 6 3Z"
          fill="#fbbf24"
          fillOpacity={0.85}
        />
        <path d="M12 7v7" stroke="#78350f" strokeOpacity={0.35} strokeWidth={0.8} />
      </svg>
    </div>
  );
}

function Flower() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 opacity-80" aria-hidden>
      <circle cx="10" cy="10" r="3" fill="#f472b6" fillOpacity={0.75} />
      <circle cx="10" cy="6" r="2.2" fill="#fb7185" fillOpacity={0.7} />
      <circle cx="14" cy="10" r="2.2" fill="#fb7185" fillOpacity={0.7} />
      <circle cx="10" cy="14" r="2.2" fill="#fb7185" fillOpacity={0.7} />
      <circle cx="6" cy="10" r="2.2" fill="#fb7185" fillOpacity={0.7} />
      <circle cx="10" cy="10" r="1.6" fill="#fef08a" fillOpacity={0.9} />
    </svg>
  );
}

function CactusSvg() {
  return (
    <svg viewBox="0 0 48 72" className="h-16 w-12" fill="none" aria-hidden>
      <ellipse cx="24" cy="68" rx="16" ry="3" fill="#0f172a" fillOpacity={0.35} />
      <path
        d="M24 66V22c0-6 5-10 10-10v8c-3 0-5 2-5 5v41"
        stroke="#15803d"
        strokeWidth={8}
        strokeLinecap="round"
      />
      <path d="M24 38h-10c-4 0-7 3-7 7v6" stroke="#15803d" strokeWidth={6} strokeLinecap="round" />
      <path d="M24 48h12c3 0 6 2 6 6v4" stroke="#15803d" strokeWidth={5} strokeLinecap="round" />
      <circle cx="20" cy="30" r="2" fill="#166534" />
      <circle cx="28" cy="52" r="2" fill="#166534" />
    </svg>
  );
}

function CloudyLayer() {
  return (
    <div className="cyllene-wx-clouds">
      <div className="cyllene-cloud cyllene-cloud-1" />
      <div className="cyllene-cloud cyllene-cloud-2" />
      <div className="cyllene-cloud cyllene-cloud-3" />
    </div>
  );
}

function RainLayer({ intense }: { intense: boolean }) {
  return (
    <>
      <div className="cyllene-wx-cloud-band" />
      <div className={`cyllene-wx-overlay cyllene-wx-rain ${intense ? "cyllene-wx-rain--heavy" : ""}`} />
    </>
  );
}

function ThunderLayer({ flash }: { flash: boolean }) {
  return (
    <>
      <div className="cyllene-wx-storm-clouds" />
      <svg
        className="cyllene-wx-lightning"
        viewBox="0 0 120 140"
        aria-hidden
        data-flash={flash ? "true" : "false"}
      >
        <path
          d="M62 4 L44 52 H58 L48 96 L88 44 H68 L78 4 Z"
          fill="#fef9c3"
          fillOpacity={0.95}
        />
        <path d="M62 4 L52 44 H66 L56 88 L78 52 H64 L72 4 Z" fill="#fde047" fillOpacity={0.55} />
      </svg>
      <div className="cyllene-wx-overlay cyllene-wx-thunder-flash" data-active={flash ? "true" : "false"} />
    </>
  );
}

function WindLayer() {
  return (
    <div className="cyllene-wx-wind">
      <div className="cyllene-wx-gust cyllene-wx-gust-1" />
      <div className="cyllene-wx-gust cyllene-wx-gust-2" />
      <div className="cyllene-wx-gust cyllene-wx-gust-3" />
      <Leaf className="cyllene-leaf cyllene-leaf-1" />
      <Leaf className="cyllene-leaf cyllene-leaf-2" />
      <Leaf className="cyllene-leaf cyllene-leaf-3" />
    </div>
  );
}

function Leaf({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 20 12" aria-hidden>
      <path
        d="M2 10C6 2 16 0 18 4c-4 6-10 8-16 6z"
        fill="#34d399"
        fillOpacity={0.65}
      />
    </svg>
  );
}

function SnowLayer() {
  return (
    <>
      <div className="cyllene-wx-overlay cyllene-wx-snow" />
      <div className="cyllene-wx-snow-sparkle" />
    </>
  );
}

function FogLayer() {
  return (
    <>
      <div className="cyllene-wx-overlay cyllene-wx-fog" />
      <div className="cyllene-wx-fog-wisp" />
    </>
  );
}
