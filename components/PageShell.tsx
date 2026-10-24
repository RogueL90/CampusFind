import Link from "next/link";
import type { ReactNode } from "react";
import type { Role } from "@/lib/types";
import NotificationBell from "./NotificationBell";
import StaffGate from "./StaffGate";
import UserSwitcher from "./UserSwitcher";

export default function PageShell({
  title,
  back,
  staffOnly,
  children,
}: {
  title: string;
  back?: string;
  /** Show the content only to these roles (`true` = any staff role). */
  staffOnly?: Role[] | true;
  children: ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-cyan-400/15 bg-[#05080f]/90 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          {back && (
            <Link href={back} aria-label="Back" className="text-lg leading-none text-slate-400">
              ‹
            </Link>
          )}
          <h1 className="truncate font-mono text-sm uppercase tracking-widest text-cyan-300">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <UserSwitcher />
        </div>
      </header>
      <div className="mx-auto max-w-2xl p-4">
        {staffOnly ? <StaffGate roles={staffOnly === true ? undefined : staffOnly}>{children}</StaffGate> : children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">{children}</div>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200">
      {children}
    </p>
  );
}
