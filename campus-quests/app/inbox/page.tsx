"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import PageShell, { Empty, ErrorNote } from "@/components/PageShell";
import { getNotifications, markAllNotificationsRead, markNotificationRead, subscribeNotifications } from "@/lib/data";
import { timeAgo } from "@/lib/status";
import type { Notification } from "@/lib/types";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLive } from "@/lib/useLive";

export default function InboxPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const { data: items, error } = useLive(() => getNotifications(user.id), (cb) => subscribeNotifications(user.id, cb), [user.id]);
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

  return (
    <PageShell title="Inbox">
      {error && <ErrorNote>{error}</ErrorNote>}
      {items?.length === 0 && <Empty>Nothing yet. Matches, check-ins and points show up here.</Empty>}
      <ul className="space-y-2">
        {items?.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => open(n)}
              disabled={!n.link && n.read}
              className={`w-full rounded-2xl border p-4 text-left ${n.read ? "border-white/10 bg-white/5" : "border-cyan-300/50 bg-cyan-300/10"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-slate-100">{n.text}</p>
                <span className="shrink-0 text-[11px] text-slate-500">{timeAgo(n.created_at)}</span>
              </div>
              {n.link && <span className="mt-2 inline-block text-xs text-cyan-300">Open ›</span>}
            </button>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
