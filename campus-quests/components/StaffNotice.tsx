"use client";

import { DEMO_USERS, setCurrentUserId } from "@/lib/currentUser";
import type { Role } from "@/lib/types";
import { useCurrentUser } from "@/lib/useCurrentUser";

/** Staff screens work for anyone in the demo, but nudge the presenter to switch to the right persona. */
export default function StaffNotice({ roles }: { roles: Role[] }) {
  const user = useCurrentUser();
  if (roles.includes(user.role)) return null;
  const staff = DEMO_USERS.find((u) => u.role === roles[0]);
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
      <span className="flex-1">This is a staff screen. You&apos;re signed in as {user.display_name}.</span>
      {staff && (
        <button onClick={() => setCurrentUserId(staff.id)} className="shrink-0 rounded-lg bg-amber-300 px-2.5 py-1 font-semibold text-slate-950">
          Switch to {staff.display_name}
        </button>
      )}
    </div>
  );
}
