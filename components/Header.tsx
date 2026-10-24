"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEMO_USERS, setDemoUser, useDemoUser } from "@/lib/clientUser";
import { useNotifications } from "@/lib/useNotifications";

export default function Header() {
  const user = useDemoUser();
  const { unread } = useNotifications(user?.id);
  const [pulse, setPulse] = useState(false);
  const lastUnread = useRef(0);

  // Buzz and pulse the bell when something new lands, so the demo phone reacts on stage.
  useEffect(() => {
    if (unread > lastUnread.current) {
      setPulse(true);
      // Browsers block vibration until the user has tapped the page.
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([120, 60, 120]);
      const t = setTimeout(() => setPulse(false), 2000);
      lastUnread.current = unread;
      return () => clearTimeout(t);
    }
    lastUnread.current = unread;
  }, [unread]);

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b1020]/90 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          <span className="text-cyan-300">Campus</span> Quests
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="Demo user"
            className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-sm"
            value={user?.id ?? ""}
            onChange={(e) => setDemoUser(e.target.value)}
          >
            {!user && <option value="">…</option>}
            {DEMO_USERS.map((u) => (
              <option key={u.id} value={u.id} className="bg-slate-900">
                {u.name}
              </option>
            ))}
          </select>
          <Link
            href="/inbox"
            aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}
            className={`relative grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/5 ${
              pulse ? "animate-bounce border-cyan-300" : ""
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-xs font-bold">
                {unread}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
