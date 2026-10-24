"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as turf from "@turf/turf";
import type { LineString } from "geojson";
import { CAMPUS_RADIUS_M, SJSU_CENTER, type LngLat } from "@/lib/geo/campus";

export type LocationSource = "demo" | "gps" | "sim";

export interface LocationState {
  pos: LngLat;
  heading: number | null;
  source: LocationSource;
  simulating: boolean;
  offCampus: boolean;
  error: string | null;
}

const WALK_SPEED_MPS = 1.4;
const SIM_TICK_MS = 100;

export function useLocation(walkPath: LineString, simSpeedup = 6) {
  const start = walkPath.coordinates[0] as LngLat;
  const [state, setState] = useState<LocationState>({
    pos: start,
    heading: null,
    source: "demo",
    simulating: false,
    offCampus: false,
    error: null,
  });
  const simTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchId = useRef<number | null>(null);
  const lastGps = useRef<LngLat | null>(null);

  const stopSim = useCallback(() => {
    if (simTimer.current) clearInterval(simTimer.current);
    simTimer.current = null;
    setState((s) => ({ ...s, simulating: false }));
  }, []);

  const stopGps = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  /** Walks `path` (a navigation route) or, by default, the fixed demo path. */
  const startSim = useCallback((path: LineString = walkPath) => {
    stopGps();
    if (simTimer.current) clearInterval(simTimer.current);
    const length = turf.length(turf.feature(path), { units: "meters" });
    const startedAt = performance.now();
    const step = () => {
      const walked = Math.min(length, WALK_SPEED_MPS * simSpeedup * ((performance.now() - startedAt) / 1000));
      const here = turf.along(path, walked, { units: "meters" });
      const ahead = turf.along(path, Math.min(length, walked + 4), { units: "meters" });
      const behind = turf.along(path, Math.max(0, walked - 4), { units: "meters" });
      const heading = walked >= length ? turf.bearing(behind, here) : turf.bearing(here, ahead);
      const done = walked >= length;
      setState({
        pos: here.geometry.coordinates as LngLat,
        heading,
        source: "sim",
        simulating: !done,
        offCampus: false,
        error: null,
      });
      if (done && simTimer.current) {
        clearInterval(simTimer.current);
        simTimer.current = null;
      }
    };
    step();
    simTimer.current = setInterval(step, SIM_TICK_MS);
  }, [walkPath, simSpeedup, stopGps]);

  const startGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState((s) => ({ ...s, error: "This browser has no GPS access." }));
      return;
    }
    stopSim();
    stopGps();
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const pos: LngLat = [p.coords.longitude, p.coords.latitude];
        const offCampus = turf.distance(pos, SJSU_CENTER, { units: "meters" }) > CAMPUS_RADIUS_M;
        let heading = typeof p.coords.heading === "number" && !Number.isNaN(p.coords.heading) ? p.coords.heading : null;
        const prev = lastGps.current;
        if (heading === null && prev && turf.distance(prev, pos, { units: "meters" }) > 3) {
          heading = turf.bearing(prev, pos);
        }
        lastGps.current = pos;
        setState((s) => ({
          pos: offCampus ? start : pos,
          heading: offCampus ? null : (heading ?? s.heading),
          source: offCampus ? "demo" : "gps",
          simulating: false,
          offCampus,
          error: null,
        }));
      },
      (err) => setState((s) => ({ ...s, error: err.message || "Location unavailable." })),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }, [start, stopGps, stopSim]);

  const reset = useCallback(() => {
    stopSim();
    stopGps();
    setState({ pos: start, heading: null, source: "demo", simulating: false, offCampus: false, error: null });
  }, [start, stopGps, stopSim]);

  useEffect(
    () => () => {
      if (simTimer.current) clearInterval(simTimer.current);
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    },
    [],
  );

  return { ...state, startSim, stopSim, startGps, reset };
}
