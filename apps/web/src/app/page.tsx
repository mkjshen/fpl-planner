import Link from "next/link";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 px-4 dark:from-[#2a002e] dark:via-black dark:to-black">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <span className="rounded-full border border-accent/30 bg-accent/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-accent">
          Built for classic FPL managers
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          FPL Team Planner
        </h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Import your Fantasy Premier League squad and plan transfers, chips,
          and captaincy across the season.
        </p>
        <div className="flex gap-4 text-sm font-medium">
          {session?.user ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-primary px-5 py-2.5 text-white transition-colors hover:bg-primary-hover"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-up"
                className="rounded-full bg-primary px-5 py-2.5 text-white transition-colors hover:bg-primary-hover"
              >
                Sign up
              </Link>
              <Link
                href="/sign-in"
                className="rounded-full border border-black/[.08] px-5 py-2.5 transition-colors hover:border-primary/40 hover:bg-black/[.04] dark:border-white/[.145] dark:hover:border-primary dark:hover:bg-[#1a1a1a]"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
