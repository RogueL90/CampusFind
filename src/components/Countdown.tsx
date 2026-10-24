"use client";
import { useEffect, useState } from "react";
export function Countdown({ expiresAt }: { expiresAt: string }) {
 const [remaining, setRemaining] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));
 useEffect(() => { const tick = () => setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now())); tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer); }, [expiresAt]);
 const seconds = Math.floor(remaining / 1000); return <span className={remaining === 0 ? "font-bold text-red-600" : "font-bold text-[#557244]"}>{remaining === 0 ? "Claim expired" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} left to submit`}</span>;
}
