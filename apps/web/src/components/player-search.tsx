"use client";

import { useEffect, useState } from "react";
import type { PlayerListItem, PlayerSearchResult, Position } from "@/lib/api";
import { formatPrice } from "@/components/pitch";

const STATUS_LABELS: Record<string, string> = {
  i: "Injured",
  s: "Suspended",
  d: "Doubtful",
  u: "Unavailable",
};

export type SearchAction = (
  userId: string,
  gameweekNumber: number,
  options: { position?: Position; search?: string },
) => Promise<PlayerSearchResult>;

// The search box + results list only — no modal/panel chrome, so it can be
// dropped into either a mobile modal or the always-visible desktop side
// panel. Pass a `key` that changes with the target player so switching
// targets remounts this with a fresh search box instead of carrying over
// stale query text.
export function PlayerSearchResults({
  position,
  userId,
  gameweekNumber,
  searchAction,
  onSelect,
}: {
  position: Position;
  userId: string;
  gameweekNumber: number;
  searchAction: SearchAction;
  onSelect: (player: PlayerListItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PlayerSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchAction(userId, gameweekNumber, { position, search: query || undefined })
        .then((res) => {
          if (!cancelled) setResult(res);
        })
        .catch(() => {
          if (!cancelled) setError("Couldn't load players. Try again.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, position, userId, gameweekNumber, searchAction]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name…"
        className="rounded-md border border-black/[.08] px-3 py-2 text-sm outline-none transition-colors focus:border-primary dark:border-white/[.145] dark:bg-black dark:focus:border-accent"
      />

      <div className="mt-4 flex-1 overflow-y-auto">
        {loading ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : !result || result.players.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No matching players.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {result.players.map((player) => (
              <li key={player.playerId}>
                <button
                  onClick={() => onSelect(player)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-black dark:text-zinc-50">
                      {player.webName}
                    </span>
                    <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
                      {player.club}
                    </span>
                    {STATUS_LABELS[player.status] && (
                      <span className="shrink-0 text-xs text-red-600 dark:text-red-400">
                        {STATUS_LABELS[player.status]}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-zinc-600 dark:text-zinc-300">
                    {formatPrice(player.currentPrice)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {result && result.total > result.players.length && !loading && (
        <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Showing {result.players.length} of {result.total} — refine your search to see more.
        </p>
      )}
    </div>
  );
}
