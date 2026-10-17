import { describe, expect, it } from "vitest";
import { ACTIONS, can, roleLabel } from "./permissions";

describe("can", () => {
  it("lets admins do everything", () => {
    for (const action of ACTIONS) expect(can("admin", action)).toBe(true);
  });

  it("limits staff to selling, viewing inventory and requesting stock", () => {
    const allowed = ACTIONS.filter((action) => can("staff", action));
    expect(allowed).toEqual([
      "pos.sell",
      "inventory.view",
      "stock_requests.view",
      "stock_requests.create",
    ]);
  });

  it.each([
    "dashboard.view",
    "sales_activity.view",
    "settings.manage",
    "branches.switch",
    "command_palette.open",
    "stock_requests.review",
    "inventory.add_stock",
  ] as const)("refuses staff %s", (action) => {
    expect(can("staff", action)).toBe(false);
  });
});

describe("roleLabel", () => {
  it("labels admins and staff positions", () => {
    expect(roleLabel("admin", null)).toBe("Super admin");
    expect(roleLabel("staff", "pharmacy_assistant")).toBe("Pharmacy assistant");
    expect(roleLabel("staff", null)).toBe("Staff");
  });
});
