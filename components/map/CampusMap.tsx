"use client";

import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { LineString } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_CAMERA, MAP_STYLE_URL, OBSTACLE_COLORS, type LngLat } from "@/lib/geo/campus";
import { buildMapLayers, type Obstacle } from "@/lib/geo/obstacles";
import type { Category, Report } from "@/lib/types";
import { applyHudTheme, configureMapLibre, silenceMissingIcons } from "./hudTheme";

export interface CameraTarget {
  center?: LngLat;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  nonce: number;
}

export interface CampusMapProps {
  reports: Report[];
  obstacles: Obstacle[];
  hiddenCategories: Set<Category>;
  activeObstacleId: string | null;
  focusedObstacleId: string | null;
  userPos: LngLat;
  userHeading: number | null;
  follow: boolean;
  flat: boolean;
  reducedMotion: boolean;
  cameraTarget: CameraTarget | null;
  /** Navigation route, drawn in cyan with a destination marker; the camera fits it when it changes. */
  route: { path: LineString; label: string } | null;
  onReportClick: (reportId: string) => void;
  onBearingChange: (bearing: number) => void;
  onUserPan: () => void;
}

const SOURCES = ["cq-route", "cq-lost", "cq-blocked", "cq-detours", "cq-rings", "cq-beacon-glow", "cq-beacons", "cq-volumes"] as const;
const CLICKABLE = ["cq-beacons", "cq-volumes", "cq-volumes-active", "cq-lost-fill"];
const EMPTY = { type: "FeatureCollection" as const, features: [] };

const ROUTE_COLOR = "#22d3ee";
const BUILDING_LAYER = "building-3d";

const INTRO_MS = 2000;
const INTRO_BEARING_OFFSET = 85;
const INTRO_ZOOM_START = 16;
const INTRO_ZOOM_FULL = 17;
const INTRO_PITCH = 46;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const NO_TRANSITION = { duration: 0, delay: 0 };

/** Height is baked per tile, so a per-frame expression snaps. A zoom stop is interpolated on the GPU as the camera moves. */
const RISING_HEIGHT: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], INTRO_ZOOM_START, 0, INTRO_ZOOM_FULL, ["to-number", ["get", "render_height"], 0]];
const RISING_BASE: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], INTRO_ZOOM_START, 0, INTRO_ZOOM_FULL, ["to-number", ["get", "render_min_height"], 0]];

function setBuildingPaint(map: MapLibreMap, height: ExpressionSpecification, base: ExpressionSpecification) {
  if (!map.getLayer(BUILDING_LAYER)) return;
  map.setPaintProperty(BUILDING_LAYER, "fill-extrusion-height-transition", NO_TRANSITION);
  map.setPaintProperty(BUILDING_LAYER, "fill-extrusion-base-transition", NO_TRANSITION);
  map.setPaintProperty(BUILDING_LAYER, "fill-extrusion-height", height);
  map.setPaintProperty(BUILDING_LAYER, "fill-extrusion-base", base);
}

const DASH_STEPS = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

