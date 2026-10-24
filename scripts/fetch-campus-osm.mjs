// One-time snapshot of SJSU walkways, buildings and entrances from OpenStreetMap.
// Run: node scripts/fetch-campus-osm.mjs [--refresh]   (writes lib/geo/data/*.json; commit the output)
// Data © OpenStreetMap contributors, ODbL.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as turf from "@turf/turf";

const BBOX = "37.3300,-121.8885,37.3400,-121.8745"; // south, west, north, east
const OVERPASS = "https://overpass-api.de/api/interpreter";
const WALKABLE =
  "footway|path|pedestrian|steps|service|living_street|residential|unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|cycleway|corridor|elevator";

const query = `[out:json][timeout:90];
(
  way["highway"~"^(${WALKABLE})$"](${BBOX});
  node["entrance"](${BBOX});
  way["building"]["name"](${BBOX});
);
out body geom;`;

const round = (n) => Math.round(n * 1e6) / 1e6;

// Raw Overpass reply, reused on re-runs so tweaking the processing doesn't hit the public server.
const CACHE = path.join(os.tmpdir(), "campus-quests-osm.json");

async function download() {
  if (existsSync(CACHE) && !process.argv.includes("--refresh")) return JSON.parse(readFileSync(CACHE, "utf8"));
  for (let attempt = 0, wait = 5; ; attempt++, wait *= 2) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "campus-quests-hackathon/1.0" },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) {
      const json = await res.json();
      writeFileSync(CACHE, JSON.stringify(json));
      return json;
    }
    if (attempt >= 5 || (res.status !== 429 && res.status < 500)) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
    console.log(`Overpass busy (${res.status}), retrying in ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

async function main() {
  const { elements } = await download();

  // --- walk graph -----------------------------------------------------------
  const nodeIndex = new Map();
  const nodes = [];
  const names = [];
  const nameIndex = new Map();
  const edges = [];
  const idx = (id, lon, lat) => {
    if (!nodeIndex.has(id)) {
      nodeIndex.set(id, nodes.length);
      nodes.push([round(lon), round(lat)]);
    }
    return nodeIndex.get(id);
  };
  const nameIdx = (name) => {
    if (!name) return -1;
    if (!nameIndex.has(name)) {
      nameIndex.set(name, names.length);
      names.push(name);
    }
    return nameIndex.get(name);
  };

  for (const e of elements) {
    if (e.type !== "way" || !e.tags?.highway || !e.geometry) continue;
    const t = e.tags;
    if (t.access === "private" || t.access === "no" || t.foot === "no" || t.area === "yes") continue;
    // flags: 1 = steps, 2 = road shared with cars, 4 = elevator
    let flags = 0;
    if (t.highway === "steps") flags |= 1;
    if (/^(service|residential|unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|living_street)$/.test(t.highway)) flags |= 2;
    if (t.highway === "elevator") flags |= 4;
    const name = nameIdx(t.name ?? (t.highway === "steps" ? "stairs" : null));
    for (let i = 1; i < e.nodes.length; i++) {
      const a = idx(e.nodes[i - 1], e.geometry[i - 1].lon, e.geometry[i - 1].lat);
      const b = idx(e.nodes[i], e.geometry[i].lon, e.geometry[i].lat);
      if (a !== b) edges.push([a, b, flags, name]);
    }
  }

  // --- buildings and entrances ---------------------------------------------
  const buildings = elements
    .filter((e) => e.type === "way" && e.tags?.building && e.tags?.name && e.geometry)
    .map((e) => {
      const outline = e.geometry.map((g) => [round(g.lon), round(g.lat)]);
      const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
      const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
      return { name: e.tags.name, center: [round(cx), round(cy)], outline };
    });

  const near = (b) => turf.buffer(turf.polygon([b.outline]), 4, { units: "meters" });
  const owner = (pos) => buildings.find((b) => turf.booleanPointInPolygon(pos, near(b)))?.name ?? null;
  const entrances = elements
    .filter((e) => e.type === "node" && e.tags?.entrance && !/^(emergency|service|garage)$/.test(e.tags.entrance))
    .map((e) => {
      const pos = [round(e.lon), round(e.lat)];
      return {
        building: owner(pos),
        pos,
        kind: e.tags.entrance,
        label: e.tags.name ?? e.tags.ref ?? null,
        wheelchair: e.tags.wheelchair ?? null,
      };
    })
    .filter((e) => e.building);

  // Buildings with no mapped entrance get "approach" points: the walkway nodes closest to the outline,
  // at most two and at least 25 m apart.
  const main = largestComponent(nodes, edges);
  for (const b of buildings) {
    if (entrances.some((e) => e.building === b.name)) continue;
    const outline = turf.polygonToLine(turf.polygon([b.outline]));
    const close = [...main]
      .map((i) => ({ i, d: turf.pointToLineDistance(nodes[i], outline, { units: "meters" }) }))
      .filter((x) => x.d <= 30)
      .sort((x, y) => x.d - y.d);
    const picked = [];
    for (const c of close) {
      if (picked.every((p) => turf.distance(nodes[p.i], nodes[c.i], { units: "meters" }) >= 25)) picked.push(c);
      if (picked.length === 2) break;
    }
    for (const p of picked) entrances.push({ building: b.name, pos: nodes[p.i], kind: "approach", label: null, wheelchair: null });
  }

  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "../lib/geo/data");
  mkdirSync(out, { recursive: true });
  const attribution = "© OpenStreetMap contributors (ODbL)";
  writeFileSync(path.join(out, "campus-walk.json"), JSON.stringify({ attribution, nodes, edges, names }));
  writeFileSync(path.join(out, "campus-places.json"), JSON.stringify({ attribution, buildings, entrances }));
  console.log(`walk graph: ${nodes.length} nodes, ${edges.length} edges; ${buildings.length} buildings, ${entrances.length} entrances`);
}

function largestComponent(nodes, edges) {
  const adj = nodes.map(() => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const seen = new Uint8Array(nodes.length);
  let best = [];
  for (let s = 0; s < nodes.length; s++) {
    if (seen[s]) continue;
    const comp = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const x = stack.pop();
      comp.push(x);
      for (const y of adj[x]) {
        if (seen[y]) continue;
        seen[y] = 1;
        stack.push(y);
      }
    }
    if (comp.length > best.length) best = comp;
  }
  return best;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
