import type { Page } from "@playwright/test";

/** Uses the dev-only "Preview as" switch in the account menu (NEXT_PUBLIC_DEV_ROLE_SWITCHER). */
export async function previewAs(page: Page, role: "Super admin" | "Cashier") {
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: role }).click();
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

/** Waits for open/close animations, so checks like color contrast see final colors. */
export async function finishAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );
}

/**
 * Opens an app page and waits until React has hydrated. The sync card's "synced"
 * line is only set by an effect in the browser, so seeing it means event handlers
 * (like the Ctrl+K shortcut) are attached.
 */
export async function gotoApp(page: Page, path: string) {
  await page.goto(path);
  await page
    .getByText(/All branches synced/)
    .first()
    .waitFor({ state: "attached" });
}
