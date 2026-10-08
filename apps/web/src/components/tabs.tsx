"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { guardNavigation } from "@/lib/navigation-guard";

export function Tabs() {
  const pathname = usePathname();
  const active = pathname === "/dashboard/planner" ? "planner" : "squad";

  return (
    <div className="flex gap-1">
      <TabLink href="/dashboard" label="Squad" isActive={active === "squad"} />
      <TabLink href="/dashboard/planner" label="Planner" isActive={active === "planner"} />
    </div>
  );
}

function TabLink({ href, label, isActive }: { href: string; label: string; isActive: boolean }) {
  const router = useRouter();

  // Asks the planner first when it has unsaved changes (see
  // lib/navigation-guard). Modified clicks (new tab/window) leave the
  // current page untouched, so they go straight through.
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (guardNavigation(() => router.push(href))) event.preventDefault();
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      aria-current={isActive ? "page" : undefined}
      className={`focus-ring border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "border-primary text-primary dark:border-accent dark:text-accent"
          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
}
