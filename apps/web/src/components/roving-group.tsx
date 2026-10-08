"use client";

import { type FocusEvent, type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";

const ITEM = "[data-roving-item]";

type Direction = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

// The item nearest `from` in `direction`, judged by on-screen position
// rather than DOM order — the squad is laid out as formation rows of
// different lengths, so "up" from a midfielder should land on the closest
// defender above, not on whichever card happens to precede it in the DOM.
function nearest(from: HTMLElement, items: HTMLElement[], direction: Direction): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    if (item === from) continue;
    const b = item.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;
    const ahead =
      direction === "ArrowLeft" ? dx < -1 : direction === "ArrowRight" ? dx > 1 : direction === "ArrowUp" ? dy < -1 : dy > 1;
    if (!ahead) continue;
    // Distance along the travel axis, with the cross-axis drift weighted
    // so the nearest card in the same row/column wins over a diagonal one.
    const horizontal = direction === "ArrowLeft" || direction === "ArrowRight";
    const score = horizontal ? Math.abs(dx) + 3 * Math.abs(dy) : Math.abs(dy) + 0.5 * Math.abs(dx);
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

// One Tab stop for a whole set of controls (the squad's 15 player cards),
// moved through with the arrow keys — the standard "roving tabindex"
// pattern. Without it, reaching the transfer search meant tabbing past
// every card. Items opt in with `data-roving-item` and a stable
// `data-roving-id`; tabindex is managed here, imperatively, on the DOM
// (React never sets it on those elements, so nothing fights over it).
export function RovingGroup({ label, children }: { label: string; children: ReactNode }) {
  const groupRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<string | null>(null);

  // After every render: exactly one item is tabbable — the last one that
  // had focus if it still exists (cards come and go with transfers),
  // otherwise the first.
  useEffect(() => {
    const items = Array.from(groupRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    const active = items.find((item) => item.dataset.rovingId === activeId.current) ?? items[0];
    for (const item of items) item.tabIndex = item === active ? 0 : -1;
  });

  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    const item = (event.target as HTMLElement).closest<HTMLElement>(ITEM);
    if (!item) return;
    activeId.current = item.dataset.rovingId ?? null;
    for (const other of groupRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? []) {
      other.tabIndex = other === item ? 0 : -1;
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const key = event.key;
    const items = Array.from(groupRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    const current = (event.target as HTMLElement).closest<HTMLElement>(ITEM);
    if (!current || items.length === 0) return;
    let target: HTMLElement | null = null;
    if (key === "Home") target = items[0];
    else if (key === "End") target = items[items.length - 1];
    else if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
      target = nearest(current, items, key);
    } else return;
    event.preventDefault();
    target?.focus();
  }

  return (
    <div ref={groupRef} role="group" aria-label={label} onFocus={handleFocus} onKeyDown={handleKeyDown}>
      {children}
    </div>
  );
}
