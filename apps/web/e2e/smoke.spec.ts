import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Steward Pharmacy" })).toBeVisible();
  await expect(page.getByTestId("peso-sample")).toHaveText("₱1,234.56");
});
