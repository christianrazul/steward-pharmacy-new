import type { CsvExport, DashboardData, SaleReceipt, SalesPage } from "@steward/domain/view-models";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "./testing/test-app";

let t: TestApp;
let adminCookie = "";
let staffCookie = "";
let central = "";

// Sunday 18 October 2026, 10:00 in Manila. The week started Monday the 12th.
const NOW = new Date("2026-10-18T02:00:00Z");
const SAT_2359_MANILA = new Date("2026-10-17T15:59:30Z");
const SUN_0001_MANILA = new Date("2026-10-17T16:01:00Z");

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function get<T>(path: string, cookie = adminCookie): Promise<T> {
  return body<T>(await t.request(path, { cookie }));
}

/** Sells one unit of the cheapest in-stock product at central, at the given moment. */
async function sellAt(at: Date): Promise<SaleReceipt> {
  t.setNow(at);
  const product = t.data.products.find((row) => row.sku === "PS-1001");
  const res = await t.request("/sales", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      id: uuidv7(),
      branchId: central,
      lines: [{ productId: product?.id, qty: 1 }],
      discountId: null,
      payment: { method: "cash", cashReceivedCentavos: product?.priceCentavos },
      expectedTotalCentavos: product?.priceCentavos,
    }),
  });
  t.setNow(NOW);
  if (res.status !== 201) throw new Error(await res.text());
  return body<SaleReceipt>(res);
}

beforeAll(async () => {
  t = await createTestApp({ now: NOW });
  adminCookie = await t.signInAs("admin", "admin");
  staffCookie = await t.signInAs("cashier1", "pos");
  central = t.data.branches.find((row) => row.isCentral)?.id ?? "";
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("days are Manila days", () => {
  it("a sale at 11:59 PM lands on that day, and one at 12:01 AM on the next", async () => {
    const weekBefore = await get<DashboardData>(`/dashboard?period=week&branchId=${central}`);
    const late = await sellAt(SAT_2359_MANILA);
    const early = await sellAt(SUN_0001_MANILA);

    const today = await get<SalesPage>(`/sales?period=today&branchId=${central}&pageSize=100`);
    const receipts = today.rows.map((row) => row.receiptNo);
    expect(receipts).toContain(early.receiptNo);
    expect(receipts).not.toContain(late.receiptNo);

    const weekAfter = await get<DashboardData>(`/dashboard?period=week&branchId=${central}`);
    const delta = weekAfter.trend.map(
      (point, index) => point.current - (weekBefore.trend[index]?.current ?? 0),
    );
    // Monday first: index 5 is Saturday the 17th, index 6 is Sunday the 18th.
    expect(weekAfter.trend[5]?.label).toBe("Sat");
    expect(delta).toEqual([0, 0, 0, 0, 0, late.total, early.total]);

    const csv = await get<CsvExport>(`/sales/export?period=week&branchId=${central}`);
    const line = csv.content.split("\n").find((row) => row.includes(late.receiptNo));
    expect(line).toContain("2026-10-17 23:59");
  });
});

describe("dashboard and sales activity agree", () => {
  it.each(["today", "week", "month", "quarter", "year"])(
    "for %s, per branch and for all branches",
    async (period) => {
      for (const branchId of [null, ...t.data.branches.map((row) => row.id)]) {
        const scope = branchId === null ? "" : `&branchId=${branchId}`;
        const dashboard = await get<DashboardData>(`/dashboard?period=${period}${scope}`);
        const sales = await get<SalesPage>(`/sales?period=${period}${scope}`);
        expect(dashboard.kpis.revenue).toBe(sales.totals.revenue);
        expect(dashboard.kpis.transactions).toBe(sales.totals.receipts);
        expect(dashboard.trend.reduce((sum, point) => sum + point.current, 0)).toBe(
          sales.totals.revenue,
        );
        if (branchId === null) {
          const shares = dashboard.branchPerformance.reduce((sum, row) => sum + row.revenue, 0);
          expect(shares).toBe(sales.totals.revenue);
        }
      }
    },
  );
});

describe("CSV export", () => {
  it("has a header, one row per receipt and the same totals", async () => {
    const csv = await get<CsvExport>(`/sales/export?period=month`);
    const sales = await get<SalesPage>(`/sales?period=month`);
    const lines = csv.content.trim().split("\n");
    expect(lines[0]).toMatch(/^Receipt/);
    expect(lines).toHaveLength(sales.totals.receipts + 1);
    expect(csv.rows).toBe(sales.totals.receipts);
    expect(csv.filename).toMatch(/\.csv$/);
  });

  it("uses the same permission checks as sales activity", async () => {
    const res = await t.request("/sales/export?period=month", { cookie: staffCookie });
    expect(res.status).toBe(403);
    const anonymous = await t.request("/sales/export?period=month");
    expect(anonymous.status).toBe(401);
  });
});
