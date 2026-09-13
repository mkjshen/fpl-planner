import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getSquadForUser } from "@/lib/api";
import { LinkTeamForm } from "@/components/link-team-form";
import { formatPrice, Pitch, PlayerCard } from "@/components/pitch";

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
          <div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {squad.teamName} · {squad.managerName} · Gameweek {squad.gameweek} (current)
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Bank {formatPrice(squad.bank)} · Value {formatPrice(squad.teamValue)}
              </p>
            </div>

            <div className="mt-3">
              <Link
                href="/dashboard/planner"
                className="text-sm font-medium text-black underline decoration-dotted hover:decoration-solid dark:text-zinc-50"
              >
                Plan future gameweeks →
              </Link>
            </div>

            <div className="mt-6">
              <Pitch starting={squad.players.filter((p) => p.isStarting)} />
            </div>

            <h2 className="mt-6 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bench</h2>
            <div className="mt-2 flex flex-wrap gap-2 sm:gap-4">
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
