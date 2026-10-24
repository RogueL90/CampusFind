import type { User } from "@/lib/types";

export const DEMO_USERS: User[] = [
  { id: "u-maya", sjsu_email: "maya.r@sjsu.edu", display_name: "Maya", role: "student" },
  { id: "u-leo", sjsu_email: "leo.t@sjsu.edu", display_name: "Leo", role: "student" },
  { id: "u-office", sjsu_email: "lostandfound@sjsu.edu", display_name: "Lost & Found desk", role: "office" },
  { id: "u-mod", sjsu_email: "moderator@sjsu.edu", display_name: "Moderator", role: "moderator" },
];

const KEY = "cq-current-user";
const EVENT = "cq-current-user-change";

export function getCurrentUserId(): string {
  if (typeof window === "undefined") return "u-leo";
  return localStorage.getItem(KEY) ?? "u-leo";
}

export function setCurrentUserId(id: string) {
  localStorage.setItem(KEY, id);
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
