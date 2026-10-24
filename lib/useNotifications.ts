"use client";

import { useCallback, useEffect, useState } from "react";
import type { Notification } from "./types";

const POLL_MS = 4000;

/**
 * Polls the current user's notifications. Polling (not Supabase Realtime) so it also works
 * in mock mode; swap in a realtime subscription once everyone is on the real database.
 */
export function useNotifications(userId: string | null | undefined) {
  const [items, setItems] = useState<Notification[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (res.ok) setItems(await res.json());
  }, []);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const tick = async () => {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (alive && res.ok) setItems(await res.json());
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [userId]);

  const markRead = useCallback(async () => {
    await fetch("/api/notifications", { method: "POST" });
    await refresh();
  }, [refresh]);

  return { items, unread: items.filter((n) => !n.read_at).length, refresh, markRead };
}
