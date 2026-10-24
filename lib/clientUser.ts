"use client";

import { useEffect, useState } from "react";
import { DEMO_USERS, USER_COOKIE, userById, type DemoUser } from "./users";

const EVENT = "cq-user-change";

function readCookie(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${USER_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setDemoUser(id: string) {
  document.cookie = `${USER_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  window.dispatchEvent(new Event(EVENT));
}

/** The demo user picked in the header; null until mounted (cookie is client-only). */
export function useDemoUser(): DemoUser | null {
  const [user, setUser] = useState<DemoUser | null>(null);
  useEffect(() => {
    const sync = () => setUser(userById(readCookie()));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return user;
}

export { DEMO_USERS };
