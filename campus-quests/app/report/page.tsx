"use client";

import { useState } from "react";
import PageShell, { ComingSoon } from "@/components/PageShell";
import PinPicker, { type PinValue } from "@/components/map/PinPicker";

export default function ReportPage() {
  const [pin, setPin] = useState<PinValue | null>(null);
  return (
    <PageShell title="Report">
      <ComingSoon owner="Person C" what="Issue, lost and found reports: photo, AI-filled details, and a pin." />
      <h2 className="mb-2 mt-6 text-xs uppercase tracking-wider text-slate-400">PinPicker preview</h2>
      <PinPicker withRadius onChange={setPin} />
      <pre className="mt-2 font-mono text-[11px] text-slate-400">{pin ? JSON.stringify(pin) : "No pin yet"}</pre>
    </PageShell>
  );
}
