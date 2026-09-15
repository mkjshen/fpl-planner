"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { PlayerListItem, PlayerSearchResult, PlayerSortBy, Position } from "@/lib/api";
import { formatPrice, shirtUrl } from "@/components/pitch";
import { PlayerProfileModal, type ProfileAction } from "@/components/player-profile-modal";

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

// Echoes a result row's shape (icon + shirt + name/position/club + price)
// instead of plain "Loading…" text — used both for the initial fetch and
// for the infinite-scroll "next page" fetch.
function PlayerRowSkeletons({ count, className = "" }: { count: number; className?: string }) {
  return (
    <div className={`flex animate-pulse flex-col gap-1 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-1 px-1 py-2.5">
          <div className="h-7 w-7 shrink-0 rounded-full bg-black/[.06] dark:bg-white/[.08]" />
          <div className="h-6 w-6 shrink-0 rounded bg-black/[.06] dark:bg-white/[.08]" />
          <div className="flex flex-1 items-center justify-between gap-2 px-2">
            <div className="flex flex-col gap-1.5">
              <div className="h-3.5 w-24 rounded bg-black/[.06] dark:bg-white/[.08]" />
              <div className="h-3 w-32 rounded bg-black/[.06] dark:bg-white/[.08]" />
            </div>
            <div className="h-3.5 w-10 rounded bg-black/[.06] dark:bg-white/[.08]" />
          </div>
        </div>
      ))}
    </div>
  );
}

const SORT_OPTIONS: { value: PlayerSortBy; label: string }[] = [
  { value: "price", label: "Price" },
  { value: "form", label: "Form" },
  { value: "points", label: "Total points" },
  { value: "points_per_game", label: "Points per game" },
  { value: "ict", label: "ICT Index" },
  { value: "value", label: "Value (pts/£m)" },
  { value: "ownership", label: "Ownership" },
];

// The value a given sort is actually ordering by, formatted for display in
// place of price (see the row's price/sort-value span below) — bare
// numbers, no unit words ("form", "ICT", ...), since the "Sort by" control
// itself already says what's being shown. Also null for a reincluded
// player (see PlayerListItem) — these fields are optional there since that
// path never actually fetches them.
export function sortStatLabel(player: PlayerListItem, sortBy: PlayerSortBy): string | null {
  switch (sortBy) {
    case "form":
      return player.form === undefined ? null : player.form.toFixed(1);
    case "points":
      return player.totalPoints === undefined ? null : String(player.totalPoints);
    case "points_per_game":
      return player.pointsPerGame === undefined ? null : player.pointsPerGame.toFixed(1);
    case "ict":
      return player.ictIndex === undefined ? null : player.ictIndex.toFixed(1);
    case "value":
      return player.valueSeason === undefined ? null : player.valueSeason.toFixed(1);
    case "ownership":
      return player.selectedByPercent === undefined
        ? null
        : `${player.selectedByPercent.toFixed(1)}%`;
    case "price":
      return null;
  }
}

export type SearchAction = (
  userId: string,
  gameweekNumber: number,
  options: { positions?: Position[]; search?: string; sortBy?: PlayerSortBy; offset?: number },
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
  profileAction,
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
  profileAction: ProfileAction;
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
  const [sortBy, setSortBy] = useState<PlayerSortBy>("price");
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // The id of the player whose profile modal is open, if any — just the id
  // (not the row's PlayerListItem) since the modal fetches its own fuller
  // profile rather than reusing the row's already-thin search data.
  const [viewingPlayerId, setViewingPlayerId] = useState<number | null>(null);

  const positionsFilter = selectedPositions.size > 0 ? [...selectedPositions] : undefined;

  function togglePosition(pos: Position) {
    setSelectedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  }

  // Query text, the position filter, or the sort changing all start over
  // from the first page — the debounce is really only needed for typing,
  // but reusing it for the others too keeps this to one code path.
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchAction(userId, gameweekNumber, {
        positions: positionsFilter,
        search: query || undefined,
        sortBy,
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
  }, [query, selectedPositions, sortBy, userId, gameweekNumber, searchAction]);

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
        positions: selectedPositions.size > 0 ? [...selectedPositions] : undefined,
        search: query || undefined,
        sortBy,
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
    // query/selectedPositions/sortBy/userId/gameweekNumber/searchAction all
    // feed maybeLoadMore's closure (via positionsFilter and the searchAction
    // call) but weren't listed here before — the listener could survive a
    // filter or query change still bound to the stale params (the debounced
    // search effect doesn't touch loading/players.length/total until its
    // 300ms timeout fires), fetching the next page for whatever was
    // searched previously instead of the new filter, up until the debounce
    // caught up and overwrote it anyway.
  }, [players.length, total, loading, loadingMore, query, selectedPositions, sortBy, userId, gameweekNumber, searchAction]);

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
        className="focus-ring rounded-md border border-border px-3 py-2 text-sm transition-colors focus:border-primary dark:bg-black dark:focus:border-accent"
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
              className={`focus-ring rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-primary bg-primary/10 text-primary dark:border-accent dark:bg-accent/10 dark:text-accent"
                  : "border-border text-zinc-500 hover:border-black/20 dark:text-zinc-400 dark:hover:border-white/30"
              }`}
            >
              {pos}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label htmlFor="player-sort" className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
          Sort by
        </label>
        <select
          id="player-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as PlayerSortBy)}
          className="focus-ring min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-black focus:border-primary dark:text-zinc-50 dark:focus:border-accent"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="text-black">
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div ref={scrollRef} className="mt-3 flex-1 overflow-y-auto">
        {loading ? (
          <PlayerRowSkeletons count={6} />
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
                      onClick={() => setViewingPlayerId(player.playerId)}
                      aria-label={`View ${player.webName}'s profile`}
                      title="View player profile"
                      className="focus-ring shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-black/[.04] hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-white/[.08] dark:hover:text-zinc-300"
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
                    {player.clubCode !== null && (
                      <Image
                        src={shirtUrl(player.clubCode, player.position)}
                        alt=""
                        width={24}
                        height={24}
                        className="h-6 w-6 shrink-0 object-contain"
                      />
                    )}
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
                      className={`focus-ring flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                        selectable
                          ? "cursor-pointer hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"
                          : "cursor-not-allowed opacity-40"
                      }`}
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-medium text-black dark:text-zinc-50">
                          {player.webName}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                          <span className="shrink-0">{player.position}</span>
                          <span className="truncate">{player.club}</span>
                          {isReincluded ? (
                            <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
                              Transferred out
                            </span>
                          ) : (
                            STATUS_LABELS[player.status] && (
                              <span className="shrink-0 text-red-600 dark:text-red-400">
                                {STATUS_LABELS[player.status]}
                              </span>
                            )
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-zinc-600 dark:text-zinc-300">
                        {sortStatLabel(player, sortBy) ?? formatPrice(player.currentPrice)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {loadingMore && <PlayerRowSkeletons count={2} className="mt-1" />}
          </>
        )}
      </div>

      {viewingPlayerId !== null && (
        <PlayerProfileModal
          key={viewingPlayerId}
          playerId={viewingPlayerId}
          profileAction={profileAction}
          onClose={() => setViewingPlayerId(null)}
        />
      )}
    </div>
  );
}
