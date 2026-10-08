import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSquadForUser } from "@/lib/api";
import { LinkTeamForm } from "@/components/link-team-form";

// The first-run step: link an FPL team. Once a team is linked there's
// nothing separate to show here — the squad lives in the planner, whose
// current-gameweek view is the read-only "your real squad" page this used to
// be — so a linked user goes straight there.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; teamId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const { error, teamId } = await searchParams;
  const squad = await getSquadForUser(session.user.id);
  if (squad) {
    redirect("/dashboard/planner?gameweek=current");
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 px-2 py-4 sm:px-4 sm:py-16 dark:from-[#2a002e] dark:via-black dark:to-black">
      <div className="w-full max-w-5xl rounded-xl border border-border bg-white p-4 sm:p-8 dark:bg-zinc-950">
        <LinkTeamForm error={error} teamId={teamId} />
      </div>
    </div>
  );
}
