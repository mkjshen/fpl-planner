import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/sign-out-button";
import { Tabs } from "@/components/tabs";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-white dark:bg-zinc-950">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Tabs />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-zinc-600 dark:text-zinc-400 sm:inline">
              {session.user.name ?? session.user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
