// Shared types. These are the shapes lib/db.ts (Supabase) and lib/mock.ts both return,
// matching supabase/schema.sql. Change them here first, then in the schema.
import type { LineString, Polygon } from "geojson";
import type { TriageCategory } from "./categories";

export type ReportKind = "issue" | "lost" | "found";

/** Map categories: each has a color and filter chip (lib/geo/campus.ts). */
export type Category =
  | "connectivity"
  | "water"
  | "waste"
  | "paths"
  | "accessibility"
  | "pests"
  | "lost_found"
  | "other";

export type FixPath = "staff" | "self_fixable" | "lost_found";
export type MissionType = "return" | "delivery" | "search" | "access_check" | "verify" | "tidy";
export type MissionStatus = "open" | "claimed" | "submitted" | "completed" | "cancelled";
export type Whereabouts = "with_finder" | "at_office" | "picked_up";
export type AccessNeed = "wheelchair" | "crutches" | "low_vision" | "no_stairs";
export type Role = "student" | "office" | "moderator";

/**
 * Report lifecycle (set by the database functions):
 * issues: submitted → routed | mission_open → in_progress → verifying → verified | resolved
 * lost: searching → matched → checked_in → closed
 * found: with_finder → checked_in → closed
 */
export type ReportStatus = string;

export interface User {
  id: string;
  sjsu_email: string;
  display_name: string;
  role: Role;
}

export interface Mission {
  id: string;
  report_id: string;
  mission_type: MissionType;
  title: string;
  points: number;
  proof_required: string;
  status: MissionStatus;
  claimed_by: string | null;
  claimed_at?: string | null;
  claim_expires_at: string | null;
  completed_at?: string | null;
  report_title?: string;
}

export interface ItemDetails {
  category: string | null;
  color: string | null;
  brand: string | null;
  marks: string | null;
  /** Lost items render as a soft circle of this radius, never a point. */
  radius_m: number;
  whereabouts: Whereabouts | null;
  lost_from: string | null;
  lost_to: string | null;
}

export interface Report {
  id: string;
  reporter_id: string | null;
  kind: ReportKind;
  category: Category;
  issue_type: string | null;
  severity: number | null;
  title: string;
  description: string | null;
  photo_urls: string[];
  lat: number;
  lng: number;
  /** Area covered by an obstacle such as a construction zone. */
  footprint: Polygon | null;
  building: string | null;
  floor: string | null;
  fix_path: FixPath;
  hazard_flags: string[];
  access_impact: string[];
  /** Authority id from lib/categories.ts, e.g. "it_services". */
  routed_to: string | null;
  cc: string[];
  /** What the vision model saw in the photo. */
  identified: string | null;
  routing_reason: string | null;
  /** The written report the authority received. */
  report_subject: string | null;
  report_body: string | null;
  /** Blur the photo for everyone except the reporter. */
  contains_sensitive: boolean;
  status: ReportStatus;
  created_at: string;
  votes: number;
  /** Latest "Still there" / "Looks resolved" check by a student. */
  last_checked_at: string | null;
  last_check_still: boolean | null;
  /** "Looks resolved" checks since the last "Still there"; 3 resolve the report. */
  resolved_votes: number;
  /** The open, claimed or submitted mission on this pin, if any. */
  mission: Mission | null;
  /** Lost & found details. */
  item: ItemDetails | null;
}

export interface NewReport {
  kind: ReportKind;
  category: Category;
  issue_type?: string;
  severity?: number;
  title: string;
  description?: string;
  photo_urls?: string[];
  lat: number;
  lng: number;
  building?: string;
  floor?: string;
  /** From lib/fixPath.ts; the database defaults to lost_found / staff. */
  fix_path?: FixPath;
  hazard_flags?: string[];
  access_impact?: string[];
  routed_to?: string;
  cc?: string[];
  identified?: string;
  routing_reason?: string;
  report_subject?: string;
  report_body?: string;
  contains_sensitive?: boolean;
  // lost & found only
  radius_m?: number;
  item_category?: string;
  color?: string;
  brand?: string;
  marks?: string;
  lost_from?: string;
  lost_to?: string;
  /** Found item left for another student to carry to the office. */
  leave_for_delivery?: boolean;
}

export interface NewProof {
  photo_urls: string[];
  lat: number;
  lng: number;
  speed_test_mbps?: number;
  taken_at?: string;
}

export type ObstacleStyle = "zone" | "pothole" | "barrier" | "elevator" | "route";
export type ObstacleImpact = "blocks" | "caution";

export interface AccessAlert {
  id: string;
  report_id: string;
  affects: AccessNeed[];
  obstacle_style: ObstacleStyle;
  impact: ObstacleImpact;
  /** Short label floated over the obstacle in 3D, e.g. "Elevator out · floors 2–5". */
  label: string | null;
  detour_text: string | null;
  detour_path: LineString | null;
  /** Path segment the obstacle blocks (barrier walls and blocked routes). */
  blocked_path: LineString | null;
  est_delay_min: number | null;
  /** Staff confirmed, or 3 "Me too" votes. Only confirmed obstacles raise alerts. */
  confirmed: boolean;
  title: string;
  category: Category;
  status: ReportStatus;
  building: string | null;
  floor: string | null;
  lat: number;
  lng: number;
  footprint: Polygon | null;
}

export interface Match {
  id: string;
  lost_report_id: string;
  found_report_id: string;
  score: number;
  status: "suggested" | "confirmed" | "rejected";
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  mission_id: string | null;
  proof_id?: string | null;
  report_id: string | null;
  state: "pending" | "spendable" | "reversed";
  created_at: string;
}

export interface Balance {
  pending: number;
  spendable: number;
}

export interface Notification {
  id: string;
  user_id: string;
  text: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface Reward {
  id: string;
  name: string;
  cost_points: number;
  partner: string | null;
  stock: number | null;
}

export interface Redemption {
  id: string;
  reward_id: string;
  code: string;
  points_spent: number;
  redeemed_at: string;
}

export interface StatusEvent {
  id: number;
  report_id: string;
  from_status: string | null;
  to_status: string;
  actor_id: string | null;
  at: string;
}

export interface ProofForReview {
  id: string;
  mission_id: string;
  helper_id: string;
  helper_name: string;
  photo_urls: string[];
  speed_test: number | null;
  lat: number;
  lng: number;
  distance_m: number;
  taken_at: string;
  review_status: "pending" | "approved" | "rejected";
  mission_type: MissionType;
  mission_title: string;
  points: number;
  report_id: string;
  report_title: string;
  report_photo_urls: string[];
  fix_path: FixPath;
}

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

/** What /api/triage returns, from Claude or the keyword fallback. */
export type Triage = {
  /** What the AI decided this is: a campus issue, or an item someone lost or found. */
  kind: ReportKind;
  category: TriageCategory;
  /** For issues: e.g. "litter", "slow_wifi". For items: the item type, e.g. "airpods_case". */
  issue_type: string;
  severity: number;
  title: string;
  hazard_flags: string[];
  access_impact: string[];
  /** Authority id from lib/categories.ts AUTHORITIES. */
  routed_to: string | null;
  cc: string[];
  identified: string;
  routing_reason: string;
  /** The report sent to the authority. Location and time are appended on save. */
  report_subject: string;
  report_body: string;
  contains_sensitive: boolean;
  color: string | null;
  brand: string | null;
  marks: string | null;
  /** Which backend produced this triage. Not stored. */
  source?: "claude" | "mock";
};
