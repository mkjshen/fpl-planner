import type { Squad, SquadPlayer } from "@/lib/api";

function formatPrice(tenthsOfMillion: number): string {
  return `£${(tenthsOfMillion / 10).toFixed(1)}m`;
}

function PlayerRow({ player }: { player: SquadPlayer }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145]">
      <div className="flex items-center gap-2">
        <span className="w-10 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {player.position}
        </span>
        <span className="font-medium text-black dark:text-zinc-50">{player.webName}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{player.club}</span>
        {player.isCaptain && (
          <span className="rounded bg-foreground px-1.5 py-0.5 text-[0.65rem] font-semibold text-background">
            C
          </span>
        )}
        {player.isViceCaptain && (
          <span className="rounded border border-black/[.15] px-1.5 py-0.5 text-[0.65rem] font-semibold dark:border-white/[.2]">
            VC
          </span>
        )}
      </div>
      <span className="text-zinc-600 dark:text-zinc-400">{formatPrice(player.currentPrice)}</span>
    </li>
  );
}

export function SquadView({ squad }: { squad: Squad }) {
  const starting = squad.players.filter((p) => p.isStarting);
  const bench = squad.players.filter((p) => !p.isStarting);

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

      <h2 className="mt-6 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Starting XI</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {starting.map((player) => (
          <PlayerRow key={player.playerId} player={player} />
        ))}
      </ul>

      <h2 className="mt-6 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bench</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {bench.map((player) => (
          <PlayerRow key={player.playerId} player={player} />
        ))}
      </ul>
    </div>
  );
}
