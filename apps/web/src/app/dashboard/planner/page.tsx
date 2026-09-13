import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getLineup, getPlannableGameweeks, getSquadForUser } from "@/lib/api";
import { LineupPlanner } from "@/components/lineup-planner";
import { SignOutButton } from "@/components/sign-out-button";
import { Tabs } from "@/components/tabs";
import { resetAllPlansAction, saveLineupAction } from "../actions";

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
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-2xl rounded-xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
            Welcome, {session.user.name ?? session.user.email}
          </h1>
          <SignOutButton />
        </div>

        <Tabs active="planner" />

        {plannable.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
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
    <div className="mt-4">
      <LineupPlanner
        key={selectedGameweek}
        userId={userId}
        lineup={lineup}
        selectedGameweek={selectedGameweek}
        currentGameweek={currentGameweek}
        gameweekOptions={gameweekOptions}
        saveAction={saveLineupAction}
        resetAllAction={resetAllPlansAction}
      />
    </div>
  );
}
