// Shared shapes for reports, triage, matches and notifications.
// Field names follow the MASTER.md data model.

export type ReportKind = "issue" | "lost" | "found";
export type FixPath = "staff" | "self_fixable" | "lost_found";

export type Category =
  | "connectivity"
  | "water"
  | "waste"
  | "paths"
  | "accessibility"
  | "pests"
  | "lost_found";

export const CATEGORIES: Category[] = [
  "connectivity",
  "water",
  "waste",
  "paths",
  "accessibility",
  "pests",
  "lost_found",
];

export const HAZARD_FLAGS = [
  "electrical",
  "chemical",
  "biohazard",
  "pests",
  "broken_glass",
  "heights",
  "restricted_area",
] as const;
export type HazardFlag = (typeof HAZARD_FLAGS)[number];

/** What /api/triage returns, whether it came from EAiSER, a vision model or the mock. */
export type Triage = {
  category: Category;
  /** For issues: e.g. "litter", "slow_wifi". For items: the item type, e.g. "airpods_case". */
  issue_type: string;
  severity: number; // 1-5
  title: string;
  hazard_flags: string[];
  access_impact: string[];
  routed_to: string | null;
  contains_sensitive: boolean;
  color: string | null;
  brand: string | null;
  marks: string | null;
  /** Which backend produced this triage. Not stored. */
  source?: "eaiser" | "openai" | "gemini" | "mock";
};

export type Report = {
  id: string;
  reporter_id: string;
  kind: ReportKind;
  category: Category;
  issue_type: string;
  severity: number;
  title: string;
  description: string | null;
  photo_urls: string[];
  lat: number;
  lng: number;
  building: string | null;
  floor: string | null;
  fix_path: FixPath;
  hazard_flags: string[];
  access_impact: string[];
  routed_to: string | null;
  contains_sensitive: boolean;
  status: string;
  created_at: string;
  /** Present on lost and found reports (the `items` table). */
  item?: Item | null;
};

export type Item = {
  category: string; // item type, mirrors report.issue_type
  color: string | null;
  brand: string | null;
  marks: string | null;
  /** Lost reports: radius of the "lost somewhere around here" circle. */
  radius_m: number | null;
  /** Lost reports: optional window when it was lost. */
  lost_from: string | null;
  lost_to: string | null;
  whereabouts: "with_finder" | "at_office" | "picked_up" | null;
};

export type NewReport = Omit<Report, "id" | "created_at" | "status" | "fix_path"> & {
  status?: string;
};

export type MatchStatus = "suggested" | "confirmed" | "rejected";

export type Match = {
  id: string;
  lost_report_id: string;
  found_report_id: string;
  score: number;
  status: MatchStatus;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};
