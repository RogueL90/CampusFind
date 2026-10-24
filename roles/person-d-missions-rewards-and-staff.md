# Person D: Missions, rewards and staff screens

Read [shared.md](shared.md) first: it has the goal, ground rules, folder ownership, the `lib/db.ts` data functions, the timeline and the demo script.

Owns everything after a pin is tapped: claiming, proof, check-in, review and vouchers.

1. **`<ReportSheet report>`:** the bottom sheet Person A opens when a beacon is tapped. It shows the photo, title, category, routing ("Sent to Facilities"), a status timeline from `status_events`, a "Me too" button, and for missions the points, the proof needed and a Claim button.
2. **Claiming and `/missions`:** Claim starts a 30-minute countdown. The tracker shows active and completed missions, pending versus spendable points, and progress toward the next voucher.
3. **Proof capture:** in-app camera input plus the current GPS position. Reject proof taken more than 50 m from the pin (`turf.distance`), then call `submitProof`.
4. **Finder QR:** after a found report, show a "Bring it to Lost & Found" card with a QR code and a 6-digit backup code (`qrcode.react`).
5. **`/office` console** (laptop-sized): scan the QR code with `html5-qrcode` or type the code, see the item photo, press Check in. Points then appear live in the finder's HUD. Add an "Owner picked up" button for the bonus.
6. **`/moderator` console:** a list of proofs to review with photos and Approve/Reject buttons, plus a `fix_path` override dropdown that logs each change.
7. **`/rewards`:** spendable balance, a progress bar to the next $5 voucher, the catalog, and Redeem, which shows a one-time code and QR "to scan at dining checkout".
8. **Stretch:** a "Returned 1 item" badge and a building-vs-building leaderboard using seeded numbers.

**Done when:** Leo's QR code is scanned on the office laptop, +50 points appear on his phone, and he redeems a $5 voucher code.

**Starter AI prompt:**

```text
In a Next.js App Router + TypeScript + Tailwind mobile-first app, build:
(1) components/ReportSheet.tsx: a bottom sheet for a Report with photo, title, category chip, "Sent to {routed_to}", status timeline, "Me too" button, and for missions points, proof needed and a Claim button with a 30-minute countdown;
(2) /missions tracker;
(3) a finder QR card (qrcode.react) with a 6-digit code;
(4) /office: a laptop console that scans the QR with html5-qrcode or accepts a typed code, then calls checkInItem(code);
(5) /moderator: proof review with approve/reject;
(6) /rewards: balance, progress bar to 100 points, and redeem showing a one-time code and QR.
Use the functions in lib/db.ts (mock in lib/mock.ts).
```

## Your checkpoints

- Fri 10 PM: `ReportSheet` and the `/office` console work on mock data; Person A can open the sheet from the map.
- Fri ~1 AM: claims, check-in and rewards use the real database.
- Sat 8:30 AM: QR check-in, points and voucher redemption work in the full demo loop.
