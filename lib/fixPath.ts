import type { FixPath, ReportKind } from "./types";

/**
 * Issue types a student can safely handle as a mission (verify or quick tidy).
 * Moderators can override the tag; overrides are logged so this list can be tuned.
 */
export const SELF_FIX_ALLOWLIST = new Set([
  "litter",
  "misplaced_chairs",
  "slow_wifi",
  "wifi_dead_zone",
  "bottle_filler_broken",
  "bottle_filler_filter_light",
]);

/** Severity at or below this counts as "low". */
export const LOW_SEVERITY_MAX = 2;

/** Categories that are never missions, whatever the issue type (MASTER.md: pests are report-only). */
const NEVER_SELF_FIX = new Set(["pests"]);

export type FixPathInput = {
  kind: ReportKind;
  category?: string | null;
  issue_type?: string | null;
  severity?: number | null;
  hazard_flags?: string[] | null;
};

/**
 * Decide what the map does with a report (MASTER.md "How a report becomes a mission"):
 * - lost and found reports enter matching: `lost_found`
 * - allowlisted issue type + low severity + no hazard flags: `self_fixable`
 * - everything else goes to the authority only: `staff`
 */
export function fixPath(r: FixPathInput): FixPath {
  if (r.kind === "lost" || r.kind === "found") return "lost_found";

  const issueType = (r.issue_type ?? "").trim().toLowerCase();
  const severity = r.severity ?? Number.POSITIVE_INFINITY;
  const hazards = r.hazard_flags ?? [];

  if (r.category && NEVER_SELF_FIX.has(r.category)) return "staff";
  if (!SELF_FIX_ALLOWLIST.has(issueType)) return "staff";
  if (severity > LOW_SEVERITY_MAX) return "staff";
  if (hazards.length > 0) return "staff";
  return "self_fixable";
}
