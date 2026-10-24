# Campus Quests

A mobile-first SJSU campus demo for student reports, community missions, Lost & Found check-in, proof moderation, and rewards.

## Person D demo flow

- Open **Missions** and claim a 30-minute quest.
- Submit photo proof from within 50 meters of the report pin; moderator approval moves points from pending to spendable.
- Open any found-item report to display its QR and six-digit backup code. In the Office console use demo code **482731** to check in the AirPods case and award +50 points. Owner pickup adds +25.
- In **Rewards**, spendable points can be redeemed for the $5 campus dining credit; a one-time code and QR are displayed for checkout.
- Use **Moderator** to approve/reject proof and record a fix-path override.

The app currently uses the in-memory mock adapter in `src/lib/mock.ts`. Replace imports with the matching `lib/db.ts` functions when the Supabase adapter is ready; mock changes reset on page reload.

## Run locally

Requires Node.js 20 or later and npm. Install dependencies with `npm install`, start the development server with `npm run dev`, then visit `http://localhost:3000`. Run `npm run build` to verify a production build.
