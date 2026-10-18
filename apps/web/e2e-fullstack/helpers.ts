import type { Page } from "@playwright/test";

export async function signIn(page: Page, username: "admin" | "cashier1") {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(username === "admin" ? "admin" : "pos");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(username === "admin" ? /\/dashboard\/?$/ : /\/pos\/?$/);
}
