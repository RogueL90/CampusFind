import type { LineString, Polygon } from "geojson";

export type Category =
  | "connectivity"
  | "water"
  | "waste"
  | "paths"
  | "accessibility"
  | "pests"
  | "lost_found";

export type ReportKind = "issue" | "lost" | "found";

export type FixPath = "staff" | "self_fixable" | "lost_found";

export type ReportStatus =
  | "submitted"
  | "routed"
  | "being_fixed"
  | "fixed"
  | "open_mission"
  | "claimed"
  | "proof_uploaded"
  | "verified"
  | "lost_open"
  | "matched"
  | "checked_in"
  | "picked_up"
  | "closed";

export type Role = "student" | "office" | "moderator";

export interface User {
  id: string;
  sjsu_email: string;
  display_name: string;
  role: Role;
}

export type MissionType = "return" | "search" | "access_check" | "verify" | "tidy";

export type MissionStatus = "open" | "claimed" | "proof_uploaded" | "verified" | "expired";

export interface Mission {
  id: string;
  report_id: string;
  mission_type: MissionType;
  points: number;
  proof_required: string;
  claimed_by: string | null;
  claim_expires_at: string | null;
  status: MissionStatus;
}

export interface Report {
  id: string;
  reporter_id: string;
  kind: ReportKind;
  category: Category;
  issue_type: string;
  severity: number;
  title: string;
  description: string;
  photo_urls: string[];
  lat: number;
  lng: number;
  /** Area covered by an obstacle such as a construction zone. */
  footprint: Polygon | null;
  /** Public fuzzing radius for lost items (never show the exact spot). */
  area_radius_m: number | null;
  building: string | null;
  floor: string | null;
  fix_path: FixPath;
  hazard_flags: string[];
  access_impact: string[];
  routed_to: string | null;
  status: ReportStatus;
  votes: number;
  created_at: string;
  mission: Mission | null;
}

export type AccessNeed = "wheelchair" | "crutches" | "low_vision" | "no_stairs";

export type ObstacleStyle = "zone" | "pothole" | "barrier" | "elevator" | "route";

export type ObstacleImpact = "blocks" | "caution";

export interface AccessAlert {
  report_id: string;
  affects: AccessNeed[];
  obstacle_style: ObstacleStyle;
  impact: ObstacleImpact;
  /** Short label floated over the obstacle in 3D, e.g. "Elevator out · floors 2–5". */
  label: string;
  detour_text: string;
  detour_path: LineString | null;
  /** Path segment the obstacle blocks (barrier walls and blocked routes). */
  blocked_path: LineString | null;
  est_delay_min: number;
  confirmed: boolean;
}

export interface Match {
  id: string;
  lost_report_id: string;
  found_report_id: string;
  score: number;
  status: "suggested" | "confirmed" | "rejected";
}

export interface LedgerEntry {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  mission_id: string | null;
  state: "pending" | "spendable" | "reversed";
  created_at: string;
}

export interface Reward {
  id: string;
  name: string;
  cost_points: number;
  partner: string;
  stock: number;
}

export interface Notification {
  id: string;
  user_id: string;
  text: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface NewReport {
  reporter_id: string;
  kind: ReportKind;
  category: Category;
  issue_type: string;
  severity: number;
  title: string;
  description?: string;
  photo_urls: string[];
  lat: number;
  lng: number;
  area_radius_m?: number | null;
  building?: string | null;
  floor?: string | null;
  fix_path: FixPath;
  hazard_flags?: string[];
  access_impact?: string[];
  routed_to?: string | null;
}

export interface NewProof {
  helper_id: string;
  photo_urls: string[];
  speed_test?: number | null;
  lat: number;
  lng: number;
}

export interface Proof extends NewProof {
  id: string;
  mission_id: string;
  review_status: "pending" | "approved" | "rejected";
  taken_at: string;
}

export interface Balance {
  pending: number;
  spendable: number;
}
