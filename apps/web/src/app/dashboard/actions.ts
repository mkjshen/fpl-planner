"use server";

import { redirect } from "next/navigation";
import {
  FplPicksUnavailableError,
  FplTeamNotFoundError,
  importFplTeam,
  type Chip,
  getLineup,
  getPlayerProfile,
  getSuggestedTransfers,
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
  type Suggestions,
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

export async function getSuggestedTransfersAction(
  userId: string,
  gameweekNumber: number,
): Promise<Suggestions | null> {
  return getSuggestedTransfers(userId, gameweekNumber);
}

// Re-pulls the squad, prices and bank from the FPL API, then returns to the
// planner's current-gameweek view (where this lives since the separate Squad
// page was folded into the planner) with the outcome as a banner.
export async function refreshSquadAction(userId: string, fplTeamId: number): Promise<void> {
  try {
    await importFplTeam(userId, fplTeamId);
  } catch (error) {
    if (error instanceof FplTeamNotFoundError) {
      redirect("/dashboard/planner?gameweek=current&error=team_not_found");
    }
    if (error instanceof FplPicksUnavailableError) {
      redirect("/dashboard/planner?gameweek=current&error=picks_unavailable");
    }
    throw error;
  }
  redirect("/dashboard/planner?gameweek=current&success=refreshed");
}
