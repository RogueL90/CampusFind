"use client";

import { useNow } from "@/lib/useNow";

export default function Countdown({ expiresAt }: { expiresAt: string }) {
  const now = useNow(1000);
  if (!now) return <span className="font-mono text-amber-300">30:00 left</span>;
  const remaining = Math.max(0, Date.parse(expiresAt) - now);
  const seconds = Math.floor(remaining / 1000);
  return remaining === 0 ? (
    <span className="font-mono font-semibold text-rose-300">Claim expired</span>
  ) : (
    <span className="font-mono font-semibold text-amber-300">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} left
    </span>
  );
}
