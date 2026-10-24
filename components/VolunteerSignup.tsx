"use client";

import { useState } from "react";
import { authorityName } from "@/lib/categories";
import { COMMON_RULES, VOLUNTEER_PROGRAMS, type VolunteerDepartment } from "@/lib/volunteer";

/** Shown instead of "Claim" until the student joins the department's volunteer program. */
export default function VolunteerSignup({
  department,
  busy,
  onRegister,
}: {
  department: VolunteerDepartment;
  busy: boolean;
  onRegister: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const p = VOLUNTEER_PROGRAMS[department];
  return (
    <div className="mt-2.5 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3 text-slate-200">
      <p className="font-semibold text-emerald-200">
        Volunteer with {authorityName(department)} to take this on
      </p>
      <p className="mt-1">
        {p.program}: {p.tasks} You earn points and community service hours for each approved task.
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-slate-300">
        {[...p.rules, ...COMMON_RULES].map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <label className="mt-2.5 flex items-start gap-2">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-emerald-400" />
        <span>I agree to these rules</span>
      </label>
      <button
        disabled={!agreed || busy}
        onClick={onRegister}
        className="mt-2.5 w-full rounded-lg bg-emerald-400 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50"
      >
        {busy ? "Registering…" : "Register and claim · 30 min"}
      </button>
    </div>
  );
}
