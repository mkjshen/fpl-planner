import Image from "next/image";
import type { Position, SquadPlayer } from "@/lib/api";

export function formatPrice(tenthsOfMillion: number): string {
  return `£${(tenthsOfMillion / 10).toFixed(1)}m`;
}

// Hotlinked from the official FPL site's own static assets — the same
// shirt images fantasy.premierleague.com uses on its own squad view — not
// a copy we host ourselves. Goalkeepers get a distinct "_1" kit variant.
function shirtUrl(clubCode: number, position: Position): string {
  const suffix = position === "GK" ? "_1" : "";
  return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${clubCode}${suffix}-66.png`;
}

export function PlayerCard({
  player,
  muted,
  selected,
  disabled,
  blank,
  onClick,
  onRemove,
}: {
  player: SquadPlayer;
  muted?: boolean;
  selected?: boolean;
  disabled?: boolean;
  // True while this player has been transferred out but a replacement
  // hasn't been picked yet — renders an empty placeholder in their slot
  // instead of their (stale) card, matching how the real FPL transfer
  // screen shows a blank shirt outline mid-transfer.
  blank?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  if (blank) {
    return (
      <div className="flex w-20 flex-col items-center rounded-lg border-2 border-dashed border-black/[.15] px-1.5 py-2 text-center sm:w-24 dark:border-white/[.2]">
        <div className="mb-1 h-8 w-8 rounded-full border-2 border-dashed border-black/[.15] dark:border-white/[.2]" />
        <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-600">Empty</span>
        <span className="text-[0.65rem] text-zinc-400 dark:text-zinc-600">Pick a player</span>
      </div>
    );
  }

  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`group relative flex w-20 flex-col items-center rounded-lg border px-1.5 py-2 text-center shadow-sm sm:w-24 ${
        selected
          ? "border-primary ring-2 ring-primary dark:border-accent dark:ring-accent"
          : muted
            ? "border-black/[.08] bg-white/70 dark:border-white/[.1] dark:bg-zinc-900/70"
            : "border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-900"
      } ${disabled ? "cursor-not-allowed opacity-40" : onClick ? "cursor-pointer" : ""}`}
    >
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${player.webName} from your team`}
          title="Remove from team"
          className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full border border-black/[.15] bg-white text-[0.65rem] font-bold text-zinc-500 opacity-100 transition focus:opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:border-red-600 hover:bg-red-600 hover:text-white dark:border-white/[.2] dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white"
        >
          ×
        </button>
      )}
      {(player.isCaptain || player.isViceCaptain) && (
        <span
          className={`absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-[0.6rem] font-bold ${
            player.isCaptain
              ? "bg-accent text-accent-foreground"
              : "border border-primary/40 bg-white text-primary dark:border-accent/50 dark:bg-zinc-900 dark:text-accent"
          }`}
        >
          {player.isCaptain ? "C" : "VC"}
        </span>
      )}
      {player.clubCode !== null && (
        <Image
          src={shirtUrl(player.clubCode, player.position)}
          alt=""
          width={32}
          height={32}
          className="mb-1 h-8 w-8 object-contain"
        />
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

export function Pitch({
  starting,
  selectedPlayerId,
  disabledPlayerIds,
  blankPlayerId,
  onPlayerClick,
  onPlayerRemove,
}: {
  starting: SquadPlayer[];
  selectedPlayerId?: number | null;
  disabledPlayerIds?: Set<number>;
  blankPlayerId?: number | null;
  onPlayerClick?: (player: SquadPlayer) => void;
  onPlayerRemove?: (player: SquadPlayer) => void;
}) {
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
              <PlayerCard
                key={player.playerId}
                player={player}
                selected={player.playerId === selectedPlayerId}
                disabled={disabledPlayerIds?.has(player.playerId)}
                blank={player.playerId === blankPlayerId}
                onClick={onPlayerClick ? () => onPlayerClick(player) : undefined}
                onRemove={onPlayerRemove ? () => onPlayerRemove(player) : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
