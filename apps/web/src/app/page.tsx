import Link from "next/link";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
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
              className="rounded-full bg-foreground px-5 py-2.5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-up"
                className="rounded-full bg-foreground px-5 py-2.5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Sign up
              </Link>
              <Link
                href="/sign-in"
                className="rounded-full border border-black/[.08] px-5 py-2.5 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
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
