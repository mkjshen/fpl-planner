const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000";

export type Position = "GK" | "DEF" | "MID" | "FWD";

export type SquadPlayer = {
  playerId: number;
  webName: string;
  position: Position;
  club: string;
  clubCode: number | null;
  // Who this player's club faces in the gameweek being viewed, formatted
  // for display (e.g. "MUN (H)") — see PlayerCard, which shows this
  // instead of `club`. Optional: a player just picked client-side from
  // the transfer-in pool (not yet round-tripped through a save) doesn't
  // have this yet — PlayerCard falls back to `club` until then.
  opponent?: string;
  // This player's actual fantasy points for the current gameweek, once
  // their fixture has finished — set instead of (never alongside) a
  // meaningful `opponent`. PlayerCard shows this in place of the fixture
  // when present.
  actualPoints?: number | null;
  currentPrice: number;
  purchasePrice: number;
  sellingPrice: number;
  isStarting: boolean;
  squadPosition: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
};

export type Squad = {
  fplTeamId: number;
  teamName: string | null;
  managerName: string | null;
  gameweek: number;
  bank: number;
  teamValue: number;
  players: SquadPlayer[];
};

export type Lineup = Squad & {
  isEditable: boolean;
  freeTransfers: number;
  transferCost: number;
  laterPlansAffected: boolean;
  // The chip activated on this specific gameweek's own saved plan, if any —
  // never a chip inherited from an earlier cascaded plan.
  chipUsed: Chip | null;
  // Every usage window each chip type has this season (real FPL gives each
  // chip two: first half and second half of the season), each with its own
  // status. A chip not offered this season is simply absent. A window
  // already active on the viewed gameweek shows "used" — compare against
  // `chipUsed` before treating that specific chip as unavailable here.
  chipWindows: Partial<Record<Chip, ChipWindowStatus[]>>;
};

export type ChipWindowStatus = {
  startEvent: number;
  stopEvent: number;
  // "used" — spent, by real history or another gameweek's plan.
  // "available" — not spent, and not yet past its stopEvent.
  // "expired" — never used and its stopEvent has already passed; lost for
  // the rest of the season, same as a real unused chip window.
  status: "used" | "available" | "expired";
};

export type Chip = "wildcard" | "free_hit" | "bench_boost" | "triple_captain";

export type PlayerListItem = {
  playerId: number;
  webName: string;
  position: Position;
  club: string;
  clubCode: number | null;
  currentPrice: number;
  status: string;
  // The same fields the search can sort by (see PlayerSortBy) — carried on
  // every row so the list can show *why* it's ordered the way it is
  // without a second round trip when the sort changes. Optional because a
  // player re-offered via `reincludePlayers` (see PlayerSearchResults) is
  // built client-side from squad data that doesn't carry these, not fetched
  // from the search API — that's the only place they're ever missing.
  form?: number;
  totalPoints?: number;
  pointsPerGame?: number;
  ictIndex?: number;
  valueSeason?: number;
  selectedByPercent?: number;
};

// What the player search can sort by — must match SORT_COLUMNS in the
// backend's services/players.py.
export type PlayerSortBy =
  | "price"
  | "form"
  | "points"
  | "points_per_game"
  | "ict"
  | "value"
  | "ownership";

export type PlayerSearchResult = {
  total: number;
  players: PlayerListItem[];
};

// Everything the player profile modal shows — fetched on demand for one
// player at a time (see getPlayerProfile) rather than folded into
// PlayerListItem, so browsing/searching the pool doesn't carry stats
// nobody's asked to see yet.
export type PlayerProfile = {
  playerId: number;
  webName: string;
  fullName: string;
  position: Position;
  club: string;
  clubCode: number | null;
  photoCode: number | null;
  currentPrice: number;
  status: string;
  // 0-100, null means "no doubt" (fully fit).
  chanceOfPlayingNextRound: number | null;
  news: string;
  form: number;
  totalPoints: number;
  pointsPerGame: number;
  selectedByPercent: number;
  minutes: number;
  goalsScored: number;
  assists: number;
  cleanSheets: number;
  bonus: number;
  ictIndex: number;
  expectedGoals: number;
  expectedAssists: number;
  valueSeason: number;
};

export type GameweekSummary = {
  number: number;
  deadlineTime: string;
  isCurrent: boolean;
  isNext: boolean;
  isFinished: boolean;
};

