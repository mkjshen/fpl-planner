"use client";

import type { ReactNode } from "react";

export type FeedbackTone = "success" | "error" | "info";

// One shared visual language for every success/error/info message in the
// app — previously error banners were hand-rolled per-page (sign-in,
// sign-up, dashboard, link-team-form) and successes had no banner at all.
// The actual colors live in one place (globals.css's tone-* utilities),
// not repeated here — this just maps a tone name to its utility class.
// (Must stay a literal Record, not a template string built from `tone` —
// Tailwind's build-time scanner needs to see each class name spelled out
// in source to generate it.)
const TONE_STYLES: Record<FeedbackTone, string> = {
  success: "tone-success",
  error: "tone-error",
  info: "tone-info",
};

const DISMISS_STYLES: Record<FeedbackTone, string> = {
  success: "text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200",
  error: "text-red-700 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200",
  info: "text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200",
};

export function Banner({
  tone,
  children,
  onDismiss,
  className = "",
}: {
  tone: FeedbackTone;
  children: ReactNode;
  // Only meaningful for a client-state-driven banner (e.g. lineup-planner's
  // laterPlansAffected notice) — a server-rendered, query-param-driven
  // banner has nothing to dismiss to, it just won't be there on next load.
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${TONE_STYLES[tone]} ${className}`}
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={`focus-ring shrink-0 rounded font-medium ${DISMISS_STYLES[tone]}`}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
