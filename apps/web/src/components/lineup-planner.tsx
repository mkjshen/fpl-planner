"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Lineup, LineupPlayerInput, SquadPlayer } from "@/lib/api";
import { formatPrice, Pitch, PlayerCard } from "@/components/pitch";

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
  currentGameweek,
  gameweekOptions,
  saveAction,
  resetAllAction,
}: {
  userId: string;
  lineup: Lineup;
  selectedGameweek: number;
  currentGameweek: number | null;
  gameweekOptions: { number: number; label: string }[];
  saveAction: (
    userId: string,
    gameweekNumber: number,
    players: LineupPlayerInput[],
  ) => Promise<SaveResult>;
  resetAllAction: (userId: string, gameweekNumber: number) => Promise<Lineup>;
}) {
  const router = useRouter();
  const [players, setPlayers] = useState(lineup.players);
  // The last state confirmed by the server — what "Reset" reverts to and
  // what "dirty" is measured against, since `lineup` (the prop) stays frozen
  // at whatever the page originally fetched even after a Save or reset-all
  // updates things via a direct server response rather than a remount.
  const [savedPlayers, setSavedPlayers] = useState(lineup.players);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [confirmingResetAll, setConfirmingResetAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const starting = players.filter((p) => p.isStarting);
  const bench = players.filter((p) => !p.isStarting).sort((a, b) => a.squadPosition - b.squadPosition);
  const dirty = JSON.stringify(players) !== JSON.stringify(savedPlayers);
  const error = lineup.isEditable ? validationError(players) : null;
  const selectedPlayer = players.find((p) => p.playerId === selectedId) ?? null;
  const disabledPlayerIds =
    lineup.isEditable && selectedId !== null
      ? new Set(
          players
            .filter((p) => p.playerId !== selectedId && !canSwap(players, selectedId, p.playerId))
            .map((p) => p.playerId),
        )
      : new Set<number>();

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
    setMessage(null);
  }

  async function handleConfirmResetAll() {
    setResettingAll(true);
    const fresh = await resetAllAction(userId, selectedGameweek);
    setPlayers(fresh.players);
    setSavedPlayers(fresh.players);
    setResettingAll(false);
    setConfirmingResetAll(false);
    setSelectedId(null);
    setMessage(null);
    router.refresh();
  }

  async function handleSave() {
    if (error) {
      setMessage(error);
      return;
    }
    setSaving(true);
    setMessage(null);
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
      setMessage("Saved.");
    } else {
      setMessage(result.message);
    }
  }

  return (
    <div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {lineup.teamName} · {lineup.managerName}
          </p>
          <select
            value={selectedGameweek}
            onChange={(e) => router.push(`/dashboard/planner?gameweek=${e.target.value}`)}
            className="rounded-md border border-black/[.08] bg-white px-2 py-1 text-sm dark:border-white/[.145] dark:bg-black"
          >
            {gameweekOptions.map((gw) => (
              <option key={gw.number} value={gw.number}>
                {gw.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setConfirmingResetAll(true)}
            disabled={resettingAll}
            className="text-xs font-medium text-zinc-500 underline decoration-dotted hover:text-zinc-700 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {resettingAll ? "Resetting…" : "Reset all plans"}
          </button>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Bank {formatPrice(lineup.bank)} · Value {formatPrice(lineup.teamValue)}
        </p>
      </div>

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

      {lineup.isEditable && (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Planning gameweek {selectedGameweek}
          {currentGameweek !== null && ` (current: ${currentGameweek})`}. Click a player, then
          click another to swap them.
        </p>
      )}

      <div className="mt-6">
        <Pitch
          starting={starting}
          selectedPlayerId={lineup.isEditable ? selectedId : undefined}
          disabledPlayerIds={disabledPlayerIds}
          onPlayerClick={lineup.isEditable ? handlePlayerClick : undefined}
        />
      </div>

      {lineup.isEditable && selectedPlayer?.isStarting && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">{selectedPlayer.webName}:</span>
          <button
            onClick={() => setCaptain(selectedPlayer.playerId)}
            className="rounded-md border border-black/[.08] px-2 py-1 text-xs font-medium hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Make captain
          </button>
          <button
            onClick={() => setViceCaptain(selectedPlayer.playerId)}
            className="rounded-md border border-black/[.08] px-2 py-1 text-xs font-medium hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Make vice-captain
          </button>
        </div>
      )}

      <h2 className="mt-6 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bench</h2>
      <div className="mt-2 flex flex-wrap gap-2 sm:gap-4">
        {bench.map((player) => (
          <PlayerCard
            key={player.playerId}
            player={player}
            muted
            selected={lineup.isEditable && player.playerId === selectedId}
            disabled={disabledPlayerIds.has(player.playerId)}
            onClick={lineup.isEditable ? () => handlePlayerClick(player) : undefined}
          />
        ))}
      </div>

      {lineup.isEditable && (
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-40 dark:hover:bg-[#ccc]"
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
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{message}</span>
          )}
        </div>
      )}
    </div>
  );
}
