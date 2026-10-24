"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import FinderCard from "@/components/FinderCard";
import PageShell, { Empty, ErrorNote } from "@/components/PageShell";
import Photo from "@/components/Photo";
import { userName } from "@/lib/currentUser";
import { getCheckinCode, getMatch, respondToMatch, subscribeReports } from "@/lib/data";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLive } from "@/lib/useLive";

// The match id is only known at request time, so the shell streams and the review fills in.
export default function MatchPage() {
  return (
    <PageShell title="Possible match" back="/inbox">
      <Suspense fallback={<p className="pt-10 text-center text-sm text-slate-400">Loading…</p>}>
        <MatchReview />
      </Suspense>
    </PageShell>
  );
}

function MatchReview() {
  const { id } = useParams<{ id: string }>();
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, error: loadError } = useLive(
    async () => {
      const m = await getMatch(id);
      const code = m && m.found.reporter_id === user.id ? await getCheckinCode(m.found.id) : null;
      return m ? { ...m, code } : (false as const);
    },
    subscribeReports,
    [id, user.id],
  );

  async function answer(confirm: boolean) {
    setBusy(true);
    setError(null);
    try {
      await respondToMatch(id, confirm);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your answer.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorNote>{loadError}</ErrorNote>;
  if (data === null) return <p className="pt-10 text-center text-sm text-slate-400">Loading…</p>;
  if (!data) return <Empty>This match doesn&apos;t exist anymore.</Empty>;

  const { match, lost, found, code } = data;
  const isOwner = user.id === lost.reporter_id;
  const isFinder = user.id === found.reporter_id;
  if (!isOwner && !isFinder) {
    return <Empty>Only the owner ({userName(lost.reporter_id)}) and the finder ({userName(found.reporter_id)}) can see this match.</Empty>;
  }
  const atOffice = found.item?.whereabouts !== "with_finder";

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-cyan-300">{Math.round(match.score * 100)}% confident</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">{isOwner ? "Is this yours?" : "Your find may have an owner"}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <figure>
          <Photo src={lost.photo_urls[0]} alt="Lost item" sensitive={lost.contains_sensitive} isReporter={isOwner} className="aspect-square" />
          <figcaption className="mt-1.5 text-xs text-slate-400">{isOwner ? "You reported" : `${userName(lost.reporter_id)} lost`}</figcaption>
        </figure>
        <figure>
          <Photo src={found.photo_urls[0]} alt="Found item" sensitive={found.contains_sensitive} isReporter={isFinder} className="aspect-square" />
          <figcaption className="mt-1.5 text-xs text-slate-400">Found {found.building ? `near ${found.building}` : "on campus"}</figcaption>
        </figure>
      </div>

      <dl className="grid grid-cols-3 gap-x-3 gap-y-1 rounded-2xl bg-white/5 p-4 text-sm">
        <dt className="text-slate-500" />
        <dt className="text-slate-500">Lost</dt>
        <dt className="text-slate-500">Found</dt>
        {(
          [
            ["Item", lost.item?.category, found.item?.category],
            ["Color", lost.item?.color, found.item?.color],
            ["Brand", lost.item?.brand, found.item?.brand],
            ["Marks", lost.item?.marks, found.item?.marks],
          ] as const
        ).map(([label, a, b]) => (
          <div key={label} className="contents">
            <dd className="text-slate-500">{label}</dd>
            <dd className="text-slate-100">{a?.replace(/_/g, " ") ?? "—"}</dd>
            <dd className="text-slate-100">{b?.replace(/_/g, " ") ?? "—"}</dd>
          </div>
        ))}
      </dl>

      {error && <ErrorNote>{error}</ErrorNote>}

      {match.status === "suggested" && isOwner && (
        <div className="grid grid-cols-2 gap-3">
          <button disabled={busy} onClick={() => answer(false)} className="rounded-xl border border-white/20 py-3.5 font-medium text-white disabled:opacity-40">
            Not mine
          </button>
          <button disabled={busy} onClick={() => answer(true)} className="rounded-xl bg-cyan-400 py-3.5 font-semibold text-slate-950 disabled:opacity-40">
            It&apos;s mine
          </button>
        </div>
      )}
      {match.status === "suggested" && isFinder && <p className="text-sm text-slate-300">We asked {userName(lost.reporter_id)} to confirm.</p>}

      {match.status === "confirmed" && (
        <div className="rounded-2xl border border-emerald-300/40 bg-emerald-300/10 p-4 text-sm">
          <p className="font-medium text-emerald-200">{isOwner ? "It's yours!" : "The owner confirmed it's theirs."}</p>
          <p className="mt-1 text-slate-200">
            {atOffice
              ? isOwner
                ? "Pick it up at the Lost & Found office with your student ID. Staff will ask you to describe it or unlock it first."
                : "It's at the Lost & Found office. Thanks for bringing it in."
              : isOwner
                ? "The finder is bringing it to the Lost & Found office. We'll ping you when it's checked in."
                : "Bring it to the Lost & Found office and show your code to earn +50."}
          </p>
        </div>
      )}
      {match.status === "rejected" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          {isOwner ? "Thanks, we'll keep looking. Your lost report stays open." : "The owner said this isn't theirs. Please still drop it at Lost & Found."}
        </div>
      )}

      {isFinder && !atOffice && <FinderCard code={code} title={found.title} />}

      <Link href={`/?report=${isOwner ? lost.id : found.id}`} className="block text-center text-sm text-cyan-300">
        Show on map ›
      </Link>
    </div>
  );
}
