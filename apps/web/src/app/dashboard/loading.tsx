// Shown automatically by Next.js while this segment's server component
// awaits its data (initial load, or a refresh-squad round trip) — echoes
// the real layout's shape (header, stat chips, pitch, bench row) instead
// of a blank screen or plain "Loading…" text.
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 px-4 py-16 dark:from-[#2a002e] dark:via-black dark:to-black">
      <div className="w-full max-w-5xl animate-pulse rounded-xl border border-border bg-white p-8 dark:bg-zinc-950">
        <div className="border-b border-border pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-2">
              <div className="h-5 w-40 rounded bg-black/[.06] dark:bg-white/[.08]" />
              <div className="h-4 w-28 rounded bg-black/[.06] dark:bg-white/[.08]" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <div className="h-12 w-24 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
            <div className="h-12 w-24 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
          </div>
        </div>

        <div className="mt-6 h-[420px] rounded-2xl bg-black/[.06] dark:bg-white/[.08]" />

        <div className="mt-6 flex flex-wrap justify-center gap-2 rounded-2xl border border-border bg-black/[.03] p-4 xl:gap-6 dark:bg-white/[.04]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 w-20 rounded-2xl bg-black/[.06] xl:w-32 dark:bg-white/[.08]" />
          ))}
        </div>
      </div>
    </div>
  );
}
