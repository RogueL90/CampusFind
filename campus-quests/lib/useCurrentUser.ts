"use client";

import { useSyncExternalStore } from "react";
import { DEMO_USERS, getCurrentUserId, onCurrentUserChange } from "@/lib/currentUser";

export function useCurrentUser() {
  const id = useSyncExternalStore(onCurrentUserChange, getCurrentUserId, () => "u-leo");
  return DEMO_USERS.find((u) => u.id === id) ?? DEMO_USERS[1];
}
