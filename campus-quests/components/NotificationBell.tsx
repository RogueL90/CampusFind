"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getNotifications, subscribeNotifications } from "@/lib/data";
import { useCurrentUser } from "@/lib/useCurrentUser";

function BellIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Inbox bell. Buzzes and bounces when something new lands, so the demo phone reacts on stage. */
export default function NotificationBell({ className = "", stacked = false }: { className?: string; stacked?: boolean }) {
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

  const label = unread ? `Inbox, ${unread} unread` : "Inbox";
  const badge =
    unread > 0 ? (
      <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
        {unread}
      </span>
    ) : null;

  if (stacked) {
    return (
      <Link
        href="/inbox"
        aria-label={label}
        className={`hud-panel relative flex w-12 flex-col items-center rounded-xl py-1.5 text-base leading-none text-slate-100 ${pulse ? "animate-bounce ring-1 ring-cyan-300" : ""} ${className}`}
      >
        <span className="grid h-4 w-4 place-items-center">
          <BellIcon className="h-4 w-4" />
        </span>
        <span className="mt-1 font-mono text-[8px] uppercase tracking-wider text-slate-400">Inbox</span>
        {badge}
      </Link>
    );
  }

  return (
    <Link
      href="/inbox"
      aria-label={label}
      className={`hud-panel relative grid h-9 w-9 place-items-center rounded-xl text-cyan-100 ${pulse ? "animate-bounce ring-1 ring-cyan-300" : ""} ${className}`}
    >
      <BellIcon className="h-5 w-5" />
      {badge}
    </Link>
  );
}
