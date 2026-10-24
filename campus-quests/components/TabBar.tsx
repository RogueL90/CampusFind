"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Map", icon: "🛰️" },
  { href: "/report", label: "Report", icon: "📸" },
  { href: "/missions", label: "Missions", icon: "★" },
  { href: "/rewards", label: "Rewards", icon: "🎟️" },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tab-bar z-20 grid shrink-0 grid-cols-4 border-t border-cyan-400/20 bg-[#070b13]" aria-label="Main">
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-cyan-300" : "text-slate-400"}`}
          >
            <span className="text-lg leading-none" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
