"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { PlayerListItem, PlayerSearchResult, Position } from "@/lib/api";
import { formatPrice, shirtUrl } from "@/components/pitch";

// "d" (doubtful) isn't labeled — a doubtful player still has a real chance
// of playing, so it's not worth flagging the way a confirmed injury,
// suspension, or (never returned by the search API at all) unavailability
// is.
const STATUS_LABELS: Record<string, string> = {
  i: "Injured",
  s: "Suspended",
  u: "Unavailable",
};

const ALL_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export type SearchAction = (
  userId: string,
  gameweekNumber: number,
  options: { positions?: Position[]; search?: string; offset?: number },
) => Promise<PlayerSearchResult>;

// The search box + results list only — no modal/panel chrome, so it can be
// dropped into either a mobile modal or the always-visible desktop side
// panel. Pass a `key` that changes with the target player so switching
// targets remounts this with a fresh search box and position filter
// instead of carrying over stale state from the last one.
export function PlayerSearchResults({
  requiredPosition,
  anyPosition = false,
  userId,
  gameweekNumber,
  searchAction,
  onSelect,
  reincludePlayers = [],
}: {
  // The only position that can actually complete this transfer — a
  // same-position-only rule enforced by the backend (see CLAUDE.md's
  // "Status and deviations" section) unless `anyPosition` is set. Players
  // of any other position still show up here for browsing, just disabled:
  // picking one wouldn't be a legal transfer. `null` (with `onSelect`
  // omitted) means there's no player transferred out yet — the list is
  // still browsable, just nothing in it can be picked until one is.
  requiredPosition: Position | null;
  // Wildcard/Free Hit lift the same-position restriction entirely for this
  // gameweek — any player is a legal replacement for any transferred-out
  // one, so every row is selectable regardless of position.
  anyPosition?: boolean;
  userId: string;
  gameweekNumber: number;
  searchAction: SearchAction;
  onSelect?: (player: PlayerListItem) => void;
  // Players transferred out earlier in this same unsaved editing session —
  // the backend's pool query only knows about the last *saved* squad, so it
  // still excludes them as "owned" even though they're free again in the
  // plan being built right now. Surfaced ahead of the fetched results
  // (matching the position filter and current search text) rather than
  // merged into them, so they're easy to spot and get back.
  reincludePlayers?: PlayerListItem[];
}) {
  const [query, setQuery] = useState("");
  // Empty = no filter, every position shown, nothing pressed — the default
  // when just browsing with nothing transferred out, or rebuilding the
  // squad under a chip (any position is fair game, so narrowing to just the
  // outgoing player's position isn't a useful default). Seeded with
  // whatever position actually needs filling (matching the "Transfer in a
  // <X>" header) so its button starts pressed and the list starts narrowed
  // to it; this only runs once per mount, which is exactly when it should —
  // the parent remounts this component (via `key`) every time the target
  // changes. Any number of positions can be pressed at once — each click
  // just toggles that one in or out of the set.
  const [selectedPositions, setSelectedPositions] = useState<Set<Position>>(
    () => new Set(requiredPosition && !anyPosition ? [requiredPosition] : []),
  );
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // The player whose profile card is open, if any — placeholder content for
  // now (name/position/club/price/status, whatever's already on hand from
  // the search list) until it's decided what actually belongs on it.
  const [viewingPlayer, setViewingPlayer] = useState<PlayerListItem | null>(null);

  const positionsFilter = selectedPositions.size > 0 ? [...selectedPositions] : undefined;

  function togglePosition(pos: Position) {
    setSelectedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  }

  // Query text or the position filter changing starts over from the first
  // page — the debounce is really only needed for typing, but reusing it
  // for a position toggle too keeps this to one code path.
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchAction(userId, gameweekNumber, {
        positions: positionsFilter,
        search: query || undefined,
        offset: 0,
      })
        .then((res) => {
          if (cancelled) return;
          setPlayers(res.players);
          setTotal(res.total);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedPositions, userId, gameweekNumber, searchAction]);

  // Infinite scroll: fetch the next page once scrolled near the bottom, so
  // the list can be scrolled through in full instead of being capped and
  // requiring a narrower search to see more. A plain scroll listener
  // (checking proximity to the bottom) rather than IntersectionObserver —
  // simpler to reason about and doesn't depend on the sentinel ever
  // actually being painted into view.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    function maybeLoadMore() {
      if (!root || loading || loadingMore || players.length >= total) return;
      const nearBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 300;
      if (!nearBottom) return;
      setLoadingMore(true);
      searchAction(userId, gameweekNumber, {
        positions: positionsFilter,
        search: query || undefined,
        offset: players.length,
      })
        .then((res) => {
          setPlayers((prev) => [...prev, ...res.players]);
          setTotal(res.total);
        })
        .catch(() => setError("Couldn't load more players."))
        .finally(() => setLoadingMore(false));
    }

    root.addEventListener("scroll", maybeLoadMore);
    // Also check right away — the first page alone might already leave
    // room to scroll less than 300px, or not fill the panel at all.
    maybeLoadMore();
    return () => root.removeEventListener("scroll", maybeLoadMore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.length, total, loading, loadingMore]);

  const normalizedQuery = query.trim().toLowerCase();
  const reincludeMatches = reincludePlayers.filter(
    (p) =>
      (selectedPositions.size === 0 || selectedPositions.has(p.position)) &&
      p.webName.toLowerCase().includes(normalizedQuery),
  );
  const fetchedPlayers = players.filter(
    (p) => !reincludeMatches.some((rp) => rp.playerId === p.playerId),
  );
  const displayedPlayers = [...reincludeMatches, ...fetchedPlayers];

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

      <div className="mt-2 flex flex-wrap gap-1.5">
        {ALL_POSITIONS.map((pos) => {
          const active = selectedPositions.has(pos);
          return (
            <button
              key={pos}
              type="button"
              onClick={() => togglePosition(pos)}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-primary bg-primary/10 text-primary dark:border-accent dark:bg-accent/10 dark:text-accent"
                  : "border-black/[.08] text-zinc-500 hover:border-black/20 dark:border-white/[.145] dark:text-zinc-400 dark:hover:border-white/30"
              }`}
            >
              {pos}
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} className="mt-3 flex-1 overflow-y-auto">
        {loading ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : displayedPlayers.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No matching players.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {displayedPlayers.map((player) => {
                const selectable =
                  requiredPosition !== null && (anyPosition || player.position === requiredPosition);
                const isReincluded = reincludeMatches.some((rp) => rp.playerId === player.playerId);
                return (
                  <li key={player.playerId} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setViewingPlayer(player)}
                      aria-label={`View ${player.webName}'s profile`}
                      title="View player profile"
                      className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-black/[.04] hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-white/[.08] dark:hover:text-zinc-300"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM9 9a.75.75 0 0 0 0 1.5h.25v3.25H9a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-.25v-4A.75.75 0 0 0 10.5 9H9Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={selectable ? () => onSelect?.(player) : undefined}
                      disabled={!selectable}
                      title={
                        selectable
                          ? undefined
                          : requiredPosition === null
                            ? "Transfer a player out first to bring someone in"
                            : `Can't replace a ${requiredPosition} with a ${player.position} — same-position swaps only`
                      }
                      className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        selectable
                          ? "cursor-pointer hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"
                          : "cursor-not-allowed opacity-40"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-9 shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                          {player.position}
                        </span>
                        <span className="truncate font-medium text-black dark:text-zinc-50">
                          {player.webName}
                        </span>
                        <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
                          {player.club}
                        </span>
                        {isReincluded ? (
                          <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                            Transferred out
                          </span>
                        ) : (
                          STATUS_LABELS[player.status] && (
                            <span className="shrink-0 text-xs text-red-600 dark:text-red-400">
                              {STATUS_LABELS[player.status]}
                            </span>
                          )
                        )}
                      </span>
                      <span className="shrink-0 text-zinc-600 dark:text-zinc-300">
                        {formatPrice(player.currentPrice)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {loadingMore && (
              <p className="py-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
                Loading more…
              </p>
            )}
          </>
        )}
      </div>

      {viewingPlayer && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setViewingPlayer(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${viewingPlayer.webName}'s profile`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-black/[.08] bg-white p-6 shadow-xl dark:border-white/[.145] dark:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {viewingPlayer.clubCode !== null && (
                  <Image
                    src={shirtUrl(viewingPlayer.clubCode, viewingPlayer.position)}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 object-contain"
                  />
                )}
                <div>
                  <p className="text-base font-semibold text-black dark:text-zinc-50">
                    {viewingPlayer.webName}
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {viewingPlayer.position} · {viewingPlayer.club}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingPlayer(null)}
                aria-label="Close"
                className="shrink-0 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex items-center gap-4 border-t border-black/[.08] pt-4 text-sm dark:border-white/[.145]">
              <div>
                <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                  Price
                </p>
                <p className="font-semibold text-black dark:text-zinc-50">
                  {formatPrice(viewingPlayer.currentPrice)}
                </p>
              </div>
              {STATUS_LABELS[viewingPlayer.status] && (
                <div>
                  <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                    Status
                  </p>
                  <p className="font-semibold text-red-600 dark:text-red-400">
                    {STATUS_LABELS[viewingPlayer.status]}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
