import Image from "next/image";
import type { Position, SquadPlayer } from "@/lib/api";

export function formatPrice(tenthsOfMillion: number): string {
  return `£${(tenthsOfMillion / 10).toFixed(1)}m`;
}

// A single bordered "label over value" stat card — used for Bank/Value/Free
// Transfers/Cost on both the Squad and Planner headers, so the two stay
// visually consistent.
export function StatChip({
  label,
  value,
  negative,
  title,
}: {
  label: string;
  value: string;
  negative?: boolean;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="rounded-lg border border-border bg-black/[.02] px-3 py-1.5 dark:bg-white/[.03]"
    >
      <p className="text-[0.65rem] font-medium tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`text-sm font-semibold ${
          negative ? "text-red-600 dark:text-red-400" : "text-black dark:text-zinc-50"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// Hotlinked from the official FPL site's own static assets — the same
// shirt images fantasy.premierleague.com uses on its own squad view — not
// a copy we host ourselves. Goalkeepers get a distinct "_1" kit variant.
export function shirtUrl(clubCode: number, position: Position): string {
  const suffix = position === "GK" ? "_1" : "";
  return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${clubCode}${suffix}-66.png`;
}

// Same official static assets as the shirt images — the FPL site's own
// player headshots, keyed by the numeric code in the API's "photo" field
// (not the player or club id).
export function playerPhotoUrl(photoCode: number): string {
  return `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photoCode}.png`;
}

export function PlayerCard({
  player,
  muted,
  selected,
  disabled,
  blank,
  activeBlank,
  onClick,
  onRemove,
  onActivate,
}: {
  player: SquadPlayer;
  muted?: boolean;
  selected?: boolean;
  disabled?: boolean;
  // True while this player has been transferred out but a replacement
  // hasn't been picked yet — renders an empty placeholder in their slot
  // instead of their (stale) card, matching how the real FPL transfer
  // screen shows a blank shirt outline mid-transfer. Multiple cards can be
  // blank at once (several pending transfers-out in the same unsaved plan).
  blank?: boolean;
  // True when this blank slot is the one the transfer-in panel is
  // currently searching a replacement for — only meaningful when `blank`.
  activeBlank?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  // Only used when `blank`: clicking an inactive blank slot switches the
  // transfer-in panel to search a replacement for this one instead.
  onActivate?: () => void;
}) {
  // Styled after the official FPL pitch view: no big bordered card box —
  // just a shirt "standing" on the pitch with a couple of small pill labels
  // underneath, each with its own opaque light/dark bg (matching the site
  // theme, not the always-white labels FPL itself uses) so they stay
  // legible against both the green pitch and the plain page background
  // (the bench) without needing a whole boxed card to do that job.
  if (blank) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className={`focus-ring flex w-20 flex-col items-center text-center xl:w-32 ${
          onActivate ? "cursor-pointer" : ""
        }`}
      >
        <div
          className={`h-10 w-10 rounded-full border-2 border-dashed xl:h-14 xl:w-14 ${
            activeBlank ? "border-primary dark:border-accent" : "border-black/20 dark:border-white/30"
          }`}
        />
        <span
          className={`mt-1.5 w-full truncate rounded-md border px-2 py-0.5 text-xs font-bold shadow-sm xl:px-2.5 xl:py-1 xl:text-sm ${
            activeBlank
              ? "border-primary bg-primary/10 text-primary dark:border-accent dark:bg-accent/10 dark:text-accent"
              : "border-black/10 bg-white text-zinc-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-500"
          }`}
        >
          Empty
        </span>
        <span className="mt-0.5 w-full truncate rounded-md border border-black/5 bg-zinc-100 px-2 py-0.5 text-[0.65rem] font-medium text-zinc-600 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-400 xl:text-xs">
          {activeBlank ? "Pick a player" : "Tap to fill"}
        </span>
      </button>
    );
  }

  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`group relative flex w-20 flex-col items-center text-center xl:w-32 ${
        muted ? "opacity-80" : ""
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
          className="focus-ring absolute -top-1.5 -left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-black/[.15] bg-white/80 text-[0.65rem] font-bold text-zinc-500 opacity-100 shadow-sm backdrop-blur-sm transition focus:opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:border-red-600 hover:bg-red-600 hover:text-white dark:border-white/[.2] dark:bg-zinc-900/80 dark:text-zinc-400 dark:hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white xl:-top-2 xl:-left-2 xl:h-6 xl:w-6 xl:text-xs"
        >
          ×
        </button>
      )}
      {(player.isCaptain || player.isViceCaptain) && (
        <span
          className={`absolute -top-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[0.6rem] font-bold shadow-sm xl:-top-2 xl:-right-2 xl:h-6 xl:w-6 xl:text-xs ${
            player.isCaptain
              ? "bg-accent text-accent-foreground"
              : "border border-primary/40 bg-white text-primary dark:border-accent/50 dark:bg-zinc-900 dark:text-accent"
          }`}
        >
          {player.isCaptain ? "C" : "VC"}
        </span>
      )}
      <div className="flex w-full flex-col items-center overflow-hidden rounded-2xl bg-white/40 pt-1.5 backdrop-blur-sm dark:bg-black/30 xl:rounded-3xl xl:pt-2">
        <span className="text-[0.65rem] font-semibold text-zinc-700 drop-shadow-sm dark:text-zinc-200 xl:text-xs">
          {formatPrice(player.currentPrice)}
        </span>
        {player.clubCode !== null && (
          // alt="" is deliberate, not an oversight — the player's name is
          // always rendered as adjacent visible text right below, so a
          // descriptive alt here would just be redundant noise for screen
          // readers.
          <Image
            src={shirtUrl(player.clubCode, player.position)}
            alt=""
            width={56}
            height={56}
            className="h-10 w-10 object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.4)] xl:h-14 xl:w-14"
          />
        )}
        <span
          className={`mt-1.5 w-full truncate rounded-t-md border border-b-0 px-2 py-0.5 text-xs font-bold shadow-sm xl:px-2.5 xl:py-1 xl:text-sm ${
            selected
              ? "border-primary bg-primary text-white dark:border-accent dark:bg-accent dark:text-accent-foreground"
              : "border-black/10 bg-white text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50"
          }`}
        >
          {player.webName}
        </span>
        <span className="w-full truncate rounded-b-2xl border border-black/5 bg-zinc-100 px-2 py-0.5 text-[0.65rem] font-medium text-zinc-600 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-300 xl:rounded-b-3xl xl:text-xs">
          {player.actualPoints != null
            ? `${player.actualPoints} pt${player.actualPoints === 1 ? "" : "s"}`
            : (player.opponent ?? player.club)}
        </span>
      </div>
    </div>
  );
}

