import type { Page } from "@playwright/test";

/** Uses the dev-only "Preview as" switch in the account menu (NEXT_PUBLIC_DEV_ROLE_SWITCHER). */
export async function previewAs(page: Page, role: "Super admin" | "Cashier") {
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: role }).click();
}

const PASSWORDS: Record<string, string> = { admin: "admin", cashier1: "pos" };

/** Signs in through the sign-in form and waits for the home page. */
export async function signInAs(page: Page, username: "admin" | "cashier1") {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORDS[username] ?? "");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(username === "admin" ? /\/dashboard\/?$/ : /\/pos\/?$/);
  await page
    .getByText(/All branches synced/)
    .first()
    .waitFor({ state: "attached" });
}

/** Opens an app page after signing in, and waits until React has hydrated. */
export async function gotoApp(page: Page, path: string, username: "admin" | "cashier1" = "admin") {
  await signInAs(page, username);
  await page.goto(path);
  await page
    .getByText(/All branches synced/)
    .first()
    .waitFor({ state: "attached" });
}

/** Waits for open/close animations, so checks like color contrast see final colors. */
export async function finishAnimations(page: Page) {
  // Only finite animations; skeleton pulses and spinners never finish.
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
}

export const ADMIN_NAV = [
  "Dashboard",
  "Sales activity",
  "Point of sale",
  "Inventory",
  "Stock requests",
  "Settings",
];
export const STAFF_NAV = ["Point of sale", "Inventory", "Stock requests"];