export type PlannableGameweeks = {
  currentGameweek: number | null;
  plannable: GameweekSummary[];
};

export type LineupPlayerInput = {
  playerId: number;
  isStarting: boolean;
  squadPosition: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
};

export class FplTeamNotFoundError extends Error {}
export class FplPicksUnavailableError extends Error {}
export class LineupValidationError extends Error {}

export async function getSquadForUser(userId: string): Promise<Squad | null> {
  const response = await fetch(`${API_BASE_URL}/teams/by-user/${userId}/squad`, {
    cache: "no-store",
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load squad: ${response.status}`);
  }
  return response.json();
}

export async function importFplTeam(userId: string, fplTeamId: number): Promise<Squad> {
  const response = await fetch(`${API_BASE_URL}/teams/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, fplTeamId }),
  });
  if (response.status === 404) {
    throw new FplTeamNotFoundError(`FPL team ${fplTeamId} not found`);
  }
  if (response.status === 409) {
    throw new FplPicksUnavailableError(`FPL team ${fplTeamId} has no picks published yet`);
  }
  if (!response.ok) {
    throw new Error(`Failed to import team: ${response.status}`);
  }
  return response.json();
}

export async function getPlannableGameweeks(userId: string): Promise<PlannableGameweeks> {
  const response = await fetch(`${API_BASE_URL}/teams/by-user/${userId}/gameweeks`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load gameweeks: ${response.status}`);
  }
  return response.json();
}

export async function getLineup(userId: string, gameweekNumber: number): Promise<Lineup | null> {
  const response = await fetch(
    `${API_BASE_URL}/teams/by-user/${userId}/lineup/${gameweekNumber}`,
    { cache: "no-store" },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load lineup: ${response.status}`);
  }
  return response.json();
}

export type SuggestedTransfer = {
  outPlayer: PlayerListItem;
  inPlayer: PlayerListItem;
  // What outPlayer would actually sell for (see the backend's
  // lineup.py:_resell_price) — can be less than outPlayer.currentPrice, so
  // this is what the Apply flow needs to preview the bank impact.
  outPlayerSellingPrice: number;
  projectedGain: number;
  requiresHit: boolean;
};

export type Suggestions = {
  suggestions: SuggestedTransfer[];
  freeTransfersAvailable: number;
};

export async function getSuggestedTransfers(
  userId: string,
  gameweekNumber: number,
): Promise<Suggestions | null> {
  const response = await fetch(
    `${API_BASE_URL}/teams/by-user/${userId}/suggestions/${gameweekNumber}`,
    { cache: "no-store" },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load suggested transfers: ${response.status}`);
  }
  return response.json();
}

export async function saveLineup(
  userId: string,
  gameweekNumber: number,
  players: LineupPlayerInput[],
  chip: Chip | null = null,
): Promise<Lineup> {
  const response = await fetch(
    `${API_BASE_URL}/teams/by-user/${userId}/lineup/${gameweekNumber}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players, chip }),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new LineupValidationError(body?.detail ?? `Failed to save lineup: ${response.status}`);
  }
  return response.json();
}

export async function searchPlayers(
  userId: string,
  gameweekNumber: number,
  options: {
    positions?: Position[];
    search?: string;
    sortBy?: PlayerSortBy;
    limit?: number;
    offset?: number;
  },
): Promise<PlayerSearchResult> {
  const params = new URLSearchParams({
    userId,
    gameweekNumber: String(gameweekNumber),
  });
  // Omitted entirely (not sent as an empty list) means "every position" —
  // the backend treats a missing filter and an empty one the same way, but
  // being explicit here avoids relying on that.
  for (const position of options.positions ?? []) params.append("position", position);
  if (options.search) params.set("search", options.search);
  if (options.sortBy) params.set("sortBy", options.sortBy);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));

  const response = await fetch(`${API_BASE_URL}/players?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to search players: ${response.status}`);
  }
  return response.json();
}

export async function getPlayerProfile(playerId: number): Promise<PlayerProfile> {
  const response = await fetch(`${API_BASE_URL}/players/${playerId}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load player profile: ${response.status}`);
  }
  return response.json();
}

export async function resetAllPlans(userId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/teams/by-user/${userId}/lineup`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to reset plans: ${response.status}`);
  }
}
