import type { ReactNode } from "react";
import UserSwitcher from "./UserSwitcher";

export default function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-cyan-400/15 bg-[#05080f]/90 px-4 py-3 backdrop-blur">
        <h1 className="font-mono text-sm uppercase tracking-widest text-cyan-300">{title}</h1>
        <UserSwitcher />
      </header>
      <div className="mx-auto max-w-2xl p-4">{children}</div>
    </div>
  );
}

export function ComingSoon({ owner, what }: { owner: string; what: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
      <p className="text-slate-200">{what}</p>
      <p className="mt-2">
        Built by {owner}. See <code className="text-cyan-300">roles/</code> in the project docs.
      </p>
    </div>
  );
}
