import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FplPicksUnavailableError, FplTeamNotFoundError, getSquadForUser, importFplTeam } from "@/lib/api";
import { LinkTeamForm } from "@/components/link-team-form";
import { formatPrice, Pitch, PlayerCard, StatList } from "@/components/pitch";
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
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 px-2 py-4 sm:px-4 sm:py-16 dark:from-[#2a002e] dark:via-black dark:to-black">
      <div className="w-full max-w-5xl rounded-xl border border-border bg-white p-4 sm:p-8 dark:bg-zinc-950">
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
            <div className="border-b border-border pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
                    {squad.teamName}
                  </h1>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{squad.managerName}</p>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Gameweek {squad.gameweek} (current)
                </p>
              </div>

              <StatList
                className="mt-3"
                items={[
                  { label: "Bank", value: formatPrice(squad.bank) },
                  { label: "Value", value: formatPrice(squad.teamValue) },
                ]}
              />
            </div>

            <div className="mt-4">
              <form action={refreshSquadAction.bind(null, session.user.id, squad.fplTeamId)}>
                <SubmitButton
                  pendingLabel="Refreshing…"
                  title="Re-pull your squad, prices, and bank from the FPL API"
                  className="focus-ring rounded-full border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-60 dark:hover:bg-[#1a1a1a]"
                >
                  Refresh squad
                </SubmitButton>
              </form>
            </div>

            <div className="mt-6">
              <Pitch starting={squad.players.filter((p) => p.isStarting)} />
            </div>

            <h2 className="mt-6 text-lg font-semibold text-black dark:text-zinc-50">Bench</h2>
            <div className="mt-2 flex justify-center gap-1 rounded-2xl border border-border bg-black/[.03] p-3 sm:gap-2 sm:p-4 xl:gap-6 dark:bg-white/[.04]">
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
