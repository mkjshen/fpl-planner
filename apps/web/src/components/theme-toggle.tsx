"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

// A tiny external store (not React state) for the current theme, so the
// button can use useSyncExternalStore — the correct primitive for reading
// something that lives outside React (localStorage / the OS's color-scheme
// preference) without a server/client hydration mismatch. `current` stays
// null until first read on the client; the server snapshot is always null,
// which is also what the button renders as (nothing) until then.
const listeners = new Set<() => void>();
let current: Theme | null = null;

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    // Storage unavailable (private browsing, disabled cookies, etc.) — the
    // toggle still works for this page load, it just won't persist.
    return null;
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  current = readStoredTheme() ?? (systemPrefersDark() ? "dark" : "light");
  applyTheme(current);

  // Only follow the device live when the user hasn't explicitly chosen —
  // once they've picked one via the button, it sticks regardless of
  // further OS-level changes.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (readStoredTheme() !== null) return;
    current = e.matches ? "dark" : "light";
    applyTheme(current);
    listeners.forEach((listener) => listener());
  });
}

function subscribe(callback: () => void): () => void {
  ensureInitialized();
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): Theme | null {
  ensureInitialized();
  return current;
}

function getServerSnapshot(): Theme | null {
  return null;
}

function setTheme(next: Theme) {
  current = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Theme still applies for this session, just won't persist.
  }
  applyTheme(next);
  listeners.forEach((listener) => listener());
}

// Lets the user override the device's light/dark preference. Defaults to
// whatever the device prefers — see the blocking inline script in
// layout.tsx, which applies that same default to <html> before first paint
// so there's no flash of the wrong theme before this mounts.
//
// Two placements: "inline" sits in the signed-in app's header beside Sign
// out (and in the landing page's top bar); "floating" is the corner button
// for the header-less sign-in and sign-up pages. The floating one stands
// down wherever an inline one exists — it used to cover the planner's
// sticky Save bar, and the landing page's sample pitch, on phones.
export function ThemeToggle({ variant = "floating" }: { variant?: "floating" | "inline" }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();

  if (theme === null) return null;
  // Pages with their own header (the app and the landing page) carry the
  // inline toggle there instead.
  if (variant === "floating" && (pathname === "/" || pathname.startsWith("/dashboard"))) return null;

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={
        variant === "inline"
          ? "focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-border text-zinc-600 transition-colors hover:bg-black/[.04] hover:text-black dark:text-zinc-400 dark:hover:bg-[#1a1a1a] dark:hover:text-zinc-50"
          : "focus-ring fixed right-6 bottom-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white text-zinc-700 shadow-lg transition-colors hover:bg-black/[.04] dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-white/[.08]"
      }
    >
      {theme === "dark" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={variant === "inline" ? "h-4 w-4" : "h-5 w-5"}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" className={variant === "inline" ? "h-4 w-4" : "h-5 w-5"}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
        </svg>
      )}
    </button>
  );
}
