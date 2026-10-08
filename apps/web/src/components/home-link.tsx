"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { guardNavigation } from "@/lib/navigation-guard";

// The app header's wordmark, linking back to the planner's default view —
// the one place to go now that the separate Squad page lives inside the
// planner (its current gameweek). Asks the planner first when it has
// unsaved changes (see lib/navigation-guard); modified clicks (new tab or
// window) leave the current page untouched, so they go straight through.
export function HomeLink() {
  const router = useRouter();
  const href = "/dashboard/planner";

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (guardNavigation(() => router.push(href))) event.preventDefault();
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="focus-ring rounded px-1 py-1 text-sm font-semibold text-black dark:text-zinc-50"
    >
      FPL Team Planner
    </Link>
  );
}
