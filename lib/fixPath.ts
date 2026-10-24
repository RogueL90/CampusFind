import type { FixPath, ReportKind } from "./types";
import { isVolunteerDepartment } from "./volunteer";

/**
 * Issue categories a registered student volunteer may ever handle: litter and overflowing trash,
 * checking a Wi-Fi complaint with a speed test, checking a bottle filler. Moderators can override
 * the tag; overrides are logged so this list can be tuned.
 */
export const SELF_FIX_ALLOWLIST = new Set(["garbage", "weak_wifi", "bottle_filler"]);

/** Severity at or below this counts as "low". */
export const LOW_SEVERITY_MAX = 2;

export type FixPathInput = {
  kind: ReportKind;
  category?: string | null;
  severity?: number | null;
  hazard_flags?: string[] | null;
  /** Authority the report is routed to. Student tasks need one that runs a volunteer program. */
  routed_to?: string | null;
  /** Claude's call. It can only make a report staff-only; it can't bypass the rules below. */
  student_solvable?: boolean | null;
};

/**
 * Decide what the map does with a report (MASTER.md "How a report becomes a mission"):
 * - lost and found reports enter matching: `lost_found`
 * - "Student solvable" (`self_fixable`): Claude says a student can safely do it, and it is an
 *   allowlisted category, low severity, has no hazard flags and goes to a department with volunteers
 * - everything else is "Unsolvable" and goes to the authority only: `staff`
 */
export function fixPath(r: FixPathInput): FixPath {
  if (r.kind === "lost" || r.kind === "found") return "lost_found";

  const severity = r.severity ?? Number.POSITIVE_INFINITY;
  const hazards = r.hazard_flags ?? [];

  if (r.student_solvable === false) return "staff";
  if (!SELF_FIX_ALLOWLIST.has(r.category ?? "")) return "staff";
  if (severity > LOW_SEVERITY_MAX) return "staff";
  if (hazards.length > 0) return "staff";
  if (r.routed_to != null && !isVolunteerDepartment(r.routed_to)) return "staff";
  return "self_fixable";
}
