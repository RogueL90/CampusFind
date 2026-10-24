"use client";

import { DEMO_USERS, setCurrentUserId } from "@/lib/currentUser";
import { useCurrentUser } from "@/lib/useCurrentUser";

export default function UserSwitcher({ compact = false }: { compact?: boolean }) {
  const user = useCurrentUser();
  return (
    <label className={`hud-panel relative flex items-center gap-1.5 rounded-xl ${compact ? "p-1.5" : "px-3 py-2"} text-xs text-cyan-100`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400 font-semibold text-slate-950" aria-hidden>
        {user.display_name[0]}
      </span>
      <select
        value={user.id}
        onChange={(e) => setCurrentUserId(e.target.value)}
        className={compact ? "absolute inset-0 opacity-0" : "bg-transparent outline-none"}
        aria-label="Demo user"
      >
        {DEMO_USERS.map((u) => (
          <option key={u.id} value={u.id} className="bg-slate-900">
            {u.display_name}
          </option>
        ))}
      </select>
    </label>
  );
}
