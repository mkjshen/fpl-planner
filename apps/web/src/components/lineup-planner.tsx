"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type {
  Chip,
  ChipWindowStatus,
  GameweekProjection,
  Lineup,
  LineupPlayerInput,
  PlayerListItem,
  PriceDirection,
  SquadPlayer,
  SuggestedTransfer,
  Suggestions,
  TransferCombination,
} from "@/lib/api";
import { formatPrice, Pitch, PlayerCard, shirtUrl, StatList } from "@/components/pitch";
import { PlayerSearchResults, type SearchAction } from "@/components/player-search";
import { PlayerProfileModal, type ProfileAction } from "@/components/player-profile-modal";
import { Banner } from "@/components/feedback";
import { Dialog } from "@/components/dialog";
import { RovingGroup } from "@/components/roving-group";
import { difficultyClass } from "@/lib/fdr";
import { setNavigationGuard } from "@/lib/navigation-guard";

// Tailwind's `md` breakpoint. Read in JS for the transfer picker, which is
// a sidebar from md up and a dialog below — the dialog has to be genuinely
// unmounted on desktop rather than just CSS-hidden, or its focus trap and
// scroll lock would still be live behind the sidebar.
const MD_QUERY = "(min-width: 768px)";

function subscribeToMd(onChange: () => void) {
  const media = window.matchMedia(MD_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useIsMdUp(): boolean {
  return useSyncExternalStore(
    subscribeToMd,
    () => window.matchMedia(MD_QUERY).matches,
    () => false,
  );
}

type SaveResult = { ok: true; lineup: Lineup } | { ok: false; message: string };

// Mirrors the backend's TRANSFER_FREE_CHIPS (apps/api/app/services/lineup.py)
// — Wildcard and Free Hit waive the -4 hit and the same-position-swap
// restriction for this gameweek; Bench Boost and Triple Captain don't touch
// transfers, only scoring, which this app doesn't simulate.
// Points a transfer beyond the free allowance costs (FPL's -4 hit).
const HIT_COST = 4;

const TRANSFER_FREE_CHIPS: ReadonlySet<Chip> = new Set(["wildcard", "free_hit"]);

const CHIP_LABELS: Record<Chip, string> = {
  wildcard: "Wildcard",
  free_hit: "Free Hit",
  bench_boost: "Bench Boost",
  triple_captain: "Triple Captain",
};

const ALL_CHIPS: Chip[] = ["wildcard", "free_hit", "bench_boost", "triple_captain"];

export function validationError(players: SquadPlayer[]): string | null {
  const totals = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) totals[p.position]++;
  if (totals.GK !== 2 || totals.DEF !== 5 || totals.MID !== 5 || totals.FWD !== 3) {
    return "Squad must have 2 goalkeepers, 5 defenders, 5 midfielders, and 3 forwards";
  }

  const starting = players.filter((p) => p.isStarting);
  if (starting.length !== 11) return "Starting lineup must have exactly 11 players";

  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of starting) counts[p.position]++;
  if (counts.GK !== 1) return "Starting lineup must have exactly 1 goalkeeper";
  if (counts.DEF < 3 || counts.DEF > 5) return "Starting lineup must have 3-5 defenders";
  if (counts.MID < 2 || counts.MID > 5) return "Starting lineup must have 2-5 midfielders";
  if (counts.FWD < 1 || counts.FWD > 3) return "Starting lineup must have 1-3 forwards";

  const captain = players.find((p) => p.isCaptain);
  const viceCaptain = players.find((p) => p.isViceCaptain);
  if (!captain) return "Pick a captain";
  if (!viceCaptain) return "Pick a vice-captain";
  if (captain.playerId === viceCaptain.playerId) return "Captain and vice-captain must differ";
  if (!captain.isStarting) return "Captain must be in the starting lineup";
  if (!viceCaptain.isStarting) return "Vice-captain must be in the starting lineup";

  return null;
}

export function canSwap(players: SquadPlayer[], aId: number, bId: number): boolean {
  const a = players.find((p) => p.playerId === aId);
  const b = players.find((p) => p.playerId === bId);
  if (!a || !b) return false;

  // Two bench outfield players can always trade places — this only
  // reorders substitute priority, not the starting lineup, so no formation
  // check applies. The bench goalkeeper is excluded: they can only ever
  // stand in for the starting goalkeeper, never take an outfield sub slot.
  if (!a.isStarting && !b.isStarting && a.position !== "GK" && b.position !== "GK") {
    return true;
  }

  // Otherwise a substitution exchanges a starter for a bench player — two
  // players with the same status wouldn't change anything.
  if (a.isStarting === b.isStarting) return false;

  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) {
    const willStart =
      p.playerId === a.playerId ? b.isStarting : p.playerId === b.playerId ? a.isStarting : p.isStarting;
    if (willStart) counts[p.position]++;
  }
  return (
    counts.GK === 1 &&
    counts.DEF >= 3 &&
    counts.DEF <= 5 &&
    counts.MID >= 2 &&
    counts.MID <= 5 &&
    counts.FWD >= 1 &&
    counts.FWD <= 3
  );
}

// Suggestions are fetched once per mount (see LineupPlanner's suggestions
// effect), so a manual edit made since then can leave one referencing a
// player who's no longer actually in the squad, or who's already been
// bought some other way — filtered against the live squad here rather than
// re-fetched on every edit.
export function filterVisibleSuggestions(
  suggestions: SuggestedTransfer[],
  currentPlayerIds: Set<number>,
): SuggestedTransfer[] {
  return suggestions.filter(
    (s) => currentPlayerIds.has(s.outPlayer.playerId) && !currentPlayerIds.has(s.inPlayer.playerId),
  );
}

// `outPlayerId`'s slot taken over by `inPlayer` — same starting/bench
// place, same armband — bought at today's price. The one definition of "a
// transfer" both a single swap and a whole best-combination apply go
// through.
export function withTransfer(
  players: SquadPlayer[],
  outPlayerId: number,
  inPlayer: PlayerListItem,
): SquadPlayer[] {
  return players.map((p) => {
    if (p.playerId !== outPlayerId) return p;
    return {
      playerId: inPlayer.playerId,
      webName: inPlayer.webName,
      position: inPlayer.position,
      club: inPlayer.club,
      clubCode: inPlayer.clubCode,
      opponent: inPlayer.opponent ?? undefined,
      currentPrice: inPlayer.currentPrice,
      purchasePrice: inPlayer.currentPrice,
      sellingPrice: inPlayer.currentPrice,
      isStarting: p.isStarting,
      squadPosition: p.squadPosition,
      isCaptain: p.isCaptain,
      isViceCaptain: p.isViceCaptain,
    };
  });
}

// One line describing what Save would commit — shown in the sticky action
// bar so the consequence of saving is visible before pressing it.
export function pendingChangesSummary({
  transfersMade,
  awaitingReplacement = 0,
  transferCost,
  bank,
  chipLabel,
}: {
  transfersMade: number;
  // Of those transfers, how many are still an empty slot.
  awaitingReplacement?: number;
  transferCost: number;
  bank: string;
  chipLabel: string | null;
}): string {
  const parts: string[] = [];
  if (transfersMade > 0) parts.push(`${transfersMade} transfer${transfersMade === 1 ? "" : "s"}`);
  if (awaitingReplacement > 0) {
    parts.push(
      awaitingReplacement === 1 ? "1 needs a replacement" : `${awaitingReplacement} need replacements`,
    );
  }
  if (transferCost > 0) parts.push(`−${transferCost} pts`);
  if (chipLabel) parts.push(chipLabel);
  if (parts.length === 0) parts.push("Lineup changes");
  parts.push(`Bank ${bank}`);
  return parts.join(" · ");
}

