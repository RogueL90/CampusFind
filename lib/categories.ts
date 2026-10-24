// Report categories and the campus authorities reports are routed to.
// Claude picks both from these lists; the defaults below are the fallback when it can't.
import type { Category } from "./types";

export const AUTHORITIES = {
  fdo_maintenance: {
    name: "Facilities (FD&O) – Maintenance",
    handles: "plumbing, leaks, drains, flooding, electrical, streetlights, manholes, elevators, ramps, doors, building repairs",
  },
  fdo_grounds: {
    name: "Facilities (FD&O) – Grounds",
    handles: "trees, landscaping, sidewalks and walkways, playgrounds and outdoor furniture, dead animals outdoors",
  },
  fdo_custodial: {
    name: "Facilities (FD&O) – Custodial & Waste",
    handles: "garbage, litter, overflowing bins, graffiti removal, spills indoors, furniture left out of place",
  },
  it_services: {
    name: "IT Services",
    handles: "weak or no Wi-Fi, network outages, broken lab computers, printers, classroom AV",
  },
  upd: {
    name: "University Police (UPD)",
    handles: "noise complaints, abandoned vehicles, vandalism in progress, anything that is an immediate danger to people",
  },
  parking: {
    name: "Parking & Transportation Services",
    handles: "campus roads and garages, traffic signs, road markings, vehicles in campus lots",
  },
  ehs: {
    name: "Environmental Health & Safety",
    handles: "chemical or biohazard exposure, sewage, contaminated flooding, pests, dead animals that may carry disease",
  },
  housing: {
    name: "University Housing Services",
    handles: "problems inside or around the residence halls",
  },
  city_sj: {
    name: "City of San José (311)",
    handles: "public streets and traffic signals bordering campus that SJSU does not own",
  },
  lost_found: {
    name: "Lost & Found office",
    handles: "lost and found personal items",
  },
} as const;

export type AuthorityId = keyof typeof AUTHORITIES;
export const AUTHORITY_IDS = Object.keys(AUTHORITIES) as AuthorityId[];

/** Triage categories Claude picks from. `map` is the filter chip and beacon color it shows under. */
export const ISSUE_CATEGORIES = {
  pothole: { label: "Pothole", icon: "⚠️", authority: "parking", map: "paths" },
  construction: { label: "Construction zone", icon: "🚧", authority: "fdo_maintenance", map: "paths" },
  garbage: { label: "Garbage", icon: "🗑️", authority: "fdo_custodial", map: "waste" },
  broken_streetlight: { label: "Broken streetlight", icon: "💡", authority: "fdo_maintenance", map: "paths" },
  road_damage: { label: "Road damage", icon: "🚧", authority: "parking", map: "paths" },
  graffiti: { label: "Graffiti", icon: "🎨", authority: "fdo_custodial", map: "waste" },
  noise_complaint: { label: "Noise complaint", icon: "🔊", authority: "upd", map: "other" },
  damaged_sidewalk: { label: "Damaged sidewalk", icon: "👣", authority: "fdo_grounds", map: "paths" },
  damaged_traffic_sign: { label: "Damaged traffic sign", icon: "🪧", authority: "parking", map: "paths" },
  fallen_tree: { label: "Fallen tree", icon: "🌳", authority: "fdo_grounds", map: "paths" },
  clogged_drain: { label: "Clogged drain", icon: "🌀", authority: "fdo_maintenance", map: "water" },
  park_playground_damage: { label: "Park / playground damage", icon: "🛝", authority: "fdo_grounds", map: "other" },
  broken_traffic_signal: { label: "Broken traffic signal", icon: "🚦", authority: "city_sj", map: "paths" },
  abandoned_vehicle: { label: "Abandoned vehicle", icon: "🚗", authority: "parking", map: "other" },
  dead_animal: { label: "Dead animal", icon: "🐾", authority: "fdo_grounds", map: "pests" },
  water_leakage: { label: "Water leakage", icon: "💧", authority: "fdo_maintenance", map: "water" },
  open_manhole: { label: "Open manhole", icon: "⭕", authority: "fdo_maintenance", map: "paths" },
  flooding: { label: "Flooding", icon: "🌊", authority: "fdo_maintenance", map: "water" },
  weak_wifi: { label: "Weak Wi-Fi / internet", icon: "📶", authority: "it_services", map: "connectivity" },
  bottle_filler: { label: "Bottle filler / fountain", icon: "🚰", authority: "fdo_maintenance", map: "water" },
  accessibility_barrier: { label: "Ramp, elevator or door barrier", icon: "♿", authority: "fdo_maintenance", map: "accessibility" },
  pests: { label: "Pests (rats, ants, bees)", icon: "🐀", authority: "ehs", map: "pests" },
  other: { label: "Other", icon: "📝", authority: "fdo_maintenance", map: "other" },
} as const satisfies Record<string, { label: string; icon: string; authority: AuthorityId; map: Category }>;

export type IssueCategory = keyof typeof ISSUE_CATEGORIES;
export const ISSUE_CATEGORY_IDS = Object.keys(ISSUE_CATEGORIES) as IssueCategory[];

export type TriageCategory = IssueCategory | "lost_found";

export function categoryLabel(c: string): string {
  if (c === "lost_found") return "Lost & Found";
  return ISSUE_CATEGORIES[c as IssueCategory]?.label ?? c.replace(/_/g, " ");
}

export function authorityName(id: string | null | undefined): string {
  return id ? (AUTHORITIES[id as AuthorityId]?.name ?? id) : "the right campus team";
}

export function defaultAuthority(category: string): AuthorityId {
  if (category === "lost_found") return "lost_found";
  return ISSUE_CATEGORIES[category as IssueCategory]?.authority ?? "fdo_maintenance";
}

/** Which map category a triaged report shows under. */
export function mapCategory(c: TriageCategory): Category {
  if (c === "lost_found") return "lost_found";
  return ISSUE_CATEGORIES[c]?.map ?? "other";
}
