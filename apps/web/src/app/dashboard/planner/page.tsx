import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getLineup, getPlannableGameweeks, getSquadForUser } from "@/lib/api";
import { LineupPlanner, type PlannerNotice } from "@/components/lineup-planner";
import {
  getPlayerProfileAction,
  getSuggestedTransfersAction,
  refreshSquadAction,
  resetAllPlansAction,
  saveLineupAction,
  searchPlayersAction,
} from "../actions";

// Outcomes of linking or refreshing the team, which arrive here as a
// redirect's query params (both are server actions) and show as a banner.
const NOTICES: Record<string, PlannerNotice> = {
  linked: { tone: "success", message: "Team linked — your squad is up to date." },
  refreshed: { tone: "success", message: "Squad refreshed." },
  team_not_found: { tone: "error", message: "Couldn't refresh — your FPL team ID no longer resolves." },
  picks_unavailable: {
    tone: "error",
    message: "Couldn't refresh — no squad picks published for the current gameweek yet. Try again after the deadline.",
  },
};

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ gameweek?: string; success?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const squad = await getSquadForUser(session.user.id);
  if (!squad) {
    redirect("/dashboard");
  }

  const { gameweek, success, error } = await searchParams;
  const { currentGameweek, plannable } = await getPlannableGameweeks(session.user.id);

  // The current gameweek leads the list, read-only: it's the real squad as
  // last imported (what the separate Squad page used to show), one step
  // before the gameweeks that can actually be planned.
  const gameweekOptions = [
    ...(currentGameweek !== null ? [{ number: currentGameweek, label: `Gameweek ${currentGameweek}` }] : []),
    ...plannable
      .filter((gw) => gw.number !== currentGameweek)
      .map((gw) => ({ number: gw.number, label: `Gameweek ${gw.number}` })),
  ];
  if (gameweekOptions.length === 0) {
    return (
      <PlannerShell>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No gameweeks to show for this season.</p>
      </PlannerShell>
    );
  }

  // Default: the next gameweek to plan. "current" (used after linking or
  // refreshing the team) and any explicit number must be one on offer.
  const fallback = plannable[0]?.number ?? gameweekOptions[0].number;
  const requested =
    gameweek === "current" ? currentGameweek : gameweek ? Number.parseInt(gameweek, 10) : fallback;
  if (requested === null || !gameweekOptions.some((gw) => gw.number === requested)) {
    redirect("/dashboard/planner");
  }

  const lineup = await getLineup(session.user.id, requested);
  if (!lineup) {
    redirect("/dashboard/planner");
  }

  return (
    <PlannerShell>
      <LineupPlanner
        key={requested}
        userId={session.user.id}
        lineup={lineup}
        selectedGameweek={requested}
        currentGameweek={currentGameweek}
        nextPlannableGameweek={plannable[0]?.number ?? null}
        gameweekOptions={gameweekOptions}
        notice={NOTICES[success ?? ""] ?? NOTICES[error ?? ""] ?? null}
        refreshAction={refreshSquadAction.bind(null, session.user.id, squad.fplTeamId)}
        saveAction={saveLineupAction}
        resetAllAction={resetAllPlansAction}
        searchAction={searchPlayersAction}
        profileAction={getPlayerProfileAction}
        suggestionsAction={getSuggestedTransfersAction}
      />
    </PlannerShell>
  );
}

function PlannerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 px-2 py-4 sm:px-4 sm:py-16 dark:from-[#2a002e] dark:via-black dark:to-black">
      <div className="w-full max-w-7xl rounded-xl border border-border bg-white p-4 sm:p-8 dark:bg-zinc-950">
        {children}
      </div>
    </div>
  );
}
