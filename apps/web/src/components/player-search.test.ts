import type { PlayerListItem } from "@/lib/api";
import { sortStatLabel } from "./player-search";

const player: PlayerListItem = {
  playerId: 1,
  webName: "Player",
  position: "MID",
  club: "TST",
  clubCode: 1,
  currentPrice: 80,
  status: "a",
  form: 6.5,
  totalPoints: 42,
  pointsPerGame: 5.25,
  ictIndex: 37.61,
  valueSeason: 8.03,
  selectedByPercent: 26.75,
};

// A reincluded player (see PlayerListItem's own doc comment) is built
// client-side without any of the sortable stat fields.
const reincludedPlayer: PlayerListItem = {
  playerId: 2,
  webName: "Freed Player",
  position: "DEF",
  club: "TST",
  clubCode: 1,
  currentPrice: 50,
  status: "a",
};

describe("sortStatLabel", () => {
  it("returns null for price (the row already shows price separately)", () => {
    expect(sortStatLabel(player, "price")).toBeNull();
  });

  it("formats form to one decimal place", () => {
    expect(sortStatLabel(player, "form")).toBe("6.5");
  });

  it("formats total points as a bare integer", () => {
    expect(sortStatLabel(player, "points")).toBe("42");
  });

  it("formats points-per-game to one decimal place", () => {
    expect(sortStatLabel(player, "points_per_game")).toBe("5.3");
  });

  it("formats ICT index to one decimal place", () => {
    expect(sortStatLabel(player, "ict")).toBe("37.6");
  });

  it("formats season value to one decimal place", () => {
    expect(sortStatLabel(player, "value")).toBe("8.0");
  });

  it("formats ownership with a percent sign", () => {
    expect(sortStatLabel(player, "ownership")).toBe("26.8%");
  });

  it("returns null for every sort field a reincluded player lacks", () => {
    expect(sortStatLabel(reincludedPlayer, "form")).toBeNull();
    expect(sortStatLabel(reincludedPlayer, "points")).toBeNull();
    expect(sortStatLabel(reincludedPlayer, "points_per_game")).toBeNull();
    expect(sortStatLabel(reincludedPlayer, "ict")).toBeNull();
    expect(sortStatLabel(reincludedPlayer, "value")).toBeNull();
    expect(sortStatLabel(reincludedPlayer, "ownership")).toBeNull();
  });
});
