# Campus Quests

3D HUD campus map for SJSU: report beacons, 3D obstacles, accessibility alerts, lost & found missions and rewards. Plan and roles live one folder up in `MASTER.md` and `roles/`.

## Run it

```bash
npm install      # also copies the MapLibre worker into public/
npm run dev      # http://localhost:3000
```

Open it on a phone on the same Wi-Fi with the "Network" URL that `npm run dev` prints. Tap **Walk** on the map to run the Clark Hall construction demo.

## Where things live

| Path | What | Owner |
| :---- | :---- | :---- |
| `components/map/HomeScreen.tsx` | Home screen: wires the map, HUD, alerts and demo walk | A |
| `components/map/CampusMap.tsx` | MapLibre 3D scene: beacons, obstacle volumes, detours, rings, markers | A |
| `components/map/PinPicker.tsx` | `<PinPicker onChange={({ lat, lng, radiusM }) => …} withRadius />` for the report flow | A |
| `components/hud/*` | Compass strip, status corner, Ahead card, filter chips, accessibility panel | A |
| `lib/geo/*` | Campus constants, demo geometry (traced from OpenStreetMap), obstacle math | A |
| `lib/types.ts` | Shared types. Announce changes in the team chat | A |
| `lib/data.ts` | **Import all data functions from here.** It re-exports `lib/mock.ts` today and switches to `lib/db.ts` when Supabase is ready | A |
| `lib/mock.ts` | In-memory version of every data function, seeded with the demo story | A |
| `lib/db.ts`, `supabase/*`, `components/UserSwitcher.tsx` | Supabase data layer and demo user switcher | B |
| `app/report`, `app/inbox`, `app/api/*`, `lib/fixPath.ts` | Reporting, triage, matching | C |
| `components/ReportSheet.tsx`, `app/missions`, `app/rewards`, `app/office`, `app/moderator` | Missions, rewards, staff screens | D |

`components/ReportSheet.tsx` and `components/UserSwitcher.tsx` are working placeholders; D and B replace them in place, keeping the same props.

## Demo users

Pick a user with the avatar button on the map or the dropdown on other pages: Maya (reporter), Leo (helper, starts with 60 points), Lost & Found desk, Moderator.
