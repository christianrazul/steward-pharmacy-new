import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

import { ADMIN_NAV, STAFF_NAV, finishAnimations, gotoApp, previewAs } from "./helpers";

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test.describe("admin shell", () => {
  test("lands on the dashboard with grouped navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

    const nav = mainNav(page);
    for (const group of ["Overview", "Store", "Admin"])
      await expect(nav.getByText(group, { exact: true })).toBeVisible();
    for (const label of ADMIN_NAV)
      await expect(nav.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Stock requests, 5 pending" })).toBeVisible();
  });

  test("navigates and keeps the breadcrumb in step", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await mainNav(page).getByRole("link", { name: "Inventory" }).click();
    await expect(page).toHaveURL(/\/inventory\/?$/);
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs).toContainText("Esperanza Buhangin");
    await expect(crumbs.locator("[aria-current=page]")).toHaveText("Inventory");
    await expect(mainNav(page).getByRole("link", { name: "Inventory" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("switches the working branch", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await page.getByRole("button", { name: /Switch branch/ }).click();
    await page.getByRole("menuitem", { name: /NCCC Market/ }).click();
    await expect(page.getByText("Switched to NCCC Market")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("NCCC Market");
  });

  test("opens the command menu with Ctrl+K and runs a page command", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command menu" });
    await expect(palette).toBeVisible();
    await page.keyboard.type("stock req");
    await page.keyboard.press("Enter");
    await expect(palette).toBeHidden();
    await expect(page).toHaveURL(/\/requests\/?$/);

    await page.keyboard.press("Meta+k");
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });
});

test.describe("staff shell", () => {
  test("shows only store pages, locks the branch and has no command menu", async ({ page }) => {
    await gotoApp(page, "/pos");
    await previewAs(page, "Cashier");

    const nav = mainNav(page);
    for (const label of STAFF_NAV)
      await expect(nav.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
    for (const label of ["Dashboard", "Sales activity", "Settings"]) {
      await expect(nav.getByRole("link", { name: label })).toHaveCount(0);
    }
    await expect(nav.getByRole("link", { name: "Stock requests, 2 pending" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Switch branch/ })).toHaveCount(0);
    await expect(page.getByTitle(/Only admins can switch branch/)).toContainText("NCCC Market");
    await expect(page.getByRole("button", { name: "Search" })).toHaveCount(0);

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command menu" })).toHaveCount(0);
  });

  test("is sent to the point of sale from an admin-only page", async ({ page }) => {
    await gotoApp(page, "/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await previewAs(page, "Cashier");
    await expect(page).toHaveURL(/\/pos\/?$/);
  });
});

test.describe("preferences", () => {
  test("keeps a collapsed sidebar on one center line, and remembers it without a flash", async ({
    page,
  }) => {
    await gotoApp(page, "/dashboard");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    const rail = page.getByRole("complementary", { name: "Sidebar" });
    await expect(rail).toHaveCSS("width", "60px");

    const centers = await rail
      .locator("[data-slot=logo], nav a svg, [data-slot=avatar]")
      .evaluateAll((elements) =>
        elements.map((el) => {
          const box = el.getBoundingClientRect();
          return Math.round(box.x + box.width / 2);
        }),
      );
    expect(centers.length).toBeGreaterThan(5);
    expect(new Set(centers).size).toBe(1);

    // On reload the attribute is set before the app hydrates, so the first paint is already collapsed.
    await page.reload({ waitUntil: "domcontentloaded" });
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-sidebar"))).toBe(
      "collapsed",
    );
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  });

  test("remembers the theme without a flash", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await gotoApp(page, "/dashboard");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload({ waitUntil: "domcontentloaded" });
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
      "dark",
    );
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(15, 15, 17)");
  });

  test("shows the offline banner and sync state", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await page.getByRole("button", { name: "Simulate offline" }).click();
    await expect(page.getByRole("status").filter({ hasText: "You’re offline." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync status: Offline" })).toBeVisible();
    await page.getByRole("button", { name: "Reconnect" }).click();
    await expect(page.getByText("Back online")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync status: Synced" })).toBeVisible();
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 360, height: 760 } });

  test("has no horizontal scroll and opens the menu as a sheet", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name: "Inventory" }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/inventory\/?$/);

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });
});

test.describe("accessibility", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`shell has no axe violations in ${theme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await gotoApp(page, "/dashboard");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        ),
      ).toEqual([]);
    });
  }

  test("command menu and mobile menu have no axe violations", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command menu" })).toBeVisible();
    await finishAnimations(page);
    let results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      results.violations.flatMap((v) =>
        v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary ?? ""}`),
      ),
    ).toEqual([]);

    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 360, height: 760 });
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
    await finishAnimations(page);
    results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
