import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FplTeamNotFoundError, getSquadForUser, importFplTeam } from "@/lib/api";
import { LinkTeamForm } from "@/components/link-team-form";
import { formatPrice, Pitch, PlayerCard } from "@/components/pitch";

async function refreshSquadAction(userId: string, fplTeamId: number) {
  "use server";

  try {
    await importFplTeam(userId, fplTeamId);
  } catch (error) {
    if (error instanceof FplTeamNotFoundError) {
      redirect("/dashboard?error=team_not_found");
    }
    throw error;
  }

  redirect("/dashboard");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const { error } = await searchParams;
  const squad = await getSquadForUser(session.user.id);

  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 px-4 py-16 dark:from-[#2a002e] dark:via-black dark:to-black">
      <div className="w-full max-w-2xl rounded-xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
        {squad ? (
          <div>
            {error === "team_not_found" && (
              <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                Couldn&apos;t refresh — your FPL team ID no longer resolves.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {squad.teamName} · {squad.managerName} · Gameweek {squad.gameweek} (current)
              </p>
              <div className="flex items-center gap-3">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Bank {formatPrice(squad.bank)} · Value {formatPrice(squad.teamValue)}
                </p>
                <form action={refreshSquadAction.bind(null, session.user.id, squad.fplTeamId)}>
                  <button
                    type="submit"
                    title="Re-pull your squad, prices, and bank from the FPL API"
                    className="rounded-md border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-primary hover:text-primary dark:border-white/[.145] dark:text-zinc-400 dark:hover:border-accent dark:hover:text-accent"
                  >
                    Refresh squad
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-6">
              <Pitch starting={squad.players.filter((p) => p.isStarting)} />
            </div>

            <h2 className="mt-6 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bench</h2>
            <div className="mt-2 flex flex-wrap justify-center gap-2 sm:gap-4">
              {squad.players
                .filter((p) => !p.isStarting)
                .sort((a, b) => a.squadPosition - b.squadPosition)
                .map((player) => (
                  <PlayerCard key={player.playerId} player={player} muted />
                ))}
            </div>
          </div>
        ) : (
          <LinkTeamForm error={error} />
        )}
      </div>
    </div>
  );
}
