import Link from "next/link";
import { auth } from "@/auth";
import { benchTags, Pitch, PlayerCard } from "@/components/pitch";
import { TeamSheet } from "@/components/team-sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  SAMPLE_FIXTURE_DIFFICULTY,
  SAMPLE_FORMATION,
  SAMPLE_GAMEWEEK,
  SAMPLE_PLAN,
  SAMPLE_SQUAD,
} from "@/lib/sample-squad";

// The public landing page, laid out as a sample squad's matchday team sheet:
// the app's real Pitch component beside the printed list a manager plans
// from. Two paths from the first screen — import your own team, or look at
// the sample right here without signing up. The sample is fixed data
// (lib/sample-squad.ts), labelled as such, so this page makes no FPL API
// calls and never shows a real manager's team.
export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user);
  const sampleBench = SAMPLE_SQUAD.filter((p) => !p.isStarting).sort((a, b) => a.squadPosition - b.squadPosition);

  return (
    <div className="flex flex-1 flex-col bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 dark:from-[#2a002e] dark:via-black dark:to-black">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6 sm:py-3">
        <span className="text-sm font-semibold text-black dark:text-zinc-50">FPL Team Planner</span>
        <div className="flex items-center gap-2">
          <ThemeToggle variant="inline" />
          <Link
            href={signedIn ? "/dashboard" : "/sign-in"}
            className="focus-ring rounded-full px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[.04] hover:text-black dark:text-zinc-300 dark:hover:bg-[#1a1a1a] dark:hover:text-zinc-50"
          >
            {signedIn ? "Your dashboard" : "Sign in"}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-2 pb-16 sm:px-6 sm:pt-6">
        <section aria-labelledby="landing-title" className="max-w-3xl">
          <h1
            id="landing-title"
            className="text-3xl font-semibold tracking-tight text-balance text-black sm:text-5xl dark:text-zinc-50"
          >
            Plan your FPL transfers before the deadline.
          </h1>
          <p className="mt-3 max-w-[60ch] text-base leading-7 text-zinc-700 sm:mt-4 sm:text-lg dark:text-zinc-300">
            Import your squad with your FPL team ID, no FPL login needed. Then plan transfers, chips
            and captaincy for the gameweeks ahead, with free transfers and the −4 hit counted for you.
          </p>
          <div className="mt-5 flex gap-2 sm:mt-6 sm:gap-3">
            <Link
              href={signedIn ? "/dashboard" : "/sign-up"}
              className="focus-ring rounded-full bg-primary px-4 py-3 text-sm font-semibold whitespace-nowrap sm:px-6 text-white transition-colors hover:bg-primary-hover dark:bg-accent dark:text-accent-foreground dark:hover:bg-accent/90"
            >
              {signedIn ? "Go to your team" : "Import your team"}
            </Link>
            <a
              href="#sample-squad"
              className="focus-ring rounded-full border border-primary/40 px-4 py-3 text-sm font-semibold whitespace-nowrap sm:px-6 text-primary transition-colors hover:bg-primary/[.06] dark:border-accent/50 dark:text-accent dark:hover:bg-accent/10"
            >
              See the sample squad
            </a>
          </div>
        </section>

        <section id="sample-squad" aria-labelledby="sample-title" className="mt-8 scroll-mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="sample-title" className="text-lg font-semibold text-black sm:text-xl dark:text-zinc-50">
              Sample squad, Gameweek {SAMPLE_GAMEWEEK}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Illustrative example, not a real manager&rsquo;s team.
            </p>
          </div>
          <div className="mt-3 grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Pitch starting={SAMPLE_SQUAD.filter((p) => p.isStarting)} />
              {/* The sample's bench, in auto-sub order, as in the planner —
                  the team sheet lists it, so the pitch shouldn't drop it. */}
              <h3 className="mt-5 text-base font-semibold text-black dark:text-zinc-50">Bench</h3>
              <div className="mt-2 flex justify-center gap-1 rounded-2xl border border-border bg-black/[.03] p-3 sm:gap-2 sm:p-4 xl:gap-6 dark:bg-white/[.04]">
                {sampleBench.map((player, index) => (
                  <PlayerCard key={player.playerId} player={player} muted benchTag={benchTags(sampleBench)[index]} />
                ))}
              </div>
            </div>
            <div className="lg:col-span-5">
              <TeamSheet
                gameweek={SAMPLE_GAMEWEEK}
                formation={SAMPLE_FORMATION}
                players={SAMPLE_SQUAD}
                plan={SAMPLE_PLAN}
                fixtureDifficulty={SAMPLE_FIXTURE_DIFFICULTY}
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-zinc-600 sm:px-6 dark:text-zinc-400">
          <span className="block max-w-[65ch]">
          An independent planner for classic Fantasy Premier League. Not affiliated with the Premier
          League or Fantasy Premier League.
          </span>
        </p>
      </footer>
    </div>
  );
}
