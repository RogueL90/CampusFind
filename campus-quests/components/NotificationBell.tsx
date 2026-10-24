"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getNotifications, subscribeNotifications } from "@/lib/data";
import { useCurrentUser } from "@/lib/useCurrentUser";

/** Inbox bell. Buzzes and bounces when something new lands, so the demo phone reacts on stage. */
export default function NotificationBell({ className = "" }: { className?: string }) {
  const user = useCurrentUser();
  const [unread, setUnread] = useState(0);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    let alive = true;
    let last: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      getNotifications(user.id).then((list) => {
        if (!alive) return;
        const count = list.filter((n) => !n.read).length;
        if (last !== null && count > last) {
          setPulse(true);
          // Browsers block vibration until the user has tapped the page.
          if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([120, 60, 120]);
          clearTimeout(timer);
          timer = setTimeout(() => setPulse(false), 2000);
        }
        last = count;
        setUnread(count);
      });
    load();
    const unsubscribe = subscribeNotifications(user.id, load);
    return () => {
      alive = false;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [user.id]);

  return (
    <Link
      href="/inbox"
      aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}
      className={`hud-panel relative grid h-9 w-9 place-items-center rounded-xl text-cyan-100 ${pulse ? "animate-bounce ring-1 ring-cyan-300" : ""} ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {unread}
        </span>
      )}
    </Link>
  );
}
