import { expect, test } from "./fixtures";
import { signInAs } from "./helpers";

test.describe("every screen as admin", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "admin");
  });

  test("dashboard shows real figures and the trend chart", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Richard/ }),
    ).toBeVisible();
    await expect(page.getByText("Sales trend")).toBeVisible();
    await expect(page.getByText("Branch performance")).toBeVisible();
    await expect(page.getByText("Expiring soon")).toBeVisible();
    await page.getByRole("button", { name: "Month", exact: true }).click();
    await expect(page.getByText("This month compared with last month")).toBeVisible();
  });

  test("point of sale sells with cash and shows the receipt", async ({ page }) => {
    await page.goto("/pos");
    const search = page.getByRole("textbox", { name: "Search products" });
    await search.fill("biogesic");
    await expect(page.getByRole("button", { name: /^Biogesic 500mg Tab/ }).first()).toBeVisible();
    await search.press("Enter");
    await expect(page.getByRole("complementary", { name: "Current sale" })).toContainText(
      "Biogesic 500mg Tab",
    );
    await page.getByRole("button", { name: "Exact" }).click();
    await page.getByRole("button", { name: /^Charge ₱/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Payment received")).toBeVisible();
    await expect(dialog.getByText(/OR-ESP-W-000001/).first()).toBeVisible();
    await dialog.getByRole("button", { name: "New sale" }).click();
  });

  test("point of sale requires a 13-digit GCash reference", async ({ page }) => {
    await page.goto("/pos");
    const search = page.getByRole("textbox", { name: "Search products" });
    await search.fill("cecon");
    await expect(page.getByRole("button", { name: /^Cecon 500mg Tab/ }).first()).toBeVisible();
    await search.press("Enter");
    await page.keyboard.press("F7");
    const ref = page.getByRole("textbox", { name: "GCash reference number" });
    await ref.fill("12345");
    await expect(page.getByText("Reference numbers are 13 digits.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter GCash reference" })).toBeDisabled();
    await ref.fill("1234 5678 90123");
    await page.keyboard.press("F9");
    await expect(page.getByRole("dialog").getByText("Payment received")).toBeVisible();
  });

  test("inventory filters, expands batches and opens Add stock", async ({ page }) => {
    await page.goto("/inventory?status=low_stock");
    await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("low_stock");
    await page.getByRole("combobox", { name: "Status" }).selectOption("all");
    await page.getByRole("textbox", { name: "Search inventory" }).fill("biogesic");
    await page
      .getByRole("row", { name: /Biogesic/ })
      .first()
      .click();
    await expect(page.getByText("Batches sell first-expiry, first-out (FIFO)")).toBeVisible();
    await expect(page.getByText("Sells next")).toBeVisible();
    await page.getByRole("button", { name: "Add stock" }).click();
    const sheet = page.getByRole("dialog", { name: "Add stock" });
    await sheet.getByRole("button", { name: "Add to inventory" }).click();
    await expect(sheet.getByText("Pick the product you’re receiving.")).toBeVisible();
    await sheet.getByRole("button", { name: "New product" }).click();
    await expect(sheet.getByText("Is taxable")).toBeVisible();
  });

  test("stock requests: approve and fulfill from the sheet", async ({ page }) => {
    await page.goto("/requests");
    await page.getByRole("row", { name: /REQ-1043/ }).click();
    const sheet = page.getByRole("dialog", { name: /REQ-1043/ });
    await expect(sheet.getByText("Timeline")).toBeVisible();
    await sheet.getByRole("button", { name: "Approve allocation" }).click();
    await expect(page.getByText("REQ-1043 approved")).toBeVisible();
    await page.getByRole("button", { name: /^Approved/ }).click();
    await page.getByRole("row", { name: /REQ-1043/ }).click();
    await page
      .getByRole("dialog", { name: /REQ-1043/ })
      .getByRole("button", { name: "Mark fulfilled" })
      .click();
    await expect(page.getByText("REQ-1043 fulfilled")).toBeVisible();
  });

  test("sales activity lists receipts with totals and opens a receipt", async ({ page }) => {
    await page.goto("/activity");
    await page.getByRole("button", { name: "Month", exact: true }).click();
    await expect(page.getByText(/^Total · /)).toBeVisible();
    await page.getByRole("row", { name: /OR-/ }).first().click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Reprint" })).toBeVisible();
  });

  test("settings tabs and the discount preview", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Low-stock alert")).toBeVisible();
    await page.getByRole("tab", { name: "Branches" }).click();
    await expect(page.getByRole("cell", { name: /Esperanza Buhangin/ }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Staff accounts" }).click();
    await expect(page.getByText("Liza Mendoza")).toBeVisible();
    await page.getByRole("tab", { name: "Discounts" }).click();
    await page.getByRole("button", { name: "Add discount" }).click();
    const dialog = page.getByRole("dialog", { name: "Add discount" });
    await dialog.getByLabel("Percent off").fill("20");
    await expect(dialog.getByText("Customer saves ₱200.00")).toBeVisible();
    await dialog.getByRole("button", { name: "Formula", exact: true }).click();
    await dialog.getByLabel("Formula").fill("price * 2");
    await dialog.getByRole("button", { name: "Add discount" }).click();
    await expect(dialog.getByText('Unknown name "price".').first()).toBeVisible();
  });
});

test.describe("every screen as staff", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "cashier1");
  });

  test("lands on the point of sale and cannot open admin pages", async ({ page }) => {
    await expect(page).toHaveURL(/\/pos\/?$/);
    for (const path of ["/dashboard", "/activity", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/pos\/?$/);
    }
  });

  test("inventory is locked to the assigned branch", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page.getByRole("combobox", { name: "Branch" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Request stock" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add stock" })).toHaveCount(0);
  });

  test("composes and sends a stock request", async ({ page }) => {
    await page.goto("/requests");
    await expect(page.getByText("Running low", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Search products" }).fill("cecon");
    await page.getByRole("option", { name: /Cecon 500mg Tab/ }).click();
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText(/REQ-1044 sent to central/)).toBeVisible();
  });
});
