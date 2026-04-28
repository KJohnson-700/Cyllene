import { useState, useEffect, useCallback, useRef } from "react";
import { webApi, type CronJob } from "@/lib/api";

export interface UseCronJobsState {
  jobs: CronJob[];
  loading: boolean;
  error: string | null;
  lastUpdatedAt: number | null;
  refetch: () => Promise<void>;
}

function normalizeCronError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("404")) {
    return "Cron API not found (/api/cron/jobs). Check Hermes route + Vercel rewrite.";
  }
  if (raw.includes("502") || raw.includes("503") || raw.includes("504")) {
    return "Cron API unavailable. Hermes tunnel may be offline.";
  }
  if (raw.includes("<!DOCTYPE html") || raw.includes("<html")) {
    return "Cron API returned HTML instead of JSON. Verify tunnel/proxy target.";
  }
  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}

export function useCronJobs(pollMs = 12_000): UseCronJobsState {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchJobs = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      const j = await webApi.getCronJobs();
      if (!mounted.current) return;
      setJobs(j);
      setError(null);
      setLastUpdatedAt(Date.now());
    } catch (e) {
      if (!mounted.current) return;
      setError(normalizeCronError(e));
    } finally {
      if (mounted.current && showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchJobs(true);
    const t = setInterval(() => { void fetchJobs(false); }, pollMs);
    return () => clearInterval(t);
  }, [pollMs, fetchJobs]);

  const refetch = useCallback(() => fetchJobs(false), [fetchJobs]);

  return { jobs, loading, error, lastUpdatedAt, refetch };
}
