"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  return (
    <Link
      href={href}
      className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "border-primary text-primary dark:border-accent dark:text-accent"
          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
}
