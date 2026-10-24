import * as turf from "@turf/turf";
import type { LngLat } from "./campus";

/** Approximate SJSU building centers, used to prefill "building" on a report. */
export const BUILDINGS: { name: string; center: LngLat }[] = [
  { name: "MLK Library", center: [-121.8851, 37.3355] },
  { name: "Clark Hall", center: [-121.8828, 37.3365] },
  { name: "Student Union", center: [-121.8808, 37.3363] },
  { name: "Tower Hall", center: [-121.8836, 37.3354] },
  { name: "Washington Square Hall", center: [-121.884, 37.3344] },
  { name: "Engineering Building", center: [-121.8816, 37.3373] },
  { name: "Central Classroom Building", center: [-121.8822, 37.3352] },
  { name: "Dwight Bentel Hall", center: [-121.8834, 37.3347] },
  { name: "Hugh Gillis Hall", center: [-121.8847, 37.334] },
  { name: "MacQuarrie Hall", center: [-121.8823, 37.3333] },
  { name: "Duncan Hall", center: [-121.8815, 37.3326] },
  { name: "Paseo de César Chávez", center: [-121.8813, 37.3354] },
  { name: "Event Center", center: [-121.88, 37.3352] },
  { name: "Music Building", center: [-121.8797, 37.3359] },
  { name: "Spartan Recreation & Aquatic Center", center: [-121.8789, 37.3346] },
  { name: "Dining Commons", center: [-121.878, 37.3342] },
  { name: "Campus Village", center: [-121.877, 37.3345] },
  { name: "Boccardo Business Center", center: [-121.8784, 37.3367] },
  { name: "Industrial Studies", center: [-121.8806, 37.3378] },
];

/** Closest building within `maxM`, or null when the pin is out in the open. */
export function nearestBuilding(lat: number, lng: number, maxM = 120): string | null {
  let best: { name: string; d: number } | null = null;
  for (const b of BUILDINGS) {
    const d = turf.distance([lng, lat], b.center, { units: "meters" });
    if (d <= maxM && (!best || d < best.d)) best = { name: b.name, d };
  }
  return best?.name ?? null;
}
