import type { SquadPlayer } from "@/lib/api";

// The fixed squad the public landing page shows on the real Pitch component,
// so a visitor can see the planner's output without signing up. Static on
// purpose: no live FPL API call (it can't break or show a real manager's
// team), and the page labels it as a sample. Players, clubs, prices and
// Gameweek 6 fixtures were taken from this app's own imported FPL data and
// will drift as the real season moves on — that's fine for an illustration,
// and sample-squad.test.ts keeps it a legal squad.

export const SAMPLE_GAMEWEEK = 6;

// FPL's 1 (easiest) - 5 (hardest) rating of each club's Gameweek 6 fixture,
// from the same imported fixture data as the opponents below.
export const SAMPLE_FIXTURE_DIFFICULTY: Record<string, number> = {
  ARS: 3, MCI: 4, NEW: 2, BHA: 3, CHE: 3, LIV: 4, NFO: 3, MUN: 2, HUL: 3, FUL: 2,
};

// FPL's starting shape for the XI below, printed at the top of the sheet.
export const SAMPLE_FORMATION = "4-4-2";

type SamplePlayer = Omit<SquadPlayer, "purchasePrice" | "sellingPrice">;

function player(p: SamplePlayer): SquadPlayer {
  return { ...p, purchasePrice: p.currentPrice, sellingPrice: p.currentPrice };
}

export const SAMPLE_SQUAD: SquadPlayer[] = [
  player({ playerId: 1, webName: "Raya", position: "GK", club: "ARS", clubCode: 3, opponent: "LEE (H)", currentPrice: 61, isStarting: true, squadPosition: 1, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 2, webName: "Calafiori", position: "DEF", club: "ARS", clubCode: 3, opponent: "LEE (H)", currentPrice: 59, isStarting: true, squadPosition: 2, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 3, webName: "Gvardiol", position: "DEF", club: "MCI", clubCode: 43, opponent: "LIV (A)", currentPrice: 57, isStarting: true, squadPosition: 3, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 4, webName: "Hall", position: "DEF", club: "NEW", clubCode: 4, opponent: "COV (A)", currentPrice: 53, isStarting: true, squadPosition: 4, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 5, webName: "De Cuyper", position: "DEF", club: "BHA", clubCode: 36, opponent: "SUN (A)", currentPrice: 50, isStarting: true, squadPosition: 5, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 6, webName: "Rogers", position: "MID", club: "CHE", clubCode: 8, opponent: "BOU (H)", currentPrice: 78, isStarting: true, squadPosition: 6, isCaptain: false, isViceCaptain: true }),
  player({ playerId: 7, webName: "Szoboszlai", position: "MID", club: "LIV", clubCode: 14, opponent: "MCI (H)", currentPrice: 69, isStarting: true, squadPosition: 7, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 8, webName: "Groß", position: "MID", club: "BHA", clubCode: 36, opponent: "SUN (A)", currentPrice: 59, isStarting: true, squadPosition: 8, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 9, webName: "Gibbs-White", position: "MID", club: "NFO", clubCode: 17, opponent: "CRY (A)", currentPrice: 80, isStarting: true, squadPosition: 9, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 10, webName: "Haaland", position: "FWD", club: "MCI", clubCode: 43, opponent: "LIV (A)", currentPrice: 156, isStarting: true, squadPosition: 10, isCaptain: true, isViceCaptain: false }),
  player({ playerId: 11, webName: "Wissa", position: "FWD", club: "NEW", clubCode: 4, opponent: "COV (A)", currentPrice: 62, isStarting: true, squadPosition: 11, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 12, webName: "Verbruggen", position: "GK", club: "BHA", clubCode: 36, opponent: "SUN (A)", currentPrice: 45, isStarting: false, squadPosition: 12, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 13, webName: "Mbeumo", position: "MID", club: "MUN", clubCode: 1, opponent: "TOT (H)", currentPrice: 79, isStarting: false, squadPosition: 13, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 14, webName: "Ajayi", position: "DEF", club: "HUL", clubCode: 88, opponent: "EVE (H)", currentPrice: 42, isStarting: false, squadPosition: 14, isCaptain: false, isViceCaptain: false }),
  player({ playerId: 15, webName: "Kusi-Asare", position: "FWD", club: "FUL", clubCode: 54, opponent: "IPS (A)", currentPrice: 45, isStarting: false, squadPosition: 15, isCaptain: false, isViceCaptain: false }),
];

// The one planned move the sample demonstrates — already applied to
// SAMPLE_SQUAD above (Wissa is in), with the bank before and after, so the
// team sheet can show what planning a transfer looks like.
export const SAMPLE_PLAN = {
  out: { webName: "Calvert-Lewin", club: "LEE", price: 60 },
  in: { webName: "Wissa", club: "NEW", price: 62 },
  freeTransfers: 2,
  bankBefore: 7,
  bankAfter: 5,
};

export const SAMPLE_BUDGET = 1000;
