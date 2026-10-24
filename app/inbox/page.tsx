"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import PageShell, { Empty, ErrorNote } from "@/components/PageShell";
import { deleteAllNotifications, deleteNotification, getNotifications, markAllNotificationsRead, markNotificationRead, subscribeNotifications } from "@/lib/data";
import { timeAgo } from "@/lib/status";
import type { Notification } from "@/lib/types";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLive } from "@/lib/useLive";

export default function InboxPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const { data: items, error, reload } = useLive(() => getNotifications(user.id), (cb) => subscribeNotifications(user.id, cb), [user.id]);
  const unread = items?.filter((n) => !n.read).length ?? 0;

  // Clear the badge a moment after opening, so the unread highlight is still seen.
  useEffect(() => {
    if (!unread) return;
    const t = setTimeout(() => void markAllNotificationsRead(user.id), 2500);
    return () => clearTimeout(t);
  }, [unread, user.id]);

  function open(n: Notification) {
    if (!n.read) void markNotificationRead(n.id);
    if (n.link) router.push(n.link);
  }

  async function remove(id: string) {
    await deleteNotification(id);
    reload();
  }

  async function clear() {
    await deleteAllNotifications(user.id);
    reload();
  }

  return (
    <PageShell title="Inbox">
      {error && <ErrorNote>{error}</ErrorNote>}
      {items && items.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={() => void clear()} className="text-xs text-slate-400">
            Clear inbox
          </button>
        </div>
      )}
      {items?.length === 0 && <Empty>Nothing yet. Matches, check-ins and points show up here.</Empty>}
      <ul className="space-y-2">
        {items?.map((n) => (
          <li key={n.id} className={`relative rounded-2xl border p-4 ${n.read ? "border-white/10 bg-white/5" : "border-cyan-300/50 bg-cyan-300/10"}`}>
            <button
              type="button"
              aria-label="Delete notification"
              onClick={() => void remove(n.id)}
              className="absolute right-3 top-3 text-sm leading-none text-slate-400"
            >
              ✕
            </button>
            <button onClick={() => open(n)} disabled={!n.link && n.read} className="w-full pr-6 text-left disabled:cursor-default">
              <p className="text-sm text-slate-100">{n.text}</p>
              <span className="mt-1 block text-[11px] text-slate-500">{timeAgo(n.created_at)}</span>
              {n.link && <span className="mt-2 inline-block text-xs text-cyan-300">Open ›</span>}
            </button>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
