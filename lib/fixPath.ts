import type { FixPath, ReportKind } from "./types";

/**
 * Categories a student can safely help with as a mission (pick up litter, verify Wi-Fi with a
 * speed test). Moderators can override the tag; overrides are logged so this list can be tuned.
 */
export const SELF_FIX_ALLOWLIST = new Set(["garbage", "weak_wifi", "bottle_filler"]);

/** Severity at or below this counts as "low". */
export const LOW_SEVERITY_MAX = 2;

export type FixPathInput = {
  kind: ReportKind;
  category?: string | null;
  severity?: number | null;
  hazard_flags?: string[] | null;
};

/**
 * Decide what the map does with a report (MASTER.md "How a report becomes a mission"):
 * - lost and found reports enter matching: `lost_found`
 * - allowlisted category + low severity + no hazard flags: `self_fixable`
 * - everything else goes to the authority only: `staff`
 */
export function fixPath(r: FixPathInput): FixPath {
  if (r.kind === "lost" || r.kind === "found") return "lost_found";

  const severity = r.severity ?? Number.POSITIVE_INFINITY;
  const hazards = r.hazard_flags ?? [];

  if (!SELF_FIX_ALLOWLIST.has(r.category ?? "")) return "staff";
  if (severity > LOW_SEVERITY_MAX) return "staff";
  if (hazards.length > 0) return "staff";
  return "self_fixable";
}
