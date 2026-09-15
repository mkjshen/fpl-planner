import { formatPrice, playerPhotoUrl, shirtUrl } from "./pitch";

describe("formatPrice", () => {
  it("formats tenths-of-a-million as pounds with one decimal", () => {
    expect(formatPrice(105)).toBe("£10.5m");
  });

  it("formats a whole-million price without a stray decimal artifact", () => {
    expect(formatPrice(100)).toBe("£10.0m");
  });

  it("handles a low-value bench player", () => {
    expect(formatPrice(38)).toBe("£3.8m");
  });
});

describe("shirtUrl", () => {
  it("builds the standard outfield shirt URL", () => {
    expect(shirtUrl(3, "DEF")).toBe(
      "https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_3-66.png",
    );
  });

  it("uses the goalkeeper kit variant for GK", () => {
    expect(shirtUrl(3, "GK")).toBe(
      "https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_3_1-66.png",
    );
  });
});

describe("playerPhotoUrl", () => {
  it("builds the portrait URL from the numeric photo code", () => {
    expect(playerPhotoUrl(154561)).toBe(
      "https://resources.premierleague.com/premierleague/photos/players/110x140/p154561.png",
    );
  });
});
