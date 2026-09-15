// Shown automatically by Next.js while the planner page awaits its data —
// this is the single most-clicked interaction with the worst prior
// feedback (prev/next gameweek re-fetches via router.push with nothing
// shown while it loads). Echoes the real two-column layout (squad +
// transfer panel) instead of freezing with no indication anything changed.
export default function PlannerLoading() {
  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 px-4 py-16 dark:from-[#2a002e] dark:via-black dark:to-black">
      <div className="w-full max-w-7xl animate-pulse rounded-xl border border-border bg-white p-8 dark:bg-zinc-950">
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="min-w-0 flex-1">
            <div className="border-b border-border pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <div className="h-5 w-40 rounded bg-black/[.06] dark:bg-white/[.08]" />
                  <div className="h-4 w-28 rounded bg-black/[.06] dark:bg-white/[.08]" />
                </div>
                <div className="h-8 w-40 rounded-full bg-black/[.06] dark:bg-white/[.08]" />
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <div className="h-12 w-24 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
                <div className="h-12 w-24 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
                <div className="h-12 w-28 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
              </div>
            </div>

            <div className="mt-6 h-[420px] rounded-2xl bg-black/[.06] dark:bg-white/[.08]" />

            <div className="mt-6 flex flex-wrap justify-center gap-2 rounded-2xl border border-border bg-black/[.03] p-4 xl:gap-6 dark:bg-white/[.04]">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 w-20 rounded-2xl bg-black/[.06] xl:w-32 dark:bg-white/[.08]" />
              ))}
            </div>
          </div>

          <div className="hidden w-72 shrink-0 flex-col gap-4 border-l border-border pl-6 md:flex">
            <div className="h-5 w-32 rounded bg-black/[.06] dark:bg-white/[.08]" />
            <div className="h-9 rounded-md bg-black/[.06] dark:bg-white/[.08]" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-black/[.06] dark:bg-white/[.08]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
