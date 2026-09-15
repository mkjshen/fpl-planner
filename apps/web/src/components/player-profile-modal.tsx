"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PlayerProfile } from "@/lib/api";
import { formatPrice, playerPhotoUrl, StatChip } from "@/components/pitch";

export type ProfileAction = (playerId: number) => Promise<PlayerProfile>;

// "d" (doubtful) isn't labeled — a doubtful player still has a real chance
// of playing, so it's not worth flagging as hard as a confirmed injury,
// suspension, or unavailability.
const STATUS_LABELS: Record<string, string> = {
  i: "Injured",
  s: "Suspended",
  u: "Unavailable",
};

// A section of the card — a labeled, bordered block holding one related
// group of stats, so the card reads as a set of distinct panels rather
// than one long stacked list.
function StatSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-black/[.08] bg-black/[.02] p-4 dark:border-white/[.145] dark:bg-white/[.03]">
      <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        {title}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-black/[.05] px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-white/[.08] dark:text-zinc-300">
      {children}
    </span>
  );
}

// The caller is expected to conditionally render this (only when a player
// is being viewed) with `key={playerId}`, the same "remount for a fresh
// fetch" pattern PlayerSearchResults itself uses — not pass a nullable
// playerId and have this component react to it changing in place. That
// keeps the fetch-on-mount effect simple (state starts clean because the
// component instance is new, not because the effect resets it) and avoids
// synchronous setState calls in the effect body.
//
// Rendered via a portal straight into document.body rather than in place:
// this can be opened from inside the planner's `md:sticky` transfer-in
// sidebar, and `position: sticky` establishes a new stacking context — a
// `fixed` descendant's z-index is then only compared *within* that
// context, so it can end up painting behind unrelated page content (the
// pitch, confirmed by testing at the DOM level) no matter how high the
// z-index goes. A portal sidesteps the whole class of bug by escaping the
// component tree entirely instead of trying to out-z-index an ancestor.
export function PlayerProfileModal({
  playerId,
  profileAction,
  onClose,
  actions,
}: {
  playerId: number;
  profileAction: ProfileAction;
  onClose: () => void;
  // Squad-context controls (captain/vice-captain, sell, substitute) that
  // only make sense when this player is actually in the viewer's own
  // lineup — not part of this component's own concerns, since it's also
  // used to browse the full transfer-in pool, where none of that applies.
  // Rendered once the profile has loaded, with the profile as an argument
  // in case the caller wants it (e.g. for a confirmation message).
  actions?: (profile: PlayerProfile) => ReactNode;
}) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lock the page behind the modal from scrolling while it's open —
  // otherwise a scroll/wheel gesture over the backdrop scrolls the planner
  // underneath instead of (or as well as) the modal's own content. Both
  // <html> and <body> need it: whichever one the browser treats as the
  // actual scrolling element (document.scrollingElement, normally <html>)
  // is the one that matters, and that isn't guaranteed to be body alone.
  // Restores whatever was there before, not just "visible", in case
  // something else already constrained it.
  useEffect(() => {
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    profileAction(playerId)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this player's profile. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, profileAction]);

  const availabilityNote =
    profile &&
    (profile.news ||
      (profile.status !== "a" && STATUS_LABELS[profile.status]) ||
      (profile.chanceOfPlayingNextRound !== null && profile.chanceOfPlayingNextRound < 100));

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={profile ? `${profile.webName}'s profile` : "Player profile"}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-black/[.08] bg-white shadow-xl dark:border-white/[.145] dark:bg-zinc-950"
      >
        {loading && (
          <p className="py-24 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        )}
        {error && <p className="py-24 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
        {profile && (
          <div className="flex min-h-0 flex-col overflow-y-auto p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {profile.photoCode !== null && (
                  <Image
                    src={playerPhotoUrl(profile.photoCode)}
                    alt=""
                    width={76}
                    height={97}
                    className="h-24 w-[75px] shrink-0 rounded-lg object-cover"
                  />
                )}
                <div>
                  <p className="text-2xl font-semibold text-black dark:text-zinc-50">
                    {profile.webName}
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{profile.fullName}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge>{profile.position}</Badge>
                    <Badge>{profile.club}</Badge>
                    <Badge>{formatPrice(profile.currentPrice)}</Badge>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Close
              </button>
            </div>

            {availabilityNote && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {STATUS_LABELS[profile.status] && (
                  <span className="font-medium">{STATUS_LABELS[profile.status]}. </span>
                )}
                {profile.news && <span>{profile.news} </span>}
                {profile.chanceOfPlayingNextRound !== null && (
                  <span>{profile.chanceOfPlayingNextRound}% chance of playing next round.</span>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-4">
              <StatSection title="Season">
                <StatChip label="Points" value={String(profile.totalPoints)} />
                <StatChip
                  label="Pts/game"
                  value={profile.pointsPerGame.toFixed(1)}
                  title="Average points per gameweek started or on the pitch"
                />
                <StatChip
                  label="Form"
                  value={profile.form.toFixed(1)}
                  title="Average points over the last few gameweeks — a better read on current momentum than the season total"
                />
                <StatChip
                  label="ICT"
                  value={profile.ictIndex.toFixed(1)}
                  title="FPL's own Influence/Creativity/Threat index — a composite score of how involved a player is in their team's attacking play, built specifically to help judge fantasy value"
                />
                <StatChip
                  label="Value"
                  value={profile.valueSeason.toFixed(1)}
                  title="Total points per £1m spent — higher means better return on price"
                />
                <StatChip
                  label="Owned by"
                  value={`${profile.selectedByPercent.toFixed(1)}%`}
                  title="Share of FPL managers who own this player — a very high number makes them a 'template' pick your rivals likely already have"
                />
                <StatChip
                  label="Minutes"
                  value={String(profile.minutes)}
                  title="Total minutes played this season — low minutes on a fit player is a rotation-risk warning sign"
                />
              </StatSection>

              <StatSection title="Returns">
                <StatChip label="Goals" value={String(profile.goalsScored)} />
                <StatChip label="Assists" value={String(profile.assists)} />
                <StatChip label="Clean sheets" value={String(profile.cleanSheets)} />
                <StatChip label="Bonus" value={String(profile.bonus)} />
              </StatSection>

              <StatSection title="Underlying stats">
                <StatChip
                  label="xG"
                  value={profile.expectedGoals.toFixed(2)}
                  title="Expected goals — how many goals their shots would be expected to produce on average. Well above actual goals scored suggests they're due more; well below suggests recent goals were fortunate"
                />
                <StatChip
                  label="xA"
                  value={profile.expectedAssists.toFixed(2)}
                  title="Expected assists — the same idea as xG, for chances created that led (or should lead) to a goal"
                />
              </StatSection>
            </div>

            {actions && (
              <div className="mt-5 border-t border-black/[.08] pt-4 dark:border-white/[.145]">
                {actions(profile)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