function addHudLayers(map: MapLibreMap) {
  for (const id of SOURCES) map.addSource(id, { type: "geojson", data: EMPTY });

  map.addLayer({
    id: "cq-route-glow",
    type: "line",
    source: "cq-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ROUTE_COLOR, "line-width": 16, "line-blur": 10, "line-opacity": 0.35 },
  });
  map.addLayer({
    id: "cq-route",
    type: "line",
    source: "cq-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ROUTE_COLOR, "line-width": 6, "line-opacity": 0.95 },
  });
  map.addLayer({
    id: "cq-lost-fill",
    type: "fill",
    source: "cq-lost",
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "cq-lost-line",
    type: "line",
    source: "cq-lost",
    paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-dasharray": [2, 2], "line-opacity": 0.7 },
  });
  map.addLayer({
    id: "cq-blocked",
    type: "line",
    source: "cq-blocked",
    layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 7, "line-opacity": 0.85 },
  });
  map.addLayer({
    id: "cq-detour-glow",
    type: "line",
    source: "cq-detours",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": OBSTACLE_COLORS.detour,
      "line-width": 14,
      "line-blur": 8,
      "line-opacity": ["case", ["get", "active"], 0.45, 0.12],
    },
  });
  map.addLayer({
    id: "cq-detour",
    type: "line",
    source: "cq-detours",
    layout: { "line-join": "round" },
    paint: {
      "line-color": OBSTACLE_COLORS.detour,
      "line-width": 5,
      "line-dasharray": DASH_STEPS[0],
      "line-opacity": ["case", ["get", "active"], 1, 0.35],
    },
  });
  map.addLayer({
    id: "cq-rings",
    type: "circle",
    source: "cq-rings",
    paint: {
      "circle-radius": 10,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 2,
      "circle-stroke-opacity": 0.8,
      "circle-pitch-alignment": "map",
    },
  });
  map.addLayer({
    id: "cq-beacon-glow",
    type: "circle",
    source: "cq-beacon-glow",
    paint: {
      "circle-radius": 16,
      "circle-blur": 1,
      "circle-color": ["get", "color"],
      "circle-opacity": 0.45,
      "circle-pitch-alignment": "map",
    },
  });
  map.addLayer({
    id: "cq-beacons",
    type: "fill-extrusion",
    source: "cq-beacons",
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "cq-volumes",
    type: "fill-extrusion",
    source: "cq-volumes",
    filter: ["!", ["get", "active"]],
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-opacity": 0.6,
    },
  });
  map.addLayer({
    id: "cq-volumes-active",
    type: "fill-extrusion",
    source: "cq-volumes",
    filter: ["get", "active"],
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-opacity": 0.8,
    },
  });
}

