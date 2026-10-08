import { expect, test } from "@playwright/test";

// Same known-good real FPL team ID used for manual smoke testing throughout
// this project (see CLAUDE.md/session history) — importing hits the real
// FPL API, so this test's data isn't fully controlled, which is why the
// assertions below only pin down "the feature loaded successfully in some
// valid state" rather than asserting on specific suggested players.
const REAL_FPL_TEAM_ID = "2300727";

function uniqueEmail(): string {
  return `e2e-suggestions-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const PASSWORD = "playwright-test-password";

test("suggested transfers panel loads for a real imported squad", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Playwright Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByLabel("FPL team ID").fill(REAL_FPL_TEAM_ID);
  await page.getByRole("button", { name: "Import" }).click();
  // Hits the real FPL API — slower and less predictable than the rest of
  // this suite, hence the longer timeout.
  // Importing lands on the planner's current gameweek: the real squad,
  // read-only, with planning one click away.
  await expect(page.getByText("Team linked")).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard\/planner\?gameweek=current/);

  await page.getByRole("button", { name: /^Plan Gameweek \d+/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/planner\?gameweek=\d+/);

  await expect(page.getByRole("heading", { name: "Suggested transfers" })).toBeVisible();
  // The panel starts collapsed to a one-line summary; open it to see the cards.
  await page.getByRole("button", { name: "Show suggested transfers" }).click();

  // Whatever real data produced, the panel must land on exactly one of:
  // at least one suggestion card (an "Apply" button), or the explicit
  // empty-state message. Anything else (stuck loading, an error banner)
  // fails the test.
  const applyButton = page.getByRole("button", { name: "Apply" }).first();
  const emptyState = page.getByText("No standout swaps found for this squad right now.");
  await expect(applyButton.or(emptyState)).toBeVisible({ timeout: 10_000 });
});
