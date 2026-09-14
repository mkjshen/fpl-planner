"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Lineup, LineupPlayerInput, PlayerListItem, SquadPlayer } from "@/lib/api";
import { formatPrice, Pitch, PlayerCard, StatChip } from "@/components/pitch";
import { PlayerSearchResults, type SearchAction } from "@/components/player-search";

type SaveResult = { ok: true; lineup: Lineup } | { ok: false; message: string };

function validationError(players: SquadPlayer[]): string | null {
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

function canSwap(players: SquadPlayer[], aId: number, bId: number): boolean {
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

export function LineupPlanner({
  userId,
  lineup,
  selectedGameweek,
  gameweekOptions,
  saveAction,
  resetAllAction,
  searchAction,
}: {
  userId: string;
  lineup: Lineup;
  selectedGameweek: number;
  gameweekOptions: { number: number; label: string }[];
  saveAction: (
    userId: string,
    gameweekNumber: number,
    players: LineupPlayerInput[],
  ) => Promise<SaveResult>;
  resetAllAction: (userId: string, gameweekNumber: number) => Promise<Lineup>;
  searchAction: SearchAction;
}) {
  const router = useRouter();
  const [players, setPlayers] = useState(lineup.players);
  // The last state confirmed by the server — what "Reset" reverts to and
  // what "dirty" is measured against, since `lineup` (the prop) stays frozen
  // at whatever the page originally fetched even after a Save or reset-all
  // updates things via a direct server response rather than a remount.
  const [savedPlayers, setSavedPlayers] = useState(lineup.players);
  const [savedBank, setSavedBank] = useState(lineup.bank);
  const [savedTeamValue, setSavedTeamValue] = useState(lineup.teamValue);
  const [freeTransfers, setFreeTransfers] = useState(lineup.freeTransfers);
  const [laterPlansAffected, setLaterPlansAffected] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Every player currently transferred out but not yet replaced — several
  // can be pending at once. `activeTransferOutId` is whichever one the
  // transfer-in panel is showing right now (always one of `transferOutIds`
  // while it's non-empty).
  const [transferOutIds, setTransferOutIds] = useState<number[]>([]);
  const [activeTransferOutId, setActiveTransferOutId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [confirmingResetAll, setConfirmingResetAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error" | null>(null);

  const gameweekIndex = gameweekOptions.findIndex((gw) => gw.number === selectedGameweek);
  const previousGameweek = gameweekIndex > 0 ? gameweekOptions[gameweekIndex - 1] : null;
  const nextGameweek =
    gameweekIndex >= 0 && gameweekIndex < gameweekOptions.length - 1
      ? gameweekOptions[gameweekIndex + 1]
      : null;

  const starting = players.filter((p) => p.isStarting);
  const bench = players.filter((p) => !p.isStarting).sort((a, b) => a.squadPosition - b.squadPosition);
  const dirty = JSON.stringify(players) !== JSON.stringify(savedPlayers);
  const error = lineup.isEditable ? validationError(players) : null;
  const selectedPlayer = players.find((p) => p.playerId === selectedId) ?? null;
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
  const liveTransferCost = Math.max(transfersMade - freeTransfers, 0) * 4;

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

  function handlePlayerClick(player: SquadPlayer) {
    if (!lineup.isEditable) return;
    if (selectedId === null) {
      setSelectedId(player.playerId);
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
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.playerId !== outPlayerId) return p;
        return {
          playerId: inPlayer.playerId,
          webName: inPlayer.webName,
          position: inPlayer.position,
          club: inPlayer.club,
          clubCode: inPlayer.clubCode,
          currentPrice: inPlayer.currentPrice,
          purchasePrice: inPlayer.currentPrice,
          sellingPrice: inPlayer.currentPrice,
          isStarting: p.isStarting,
          squadPosition: p.squadPosition,
          isCaptain: p.isCaptain,
          isViceCaptain: p.isViceCaptain,
        };
      }),
    );
    // If other transfers are still pending, hand the panel to the next one
    // rather than leaving it empty while blank slots are still sitting there.
    const remaining = transferOutIds.filter((id) => id !== outPlayerId);
    setTransferOutIds(remaining);
    setActiveTransferOutId((current) => (current === outPlayerId ? (remaining[0] ?? null) : current));
    setSelectedId(null);
    setMessage(null);
    setMessageTone(null);
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

  function setCaptain(playerId: number) {
    setPlayers((prev) => prev.map((p) => ({ ...p, isCaptain: p.playerId === playerId })));
  }

  function setViceCaptain(playerId: number) {
    setPlayers((prev) => prev.map((p) => ({ ...p, isViceCaptain: p.playerId === playerId })));
  }

  function handleReset() {
    setPlayers(savedPlayers);
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

  async function handleSave() {
    if (error) {
      setMessage(error);
      setMessageTone("error");
      return;
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
    const result = await saveAction(userId, selectedGameweek, inputs);
    setSaving(false);
    if (result.ok) {
      setPlayers(result.lineup.players);
      setSavedPlayers(result.lineup.players);
      setSavedBank(result.lineup.bank);
      setSavedTeamValue(result.lineup.teamValue);
      setFreeTransfers(result.lineup.freeTransfers);
      setLaterPlansAffected(result.lineup.laterPlansAffected);
      setMessage("Saved.");
      setMessageTone("success");
    } else {
      setMessage(result.message);
      setMessageTone("error");
    }
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="min-w-0 flex-1">
        <div className="border-b border-black/[.08] pb-4 dark:border-white/[.145]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
                {lineup.teamName}
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{lineup.managerName}</p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-black/[.08] bg-black/[.02] p-1 dark:border-white/[.145] dark:bg-white/[.03]">
              <button
                type="button"
                onClick={() =>
                  previousGameweek &&
                  router.push(`/dashboard/planner?gameweek=${previousGameweek.number}`)
                }
                disabled={!previousGameweek}
                aria-label="Previous gameweek"
                className="rounded-full px-2 py-1 text-sm font-medium transition-colors hover:bg-black/[.06] disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/[.08] dark:disabled:hover:bg-transparent"
              >
                ‹
              </button>
              <span className="min-w-[7rem] text-center text-sm font-medium text-black dark:text-zinc-50">
                {gameweekOptions[gameweekIndex]?.label ?? `Gameweek ${selectedGameweek}`}
              </span>
              <button
                type="button"
                onClick={() =>
                  nextGameweek && router.push(`/dashboard/planner?gameweek=${nextGameweek.number}`)
                }
                disabled={!nextGameweek}
                aria-label="Next gameweek"
                className="rounded-full px-2 py-1 text-sm font-medium transition-colors hover:bg-black/[.06] disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/[.08] dark:disabled:hover:bg-transparent"
              >
                ›
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <StatChip label="Bank" value={formatPrice(liveBank)} negative={liveBank < 0} />
            <StatChip label="Value" value={formatPrice(liveTeamValue)} />
            {lineup.isEditable && (
              <>
                <StatChip
                  label="Free Transfers"
                  value={String(freeTransfers)}
                  title="Free transfers available entering this gameweek, computed from your real FPL transfer history and chip usage."
                />
                {liveTransferCost > 0 && (
                  <StatChip label="Cost" value={`-${liveTransferCost} pts`} negative />
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setConfirmingResetAll(true)}
            disabled={resettingAll}
            className="text-xs font-medium text-zinc-500 underline decoration-dotted hover:text-zinc-700 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {resettingAll ? "Resetting…" : "Reset all plans"}
          </button>
        </div>

        {laterPlansAffected && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <span>
              Editing gameweek {selectedGameweek} may make your later planned gameweeks
              inconsistent — review them or use Reset all plans.
            </span>
            <button
              onClick={() => setLaterPlansAffected(false)}
              className="shrink-0 font-medium text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
            >
              Dismiss
            </button>
          </div>
        )}

        {confirmingResetAll && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => !resettingAll && setConfirmingResetAll(false)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="reset-all-title"
              onClick={(e) => e.stopPropagation()}
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
                  className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
                >
                  {resettingAll ? "Resetting…" : "Yes, reset everything"}
                </button>
                <button
                  onClick={() => setConfirmingResetAll(false)}
                  disabled={resettingAll}
                  className="rounded-md border border-black/[.08] px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Below md there's no room for the squad and the transfer picker
            side by side, so it falls back to a centered, dimmed modal. */}
        {transferOutPlayer && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm md:hidden"
            onClick={handleClearActiveTransferOut}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Transfer in a ${transferOutPlayer.position}`}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[80vh] w-full max-w-md flex-col gap-4 rounded-xl border border-black/[.08] bg-white p-6 shadow-xl dark:border-white/[.145] dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between gap-4 border-b border-black/[.08] pb-3 dark:border-white/[.145]">
                <p className="text-base font-semibold text-black dark:text-zinc-50">
                  Transfer in a {transferOutPlayer.position}
                  {transferOutIds.length > 1 && ` (${transferOutIds.length} pending)`}
                </p>
                <button
                  onClick={handleClearActiveTransferOut}
                  className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Close
                </button>
              </div>
              <PlayerSearchResults
                key={transferOutPlayer.playerId}
                requiredPosition={transferOutPlayer.position}
                userId={userId}
                gameweekNumber={selectedGameweek}
                searchAction={searchAction}
                reincludePlayers={freedPlayers}
                onSelect={(inPlayer) => handleTransfer(transferOutPlayer.playerId, inPlayer)}
              />
            </div>
          </div>
        )}

        <div className="mt-6">
          <Pitch
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

        {lineup.isEditable && selectedPlayer && selectedPlayer.isStarting && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-black/[.06] bg-zinc-50 px-3 py-2 text-sm dark:border-white/[.08] dark:bg-white/[.03]">
            <span className="font-medium text-black dark:text-zinc-50">{selectedPlayer.webName}:</span>
            <button
              onClick={() => setCaptain(selectedPlayer.playerId)}
              className="rounded-md border border-black/[.08] px-2 py-1 text-xs font-medium transition-colors hover:border-accent hover:bg-accent/10 dark:border-white/[.145] dark:hover:border-accent dark:hover:bg-accent/10"
            >
              Make captain
            </button>
            <button
              onClick={() => setViceCaptain(selectedPlayer.playerId)}
              className="rounded-md border border-black/[.08] px-2 py-1 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5 dark:border-white/[.145] dark:hover:border-accent dark:hover:bg-accent/10"
            >
              Make vice-captain
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2 xl:gap-6">
          {bench.map((player) => (
            <PlayerCard
              key={player.playerId}
              player={player}
              muted
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

        {lineup.isEditable && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-black/[.08] pt-4 dark:border-white/[.145]">
            <button
              onClick={handleSave}
              disabled={!dirty || saving || transferOutIds.length > 0}
              title={
                transferOutIds.length > 0
                  ? "Pick a replacement for every transferred-out player, or clear them, first"
                  : undefined
              }
              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={handleReset}
              disabled={!dirty || saving}
              className="rounded-full border border-black/[.08] px-5 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Reset
            </button>
            {message && (
              <span
                className={`text-sm ${
                  messageTone === "success"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : messageTone === "error"
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {message}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Always visible from md up (not gated behind clicking "Transfer
          out" first) so the squad and the pool of available replacements
          can be compared side by side the whole time you're planning. */}
      {lineup.isEditable && (
        <div className="hidden w-72 shrink-0 flex-col gap-4 border-l border-black/[.08] pl-6 dark:border-white/[.145] md:sticky md:top-8 md:flex md:h-[calc(100vh-4rem)]">
          <div className="flex items-center justify-between gap-4 border-b border-black/[.08] pb-3 dark:border-white/[.145]">
            <p className="text-base font-semibold text-black dark:text-zinc-50">
              {transferOutPlayer ? `Transfer in a ${transferOutPlayer.position}` : "Transfer players"}
              {transferOutIds.length > 1 && ` (${transferOutIds.length} pending)`}
            </p>
            {transferOutPlayer && (
              <button
                onClick={handleClearActiveTransferOut}
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Clear
              </button>
            )}
          </div>
          <PlayerSearchResults
            key={transferOutPlayer?.playerId ?? "browse"}
            requiredPosition={transferOutPlayer?.position ?? null}
            userId={userId}
            gameweekNumber={selectedGameweek}
            searchAction={searchAction}
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
