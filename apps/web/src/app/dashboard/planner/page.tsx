import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getLineup, getPlannableGameweeks, getSquadForUser } from "@/lib/api";
import { LineupPlanner } from "@/components/lineup-planner";
import { resetAllPlansAction, saveLineupAction, searchPlayersAction } from "../actions";

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ gameweek?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const squad = await getSquadForUser(session.user.id);
  if (!squad) {
    redirect("/dashboard");
  }

  const { gameweek } = await searchParams;
  const { currentGameweek, plannable } = await getPlannableGameweeks(session.user.id);

  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 px-4 py-16 dark:from-[#2a002e] dark:via-black dark:to-black">
      <div className="w-full max-w-5xl rounded-xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
        {plannable.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No future gameweeks left to plan this season.
          </p>
        ) : (
          <PlannerLineup
            userId={session.user.id}
            currentGameweek={currentGameweek}
            plannable={plannable}
            requestedGameweek={gameweek}
          />
        )}
      </div>
    </div>
  );
}

async function PlannerLineup({
  userId,
  currentGameweek,
  plannable,
  requestedGameweek,
}: {
  userId: string;
  currentGameweek: number | null;
  plannable: { number: number }[];
  requestedGameweek?: string;
}) {
  const selectedGameweek = requestedGameweek
    ? Number.parseInt(requestedGameweek, 10)
    : plannable[0].number;

  const lineup = await getLineup(userId, selectedGameweek);
  if (!lineup) {
    redirect("/dashboard/planner");
  }

  const gameweekOptions = plannable.map((gw) => ({
    number: gw.number,
    label: `Gameweek ${gw.number}`,
  }));

  return (
    <div>
      <LineupPlanner
        key={selectedGameweek}
        userId={userId}
        lineup={lineup}
        selectedGameweek={selectedGameweek}
        currentGameweek={currentGameweek}
        gameweekOptions={gameweekOptions}
        saveAction={saveLineupAction}
        resetAllAction={resetAllPlansAction}
        searchAction={searchPlayersAction}
      />
    </div>
  );
}
