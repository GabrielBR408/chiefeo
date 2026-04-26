import { useCallback, useEffect, useRef, useState } from "react";
import { loadUsage } from "../lib/queries.js";

// Centralized data hook. The Supabase fetch runs once per (window, user) — the
// `mode` is a presentation concern, but the headline-number weighting depends
// on it, so we re-aggregate locally when mode flips. Refetching from the DB
// on a mode toggle would be wasteful and would flicker the chart axes.
export function useUsageData({ window, mode, user }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!user) {
      setState({ loading: false, error: null, data: null });
      return;
    }
    const myReq = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loadUsage({ window, mode });
      if (myReq !== reqId.current) return;
      setState({ loading: false, error: null, data });
    } catch (e) {
      if (myReq !== reqId.current) return;
      setState({ loading: false, error: e?.message || String(e), data: null });
    }
  }, [window, mode, user]);

  useEffect(() => { reload(); }, [reload]);

  return { ...state, reload };
}
