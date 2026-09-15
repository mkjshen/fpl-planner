"use client";

import type { ReactNode } from "react";

export type FeedbackTone = "success" | "error" | "info";

// One shared visual language for every success/error/info message in the
// app — previously error banners were hand-rolled per-page (sign-in,
// sign-up, dashboard, link-team-form) and successes had no banner at all.
const TONE_STYLES: Record<FeedbackTone, string> = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  error:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  info: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
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
