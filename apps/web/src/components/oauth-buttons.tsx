import { signIn } from "@/auth";

export function OAuthButtons() {
  return (
    <div className="flex flex-col gap-3">
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-black/[.08] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Continue with Google
        </button>
      </form>
      <form
        action={async () => {
          "use server";
          await signIn("apple", { redirectTo: "/dashboard" });
        }}
      >
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-black/[.08] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Continue with Apple
        </button>
      </form>
    </div>
  );
}
