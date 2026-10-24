// Report categories and the campus authorities reports are routed to.
// Claude picks both from these lists; the defaults below are the fallback when it can't.

export const AUTHORITIES = {
  fdo_maintenance: {
    name: "Facilities (FD&O) – Maintenance",
    handles: "plumbing, leaks, drains, flooding, electrical, streetlights, manholes, building repairs",
  },
  fdo_grounds: {
    name: "Facilities (FD&O) – Grounds",
    handles: "trees, landscaping, sidewalks and walkways, playgrounds and outdoor furniture, dead animals outdoors",
  },
  fdo_custodial: {
    name: "Facilities (FD&O) – Custodial & Waste",
    handles: "garbage, litter, overflowing bins, graffiti removal, spills indoors",
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
    handles: "chemical or biohazard exposure, sewage, contaminated flooding, dead animals that may carry disease",
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

/** Issue categories: the built-in list plus weak Wi-Fi and a catch-all. */
export const ISSUE_CATEGORIES = {
  pothole: { label: "Pothole", icon: "⚠️", authority: "parking" },
  garbage: { label: "Garbage", icon: "🗑️", authority: "fdo_custodial" },
  broken_streetlight: { label: "Broken streetlight", icon: "💡", authority: "fdo_maintenance" },
  road_damage: { label: "Road damage", icon: "🚧", authority: "parking" },
  graffiti: { label: "Graffiti", icon: "🎨", authority: "fdo_custodial" },
  noise_complaint: { label: "Noise complaint", icon: "🔊", authority: "upd" },
  damaged_sidewalk: { label: "Damaged sidewalk", icon: "👣", authority: "fdo_grounds" },
  damaged_traffic_sign: { label: "Damaged traffic sign", icon: "🪧", authority: "parking" },
  fallen_tree: { label: "Fallen tree", icon: "🌳", authority: "fdo_grounds" },
  clogged_drain: { label: "Clogged drain", icon: "🌀", authority: "fdo_maintenance" },
  park_playground_damage: { label: "Park / playground damage", icon: "🛝", authority: "fdo_grounds" },
  broken_traffic_signal: { label: "Broken traffic signal", icon: "🚦", authority: "city_sj" },
  abandoned_vehicle: { label: "Abandoned vehicle", icon: "🚗", authority: "parking" },
  dead_animal: { label: "Dead animal", icon: "🐾", authority: "fdo_grounds" },
  water_leakage: { label: "Water leakage", icon: "💧", authority: "fdo_maintenance" },
  open_manhole: { label: "Open manhole", icon: "⭕", authority: "fdo_maintenance" },
  flooding: { label: "Flooding", icon: "🌊", authority: "fdo_maintenance" },
  weak_wifi: { label: "Weak Wi-Fi / internet", icon: "📶", authority: "it_services" },
  other: { label: "Other", icon: "📝", authority: "fdo_maintenance" },
} as const satisfies Record<string, { label: string; icon: string; authority: AuthorityId }>;

export type IssueCategory = keyof typeof ISSUE_CATEGORIES;
export const ISSUE_CATEGORY_IDS = Object.keys(ISSUE_CATEGORIES) as IssueCategory[];

export type Category = IssueCategory | "lost_found";

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