// A chip's short visible status for this gameweek: "on" while active,
// "available" if its window here is unspent, otherwise when it comes back
// (the next unspent window), or that none is left this season.
export function chipStatus(
  c: Chip,
  activeChip: Chip | null,
  windows: ChipWindowStatus[],
  gameweek: number,
): string {
  if (activeChip === c) return "on";
  const here = windows.find((w) => w.startEvent <= gameweek && gameweek <= w.stopEvent);
  if (here?.status === "available") return "available";
  const next = windows
    .filter((w) => w.startEvent > gameweek && w.status === "available")
    .sort((a, b) => a.startEvent - b.startEvent)[0];
  if (next) return `from GW${next.startEvent}`;
  if (windows.length === 0) return "not this season";
  return "none left";
}

// FPL's auto-substitution order, spoken on each bench card: the bench
// goalkeeper, then outfield substitutes numbered 1-3 in bench order.
export function benchSlotLabel(bench: SquadPlayer[], index: number): string {
  if (bench[index].position === "GK") return "bench goalkeeper";
  const outfieldBefore = bench.slice(0, index).filter((p) => p.position !== "GK").length;
  return `substitute ${outfieldBefore + 1}`;
}

// A suggestion's gain as managers think about it: average points per
// gameweek ("+6.5 pts/GW"), not a five-gameweek total.
export function perGameweek(points: number): string {
  const sign = points < 0 ? "−" : "+";
  return `${sign}${Math.abs(points).toFixed(1)} pts/GW`;
}

// The collapsed suggestions panel's one line: the headline recommendation,
// so the panel can stay closed without hiding what it would say.
export function suggestionsSummary({
  loading,
  failed,
  applied,
  combination,
  singleCount,
  horizonRange,
}: {
  loading: boolean;
  failed: boolean;
  applied: boolean;
  combination: TransferCombination | null;
  singleCount: number;
  horizonRange: string | null;
}): string {
  if (loading) return "Finding suggestions for this squad…";
  if (failed) return "Couldn't load suggestions.";
  if (applied) return "Best plan applied. Review it on the pitch, then save.";
  const over = horizonRange ? ` over ${horizonRange}` : "";
  if (combination) {
    const hits = combination.hits > 0 ? `, counting −${combination.hits * HIT_COST} in hits` : "";
    return `Best plan: ${combination.transfers.length} transfers, ${perGameweek(combination.netProjectedGainPerGameweek)}${over}${hits}.`;
  }
  if (singleCount > 0) return `${singleCount} single transfer${singleCount === 1 ? "" : "s"} worth a look${over}.`;
  return "No standout swaps for this squad right now.";
}

// The combination only makes sense as a whole, applied to the squad it was
// computed for: hidden once any transfer has been made or started (its
// budget and hit count assume none have), under Wildcard/Free Hit (it was
// solved with hits and same-position swaps, which those chips lift), when
// it's a single move (the top card already shows that), or if any of its
// players no longer fit the live squad.
export function applicableCombination(
  combination: TransferCombination | null,
  currentPlayerIds: Set<number>,
  hasTransferEdits: boolean,
  chipIsTransferFree: boolean,
): TransferCombination | null {
  if (combination === null || hasTransferEdits || chipIsTransferFree) return null;
  if (combination.transfers.length < 2) return null;
  const stillFits = filterVisibleSuggestions(combination.transfers, currentPlayerIds);
  return stillFits.length === combination.transfers.length ? combination : null;
}

// Whether applying this one suggestion, on top of the transfers already
// made in the planner, would cost a -4 — judged against the live squad
// rather than the backend's `requiresHit`, which assumes the whole list is
// taken in rank order (so a lower-ranked swap read as a hit even when it
// was the only one made). An outgoing player already transferred out but
// not yet replaced is counted in `transfersMade` already, so filling that
// slot isn't an extra transfer.
export function suggestionCostsHit(
  outPlayerAlreadyPending: boolean,
  transfersMade: number,
  freeTransfers: number,
  chipIsTransferFree: boolean,
): boolean {
  if (chipIsTransferFree) return false;
  const transfersAfterApplying = transfersMade + (outPlayerAlreadyPending ? 0 : 1);
  return transfersAfterApplying > freeTransfers;
}

// A realized move only (see the backend's price_direction): "unchanged"
// renders nothing, so a card only gains a marker when there's news.
export function priceChangeMarker(
  direction: PriceDirection,
): { symbol: string; label: string; className: string } | null {
  if (direction === "risen") {
    return { symbol: "▲", label: "Price rose today", className: "text-emerald-700 dark:text-emerald-400" };
  }
  if (direction === "fallen") {
    return { symbol: "▼", label: "Price fell today", className: "text-red-600 dark:text-red-400" };
  }
  return null;
}

function PriceChangeMarker({ direction }: { direction: PriceDirection }) {
  const marker = priceChangeMarker(direction);
  if (marker === null) return null;
  return (
    <span title={marker.label} className={`shrink-0 text-xs ${marker.className}`}>
      <span aria-hidden="true">{marker.symbol}</span>
      <span className="sr-only">{marker.label}</span>
    </span>
  );
}

// Re-exported so the planner's tests (and anything already importing it
// from here) keep working; the definition lives in lib/fdr.ts.
export { difficultyClass };

function describeFixtures(difficulties: number[]): string {
  if (difficulties.length === 0) return "no fixture";
  return difficulties.map((d) => `difficulty ${d}`).join(" + ");
}

// The tooltip / screen-reader text for one gameweek of the strip — spells
// out both sides so the numbers behind the headline gain are visible.
export function gameweekProjectionLabel(p: GameweekProjection): string {
  return (
    `GW${p.gameweekNumber}: in ${describeFixtures(p.inDifficulties)}, ${p.inProjectedPoints.toFixed(1)} pts` +
    ` · out ${describeFixtures(p.outDifficulties)}, ${p.outProjectedPoints.toFixed(1)} pts`
  );
}

// One sentence for screen readers in place of the strip — five
// per-gameweek cell descriptions per card, across a whole strip of cards,
// was far too much to listen through.
export function fixtureStripSummary(playerName: string, projections: GameweekProjection[]): string {
  const gameweeks = projections.map((p) => {
    const fixtures = p.inDifficulties.length === 0 ? "no fixture" : p.inDifficulties.join(" and ");
    return `gameweek ${p.gameweekNumber} ${fixtures}`;
  });
  return `${playerName}'s fixture difficulty, 1 easiest to 5 hardest: ${gameweeks.join(", ")}.`;
}

// The incoming player's upcoming fixtures, one cell per gameweek with the
// FDR rating printed in it: split in two on a double, a dashed outline on
// a blank. The gameweek range underneath anchors which weeks these are.
function FixtureStrip({
  playerName,
  projections,
}: {
  playerName: string;
  projections: GameweekProjection[];
}) {
  if (projections.length === 0) return null;
  const first = projections[0].gameweekNumber;
  const last = projections[projections.length - 1].gameweekNumber;
  return (
    <div className="flex w-full flex-col items-center gap-0.5">
      <p className="sr-only">{fixtureStripSummary(playerName, projections)}</p>
      <div aria-hidden="true" className="flex w-full gap-0.5">
        {projections.map((p) => (
          <div
            key={p.gameweekNumber}
            title={gameweekProjectionLabel(p)}
            className="flex h-5 flex-1 gap-px overflow-hidden rounded-sm text-xs leading-5 font-semibold tabular-nums"
          >
            {p.inDifficulties.length === 0 ? (
              <span className="flex-1 rounded-sm border border-dashed border-zinc-400 text-zinc-500 dark:border-zinc-500 dark:text-zinc-400">
                –
              </span>
            ) : (
              p.inDifficulties.map((d, i) => (
                <span key={i} className={`flex-1 ${difficultyClass(d)}`}>
                  {d}
                </span>
              ))
            )}
          </div>
        ))}
      </div>
      <span aria-hidden="true" className="text-xs text-zinc-500 dark:text-zinc-400">
        GW{first}–{last}
      </span>
    </div>
  );
}

