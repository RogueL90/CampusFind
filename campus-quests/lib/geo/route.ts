import type { LineString } from "geojson";
import type { AccessNeed, Report } from "@/lib/types";
import type { LngLat } from "./campus";
import walkData from "./data/campus-walk.json";
import { isOnMap, type Obstacle } from "./obstacles";
import { AMENITIES, buildingByName, entrancesFor, type Amenity, type AmenityType, type Entrance } from "./places";

// ---------------------------------------------------------------------------
// Local metric projection: campus-sized, so an equirectangular grid is accurate to centimetres.
// ---------------------------------------------------------------------------

const ORIGIN: LngLat = [-121.8815, 37.335];
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = 111_320 * Math.cos((ORIGIN[1] * Math.PI) / 180);
type XY = [number, number];
const toXY = ([lng, lat]: LngLat | number[]): XY => [(lng - ORIGIN[0]) * M_PER_DEG_LNG, (lat - ORIGIN[1]) * M_PER_DEG_LAT];

const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function pointSegDist(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function segmentsCross(a: XY, b: XY, c: XY, d: XY): boolean {
  const o = (p: XY, q: XY, r: XY) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

function segSegDist(a: XY, b: XY, c: XY, d: XY): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b));
}

function insidePolygon(p: XY, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const bearingDeg = (a: XY, b: XY) => (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
const turnAngle = (from: number, to: number) => ((((to - from + 180) % 360) + 360) % 360) - 180;

// ---------------------------------------------------------------------------
// Walk graph (OpenStreetMap snapshot)
// ---------------------------------------------------------------------------

const STEPS = 1;
const ROAD = 2;

interface Edge {
  to: number;
  len: number;
  flags: number;
  name: string | null;
}

interface Graph {
  ll: LngLat[];
  xy: XY[];
  adj: Edge[][];
  /** Nodes in the largest connected piece; routes only start and end on these. */
  main: number[];
}

let graph: Graph | null = null;

function getGraph(): Graph {
  if (graph) return graph;
  const raw = walkData as { nodes: number[][]; edges: number[][]; names: string[] };
  const ll = raw.nodes as LngLat[];
  const xy = ll.map(toXY);
  const adj: Edge[][] = ll.map(() => []);
  for (const [a, b, flags, nameIdx] of raw.edges) {
    const len = dist(xy[a], xy[b]);
    const name = nameIdx >= 0 ? raw.names[nameIdx] : null;
    adj[a].push({ to: b, len, flags, name });
    adj[b].push({ to: a, len, flags, name });
  }
  const seen = new Uint8Array(ll.length);
  let main: number[] = [];
  for (let s = 0; s < ll.length; s++) {
    if (seen[s]) continue;
    const comp: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const x = stack.pop()!;
      comp.push(x);
      for (const e of adj[x]) {
        if (seen[e.to]) continue;
        seen[e.to] = 1;
        stack.push(e.to);
      }
    }
    if (comp.length > main.length) main = comp;
  }
  graph = { ll, xy, adj, main };
  return graph;
}

interface Start {
  node: number;
  d: number;
}

/** A few nearby walkway nodes, so a start pocketed by stairs or a blocked ramp can still get out. */
function startNodes(g: Graph, p: XY): Start[] {
  const all = g.main.map((node) => ({ node, d: dist(g.xy[node], p) })).sort((a, b) => a.d - b.d);
  const near = all.filter((s) => s.d <= all[0].d + 40).slice(0, 8);
  return near.length ? near : all.slice(0, 1);
}

function nearestNode(g: Graph, p: XY): { node: number; d: number } {
  let node = g.main[0];
  let d = Infinity;
  for (const i of g.main) {
    const di = dist(g.xy[i], p);
    if (di < d) {
      d = di;
      node = i;
    }
  }
  return { node, d };
}

// ---------------------------------------------------------------------------
// Obstacles as geometry
// ---------------------------------------------------------------------------

interface Shape {
  obstacle: Obstacle;
  blocks: boolean;
  segs: [XY, XY][];
  ring: XY[] | null;
  points: XY[];
}

function shapeOf(o: Obstacle): Shape {
  const segs: [XY, XY][] = [];
  let ring: XY[] | null = null;
  const points: XY[] = [];
  if (o.report.footprint) {
    ring = o.report.footprint.coordinates[0].map(toXY);
    for (let i = 1; i < ring.length; i++) segs.push([ring[i - 1], ring[i]]);
  }
  if (o.alert.blocked_path) {
    const line = o.alert.blocked_path.coordinates.map(toXY);
    for (let i = 1; i < line.length; i++) segs.push([line[i - 1], line[i]]);
  }
  if (!segs.length) points.push(toXY(o.center));
  return { obstacle: o, blocks: o.alert.impact === "blocks", segs, ring, points };
}

function edgeDistance(s: Shape, a: XY, b: XY): number {
  if (s.ring && (insidePolygon(a, s.ring) || insidePolygon(b, s.ring))) return 0;
  let d = Infinity;
  for (const [c, e] of s.segs) d = Math.min(d, segSegDist(a, b, c, e));
  for (const p of s.points) d = Math.min(d, pointSegDist(p, a, b));
  return d;
}

const BLOCK_BUFFER_M = 3;
const POINT_BLOCK_M = 4;
const CAUTION_M = 10;
const CAUTION_COST = 3;
const ROAD_COST = 1.3;
const STEP_COST = 1.5;
const UNKNOWN_ENTRANCE_PENALTY_M = 60;
export const WALK_SPEED_MPS = 1.2;

export const needsStepFree = (needs: AccessNeed[]) => needs.some((n) => n === "wheelchair" || n === "no_stairs" || n === "crutches");

/** Elevators are indoors; they matter at the destination, not on the walkway. */
const affectsWalkways = (o: Obstacle) => o.alert.obstacle_style !== "elevator";

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export interface RouteStep {
  text: string;
  at: LngLat;
  /** Metres from the start of the route. */
  alongM: number;
}

export interface Destination {
  kind: "building" | "amenity";
  /** What we tell the student, e.g. "MacQuarrie Hall" or "Bottle filler, Clark Hall lobby". */
  label: string;
  building: string;
  buildingShort: string;
  entrance: Entrance | null;
  amenity: Amenity | null;
}

export interface Route {
  path: LineString;
  distanceM: number;
  etaMin: number;
  steps: RouteStep[];
  destination: Destination;
  /** Obstacles the route was steered away from. */
  avoided: Obstacle[];
  /** Caution obstacles the route still passes within 10 m of. */
  passes: Obstacle[];
  /** Amenities skipped because a report says they're broken. */
  skipped: Amenity[];
  stepFree: boolean;
}

export interface RouteOptions {
  needs: AccessNeed[];
  obstacles: Obstacle[];
}

interface Target {
  node: number;
  pos: LngLat;
  penalty: number;
  destination: Destination;
}

class MinHeap {
  private items: [number, number][] = [];
  push(cost: number, node: number) {
    const a = this.items;
    a.push([cost, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

function search(g: Graph, starts: Start[], opts: RouteOptions) {
  const stepFree = needsStepFree(opts.needs);
  const shapes = opts.obstacles.filter((o) => o.relevant && affectsWalkways(o)).map(shapeOf);
  const edgeCost = (from: number, e: Edge): number => {
    if (e.flags & STEPS && stepFree) return Infinity;
    const a = g.xy[from];
    const b = g.xy[e.to];
    let mult = (e.flags & ROAD ? ROAD_COST : 1) * (e.flags & STEPS ? STEP_COST : 1);
    for (const s of shapes) {
      const d = edgeDistance(s, a, b);
      const limit = s.blocks ? (s.segs.length ? BLOCK_BUFFER_M : POINT_BLOCK_M) : 0;
      if (s.blocks && d <= limit) return Infinity;
      if (!s.blocks && d <= CAUTION_M) mult *= CAUTION_COST;
    }
    return e.len * mult;
  };

  const cost = new Float64Array(g.ll.length).fill(Infinity);
  const prev = new Int32Array(g.ll.length).fill(-1);
  const heap = new MinHeap();
  for (const { node, d } of starts) {
    if (d < cost[node]) {
      cost[node] = d;
      heap.push(d, node);
    }
  }
  while (heap.size) {
    const [c, n] = heap.pop()!;
    if (c > cost[n]) continue;
    for (const e of g.adj[n]) {
      const ec = edgeCost(n, e);
      if (!Number.isFinite(ec)) continue;
      const nc = c + ec;
      if (nc < cost[e.to]) {
        cost[e.to] = nc;
        prev[e.to] = n;
        heap.push(nc, e.to);
      }
    }
  }
  return { cost, prev };
}

function entranceBlocked(e: Entrance, obstacles: Obstacle[]): Obstacle | null {
  const p = toXY(e.pos);
  return (
    obstacles.find((o) => o.relevant && o.alert.impact === "blocks" && edgeDistance(shapeOf(o), p, p) <= 10) ?? null
  );
}

function buildingTargets(g: Graph, building: string, opts: RouteOptions, amenity: Amenity | null = null): Target[] {
  const b = buildingByName(building);
  if (!b) return [];
  const stepFree = needsStepFree(opts.needs);
  const open = entrancesFor(b.name).filter((e) => !(stepFree && e.stepFree === false) && !entranceBlocked(e, opts.obstacles));
  // A confirmed step-free door beats a side of the building nobody has checked.
  const candidates = stepFree && open.some((e) => e.stepFree) ? open.filter((e) => e.stepFree) : open;
  const targets: Target[] = [];
  for (const e of candidates) {
    const { node, d } = nearestNode(g, toXY(e.pos));
    if (d > 40) continue;
    const penalty = stepFree && e.stepFree === null ? UNKNOWN_ENTRANCE_PENALTY_M : 0;
    targets.push({
      node,
      pos: e.pos,
      penalty,
      destination: {
        kind: amenity ? "amenity" : "building",
        label: amenity?.label ?? b.short,
        building: b.name,
        buildingShort: b.short,
        entrance: e,
        amenity,
      },
    });
  }
  return targets;
}

/** An open water report within 20 m means the fountain is broken. */
export function brokenAmenities(reports: Report[], type: AmenityType = "water"): Set<string> {
  const broken = new Set<string>();
  const issues = reports.filter((r) => r.kind === "issue" && r.category === type && isOnMap(r));
  for (const a of AMENITIES) {
    if (a.type !== type) continue;
    const p = toXY(a.pos);
    if (issues.some((r) => dist(p, toXY([r.lng, r.lat])) <= 20)) broken.add(a.id);
  }
  return broken;
}

function amenityTargets(g: Graph, type: AmenityType, broken: Set<string>, opts: RouteOptions): Target[] {
  return AMENITIES.filter((a) => a.type === type && !broken.has(a.id)).flatMap((a) => {
    const { node, d } = nearestNode(g, toXY(a.pos));
    if (d > 40) return [];
    const b = buildingByName(a.building);
    const entrance = b ? (buildingTargets(g, a.building, opts, a)[0]?.destination.entrance ?? null) : null;
    return [
      {
        node,
        pos: a.pos,
        penalty: 0,
        destination: {
          kind: "amenity" as const,
          label: a.label,
          building: a.building,
          buildingShort: b?.short ?? a.building,
          entrance,
          amenity: a,
        },
      },
    ];
  });
}

const CARDINALS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const cardinal = (deg: number) => CARDINALS[Math.round(((deg + 360) % 360) / 45) % 8];
const roundM = (m: number) => (m < 20 ? Math.max(5, Math.round(m / 5) * 5) : Math.round(m / 10) * 10);

const MIN_LEG_M = 15;
const TURN_DEG = 35;

interface Leg {
  start: number;
  end: number;
}

function buildSteps(coords: LngLat[], names: (string | null)[], destination: Destination): RouteStep[] {
  const xy = coords.map(toXY);
  const segLen = xy.slice(1).map((p, i) => dist(xy[i], p));
  const along = [0];
  for (const l of segLen) along.push(along[along.length - 1] + l);
  const lengthOf = (l: Leg) => along[l.end] - along[l.start];
  const bearingOf = (l: Leg) => bearingDeg(xy[l.start], xy[l.end]);
  const nameOf = (l: Leg) => {
    const byName = new Map<string, number>();
    for (let i = l.start; i < l.end; i++) if (names[i + 1]) byName.set(names[i + 1]!, (byName.get(names[i + 1]!) ?? 0) + segLen[i]);
    const [best] = [...byName.entries()].sort((a, b) => b[1] - a[1]);
    return best && best[1] >= lengthOf(l) / 2 ? best[0] : null;
  };

  // One leg per segment, then fold short jogs and gentle bends into the leg before them.
  let legs: Leg[] = segLen.flatMap((len, i) => (len >= 0.5 ? [{ start: i, end: i + 1 }] : []));
  if (!legs.length) legs = [{ start: 0, end: Math.max(1, xy.length - 1) }];
  for (let changed = true; changed; ) {
    changed = false;
    for (let k = 1; k < legs.length; k++) {
      const prev = legs[k - 1];
      const leg = legs[k];
      const gentle = Math.abs(turnAngle(bearingOf(prev), bearingOf(leg))) <= TURN_DEG && nameOf(prev) === nameOf(leg);
      const jog = lengthOf(leg) < MIN_LEG_M && k < legs.length - 1;
      if (gentle || jog || lengthOf(prev) < MIN_LEG_M / 2) {
        legs.splice(k - 1, 2, { start: prev.start, end: leg.end });
        changed = true;
        break;
      }
    }
  }

  const onto = (name: string | null) => (name === "stairs" ? " up the stairs" : name ? ` onto ${name}` : "");
  const steps: RouteStep[] = legs.map((leg, k) => {
    const name = nameOf(leg);
    let verb: string;
    if (k === 0) verb = `Head ${cardinal(bearingOf(leg))}${name && name !== "stairs" ? ` on ${name}` : ""}`;
    else {
      const t = turnAngle(bearingOf(legs[k - 1]), bearingOf(leg));
      const side = t < 0 ? "left" : "right";
      verb = Math.abs(t) > 120 ? `Make a sharp ${side}` : Math.abs(t) > 55 ? `Turn ${side}` : `Bear ${side}`;
      verb += onto(name);
    }
    return { text: `${verb}, ${roundM(lengthOf(leg))} m`, at: coords[leg.start], alongM: along[leg.start] };
  });
  const entrance = destination.entrance ? ` at the ${destination.entrance.label.replace(/^./, (c) => c.toLowerCase())}` : "";
  steps.push({
    text: destination.kind === "amenity" ? `Arrive: ${destination.label}${entrance}` : `Arrive at ${destination.buildingShort}${entrance}`,
    at: coords[coords.length - 1],
    alongM: along[along.length - 1],
  });
  return steps;
}

function finish(g: Graph, from: LngLat, starts: Start[], targets: Target[], opts: RouteOptions, skipped: Amenity[]): Route | null {
  if (!targets.length) return null;
  const { cost, prev } = search(g, starts, opts);
  let best: Target | null = null;
  for (const t of targets) {
    if (Number.isFinite(cost[t.node]) && (!best || cost[t.node] + t.penalty < cost[best.node] + best.penalty)) best = t;
  }
  if (!best) return null;

  const nodes: number[] = [];
  for (let n = best.node; n !== -1; n = prev[n]) nodes.unshift(n);
  const coords: LngLat[] = [from, ...nodes.map((n) => g.ll[n])];
  const names: (string | null)[] = [null];
  for (let i = 1; i < nodes.length; i++) names.push(g.adj[nodes[i - 1]].find((e) => e.to === nodes[i])?.name ?? null);
  if (dist(toXY(best.pos), g.xy[best.node]) > 1) {
    coords.push(best.pos);
    names.push(null);
  }

  const xy = coords.map(toXY);
  let distanceM = 0;
  for (let i = 1; i < xy.length; i++) distanceM += dist(xy[i - 1], xy[i]);

  const near = (o: Obstacle, m: number) => {
    const s = shapeOf(o);
    return xy.slice(1).some((p, i) => edgeDistance(s, xy[i], p) <= m);
  };
  const passes = opts.obstacles.filter((o) => o.relevant && o.alert.impact !== "blocks" && affectsWalkways(o) && near(o, CAUTION_M));
  const avoided = opts.obstacles.filter((o) => o.relevant && o.alert.impact === "blocks" && affectsWalkways(o) && near(o, 40));

  return {
    path: { type: "LineString", coordinates: coords },
    distanceM,
    etaMin: Math.max(1, Math.round(distanceM / WALK_SPEED_MPS / 60)),
    steps: buildSteps(coords, names, best.destination),
    destination: best.destination,
    avoided,
    passes,
    skipped,
    stepFree: needsStepFree(opts.needs),
  };
}

export function routeToBuilding(from: LngLat, building: string, opts: RouteOptions): Route | null {
  const g = getGraph();
  return finish(g, from, startNodes(g, toXY(from)), buildingTargets(g, building, opts), opts, []);
}

/** Shortest accessible route to the nearest amenity of this type that isn't reported broken. */
export function routeToAmenity(from: LngLat, type: AmenityType, reports: Report[], opts: RouteOptions): Route | null {
  const g = getGraph();
  const broken = brokenAmenities(reports, type);
  const route = finish(g, from, startNodes(g, toXY(from)), amenityTargets(g, type, broken, opts), opts, []);
  if (!route) return null;
  // Only mention broken ones that would have been closer than where we're sending the student.
  const here = toXY(from);
  route.skipped = AMENITIES.filter((a) => broken.has(a.id) && dist(here, toXY(a.pos)) < route.distanceM);
  return route;
}

/** Open issues on or right around the destination building, newest first. */
export function destinationBarriers(destination: Destination, reports: Report[]): Report[] {
  const b = buildingByName(destination.building);
  const ring = b?.outline.map(toXY) ?? [];
  const anchor = toXY(destination.entrance?.pos ?? destination.amenity?.pos ?? b?.center ?? ORIGIN);
  return reports
    .filter((r) => {
      if (r.kind !== "issue" || !isOnMap(r)) return false;
      if (!(r.access_impact.length > 0 || r.category === "accessibility" || r.category === "paths")) return false;
      const p = toXY([r.lng, r.lat]);
      if (ring.length && insidePolygon(p, ring)) return true;
      let d = dist(p, anchor);
      for (let i = 1; i < ring.length; i++) d = Math.min(d, pointSegDist(p, ring[i - 1], ring[i]));
      return d <= 35;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Index of the step the walker is on, given metres walked along the route. */
export function currentStep(route: Route, walkedM: number): number {
  let i = 0;
  while (i + 1 < route.steps.length && route.steps[i + 1].alongM <= walkedM + 3) i++;
  return i;
}

/** Metres along the route closest to a position (for GPS or the simulated walk). */
export function progressAlong(route: Route, pos: LngLat): number {
  const xy = route.path.coordinates.map(toXY);
  const p = toXY(pos);
  let best = Infinity;
  let at = 0;
  let acc = 0;
  for (let i = 1; i < xy.length; i++) {
    const d = pointSegDist(p, xy[i - 1], xy[i]);
    const len = dist(xy[i - 1], xy[i]);
    if (d < best) {
      best = d;
      const dx = xy[i][0] - xy[i - 1][0];
      const dy = xy[i][1] - xy[i - 1][1];
      const t = len ? Math.max(0, Math.min(1, ((p[0] - xy[i - 1][0]) * dx + (p[1] - xy[i - 1][1]) * dy) / (len * len))) : 0;
      at = acc + t * len;
    }
    acc += len;
  }
  return at;
}
