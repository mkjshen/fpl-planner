import type { Position, SquadPlayer } from "@/lib/api";
import { formatPrice } from "@/components/pitch";
import { difficultyClass } from "@/lib/fdr";

const POSITION_HEADINGS: Record<Position, string> = {
  GK: "Goalkeepers",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

const ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

type Plan = {
  out: { webName: string; club: string; price: number };
  in: { webName: string; club: string; price: number };
  freeTransfers: number;
  bankBefore: number;
  bankAfter: number;
};

// The printed side of the landing page's "matchday team sheet": the same
// squad as the pitch beside it, as the list a manager actually plans from —
// grouped by position, with prices, fixtures, armbands and the bench — plus
// the plan that produced it. Display-only.
export function TeamSheet({
  gameweek,
  formation,
  players,
  plan,
  fixtureDifficulty,
}: {
  gameweek: number;
  formation: string;
  players: SquadPlayer[];
  plan: Plan;
  // FPL's 1-5 rating of each club's fixture this gameweek, keyed by club.
  fixtureDifficulty: Record<string, number>;
}) {
  const value = players.reduce((sum, p) => sum + p.currentPrice, 0);
  // Everything on the sheet describes the squad *after* the plan, so the
  // header's free transfers are what's left once it's made.
  const freeTransfersLeft = plan.freeTransfers - 1;
  const starters = players.filter((p) => p.isStarting);
  // FPL's bench order is auto-substitution priority: the goalkeeper slot,
  // then outfield subs 1-3 in squad order.
  const bench = players.filter((p) => !p.isStarting).sort((a, b) => a.squadPosition - b.squadPosition);
  const benchGoalkeeper = bench.find((p) => p.position === "GK");
  const outfieldBench = bench.filter((p) => p.position !== "GK");

  const row = (p: SquadPlayer, marker: string) => (
    <li key={p.playerId} className="flex items-center gap-2 py-1 text-sm">
      <span aria-hidden="true" className="w-6 shrink-0 text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
        {marker}
      </span>
      <span className="min-w-0 truncate font-medium text-black dark:text-zinc-50">{p.webName}</span>
      {p.isCaptain && (
        <span className="shrink-0 rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground">
          <span aria-hidden="true">C</span>
          <span className="sr-only">captain</span>
        </span>
      )}
      {p.isViceCaptain && (
        <span className="shrink-0 rounded-full border border-primary/40 px-1.5 text-xs font-bold text-primary dark:border-accent/50 dark:text-accent">
          <span aria-hidden="true">VC</span>
          <span className="sr-only">vice-captain</span>
        </span>
      )}
      {p.webName === plan.in.webName && (
        <span className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-400">New</span>
      )}
      <span
        className={`ml-auto shrink-0 rounded px-1.5 text-xs leading-5 font-semibold ${difficultyClass(
          fixtureDifficulty[p.club] ?? 3,
        )}`}
      >
        {p.opponent ?? p.club}
        <span className="sr-only">, fixture difficulty {fixtureDifficulty[p.club] ?? 3} of 5</span>
      </span>
      <span className="w-12 shrink-0 text-right tabular-nums text-black dark:text-zinc-50">
        {formatPrice(p.currentPrice)}
      </span>
    </li>
  );

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-zinc-950">
      <div className="border-b border-border px-5 py-4">
        <h3 className="flex items-baseline justify-between gap-3 text-base font-semibold text-black dark:text-zinc-50">
          Team sheet
          <span className="text-sm font-semibold tabular-nums text-zinc-600 dark:text-zinc-400">{formation}</span>
        </h3>
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-zinc-600 dark:text-zinc-400">Bank</dt>
            <dd className="font-semibold tabular-nums text-black dark:text-zinc-50">{formatPrice(plan.bankAfter)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-zinc-600 dark:text-zinc-400">Squad value</dt>
            <dd className="font-semibold tabular-nums text-black dark:text-zinc-50">{formatPrice(value)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-zinc-600 dark:text-zinc-400">Free transfers left</dt>
            <dd className="font-semibold tabular-nums text-black dark:text-zinc-50">{freeTransfersLeft}</dd>
          </div>
        </dl>
      </div>

      {/* The plan block: what planning a transfer looks like in this app —
          the move, whether it cost a hit, and the bank either side. */}
      <div className="border-b border-border bg-accent/10 px-5 py-4 dark:bg-accent/[.07]">
        <p className="text-sm font-semibold text-black dark:text-zinc-50">Gameweek {gameweek} plan</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="text-zinc-600 line-through dark:text-zinc-400">{plan.out.webName}</span>
          <span aria-hidden="true" className="text-zinc-600 dark:text-zinc-400">→</span>
          <span className="sr-only">replaced by</span>
          <span className="font-semibold text-black dark:text-zinc-50">{plan.in.webName}</span>
        </p>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
          1 of {plan.freeTransfers} free transfers, no points hit. Bank{" "}
          <span className="tabular-nums">{formatPrice(plan.bankBefore)}</span> →{" "}
          <span className="tabular-nums font-semibold">{formatPrice(plan.bankAfter)}</span>.
        </p>
      </div>

      <div className="px-5 py-3">
        {ORDER.map((position) => (
          <section key={position} aria-label={POSITION_HEADINGS[position]} className="py-2">
            <h4 className="text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
              {POSITION_HEADINGS[position]}
            </h4>
            <ul className="mt-1">
              {starters
                .filter((p) => p.position === position)
                .sort((a, b) => a.squadPosition - b.squadPosition)
                .map((p) => row(p, ""))}
            </ul>
          </section>
        ))}
        <section aria-label="Substitutes, in bench order" className="mt-1 border-t border-border py-2 pt-3">
          <h4 className="text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
            Substitutes
          </h4>
          <ol className="mt-1">
            {benchGoalkeeper && row(benchGoalkeeper, "GK")}
            {outfieldBench.map((p, i) => row(p, String(i + 1)))}
          </ol>
        </section>
      </div>
    </div>
  );
}
