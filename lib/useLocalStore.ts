"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "cq-local-store";
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value = fallback;
  if (raw !== null) {
    try {
      value = { ...fallback, ...JSON.parse(raw) };
    } catch {}
  }
  cache.set(key, { raw, value });
  return value;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** An object persisted in localStorage, safe for server rendering (the server sees `fallback`). */
export function useLocalStore<T extends object>(key: string, fallback: T): [T, (patch: Partial<T>) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const update = useCallback(
    (patch: Partial<T>) => {
      localStorage.setItem(key, JSON.stringify({ ...read(key, fallback), ...patch }));
      window.dispatchEvent(new Event(EVENT));
    },
    [key, fallback],
  );
  return [value, update];
}
