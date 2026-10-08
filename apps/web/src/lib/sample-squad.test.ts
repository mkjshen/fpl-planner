import { validationError } from "@/components/lineup-planner";
import { SAMPLE_BUDGET, SAMPLE_PLAN, SAMPLE_SQUAD } from "./sample-squad";

// The landing page shows this squad as an example of the planner's output,
// so it must obey the same classic FPL rules the planner enforces.
describe("SAMPLE_SQUAD", () => {
  it("is a valid 15 with a legal starting XI, captain and vice-captain", () => {
    expect(SAMPLE_SQUAD).toHaveLength(15);
    expect(validationError(SAMPLE_SQUAD)).toBeNull();
  });

  it("has at most 3 players from any one club", () => {
    const counts = new Map<string, number>();
    for (const p of SAMPLE_SQUAD) counts.set(p.club, (counts.get(p.club) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
  });

  it("fits the budget exactly with the bank the plan leaves", () => {
    const spent = SAMPLE_SQUAD.reduce((sum, p) => sum + p.currentPrice, 0);
    expect(spent + SAMPLE_PLAN.bankAfter).toBe(SAMPLE_BUDGET);
  });

  it("reflects its planned transfer, with the bank moving by the price difference", () => {
    expect(SAMPLE_SQUAD.some((p) => p.webName === SAMPLE_PLAN.in.webName)).toBe(true);
    expect(SAMPLE_SQUAD.some((p) => p.webName === SAMPLE_PLAN.out.webName)).toBe(false);
    expect(SAMPLE_PLAN.bankBefore + SAMPLE_PLAN.out.price - SAMPLE_PLAN.in.price).toBe(SAMPLE_PLAN.bankAfter);
  });
});
