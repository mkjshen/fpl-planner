import type { PlayerListItem, SquadPlayer, SuggestedTransfer, TransferCombination } from "@/lib/api";
import {
  applicableCombination,
  benchSlotLabel,
  canSwap,
  chipStatus,
  difficultyClass,
  filterVisibleSuggestions,
  fixtureStripSummary,
  gameweekProjectionLabel,
  pendingChangesSummary,
  perGameweek,
  priceChangeMarker,
  suggestionCostsHit,
  suggestionsSummary,
  validationError,
  withTransfer,
} from "./lineup-planner";

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

function makeListItem(overrides: Partial<PlayerListItem>): PlayerListItem {
  return {
    playerId: 0,
    webName: "Player",
    position: "MID",
    club: "TST",
    clubCode: 1,
    currentPrice: 50,
    status: "a",
    ...overrides,
  };
}

function makeSuggestion(outId: number, inId: number): SuggestedTransfer {
  return {
    outPlayer: makeListItem({ playerId: outId, webName: `Out${outId}` }),
    inPlayer: makeListItem({ playerId: inId, webName: `In${inId}` }),
    outPlayerSellingPrice: 50,
    projectedGain: 2.5,
    projectedGainPerGameweek: 0.5,
    outPlayerStarting: true,
    requiresHit: false,
    outPlayerPriceDirection: "unchanged",
    inPlayerPriceDirection: "unchanged",
    gameweekProjections: [],
  };
}

describe("filterVisibleSuggestions", () => {
  it("keeps a suggestion whose outPlayer is still owned and inPlayer isn't", () => {
    const suggestions = [makeSuggestion(1, 2)];
    expect(filterVisibleSuggestions(suggestions, new Set([1, 3, 4]))).toEqual(suggestions);
  });

  it("drops a suggestion once its outPlayer has already left the squad", () => {
    // e.g. the user manually transferred them out since suggestions loaded.
    const suggestions = [makeSuggestion(1, 2)];
    expect(filterVisibleSuggestions(suggestions, new Set([3, 4]))).toEqual([]);
  });

  it("drops a suggestion once its inPlayer is already owned", () => {
    // e.g. the user already bought them some other way (manually, or by
    // applying a different suggestion first).
    const suggestions = [makeSuggestion(1, 2)];
    expect(filterVisibleSuggestions(suggestions, new Set([1, 2]))).toEqual([]);
  });

  it("keeps only the still-valid suggestions out of a mixed list", () => {
    const stillValid = makeSuggestion(1, 2);
    const outAlreadyGone = makeSuggestion(5, 6);
    const inAlreadyOwned = makeSuggestion(1, 7);
    const suggestions = [stillValid, outAlreadyGone, inAlreadyOwned];

    // Owned: 1 (still has outPlayer 1) and 7 (already bought inPlayer 7);
    // player 5 (outAlreadyGone's outPlayer) is no longer owned.
    expect(filterVisibleSuggestions(suggestions, new Set([1, 7]))).toEqual([stillValid]);
  });
});

describe("priceChangeMarker", () => {
  it("marks a rise with an up arrow", () => {
    expect(priceChangeMarker("risen")).toMatchObject({ symbol: "▲", label: "Price rose today" });
  });

  it("marks a fall with a down arrow", () => {
    expect(priceChangeMarker("fallen")).toMatchObject({ symbol: "▼", label: "Price fell today" });
  });

  it("shows nothing when the price hasn't moved", () => {
    expect(priceChangeMarker("unchanged")).toBeNull();
  });
});

describe("difficultyClass", () => {
  it("uses FPL's own five FDR colours, one per rating", () => {
    const classes = [1, 2, 3, 4, 5].map(difficultyClass);
    expect(new Set(classes).size).toBe(5);
    expect(difficultyClass(1)).toContain("#375523");
    expect(difficultyClass(5)).toContain("#80072d");
  });

  it("falls back to the average colour for an unexpected rating", () => {
    expect(difficultyClass(9)).toEqual(difficultyClass(3));
  });
});

describe("fixtureStripSummary", () => {
  it("reads the whole horizon as one sentence, including doubles and blanks", () => {
    expect(
      fixtureStripSummary("Groß", [
        { gameweekNumber: 6, inDifficulties: [2], outDifficulties: [], inProjectedPoints: 0, outProjectedPoints: 0 },
        { gameweekNumber: 7, inDifficulties: [3, 4], outDifficulties: [], inProjectedPoints: 0, outProjectedPoints: 0 },
        { gameweekNumber: 8, inDifficulties: [], outDifficulties: [], inProjectedPoints: 0, outProjectedPoints: 0 },
      ]),
    ).toBe(
      "Groß's fixture difficulty, 1 easiest to 5 hardest: gameweek 6 2, gameweek 7 3 and 4, gameweek 8 no fixture.",
    );
  });
});