function makeTag(o: Obstacle, onClick: () => void) {
  const el = document.createElement("button");
  el.className = "hud-tag";
  el.style.setProperty("--tag-color", o.color);
  el.style.opacity = o.relevant ? "1" : "0.45";
  const icon = document.createElement("span");
  icon.className = "hud-tag-icon";
  icon.textContent = o.alert.impact === "blocks" ? "⛔" : "⚠";
  const text = document.createElement("span");
  text.textContent = o.alert.label ?? o.report.title;
  el.append(icon, text);
  el.setAttribute("aria-label", [o.report.title, o.alert.detour_text].filter(Boolean).join(". "));
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

function makeDestination(label: string) {
  const el = document.createElement("div");
  el.className = "hud-dest";
  const icon = document.createElement("span");
  icon.textContent = "🏁";
  icon.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = label;
  el.append(icon, text);
  el.setAttribute("aria-label", `Destination: ${label}`);
  return el;
}

function makeBadge(r: Report, onClick: () => void) {
  const el = document.createElement("button");
  el.className = "hud-badge";
  el.textContent = `+${r.mission?.points ?? 0}`;
  el.setAttribute("aria-label", `Mission: ${r.title}, ${r.mission?.points} points`);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

export default function CampusMap(props: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const propsRef = useRef(props);
  const [ready, setReady] = useState(false);
  const introRef = useRef(false);
  const introFlatRef = useRef(false);
  const endIntroRef = useRef<() => void>(() => {});

  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    configureMapLibre();
    const reduced = propsRef.current.reducedMotion;
    const flatStart = propsRef.current.flat;
    const playIntroShot = !reduced && !flatStart;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: DEFAULT_CAMERA.center,
      zoom: playIntroShot ? INTRO_ZOOM_START : DEFAULT_CAMERA.zoom,
      pitch: flatStart ? 0 : playIntroShot ? INTRO_PITCH : DEFAULT_CAMERA.pitch,
      bearing: playIntroShot ? DEFAULT_CAMERA.bearing + INTRO_BEARING_OFFSET : DEFAULT_CAMERA.bearing,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    silenceMissingIcons(map);
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __cqMap: map });

    let alive = true;
    const finishIntro = () => {
      if (!introRef.current) return;
      introRef.current = false;
      setBuildingPaint(map, ["get", "render_height"], ["get", "render_min_height"]);
    };
    endIntroRef.current = finishIntro;

    const playIntro = () => {
      introRef.current = true;
      introFlatRef.current = propsRef.current.flat;
      map.easeTo({
        center: DEFAULT_CAMERA.center,
        zoom: DEFAULT_CAMERA.zoom,
        bearing: DEFAULT_CAMERA.bearing,
        pitch: propsRef.current.flat ? 0 : DEFAULT_CAMERA.pitch,
        duration: INTRO_MS,
        easing: easeInOutCubic,
        essential: true,
      });
    };

    const releaseIntroForGesture = (e: { originalEvent?: Event }) => {
      if (!introRef.current || !e.originalEvent) return;
      finishIntro();
      // allowGestures keeps the drag that interrupted the intro; the public typing omits the parameter.
      (map as unknown as { stop(allowGestures?: boolean): void }).stop(true);
    };

    map.on("style.load", () => {
      if (!alive || !playIntroShot) return;
      setBuildingPaint(map, RISING_HEIGHT, RISING_BASE);
    });

    map.on("load", () => {
      if (!alive) return;
      applyHudTheme(map);
      addHudLayers(map);
      for (const layer of CLICKABLE) {
        map.on("click", layer, (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) propsRef.current.onReportClick(String(id));
        });
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      if (playIntroShot) {
        try {
          playIntro();
        } catch {
          introRef.current = false;
          setBuildingPaint(map, ["get", "render_height"], ["get", "render_min_height"]);
        }
      }
      setReady(true);
    });
    map.on("moveend", () => {
      if (alive) finishIntro();
    });
    map.on("rotate", () => propsRef.current.onBearingChange(map.getBearing()));
    map.on("dragstart", (e) => {
      releaseIntroForGesture(e);
      propsRef.current.onUserPan();
    });
    map.on("zoomstart", releaseIntroForGesture);
    map.on("rotatestart", releaseIntroForGesture);
    map.on("pitchstart", releaseIntroForGesture);

    const el = document.createElement("div");
    el.className = "user-dot";
    el.innerHTML = '<div class="user-dot-cone"></div><div class="user-dot-core"></div>';
    userMarkerRef.current = new Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" })
      .setLngLat(propsRef.current.userPos)
      .addTo(map);

    const markers = markersRef.current;
    // Next keeps hidden routes' state (Activity), so a remount would otherwise see ready=true before the new map loads.
    return () => {
      alive = false;
      introRef.current = false;
      endIntroRef.current = () => {};
      setReady(false);
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const { reports, obstacles, hiddenCategories, activeObstacleId, focusedObstacleId } = props;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource("cq-lost")) return;
    const data = buildMapLayers(reports, obstacles, hiddenCategories, activeObstacleId, focusedObstacleId);
    (map.getSource("cq-lost") as GeoJSONSource).setData(data.lostAreas);
    (map.getSource("cq-blocked") as GeoJSONSource).setData(data.blocked);
    (map.getSource("cq-detours") as GeoJSONSource).setData(data.detours);
    (map.getSource("cq-rings") as GeoJSONSource).setData(data.rings);
    (map.getSource("cq-beacon-glow") as GeoJSONSource).setData(data.beaconGlow);
    (map.getSource("cq-beacons") as GeoJSONSource).setData(data.beacons);
    (map.getSource("cq-volumes") as GeoJSONSource).setData(data.volumes);

    const open = (id: string) => () => propsRef.current.onReportClick(id);
    const wanted = new Map<string, () => Marker>();
    for (const o of obstacles) {
      if (hiddenCategories.has(o.report.category)) continue;
      const key = `tag:${o.report.id}:${o.relevant}:${o.color}`;
      wanted.set(key, () =>
        new Marker({ element: makeTag(o, open(o.report.id)), anchor: "bottom", offset: [0, o.alert.obstacle_style === "elevator" ? -100 : -18] }).setLngLat(o.center),
      );
    }
    const obstacleIds = new Set(obstacles.map((o) => o.report.id));
    for (const r of reports) {
      if (!r.mission || r.mission.status !== "open" || hiddenCategories.has(r.category) || obstacleIds.has(r.id)) continue;
      wanted.set(`badge:${r.id}:${r.mission.points}`, () =>
        new Marker({ element: makeBadge(r, open(r.id)), anchor: "bottom", offset: [0, r.kind === "lost" ? -6 : -46] }).setLngLat([r.lng, r.lat]),
      );
    }
    const markers = markersRef.current;
    for (const [key, marker] of markers) {
      if (!wanted.has(key)) {
        marker.remove();
        markers.delete(key);
      }
    }
    for (const [key, create] of wanted) {
      if (!markers.has(key)) markers.set(key, create().addTo(map));
    }
  }, [ready, reports, obstacles, hiddenCategories, activeObstacleId, focusedObstacleId]);

  const { userPos, userHeading, follow } = props;
  const wasFollowing = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    userMarkerRef.current?.setLngLat(userPos).setRotation(userHeading ?? 0);
    userMarkerRef.current?.getElement().classList.toggle("has-heading", userHeading !== null);
    if (!map || !ready) return;
    if (follow) {
      endIntroRef.current();
      const zoom = wasFollowing.current ? map.getZoom() : 17.8;
      map.jumpTo({ center: userPos, bearing: userHeading ?? map.getBearing(), zoom });
    }
    wasFollowing.current = follow;
  }, [userPos, userHeading, follow, ready]);

  const { flat } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (introRef.current && flat === introFlatRef.current) {
      if (flat) map.dragRotate.disable();
      else map.dragRotate.enable();
      return;
    }
    endIntroRef.current();
    map.easeTo({ pitch: flat ? 0 : DEFAULT_CAMERA.pitch, duration: 600 });
    if (flat) map.dragRotate.disable();
    else map.dragRotate.enable();
  }, [flat, ready]);

  const { route } = props;
  const destRef = useRef<Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource("cq-route")) return;
    (map.getSource("cq-route") as GeoJSONSource).setData(route ? { type: "Feature", properties: {}, geometry: route.path } : EMPTY);
    destRef.current?.remove();
    destRef.current = null;
    if (!route) return;
    const coords = route.path.coordinates;
    destRef.current = new Marker({ element: makeDestination(route.label), anchor: "bottom", offset: [0, -6] })
      .setLngLat(coords[coords.length - 1] as LngLat)
      .addTo(map);
    if (propsRef.current.follow) return;
    endIntroRef.current();
    const bounds = coords.reduce((b, c) => b.extend(c as LngLat), new LngLatBounds(coords[0] as LngLat, coords[0] as LngLat));
    map.fitBounds(bounds, {
      padding: { top: 150, bottom: Math.min(380, map.getContainer().clientHeight * 0.45), left: 40, right: 80 },
      maxZoom: 18,
      pitch: propsRef.current.flat ? 0 : 45,
      duration: propsRef.current.reducedMotion ? 0 : 1200,
    });
  }, [route, ready]);

  const { cameraTarget } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !cameraTarget) return;
    endIntroRef.current();
    map.flyTo({
      center: cameraTarget.center ?? map.getCenter(),
      zoom: cameraTarget.zoom ?? map.getZoom(),
      bearing: cameraTarget.bearing ?? map.getBearing(),
      pitch: propsRef.current.flat ? 0 : (cameraTarget.pitch ?? map.getPitch()),
      duration: 1400,
      essential: true,
    });
  }, [cameraTarget, ready]);

  const { reducedMotion } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (reducedMotion) {
      map.setPaintProperty("cq-rings", "circle-radius", 14);
      map.setPaintProperty("cq-detour", "line-dasharray", [2, 1.5]);
      return;
    }
    let frame = 0;
    let lastDash = -1;
    const tick = (t: number) => {
      const slow = (t % 1800) / 1800;
      const fast = (t % 700) / 700;
      map.setPaintProperty("cq-rings", "circle-radius", ["case", ["get", "active"], 10 + fast * 34, 8 + slow * 20]);
      map.setPaintProperty("cq-rings", "circle-stroke-opacity", ["case", ["get", "active"], 1 - fast, 0.9 - slow * 0.8]);
      map.setPaintProperty("cq-volumes-active", "fill-extrusion-opacity", 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t / 180)));
      const dash = Math.floor(t / 60) % DASH_STEPS.length;
      if (dash !== lastDash) {
        map.setPaintProperty("cq-detour", "line-dasharray", DASH_STEPS[dash]);
        lastDash = dash;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" aria-label="3D campus map" role="application" />
    </div>
  );
}
