# Person B: Backend, data and live updates

Read [shared.md](shared.md) first: it has the goal, ground rules, folder ownership, the `lib/db.ts` data functions, the timeline and the demo script.

Owns Supabase: the schema, seed data, data functions, points rules and realtime.

1. **Supabase project:** create it, enable PostGIS and turn on Realtime for `reports`, `missions`, `matches`, `points_ledger` and `notifications`. Create a public Storage bucket called `photos`. Keep row-level security permissive for the demo and say so in the pitch.
2. **`supabase/schema.sql`:** every table in the MASTER.md data model, including `reports.footprint` and the new `access_alerts` fields, plus a small `notifications` table (`user_id`, `text`, `link`, `read`, `created_at`). Add a view `reports_geo` that returns `lat`, `lng` and `ST_AsGeoJSON(footprint)` so the map gets GeoJSON directly.
3. **`supabase/seed.sql`:**
   - the four demo users; Leo starts with 60 spendable points, so one return takes him past a $5 voucher on stage
   - about 25 reports around SJSU across all categories, with titles from Person E
   - the five obstacles, detour lines and simulate-walk path from Person A (already traced from OpenStreetMap in `campus-quests/lib/geo/campus.ts` as `DEMO_GEOMETRY`; the matching report rows and `access_alerts` rows are in `lib/mock.ts`)
   - one open lost report: a black AirPods case on MLK Library floor 3
   - missions for the self-fixable reports
   - a rewards catalog: a $5 meal credit for 100 points
4. **Postgres functions** for the rules that must be atomic:
   - `claim_mission`: 30-minute lock; no claiming your own report; one active claim per student
   - `check_in_item(code)`: item moves to "at office" and the finder gets +50; `mark_picked_up` adds +25
   - `review_proof`: approve makes points spendable; reject reverses them
   - `redeem_reward`: checks the spendable balance and the 300-point weekly cap, then returns a 6-character code
   - a balance view that sums `points_ledger` by state
   - For the demo, check-in points are spendable right away; mention the 24-hour pending window in the pitch.
5. **`lib/db.ts`:** implement every function in the contract above with `@supabase/supabase-js`, with the same signatures as `lib/mock.ts`.
6. **`UserSwitcher` + `useCurrentUser`:** a dropdown in the header that stores the chosen demo user's id in `localStorage`.

**Done when:** Persons A, C and D can switch their import from `lib/mock.ts` to `lib/db.ts` and everything still works, with live updates showing up on a second phone.

**Starter AI prompt:**

```text
Write supabase/schema.sql for Postgres + PostGIS from this data model: [paste the MASTER.md data model table and CREATE TABLE].
Add reports.footprint geography(Polygon,4326), a notifications table, and a reports_geo view returning lat, lng and ST_AsGeoJSON(footprint).
Write plpgsql functions: claim_mission (30-min lock, cannot claim own report, one active claim), check_in_item(code) (+50 points to the finder in points_ledger), mark_picked_up (+25), review_proof(approve bool), redeem_reward (spendable balance check, 300/week cap, returns a 6-char code).
Then write lib/db.ts in TypeScript with supabase-js implementing these signatures: [paste the contract].
```

## Your checkpoints

- Fri 7 PM: Supabase project created and schema applied; keys shared in the team chat.
- Fri 10 PM: seed data loaded (with Person A's obstacles and Person E's report titles) and `lib/db.ts` working.
- Fri ~1 AM: everyone switched from mock data to the real database.
- Sat 8:30 AM: points, claims and redemption work in the full demo loop.
