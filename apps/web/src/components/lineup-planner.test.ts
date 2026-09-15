import type { SquadPlayer } from "@/lib/api";
import { canSwap, validationError } from "./lineup-planner";

// A legal 15-player squad: 2 GK/5 DEF/5 MID/3 FWD total, 11 starting
// (1 GK/3 DEF/4 MID/3 FWD — inside the 3-5/2-5/1-3 formation ranges),
// captain on player 3, vice-captain on player 8. Mirrors the equivalent
// backend fixture in apps/api/tests/test_lineup_pure.py.
function makeSquad(): SquadPlayer[] {
  const base = (overrides: Partial<SquadPlayer>): SquadPlayer => ({
    playerId: 0,
    webName: "Player",
    position: "MID",
    club: "TST",
    clubCode: 1,
    currentPrice: 50,
    purchasePrice: 50,
    sellingPrice: 50,
    isStarting: false,
    squadPosition: 0,
    isCaptain: false,
    isViceCaptain: false,
    ...overrides,
  });

  return [
    base({ playerId: 1, position: "GK", isStarting: true, squadPosition: 1 }),
    base({ playerId: 2, position: "GK", isStarting: false, squadPosition: 2 }),
    base({ playerId: 3, position: "DEF", isStarting: true, squadPosition: 3, isCaptain: true }),
    base({ playerId: 4, position: "DEF", isStarting: true, squadPosition: 4 }),
    base({ playerId: 5, position: "DEF", isStarting: true, squadPosition: 5 }),
    base({ playerId: 6, position: "DEF", isStarting: false, squadPosition: 6 }),
    base({ playerId: 7, position: "DEF", isStarting: false, squadPosition: 7 }),
    base({ playerId: 8, position: "MID", isStarting: true, squadPosition: 8, isViceCaptain: true }),
    base({ playerId: 9, position: "MID", isStarting: true, squadPosition: 9 }),
    base({ playerId: 10, position: "MID", isStarting: true, squadPosition: 10 }),
    base({ playerId: 11, position: "MID", isStarting: true, squadPosition: 11 }),
    base({ playerId: 12, position: "MID", isStarting: false, squadPosition: 12 }),
    base({ playerId: 13, position: "FWD", isStarting: true, squadPosition: 13 }),
    base({ playerId: 14, position: "FWD", isStarting: true, squadPosition: 14 }),
    base({ playerId: 15, position: "FWD", isStarting: true, squadPosition: 15 }),
  ];
}

function byId(players: SquadPlayer[], id: number): SquadPlayer {
  const player = players.find((p) => p.playerId === id);
  if (!player) throw new Error(`no player ${id} in fixture`);
  return player;
}

describe("validationError", () => {
  it("passes a legal squad", () => {
    expect(validationError(makeSquad())).toBeNull();
  });

  it("rejects the wrong squad shape", () => {
    const players = makeSquad();
    byId(players, 15).position = "DEF"; // now 2 GK/6 DEF/5 MID/2 FWD
    expect(validationError(players)).toMatch(/2 goalkeepers/);
  });

  it("rejects the wrong starting count", () => {
    const players = makeSquad();
    byId(players, 6).isStarting = true; // 12 starting now
    expect(validationError(players)).toMatch(/exactly 11 players/);
  });

  it("rejects two starting goalkeepers", () => {
    const players = makeSquad();
    byId(players, 2).isStarting = true;
    byId(players, 13).isStarting = false; // keep starting count at 11
    expect(validationError(players)).toMatch(/exactly 1 goalkeeper/);
  });

  it("rejects no captain picked", () => {
    const players = makeSquad();
    byId(players, 3).isCaptain = false;
    expect(validationError(players)).toBe("Pick a captain");
  });

  it("rejects no vice-captain picked", () => {
    const players = makeSquad();
    byId(players, 8).isViceCaptain = false;
    expect(validationError(players)).toBe("Pick a vice-captain");
  });

  // Regression coverage for the bug fixed this session: setCaptain/
  // setViceCaptain in lineup-planner.tsx used to be able to put the same
  // player in both roles at once (checking Vice-captain on the current
  // captain, say) — the fix enforces mutual exclusivity client-side, but
  // this is the server/validation-side backstop that would have caught it
  // regardless, matching the backend's identical check.
  it("rejects the same player as both captain and vice-captain", () => {
    const players = makeSquad();
    byId(players, 8).isViceCaptain = false;
    byId(players, 3).isViceCaptain = true; // player 3 is already captain
    expect(validationError(players)).toBe("Captain and vice-captain must differ");
  });

  it("rejects a captain who isn't starting", () => {
    const players = makeSquad();
    byId(players, 3).isCaptain = false;
    byId(players, 7).isCaptain = true; // player 7 is on the bench
    expect(validationError(players)).toBe("Captain must be in the starting lineup");
  });
});

describe("canSwap", () => {
  it("allows two bench outfield players to trade places", () => {
    const players = makeSquad();
    expect(canSwap(players, 6, 7)).toBe(true); // both bench DEF
  });

  it("excludes the bench goalkeeper from bench-outfield swaps", () => {
    const players = makeSquad();
    expect(canSwap(players, 2, 6)).toBe(false); // bench GK vs bench DEF
  });

  it("allows swapping the starting goalkeeper for the bench goalkeeper", () => {
    const players = makeSquad();
    expect(canSwap(players, 1, 2)).toBe(true);
  });

  it("rejects two starting players (same status changes nothing)", () => {
    const players = makeSquad();
    expect(canSwap(players, 3, 4)).toBe(false);
  });

  it("rejects a substitution that would leave zero starting goalkeepers", () => {
    const players = makeSquad();
    expect(canSwap(players, 1, 6)).toBe(false); // starting GK <-> bench DEF
  });

  it("allows a cross-position substitution within formation limits", () => {
    const players = makeSquad();
    // starting FWD <-> bench MID: FWD 3->2 (still 1-3), MID 4->5 (still 2-5)
    expect(canSwap(players, 13, 12)).toBe(true);
  });

  it("rejects a substitution that would push a position below its minimum", () => {
    const players = makeSquad();
    // Bench everyone else's DEF slots first isn't possible via a single
    // swap, so exercise the boundary directly: starting DEF <-> bench GK
    // would drop DEF to 2 (below the 3 minimum) while also breaking the
    // goalkeeper count — either failure is a correct reject.
    expect(canSwap(players, 3, 2)).toBe(false);
  });
});
