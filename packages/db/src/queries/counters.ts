import { sql } from "drizzle-orm";

import type { Db } from "../db";
import { receiptCounters, requestCounters } from "../schema";

/**
 * Takes the next number in a gapless sequence. Run it inside the transaction
 * that writes the sale: the row lock makes concurrent sales wait, and a rolled
 * back sale gives its number back, so sequences never skip.
 */
export async function nextReceiptSequence(tx: Db, scope: string): Promise<number> {
  const [row] = await tx
    .insert(receiptCounters)
    .values({ scope, lastSequence: 1 })
    .onConflictDoUpdate({
      target: receiptCounters.scope,
      set: { lastSequence: sql`${receiptCounters.lastSequence} + 1` },
    })
    .returning({ value: receiptCounters.lastSequence });
  if (!row) throw new Error("Receipt counter did not return a value");
  return row.value;
}

/** Next stock request number (REQ-1044 …), gapless like receipts. */
export async function nextRequestSequence(tx: Db): Promise<number> {
  const [row] = await tx
    .insert(requestCounters)
    .values({ scope: "requests", lastSequence: 1000 })
    .onConflictDoUpdate({
      target: requestCounters.scope,
      set: { lastSequence: sql`${requestCounters.lastSequence} + 1` },
    })
    .returning({ value: requestCounters.lastSequence });
  if (!row) throw new Error("Request counter did not return a value");
  return row.value;
}

/** The next receipt number without taking it (for previews). */
export async function peekReceiptSequence(db: Db, scope: string): Promise<number> {
  const [row] = await db
    .select({ value: receiptCounters.lastSequence })
    .from(receiptCounters)
    .where(sql`${receiptCounters.scope} = ${scope}`);
  return (row?.value ?? 0) + 1;
}
