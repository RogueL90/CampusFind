import { setWorkerUrl, type Map as MapLibreMap } from "maplibre-gl";

let workerConfigured = false;

/** MapLibre resolves its worker relative to its own bundle URL, which Next rewrites; serve it from /public instead. */
export function configureMapLibre() {
  if (workerConfigured) return;
  setWorkerUrl("/maplibre-gl-worker.mjs");
  workerConfigured = true;
}

/** The Liberty style references POI icons its sprite lacks; we hide those layers, so stand in a blank image. */
export function silenceMissingIcons(map: MapLibreMap) {
  map.setMissingStyleImageResolver((id) => {
    if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
  });
}

const set = (fn: () => void) => {
  try {
    fn();
  } catch {}
};

/** Recolors the OpenFreeMap Liberty style into a dark, low-contrast HUD base so reports stand out. */
export function applyHudTheme(map: MapLibreMap) {
  for (const layer of map.getStyle().layers) {
    const id = layer.id;
    const paint = ("paint" in layer ? layer.paint : undefined) as Record<string, unknown> | undefined;
    switch (layer.type) {
      case "background":
        set(() => map.setPaintProperty(id, "background-color", "#05080f"));
        break;
      case "raster":
        set(() => map.setLayoutProperty(id, "visibility", "none"));
        break;
      case "fill": {
        if (paint?.["fill-pattern"]) {
          set(() => map.setLayoutProperty(id, "visibility", "none"));
          break;
        }
        const color =
          id === "water"
            ? "#0a1828"
            : /park|grass|wood|landcover/.test(id)
              ? "#0a1510"
              : id === "building"
                ? "#131a25"
                : "#090e16";
        set(() => map.setPaintProperty(id, "fill-color", color));
        set(() => map.setPaintProperty(id, "fill-outline-color", color));
        break;
      }
      case "line": {
        const color = /path|pedestrian/.test(id)
          ? "#1d4152"
          : /casing/.test(id)
            ? "#090e16"
            : /rail|boundary|park_outline/.test(id)
              ? "#151c28"
              : /water/.test(id)
                ? "#0a1828"
                : "#1a2331";
        set(() => map.setPaintProperty(id, "line-color", color));
        break;
      }
      case "fill-extrusion":
        set(() => map.setPaintProperty(id, "fill-extrusion-color", "#1b2433"));
        set(() => map.setPaintProperty(id, "fill-extrusion-opacity", 0.92));
        break;
      case "symbol":
        if (/^poi|shield|one_way|airport/.test(id)) {
          set(() => map.setLayoutProperty(id, "visibility", "none"));
        } else {
          set(() => map.setPaintProperty(id, "text-color", "#56657a"));
          set(() => map.setPaintProperty(id, "text-halo-color", "#05080f"));
        }
        break;
    }
  }
}
