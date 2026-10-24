"use client";

import { useCallback, useEffect, useState, type DependencyList } from "react";

/**
 * Loads data and reloads it whenever `subscribe` fires (Supabase Realtime or the mock's events).
 * `deps` restarts both, e.g. when the demo user changes.
 */
export function useLive<T>(
  load: () => Promise<T>,
  subscribe: ((onChange: () => void) => () => void) | null,
  deps: DependencyList,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const run = () =>
      load().then(
        (d) => {
          if (!alive) return;
          setData(d);
          setError(null);
        },
        (e: unknown) => alive && setError(e instanceof Error ? e.message : "Couldn't load"),
      );
    run();
    const unsubscribe = subscribe?.(run);
    return () => {
      alive = false;
      unsubscribe?.();
    };
    // `load` and `subscribe` are inline closures; `deps` says when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload };
}
