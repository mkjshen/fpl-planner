"use server";

import {
  getLineup,
  type Lineup,
  type LineupPlayerInput,
  LineupValidationError,
  type PlayerSearchResult,
  type Position,
  resetAllPlans,
  saveLineup,
  searchPlayers,
} from "@/lib/api";

export async function saveLineupAction(
  userId: string,
  gameweekNumber: number,
  players: LineupPlayerInput[],
): Promise<{ ok: true; lineup: Lineup } | { ok: false; message: string }> {
  try {
    const lineup = await saveLineup(userId, gameweekNumber, players);
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
  options: { positions?: Position[]; search?: string; offset?: number },
): Promise<PlayerSearchResult> {
  return searchPlayers(userId, gameweekNumber, { ...options, limit: 30 });
}
