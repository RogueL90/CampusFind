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
          Snap a photo and drop a pin. AI works out what it is, sends a written report to the right campus team, and
          matches lost and found items by photo.
        </p>
      </div>
      <Link
        href="/report"
        className="block rounded-2xl bg-cyan-300 py-4 text-center text-lg font-semibold text-slate-900"
      >
        + New report
      </Link>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/inbox" className="rounded-2xl border border-white/15 bg-white/5 py-4 text-center">
          Inbox
        </Link>
        <Link href="/authorities" className="rounded-2xl border border-white/15 bg-white/5 py-4 text-center">
          Staff view
        </Link>
      </div>
    </div>
  );
}
