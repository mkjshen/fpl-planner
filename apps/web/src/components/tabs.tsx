import Link from "next/link";

export function Tabs({ active }: { active: "squad" | "planner" }) {
  return (
    <div className="mt-4 flex gap-1 border-b border-black/[.08] dark:border-white/[.145]">
      <TabLink href="/dashboard" label="Squad" isActive={active === "squad"} />
      <TabLink href="/dashboard/planner" label="Planner" isActive={active === "planner"} />
    </div>
  );
}

function TabLink({ href, label, isActive }: { href: string; label: string; isActive: boolean }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "border-primary text-primary dark:border-accent dark:text-accent"
          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
}
