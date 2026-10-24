// Demo "login": the chosen demo user's id lives in localStorage. No real auth for the demo.
// Ids match supabase/seed.sql.
import { useSyncExternalStore } from 'react';
import type { User } from './types';

export const DEMO_USERS: User[] = [
  { id: 'a0000000-0000-4000-8000-000000000001', sjsu_email: 'maya@sjsu.edu', display_name: 'Maya', role: 'student' },
  { id: 'a0000000-0000-4000-8000-000000000002', sjsu_email: 'leo@sjsu.edu', display_name: 'Leo', role: 'student' },
  { id: 'a0000000-0000-4000-8000-000000000003', sjsu_email: 'lostandfound@sjsu.edu', display_name: 'Lost & Found desk', role: 'office' },
  { id: 'a0000000-0000-4000-8000-000000000004', sjsu_email: 'moderator@sjsu.edu', display_name: 'Moderator', role: 'moderator' },
];

const STORAGE_KEY = 'cq.userId';
const CHANGE_EVENT = 'cq:user-changed';

export function getCurrentUserId(): string {
  if (typeof window === 'undefined') return DEMO_USERS[0].id;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEMO_USERS[0].id;
  } catch {
    return DEMO_USERS[0].id;
  }
}

export function setCurrentUserId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // private mode: the switch still applies to this tab via the event below
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useCurrentUser(): { user: User; setUser: (id: string) => void } {
  const id = useSyncExternalStore(subscribe, getCurrentUserId, () => DEMO_USERS[0].id);
  const user = DEMO_USERS.find((u) => u.id === id) ?? DEMO_USERS[0];
  return { user, setUser: setCurrentUserId };
}
