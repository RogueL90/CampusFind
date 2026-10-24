import type { LineString, Polygon } from "geojson";
import type { AccessNeed, Category } from "@/lib/types";

export type LngLat = [number, number];

export const SJSU_CENTER: LngLat = [-121.8823, 37.3357];

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const DEFAULT_CAMERA = {
  center: [-121.884, 37.33629] as LngLat,
  zoom: 17.1,
  pitch: 60,
  bearing: 56,
};

/** Beyond this distance from campus, real GPS is ignored and the demo start point is used. */
export const CAMPUS_RADIUS_M = 1500;

export const ALERT_RADIUS_M = 150;

export const CATEGORIES: { id: Category; label: string; icon: string; color: string }[] = [
  { id: "connectivity", label: "Wi-Fi", icon: "📶", color: "#38bdf8" },
  { id: "water", label: "Water", icon: "💧", color: "#22d3ee" },
  { id: "waste", label: "Waste", icon: "🗑️", color: "#a3e635" },
  { id: "paths", label: "Paths", icon: "🚧", color: "#f59e0b" },
  { id: "accessibility", label: "Access", icon: "♿", color: "#f43f5e" },
  { id: "pests", label: "Pests", icon: "🐀", color: "#c084fc" },
  { id: "lost_found", label: "Lost & Found", icon: "🎒", color: "#facc15" },
  { id: "other", label: "Other", icon: "📝", color: "#94a3b8" },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  Category,
  (typeof CATEGORIES)[number]
>;

export const ACCESS_NEEDS: { id: AccessNeed; label: string; short: string }[] = [
  { id: "wheelchair", label: "Wheelchair or scooter", short: "wheelchairs" },
  { id: "crutches", label: "Crutches or temporary injury", short: "crutches" },
  { id: "low_vision", label: "Low vision", short: "low vision" },
  { id: "no_stairs", label: "Avoid stairs", short: "step-free routes" },
];

export const OBSTACLE_COLORS = {
  blocks: "#ef4444",
  caution: "#f59e0b",
  zone: "#f59e0b",
  dimmed: "#475569",
  detour: "#22d3ee",
};

const line = (coordinates: LngLat[]): LineString => ({ type: "LineString", coordinates });
const polygon = (coordinates: LngLat[]): Polygon => ({ type: "Polygon", coordinates: [coordinates] });

/**
 * Demo geometry traced from OpenStreetMap walkways around Clark Hall.
 * Person B copies these into supabase/seed.sql.
 */
export const DEMO_GEOMETRY = {
  /** MLK Library corner → San Fernando St sidewalk → down to the service road at Clark Hall's north entrance. */
  walkPath: line([
    [-121.88516, 37.336112],
    [-121.885007, 37.336185],
    [-121.884792, 37.336285],
    [-121.884366, 37.336483],
    [-121.883909, 37.336698],
    [-121.883712, 37.336796],
    [-121.883644, 37.336832],
    [-121.883574, 37.336862],
    [-121.882898, 37.337178],
    [-121.882654, 37.33686],
    [-121.882504, 37.336663],
    [-121.882483, 37.336636],
    [-121.88262, 37.33657],
  ]),

  clarkConstruction: {
    footprint: polygon([
      [-121.8826045, 37.3364922],
      [-121.8829318, 37.3363323],
      [-121.8830265, 37.3364548],
      [-121.8826992, 37.3366147],
      [-121.8826045, 37.3364922],
    ]),
    center: [-121.882815, 37.336474] as LngLat,
    blockedPath: line([
      [-121.882483, 37.336636],
      [-121.883148, 37.336311],
    ]),
    detourPath: line([
      [-121.882898, 37.337178],
      [-121.882762, 37.337242],
      [-121.882666, 37.337307],
      [-121.882214, 37.336694],
      [-121.882252, 37.336672],
      [-121.882203, 37.336613],
      [-121.882174, 37.336574],
      [-121.881939, 37.336258],
      [-121.881895, 37.336197],
    ]),
  },

  paseoPothole: { center: [-121.881347, 37.335375] as LngLat },

  unionRamp: {
    center: [-121.8796766, 37.3365904] as LngLat,
    blockedPath: line([
      [-121.8797057, 37.3365765],
      [-121.8796475, 37.3366043],
    ]),
    detourPath: line([
      [-121.8796766, 37.3365904],
      [-121.879541, 37.336686],
      [-121.879599, 37.336804],
    ]),
  },

  libraryElevator: { center: [-121.885007, 37.335512] as LngLat },

  washingtonSquareScaffold: {
    center: [-121.884, 37.33445] as LngLat,
    blockedPath: line([
      [-121.884075, 37.33441],
      [-121.883925, 37.33449],
    ]),
  },
};
