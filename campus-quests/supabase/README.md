# Backend setup (Person B)

1. Create a Supabase project (free tier).
2. SQL editor → paste and run `schema.sql`. It enables PostGIS, creates every table, view and function, turns on Realtime for the live tables and creates the public `photos` bucket.
3. SQL editor → run `seed.sql`. **Run it again before every rehearsal** to reset the demo (Leo back to 60 points with a teal Hydro Flask to check in using code `482731`, AirPods lost report open, no live reports).
4. Copy Project Settings → API → Project URL and the anon public key into `campus-quests/.env.local`, then restart `npm run dev`. `lib/data.ts` switches from the in-browser mock to `lib/db.ts` automatically when both are set.

## Demo data
- Obstacles (section 4 of `seed.sql`) use the same OpenStreetMap-traced geometry as `DEMO_GEOMETRY` in `lib/geo/campus.ts`. Paste coordinates as `lng lat` pairs if you change them.
- `routed_to` and `cc` hold authority ids from `lib/categories.ts` (`fdo_maintenance`, `it_services`, …).

## Demo user ids
| User | id |
| :-- | :-- |
| Maya (reporter) | `a0000000-0000-4000-8000-000000000001` |
| Leo (helper, 60 pts) | `a0000000-0000-4000-8000-000000000002` |
| Lost & Found desk | `a0000000-0000-4000-8000-000000000003` |
| Moderator | `a0000000-0000-4000-8000-000000000004` |

## Say in the pitch
- Row-level security is permissive for the demo and functions trust the client's user id. Production: SJSU email sign-in and policies on `auth.uid()`.
- Check-in points are spendable immediately for the demo; production holds them pending for 24 hours.
