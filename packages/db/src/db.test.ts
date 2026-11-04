import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { MOCKUP_CORE_BATCHES, buildMockupDataset } from "./seed/mockup-dataset";
import { seedDatabase } from "./seed/seed";
import { ENGINES, createTestDb, type TestDb } from "./testing/engines";
import { getSettings, saveSettings } from "./queries/settings";
import { batchStock, onHandByProduct } from "./queries/stock";
import { nextReceiptSequence, nextRequestSequence, peekReceiptSequence } from "./queries/counters";
import { verifyPassword } from "./password";
import * as t from "./schema";

const now = new Date("2026-10-18T02:00:00Z");
const data = buildMockupDataset(now);

describe.each(ENGINES)("database on %s", (engine) => {
  let test: TestDb;

  beforeAll(async () => {
    test = await createTestDb(engine);
    await seedDatabase(test.db, data);
  }, 120_000);

  afterAll(async () => {
    await test.close();
  });

  it("seeds the mockup's data", async () => {
    const [counts] = await test.db
      .select({
        products: sql<number>`(select count(*)::int from products)`,
        branches: sql<number>`(select count(*)::int from branches)`,
        sales: sql<number>`(select count(*)::int from sales)`,
      })
      .from(sql`(select 1) as one`);
    expect(counts).toEqual({ products: 387, branches: 4, sales: data.sales.length });
  });

  it("computes on hand from the ledger at the mockup's quantities", async () => {
    const branchByCode = new Map(data.branches.map((b) => [b.code, b.id]));
    const productBySku = new Map(data.products.map((p) => [p.sku, p.id]));
    for (const expected of MOCKUP_CORE_BATCHES) {
      const branchId = branchByCode.get(expected.branchCode) ?? "";
      const productId = productBySku.get(expected.sku) ?? "";
      const stock = await batchStock(test.db, branchId, productId);
      expect(
        stock.find((b) => b.batchNo === expected.batchNo)?.onHand,
        `${expected.sku} ${expected.branchCode}`,
      ).toBe(expected.qty);
    }
    const esp = branchByCode.get("ESP") ?? "";
    const totals = await onHandByProduct(test.db, esp);
    expect(totals.get(productBySku.get("PS-1001") ?? "")).toBe(320);
  });

  it("stores argon2id hashes that verify", async () => {
    const admin = data.users.find((u) => u.username === "admin");
    const [account] = await test.db
      .select()
      .from(t.accounts)
      .where(eq(t.accounts.userId, admin?.id ?? ""));
    expect(account?.password).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(account?.password ?? "", "admin")).toBe(true);
    expect(await verifyPassword(account?.password ?? "", "wrong")).toBe(false);
  });

  it("stamps server_version on insert and update, and keeps it while applying a pull", async () => {
    const [before] = await test.db
      .select({ v: t.products.serverVersion })
      .from(t.products)
      .limit(1);
    const product = data.products[0];
    if (!product) throw new Error("no product");
    await test.db
      .update(t.products)
      .set({ brand: "Biogesic" })
      .where(eq(t.products.id, product.id));
    const [after] = await test.db
      .select({ v: t.products.serverVersion })
      .from(t.products)
      .where(eq(t.products.id, product.id));
    expect(after?.v).toBeGreaterThan(before?.v ?? 0);
    await test.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('steward.applying_pull', 'on', true)`);
      await tx.update(t.products).set({ serverVersion: 42 }).where(eq(t.products.id, product.id));
    });
    const [kept] = await test.db
      .select({ v: t.products.serverVersion })
      .from(t.products)
      .where(eq(t.products.id, product.id));
    expect(kept?.v).toBe(42);
  });

  it("refuses to change or delete ledger and sales rows", async () => {
    const movement = data.movements[0];
    const sale = data.sales[0];
    if (!movement || !sale) throw new Error("no rows");
    await expect(
      test.db.update(t.stockMovements).set({ qty: 1 }).where(eq(t.stockMovements.id, movement.id)),
    ).rejects.toThrow();
    await expect(test.db.delete(t.sales).where(eq(t.sales.id, sale.id))).rejects.toThrow();
  });

  it("enforces data rules in the database too", async () => {
    const product = data.products[0];
    const branch = data.branches[0];
    if (!product || !branch) throw new Error("no rows");
    await expect(
      test.db
        .insert(t.products)
        .values({ ...product, id: uuidv7(), sku: "PS-9999", priceCentavos: 0 }),
    ).rejects.toThrow();
    await expect(
      test.db.insert(t.batches).values({
        id: uuidv7(),
        productId: product.id,
        branchId: branch.id,
        batchNo: "B25-011",
        expiryDate: "2027-01-01",
      }),
    ).rejects.toThrow();
    await expect(
      test.db
        .insert(t.branches)
        .values({ ...branch, id: uuidv7(), code: "ZZZ", name: "Second central" }),
    ).rejects.toThrow();
  });

  it("reads and saves settings", async () => {
    expect(await getSettings(test.db)).toEqual({
      lowStockThreshold: 20,
      receiptPrefix: "OR",
      vatRateBp: 1200,
      vatMode: "inclusive",
    });
    const saved = await saveSettings(test.db, {
      lowStockThreshold: 15,
      receiptPrefix: "SP",
      vatRateBp: 1200,
      vatMode: "exclusive",
    });
    expect(saved).toMatchObject({
      lowStockThreshold: 15,
      receiptPrefix: "SP",
      vatMode: "exclusive",
    });
    await saveSettings(test.db, {
      lowStockThreshold: 20,
      receiptPrefix: "OR",
      vatRateBp: 1200,
      vatMode: "inclusive",
    });
  });

  it("hands out gapless receipt and request numbers, also under concurrency", async () => {
    const scope = `web:${uuidv7()}`;
    expect(await peekReceiptSequence(test.db, scope)).toBe(1);
    const numbers = await Promise.all(
      Array.from({ length: 10 }, () => test.db.transaction((tx) => nextReceiptSequence(tx, scope))),
    );
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await expect(
      test.db.transaction(async (tx) => {
        await nextReceiptSequence(tx, scope);
        throw new Error("sale failed");
      }),
    ).rejects.toThrow("sale failed");
    expect(await test.db.transaction((tx) => nextReceiptSequence(tx, scope))).toBe(11);
    expect(await test.db.transaction((tx) => nextRequestSequence(tx))).toBe(1044);
  });
});
