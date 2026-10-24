# Integration notes: Person C (reporting, Claude triage, lost & found matching)

How to plug the `person-c/reporting-matching` branch into the rest of Campus Quests. Read the README first for what the feature does; this file covers the seams between our parts.

## 1. Setup after merging

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` (it's gitignored, so never commit it):

| Variable | Needed for | Without it |
| :-- | :-- | :-- |
| `ANTHROPIC_API_KEY` | Claude photo triage, routing, report writing, photo matching | Keyword mock: the flow works, but the reports are generic |
| `ANTHROPIC_MODEL` | Optional model override | Uses `claude-opus-5-5` |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Real database + photo storage | In-memory store, wiped on every server restart |

To set up Supabase, run `supabase/schema.sql` once in the SQL editor. It creates `users` (with the demo users), `reports`, `items`, `matches` and `notifications`, plus the public `photos` bucket and realtime on `reports` and `notifications`.

For Vercel, add the same variables under Project Settings → Environment Variables. The Anthropic key and the service role key are only read server-side (API routes), never in the browser.

## 2. Files and ownership

| Mine (edit freely, but tell me) | Shared (merge carefully) | Placeholders for you to replace |
| :-- | :-- | :-- |
| `app/report/`, `app/inbox/`, `app/matches/`, `app/authorities/` | `lib/db.ts`, `lib/types.ts` | `components/PinPicker.tsx` (Person A) |
| `app/api/triage`, `upload`, `photos`, `reports`, `match`, `matches`, `notifications`, `authorities` | `supabase/schema.sql` | `app/page.tsx` home (whoever owns the map) |
| `lib/vision.ts`, `lib/categories.ts`, `lib/fixPath.ts`, `lib/matching.ts`, `lib/matchScore.ts`, `lib/reportFooter.ts` | `app/layout.tsx`, `components/Header.tsx` | `lib/users.ts`, `lib/session.ts`, `lib/clientUser.ts` (demo login) |

The likely merge conflicts are `lib/db.ts`, `lib/types.ts`, `app/layout.tsx` and `package.json`. If you already have your own `lib/db.ts`, keep yours and copy in the functions listed in section 4. The route handlers only call those names.

## 3. Person A: PinPicker

`app/report/page.tsx` uses it like this:

```tsx
<PinPicker onChange={setPin} showRadius={kind === "lost"} initial={pin ?? undefined} />
```

The contract (exported from `components/PinPicker.tsx`):

```ts
export type PinValue = { lat: number; lng: number; radiusM?: number; building?: string };

