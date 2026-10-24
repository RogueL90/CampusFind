import { authorityName } from "@/lib/categories";
import { fixPath } from "@/lib/fixPath";
import type { FixPath, Triage } from "@/lib/types";
import { SOLVABILITY, VOLUNTEER_PROGRAMS, volunteerDepartment } from "@/lib/volunteer";

/** "Student solvable" or "Unsolvable" chip for an issue. Lost and found reports get none. */
export function SolvabilityBadge({ fixPath: path, className = "" }: { fixPath: FixPath; className?: string }) {
  if (path === "lost_found") return null;
  const solvable = path === "self_fixable";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        solvable ? "bg-emerald-400/15 text-emerald-200" : "bg-slate-400/15 text-slate-300"
      } ${className}`}
      title={SOLVABILITY[path].hint}
    >
      <span aria-hidden>{solvable ? "🧹" : "🛠️"}</span>
      {SOLVABILITY[path].label}
    </span>
  );
}

/** Confirm screen: what Claude decided, why, and who students would volunteer with. */
export function SolvabilityNote({ triage }: { triage: Triage }) {
  const path = fixPath(triage);
  const dept = volunteerDepartment(triage);
  const solvable = path === "self_fixable";
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-sm ${solvable ? "border-emerald-400/30 bg-emerald-400/5" : "border-white/10 bg-white/5"}`}>
      <SolvabilityBadge fixPath={path} />
      {triage.solvable_reason && <p className="mt-1.5 text-slate-200">{triage.solvable_reason}</p>}
      <p className="mt-1 text-xs text-slate-400">
        {solvable && dept
          ? `It also becomes a task on the map. Students registered with ${authorityName(dept)} (${VOLUNTEER_PROGRAMS[dept].program}) can claim it for points and community service hours.`
          : `Only ${authorityName(triage.routed_to)} staff will handle it. It won't be offered to students.`}
      </p>
    </div>
  );
}
