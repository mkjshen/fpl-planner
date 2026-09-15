import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { createUser, EmailInUseError } from "@/lib/users";
import { signUpSchema } from "@/lib/validation";
import { OAuthButtons } from "@/components/oauth-buttons";
import { Banner } from "@/components/feedback";
import { SubmitButton } from "@/components/submit-button";

async function signUpAction(formData: FormData) {
  "use server";

  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/sign-up?error=invalid");
  }

  try {
    await createUser(parsed.data);
  } catch (error) {
    if (error instanceof EmailInUseError) {
      redirect("/sign-up?error=email_in_use");
    }
    throw error;
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/sign-in");
    }
    throw error;
  }
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-purple-100 via-zinc-50 to-zinc-50 px-4 dark:from-[#2a002e] dark:via-black dark:to-black">
      <div className="w-full max-w-sm rounded-xl border border-border bg-white p-8 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Create an account</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Save your squad and get planning suggestions across sessions.
        </p>

        {error === "email_in_use" && (
          <Banner tone="error" className="mt-4">
            An account with this email already exists.
          </Banner>
        )}
        {error === "invalid" && (
          <Banner tone="error" className="mt-4">
            Please check your details and try again.
          </Banner>
        )}

        <form action={signUpAction} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="focus-ring rounded-md border border-border px-3 py-2 text-sm transition-colors focus:border-primary dark:focus:border-accent dark:bg-black"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="focus-ring rounded-md border border-border px-3 py-2 text-sm transition-colors focus:border-primary dark:focus:border-accent dark:bg-black"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="focus-ring rounded-md border border-border px-3 py-2 text-sm transition-colors focus:border-primary dark:focus:border-accent dark:bg-black"
            />
          </div>
          <SubmitButton
            pendingLabel="Signing up…"
            className="mt-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            Sign up
          </SubmitButton>
        </form>

        <div className="mt-6 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-500">
          <div className="h-px flex-1 bg-black/[.08] dark:bg-white/[.145]" />
          or
          <div className="h-px flex-1 bg-black/[.08] dark:bg-white/[.145]" />
        </div>

        <div className="mt-6">
          <OAuthButtons />
        </div>

        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-primary dark:text-accent">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
