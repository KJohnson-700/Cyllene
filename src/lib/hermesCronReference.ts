/**
 * Labels from Hermes Second Brain `notes/cron-reference.md` (semantic reference).
 * Runtime jobs come from webApi.getCronJobs(); this module cross-checks known jobs by name/prompt.
 */

import type { CronJob } from "@/lib/api";

export const VAULT_CRON_KNOWN_JOBS = [
  { id: "berkeley-weather", vaultTitle: "Berkeley Weather", scheduleNote: "0 * * * *" },
  { id: "chanell-horoscope", vaultTitle: "Chanell Morning Horoscope", scheduleNote: "0 16 * * *" },
] as const;

function haystack(job: CronJob): string {
  return `${job.name ?? ""} ${job.prompt} ${job.schedule_display}`.toLowerCase();
}

export function findBerkeleyWeatherCron(jobs: CronJob[]): CronJob | undefined {
  return jobs.find((j) => {
    const h = haystack(j);
    return h.includes("weather") && h.includes("berkeley");
  });
}

export function findChanellHoroscopeCron(jobs: CronJob[]): CronJob | undefined {
  return jobs.find((j) => {
    const h = haystack(j);
    return (
      (h.includes("horoscope") || h.includes("libra")) &&
      (h.includes("chanell") || h.includes("channell") || h.includes("6060668923"))
    );
  });
}

export interface CronParitySummary {
  total: number;
  berkeleyWeather: CronJob | undefined;
  chanellHoroscope: CronJob | undefined;
  /** Short monospace line for Monitor UI */
  monitorLine: string;
}

export function summarizeCronParity(jobs: CronJob[]): CronParitySummary {
  const berkeleyWeather = findBerkeleyWeatherCron(jobs);
  const chanellHoroscope = findChanellHoroscopeCron(jobs);
  const parts: string[] = [`${jobs.length} jobs`];
  parts.push(berkeleyWeather ? "weather ✓" : "weather ?");
  parts.push(chanellHoroscope ? "horoscope ✓" : "horoscope ?");
  return {
    total: jobs.length,
    berkeleyWeather,
    chanellHoroscope,
    monitorLine: parts.join(" · "),
  };
}
