import type { Page } from "@playwright/test";

import { expect, test } from "../e2e/fixtures";

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function addToCart(page: Page, query: string, name: RegExp) {
  const search = page.getByRole("textbox", { name: "Search products" });
  await search.fill(query);
  await expect(page.getByRole("button", { name }).first()).toBeVisible();
  await search.press("Enter");
  await expect(page.getByRole("complementary", { name: "Current sale" })).toContainText(query, {
    ignoreCase: true,
  });
}

test.describe("selling for real", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "cashier1", "pos");
    await page.waitForURL(/\/pos\/?$/);
  });

  test("a cash sale is saved with a web receipt number", async ({ page }) => {
    await addToCart(page, "biogesic", /^Biogesic 500mg Tab/);
    await page.getByRole("button", { name: "Exact" }).click();
    await page.getByRole("button", { name: /^Charge ₱/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Payment received")).toBeVisible();
    await expect(dialog.getByText(/OR-[A-Z]{2,4}-W-\d{6}/).first()).toBeVisible();
    await dialog.getByRole("button", { name: "New sale" }).click();
    await expect(page.getByRole("complementary", { name: "Current sale" })).not.toContainText(
      "Biogesic",
    );
  });

  test("a GCash sale needs a 13-digit reference and stores it", async ({ page }) => {
    await addToCart(page, "cecon", /^Cecon 500mg Tab/);
    await page.keyboard.press("F7");
    const ref = page.getByRole("textbox", { name: "GCash reference number" });
    await ref.fill("12345");
    await expect(page.getByRole("button", { name: "Enter GCash reference" })).toBeDisabled();
    await ref.fill("1012 3456 78901");
    await page.keyboard.press("F9");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Payment received")).toBeVisible();
    await expect(dialog).toContainText("GCash");
  });

  test("a Senior / PWD sale is VAT-exempt with 20% off", async ({ page }) => {
    await addToCart(page, "biogesic", /^Biogesic 500mg Tab/);
    const discount = page.getByRole("combobox", { name: "Discount" });
    const option = await discount
      .locator("option", { hasText: "Senior / PWD" })
      .getAttribute("value");
    await discount.selectOption(option ?? "");
    await expect(page.getByText(/^VAT exempt \(Senior \/ PWD\)/)).toBeVisible();
    await page.getByRole("button", { name: "Exact" }).click();
    await page.getByRole("button", { name: /^Charge ₱/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Payment received")).toBeVisible();
    await expect(dialog).toContainText("Senior / PWD 20%");
  });
});

test("the admin sees today's sales in Sales activity", async ({ page }) => {
  await signIn(page, "admin", "admin");
  await page.waitForURL(/\/dashboard\/?$/);
  await page.goto("/activity");
  await expect(page.getByRole("row", { name: /-W-000003/ })).toBeVisible();
});
