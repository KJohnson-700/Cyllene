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
      try {
        const [status, sessionsResp, cronJobs] = await Promise.all([
          webApi.getStatus(),
          webApi.getSessions(10),
          webApi.getCronJobs(),
        ]);
        if (!cancelled) {
          setState({
            status,
            sessions: sessionsResp.sessions,
            cronJobs,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false, error: String(err) }));
        }
      }
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
