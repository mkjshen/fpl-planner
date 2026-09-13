import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getLineup, getPlannableGameweeks, getSquadForUser } from "@/lib/api";
import { LinkTeamForm } from "@/components/link-team-form";
import { LineupPlanner } from "@/components/lineup-planner";
import { resetAllPlansAction, saveLineupAction } from "./actions";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; gameweek?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const { error, gameweek } = await searchParams;
  const squad = await getSquadForUser(session.user.id);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-2xl rounded-xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
            Welcome, {session.user.name ?? session.user.email}
          </h1>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="whitespace-nowrap rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Sign out
            </button>
          </form>
        </div>

        {squad ? (
          <DashboardLineup
            userId={session.user.id}
            squadGameweek={squad.gameweek}
            requestedGameweek={gameweek}
          />
        ) : (
          <LinkTeamForm error={error} />
        )}
      </div>
    </div>
  );
}

async function DashboardLineup({
  userId,
  squadGameweek,
  requestedGameweek,
}: {
  userId: string;
  squadGameweek: number;
  requestedGameweek?: string;
}) {
  const { currentGameweek, plannable } = await getPlannableGameweeks(userId);
  const selectedGameweek = requestedGameweek
    ? Number.parseInt(requestedGameweek, 10)
    : (currentGameweek ?? squadGameweek);

  const lineup = await getLineup(userId, selectedGameweek);
  if (!lineup) {
    redirect("/dashboard");
  }

  const gameweekOptions = [
    ...(currentGameweek !== null
      ? [{ number: currentGameweek, label: `Gameweek ${currentGameweek} (current)` }]
      : []),
    ...plannable.map((gw) => ({ number: gw.number, label: `Gameweek ${gw.number}` })),
  ];

  return (
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
  );
}
