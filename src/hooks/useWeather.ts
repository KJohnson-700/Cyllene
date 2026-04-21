/**
 * Weather hook — Open-Meteo (free, no key).
 * Resolves location via browser geolocation (with a sensible fallback).
 * Polls every 15 min.
 */

import { useEffect, useState } from "react";

export type WeatherCondition =
  | "sunny" | "cloudy" | "rain" | "snow" | "thunder" | "fog" | "windy";

export interface Weather {
  condition: WeatherCondition;
  temp: number; // Fahrenheit
  code: number; // raw WMO weather code
  windMph: number;
  humidity: number; // 0–100 %
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

// WMO weather interpretation codes → our simplified buckets
// https://open-meteo.com/en/docs
function codeToCondition(code: number, windSpeed: number): WeatherCondition {
  if (code === 0 || code === 1) return "sunny";
  if (code === 2 || code === 3) return windSpeed > 20 ? "windy" : "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  return "cloudy";
}

// Fallback: SF
const FALLBACK_LAT = 37.77;
const FALLBACK_LON = -122.42;

async function fetchWeather(lat: number, lon: number): Promise<Weather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data?.current;
    if (!cur) return null;
    const wind = Number(cur.wind_speed_10m ?? 0);
    const humidity = Math.round(Number(cur.relative_humidity_2m ?? 0));
    return {
      temp: Math.round(cur.temperature_2m),
      code: cur.weather_code,
      condition: codeToCondition(cur.weather_code, wind),
      windMph: wind,
      humidity: Math.min(100, Math.max(0, humidity)),
    };
  } catch {
    return null;
  }
}

function getCoords(): Promise<[number, number]> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve([FALLBACK_LAT, FALLBACK_LON]);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      () => resolve([FALLBACK_LAT, FALLBACK_LON]),
      { timeout: 4000, maximumAge: 60 * 60 * 1000 }
    );
  });
}

export function useWeather(): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function load() {
      const [lat, lon] = await getCoords();
      const w = await fetchWeather(lat, lon);
      if (!cancelled && w) setWeather(w);
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