describe("gameweekProjectionLabel", () => {
  it("spells out both sides of a single-fixture gameweek", () => {
    expect(
      gameweekProjectionLabel({
        gameweekNumber: 6,
        inDifficulties: [2],
        outDifficulties: [4],
        inProjectedPoints: 5.75,
        outProjectedPoints: 1.2,
      }),
    ).toBe("GW6: in difficulty 2, 5.8 pts · out difficulty 4, 1.2 pts");
  });

  it("describes a double and a blank", () => {
    expect(
      gameweekProjectionLabel({
        gameweekNumber: 7,
        inDifficulties: [3, 2],
        outDifficulties: [],
        inProjectedPoints: 9,
        outProjectedPoints: 0,
      }),
    ).toBe("GW7: in difficulty 3 + difficulty 2, 9.0 pts · out no fixture, 0.0 pts");
  });
});

describe("suggestionCostsHit", () => {
  it("is free when it's the only transfer and one is available", () => {
    // The reported case: a lower-ranked suggestion applied on its own
    // shouldn't read as a hit just because it ranked below others.
    expect(suggestionCostsHit(false, 0, 1, false)).toBe(false);
  });

  it("costs a hit once the free transfers are already used", () => {
    expect(suggestionCostsHit(false, 1, 1, false)).toBe(true);
  });

  it("stays free with rolled-over transfers still left", () => {
    expect(suggestionCostsHit(false, 1, 2, false)).toBe(false);
  });

  it("doesn't count filling an already-pending transfer-out slot as an extra transfer", () => {
    // The outgoing player is already counted in transfersMade (1 of 1).
    expect(suggestionCostsHit(true, 1, 1, false)).toBe(false);
  });

  it("is never a hit under Wildcard or Free Hit", () => {
    expect(suggestionCostsHit(false, 5, 0, true)).toBe(false);
  });
});

describe("applicableCombination", () => {
  function makeCombination(pairs: [number, number][]): TransferCombination {
    return {
      transfers: pairs.map(([outId, inId]) => makeSuggestion(outId, inId)),
      totalProjectedGain: 10,
      netProjectedGainPerGameweek: 2,
      hits: 0,
      netProjectedGain: 10,
    };
  }

  it("shows a multi-transfer combination for an untouched squad", () => {
    const combination = makeCombination([
      [1, 10],
      [2, 20],
    ]);
    expect(applicableCombination(combination, new Set([1, 2, 3]), false, false)).toBe(combination);
  });

  it("hides once any transfer has been made, since its budget assumed none", () => {
    const combination = makeCombination([
      [1, 10],
      [2, 20],
    ]);
    expect(applicableCombination(combination, new Set([1, 2, 3]), true, false)).toBeNull();
  });

  it("hides under Wildcard or Free Hit, which it wasn't solved for", () => {
    const combination = makeCombination([
      [1, 10],
      [2, 20],
    ]);
    expect(applicableCombination(combination, new Set([1, 2, 3]), false, true)).toBeNull();
  });

  it("hides a single-move combination, which the top card already shows", () => {
    expect(applicableCombination(makeCombination([[1, 10]]), new Set([1]), false, false)).toBeNull();
  });

  it("hides if any of its players no longer fit the squad", () => {
    // Player 10 is somehow already owned.
    const combination = makeCombination([
      [1, 10],
      [2, 20],
    ]);
    expect(applicableCombination(combination, new Set([1, 2, 10]), false, false)).toBeNull();
  });

  it("hides when there's no combination at all", () => {
    expect(applicableCombination(null, new Set([1]), false, false)).toBeNull();
  });
});

describe("withTransfer", () => {
  it("puts the incoming player in the outgoing player's slot, keeping place and armband", () => {
    const squad = makeSquad();
    const outgoing = squad.find((p) => p.isCaptain)!;
    const result = withTransfer(squad, outgoing.playerId, makeListItem({ playerId: 99, webName: "New", currentPrice: 62 }));
    const incoming = result.find((p) => p.playerId === 99)!;

    expect(result).toHaveLength(squad.length);
    expect(result.some((p) => p.playerId === outgoing.playerId)).toBe(false);
    expect(incoming).toMatchObject({
      squadPosition: outgoing.squadPosition,
      isStarting: outgoing.isStarting,
      isCaptain: true,
      purchasePrice: 62,
      sellingPrice: 62,
    });
  });

  it("chains, so a whole combination can be applied as one update", () => {
    const squad = makeSquad();
    const result = [
      [1, makeListItem({ playerId: 91 })],
      [2, makeListItem({ playerId: 92 })],
    ].reduce((s, [outId, inPlayer]) => withTransfer(s, outId as number, inPlayer as PlayerListItem), squad);
    expect(result.map((p) => p.playerId)).toEqual(expect.arrayContaining([91, 92]));
    expect(result.map((p) => p.playerId)).not.toEqual(expect.arrayContaining([1]));
  });
});

