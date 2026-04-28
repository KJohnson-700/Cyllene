/**
 * Weather hook — Open-Meteo (free, no key).
 * Resolves location via Telegram LocationManager first, then browser geolocation.
 * Polls every 15 min and derives a richer scene model for premium visuals.
 */

import { useEffect, useState } from "react";
import { requestLocation } from "@/lib/telegram";
import { wmoCodeToCondition } from "@/lib/wmoWeatherCode";

export type WeatherCondition =
  | "sunny" | "cloudy" | "rain" | "snow" | "thunder" | "fog" | "windy";

/** One calendar day in the forecast grid (Open-Meteo `daily`). */
export interface DailyForecastDay {
  /** ISO date `yyyy-mm-dd` in the API timezone. */
  date: string;
  /** Short label e.g. `MON` (computed in station timezone). */
  dowLabel: string;
  hi: number;
  lo: number;
  weatherCode: number;
  windMphMax: number;
  condition: WeatherCondition;
  /** True when this row matches “today” in the station timezone. */
  isToday: boolean;
}

export interface Weather {
  condition: WeatherCondition;
  temp: number; // Fahrenheit (current)
  code: number; // raw WMO weather code (current)
  windMph: number;
  humidity: number; // 0–100 %
  scene: WeatherScene;
  /** Daily max/min for today’s calendar day (`null` if daily block missing). */
  todayHi: number | null;
  todayLo: number | null;
  /** Multi-day daily forecast (typically 7 days from Open-Meteo). */
  daily: DailyForecastDay[];
}

export type DayPhase = "dawn" | "day" | "dusk" | "night";
export type SkyClarity = "clear" | "partly" | "overcast";

export interface WeatherScene {
  condition: WeatherCondition;
  intensity: number; // 0..1
  dayPhase: DayPhase;
  windFromDeg: number; // 0..360
  cloudCover: number; // 0..100
  skyClarity: SkyClarity;
  isDay: boolean;
}

export function conditionLabel(c: WeatherCondition): string {
  const map: Record<WeatherCondition, string> = {
    sunny: "Clear / sunny",
    cloudy: "Cloudy",
    rain: "Rain",
    snow: "Snow",
    thunder: "Storms nearby",
    fog: "Foggy",
    windy: "Windy",
  };
  return map[c];
}

/** Humidity + wind only (for HUD subline — avoids repeating the big temp/condition). */
export function formatWeatherMetrics(w: Weather): string {
  return `${w.humidity}% humidity · wind ${Math.round(w.windMph)} mph`;
}

