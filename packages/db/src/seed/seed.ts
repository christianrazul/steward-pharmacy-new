import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { Db } from "../db";
import { hashPassword } from "../password";
import * as t from "../schema";
import type { MockupDataset } from "./mockup-dataset";

/** Settings keys and how dataset settings map onto them. */
export function settingsRows(settings: MockupDataset["settings"]) {
  return [
    { key: "low_stock_threshold", value: settings.lowStockThreshold },
    { key: "receipt_prefix", value: settings.receiptPrefix },
    { key: "vat_rate_bp", value: settings.vatRateBp },
    { key: "vat_mode", value: settings.vatMode },
  ];
}

/** The internal Better Auth email for a user id (never shown, never mailed). */
export function placeholderEmail(userId: string): string {
  return `${userId}@users.invalid`;
}

async function insertChunked<T>(rows: T[], size: number, insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

/**
 * Loads the mockup dataset into an empty database (PostgreSQL or PGlite) in one
 * transaction. Demo passwords are hashed with argon2id like real ones.
 */
export async function seedDatabase(db: Db, data: MockupDataset): Promise<void> {
  const hashes = new Map<string, string>();
  for (const user of data.users) hashes.set(user.id, await hashPassword(user.demoPassword));

  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ count: sql<number>`count(*)::int` }).from(t.branches);
    if ((existing?.count ?? 0) > 0)
      throw new Error("The database already has data. Seed only runs on an empty database.");

    await tx.insert(t.branches).values(data.branches.map((branch) => ({ ...branch })));
    await tx.insert(t.users).values(
      data.users.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: placeholderEmail(user.id),
        emailVerified: true,
        username: user.username,
        displayUsername: user.username,
        role: user.role,
        position: user.position,
        branchId: user.branchId,
        phone: user.phone,
        contactEmail: user.email,
        address: user.address,
        prcLicenseNo: user.prcLicenseNo,
        active: user.active,
      })),
    );
    await tx.insert(t.accounts).values(
      data.users.map((user) => ({
        id: uuidv7(),
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hashes.get(user.id) ?? null,
      })),
    );
    await tx.insert(t.devices).values(
      data.devices.map((device) => ({
        id: device.id,
        branchId: device.branchId,
        label: device.label,
        receiptSeries: device.receiptSeries,
        printWidth: device.printWidth,
      })),
    );
    await insertChunked(data.products, 500, (chunk) => tx.insert(t.products).values(chunk));
    await insertChunked(data.batches, 500, (chunk) => tx.insert(t.batches).values(chunk));
    await tx.insert(t.discounts).values(data.discounts);
    await tx
      .insert(t.settings)
      .values(settingsRows(data.settings).map((row) => ({ id: uuidv7(), ...row })));

    await insertChunked(data.sales, 200, (chunk) =>
      tx.insert(t.sales).values(
        chunk.map(({ lines: _lines, ...sale }) => ({
          ...sale,
          createdAt: sale.soldAt,
          pricingSnapshot: { vatRateBp: data.settings.vatRateBp, vatMode: data.settings.vatMode },
        })),
      ),
    );
    const lines = data.sales.flatMap((sale) => sale.lines);
    await insertChunked(lines, 500, (chunk) =>
      tx.insert(t.saleLines).values(chunk.map(({ batches: _batches, ...line }) => line)),
    );
    const lineBatches = lines.flatMap((line) =>
      line.batches.map((allocation) => ({
        id: uuidv7(),
        saleLineId: line.id,
        batchId: allocation.batchId,
        qty: allocation.qty,
      })),
    );
    await insertChunked(lineBatches, 500, (chunk) => tx.insert(t.saleLineBatches).values(chunk));
    await insertChunked(data.movements, 500, (chunk) => tx.insert(t.stockMovements).values(chunk));

    await tx.insert(t.stockRequests).values(
      data.requests.map((request) => ({
        id: request.id,
        requestNo: request.requestNo,
        branchId: request.branchId,
        requestedByUserId: request.requestedByUserId,
        priority: request.priority,
        note: request.note,
        status: request.status,
        createdAt: request.createdAt,
      })),
    );
    await tx
      .insert(t.stockRequestItems)
      .values(
        data.requests.flatMap((request) =>
          request.items.map((item) => ({ id: uuidv7(), requestId: request.id, ...item })),
        ),
      );
    await tx
      .insert(t.stockRequestEvents)
      .values(
        data.requests.flatMap((request) =>
          request.events.map((event) => ({ ...event, requestId: request.id })),
        ),
      );

    await tx.insert(t.receiptCounters).values(
      Object.entries(data.nextReceiptSequence).map(([deviceId, next]) => ({
        scope: `device:${deviceId}`,
        lastSequence: next - 1,
      })),
    );
    await tx
      .insert(t.requestCounters)
      .values({ scope: "requests", lastSequence: data.nextRequestSequence - 1 });
  });
}
