# Campus Quests (SpartHill Hackathon)

Lost & Found by photo and a 3D HUD campus map, built on top of EAiSER at SJSU. See MASTER.md for the full design.

This branch has **Person C's part: reporting, AI triage and lost & found matching.**

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 on a laptop, or http://<your-laptop-ip>:3000 on a phone on the same Wi-Fi.

With no `.env.local` everything runs on mock data: an in-memory store (shared by every phone hitting the same dev server, wiped on restart) and keyword-based triage from the optional note. Copy `.env.example` to `.env.local` to turn on the real pieces:

| Variables | Turns on |
| :-- | :-- |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Postgres + the `photos` bucket. Run `supabase/schema.sql` first. |
| `EAISER_API_URL` (+ `EAISER_API_KEY`) | EAiSER triage |
| `OPENAI_API_KEY` | OpenAI vision triage and photo similarity (strict JSON schema) |
| `GEMINI_API_KEY` | Gemini vision, used if OpenAI isn't set |

Triage tries EAiSER, then OpenAI, then Gemini, then the mock, so the demo never dead-ends.

```bash
npm test     # fixPath + match scoring unit tests
```

## Demo loop

1. Header → pick **Maya** → **New report** → *I lost something* → photo → note "black airpods case" → **MLK Library** → *Last 3 hours* → **Confirm**.
2. Header → pick **Leo** (or a second phone) → *I found something* → photo → **MLK Library** → **Confirm**.
3. Back as **Maya**: the bell lights up (polls every 4 s, buzzes on Android) with "Possible match for your AirPods case. It's on its way to the Lost & Found office." → **Review** → photos side by side → **Confirm** or **Not mine**.

## What's where

| Path | What |
| :-- | :-- |
| `app/report/page.tsx` | 3-step flow (type → photo → pin) + confirm screen with AI-filled, editable fields. Upload starts on photo pick and triage runs while the pin is placed, to stay under 30 s. |
| `app/api/triage/route.ts`, `lib/vision.ts` | `{photoUrl, note, kind}` → `{category, issue_type, severity, title, hazard_flags, access_impact, routed_to, contains_sensitive, color, brand, marks}` |
| `lib/fixPath.ts` (+ test) | MASTER.md rules: lost/found → `lost_found`; allowlisted type + severity ≤ 2 + no hazards → `self_fixable`; else `staff`. Pests never self-fix. |
| `app/api/match/route.ts`, `lib/matching.ts`, `lib/matchScore.ts` (+ test) | Scores a found report against open lost reports: category 0.3, color/brand 0.2, distance to the lost circle 0.2, time window 0.1, vision photo similarity 0.2. At ≥ 0.6 inserts a `matches` row and one notification per owner. The photo call is skipped when the other signals can't reach 0.6. |
| `app/matches/[id]/page.tsx` | Match review: both photos side by side, Confirm / Not mine. Confirm notifies the finder without sharing contact details. |
| `app/inbox/page.tsx`, `components/Header.tsx` | Bell with unread count + inbox. |
| `components/Photo.tsx` | Blurs `contains_sensitive` photos for everyone except the reporter. |
| `lib/db.ts` | `createReport`, `getNotifications`, matches, photos. Supabase when configured, in-memory otherwise. |
| `components/PinPicker.tsx` | **Placeholder** for Person A's map picker (lat/lng boxes, SJSU presets, "my location", radius slider). Same `onChange({lat, lng, radiusM})` contract. |
| `lib/users.ts`, `lib/session.ts` | Demo users (Maya, Leo, L&F Office) via a cookie until real SJSU sign-in. |
| `supabase/schema.sql` | `users`, `reports`, `items`, `matches`, `notifications`, the `photos` bucket and realtime. |

## Notes for the team

- `lib/db.ts` and `lib/types.ts` are shared. If Person A/B already have their own, merge into theirs; the function names here are what the report and match code calls.
- Mock photo similarity is a neutral 0.5, so matches rely on the other signals until a vision key is set.
- Not built here: office check-in and points (another person's part) and expiry/renewal of lost reports beyond filtering out ones older than 30 days.
