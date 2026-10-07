"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useState } from "react";
import type { PlayerProfile } from "@/lib/api";
import { Dialog } from "@/components/dialog";
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
    <div className="rounded-lg border border-border bg-black/[.02] p-4 dark:bg-white/[.03]">
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

// Echoes the loaded profile's real shape (photo, name, badges, stat
// sections) instead of plain "Loading…" text.
function ProfileSkeleton() {
  return (
    <div className="animate-pulse p-8">
      <div className="flex items-center gap-4">
        <div className="h-24 w-[75px] shrink-0 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
        <div className="flex flex-col gap-2">
          <div className="h-6 w-36 rounded bg-black/[.06] dark:bg-white/[.08]" />
          <div className="h-4 w-48 rounded bg-black/[.06] dark:bg-white/[.08]" />
          <div className="mt-1 flex gap-1.5">
            <div className="h-6 w-12 rounded-full bg-black/[.06] dark:bg-white/[.08]" />
            <div className="h-6 w-14 rounded-full bg-black/[.06] dark:bg-white/[.08]" />
            <div className="h-6 w-14 rounded-full bg-black/[.06] dark:bg-white/[.08]" />
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-4">
        {[7, 4, 2].map((statCount, i) => (
          <div key={i} className="rounded-lg border border-border bg-black/[.02] p-4 dark:bg-white/[.03]">
            <div className="h-3 w-20 rounded bg-black/[.06] dark:bg-white/[.08]" />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: statCount }).map((_, j) => (
                <div key={j} className="h-11 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
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
// Escape, focus handling, scroll lock and the portal out of the planner's
// sticky sidebar all come from the shared Dialog (components/dialog.tsx).
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
    // profileAction excluded — calling a server action refreshes the route,
    // which hands down a *new* reference for every server-action prop;
    // depending on it here would re-fire this effect on every refresh it
    // itself triggers (an infinite fetch loop — see lineup-planner.tsx's
    // suggestions effect for the full explanation of this root cause).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const availabilityNote =
    profile &&
    (profile.news ||
      (profile.status !== "a" && STATUS_LABELS[profile.status]) ||
      (profile.chanceOfPlayingNextRound !== null && profile.chanceOfPlayingNextRound < 100));

  return (
    <Dialog
      onClose={onClose}
      label={profile ? `${profile.webName}'s profile` : "Player profile"}
      className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-white shadow-xl dark:bg-zinc-950"
    >
      {loading && <ProfileSkeleton />}
      {error && (
        <div className="flex flex-col items-center gap-3 py-20">
          <p role="alert" className="text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-full border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"
          >
            Close
          </button>
        </div>
      )}
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
              type="button"
              onClick={onClose}
              aria-label="Close profile"
              className="focus-ring shrink-0 rounded text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
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
            <div className="mt-5 border-t border-border pt-4">
              {actions(profile)}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
