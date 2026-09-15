import { expect, test } from "@playwright/test";

function uniqueEmail(): string {
  // Randomized per run so repeat test runs against the real local Postgres
  // don't collide with a previous run's row (see playwright.config.ts).
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const PASSWORD = "playwright-test-password";

test("sign up redirects to the dashboard and shows the link-team form", async ({ page }) => {
  await page.goto("/sign-up");

  await page.getByLabel("Name").fill("Playwright Test");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByLabel("FPL team ID")).toBeVisible();
});

// Regression coverage for the bug fixed this session: sign-up normalizes
// email casing before storing it, but sign-in's authorize() didn't apply
// the same normalization — so a user who typed a differently-cased email
// than they signed up with got "Incorrect email or password" even with
// the right password.
test("signing back in with a different email casing still works", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Playwright Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email.toUpperCase());
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
});

test("sign-in with the wrong password shows an error banner", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Playwright Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Sign out" }).click();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});
