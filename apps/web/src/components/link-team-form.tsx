import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FplPicksUnavailableError, FplTeamNotFoundError, importFplTeam } from "@/lib/api";

async function linkTeamAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const raw = formData.get("fplTeamId");
  const fplTeamId = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isInteger(fplTeamId) || fplTeamId <= 0) {
    redirect("/dashboard?error=invalid_team_id");
  }

  try {
    await importFplTeam(session.user.id, fplTeamId);
  } catch (error) {
    if (error instanceof FplTeamNotFoundError) {
      redirect("/dashboard?error=team_not_found");
    }
    if (error instanceof FplPicksUnavailableError) {
      redirect("/dashboard?error=picks_unavailable");
    }
    throw error;
  }

  redirect("/dashboard");
}

export function LinkTeamForm({ error }: { error?: string }) {
  return (
    <div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Enter your FPL team ID to import your squad. Find it in the URL when
        viewing your team on the official FPL site (
        <code className="rounded bg-black/[.06] px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/[.08]">
          fantasy.premierleague.com/entry/&lt;id&gt;/...
        </code>
        ).
      </p>

      {error === "team_not_found" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Couldn&apos;t find an FPL team with that ID.
        </p>
      )}
      {error === "picks_unavailable" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Found that team, but it has no squad picks published for the
          current gameweek yet. Try again after the gameweek deadline.
        </p>
      )}
      {error === "invalid_team_id" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Enter a valid numeric team ID.
        </p>
      )}

      <form action={linkTeamAction} className="mt-6 flex gap-3">
        <input
          name="fplTeamId"
          type="number"
          inputMode="numeric"
          placeholder="e.g. 12345"
          required
          className="flex-1 rounded-md border border-black/[.08] px-3 py-2 text-sm outline-none transition-colors focus:border-primary dark:focus:border-accent dark:border-white/[.145] dark:bg-black"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          Import
        </button>
      </form>
    </div>
  );
}
