"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DEMO_USERS, STAFF_ROLES, setCurrentUserId } from "@/lib/currentUser";
import type { Role } from "@/lib/types";
import { useCurrentUser } from "@/lib/useCurrentUser";

/** Staff screens render only for the given roles. Demo-only gate: real enforcement belongs in the database. */
export default function StaffGate({ roles = STAFF_ROLES, children }: { roles?: Role[]; children: ReactNode }) {
  const user = useCurrentUser();
  if (roles.includes(user.role)) return children;
  const staff = DEMO_USERS.filter((u) => roles.includes(u.role));
  return (
    <div className="hud-panel rounded-2xl p-6 text-center">
      <div className="text-4xl" aria-hidden>
        🔒
      </div>
      <h2 className="mt-2 text-lg font-semibold text-white">Staff only</h2>
      <p className="mt-1 text-sm text-slate-400">You&apos;re signed in as {user.display_name}. Switch to a staff account to open this screen.</p>
      <div className="mt-4 flex flex-col gap-2">
        {staff.map((u) => (
          <button key={u.id} onClick={() => setCurrentUserId(u.id)} className="rounded-xl bg-amber-300 py-2.5 text-sm font-semibold text-slate-950">
            Switch to {u.display_name}
          </button>
        ))}
        <Link href="/" className="rounded-xl border border-white/15 py-2.5 text-sm text-white">
          Back to the map
        </Link>
      </div>
    </div>
  );
}
