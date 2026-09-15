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
  // Total uses of each chip type this season allows, keyed by chip name — a
  // chip not offered this season is simply absent. Paired with
  // chipsRemaining so the UI can show "X of Y used".
  chipsTotal: Partial<Record<Chip, number>>;
  // Uses left this season for each chip this season offers, keyed by chip
  // name. A chip already active on the viewed gameweek can show 0 here
  // while still being the selected option — compare against `chipUsed`
  // before treating a chip as unavailable.
  chipsRemaining: Partial<Record<Chip, number>>;
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
};

export type PlayerSearchResult = {
  total: number;
  players: PlayerListItem[];
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
  options: { positions?: Position[]; search?: string; limit?: number; offset?: number },
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

export async function resetAllPlans(userId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/teams/by-user/${userId}/lineup`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to reset plans: ${response.status}`);
  }
}
