"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import Photo from "@/components/Photo";
import { useDemoUser } from "@/lib/clientUser";
import type { Match, Report } from "@/lib/types";

type Data = { match: Match; lost: Report; found: Report; viewer_id: string };

// The match id is only known at request time, so the page shell streams and the review fills in.
export default function MatchReviewPage() {
  return (
    <Suspense fallback={<p className="pt-10 text-center text-white/60">Loading…</p>}>
      <MatchReview />
    </Suspense>
  );
}

function MatchReview() {
  const { id } = useParams<{ id: string }>();
  const user = useDemoUser();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/matches/${id}`, { cache: "no-store" });
    const body = await res.json();
    setError(res.ok ? null : (body.error ?? "Couldn't load this match"));
    setData(res.ok ? body : null);
  }, [id]);

  // Reload when the demo user changes: the owner and the finder see different things.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetch(`/api/matches/${id}`, { cache: "no-store" }).then(async (res) => {
      const body = await res.json();
      if (!alive) return;
      setError(res.ok ? null : (body.error ?? "Couldn't load this match"));
      setData(res.ok ? body : null);
    });
    return () => {
      alive = false;
    };
  }, [user, id]);

  async function answer(action: "confirm" | "reject") {
    setBusy(true);
    await fetch(`/api/matches/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await load();
    setBusy(false);
  }

  if (error) return <p className="pt-10 text-center text-white/60">{error}</p>;
  if (!data) return <p className="pt-10 text-center text-white/60">Loading…</p>;

  const { match, lost, found, viewer_id } = data;
  const isOwner = viewer_id === lost.reporter_id;
  const pct = Math.round(match.score * 100);
  const atOffice = found.item?.whereabouts === "at_office";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-cyan-300">Possible match · {pct}% confident</p>
        <h1 className="text-2xl font-semibold">Is this yours?</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <figure>
          <Photo
            src={lost.photo_urls[0]}
            alt="Your lost item"
            sensitive={lost.contains_sensitive}
            isReporter={viewer_id === lost.reporter_id}
            className="aspect-square"
          />
          <figcaption className="mt-1.5 text-xs text-white/60">You reported</figcaption>
        </figure>
        <figure>
          <Photo
            src={found.photo_urls[0]}
            alt="Found item"
            sensitive={found.contains_sensitive}
            isReporter={viewer_id === found.reporter_id}
            className="aspect-square"
          />
          <figcaption className="mt-1.5 text-xs text-white/60">Found {found.building ? `near ${found.building}` : "on campus"}</figcaption>
        </figure>
      </div>

      <dl className="grid grid-cols-3 gap-x-3 gap-y-1 rounded-2xl bg-white/5 p-4 text-sm">
        <dt className="text-white/50" />
        <dt className="text-white/50">Yours</dt>
        <dt className="text-white/50">Found</dt>
        {(
          [
            ["Item", lost.item?.category, found.item?.category],
            ["Color", lost.item?.color, found.item?.color],
            ["Brand", lost.item?.brand, found.item?.brand],
            ["Marks", lost.item?.marks, found.item?.marks],
          ] as const
        ).map(([label, a, b]) => (
          <div key={label} className="contents">
            <dd className="text-white/50">{label}</dd>
            <dd>{a?.replace(/_/g, " ") ?? "—"}</dd>
            <dd>{b?.replace(/_/g, " ") ?? "—"}</dd>
          </div>
        ))}
      </dl>

      {match.status === "suggested" && isOwner && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => answer("reject")}
            className="rounded-xl border border-white/20 py-3.5 font-medium disabled:opacity-40"
          >
            Not mine
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => answer("confirm")}
            className="rounded-xl bg-cyan-300 py-3.5 font-semibold text-slate-900 disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      )}

      {match.status === "confirmed" && (
        <div className="rounded-2xl border border-emerald-300/40 bg-emerald-300/10 p-4">
          <p className="font-medium text-emerald-200">It&apos;s yours!</p>
          <p className="mt-1 text-sm text-white/80">
            {atOffice
              ? "Pick it up at the Lost & Found office with your student ID."
              : "The finder is bringing it to the Lost & Found office. We'll ping you when it's checked in. Bring your student ID."}
          </p>
        </div>
      )}

      {match.status === "rejected" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          Thanks, we&apos;ll keep looking. Your lost report stays open.
        </div>
      )}

      <Link href="/inbox" className="block text-center text-sm text-white/60">
        ← Back to inbox
      </Link>
    </div>
  );
}