describe("pendingChangesSummary", () => {
  it("lists transfers, hit cost and bank", () => {
    expect(pendingChangesSummary({ transfersMade: 4, transferCost: 8, bank: "£0.3m", chipLabel: null })).toBe(
      "4 transfers · −8 pts · Bank £0.3m",
    );
  });

  it("uses the singular and omits a zero cost", () => {
    expect(pendingChangesSummary({ transfersMade: 1, transferCost: 0, bank: "£1.0m", chipLabel: null })).toBe(
      "1 transfer · Bank £1.0m",
    );
  });

  it("names a chip change", () => {
    expect(pendingChangesSummary({ transfersMade: 0, transferCost: 0, bank: "£1.0m", chipLabel: "Wildcard on" })).toBe(
      "Wildcard on · Bank £1.0m",
    );
  });

  it("says when a transferred-out player still needs a replacement", () => {
    expect(
      pendingChangesSummary({ transfersMade: 1, awaitingReplacement: 1, transferCost: 0, bank: "£6.2m", chipLabel: null }),
    ).toBe("1 transfer · 1 needs a replacement · Bank £6.2m");
  });

  it("falls back to lineup changes for pure substitutions", () => {
    expect(pendingChangesSummary({ transfersMade: 0, transferCost: 0, bank: "£1.0m", chipLabel: null })).toBe(
      "Lineup changes · Bank £1.0m",
    );
  });
});

describe("chipStatus", () => {
  const windows = [
    { startEvent: 2, stopEvent: 19, status: "used" as const },
    { startEvent: 20, stopEvent: 38, status: "available" as const },
  ];

  it("says when a spent chip comes back", () => {
    expect(chipStatus("wildcard", null, windows, 6)).toBe("from GW20");
  });

  it("says available inside an unspent window", () => {
    expect(chipStatus("wildcard", null, windows, 25)).toBe("available");
  });

  it("says on while active", () => {
    expect(chipStatus("wildcard", "wildcard", windows, 6)).toBe("on");
  });

  it("says none left once every window is spent or lapsed", () => {
    expect(chipStatus("free_hit", null, [{ startEvent: 2, stopEvent: 19, status: "expired" }], 25)).toBe("none left");
  });

  it("says when a chip isn't offered at all", () => {
    expect(chipStatus("bench_boost", null, [], 6)).toBe("not this season");
  });
});

describe("suggestionsSummary", () => {
  const base = { loading: false, failed: false, applied: false, combination: null, singleCount: 0, horizonRange: "GW6–10" };

  it("leads with the best plan when there is one", () => {
    expect(
      suggestionsSummary({
        ...base,
        combination: {
          transfers: [makeSuggestion(1, 2), makeSuggestion(3, 4)],
          totalProjectedGain: 20,
          hits: 1,
          netProjectedGain: 16,
          netProjectedGainPerGameweek: 3.2,
        },
      }),
    ).toBe("Best plan: 2 transfers, +3.2 pts/GW over GW6–10, counting −4 in hits.");
  });

  it("falls back to the single-transfer count, then to nothing found", () => {
    expect(suggestionsSummary({ ...base, singleCount: 3 })).toBe("3 single transfers worth a look over GW6–10.");
    expect(suggestionsSummary(base)).toBe("No standout swaps for this squad right now.");
  });

  it("reports loading and failure", () => {
    expect(suggestionsSummary({ ...base, loading: true })).toBe("Finding suggestions for this squad…");
    expect(suggestionsSummary({ ...base, failed: true })).toBe("Couldn't load suggestions.");
  });
});

describe("benchSlotLabel", () => {
  it("names the bench goalkeeper and numbers outfield subs in bench order", () => {
    const bench = makeSquad()
      .filter((p) => !p.isStarting)
      .sort((a, b) => a.squadPosition - b.squadPosition);
    const labels = bench.map((_, i) => benchSlotLabel(bench, i));
    expect(labels).toContain("bench goalkeeper");
    expect(labels.filter((l) => l.startsWith("substitute"))).toEqual(["substitute 1", "substitute 2", "substitute 3"]);
  });
});

describe("perGameweek", () => {
  it("formats a gain as points per gameweek with an explicit sign", () => {
    expect(perGameweek(6.48)).toBe("+6.5 pts/GW");
    expect(perGameweek(0)).toBe("+0.0 pts/GW");
    expect(perGameweek(-1.25)).toBe("−1.3 pts/GW");
  });
});
