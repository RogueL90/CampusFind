# Person A: Integration and the 3D HUD map

Read [shared.md](shared.md) first: it has the goal, ground rules, folder ownership, the `lib/db.ts` data functions, the timeline and the demo script.

Owns the repo, the app shell, the home screen map with its HUD, the obstacle visuals and alerts, demo mode, merging and the deployed build.

**1. Set up the project (first hour)**
- Create the Next.js + Tailwind + TypeScript repo, push it, invite the team and connect Vercel so every merge to `main` deploys.
- Add the folder skeleton, `lib/types.ts`, and `lib/mock.ts` with about 10 fake reports around SJSU.
- Add a bottom tab bar (Map, Report, Missions, Rewards) with empty route stubs for the others to fill in.

**2. Build the 3D campus**
- `components/map/CampusMap.tsx`: MapLibre with the OpenFreeMap Liberty style (`https://tiles.openfreemap.org/styles/liberty`), centered on SJSU (37.3352, -121.8811), zoom 17, pitch 60, bearing -30. Load it with `next/dynamic` and `ssr: false`.
- Restyle for the HUD look: dark background and land, muted gray `building-3d` extrusions, and labels dimmed so reports stand out.

**3. Draw report beacons**
- Turn each report point into a small `turf.circle` (radius about 2 m) and render all of them in one `fill-extrusion` layer colored by category. Height = 15 + severity × 8 + "Me too" votes × 3 meters.
- Missions get a floating "+50" badge (an HTML `maplibregl.Marker`).
- Lost item reports render as a soft 50 m circle on the ground, never a point.

**4. Draw obstacles in 3D**
- Draw footprints for four demo obstacles at [geojson.io](https://geojson.io): a construction zone at the Clark Hall north entrance, a pothole on a main walkway, a blocked ramp at Engineering and a broken elevator at MLK Library. Draw a detour line for each and a "Simulate walk" path that leads into the construction zone. Give the GeoJSON to Person B for the seed.
- Render them as MASTER.md describes:
  - construction zone: a see-through amber `fill-extrusion` about 4 m tall
  - pothole: a short red cylinder
  - blocked ramp: a red barrier wall (`turf.buffer` a short line, then extrude it)
  - broken elevator: a labeled red marker
  - blocked route: a red line, with the detour as an animated cyan dashed line
- Add a pulsing ring under each obstacle by animating `circle-radius` and opacity in `requestAnimationFrame`.

**5. Build the HUD**
- `CompassStrip`: a heading bar driven by the map bearing. Place an icon and distance for each obstacle and mission ahead using `turf.bearing` and `turf.distance`.
- `StatusCorner`: points balance from `getBalance`, the active mission countdown and "LIVE · N open reports".
- `AheadCard`: the nearest relevant obstacle within 150 m, a live distance and a "Show detour" button that flies the camera there.
- `FilterChips`: category, status and distance. Hidden categories fade out of the 3D scene.
- A 2D toggle that sets pitch to 0 and flattens the extrusions. Respect `prefers-reduced-motion`.

**6. Add proximity alerts**
- `useLocation` hook: real GPS from `navigator.geolocation.watchPosition`, or the simulated position in demo mode.
- On each position update, compute the distance to each obstacle's edge (`turf.pointToLineDistance` against `turf.polygonToLine`). Under 150 m, if the obstacle affects this student's needs and hasn't alerted today, trigger the alert: the obstacle pulses faster, the screen edge glows amber, the Ahead card slides up, `navigator.vibrate` runs where supported, and `speechSynthesis` reads the alert aloud.
- A small accessibility settings panel (wheelchair, crutches, low vision, avoid stairs) saved in `localStorage`. Obstacles that don't affect the student are dimmed.

**7. Add demo mode**
- "Simulate walk" button: move the user's dot along the preset path with `turf.along` at walking pace (sped up 3×), with the camera following and the heading pointing along the path.

**8. Build the shared map pieces for teammates**
- `PinPicker` for Person C, by Friday 10 PM: a small 2D map where the user taps to drop a pin, with an optional radius slider for lost items. It returns `{ lat, lng, radiusM }`.
- On beacon tap, open Person D's `<ReportSheet report={...} />`.
- Live updates: call `subscribeReports` and refresh the map sources with `setData`.

**9. Integrate and ship**
- Merge branches at each checkpoint, run the full demo loop, fix glue bugs and keep the Vercel URL working.
- Test on a real iPhone (Safari) and Android phone (Chrome). Run the live demo during the pitch with Person E.

**Done when:** the deployed URL opens to a dark 3D SJSU campus with colored beacons and four obstacles. Pressing "Simulate walk" makes the construction zone pulse, puts ⚠ on the compass, counts down the Ahead card, speaks the alert and lights the cyan detour.

**Starter AI prompt:**

```text
Create a Next.js 14 App Router + TypeScript + Tailwind component CampusMap (client-only, loaded with next/dynamic ssr:false) using maplibre-gl and @turf/turf.
Use the style https://tiles.openfreemap.org/styles/liberty, center [-121.8811, 37.3352], zoom 17, pitch 60, bearing -30. Restyle to a dark HUD look: dark background and land, muted gray building-3d extrusions.
Props: reports (points with category, severity, votes) and obstacles (GeoJSON polygons/lines with style zone|pothole|barrier|elevator|route, impact blocks|caution, and a detour LineString).
Render reports as small turf.circle polygons in a fill-extrusion layer colored by category, height = 15 + severity*8 + votes*3.
Render obstacles: zone = amber translucent fill-extrusion 4 m tall; pothole = short red cylinder; barrier = turf.buffer of the line, extruded red; route = red line; detour = animated cyan dashed line; plus a pulsing ground ring animated with requestAnimationFrame.
Expose a callback onReportClick(report).
```

## Your checkpoints

- Fri 7 PM: repo, Vercel deploy, `lib/types.ts` and `lib/mock.ts` live.
- Fri 10 PM: 3D map with beacons and obstacles on mock data; `PinPicker` shipped to Person C; obstacle GeoJSON sent to Person B. Run merge 1.
- Fri ~1 AM: map switched to `lib/db.ts` with live updates. Run merge 2.
- Sat 8:30 AM: full demo loop works on the deployed URL. Run merge 3.
- Sat 10:30–11:30 AM: apply the top fixes from Person E's usability tests.
- Sat 1 PM: run the live demo during the pitch.
