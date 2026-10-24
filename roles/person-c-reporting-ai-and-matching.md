# Person C: Reporting, AI triage and Lost & Found matching

Read [shared.md](shared.md) first: it has the goal, ground rules, folder ownership, the `lib/db.ts` data functions, the timeline and the demo script.

Owns how reports get in and how lost and found items find each other.

1. **`/report` flow:** choose Issue, Lost or Found. Take a photo with `<input type="file" accept="image/*" capture="environment">` and upload it to the `photos` bucket. Place the pin with Person A's `PinPicker` (use a lat/lng text box until Friday 10 PM). Lost reports also get an area radius and an optional time window.
2. **`/api/triage`:** takes a photo URL and an optional note. Call EAiSER's API if we have access; otherwise call a vision model (OpenAI or Gemini) with a strict JSON schema. Both return the same shape: `category`, `issue_type`, `severity` (1–5), `title`, `hazard_flags`, `access_impact`, `routed_to`, `contains_sensitive`, and for items `color`, `brand`, `marks`. Show a confirm screen where every field is pre-filled and editable, so the student only taps Confirm.
3. **`lib/fixPath.ts`:** a pure function that applies the MASTER.md rules: the allowlist, low severity and no hazard flags make a report `self_fixable`; lost and found reports are `lost_found`; everything else is `staff`. Add a few unit tests.
4. **`/api/match`:** when a found report comes in, score it against open lost reports:
   - category match: 0.3
   - color and brand: 0.2
   - distance from the found pin to the lost circle: 0.2
   - time window: 0.1
   - photo similarity from the vision model comparing both images: 0.2
   - At a score of 0.6 or more, insert a `matches` row and a notification: "Possible match for your AirPods case. It's at the Lost & Found office."
5. **Match review screen:** the owner sees both photos side by side, with Confirm and Not mine buttons.
6. **`/inbox`:** a bell icon in the header showing notifications.
7. **Stretch:** when `contains_sensitive` is true, show the photo blurred (CSS `blur`) everywhere except to the reporter.

**Done when:** Maya can report the lost AirPods case in under 30 seconds, Leo can report finding it, and Maya gets the match notification on her phone.

**Starter AI prompt:**

```text
In a Next.js App Router + TypeScript + Tailwind app, build:
(1) /report: a 3-step flow (type: issue/lost/found -> photo upload to Supabase Storage bucket "photos" -> place pin via <PinPicker onChange={({lat,lng,radiusM})=>...}/>), then a confirm screen with AI-filled editable fields;
(2) app/api/triage/route.ts that sends the photo URL to a vision model and returns strict JSON {category, issue_type, severity, title, hazard_flags, access_impact, routed_to, contains_sensitive, color, brand, marks};
(3) app/api/match/route.ts that scores a found report against open lost reports (category 0.3, color/brand 0.2, distance 0.2, time 0.1, vision-model photo similarity 0.2) and inserts matches and notifications at score >= 0.6.
Use createReport and getNotifications from lib/db.ts.
```

## Your checkpoints

- Fri 10 PM: `/api/triage` returns JSON and the `/report` flow works on mock data.
- Fri ~1 AM: reports save to the real database; `PinPicker` from Person A plugged in.
- Sat 8:30 AM: lost report, found report and match notification work in the full demo loop.