// The key to the suggestion cards' two symbol systems — price markers and
// FPL's fixture-difficulty colours — which a manager reads at a glance but
// a newcomer (or a reviewer) otherwise has to guess at.
function SuggestionsLegend() {
  return (
    <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
      <div className="flex items-center gap-1.5">
        <dt className="flex gap-0.5">
          <span aria-hidden="true" className="text-emerald-700 dark:text-emerald-400">▲</span>
          <span aria-hidden="true" className="text-red-600 dark:text-red-400">▼</span>
          <span className="sr-only">Up and down arrows</span>
        </dt>
        <dd>price rose / fell today</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <dt className="flex gap-0.5">
          <span className="sr-only">Coloured numbers 1 to 5</span>
          {[1, 2, 3, 4, 5].map((d) => (
            <span
              key={d}
              aria-hidden="true"
              className={`w-4 rounded-sm text-center leading-4 font-semibold tabular-nums ${difficultyClass(d)}`}
            >
              {d}
            </span>
          ))}
        </dt>
        <dd>fixture difficulty, 1 easiest to 5 hardest</dd>
      </div>
    </dl>
  );
}

export function LineupPlanner({
  userId,
  lineup,
  selectedGameweek,
  gameweekOptions,
  saveAction,
  resetAllAction,
  searchAction,
  profileAction,
  suggestionsAction,
}: {
  userId: string;
  lineup: Lineup;
  selectedGameweek: number;
  gameweekOptions: { number: number; label: string }[];
  saveAction: (
    userId: string,
    gameweekNumber: number,
    players: LineupPlayerInput[],
    chip: Chip | null,
  ) => Promise<SaveResult>;
  resetAllAction: (userId: string, gameweekNumber: number) => Promise<Lineup>;
  searchAction: SearchAction;
  profileAction: ProfileAction;
  suggestionsAction: (
    userId: string,
    gameweekNumber: number,
  ) => Promise<Suggestions | null>;
}) {
  const router = useRouter();
  const isMdUp = useIsMdUp();
  const [players, setPlayers] = useState(lineup.players);
  // The last state confirmed by the server — what "Reset" reverts to and
  // what "dirty" is measured against, since `lineup` (the prop) stays frozen
  // at whatever the page originally fetched even after a Save or reset-all
  // updates things via a direct server response rather than a remount.
  const [savedPlayers, setSavedPlayers] = useState(lineup.players);
  const [savedBank, setSavedBank] = useState(lineup.bank);
  const [savedTeamValue, setSavedTeamValue] = useState(lineup.teamValue);
  const [freeTransfers, setFreeTransfers] = useState(lineup.freeTransfers);
  // The chip proposed for this gameweek — like `players`, this is working
  // state that only takes effect on Save; `savedChip` (what Reset reverts
  // to and `dirty` compares against) mirrors `savedPlayers`'s role.
  const [chip, setChip] = useState<Chip | null>(lineup.chipUsed);
  const [savedChip, setSavedChip] = useState<Chip | null>(lineup.chipUsed);
  const [chipWindows, setChipWindows] = useState(lineup.chipWindows);
  const [laterPlansAffected, setLaterPlansAffected] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // The player whose profile modal is open, if any — clicking a squad
  // player opens their profile (same as the info icon in player search)
  // rather than immediately entering "pick a swap target" mode; that mode
  // is now only entered via the modal's own Substitute button.
  const [viewingPlayerId, setViewingPlayerId] = useState<number | null>(null);
  // Every player currently transferred out but not yet replaced — several
  // can be pending at once. `activeTransferOutId` is whichever one the
  // transfer-in panel is showing right now (always one of `transferOutIds`
  // while it's non-empty).
  const [transferOutIds, setTransferOutIds] = useState<number[]>([]);
  const [activeTransferOutId, setActiveTransferOutId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [confirmingResetAll, setConfirmingResetAll] = useState(false);
  // A navigation held back because the plan has unsaved changes — run if
  // the user chooses to save or discard, dropped if they choose to stay.
  // Wrapped in an object so React doesn't call the function as an updater.
  const [pendingNavigation, setPendingNavigation] = useState<{ go: () => void } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error" | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedTransfer[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [horizonGameweeks, setHorizonGameweeks] = useState<number | null>(null);
  const [bestCombination, setBestCombination] = useState<TransferCombination | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  // The squad either side of the last "Apply all", for a one-step Undo.
  // Undo is only offered while the squad is still exactly `after` — once
  // anything else changes, undoing would silently discard that too.
  const [appliedCombination, setAppliedCombination] = useState<{
    before: SquadPlayer[];
    after: SquadPlayer[];
    combination: TransferCombination;
  } | null>(null);

  // One fetch per mount (this component remounts per gameweek via the
  // parent's `key={selectedGameweek}`, same pattern PlayerSearchResults
  // uses) — not tied to `players`/live edits, so a suggestion can go stale
  // relative to in-progress manual transfers; filtered against current
  // squad membership below rather than re-fetched on every edit.
  //
  // `suggestionsAction` is deliberately NOT a dependency, even though it's
  // referenced inside: calling a server action causes Next.js to refresh
  // the route, which re-runs the server-component parent and hands down a
  // *new* reference for every server-action prop (this one included) —
  // depending on it here made the effect re-fire on every refresh it
  // itself triggered, an infinite fetch loop (visible as constant
  // flickering, confirmed via ~40 suggestions requests/sec in the network
  // log before this fix). Only userId/selectedGameweek/isEditable should
  // ever actually trigger a re-fetch.
  useEffect(() => {
    // Skipped without touching loadingSuggestions/etc — the panel that
    // reads them is itself gated on lineup.isEditable and never renders
    // here, so there's nothing for a stuck "loading" value to affect.
    if (!lineup.isEditable) return;
    let cancelled = false;
    suggestionsAction(userId, selectedGameweek)
      .then((result) => {
        if (cancelled) return;
        setSuggestions(result?.suggestions ?? []);
        setHorizonGameweeks(result?.horizonGameweeks ?? null);
        setBestCombination(result?.bestCombination ?? null);
      })
      .catch(() => {
        if (!cancelled) setSuggestionsError("Couldn't load suggested transfers.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedGameweek, lineup.isEditable]);

  const gameweekIndex = gameweekOptions.findIndex((gw) => gw.number === selectedGameweek);
  const previousGameweek = gameweekIndex > 0 ? gameweekOptions[gameweekIndex - 1] : null;
  const nextGameweek =
    gameweekIndex >= 0 && gameweekIndex < gameweekOptions.length - 1
      ? gameweekOptions[gameweekIndex + 1]
      : null;

  const starting = players.filter((p) => p.isStarting);
  const bench = players.filter((p) => !p.isStarting).sort((a, b) => a.squadPosition - b.squadPosition);
  // A player transferred out but not yet replaced is already a change: the
  // bank has moved and the slot is empty, so the bar must say so and
  // Discard must be able to undo it.
  const dirty =
    JSON.stringify(players) !== JSON.stringify(savedPlayers) ||
    chip !== savedChip ||
    transferOutIds.length > 0;
  const error = lineup.isEditable ? validationError(players) : null;
  const chipIsTransferFree = chip !== null && TRANSFER_FREE_CHIPS.has(chip);
  const transferPanelTitle = (target: SquadPlayer | null) =>
    target ? (chipIsTransferFree ? "Transfer in any player" : `Transfer in a ${target.position}`) : "Transfer players";
  const viewingPlayer = players.find((p) => p.playerId === viewingPlayerId) ?? null;
  const transferOutIdSet = new Set(transferOutIds);
  const transferOutPlayer = players.find((p) => p.playerId === activeTransferOutId) ?? null;
  const disabledPlayerIds =
    lineup.isEditable && selectedId !== null
      ? new Set(
          players
            .filter((p) => p.playerId !== selectedId && !canSwap(players, selectedId, p.playerId))
            .map((p) => p.playerId),
        )
      : new Set<number>();

  // Live preview of the transfer cost of the current (possibly unsaved)
  // squad, computed the same way the backend does: a transfer is about
  // squad *membership*, not which numbered slot a player sits in.
  // Comparing who occupies each squadPosition would also flag a pure
  // substitution (starting XI <-> bench, which reassigns squadPosition
  // between two players already on the squad) as if it were a transfer —
  // only players who actually left or joined the 15 should count. Bank
  // moves by each outgoing player's sellingPrice minus each incoming
  // player's currentPrice. Team value is squad current-price value only
  // (bank is cash, not part of it), so it moves by each incoming player's
  // currentPrice minus each outgoing player's currentPrice — buying and
  // selling both affect it, unlike bank where only the sell-price haircut
  // matters. freeTransfers itself never changes from edits within this
  // gameweek — it only depends on earlier gameweeks.
  //
  // Players transferred out but with no replacement picked yet (in
  // `transferOutIds`, blanked on the pitch/bench) are still physically
  // present in `players` — excluded from "effectively in the squad" below
  // so they already count as outgoing before a replacement is chosen, not
  // just after.
  const savedIds = new Set(savedPlayers.map((p) => p.playerId));
  const effectiveCurrentIds = new Set(
    players.filter((p) => !transferOutIdSet.has(p.playerId)).map((p) => p.playerId),
  );
  let spend = 0;
  let proceeds = 0;
  let valueChange = 0;
  let transfersMade = 0;
  const freedPlayerIds = new Set<number>();
  for (const p of players) {
    if (transferOutIdSet.has(p.playerId) || savedIds.has(p.playerId)) continue;
    spend += p.currentPrice;
    valueChange += p.currentPrice;
  }
  for (const sp of savedPlayers) {
    if (effectiveCurrentIds.has(sp.playerId)) continue;
    transfersMade += 1;
    proceeds += sp.sellingPrice;
    valueChange -= sp.currentPrice;
    freedPlayerIds.add(sp.playerId);
  }
  const liveBank = savedBank + proceeds - spend;
  const liveTeamValue = savedTeamValue + valueChange;
  const saveBlockedReason =
    transferOutIds.length > 0
      ? "Pick a replacement for every transferred-out player, or clear them, before saving."
      : liveBank < 0
        ? "Your bank balance is negative — sell a player or pick a cheaper replacement before saving."
        : null;

  // While the plan has unsaved changes, every way out of it asks first:
  // in-app navigation (the gameweek arrows here, plus the header's tabs and
  // sign-out via lib/navigation-guard) opens the unsaved-changes dialog,
  // and closing or reloading the tab gets the browser's own warning. The
  // planner remounts per gameweek, so leaving used to drop the plan
  // silently.
  useEffect(() => {
    if (!dirty) return;
    setNavigationGuard((proceed) => {
      setPendingNavigation({ go: proceed });
      return true;
    });
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      setNavigationGuard(null);
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [dirty]);

  function navigateAway(go: () => void) {
    if (dirty) setPendingNavigation({ go });
    else go();
  }

  async function saveThenLeave() {
    const leave = pendingNavigation;
    if (await handleSave()) {
      setPendingNavigation(null);
      leave?.go();
    } else {
      // The save failed or was refused; stay so the message is seen.
      setPendingNavigation(null);
    }
  }

  function discardThenLeave() {
    const leave = pendingNavigation;
    setPendingNavigation(null);
    // Unregister first so the navigation itself isn't intercepted again.
    setNavigationGuard(null);
    leave?.go();
  }
  const liveTransferCost = chipIsTransferFree
    ? 0
    : Math.max(transfersMade - freeTransfers, 0) * HIT_COST;

  // What Save would commit, in one line — shown in the sticky action bar
  // and in the unsaved-changes dialog.
  const pendingSummary = pendingChangesSummary({
    transfersMade,
    awaitingReplacement: transferOutIds.length,
    transferCost: liveTransferCost,
    bank: formatPrice(liveBank),
    chipLabel:
      chip === savedChip
        ? null
        : chip
          ? `${CHIP_LABELS[chip]} on`
          : savedChip && `${CHIP_LABELS[savedChip]} off`,
  });

  // Players transferred out earlier in this same unsaved session — the
  // search pool only knows about the last *saved* squad, so without this
  // it keeps excluding them as "owned" even after they've been freed up
  // again in the plan being built right now.
  const freedPlayers: PlayerListItem[] = savedPlayers
    .filter((p) => freedPlayerIds.has(p.playerId))
    .map((p) => ({
      playerId: p.playerId,
      webName: p.webName,
      position: p.position,
      club: p.club,
      clubCode: p.clubCode,
      currentPrice: p.currentPrice,
      status: "a",
    }));

  const currentPlayerIds = new Set(players.map((p) => p.playerId));
  const visibleSuggestions = filterVisibleSuggestions(suggestions, currentPlayerIds);
  // "GW6–10": the window projectedGain covers, so every number in the
  // suggestions panel carries its unit and horizon right beside it.
  const horizonRange =
    horizonGameweeks === null
      ? null
      : // U+2060 (word joiner) after the en dash: browsers may break a line
        // after a dash, which split "GW6–10" across lines on phones.
        `GW${selectedGameweek}–⁠${selectedGameweek + horizonGameweeks - 1}`;
  const canUndoCombination = appliedCombination !== null && players === appliedCombination.after;
  const combination = applicableCombination(
    bestCombination,
    currentPlayerIds,
    transfersMade > 0 || transferOutIds.length > 0,
    chipIsTransferFree,
  );

  function handlePlayerClick(player: SquadPlayer) {
    if (!lineup.isEditable) return;
    // No substitution pending — clicking a player views their profile
    // instead of starting one. A substitution only starts via the
    // profile modal's own Substitute button (handleSubstituteFromModal),
    // which is what sets selectedId in the first place.
    if (selectedId === null) {
      setViewingPlayerId(player.playerId);
      return;
    }
    if (selectedId === player.playerId) {
      setSelectedId(null);
      return;
    }
    setPlayers((prev) => {
      const a = prev.find((p) => p.playerId === selectedId);
      const b = prev.find((p) => p.playerId === player.playerId);
      if (!a || !b) return prev;
      // The incoming player takes over the outgoing player's slot entirely,
      // captaincy included — subbing off the captain or vice-captain hands
      // that role to whoever replaces them, rather than leaving it stuck on
      // a benched player.
      return prev.map((p) => {
        if (p.playerId === a.playerId) {
          return {
            ...p,
            isStarting: b.isStarting,
            squadPosition: b.squadPosition,
            isCaptain: b.isCaptain,
            isViceCaptain: b.isViceCaptain,
          };
        }
        if (p.playerId === b.playerId) {
          return {
            ...p,
            isStarting: a.isStarting,
            squadPosition: a.squadPosition,
            isCaptain: a.isCaptain,
            isViceCaptain: a.isViceCaptain,
          };
        }
        return p;
      });
    });
    setSelectedId(null);
    setMessage(null);
    setMessageTone(null);
  }

  function handleTransfer(outPlayerId: number, inPlayer: PlayerListItem) {
    setPlayers((prev) => withTransfer(prev, outPlayerId, inPlayer));
    // If other transfers are still pending, hand the panel to the next one
    // rather than leaving it empty while blank slots are still sitting there.
    const remaining = transferOutIds.filter((id) => id !== outPlayerId);
    setTransferOutIds(remaining);
    setActiveTransferOutId((current) => (current === outPlayerId ? (remaining[0] ?? null) : current));
    setSelectedId(null);
    setMessage(null);
    setMessageTone(null);
  }

  // Applies a suggested swap exactly like picking the same replacement
  // manually would (handleTransfer doesn't care how outPlayerId/inPlayer
  // were chosen) — no separate execution path for suggestions vs. manual
  // transfers.
  function applySuggestion(suggestion: SuggestedTransfer) {
    handleTransfer(suggestion.outPlayer.playerId, suggestion.inPlayer);
  }

  // All pairs in one state update, so the whole set can be undone as one
  // step. Bank and the club limit are only checked on Save, against the
  // final squad, so the order pairs are applied in doesn't matter. Only
  // offered with no transfers pending (see applicableCombination), so
  // there's no transfer-out state to reconcile here.
  function applyCombination(toApply: TransferCombination) {
    const after = toApply.transfers.reduce(
      (squad, t) => withTransfer(squad, t.outPlayer.playerId, t.inPlayer),
      players,
    );
    setPlayers(after);
    setAppliedCombination({ before: players, after, combination: toApply });
    setSelectedId(null);
    setMessage(null);
    setMessageTone(null);
  }

  function undoCombination() {
    if (!appliedCombination) return;
    setPlayers(appliedCombination.before);
    setAppliedCombination(null);
  }

  function handleTransferOutClick(playerId: number) {
    setTransferOutIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
    setActiveTransferOutId(playerId);
    setSelectedId(null);
    setMessage(null);
    setMessageTone(null);
  }

  // Switch the transfer-in panel to an already-pending removal, e.g.
  // clicking a blank slot that isn't the one currently being searched for.
  function handleActivateTransferOut(playerId: number) {
    setActiveTransferOutId(playerId);
    setSelectedId(null);
  }

  // Cancels only the pending removal the panel is currently showing — the
  // others stay blanked. Hands the panel to another pending one, if any.
  function handleClearActiveTransferOut() {
    if (activeTransferOutId === null) return;
    const remaining = transferOutIds.filter((id) => id !== activeTransferOutId);
    setTransferOutIds(remaining);
    setActiveTransferOutId(remaining[0] ?? null);
  }

  // Both toggle (checking an already-assigned player clears the role
  // entirely, rather than being a no-op — validationError already surfaces
  // "Pick a captain"/"Pick a vice-captain" for that transient state) and
  // enforce that a player can't hold both roles at once: assigning one
  // strips the other from that same player, so the two checkboxes in the
  // profile modal can never both end up checked for the same player.
  function setCaptain(playerId: number) {
    setPlayers((prev) => {
      const makingCaptain = !prev.find((p) => p.playerId === playerId)?.isCaptain;
      return prev.map((p) =>
        p.playerId === playerId
          ? { ...p, isCaptain: makingCaptain, isViceCaptain: makingCaptain ? false : p.isViceCaptain }
          : p.isCaptain
            ? { ...p, isCaptain: false }
            : p,
      );
    });
  }

  function setViceCaptain(playerId: number) {
    setPlayers((prev) => {
      const makingViceCaptain = !prev.find((p) => p.playerId === playerId)?.isViceCaptain;
      return prev.map((p) =>
        p.playerId === playerId
          ? { ...p, isViceCaptain: makingViceCaptain, isCaptain: makingViceCaptain ? false : p.isCaptain }
          : p.isViceCaptain
            ? { ...p, isViceCaptain: false }
            : p,
      );
    });
  }

  // Sell/Substitute in the profile modal — same underlying actions the
  // card's own × button and click-to-select used to trigger directly, just
  // reached from the modal now. Substitute reproduces exactly what used to
  // happen on a bare first click: select this player and close the modal,
  // leaving the pitch/bench waiting for whichever card gets clicked next to
  // complete the swap (handlePlayerClick's second branch, unchanged).
  function handleSellFromModal(playerId: number) {
    handleTransferOutClick(playerId);
    setViewingPlayerId(null);
  }

  function handleSubstituteFromModal(playerId: number) {
    setSelectedId(playerId);
    setViewingPlayerId(null);
  }

  function handleReset() {
    setPlayers(savedPlayers);
    setChip(savedChip);
    setSelectedId(null);
    setTransferOutIds([]);
    setActiveTransferOutId(null);
    setMessage(null);
    setMessageTone(null);
  }

  async function handleConfirmResetAll() {
    setResettingAll(true);
    const fresh = await resetAllAction(userId, selectedGameweek);
    setPlayers(fresh.players);
    setSavedPlayers(fresh.players);
    setSavedBank(fresh.bank);
    setSavedTeamValue(fresh.teamValue);
    setFreeTransfers(fresh.freeTransfers);
    setChip(fresh.chipUsed);
    setSavedChip(fresh.chipUsed);
    setChipWindows(fresh.chipWindows);
    setLaterPlansAffected(false);
    setResettingAll(false);
    setConfirmingResetAll(false);
    setSelectedId(null);
    setTransferOutIds([]);
    setActiveTransferOutId(null);
    setMessage(null);
    setMessageTone(null);
    router.refresh();
  }

  // Resolves true once the plan is saved, so "Save and continue" knows it's
  // safe to leave.
  async function handleSave(): Promise<boolean> {
    if (error) {
      setMessage(error);
      setMessageTone("error");
      return false;
    }
    if (saveBlockedReason) {
      setMessage(saveBlockedReason);
      setMessageTone("error");
      return false;
    }
    setSaving(true);
    setMessage(null);
    setMessageTone(null);
    const inputs: LineupPlayerInput[] = players.map((p) => ({
      playerId: p.playerId,
      isStarting: p.isStarting,
      squadPosition: p.squadPosition,
      isCaptain: p.isCaptain,
      isViceCaptain: p.isViceCaptain,
    }));
    const result = await saveAction(userId, selectedGameweek, inputs, chip);
    setSaving(false);
    if (result.ok) {
      setPlayers(result.lineup.players);
      setSavedPlayers(result.lineup.players);
      setSavedBank(result.lineup.bank);
      setSavedTeamValue(result.lineup.teamValue);
      setFreeTransfers(result.lineup.freeTransfers);
      setChip(result.lineup.chipUsed);
      setSavedChip(result.lineup.chipUsed);
      setChipWindows(result.lineup.chipWindows);
      setLaterPlansAffected(result.lineup.laterPlansAffected);
      setMessage("Saved.");
      setMessageTone("success");
      return true;
    }
    setMessage(result.message);
    setMessageTone("error");
    return false;
  }

  function toggleChip(target: Chip) {
    setChip((prev) => (prev === target ? null : target));
    setMessage(null);
    setMessageTone(null);
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      {/* Keyboard users can jump straight to the transfer search instead of
          tabbing through the planner first. Desktop only: below md the
          picker opens as a dialog, so there's no panel to skip to. */}
      {lineup.isEditable && (
        <a
          href="#transfer-panel"
          className="focus-ring sr-only rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:z-50 md:block dark:bg-accent dark:text-accent-foreground max-md:hidden"
        >
          Skip to transfer players
        </a>
      )}
      <div className="min-w-0 flex-1">
        <div className="border-b border-border pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
                {lineup.teamName}
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{lineup.managerName}</p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-border bg-black/[.02] p-1 dark:bg-white/[.03]">
              <button
                type="button"
                onClick={() =>
                  previousGameweek &&
                  navigateAway(() => router.push(`/dashboard/planner?gameweek=${previousGameweek.number}`))
                }
                disabled={!previousGameweek}
                aria-label="Previous gameweek"
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-black/[.06] disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/[.08] dark:disabled:hover:bg-transparent"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12.5 15l-5-5 5-5" />
                </svg>
              </button>
              <span className="min-w-[7rem] text-center text-sm font-medium text-black dark:text-zinc-50">
                {gameweekOptions[gameweekIndex]?.label ?? `Gameweek ${selectedGameweek}`}
              </span>
              <button
                type="button"
                onClick={() =>
                  nextGameweek &&
                  navigateAway(() => router.push(`/dashboard/planner?gameweek=${nextGameweek.number}`))
                }
                disabled={!nextGameweek}
                aria-label="Next gameweek"
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-black/[.06] disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/[.08] dark:disabled:hover:bg-transparent"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M7.5 5l5 5-5 5" />
                </svg>
              </button>
            </div>
          </div>

          <StatList
            className="mt-3"
            items={[
              { label: "Bank", value: formatPrice(liveBank), negative: liveBank < 0 },
              { label: "Value", value: formatPrice(liveTeamValue) },
              ...(lineup.isEditable
                ? [
                    {
                      label: "Free transfers",
                      value: String(freeTransfers),
                      hint: "available entering this gameweek, from your real FPL transfer history and chips",
                    },
                    ...(liveTransferCost > 0
                      ? [{ label: "Cost", value: `−${liveTransferCost} pts`, negative: true }]
                      : []),
                  ]
                : []),
            ]}
          />

          {lineup.isEditable && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ALL_CHIPS.map((c) => {
                const active = chip === c;
                const windows = chipWindows[c] ?? [];
                // The window covering the gameweek being planned right now —
                // real FPL splits each chip into first-half/second-half
                // windows that don't share uses, so whether this chip can be
                // picked here depends on *which* window this gameweek falls
                // in, not a season-wide total.
                const windowHere = windows.find(
                  (w) => w.startEvent <= selectedGameweek && selectedGameweek <= w.stopEvent,
                );
                const selectable = active || windowHere?.status === "available";
                const title =
                  windowHere === undefined
                    ? windows.length === 0
                      ? "Not offered this season"
                      : `${CHIP_LABELS[c]} isn't usable in gameweek ${selectedGameweek} this season`
                    : active
                      ? `Click to remove ${CHIP_LABELS[c]} from this gameweek`
                      : windowHere.status === "available"
                        ? `Usable for gameweeks ${windowHere.startEvent}-${windowHere.stopEvent}`
                        : `No ${CHIP_LABELS[c]} uses left for gameweeks ${windowHere.startEvent}-${windowHere.stopEvent}`;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => selectable && toggleChip(c)}
                    // aria-disabled, not disabled: an unavailable chip stays
                    // in the Tab order so its status can still be reached.
                    aria-disabled={!selectable || undefined}
                    title={title}
                    aria-pressed={active}
                    className={`focus-ring flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary dark:border-accent dark:bg-accent/10 dark:text-accent"
                        : selectable
                          ? "border-border text-zinc-500 hover:border-black/20 dark:text-zinc-400 dark:hover:border-white/30"
                          : // Unavailable, but its status ("from GW20") is real
                            // information, so it stays readable: a dashed
                            // border says "not now" instead of faded text.
                            "cursor-not-allowed border-dashed border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {CHIP_LABELS[c]}
                    {/* Status as visible text (it used to be a row of dots
                        whose meaning only a tooltip explained). */}
                    <span aria-hidden="true" className="font-normal opacity-80">
                      · {chipStatus(c, chip, windows, selectedGameweek)}
                    </span>
                    {/* The full explanation, for screen readers — read even
                        while the chip is disabled. */}
                    <span className="sr-only">
                      : {title}.
                      {windows.length > 0 &&
                        ` ${windows.map((w) => `Gameweeks ${w.startEvent}-${w.stopEvent} ${w.status}`).join(", ")}.`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {chip && (
          <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-center text-sm text-primary dark:border-accent/30 dark:bg-accent/5 dark:text-accent">
            {chip === "wildcard" &&
              "Wildcard active — transfers are unlimited and free this gameweek, and this squad carries forward as normal."}
            {chip === "free_hit" &&
              "Free Hit active — transfers are unlimited and free this gameweek, but your squad reverts back automatically next gameweek."}
            {chip === "bench_boost" &&
              "Bench Boost active — your bench's points will count this gameweek too (scoring isn't simulated here, this is just a record of the choice)."}
            {chip === "triple_captain" &&
              "Triple Captain active — your captain's points will be tripled instead of doubled this gameweek (scoring isn't simulated here, this is just a record of the choice)."}
          </div>
        )}

        {laterPlansAffected && (
          <Banner tone="info" onDismiss={() => setLaterPlansAffected(false)} className="mt-3">
            Editing gameweek {selectedGameweek} may make your later planned gameweeks
            inconsistent — review them, or use &ldquo;Reset all gameweeks&rsquo; plans&rdquo; at the
            bottom of the page.
          </Banner>
        )}

        {pendingNavigation && (
          <Dialog
            role="alertdialog"
            labelledBy="unsaved-title"
            onClose={() => setPendingNavigation(null)}
            canClose={!saving}
            className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-xl dark:bg-zinc-950"
          >
            <h2 id="unsaved-title" className="text-lg font-semibold text-black dark:text-zinc-50">
              Save your Gameweek {selectedGameweek} plan?
            </h2>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              {pendingSummary}. Leaving without saving discards these changes.
            </p>
            {saveBlockedReason && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Can&apos;t save yet: {saveBlockedReason.charAt(0).toLowerCase() + saveBlockedReason.slice(1)}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={saveThenLeave}
                disabled={saving || saveBlockedReason !== null}
                className="focus-ring rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600 dark:bg-accent dark:text-accent-foreground dark:hover:bg-accent/90 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
              >
                {saving ? "Saving…" : "Save and continue"}
              </button>
              <button
                type="button"
                onClick={discardThenLeave}
                disabled={saving}
                className="focus-ring rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Discard and continue
              </button>
              <button
                type="button"
                data-autofocus
                onClick={() => setPendingNavigation(null)}
                disabled={saving}
                className="focus-ring rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:hover:bg-[#1a1a1a]"
              >
                Stay
              </button>
            </div>
          </Dialog>
        )}

        {confirmingResetAll && (
          <Dialog
            role="alertdialog"
            labelledBy="reset-all-title"
            onClose={() => setConfirmingResetAll(false)}
            canClose={!resettingAll}
            className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-xl dark:border-red-900 dark:bg-zinc-950"
          >
            <p id="reset-all-title" className="text-base font-semibold text-red-800 dark:text-red-200">
              Reset every gameweek&apos;s plan?
            </p>
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">
              This discards every planned lineup change for every future gameweek and reverts them
              all to your current FPL squad. This action cannot be undone.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleConfirmResetAll}
                disabled={resettingAll}
                className="focus-ring rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
              >
                {resettingAll ? "Resetting…" : "Yes, reset everything"}
              </button>
              <button
                data-autofocus
                onClick={() => setConfirmingResetAll(false)}
                disabled={resettingAll}
                className="focus-ring rounded-full border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:hover:bg-[#1a1a1a]"
              >
                Cancel
              </button>
            </div>
          </Dialog>
        )}

        {lineup.isEditable && viewingPlayer && (
          <PlayerProfileModal
            key={viewingPlayer.playerId}
            playerId={viewingPlayer.playerId}
            profileAction={profileAction}
            onClose={() => setViewingPlayerId(null)}
            actions={() => (
              // The decisions made here most weeks — the armband — come
              // first, as toggle buttons that show their own state, rather
              // than checkboxes under the stats.
              <div className="flex flex-wrap gap-2">
                {viewingPlayer.isStarting && (
                  <>
                    <button
                      type="button"
                      aria-pressed={viewingPlayer.isCaptain}
                      onClick={() => setCaptain(viewingPlayer.playerId)}
                      className={viewingPlayer.isCaptain ? "focus-ring rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors dark:border-accent dark:bg-accent dark:text-accent-foreground" : "focus-ring rounded-full border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"}
                    >
                      {viewingPlayer.isCaptain ? "Captain" : "Make captain"}
                    </button>
                    <button
                      type="button"
                      aria-pressed={viewingPlayer.isViceCaptain}
                      onClick={() => setViceCaptain(viewingPlayer.playerId)}
                      className={viewingPlayer.isViceCaptain ? "focus-ring rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors dark:border-accent dark:bg-accent dark:text-accent-foreground" : "focus-ring rounded-full border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"}
                    >
                      {viewingPlayer.isViceCaptain ? "Vice-captain" : "Make vice-captain"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleSubstituteFromModal(viewingPlayer.playerId)}
                  className="focus-ring rounded-full border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"
                >
                  Substitute
                </button>
                <button
                  type="button"
                  onClick={() => handleSellFromModal(viewingPlayer.playerId)}
                  className="focus-ring rounded-full border border-red-200 px-4 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  Transfer out
                </button>
              </div>
            )}
          />
        )}

        {/* Below md there's no room for the squad and the transfer picker
            side by side, so it falls back to a centered, dimmed modal. */}
        {transferOutPlayer && !isMdUp && (
          <Dialog
            label={transferPanelTitle(transferOutPlayer)}
            onClose={handleClearActiveTransferOut}
            overlayClassName="items-end"
            className="flex max-h-[80vh] w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-white p-6 shadow-xl dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
              <p className="text-base font-semibold text-black dark:text-zinc-50">
                {transferPanelTitle(transferOutPlayer)}
                {transferOutIds.length > 1 && ` (${transferOutIds.length} pending)`}
              </p>
              <button
                onClick={handleClearActiveTransferOut}
                className="focus-ring rounded text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Close
              </button>
            </div>
            <PlayerSearchResults
              key={transferOutPlayer.playerId}
              autoFocus
              requiredPosition={transferOutPlayer.position}
              anyPosition={chipIsTransferFree}
              userId={userId}
              gameweekNumber={selectedGameweek}
              searchAction={searchAction}
              profileAction={profileAction}
              reincludePlayers={freedPlayers}
              onSelect={(inPlayer) => handleTransfer(transferOutPlayer.playerId, inPlayer)}
            />
          </Dialog>
        )}

        {lineup.isEditable && (
          // Collapsed to one line by default: the squad on the pitch is the
          // planner's main object, and an expanded panel pushed it below the
          // fold. The summary still carries the headline recommendation.
          <section
            aria-labelledby="suggestions-title"
            className="mt-4 rounded-2xl border border-border bg-black/[.02] px-4 py-3 dark:bg-white/[.04]"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <h2 id="suggestions-title" className="text-lg font-semibold text-black dark:text-zinc-50">
                  Suggested transfers
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {suggestionsSummary({
                    loading: loadingSuggestions,
                    failed: suggestionsError !== null,
                    applied: canUndoCombination,
                    combination,
                    singleCount: visibleSuggestions.length,
                    horizonRange,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSuggestionsOpen((open) => !open)}
                aria-expanded={suggestionsOpen}
                aria-controls="suggestions-body"
                className="focus-ring shrink-0 rounded-full border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"
              >
                {suggestionsOpen ? "Hide" : "Show"}
                <span className="sr-only"> suggested transfers</span>
              </button>
            </div>
            {suggestionsOpen && (
              <div id="suggestions-body">
                {/* Shown at every width — this is the caveat that makes the
                    numbers honest, so it can't be a desktop-only extra. */}
                {/* 52ch, not 65: `ch` is the width of a "0", wider than the
                    average letter, so 65ch measured ~86 characters a line. */}
                <p className="mt-2 max-w-[52ch] text-xs text-zinc-600 dark:text-zinc-400">
                  {horizonRange
                    ? `Average points gained per gameweek over ${horizonRange}, projected from form, points per game and fixture difficulty. Swaps for bench players count for little, since their points rarely do. A rough guide, not a prediction.`
                    : "Average points gained per gameweek, projected from form, points per game and fixture difficulty. A rough guide, not a prediction."}
                </p>
                <SuggestionsLegend />
                {loadingSuggestions ? (
                  <div className="mt-3 flex animate-pulse gap-3 overflow-hidden">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="aspect-square w-36 shrink-0 rounded-xl bg-black/[.06] dark:bg-white/[.08]"
                      />
                    ))}
                  </div>
                ) : suggestionsError ? (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400">{suggestionsError}</p>
                ) : (
                  <>
                    {canUndoCombination && appliedCombination && (
                      <div
                        role="status"
                        className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        <span>
                          Applied {appliedCombination.combination.transfers.length} transfers
                          {appliedCombination.combination.hits > 0 &&
                            ` (−${appliedCombination.combination.hits * HIT_COST} pts in hits)`}
                          . Review them on the pitch, then save.
                        </span>
                        <button
                          type="button"
                          onClick={undoCombination}
                          className="focus-ring rounded text-sm font-medium text-primary underline underline-offset-2 dark:text-accent"
                        >
                          Undo
                        </button>
                      </div>
                    )}
                    {combination !== null && (
                      // The one recommendation, chosen jointly by the solver —
                      // led with, so the single-transfer cards below read as
                      // alternatives rather than a competing answer.
                      <section aria-labelledby="best-plan-title" className="mt-3 border-t border-border pt-3">
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                          <div className="min-w-0">
                            <h3 id="best-plan-title" className="text-base font-semibold text-black dark:text-zinc-50">
                              Best plan: {combination.transfers.length} transfers
                            </h3>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400">
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {perGameweek(combination.netProjectedGainPerGameweek)}
                              </span>
                              {horizonRange && ` over ${horizonRange}`}
                              {combination.hits > 0
                                ? `, counting −${combination.hits * HIT_COST} in hits`
                                : ", with no hits"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => applyCombination(combination)}
                            className="focus-ring shrink-0 rounded-full border border-primary px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 dark:border-accent dark:text-accent dark:hover:bg-accent/10"
                          >
                            Apply all {combination.transfers.length}
                          </button>
                        </div>
                        <ul className="mt-2 flex flex-col gap-1 text-xs">
                          {combination.transfers.map((t) => (
                            <li
                              key={`${t.outPlayer.playerId}-${t.inPlayer.playerId}`}
                              className="flex items-center gap-1.5"
                            >
                              <span className="truncate text-zinc-500 line-through dark:text-zinc-400">
                                {t.outPlayer.webName}
                              </span>
                              <span aria-hidden="true" className="text-zinc-500 dark:text-zinc-400">→</span>
                              <span className="sr-only">replaced by</span>
                              <span className="truncate font-medium text-black dark:text-zinc-50">
                                {t.inPlayer.webName}
                              </span>
                              <span className="ml-auto shrink-0 tabular-nums text-emerald-700 dark:text-emerald-400">
                                {perGameweek(t.projectedGainPerGameweek)}
                              </span>
                            </li>
                          ))}
                          {combination.hits > 0 && (
                            <li className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                              <span>
                                {combination.hits} extra transfer{combination.hits === 1 ? "" : "s"} beyond your free
                                ones
                              </span>
                              {/* A hit is paid once, not every gameweek — said
                                  outright, since the rows above are per GW. */}
                              <span className="ml-auto shrink-0 tabular-nums text-amber-700 dark:text-amber-400">
                                −{combination.hits * HIT_COST} pts once
                              </span>
                            </li>
                          )}
                        </ul>
                      </section>
                    )}
                    {combination !== null && visibleSuggestions.length > 0 && (
                      <div className="mt-4 border-t border-border pt-3">
                        <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                          Or make just one transfer
                        </h3>
                        <p className="max-w-[52ch] text-xs text-zinc-600 dark:text-zinc-400">
                          Each card is the best single swap on its own, so its pairing can differ from the
                          best plan, which picks its transfers together.
                        </p>
                      </div>
                    )}
                    {visibleSuggestions.length === 0 ? (
                      combination === null && !canUndoCombination && (
                        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                          No standout swaps found for this squad right now.
                        </p>
                      )
                    ) : (
                      // A horizontal, scroll-snapped strip rather than a vertical
                      // list — native touch/trackpad scroll gives carousel-like
                      // browsing for free, no JS or extra state needed.
                      // `relative` so the cards' screen-reader-only text (absolutely
                      // positioned, like all sr-only) is clipped by this scroller
                      // too — otherwise it escapes it and widens the whole page.
                      <div className="relative mt-3 -mx-1 flex snap-x snap-mandatory scroll-px-1 gap-3 overflow-x-auto px-1 pb-2">
                        {visibleSuggestions.map((s) => (
                          <div
                            key={`${s.outPlayer.playerId}-${s.inPlayer.playerId}`}
                            className="flex w-36 shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl border border-border bg-white p-3 text-center dark:bg-zinc-950"
                          >
                            <div className="flex items-center justify-center gap-1">
                              {s.outPlayer.clubCode !== null && (
                                <Image
                                  src={shirtUrl(s.outPlayer.clubCode, s.outPlayer.position)}
                                  alt=""
                                  width={26}
                                  height={26}
                                  className="h-[26px] w-[26px] object-contain opacity-40"
                                />
                              )}
                              <span aria-hidden="true" className="text-xs text-zinc-500 dark:text-zinc-400">→</span>
                              {s.inPlayer.clubCode !== null && (
                                <Image
                                  src={shirtUrl(s.inPlayer.clubCode, s.inPlayer.position)}
                                  alt=""
                                  width={30}
                                  height={30}
                                  className="h-[30px] w-[30px] object-contain"
                                />
                              )}
                            </div>
                            <div className="flex w-full flex-col">
                              <span className="flex items-center justify-center gap-1">
                                <span className="truncate text-xs text-zinc-500 line-through dark:text-zinc-400">
                                  {s.outPlayer.webName}
                                </span>
                                <PriceChangeMarker direction={s.outPlayerPriceDirection} />
                              </span>
                              <span className="flex items-center justify-center gap-1">
                                <span className="truncate text-sm font-semibold text-black dark:text-zinc-50">
                                  {s.inPlayer.webName}
                                </span>
                                <PriceChangeMarker direction={s.inPlayerPriceDirection} />
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-x-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                              <span>{formatPrice(s.inPlayer.currentPrice)}</span>
                              <span
                                title={`Average projected gain per gameweek${
                                  horizonRange ? ` over ${horizonRange}` : ""
                                } (${s.projectedGain >= 0 ? "+" : "−"}${Math.abs(s.projectedGain).toFixed(1)} pts in total)`}
                                className="text-emerald-700 dark:text-emerald-400"
                              >
                                {perGameweek(s.projectedGainPerGameweek)}
                              </span>
                              {/* Says why a bench swap's number is small: its
                                  points only count if an auto-sub brings them on. */}
                              {!s.outPlayerStarting && (
                                <span className="basis-full text-zinc-600 dark:text-zinc-400">bench slot</span>
                              )}
                              {suggestionCostsHit(
                                transferOutIdSet.has(s.outPlayer.playerId),
                                transfersMade,
                                freeTransfers,
                                chipIsTransferFree,
                              ) && (
                                <span
                                  title="You've used your free transfers, so this one would cost 4 points"
                                  className="text-amber-700 dark:text-amber-400"
                                >
                                  −4
                                </span>
                              )}
                            </div>
                            <FixtureStrip playerName={s.inPlayer.webName} projections={s.gameweekProjections} />
                            <button
                              type="button"
                              onClick={() => applySuggestion(s)}
                              className="focus-ring mt-1 w-full shrink-0 rounded-full border border-primary/30 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 dark:border-accent/40 dark:text-accent dark:hover:bg-accent/10"
                            >
                              Apply
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {/* The squad, pitch and bench, is one arrow-key group: a single
            Tab stop, arrows to move between players (see RovingGroup). */}
        <RovingGroup label="Your squad. Use the arrow keys to move between players.">
          <div className="mt-6">
            <Pitch
              roving={lineup.isEditable}
              starting={starting}
              selectedPlayerId={lineup.isEditable ? selectedId : undefined}
              disabledPlayerIds={disabledPlayerIds}
              blankPlayerIds={transferOutIdSet}
              activeBlankPlayerId={activeTransferOutId}
              onPlayerClick={lineup.isEditable ? handlePlayerClick : undefined}
              onPlayerRemove={
                lineup.isEditable ? (player) => handleTransferOutClick(player.playerId) : undefined
              }
              onBlankActivate={
                lineup.isEditable ? (player) => handleActivateTransferOut(player.playerId) : undefined
              }
            />
          </div>

          <h2 className="mt-6 text-lg font-semibold text-black dark:text-zinc-50">Bench</h2>
          <div className="mt-2 flex justify-center gap-1 rounded-2xl border border-border bg-black/[.03] p-3 sm:gap-2 sm:p-4 xl:gap-6 dark:bg-white/[.04]">
            {bench.map((player, index) => (
              <PlayerCard
                key={player.playerId}
                player={player}
                muted
                roving={lineup.isEditable}
                benchSlot={benchSlotLabel(bench, index)}
                selected={lineup.isEditable && player.playerId === selectedId}
                disabled={disabledPlayerIds.has(player.playerId)}
                blank={transferOutIdSet.has(player.playerId)}
                activeBlank={player.playerId === activeTransferOutId}
                onClick={lineup.isEditable ? () => handlePlayerClick(player) : undefined}
                onRemove={lineup.isEditable ? () => handleTransferOutClick(player.playerId) : undefined}
                onActivate={
                  lineup.isEditable ? () => handleActivateTransferOut(player.playerId) : undefined
                }
              />
            ))}
          </div>
        </RovingGroup>

        {lineup.isEditable && (
          // Sticks to the bottom of the screen while there's something to
          // save, so the commit action and what it will commit are always in
          // reach (and in the thumb zone on a phone) instead of a long
          // scroll below the pitch and bench.
          <div
            className={`mt-6 flex flex-col gap-2 border-t border-border bg-white py-3 dark:bg-zinc-950 ${
              dirty ? "sticky bottom-0 z-20 shadow-[0_-12px_16px_-14px_rgba(0,0,0,0.3)]" : ""
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p
                aria-live="polite"
                className={`min-w-0 basis-full text-sm sm:flex-1 sm:basis-auto ${
                  dirty ? "font-medium text-black dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {dirty ? pendingSummary : "No unsaved changes"}
              </p>
              <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
                <button
                  onClick={handleReset}
                  disabled={!dirty || saving}
                  className="focus-ring rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:hover:bg-[#1a1a1a]"
                >
                  Discard changes
                </button>
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving || saveBlockedReason !== null}
                  aria-describedby={saveBlockedReason ? "save-blocked-reason" : undefined}
                  // The one filled, high-emphasis button on the page, in both
                  // themes — plum on white, the neon accent on dark (plum on
                  // near-black all but disappeared).
                  className="focus-ring rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 dark:bg-accent dark:text-accent-foreground dark:hover:bg-accent/90 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            {/* Shown as text rather than a tooltip on the disabled button:
                a tooltip never appears on touch, and a disabled button can't
                be focused to reveal one. */}
            {dirty && saveBlockedReason && (
              <p id="save-blocked-reason" className="text-sm text-zinc-600 dark:text-zinc-400">
                {saveBlockedReason}
              </p>
            )}
            {message && messageTone && <Banner tone={messageTone}>{message}</Banner>}
          </div>
        )}

        {/* Destructive and rarely needed, so it lives at the end of the page,
            styled as destructive, away from the controls used every visit. */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => setConfirmingResetAll(true)}
            disabled={resettingAll}
            className="focus-ring rounded text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-800 disabled:opacity-40 dark:text-red-400 dark:hover:text-red-300"
          >
            {resettingAll ? "Resetting…" : "Reset all gameweeks’ plans…"}
          </button>
        </div>
      </div>

      {/* Always visible from md up (not gated behind clicking "Transfer
          out" first) so the squad and the pool of available replacements
          can be compared side by side the whole time you're planning. */}
      {lineup.isEditable && (
        <div
          id="transfer-panel"
          tabIndex={-1}
          className="hidden w-72 shrink-0 flex-col gap-4 border-l border-border pl-6 outline-none md:sticky md:top-8 md:flex md:h-[calc(100vh-4rem)]"
        >
          <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
            <p className="text-base font-semibold text-black dark:text-zinc-50">
              {transferPanelTitle(transferOutPlayer)}
              {transferOutIds.length > 1 && ` (${transferOutIds.length} pending)`}
            </p>
            {transferOutPlayer && (
              <button
                onClick={handleClearActiveTransferOut}
                className="focus-ring rounded text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Clear
              </button>
            )}
          </div>
          <PlayerSearchResults
            key={transferOutPlayer?.playerId ?? "browse"}
            autoFocus={transferOutPlayer !== null}
            requiredPosition={transferOutPlayer?.position ?? null}
            anyPosition={chipIsTransferFree}
            userId={userId}
            gameweekNumber={selectedGameweek}
            searchAction={searchAction}
            profileAction={profileAction}
            reincludePlayers={freedPlayers}
            onSelect={
              transferOutPlayer
                ? (inPlayer) => handleTransfer(transferOutPlayer.playerId, inPlayer)
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
