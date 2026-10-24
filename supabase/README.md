# Backend setup (Person B)

1. Create a Supabase project (free tier). Copy the Project URL and the anon key into `.env.local` (see `.env.example`) and post them in the team chat.
2. SQL editor → paste and run `schema.sql`. It enables PostGIS, creates every table, view and function, turns on Realtime for the live tables and creates the public `photos` bucket.
3. SQL editor → run `seed.sql`. **Run it again before every rehearsal** to reset the demo (Leo back to 60 points, AirPods lost report open, no live reports).
4. `npm i @supabase/supabase-js`, then everyone changes `from '@/lib/mock'` to `from '@/lib/db'`.

## Swap in teammates' data
- Person E's 25 titles: section 3 of `seed.sql`.
- Person A's obstacle GeoJSON: section 4 of `seed.sql` (footprints, detour lines, `clark_walk` path). Paste coordinates as `lng lat` pairs.

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
