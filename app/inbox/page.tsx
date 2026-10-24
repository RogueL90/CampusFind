"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useDemoUser } from "@/lib/clientUser";
import { useNotifications } from "@/lib/useNotifications";

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function InboxPage() {
  const user = useDemoUser();
  const { items, unread, markRead } = useNotifications(user?.id);

  // Opening the inbox clears the badge, a moment later so the unread styling is still seen.
  useEffect(() => {
    if (!unread) return;
    const t = setTimeout(markRead, 2500);
    return () => clearTimeout(t);
  }, [unread, markRead]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      {items.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/60">
          Nothing yet. Matches for your lost items show up here.
        </div>
      )}
      <ul className="space-y-2">
        {items.map((n) => {
          const body = (
            <div
              className={`rounded-2xl border p-4 ${
                n.read_at ? "border-white/10 bg-white/5" : "border-cyan-300/50 bg-cyan-300/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{n.title}</span>
                <span className="shrink-0 text-xs text-white/50">{ago(n.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-white/80">{n.body}</p>
              {n.link && <span className="mt-2 inline-block text-sm text-cyan-300">Review →</span>}
            </div>
          );
          return <li key={n.id}>{n.link ? <Link href={n.link}>{body}</Link> : body}</li>;
        })}
      </ul>
    </div>
  );
}
