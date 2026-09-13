import type { Position, Squad, SquadPlayer } from "@/lib/api";

function formatPrice(tenthsOfMillion: number): string {
  return `£${(tenthsOfMillion / 10).toFixed(1)}m`;
}

function PlayerCard({ player, muted }: { player: SquadPlayer; muted?: boolean }) {
  return (
    <div
      className={`relative flex w-20 flex-col items-center rounded-lg border px-1.5 py-2 text-center shadow-sm sm:w-24 ${
        muted
          ? "border-black/[.08] bg-white/70 dark:border-white/[.1] dark:bg-zinc-900/70"
          : "border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-900"
      }`}
    >
      {(player.isCaptain || player.isViceCaptain) && (
        <span
          className={`absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-[0.6rem] font-bold ${
            player.isCaptain
              ? "bg-foreground text-background"
              : "border border-black/[.15] bg-white text-black dark:border-white/[.2] dark:bg-zinc-900 dark:text-zinc-50"
          }`}
        >
          {player.isCaptain ? "C" : "VC"}
        </span>
      )}
      <span className="w-full truncate text-xs font-semibold text-black dark:text-zinc-50">
        {player.webName}
      </span>
      <span className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">{player.club}</span>
      <span className="mt-0.5 text-[0.65rem] font-medium text-zinc-600 dark:text-zinc-300">
        {formatPrice(player.currentPrice)}
      </span>
    </div>
  );
}

const PITCH_ROWS: Position[] = ["GK", "DEF", "MID", "FWD"];

function Pitch({ starting }: { starting: SquadPlayer[] }) {
  const byPosition = (position: Position) =>
    starting.filter((p) => p.position === position).sort((a, b) => a.squadPosition - b.squadPosition);

  const formation = (["DEF", "MID", "FWD"] as const)
    .map((position) => byPosition(position).length)
    .join("-");

  return (
    <div className="relative">
      <span className="absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-black/30 px-2 py-0.5 text-xs font-medium text-white">
        {formation}
      </span>
      <div
        className="flex flex-col justify-between gap-4 rounded-xl border border-black/10 px-2 py-10 sm:px-6"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, #3d8c40 0, #3d8c40 12.5%, #439648 12.5%, #439648 25%)",
        }}
      >
        {PITCH_ROWS.map((position) => (
          <div key={position} className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
            {byPosition(position).map((player) => (
              <PlayerCard key={player.playerId} player={player} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SquadView({ squad }: { squad: Squad }) {
  const starting = squad.players.filter((p) => p.isStarting);
  const bench = squad.players
    .filter((p) => !p.isStarting)
    .sort((a, b) => a.squadPosition - b.squadPosition);

  return (
    <div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {squad.teamName} · {squad.managerName} · Gameweek {squad.gameweek}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Bank {formatPrice(squad.bank)} · Value {formatPrice(squad.teamValue)}
        </p>
      </div>

      <div className="mt-6">
        <Pitch starting={starting} />
      </div>

      <h2 className="mt-6 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bench</h2>
      <div className="mt-2 flex flex-wrap gap-2 sm:gap-4">
        {bench.map((player) => (
          <PlayerCard key={player.playerId} player={player} muted />
        ))}
      </div>
    </div>
  );
}
