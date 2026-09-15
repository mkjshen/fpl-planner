import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FplPicksUnavailableError, FplTeamNotFoundError, importFplTeam } from "@/lib/api";
import { Banner } from "@/components/feedback";
import { SubmitButton } from "@/components/submit-button";

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

  redirect("/dashboard?success=linked");
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
        <Banner tone="error" className="mt-4">
          Couldn&apos;t find an FPL team with that ID.
        </Banner>
      )}
      {error === "picks_unavailable" && (
        <Banner tone="error" className="mt-4">
          Found that team, but it has no squad picks published for the
          current gameweek yet. Try again after the gameweek deadline.
        </Banner>
      )}
      {error === "invalid_team_id" && (
        <Banner tone="error" className="mt-4">
          Enter a valid numeric team ID.
        </Banner>
      )}

      <form action={linkTeamAction} className="mt-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="fplTeamId" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            FPL team ID
          </label>
          <input
            id="fplTeamId"
            name="fplTeamId"
            type="number"
            inputMode="numeric"
            placeholder="e.g. 12345"
            required
            className="focus-ring rounded-md border border-black/[.08] px-3 py-2 text-sm transition-colors focus:border-primary dark:focus:border-accent dark:border-white/[.145] dark:bg-black"
          />
        </div>
        <SubmitButton
          pendingLabel="Importing…"
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          Import
        </SubmitButton>
      </form>
    </div>
  );
}
