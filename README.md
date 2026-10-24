# Campus Quests (SpartHill Hackathon)

Lost & Found by photo and a 3D HUD campus map for SJSU. See MASTER.md for the full design.

This branch has **Person C's part: reporting, AI triage with Claude, and lost & found matching.**

## How reporting works

The student does two things: **snap a photo** and **drop a pin**. Claude (computer vision via the Anthropic API) does the rest:

1. **Identifies** what's in the photo (e.g. "a deep, water-filled pothole beside crosswalk markings").
2. **Categorizes** it: pothole, garbage, broken streetlight, road damage, graffiti, noise complaint, damaged sidewalk, damaged traffic sign, fallen tree, clogged drain, park/playground damage, broken traffic signal, abandoned vehicle, dead animal, water leakage, open manhole, flooding, weak Wi-Fi, or other.
3. **Routes** it to the right campus authority (weak Wi-Fi → IT Services, open manhole → Facilities with UPD cc'd, and so on) and explains why.
4. **Writes the report** the authority receives ("Observed / Impact / Requested action"). Location and time are appended automatically.

The student reviews it and taps **Send**. Everything is editable, but they rarely need to touch it. Staff see what landed in each authority's queue at `/authorities`.

Lost and found items use the same photo + pin flow (with a Problem / Lost item / Found item toggle, since a photo alone can't tell whether you lost something or found it). Claude also fills in the item's color, brand and marks, and compares lost and found photos for matching.

## Run it

```bash
npm install
cp .env.example .env.local   # then paste your ANTHROPIC_API_KEY into .env.local
npm run dev
```

Open http://localhost:3000, or http://<your-laptop-ip>:3000 on a phone on the same Wi-Fi.

| Variables | Turns on |
| :-- | :-- |
| `ANTHROPIC_API_KEY` | Claude triage, routing, report writing and photo similarity (model `claude-opus-5-5`; override with `ANTHROPIC_MODEL`). Without it, a keyword mock keeps the demo running. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Postgres + the `photos` bucket (run `supabase/schema.sql` first). Without them, data lives in server memory and is wiped on restart. |

**Never commit `.env.local`.** On Vercel, add the same variables under Project Settings → Environment Variables. The key is only read server-side.

```bash
npm test     # fixPath + match scoring unit tests
```

## Demo loop

1. Header → **Maya** → **New report** → toggle **Lost item** → photo of the AirPods case → **MLK Library** → *Last 3 hours* → **Confirm**.
2. Header → **Leo** (or a second phone) → **New report** → **Found item** → photo → **MLK Library** → **Confirm**.
3. Back as **Maya**: the bell lights up with "Possible match for your AirPods case…" → **Review** → both photos side by side → **Confirm** or **Not mine**.
4. Any problem photo (pothole, overflowing bin, Wi-Fi speed test) → pin → **Send to …** → open **Staff view** to show the report arriving at that authority.

## What's where

| Path | What |
| :-- | :-- |
| `app/report/page.tsx` | Photo → pin → review. Upload and Claude triage start the moment the photo is picked, so the report is usually ready by the time the pin is placed. |
| `lib/vision.ts` | Claude calls via `@anthropic-ai/sdk` with structured output (zod schema): triage + report writing, and lost/found photo similarity. Keyword mock fallback. |
| `lib/categories.ts` | The categories and the campus authorities Claude routes to, with each authority's responsibilities and per-category defaults. |
| `app/api/triage/route.ts` | `{photoUrl, kind}` → `{category, issue_type, severity, title, identified, hazard_flags, access_impact, routed_to, cc, routing_reason, report_subject, report_body, contains_sensitive, color, brand, marks}` |
| `app/authorities/page.tsx`, `app/api/authorities/[id]` | Staff view: each authority's received reports. |
| `lib/fixPath.ts` (+ test) | Lost/found → `lost_found`; garbage or weak Wi-Fi with severity ≤ 2 and no hazards → `self_fixable` (a student mission); else `staff`. |
| `app/api/match/route.ts`, `lib/matching.ts`, `lib/matchScore.ts` (+ test) | Scores a found report against open lost reports: category 0.3, color/brand 0.2, distance 0.2, time 0.1, Claude photo similarity 0.2. At ≥ 0.6 creates a match and notifies the owner. |
| `app/matches/[id]/page.tsx` | Match review: both photos, Confirm / Not mine. |
| `app/inbox/page.tsx`, `components/Header.tsx` | Notifications bell + inbox. |
| `components/Photo.tsx` | Blurs sensitive photos (IDs, cards, screens, plates, faces) for everyone but the reporter. |
| `lib/db.ts` | Supabase when configured, in-memory otherwise. |
| `components/PinPicker.tsx` | **Placeholder** for Person A's map picker, same `onChange({lat, lng, radiusM})` contract. |
| `supabase/schema.sql` | Tables, `photos` bucket, realtime. |

## Notes for the team

- Reports are "sent" by storing them against the authority (see Staff view). Hooking up real email or work-order systems is out of scope for the hackathon.
- `lib/db.ts` and `lib/types.ts` are shared; merge with Person A/B's versions if they differ.
