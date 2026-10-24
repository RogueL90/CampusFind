import Link from "next/link";
import PageShell from "@/components/PageShell";

const SCREENS = [
  { href: "/office", icon: "📦", title: "Lost & Found desk", text: "Scan a finder's QR, check items in, mark pickups." },
  { href: "/moderator", icon: "✅", title: "Proof review", text: "Approve or reject mission proofs and fix the routing." },
  { href: "/authorities", icon: "🏛️", title: "Authority inboxes", text: "What Facilities, IT, UPD and others received." },
];

export default function StaffPage() {
  return (
    <PageShell title="Staff">
      <p className="mb-4 text-xs text-slate-400">Staff tools for the demo. Switch to the matching user in the top right.</p>
      <ul className="space-y-3">
        {SCREENS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="hud-panel flex items-center gap-4 rounded-2xl p-4">
              <span className="text-2xl" aria-hidden>
                {s.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">{s.title}</span>
                <span className="block text-xs text-slate-400">{s.text}</span>
              </span>
              <span className="text-slate-500">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