type Props = {
  onChange: (v: PinValue) => void; // call on every pin move
  showRadius?: boolean;             // lost reports: let the user size a circle (25–500 m), report radiusM
  initial?: PinValue;               // restore the pin when the user goes back a step
};
```

To swap yours in, either replace the file or change the import in `app/report/page.tsx`. Please keep:
- **Default export** of the component, plus the `PinValue` type export.
- **`onChange` on every move, not just on confirm.** The Next button is enabled once a pin exists.
- **`building`, if you can work it out** (nearest building name). It goes into the report sent to staff ("Location: Clark Hall (37.336, -121.882)") and the match review screen. Leave it undefined if not.
- **`radiusM` only when `showRadius` is true.**

## 4. Data contract (`lib/db.ts`)

Every function is server-only and async. Supabase is used when the env vars are set; otherwise data is in memory.

| Function | Use |
| :-- | :-- |
| `createReport(input: NewReport): Report` | Saves a report. **Always computes `fix_path`** and appends the location/time footer to `report_body`. Lost/found item fields go in `input.item`. |
| `getReport(id)` | One report, with `item` joined |
| `listOpenLostReports()` | Lost reports with `status = "open"` from the last 30 days |
| `listReportsBy(userId)` | A user's own reports |
| `listReportsForAuthority(authorityId)` | Reports where `routed_to` is the authority or `cc` includes it |
| `setReportStatus(id, status)` | Status change |
| `createMatch`, `getMatch`, `findMatch`, `setMatchStatus` | Lost/found matches |
| `createNotification({user_id, title, body, link})`, `getNotifications(userId)`, `markNotificationsRead(userId)` | Inbox |
| `savePhoto(bytes, contentType) → url`, `photoForModel(url)` | Photo storage, and conversion to a data URL for Claude |

### The `Report` shape (`lib/types.ts`)

```ts
{
  id, reporter_id, kind: "issue" | "lost" | "found",
  category,            // see lib/categories.ts, or "lost_found"
  issue_type,          // Claude's subtype, or the item type ("airpods_case")
  severity,            // 1–5
  title, description, photo_urls: string[],
  lat, lng, building, floor,
  fix_path: "staff" | "self_fixable" | "lost_found",
  hazard_flags: string[], access_impact: string[],
  routed_to,           // authority id, e.g. "it_services"
  cc: string[],        // other authority ids
  identified,          // what Claude saw in the photo
  routing_reason, report_subject, report_body,
  contains_sensitive,  // blur the photo for everyone except the reporter
  status, created_at,
  item?: { category, color, brand, marks, radius_m, lost_from, lost_to, whereabouts }
}
```

Status values used so far: issues start at `submitted`; lost and found start at `open` and become `matched` when the owner confirms. If someone adds the full status lifecycle from MASTER.md (in progress, fixed, checked in…), use `setReportStatus` and keep `open` meaning "still looking" for lost reports, because matching depends on it.

## 5. Map / HUD: showing reports

There's no "all reports" endpoint yet; add one in your part (for example `GET /api/reports/map`) using a query over `reports`. Things to know:

- **Beacon colour and icon:** use `ISSUE_CATEGORIES[category].icon` / `.label` and `categoryLabel(category)` from `lib/categories.ts`. The categories are pothole, garbage, broken_streetlight, road_damage, graffiti, noise_complaint, damaged_sidewalk, damaged_traffic_sign, fallen_tree, clogged_drain, park_playground_damage, broken_traffic_signal, abandoned_vehicle, dead_animal, water_leakage, open_manhole, flooding, weak_wifi, other, plus lost_found.
- **Beacon height:** `severity` (1–5).
- **Missions:** `fix_path === "self_fixable"` means it can become a mission (low-severity garbage or weak Wi-Fi with no hazards). `lost_found` gives search/delivery missions. `staff` is view-only.
- **Accessibility alerts:** `access_impact` lists who it blocks (wheelchair, low_vision, no_stairs, crutches), and `hazard_flags` lists dangers. Good candidates for alerts are `pothole`, `damaged_sidewalk`, `road_damage`, `open_manhole`, `flooding` and `fallen_tree` with a non-empty `access_impact`.
- **Privacy:** lost reports must render as a ~50 m circle, never the exact point (MASTER.md). The lost circle's size is in `item.radius_m`.
- **Sensitive photos:** if `contains_sensitive`, use `<Photo sensitive isReporter={viewerId === report.reporter_id} />` from `components/Photo.tsx`, or apply `blur-xl` yourself.
- **Live updates:** `reports` is already added to Supabase Realtime in `schema.sql`.

## 6. API endpoints

| Method + path | Body / query | Returns |
| :-- | :-- | :-- |
| `POST /api/upload` | multipart `photo` (image, ≤ 8 MB) | `{ url }` |
| `GET /api/photos/[name]` | — | The image (in-memory mode only) |
| `POST /api/triage` | `{ photoUrl, kind: "issue" \| "lost" \| "found", note? }` | `Triage` JSON (all the report fields above, plus `source: "claude" \| "mock"`) |
| `POST /api/reports` | `{ kind, triage, photoUrl, lat, lng, radiusM?, building?, lostFrom?, lostTo?, atOffice? }` | `{ report, matches }`. Found reports are matched immediately. |
| `GET /api/reports` | — | The current user's reports |
| `POST /api/match` | `{ foundReportId }` | Re-runs matching for a found report |
| `GET /api/matches/[id]` | — | `{ match, lost, found, viewer_id }` (owner or finder only) |
| `POST /api/matches/[id]` | `{ action: "confirm" \| "reject" }` | Owner only. Confirm notifies the finder. |
| `GET /api/notifications` / `POST /api/notifications` | — | List / mark all read |
| `GET /api/authorities/[id]` | — | That authority's received reports |

Triage takes about 5–8 s with Claude, and finding a match about 10–12 s, because it also compares the photos. The report screen starts triage as soon as the photo is picked, so the wait mostly overlaps with placing the pin.

## 7. Auth: replacing the demo users

Right now the "logged-in" user is a `cq_user` cookie set from the dropdown in the header (Maya, Leo, L&F Office in `lib/users.ts`). When real SJSU sign-in lands:

1. Change `currentUser()` in `lib/session.ts` to return the signed-in user's `{ id, name, email, role }`. Every API route goes through it, so nothing else on the server changes.
2. Replace `useDemoUser()` in `lib/clientUser.ts` (used by the header, inbox and match screens) with your auth hook, and remove the user dropdown from `components/Header.tsx`.
3. `reports.reporter_id` and `notifications.user_id` reference `users.id`, so real users need rows in `users`.

## 8. Notifications

The bell polls `GET /api/notifications` every 4 s (`lib/useNotifications.ts`), which works without Supabase. Once everyone is on Supabase you can switch to a realtime subscription on `notifications`, which is already in the publication. Other features can notify people too: call `createNotification({ user_id, title, body, link })` from any server code, and `link` is where tapping the notification goes.

Not built yet: the reward and points notifications from the Lost & Found office check-in (the office/points owner's part).

## 9. Lost & Found office hand-off

When the owner confirms a match, both reports become `matched` and the finder is told to drop the item at the office. The office check-in (QR scan, `items.whereabouts = "at_office"`, `office_checkin_at`, points) is not in this branch. Whoever builds it should:

- **Set `items.whereabouts`** to `at_office`, then `picked_up`. The match screen already shows "Pick it up at the Lost & Found office" when it's `at_office`.
- **Notify the owner** with `createNotification` when the item is checked in.
- **Not award a return reward to the person who reported it lost** (MASTER.md anti-abuse rule). Matching already skips pairing someone's found report with their own lost report.

## 10. Changing what Claude does

- **Categories or authorities:** edit `lib/categories.ts`. The Claude prompt, the review screen dropdowns and the staff view all read from it. If you add an authority, give it a clear `handles` description, because that's what Claude routes on.
- **Routing rules and report style:** edit `TRIAGE_SYSTEM` in `lib/vision.ts`.
- **Which issues become missions:** edit `SELF_FIX_ALLOWLIST` in `lib/fixPath.ts` and update `lib/fixPath.test.ts`.
- **Match weights and threshold:** edit `lib/matchScore.ts`, then run `npm test`.

## 11. Checklist before the demo

- [ ] `.env.local` has `ANTHROPIC_API_KEY` on the demo laptop (and in Vercel if deployed)
- [ ] `npm test` and `npm run build` pass after the merge
- [ ] Person A's `PinPicker` is swapped in and still calls `onChange` on every move
- [ ] Maya reports the lost AirPods case, Leo reports finding it, and Maya's bell lights up on her phone
- [ ] A problem photo (pothole, overflowing bin or Wi-Fi speed test) shows up under the right department in Staff view (`/authorities`)
- [ ] With an in-memory store, don't restart the dev server between rehearsal and the live demo (or use Supabase)