const PITCH_ROWS: Position[] = ["GK", "DEF", "MID", "FWD"];

// A forced-perspective trapezoid: narrower at the top (goalkeeper's end,
// "far away") and full width at the bottom (attackers, "closest to you") —
// mimics standing behind your own box looking up the pitch instead of a
// bird's-eye view. Just the pitch shape itself; player card sizes are left
// alone. A real CSS 3D transform (perspective + rotateX) would sell the
// depth more dramatically, but it distorts and skews the pill text/shirt
// images inside each card — a plain clip-path keeps every card upright and
// legible while still reading as "looking down the pitch."
const PITCH_TOP_INSET = 12;

const PITCH_CLIP_PATH = `polygon(${PITCH_TOP_INSET}% 0%, ${100 - PITCH_TOP_INSET}% 0%, 100% 100%, 0% 100%)`;

// How many x-percentage-points the pitch's own side edges shift per
// y-percentage-point — i.e. the trapezoid's slope. The goal box and
// six-yard box are drawn with their sides on this same slope (open at the
// goal line, y=0) so they narrow toward the goalkeeper exactly in step
// with the pitch itself, instead of sitting inside it as plain rectangles.
const PITCH_SLOPE = PITCH_TOP_INSET / 100;

// SVG polyline points (in the 0-100 percent coordinate space used
// throughout this file) for a box of the given height (from the goal line
// at y=0) and width at its bottom edge, centered horizontally, with sides
// parallel to the pitch's own touchlines. Left-open (no top segment) since
// the goal line itself is the pitch's own clipped top edge.
function trapezoidBoxPoints(heightPercent: number, widthAtBottomPercent: number): string {
  const halfBottom = widthAtBottomPercent / 2;
  const leftBottom = 50 - halfBottom;
  const rightBottom = 50 + halfBottom;
  const leftTop = leftBottom + PITCH_SLOPE * heightPercent;
  const rightTop = rightBottom - PITCH_SLOPE * heightPercent;
  return `${leftTop},0 ${leftBottom},${heightPercent} ${rightBottom},${heightPercent} ${rightTop},0`;
}

