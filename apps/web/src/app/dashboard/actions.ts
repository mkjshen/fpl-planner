"use server";

import { type Lineup, type LineupPlayerInput, LineupValidationError, saveLineup } from "@/lib/api";

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
