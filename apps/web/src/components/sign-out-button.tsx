import { signOut } from "@/auth";

function LogOutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        aria-label="Sign out"
        title="Sign out"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[.08] text-zinc-600 transition-colors hover:bg-black/[.04] hover:text-black dark:border-white/[.145] dark:text-zinc-400 dark:hover:bg-[#1a1a1a] dark:hover:text-zinc-50"
      >
        <LogOutIcon />
      </button>
    </form>
  );
}
