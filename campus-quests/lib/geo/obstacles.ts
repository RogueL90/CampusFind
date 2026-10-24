import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { AccessAlert, AccessNeed, Category, Report } from "@/lib/types";
import { ALERT_RADIUS_M, CATEGORY_BY_ID, OBSTACLE_COLORS, type LngLat } from "./campus";

export interface Obstacle {
  report: Report;
  alert: AccessAlert;
  /** False when the student's accessibility profile says this obstacle doesn't affect them. */
  relevant: boolean;
  center: LngLat;
  color: string;
}

const CLOSED = new Set(["fixed", "verified", "picked_up", "closed"]);

export function buildObstacles(reports: Report[], alerts: AccessAlert[], needs: AccessNeed[]): Obstacle[] {
  const byId = new Map(reports.map((r) => [r.id, r]));
  return alerts.flatMap((alert) => {
    const report = byId.get(alert.report_id);
    if (!report || CLOSED.has(report.status)) return [];
    const relevant = needs.length === 0 || alert.affects.some((n) => needs.includes(n));
    const center = report.footprint
      ? (turf.centroid(report.footprint).geometry.coordinates as LngLat)
      : ([report.lng, report.lat] as LngLat);
    const color = !relevant
      ? OBSTACLE_COLORS.dimmed
      : alert.obstacle_style === "zone"
        ? OBSTACLE_COLORS.zone
        : OBSTACLE_COLORS[alert.impact];
    return [{ report, alert, relevant, center, color }];
  });
}

export function alertRadius(o: Obstacle): number {
  return o.alert.obstacle_style === "elevator" ? 40 : ALERT_RADIUS_M;
}

export function distanceToObstacle(pos: LngLat, o: Obstacle): number {
  const pt = turf.point(pos);
  if (o.report.footprint) {
    if (turf.booleanPointInPolygon(pt, o.report.footprint)) return 0;
    const edge = turf.polygonToLine(o.report.footprint) as Feature<LineString>;
    return turf.pointToLineDistance(pt, edge, { units: "meters" });
  }
  if (o.alert.blocked_path) {
    return turf.pointToLineDistance(pt, o.alert.blocked_path, { units: "meters" });
  }
  return turf.distance(pt, o.center, { units: "meters" });
}

export const normalizeAngle = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export interface Reading {
  id: string;
  distance: number;
  bearing: number;
}

export interface ObstacleReading extends Reading {
  obstacle: Obstacle;
}

export function readObstacles(pos: LngLat, obstacles: Obstacle[]): ObstacleReading[] {
  return obstacles
    .map((obstacle) => ({
      id: obstacle.report.id,
      obstacle,
      distance: distanceToObstacle(pos, obstacle),
      bearing: turf.bearing(turf.point(pos), turf.point(obstacle.center)),
    }))
    .sort((a, b) => a.distance - b.distance);
}

/** Nearest relevant obstacle within its alert radius, in front of the student when they are moving. */
export function findAhead(readings: ObstacleReading[], heading: number | null): ObstacleReading | null {
  return (
    readings.find((r) => {
      if (!r.obstacle.relevant || r.distance > alertRadius(r.obstacle)) return false;
      if (heading === null || r.distance < 25) return true;
      return Math.abs(normalizeAngle(r.bearing - heading)) <= 75;
    }) ?? null
  );
}

const featureCollection = <G extends Polygon | LineString | Point>(features: Feature<G>[]): FeatureCollection<G> => ({
  type: "FeatureCollection",
  features,
});

export interface MapLayersData {
  beacons: FeatureCollection<Polygon>;
  beaconGlow: FeatureCollection<Point>;
  lostAreas: FeatureCollection<Polygon>;
  volumes: FeatureCollection<Polygon>;
  blocked: FeatureCollection<LineString>;
  detours: FeatureCollection<LineString>;
  rings: FeatureCollection<Point>;
}

export function beaconHeight(r: Report): number {
  return Math.min(80, 15 + r.severity * 8 + r.votes * 3);
}

export function buildMapLayers(
  reports: Report[],
  obstacles: Obstacle[],
  hidden: Set<Category>,
  activeId: string | null,
  focusedId: string | null,
): MapLayersData {
  const obstacleIds = new Set(obstacles.map((o) => o.report.id));
  const visible = reports.filter((r) => !hidden.has(r.category) && !CLOSED.has(r.status));

  const beacons: Feature<Polygon>[] = [];
  const beaconGlow: Feature<Point>[] = [];
  const lostAreas: Feature<Polygon>[] = [];
  for (const r of visible) {
    if (obstacleIds.has(r.id)) continue;
    const color = CATEGORY_BY_ID[r.category].color;
    if (r.kind === "lost") {
      lostAreas.push(turf.circle([r.lng, r.lat], r.area_radius_m ?? 50, { units: "meters", steps: 48, properties: { id: r.id, color } }));
      continue;
    }
    beacons.push(
      turf.circle([r.lng, r.lat], 2.2, {
        units: "meters",
        steps: 12,
        properties: { id: r.id, color, height: beaconHeight(r) },
      }),
    );
    beaconGlow.push(turf.point([r.lng, r.lat], { id: r.id, color }));
  }

  const volumes: Feature<Polygon>[] = [];
  const blocked: Feature<LineString>[] = [];
  const detours: Feature<LineString>[] = [];
  const rings: Feature<Point>[] = [];
  for (const o of obstacles) {
    if (hidden.has(o.report.category)) continue;
    const id = o.report.id;
    const active = id === activeId;
    const props = { id, color: o.color, active };
    const style = o.alert.obstacle_style;

    if (style === "zone" && o.report.footprint) {
      volumes.push(turf.feature(o.report.footprint, { ...props, base: 0, height: 5 }));
    } else if (style === "pothole") {
      volumes.push(turf.circle(o.center, 2.5, { units: "meters", steps: 20, properties: { ...props, base: 0, height: 1.5 } }));
    } else if (style === "barrier" && o.alert.blocked_path) {
      const wall = turf.buffer(o.alert.blocked_path, 0.8, { units: "meters" }) as Feature<Polygon> | undefined;
      if (wall) volumes.push(turf.feature(wall.geometry, { ...props, base: 0, height: 3 }));
    } else if (style === "elevator") {
      volumes.push(turf.circle(o.center, 5, { units: "meters", steps: 4, properties: { ...props, base: 42, height: 52 } }));
    }

    if ((style === "zone" || style === "route") && o.alert.blocked_path) {
      blocked.push(turf.feature(o.alert.blocked_path, { ...props, color: o.relevant ? OBSTACLE_COLORS.blocks : OBSTACLE_COLORS.dimmed }));
    }
    if (o.relevant && o.alert.detour_path) {
      detours.push(turf.feature(o.alert.detour_path, { id, active: active || id === focusedId }));
    }
    rings.push(turf.point(o.center, props));
  }

  return {
    beacons: featureCollection(beacons),
    beaconGlow: featureCollection(beaconGlow),
    lostAreas: featureCollection(lostAreas),
    volumes: featureCollection(volumes),
    blocked: featureCollection(blocked),
    detours: featureCollection(detours),
    rings: featureCollection(rings),
  };
}
