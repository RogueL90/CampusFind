# Campus Quests Integration Guide

This guide is for bringing the completed work from Parts A–E into the Person D branch, resolving shared-file conflicts, and checking the integrated demo before the final merge/deploy.

## Branch and merge plan

Use the repository's `main` branch as the integration base. Each owner should finish and push their own feature branch first. Person D (integration coordinator) brings those branches into the integration branch one at a time, testing after each merge.

Suggested order:

1. **Part B — data contract and Supabase:** shared types, schema, seed data, `lib/db.ts`, user switcher.
2. **Part A — app shell, map, and shared map components:** home map, obstacles, HUD, `PinPicker`, and map-to-report-sheet callback.
3. **Part C — reporting, triage, and matching:** report creation and match notifications.
4. **Part D — missions, proof, check-in, moderation, and rewards:** retain this branch’s screens and wire them to the final shared data adapter.
5. **Part E — pitch and validation materials:** bring in documentation/assets without replacing app code.

Before merging, fetch branch updates and confirm the owner has pushed the latest commit. Merge each branch normally; do not force-push shared branches or overwrite a teammate's work to resolve a conflict. When files overlap, reconcile the implementation in one edit and ask the file owner to confirm the final contract.

Example merge sequence (replace branch names with the actual names from the team):

```sh
git switch main
git pull --ff-only origin main
git switch person-d-missions-rewards
git merge origin/<part-b-branch>
# Resolve and validate conflicts before proceeding.
git merge origin/<part-a-branch>
git merge origin/<part-c-branch>
```

After each successful integration checkpoint:

```sh
npm run build
git status --short
git push
```

If the team has already agreed on a different integration branch, use that branch instead of `main`; avoid integrating independent branches by copying files over one another.

## Shared contracts to settle first

Before swapping mock imports to Supabase, agree on the canonical exports and types. Keep `lib/mock.ts` and `lib/db.ts` behaviorally interchangeable so screens can use one adapter import. The shared contract from `shared.md` is:

- `getReports`, `subscribeReports`, `getAccessAlerts`, `createReport`, `voteMeToo`
- `claimMission`, `submitProof`, `reviewProof`
- `checkInItem`, `markPickedUp`, `getBalance`, `redeemReward`
- `getNotifications`

Part D currently also needs mission and reward-catalog reads. Ensure Part B’s adapter exposes matching `getMissions` and `rewards`/`getRewards` functions, or adjust Part D imports once and keep the function signatures consistent across both adapters. Keep the domain types for `Report`, `Mission`, `NewProof`, `Reward`, `Notification`, and balance values in the shared types module rather than defining competing versions in feature components.

### Important behavior to preserve

- Claiming a mission starts the 30-minute lock and prevents a second active claim where required by the database rules.
- Proof submission includes the photo reference and coordinates. Validate the point against the report pin (50 m maximum) in the real-GPS build. The current mock version simulates the point at the pin strictly for demo testing; do not carry that behavior into production GPS mode.
- Approved proof releases pending points; rejected proof reverses pending points.
- Office check-in awards +50 once per valid item code; owner pickup awards the separate +25 bonus once.
- Reward redemption must use the server/database result and enforce balance and weekly-cap rules. Never treat the client mock balance as authoritative in the integrated build.
- For a real multi-device demo, persist to Supabase and subscribe to updates. `localStorage` mock persistence only shares state within that browser profile.

## Owner integration checklist

### Part A — map and HUD

- Mount `CampusMap` on the Explore/home route without replacing Part D routes or the app-level layout.
- Connect beacon selection to `ReportSheet` with the selected `Report` and its associated `Mission` when available.
- Use the shared `PinPicker` in Part C’s reporting flow and keep the `{ lat, lng, radiusM }` output shape.
- Confirm obstacle alerts, map filters, and the map’s live report subscription do not register duplicate listeners after navigation.

### Part B — backend and shared shell

- Apply schema and seed scripts to the intended Supabase project; confirm Realtime is enabled for tables used by screens.
- Keep secrets in local environment configuration, not committed files. Provide a safe example environment file with variable names only if needed.
- Replace the data adapter import in the UI with `lib/db.ts` only after its signatures match the mock adapter.
- Integrate `UserSwitcher` with the shell’s selected user. Ensure points, missions, check-in attribution, and notifications all use the selected demo user's ID rather than a hardcoded user.
- Confirm the RLS/demo access policy is understood and described as demo-only.

### Part C — reporting and matching

- Preserve Part D’s mission, office, moderator, and reward routes while adding report/inbox/API routes.
- After a found report is created, show the finder QR and backup code using the persisted check-in code expected by `checkInItem`.
- Ensure proof photos and report photos use authorized storage URLs and that sensitive images follow the reporting privacy rules.
- Verify an item match creates a notification visible to the correct owner, without exposing another user's private data.

### Part D — screens and points loop

- Keep `ReportSheet` as the map’s detail sheet and confirm the status timeline maps the backend status-event shape.
- Use the real claim, proof, review, check-in, balance, and redemption functions after Part B is integrated.
- Show the submitted proof photo in Moderator; preserve the fix-path override and its audit history when the backend supports it.
- Confirm the QR payload/code format agrees between FinderCard and Office. Typed backup-code entry remains available if camera scanning is unavailable.
- Keep accessibility and safety guardrails visible; a student mission must not ask them to perform hazardous or Facilities-only work.

### Part E — evidence and presentation

- Add final survey findings, interview summaries, usability observations, promotion plan, slides, and demo script as separate presentation/documentation files.
- Do not include personal data or interview quotes without permission. Keep demo credentials and secrets out of slides and commits.
- Rehearse the final path and prepare a backup recording in case live network access fails.

## Full integration test

Run this sequence with the same seeded/demo users and confirm the result at each step:

1. **Maya:** create a lost-item report with photo and pin; verify the report appears on Explore and an eligible mission is created.
2. **Leo:** submit a found report that matches the lost item; verify Maya receives the match notification.
3. **Leo:** open the found-report sheet and display the QR/backup code. At the Office screen, scan or type the code. Confirm one +50 ledger award and a live balance update; a repeat check-in must not award again.
4. **Maya:** confirm the returned item (if the integrated flow includes pickup). Verify owner pickup marks the item and awards the separate +25 only once.
5. **Leo:** claim a self-fixable mission; verify the 30-minute deadline. Submit proof from within 50 m of its report pin. Confirm proof outside the radius is rejected.
6. **Moderator:** view the actual submitted proof image, change the fix path if needed, then approve or reject. Verify ledger pending/spendable balances update correctly.
7. **Leo:** redeem the $5 reward at 100 spendable points. Verify the code is single-use and the backend rejects insufficient balance or a weekly-cap violation.
8. Refresh and open a second browser/device session. Verify persisted data and realtime updates; confirm no stale mock-only state is shown.
9. Test mobile layout, keyboard navigation, camera/QR fallback, and browser location permissions. Run the live pitch demo once from a clean seeded state.

## Before the final merge

- [ ] All owner branches are pushed; integration branch is up to date with the agreed base.
- [ ] Shared type/function signatures are consistent across mock and database adapters.
- [ ] No `.env`, service-role key, private credentials, raw personal data, `.next/`, or `node_modules/` are staged.
- [ ] Home map, reporting, matching, missions, office, moderator, and rewards routes all load.
- [ ] The full integration test above passes with the seeded data.
- [ ] `npm run build` passes; warnings are reviewed.
- [ ] A clean deploy/preview URL is smoke-tested on phone and desktop.
- [ ] Person D pushes the final integrated branch and opens a pull request into the team’s agreed default branch; do not merge it until owners review their shared-file changes.
