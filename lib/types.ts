// Shared types. Person A owns this file; these are the shapes lib/db.ts returns,
// matching supabase/schema.sql. Reconcile with Person A's version and announce changes.

export type GeoPolygon = { type: 'Polygon'; coordinates: number[][][] };
export type GeoLineString = { type: 'LineString'; coordinates: number[][] };

export type ReportKind = 'issue' | 'lost' | 'found';
export type Category =
  | 'connectivity'
  | 'water'
  | 'waste'
  | 'paths'
  | 'accessibility'
  | 'pests'
  | 'lost_found'
  | 'other';
export type FixPath = 'staff' | 'self_fixable' | 'lost_found';
export type MissionType = 'return' | 'delivery' | 'search' | 'access_check' | 'verify' | 'tidy';
export type MissionStatus = 'open' | 'claimed' | 'submitted' | 'completed' | 'cancelled';
export type Whereabouts = 'with_finder' | 'at_office' | 'picked_up';
export type AccessNeed = 'wheelchair' | 'crutches' | 'low_vision' | 'no_stairs';

export interface User {
  id: string;
  sjsu_email: string;
  display_name: string;
  role: 'student' | 'office' | 'moderator';
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
  radius_m: number;            // lost items render as a soft circle of this radius, never a point
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
  footprint: GeoPolygon | null;
  building: string | null;
  floor: string | null;
  fix_path: FixPath;
  hazard_flags: string[];
  access_impact: string[];
  routed_to: string | null;
  contains_sensitive: boolean;
  status: string;
  created_at: string;
  votes: number;
  mission: Mission | null;      // the open/claimed mission on this pin, if any
  item: ItemDetails | null;     // lost & found details
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
  fix_path?: FixPath;           // from lib/fixPath.ts; defaults to lost_found / staff
  hazard_flags?: string[];
  access_impact?: string[];
  routed_to?: string;
  contains_sensitive?: boolean;
  // lost & found only
  radius_m?: number;
  item_category?: string;
  color?: string;
  brand?: string;
  marks?: string;
  lost_from?: string;
  lost_to?: string;
  leave_for_delivery?: boolean; // found item left for another student to carry in
}

export interface NewProof {
  photo_urls: string[];
  lat: number;
  lng: number;
  speed_test_mbps?: number;
  taken_at?: string;
}

export interface AccessAlert {
  id: string;
  report_id: string;
  affects: AccessNeed[];
  obstacle_style: 'zone' | 'pothole' | 'barrier' | 'elevator' | 'route';
  impact: 'blocks' | 'caution';
  label: string | null;
  detour_text: string | null;
  detour_path: GeoLineString | null;
  blocked_path: GeoLineString | null;
  est_delay_min: number | null;
  confirmed: boolean;
  title: string;
  category: Category;
  status: string;
  building: string | null;
  floor: string | null;
  lat: number;
  lng: number;
  footprint: GeoPolygon | null;
}

export interface Match {
  id: string;
  lost_report_id: string;
  found_report_id: string;
  score: number;
  status: 'suggested' | 'confirmed' | 'rejected';
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  mission_id: string | null;
  report_id: string | null;
  state: 'pending' | 'spendable' | 'reversed';
  created_at: string;
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
  review_status: 'pending' | 'approved' | 'rejected';
  mission_type: MissionType;
  mission_title: string;
  points: number;
  report_id: string;
  report_title: string;
  report_photo_urls: string[];
  fix_path: FixPath;
}
