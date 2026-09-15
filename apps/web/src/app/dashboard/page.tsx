import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FplPicksUnavailableError, FplTeamNotFoundError, getSquadForUser, importFplTeam } from "@/lib/api";
import { LinkTeamForm } from "@/components/link-team-form";
import { formatPrice, Pitch, PlayerCard, StatChip } from "@/components/pitch";
import { Banner } from "@/components/feedback";
import { SubmitButton } from "@/components/submit-button";

async function refreshSquadAction(userId: string, fplTeamId: number) {
  "use server";

  try {
    await importFplTeam(userId, fplTeamId);
  } catch (error) {
    if (error instanceof FplTeamNotFoundError) {
      redirect("/dashboard?error=team_not_found");
    }
    if (error instanceof FplPicksUnavailableError) {
      redirect("/dashboard?error=picks_unavailable");
    }
    throw error;
  }

  redirect("/dashboard?success=refreshed");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const { error, success } = await searchParams;
  const squad = await getSquadForUser(session.user.id);

  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 px-4 py-16 dark:from-[#2a002e] dark:via-black dark:to-black">
      <div className="w-full max-w-5xl rounded-xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
        {squad ? (
          <div>
            {error === "team_not_found" && (
              <Banner tone="error" className="mb-4">
                Couldn&apos;t refresh — your FPL team ID no longer resolves.
              </Banner>
            )}
            {error === "picks_unavailable" && (
              <Banner tone="error" className="mb-4">
                Couldn&apos;t refresh — no squad picks published for the current
                gameweek yet. Try again after the deadline.
              </Banner>
            )}
            {success === "linked" && (
              <Banner tone="success" className="mb-4">
                Team linked — your squad is up to date.
              </Banner>
            )}
            {success === "refreshed" && (
              <Banner tone="success" className="mb-4">
                Squad refreshed.
              </Banner>
            )}
            <div className="border-b border-black/[.08] pb-4 dark:border-white/[.145]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
                    {squad.teamName}
                  </h1>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{squad.managerName}</p>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Gameweek {squad.gameweek} (current)
                </p>
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <StatChip label="Bank" value={formatPrice(squad.bank)} />
                <StatChip label="Value" value={formatPrice(squad.teamValue)} />
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              <form action={refreshSquadAction.bind(null, session.user.id, squad.fplTeamId)}>
                <SubmitButton
                  pendingLabel="Refreshing…"
                  title="Re-pull your squad, prices, and bank from the FPL API"
                  className="rounded text-xs font-medium text-zinc-500 underline decoration-dotted hover:text-zinc-700 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Refresh squad
                </SubmitButton>
              </form>
            </div>

            <div className="mt-6">
              <Pitch starting={squad.players.filter((p) => p.isStarting)} />
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-2 rounded-2xl border border-black/[.08] bg-black/[.03] p-4 xl:gap-6 dark:border-white/[.145] dark:bg-white/[.04]">
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