/** One-sentence local summary from Open-Meteo only (no vault). */
export function formatWeatherSummary(w: Weather): string {
  const sky = conditionLabel(w.condition);
  return `${sky} · ${w.temp}°F · ${w.humidity}% humidity · wind ${Math.round(w.windMph)} mph`;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function deriveDayPhase(localHour: number, isDay: boolean): DayPhase {
  if (!isDay) return "night";
  if (localHour <= 7) return "dawn";
  if (localHour >= 18) return "dusk";
  return "day";
}

function deriveIntensity(
  condition: WeatherCondition,
  precipitationMm: number,
  snowfallCm: number,
  cloudCover: number,
  windMph: number
): number {
  const precipitationNorm = clamp01(precipitationMm / 8);
  const snowfallNorm = clamp01(snowfallCm / 1.5);
  const cloudNorm = clamp01(cloudCover / 100);
  const windNorm = clamp01(windMph / 35);

  switch (condition) {
    case "thunder":
      return clamp01(0.6 + precipitationNorm * 0.2 + cloudNorm * 0.2);
    case "rain":
      return clamp01(0.25 + precipitationNorm * 0.55 + windNorm * 0.2);
    case "snow":
      return clamp01(0.2 + snowfallNorm * 0.6 + windNorm * 0.2);
    case "fog":
      return clamp01(0.35 + cloudNorm * 0.5);
    case "windy":
      return clamp01(0.35 + windNorm * 0.65);
    case "cloudy":
      return clamp01(0.25 + cloudNorm * 0.5 + windNorm * 0.25);
    case "sunny":
      return clamp01(0.15 + (1 - cloudNorm) * 0.45 + windNorm * 0.15);
    default:
      return 0.35;
  }
}

function deriveSkyClarity(
  cloudCover: number,
  condition: WeatherCondition,
  precipitationMm: number,
  snowfallCm: number
): SkyClarity {
  if (condition === "thunder" || condition === "fog") return "overcast";
  if (condition === "rain" && precipitationMm >= 0.2) return "overcast";
  if (condition === "snow" && snowfallCm >= 0.1) return "overcast";
  if (cloudCover < 25) return "clear";
  if (cloudCover < 70) return "partly";
  return "overcast";
}

// Fallback: SF
const FALLBACK_LAT = 37.77;
const FALLBACK_LON = -122.42;

function fallbackWeather(): Weather {
  return {
    condition: "sunny",
    temp: 70,
    code: 1,
    windMph: 6,
    humidity: 58,
    todayHi: 75,
    todayLo: 55,
    daily: [],
    scene: {
      condition: "sunny",
      intensity: 0.32,
      dayPhase: "day",
      windFromDeg: 220,
      cloudCover: 22,
      skyClarity: "clear",
      isDay: true,
    },
  };
}

function calendarDateInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dowShortInTimeZone(isoDate: string, timeZone: string): string {
  const [y, mo, da] = isoDate.split("-").map(Number);
  const inst = new Date(Date.UTC(y, mo - 1, da, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  })
    .format(inst)
    .toUpperCase();
}

function parseDailyForecast(
  daily: Record<string, unknown> | undefined,
  timeZone: string | undefined
): { daily: DailyForecastDay[]; todayHi: number | null; todayLo: number | null } {
  const tz = timeZone && timeZone.length > 0 ? timeZone : "UTC";
  const times = daily?.time;
  if (!Array.isArray(times) || times.length === 0) {
    return { daily: [], todayHi: null, todayLo: null };
  }

  const codes = daily?.weather_code;
  const maxT = daily?.temperature_2m_max;
  const minT = daily?.temperature_2m_min;
  const windMax = daily?.wind_speed_10m_max;

  const todayKey = calendarDateInTimeZone(new Date(), tz);
  const days: DailyForecastDay[] = [];
  let todayHi: number | null = null;
  let todayLo: number | null = null;

  const n = Math.min(times.length, 8);
  for (let i = 0; i < n; i++) {
    const date = String(times[i]);
    const code = Number(Array.isArray(codes) ? codes[i] : NaN);
    const hiRaw = Number(Array.isArray(maxT) ? maxT[i] : NaN);
    const loRaw = Number(Array.isArray(minT) ? minT[i] : NaN);
    if (!Number.isFinite(hiRaw) || !Number.isFinite(loRaw)) continue;
    const hi = Math.round(hiRaw);
    const lo = Math.round(loRaw);
    const wmax = Number(Array.isArray(windMax) ? windMax[i] : 0);
    const wind = Number.isFinite(wmax) ? wmax : 0;
    const condition = wmoCodeToCondition(Number.isFinite(code) ? code : 3, wind);
    const isToday = date === todayKey;
    if (isToday) {
      todayHi = hi;
      todayLo = lo;
    }
    days.push({
      date,
      dowLabel: dowShortInTimeZone(date, tz),
      hi,
      lo,
      weatherCode: Number.isFinite(code) ? code : 3,
      windMphMax: wind,
      condition,
      isToday,
    });
  }

  if ((todayHi === null || todayLo === null) && days.length > 0) {
    const first = days[0];
    if (first) {
      todayHi = todayHi ?? first.hi;
      todayLo = todayLo ?? first.lo;
    }
  }

  return { daily: days.slice(0, 7), todayHi, todayLo };
}

async function fetchWeather(lat: number, lon: number): Promise<Weather | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      "&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation,snowfall,cloud_cover,is_day" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=8";
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data?.current;
    if (!cur) return null;
    const wind = Number(cur.wind_speed_10m ?? 0);
    const windFromDeg = Number(cur.wind_direction_10m ?? 0);
    const humidity = Math.round(Number(cur.relative_humidity_2m ?? 0));
    const precipitationMm = Number(cur.precipitation ?? 0);
    const snowfallCm = Number(cur.snowfall ?? 0);
    const cloudCover = Math.round(Number(cur.cloud_cover ?? 0));
    const isDay = Number(cur.is_day ?? 1) === 1;
    const condition = wmoCodeToCondition(Number(cur.weather_code), wind);

    const tz = typeof data?.timezone === "string" ? data.timezone : undefined;
    const now = new Date();
    const hourFormatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: tz,
    });
    const hourPart = hourFormatter.formatToParts(now).find((p) => p.type === "hour")?.value;
    const localHour = Number(hourPart ?? now.getHours());
    const dayPhase = deriveDayPhase(Number.isNaN(localHour) ? now.getHours() : localHour, isDay);
    const intensity = deriveIntensity(condition, precipitationMm, snowfallCm, cloudCover, wind);
    const skyClarity = deriveSkyClarity(cloudCover, condition, precipitationMm, snowfallCm);

    const { daily: dailyRows, todayHi, todayLo } = parseDailyForecast(
      data?.daily as Record<string, unknown> | undefined,
      tz
    );

    return {
      temp: Math.round(cur.temperature_2m),
      code: cur.weather_code,
      condition,
      windMph: wind,
      humidity: Math.min(100, Math.max(0, humidity)),
      todayHi,
      todayLo,
      daily: dailyRows,
      scene: {
        condition,
        intensity,
        dayPhase,
        windFromDeg: Number.isNaN(windFromDeg) ? 0 : windFromDeg,
        cloudCover: Math.min(100, Math.max(0, cloudCover)),
        skyClarity,
        isDay,
      },
    };
  } catch {
    return null;
  }
}

let coordsCache: { lat: number; lon: number; ts: number } | null = null;

async function getCoords(): Promise<[number, number]> {
  const now = Date.now();
  if (coordsCache && now - coordsCache.ts < 60 * 60 * 1000) {
    return [coordsCache.lat, coordsCache.lon];
  }

  try {
    const tgLoc = await Promise.race([
      requestLocation(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1600)),
    ]);
    if (tgLoc) {
      coordsCache = { lat: tgLoc.latitude, lon: tgLoc.longitude, ts: now };
      return [tgLoc.latitude, tgLoc.longitude];
    }
  } catch {
    // Telegram location unavailable or denied; continue to browser fallback.
  }

  const browserCoords: [number, number] = await new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve([FALLBACK_LAT, FALLBACK_LON]);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      () => resolve([FALLBACK_LAT, FALLBACK_LON]),
      { timeout: 5000, maximumAge: 60 * 60 * 1000 }
    );
  });
  coordsCache = { lat: browserCoords[0], lon: browserCoords[1], ts: now };
  return browserCoords;
}

export function useWeather(): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function load() {
      const [lat, lon] = await getCoords();
      const w = await fetchWeather(lat, lon);
      if (cancelled) return;
      if (w) setWeather(w);
      else setWeather((prev) => prev ?? fallbackWeather());
    }

    load();
    timer = window.setInterval(load, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  return weather;
}
