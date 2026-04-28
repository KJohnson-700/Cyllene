import { useState, useEffect } from "react";
import { webApi, type HermesStatus, type SessionInfo, type CronJob } from "@/lib/api";

interface StatusState {
  status: HermesStatus | null;
  sessions: SessionInfo[];
  cronJobs: CronJob[];
  loading: boolean;
  error: string | null;
}

export function useHermesStatus(pollMs = 10_000) {
  const [state, setState] = useState<StatusState>({
    status: null,
    sessions: [],
    cronJobs: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [statusR, sessionsR, cronR] = await Promise.allSettled([
        webApi.getStatus(),
        webApi.getSessions(10),
        webApi.getCronJobs(),
      ]);

      if (cancelled) return;

      setState({
        status:   statusR.status   === "fulfilled" ? statusR.value           : null,
        sessions: sessionsR.status === "fulfilled" ? sessionsR.value.sessions : [],
        cronJobs: cronR.status     === "fulfilled" ? cronR.value              : [],
        loading: false,
        error: null,
      });
    }

    load();
    const interval = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollMs]);

  return state;
}
