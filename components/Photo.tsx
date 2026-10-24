"use client";

import { useState } from "react";

type Props = {
  src: string | null | undefined;
  alt: string;
  /** From triage: IDs, cards, screens or faces. */
  sensitive?: boolean;
  /** Only the reporter sees a sensitive photo unblurred. */
  isReporter?: boolean;
  className?: string;
};

export default function Photo({ src, alt, sensitive, isReporter, className = "" }: Props) {
  const blurred = !!sensitive && !isReporter;
  const [failed, setFailed] = useState(false);

  if (!src || failed)
    return (
      <div className={`grid place-items-center rounded-xl bg-white/5 text-sm text-white/40 ${className}`}>No photo</div>
    );

  return (
    <div className={`relative overflow-hidden rounded-xl bg-white/5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- user uploads from mixed origins */}
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover ${blurred ? "scale-110 blur-xl" : ""}`}
      />
      {blurred && (
        <span className="absolute inset-x-2 bottom-2 rounded-md bg-black/60 px-2 py-1 text-center text-xs">
          Hidden: may show personal info
        </span>
      )}
    </div>
  );
}
