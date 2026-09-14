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

export function PlayerSearch({
  position,
  userId,
  gameweekNumber,
  searchAction,
  onSelect,
  onClose,
}: {
  position: Position;
  userId: string;
  gameweekNumber: number;
  searchAction: (
    userId: string,
    gameweekNumber: number,
    options: { position?: Position; search?: string },
  ) => Promise<PlayerSearchResult>;
  onSelect: (player: PlayerListItem) => void;
  onClose: () => void;
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
    // Mobile: a normal centered, dimmed modal — there's no room to show the
    // squad and this side by side. From md up: an undimmed panel pinned to
    // the top-right of the viewport, leaving the squad fully visible (and
    // interactive) beside it for comparison while browsing.
    <div
      className="fixed top-0 right-0 bottom-0 left-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm md:top-20 md:right-4 md:bottom-4 md:left-auto md:items-start md:justify-end md:bg-transparent md:p-0 md:backdrop-blur-none"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Transfer in a ${position}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-black/[.08] bg-white p-6 shadow-xl dark:border-white/[.145] dark:bg-zinc-950 md:h-full md:w-80"
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-base font-semibold text-black dark:text-zinc-50">
            Transfer in a {position}
          </p>
          <button
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Close
          </button>
        </div>

        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="mt-4 rounded-md border border-black/[.08] px-3 py-2 text-sm outline-none transition-colors focus:border-primary dark:border-white/[.145] dark:bg-black dark:focus:border-accent"
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
    </div>
  );
}
