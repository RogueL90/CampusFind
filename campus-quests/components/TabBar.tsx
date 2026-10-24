"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const TABS = [
  { href: "/", label: "Map", icon: "🛰️" },
  { href: "/report", label: "Report", icon: "📸" },
  { href: "/missions", label: "Missions", icon: "★" },
  { href: "/rewards", label: "Rewards", icon: "🎟️" },
  { href: "/staff", label: "Staff", icon: "🛠️" },
];

const STAFF_PATHS = ["/staff", "/office", "/moderator", "/authorities"];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href === "/staff") return STAFF_PATHS.some((p) => pathname.startsWith(p));
  return pathname.startsWith(href);
}

function Tabs({ pathname }: { pathname: string | null }) {
  return (
    <nav className="tab-bar z-20 grid shrink-0 grid-cols-5 border-t border-cyan-400/20 bg-[#070b13]" aria-label="Main">
      {TABS.map((t) => {
        const active = pathname !== null && isActive(t.href, pathname);
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

function ActiveTabs() {
  return <Tabs pathname={usePathname()} />;
}

// Dynamic routes only know the pathname at request time; the fallback is the same bar without a highlight.
export default function TabBar() {
  return (
    <Suspense fallback={<Tabs pathname={null} />}>
      <ActiveTabs />
    </Suspense>
  );
}
