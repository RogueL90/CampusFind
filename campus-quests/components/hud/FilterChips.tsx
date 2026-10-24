"use client";

import type { CSSProperties } from "react";
import { CATEGORIES } from "@/lib/geo/campus";
import type { Category } from "@/lib/types";

export default function FilterChips({
  hidden,
  nearbyOnly,
  onToggle,
  onToggleNearby,
}: {
  hidden: Set<Category>;
  nearbyOnly: boolean;
  onToggle: (c: Category) => void;
  onToggleNearby: () => void;
}) {
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter map">
      <button
        onClick={onToggleNearby}
        aria-pressed={nearbyOnly}
        className={`hud-chip ${nearbyOnly ? "hud-chip-on" : ""}`}
        style={{ "--chip-color": "#e2e8f0" } as CSSProperties}
      >
        ◎ 300 m
      </button>
      {CATEGORIES.map((c) => {
        const on = !hidden.has(c.id);
        return (
          <button
            key={c.id}
            onClick={() => onToggle(c.id)}
            aria-pressed={on}
            className={`hud-chip ${on ? "hud-chip-on" : ""}`}
            style={{ "--chip-color": c.color } as CSSProperties}
          >
            <span aria-hidden>{c.icon}</span> {c.label}
          </button>
        );
      })}
    </div>
  );
}
