import Link from "next/link";

// Placeholder home until the 3D map lands; links into the reporting and lost & found flows.
export default function Home() {
  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-3xl font-semibold leading-tight">
          See it. Snap it.
          <br />
          <span className="text-cyan-300">Fixed or found.</span>
        </h1>
        <p className="mt-2 text-white/70">
          Report a campus problem or a lost item in under 30 seconds. EAiSER routes it to the right team, and we match
          lost and found items by photo.
        </p>
      </div>
      <Link
        href="/report"
        className="block rounded-2xl bg-cyan-300 py-4 text-center text-lg font-semibold text-slate-900"
      >
        + New report
      </Link>
      <Link href="/inbox" className="block rounded-2xl border border-white/15 bg-white/5 py-4 text-center">
        Inbox
      </Link>
    </div>
  );
}
