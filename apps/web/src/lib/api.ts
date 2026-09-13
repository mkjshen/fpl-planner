const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000";

export type SquadPlayer = {
  playerId: number;
  webName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  club: string;
  currentPrice: number;
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

export class FplTeamNotFoundError extends Error {}

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
