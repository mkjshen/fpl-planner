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
  const typed = typeof raw === "string" ? raw.trim() : "";
  const fplTeamId = Number.parseInt(typed, 10);
  // Errors come back as a redirect, so the ID rides along in the URL and
  // refills the input — a typo stays fixable instead of being wiped. (A
  // public FPL team ID, not anything sensitive.)
  const withTyped = (error: string) =>
    `/dashboard?error=${error}&teamId=${encodeURIComponent(typed.slice(0, 12))}`;
  if (!Number.isInteger(fplTeamId) || fplTeamId <= 0) {
    redirect(withTyped("invalid_team_id"));
  }

  try {
    await importFplTeam(session.user.id, fplTeamId);
  } catch (error) {
    if (error instanceof FplTeamNotFoundError) {
      redirect(withTyped("team_not_found"));
    }
    if (error instanceof FplPicksUnavailableError) {
      redirect(withTyped("picks_unavailable"));
    }
    throw error;
  }

  // Straight to the planner's current gameweek: the imported squad, read-only,
  // with the next gameweek one click away.
  redirect("/dashboard/planner?gameweek=current&success=linked");
}

export function LinkTeamForm({ error, teamId }: { error?: string; teamId?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Link your FPL team</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Enter your FPL team ID to import your squad. Find it in the URL when
        viewing your team on the official FPL site (
        <code className="rounded bg-black/[.06] px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/[.08]">
          fantasy.premierleague.com/entry/&lt;id&gt;/...
        </code>
        ).
      </p>

      {error === "team_not_found" && (
        <Banner tone="error" className="mt-4" id="team-id-error">
          Couldn&apos;t find an FPL team with that ID.
        </Banner>
      )}
      {error === "picks_unavailable" && (
        <Banner tone="error" className="mt-4" id="team-id-error">
          Found that team, but it has no squad picks published for the
          current gameweek yet. Try again after the gameweek deadline.
        </Banner>
      )}
      {error === "invalid_team_id" && (
        <Banner tone="error" className="mt-4" id="team-id-error">
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
            defaultValue={teamId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "team-id-error" : undefined}
            className="focus-ring rounded-md border border-border px-3 py-2 text-sm transition-colors focus:border-primary dark:focus:border-accent dark:bg-black"
          />
        </div>
        <SubmitButton
          pendingLabel="Importing…"
          className="focus-ring rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60 dark:bg-accent dark:text-accent-foreground dark:hover:bg-accent/90"
        >
          Import
        </SubmitButton>
      </form>
    </div>
  );
}
