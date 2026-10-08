// Shown by Next.js while /dashboard decides where you belong: the link-team
// form for a new account, or a redirect into the planner once a team is
// linked. Kept to the form's shape — the squad itself now loads inside the
// planner, which has its own skeleton (planner/loading.tsx).
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 px-2 py-4 sm:px-4 sm:py-16 dark:from-[#2a002e] dark:via-black dark:to-black">
      <div className="w-full max-w-5xl rounded-xl border border-border bg-white p-4 sm:p-8 dark:bg-zinc-950">
        <p role="status" className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Loading…
        </p>
        <div className="mt-4 flex animate-pulse flex-col gap-3">
          <div className="h-7 w-56 rounded bg-black/[.06] dark:bg-white/[.08]" />
          <div className="h-4 w-full max-w-md rounded bg-black/[.06] dark:bg-white/[.08]" />
          <div className="mt-3 h-10 w-full max-w-sm rounded-md bg-black/[.06] dark:bg-white/[.08]" />
        </div>
      </div>
    </div>
  );
}