export function Pitch({
  starting,
  selectedPlayerId,
  disabledPlayerIds,
  blankPlayerIds,
  activeBlankPlayerId,
  onPlayerClick,
  onPlayerRemove,
  onBlankActivate,
}: {
  starting: SquadPlayer[];
  selectedPlayerId?: number | null;
  disabledPlayerIds?: Set<number>;
  blankPlayerIds?: Set<number>;
  activeBlankPlayerId?: number | null;
  onPlayerClick?: (player: SquadPlayer) => void;
  onPlayerRemove?: (player: SquadPlayer) => void;
  onBlankActivate?: (player: SquadPlayer) => void;
}) {
  const byPosition = (position: Position) =>
    starting.filter((p) => p.position === position).sort((a, b) => a.squadPosition - b.squadPosition);

  return (
    <div
      // A trapezoid clip-path narrower at the top (see PITCH_CLIP_PATH)
      // does the actual "looking down the pitch toward the goalkeeper"
      // perspective shift; the layered gradients + shadows on top of that
      // add a domed, floodlit feel — a soft highlight glowing in from the
      // top, the far/bottom edge and corners sinking into shadow, and an
      // outer drop shadow lifting the whole pitch off the page. No border
      // here: a plain CSS border can't follow the clipped diagonal edges,
      // only the (now-narrower) top and (still full-width) bottom ones.
      className="relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.15),inset_0_40px_50px_-20px_rgba(0,0,0,0.25),inset_0_-50px_70px_-15px_rgba(0,0,0,0.45),inset_40px_0_50px_-35px_rgba(0,0,0,0.2),inset_-40px_0_50px_-35px_rgba(0,0,0,0.2),0_25px_50px_-12px_rgba(0,0,0,0.45)]"
      style={{
        clipPath: PITCH_CLIP_PATH,
        backgroundImage: [
          "repeating-linear-gradient(180deg, #3d8c40 0, #3d8c40 12.5%, #439648 12.5%, #439648 25%)",
          "radial-gradient(120% 55% at 50% 0%, rgba(255,255,255,0.18), rgba(255,255,255,0) 65%)",
          "radial-gradient(140% 90% at 50% 100%, rgba(0,0,0,0.3), rgba(0,0,0,0) 55%)",
        ].join(", "),
      }}
    >
      {/* Pitch markings — halfway line, center circle, and the goal-end box
          behind the goalkeeper row — purely decorative, so pointer-events
          are disabled and every card interaction still lands on the real
          player cards painted above via z-10. Sized/positioned as percents
          of the untrimmed box, so the trapezoid clip-path above naturally
          cuts them to the same silhouette as the pitch itself. */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-x-0 top-1/2 border-t border-white/25" />
        <div className="absolute top-1/2 left-1/2 aspect-square w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
        <div className="absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25" />
        {/* Goal box + six-yard box, drawn in perspective (see
            trapezoidBoxPoints) rather than as plain rectangles, so their
            sides narrow toward the goal line on the same slope as the
            pitch's own touchlines. */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polyline
            points={trapezoidBoxPoints(16, 64)}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={trapezoidBoxPoints(7, 34)}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col justify-between gap-4 px-2 py-10 sm:px-6">
        {PITCH_ROWS.map((position) => (
          <div key={position} className="flex flex-wrap items-center justify-center gap-2 xl:gap-6">
            {byPosition(position).map((player) => (
              <PlayerCard
                key={player.playerId}
                player={player}
                selected={player.playerId === selectedPlayerId}
                disabled={disabledPlayerIds?.has(player.playerId)}
                blank={blankPlayerIds?.has(player.playerId)}
                activeBlank={player.playerId === activeBlankPlayerId}
                onClick={onPlayerClick ? () => onPlayerClick(player) : undefined}
                onRemove={onPlayerRemove ? () => onPlayerRemove(player) : undefined}
                onActivate={onBlankActivate ? () => onBlankActivate(player) : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
