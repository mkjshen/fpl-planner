"use server";

import {
  type Chip,
  getLineup,
  getPlayerProfile,
  type Lineup,
  type LineupPlayerInput,
  LineupValidationError,
  type PlayerProfile,
  type PlayerSearchResult,
  type PlayerSortBy,
  type Position,
  resetAllPlans,
  saveLineup,
  searchPlayers,
} from "@/lib/api";

export async function saveLineupAction(
  userId: string,
  gameweekNumber: number,
  players: LineupPlayerInput[],
  chip: Chip | null = null,
): Promise<{ ok: true; lineup: Lineup } | { ok: false; message: string }> {
  try {
    const lineup = await saveLineup(userId, gameweekNumber, players, chip);
    return { ok: true, lineup };
  } catch (error) {
    if (error instanceof LineupValidationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

export async function resetAllPlansAction(
  userId: string,
  currentGameweekNumber: number,
): Promise<Lineup> {
  await resetAllPlans(userId);
  const lineup = await getLineup(userId, currentGameweekNumber);
  if (!lineup) {
    throw new Error("Failed to load lineup after reset");
  }
  return lineup;
}

export async function searchPlayersAction(
  userId: string,
  gameweekNumber: number,
  options: { positions?: Position[]; search?: string; sortBy?: PlayerSortBy; offset?: number },
): Promise<PlayerSearchResult> {
  return searchPlayers(userId, gameweekNumber, { ...options, limit: 30 });
}

export async function getPlayerProfileAction(playerId: number): Promise<PlayerProfile> {
  return getPlayerProfile(playerId);
}
