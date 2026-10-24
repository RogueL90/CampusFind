"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";
import { MAP_STYLE_URL, SJSU_CENTER, type LngLat } from "@/lib/geo/campus";
import { applyHudTheme, configureMapLibre, silenceMissingIcons } from "./hudTheme";
import type { PinPickerProps } from "./PinPicker";

const EMPTY = { type: "FeatureCollection" as const, features: [] };

export default function PinPickerMap({ value, onChange, withRadius = false, defaultRadiusM = 50, height = 260 }: PinPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState<LngLat | null>(value ? [value.lng, value.lat] : null);
  const [radius, setRadius] = useState(value?.radiusM ?? defaultRadiusM);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    configureMapLibre();
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: SJSU_CENTER,
      zoom: 16.3,
      pitch: 0,
      bearing: -34,
      dragRotate: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    silenceMissingIcons(map);
    map.on("load", () => {
      applyHudTheme(map);
      map.addSource("pin-area", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "pin-area-fill", type: "fill", source: "pin-area", paint: { "fill-color": "#22d3ee", "fill-opacity": 0.15 } });
      map.addLayer({ id: "pin-area-line", type: "line", source: "pin-area", paint: { "line-color": "#22d3ee", "line-width": 1.5, "line-dasharray": [2, 2] } });
      setReady(true);
    });
    map.on("click", (e) => setPin([e.lngLat.lng, e.lngLat.lat]));
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!pin) {
      markerRef.current?.remove();
      markerRef.current = null;
      (map.getSource("pin-area") as GeoJSONSource).setData(EMPTY);
      return;
    }
    if (!markerRef.current) {
      markerRef.current = new Marker({ color: "#22d3ee", draggable: true }).setLngLat(pin).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLngLat();
        setPin([p.lng, p.lat]);
      });
    } else {
      markerRef.current.setLngLat(pin);
    }
    (map.getSource("pin-area") as GeoJSONSource).setData(
      withRadius ? turf.circle(pin, radius, { units: "meters", steps: 48 }) : EMPTY,
    );
    onChangeRef.current({ lat: pin[1], lng: pin[0], radiusM: withRadius ? radius : null });
  }, [pin, radius, withRadius, ready]);

  const useMyLocation = () =>
    navigator.geolocation?.getCurrentPosition((p) => {
      const here: LngLat = [p.coords.longitude, p.coords.latitude];
      setPin(here);
      mapRef.current?.flyTo({ center: here, zoom: 17.5 });
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-xl border border-cyan-400/30" style={{ height }}>
        <div className="absolute inset-0">
          <div ref={containerRef} className="h-full w-full" aria-label="Tap the map to drop a pin" />
        </div>
        {!pin && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-slate-950/80 px-2 py-1 font-mono text-[11px] text-cyan-200">
            Tap where it happened
          </div>
        )}
        <button
          type="button"
          onClick={useMyLocation}
          className="absolute right-2 top-2 rounded-lg bg-slate-950/80 px-2 py-1 text-[11px] text-cyan-100"
        >
          📍 Use my location
        </button>
      </div>
      {withRadius && (
        <label className="flex items-center gap-3 text-xs text-slate-300">
          Area
          <input
            type="range"
            min={20}
            max={200}
            step={10}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="flex-1 accent-cyan-400"
          />
          <span className="w-12 text-right font-mono">{radius} m</span>
        </label>
      )}
    </div>
  );
}
