"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_USER_ID, DEMO_USERS, getCurrentUserId, onCurrentUserChange } from "@/lib/currentUser";

export function useCurrentUser() {
  const id = useSyncExternalStore(onCurrentUserChange, getCurrentUserId, () => DEFAULT_USER_ID);
  return DEMO_USERS.find((u) => u.id === id) ?? DEMO_USERS[1];
}
