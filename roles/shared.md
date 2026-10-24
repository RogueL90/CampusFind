# Campus Quests: Shared Plan (everyone reads this)

**Goal:** by Saturday 1 PM, show a working prototype of the demo loop in MASTER.md ("Hackathon scope"), backed by real student feedback, a promotion plan and a clear pitch, as the hackathon prompt asks.

Five people, five areas, one file each:

- [Person A: Integration and the 3D HUD map](person-a-integration-and-3d-map.md)
- [Person B: Backend, data and live updates](person-b-backend-and-data.md)
- [Person C: Reporting, AI triage and Lost & Found matching](person-c-reporting-ai-and-matching.md)
- [Person D: Missions, rewards and staff screens](person-d-missions-rewards-and-staff.md)
- [Person E: Research, testing, promotion and pitch](person-e-research-promotion-and-pitch.md)

Everyone builds against mock data first, so nobody waits on anyone else.

## Shared ground rules (everyone, 5 minutes)

- **Stack:** Next.js (App Router, TypeScript) + Tailwind, Supabase, MapLibre GL JS + OpenFreeMap, turf.js, deployed on Vercel. Details are in MASTER.md under "Hackathon stack".
- **One repo.** Each person works on their own branch and in their own folders (table below). Person A merges into `main` at each checkpoint.
- **Mock first.** Always import data functions from `@/lib/data`. It re-exports `lib/mock.ts` until Person B's `lib/db.ts` is ready, then Person A switches that one line.
- **The app lives in `campus-quests/`.** Run `npm install` and `npm run dev` there; its README lists who owns which file.
- **Shared types** live in `lib/types.ts` (`Report`, `Mission`, `AccessAlert`, `Match`, `LedgerEntry`, `User`). Person A writes them in the first hour from the MASTER.md data model. Announce any change in the team chat.
- **Secrets** go in `.env.local`, shared in the team chat, never committed.
- **No real login for the demo.** Four seeded users and a user switcher: Maya (reporter), Leo (helper), Office desk, Moderator. SJSU email sign-in goes in the pitch.

| Folder / route | Owner |
| :---- | :---- |
| App shell, tab bar, `app/page.tsx` (home map), `components/map/*`, `components/hud/*`, `lib/types.ts`, `lib/mock.ts`, `lib/geo/*` | A |
| `supabase/schema.sql`, `supabase/seed.sql`, `lib/db.ts`, `components/UserSwitcher.tsx` | B |
| `app/report/*`, `app/inbox/*`, `app/api/triage/*`, `app/api/match/*`, `lib/fixPath.ts` | C |
| `components/ReportSheet.tsx`, `app/missions/*`, `app/rewards/*`, `app/office/*`, `app/moderator/*` | D |
| Survey, interviews, test notes, Momentum AI Studio entries, slides, demo video | E |

**Data functions** (`lib/db.ts`, mirrored in `lib/mock.ts`):

```ts
getReports(): Promise<Report[]>                  // includes lat, lng, footprint GeoJSON
subscribeReports(onChange: () => void): () => void
getAccessAlerts(): Promise<AccessAlert[]>        // obstacle style, impact, detour line
createReport(input: NewReport): Promise<Report>  // also creates a mission when fix_path allows
voteMeToo(reportId: string): Promise<void>
claimMission(missionId: string): Promise<Mission>
submitProof(missionId: string, proof: NewProof): Promise<void>
reviewProof(proofId: string, approve: boolean): Promise<void>
checkInItem(code: string): Promise<{ itemTitle: string; points: number }>
markPickedUp(reportId: string): Promise<void>
getBalance(userId: string): Promise<{ pending: number; spendable: number }>
redeemReward(rewardId: string): Promise<{ code: string }>
getNotifications(userId: string): Promise<Notification[]>
// Extras the screens needed (also in lib/mock.ts):
getUsers(): Promise<User[]>
getRewards(): Promise<Reward[]>
getPendingProofs(): Promise<(Proof & { report: Report })[]>
getCheckinCode(reportId: string): Promise<string>  // 6-digit code behind the finder's QR
```

Functions that act as "the current user" (`claimMission`, `redeemReward`) read the demo user from `getCurrentUserId()` in `lib/currentUser.ts`.

## Timeline

| When | Checkpoint |
| :---- | :---- |
| Fri 7:00 PM | A: repo, deploy, types and mock data live. B: Supabase project and schema. E: survey posted. |
| Fri 10:00 PM | A: 3D map with beacons and obstacles on mock data, `PinPicker` shipped. B: seed and `lib/db.ts` working. C: triage returns JSON. D: `ReportSheet` and office screen on mock data. **Merge 1.** |
| Fri ~1:00 AM | Everyone switched from mock data to the real database. **Merge 2.** Sleep. |
| Sat 8:30 AM | Full demo loop works on the deployed URL. **Merge 3.** |
| Sat 9:30–10:30 AM | Usability tests (E leads, everyone watches). |
| Sat 10:30–11:30 AM | Fixes from feedback. **Feature freeze at 11:30.** |
| Sat 11:30 AM | Record the backup demo video and do the final deploy. |
| Sat 12:15 PM | Two full rehearsals. |
| Sat 1:00 PM | Present. |

## Demo script (about 3 minutes)

1. **Maya** photographs her lost AirPods case. The AI fills in the details, and she circles MLK Library floor 3. A search mission appears on the 3D map live.
2. **Leo** reports finding it. Maya's phone gets "Possible match for your AirPods case."
3. Leo shows his QR code at the **office console**. It's checked in, and +50 points pop into his HUD.
4. Leo redeems a **$5 meal voucher** code.
5. Switch to a **wheelchair profile** and tap **Simulate walk** toward Clark Hall. The construction zone pulses, ⚠ appears on the compass strip, the Ahead card counts down, the phone speaks the alert and the cyan detour lights up.
