// Demo "login": the chosen demo user's id lives in localStorage. No real auth for the demo.
// Ids match supabase/seed.sql.
import type { User } from "@/lib/types";

export const DEMO_USERS: User[] = [
  { id: "a0000000-0000-4000-8000-000000000001", sjsu_email: "maya@sjsu.edu", display_name: "Maya", role: "student" },
  { id: "a0000000-0000-4000-8000-000000000002", sjsu_email: "leo@sjsu.edu", display_name: "Leo", role: "student" },
  { id: "a0000000-0000-4000-8000-000000000003", sjsu_email: "lostandfound@sjsu.edu", display_name: "Lost & Found desk", role: "office" },
  { id: "a0000000-0000-4000-8000-000000000004", sjsu_email: "moderator@sjsu.edu", display_name: "Moderator", role: "moderator" },
];

export const [MAYA, LEO, OFFICE, MODERATOR] = DEMO_USERS.map((u) => u.id);

/** Leo opens the app: he has 60 points and is the one who finds and returns the AirPods. */
export const DEFAULT_USER_ID = LEO;

const KEY = "cq-current-user";
const EVENT = "cq-current-user-change";

export function getCurrentUserId(): string {
  if (typeof window === "undefined") return DEFAULT_USER_ID;
  try {
    const id = localStorage.getItem(KEY);
    return id && DEMO_USERS.some((u) => u.id === id) ? id : DEFAULT_USER_ID;
  } catch {
    return DEFAULT_USER_ID;
  }
}

export function setCurrentUserId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // private mode: the event below still switches this tab
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onCurrentUserChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function userName(id: string | null | undefined): string {
  return DEMO_USERS.find((u) => u.id === id)?.display_name ?? "A student";
}
