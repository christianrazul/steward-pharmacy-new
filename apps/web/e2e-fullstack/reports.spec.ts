import { readFile } from "node:fs/promises";

import { expect, test } from "../e2e/fixtures";
import { signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page, "admin");
});

test("the dashboard shows figures from the database", async ({ page }) => {
  await expect(page.getByText("Sales trend")).toBeVisible();
  await expect(page.getByRole("img", { name: /Sales trend/ })).toBeVisible();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.getByText("This month compared with last month")).toBeVisible();
});

test("sales activity exports a CSV with one row per receipt", async ({ page }) => {
  await page.goto("/activity");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const totals = page.getByText(/^Total · /);
  await expect(totals).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);
  const content = await readFile(await file.path(), "utf8");
  const [header, ...rows] = content.trim().split("\n");
  expect(header).toMatch(/^Receipt/);
  expect(rows.length).toBeGreaterThan(0);
  await expect(page.getByText(/^Exported [\d,]+ sales$/)).toBeVisible();
});
