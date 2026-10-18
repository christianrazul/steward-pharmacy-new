import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type {
  BranchInput,
  DeviceCreateInput,
  DiscountInput,
  SettingsInput,
  StaffCreateInput,
  StaffUpdateInput,
} from "@steward/domain";
import type {
  Branch,
  Device,
  DeviceEnrollment,
  Discount,
  Settings,
  StaffAccount,
} from "@steward/domain/view-models";
import { getSettings, hashPassword, placeholderEmail, saveSettings, schema } from "@steward/db";
import { randomInt } from "node:crypto";
import { v7 as uuidv7 } from "uuid";

import { sha256 } from "../auth/actor";
import { authorize } from "../auth/permissions";
import { conflict, invalid, notFound } from "../http/errors";
import { audit } from "./audit";
import type { ServiceContext } from "./context";
import { deviceById, staffById } from "./people-service";
import { listBranches, listDiscounts, readSettings } from "./reference-service";
import { revokeSessions } from "./session-service";

/**
 * Everything an admin configures. All of it is online-only: devices treat it
 * as read-only and the server wins. Every change writes an audit row.
 */

// -- general settings --------------------------------------------------------

export async function updateSettings(ctx: ServiceContext, input: SettingsInput): Promise<Settings> {
  authorize(ctx.actor, "settings.manage");
  await ctx.db.transaction(async (tx) => {
    const before = await getSettings(tx);
    const after = await saveSettings(tx, input);
    await audit(tx, ctx, {
      action: "settings.update",
      entity: "settings",
      entityId: null,
      before,
      after,
    });
  });
  return readSettings(ctx);
}

// -- branches ----------------------------------------------------------------

async function assertBranchUnique(
  ctx: ServiceContext,
  input: BranchInput,
  exceptId: string | null,
) {
  const clash = await ctx.db
    .select({ name: schema.branches.name, code: schema.branches.code })
    .from(schema.branches)
    .where(
      and(
        isNull(schema.branches.deletedAt),
        exceptId === null ? sql`true` : ne(schema.branches.id, exceptId),
        sql`(lower(${schema.branches.name}) = lower(${input.name}) or ${schema.branches.code} = ${input.code})`,
      ),
    );
  if (clash.some((row) => row.name.toLowerCase() === input.name.toLowerCase())) {
    throw conflict("A branch with that name already exists.", {
      name: "A branch with that name already exists.",
    });
  }
  if (clash.some((row) => row.code === input.code)) {
    throw conflict("Another branch uses this code.", { code: "Another branch uses this code." });
  }
}

async function branchView(ctx: ServiceContext, id: string): Promise<Branch> {
  const branch = (await listBranches(ctx)).find((row) => row.id === id);
  if (!branch) throw notFound("That branch no longer exists.");
  return branch;
}

export async function createBranch(ctx: ServiceContext, input: BranchInput): Promise<Branch> {
  authorize(ctx.actor, "settings.manage");
  await assertBranchUnique(ctx, input, null);
  const id = uuidv7();
  await ctx.db.transaction(async (tx) => {
    await tx.insert(schema.branches).values({ id, isCentral: false, ...input });
    await audit(tx, ctx, { action: "branch.create", entity: "branch", entityId: id, after: input });
  });
  return branchView(ctx, id);
}

export async function updateBranch(
  ctx: ServiceContext,
  id: string,
  input: BranchInput,
): Promise<Branch> {
  authorize(ctx.actor, "settings.manage");
  const [before] = await ctx.db
    .select()
    .from(schema.branches)
    .where(and(eq(schema.branches.id, id), isNull(schema.branches.deletedAt)));
  if (!before) throw notFound("That branch no longer exists.");
  await assertBranchUnique(ctx, input, id);
  await ctx.db.transaction(async (tx) => {
    await tx.update(schema.branches).set(input).where(eq(schema.branches.id, id));
    await audit(tx, ctx, {
      action: "branch.update",
      entity: "branch",
      entityId: id,
      before,
      after: input,
    });
  });
  return branchView(ctx, id);
}

/** Soft delete. Its staff move to central; past sales and stock records stay for reports. */
export async function deleteBranch(ctx: ServiceContext, id: string): Promise<void> {
  authorize(ctx.actor, "settings.manage");
  const [branch] = await ctx.db
    .select()
    .from(schema.branches)
    .where(and(eq(schema.branches.id, id), isNull(schema.branches.deletedAt)));
  if (!branch) throw notFound("That branch no longer exists.");
  if (branch.isCentral) throw invalid("Central can’t be removed.");
  const [central] = await ctx.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(and(eq(schema.branches.isCentral, true), isNull(schema.branches.deletedAt)));
  if (!central) throw invalid("Set up a central branch before removing others.");
  await ctx.db.transaction(async (tx) => {
    // Re-stamp the moved staff's password rows so central's counters pull them.
    await tx
      .update(schema.accounts)
      .set({ updatedAt: ctx.now() })
      .where(sql`${schema.accounts.userId} in (select id from users where branch_id = ${id})`);
    await tx
      .update(schema.users)
      .set({ branchId: central.id })
      .where(eq(schema.users.branchId, id));
    await tx
      .update(schema.devices)
      .set({ revokedAt: ctx.now().toISOString(), tokenHash: null })
      .where(eq(schema.devices.branchId, id));
    await tx
      .update(schema.branches)
      .set({ deletedAt: ctx.now().toISOString() })
      .where(eq(schema.branches.id, id));
    await audit(tx, ctx, {
      action: "branch.delete",
      entity: "branch",
      entityId: id,
      before: branch,
    });
  });
}

// -- staff accounts ------------------------------------------------------------

function staffAuditView(input: Omit<StaffUpdateInput, "password" | "passwordConfirm">) {
  return {
    fullName: input.fullName,
    position: input.position,
    branchId: input.branchId,
    active: input.active,
    hasPhone: input.phone !== "",
    hasEmail: input.email !== null,
    prcLicenseNo: input.prcLicenseNo,
  };
}

async function requireBranch(ctx: ServiceContext, branchId: string) {
  const [branch] = await ctx.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(and(eq(schema.branches.id, branchId), isNull(schema.branches.deletedAt)));
  if (!branch) throw notFound("That branch no longer exists.");
}

export async function createStaff(
  ctx: ServiceContext,
  input: StaffCreateInput,
): Promise<StaffAccount> {
  authorize(ctx.actor, "settings.manage");
  const [taken] = await ctx.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, input.username));
  if (taken) throw conflict("That username is taken.", { username: "That username is taken." });
  await requireBranch(ctx, input.branchId);
  const id = uuidv7();
  const passwordHash = await hashPassword(input.password);
  await ctx.db.transaction(async (tx) => {
    await tx.insert(schema.users).values({
      id,
      fullName: input.fullName,
      email: placeholderEmail(id),
      emailVerified: true,
      username: input.username,
      displayUsername: input.username,
      role: "staff",
      position: input.position,
      branchId: input.branchId,
      phone: input.phone,
      contactEmail: input.email,
      address: input.address,
      prcLicenseNo: input.position === "pharmacist" ? input.prcLicenseNo : null,
      active: input.active,
    });
    await tx.insert(schema.accounts).values({
      id: uuidv7(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
    });
    await audit(tx, ctx, {
      action: "user.create",
      entity: "user",
      entityId: id,
      after: { username: input.username, ...staffAuditView(input) },
    });
  });
  const created = await staffById(ctx, id);
  if (!created) throw notFound("That account no longer exists.");
  return created;
}

/** Usernames never change. A blank password keeps the current one; a new one ends their sessions. */
export async function updateStaff(
  ctx: ServiceContext,
  id: string,
  input: StaffUpdateInput,
): Promise<StaffAccount> {
  const actor = authorize(ctx.actor, "settings.manage");
  const before = await staffById(ctx, id);
  if (!before) throw notFound("That account no longer exists.");
  const isAdminRow = before.role === "admin";
  if (!isAdminRow) await requireBranch(ctx, input.branchId);
  if (!isAdminRow && id === actor.id && !input.active)
    throw invalid("You can’t deactivate your own account.");
  const passwordHash = input.password === "" ? null : await hashPassword(input.password);
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({
        fullName: input.fullName,
        phone: input.phone,
        contactEmail: input.email,
        address: input.address,
        ...(isAdminRow
          ? {}
          : {
              position: input.position,
              branchId: input.branchId,
              prcLicenseNo: input.position === "pharmacist" ? input.prcLicenseNo : null,
              active: input.active,
            }),
      })
      .where(eq(schema.users.id, id));
    // A new password, or a move to another branch (whose counters need the hash), re-stamps
    // the password row so devices pull it.
    const movedBranch = !isAdminRow && before.branchId !== input.branchId;
    if (passwordHash !== null || movedBranch) {
      await tx
        .update(schema.accounts)
        .set({ ...(passwordHash === null ? {} : { password: passwordHash }), updatedAt: ctx.now() })
        .where(and(eq(schema.accounts.userId, id), eq(schema.accounts.providerId, "credential")));
    }
    await audit(tx, ctx, {
      action: passwordHash === null ? "user.update" : "user.update_password",
      entity: "user",
      entityId: id,
      before: staffAuditView({
        ...before,
        email: before.email,
        phone: before.phone ?? "",
        address: before.address,
        prcLicenseNo: before.prcLicenseNo,
        position: before.position ?? "cashier",
      }),
      after: staffAuditView(input),
    });
  });
  if (passwordHash !== null || (!isAdminRow && !input.active)) await revokeSessions(ctx, id);
  const updated = await staffById(ctx, id);
  if (!updated) throw notFound("That account no longer exists.");
  return updated;
}

export async function setStaffActive(
  ctx: ServiceContext,
  id: string,
  active: boolean,
): Promise<StaffAccount> {
  authorize(ctx.actor, "settings.manage");
  const before = await staffById(ctx, id);
  if (!before) throw notFound("That account no longer exists.");
  if (before.role === "admin") throw invalid("Super admin accounts stay active.");
  await ctx.db.transaction(async (tx) => {
    await tx.update(schema.users).set({ active }).where(eq(schema.users.id, id));
    await audit(tx, ctx, {
      action: active ? "user.activate" : "user.deactivate",
      entity: "user",
      entityId: id,
      before: { active: before.active },
      after: { active },
    });
  });
  // Deactivating someone ends their sessions everywhere, immediately.
  if (!active) await revokeSessions(ctx, id);
  const updated = await staffById(ctx, id);
  if (!updated) throw notFound("That account no longer exists.");
  return updated;
}

/** Soft delete. Past sales keep pointing at the account. */
export async function deleteStaff(ctx: ServiceContext, id: string): Promise<void> {
  authorize(ctx.actor, "settings.manage");
  const before = await staffById(ctx, id);
  if (!before) throw notFound("That account no longer exists.");
  if (before.role === "admin") throw invalid("Super admin accounts can’t be deleted.");
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ deletedAt: ctx.now().toISOString(), active: false })
      .where(eq(schema.users.id, id));
    await audit(tx, ctx, {
      action: "user.delete",
      entity: "user",
      entityId: id,
      before: { username: before.username, fullName: before.fullName },
    });
  });
  await revokeSessions(ctx, id);
}

// -- discounts -----------------------------------------------------------------

async function assertDiscountName(ctx: ServiceContext, name: string, exceptId: string | null) {
  const [clash] = await ctx.db
    .select({ id: schema.discounts.id })
    .from(schema.discounts)
    .where(
      and(
        isNull(schema.discounts.deletedAt),
        sql`lower(${schema.discounts.name}) = lower(${name})`,
        exceptId === null ? sql`true` : ne(schema.discounts.id, exceptId),
      ),
    );
  if (clash)
    throw conflict("A discount with that name already exists.", {
      name: "A discount with that name already exists.",
    });
}

async function discountView(ctx: ServiceContext, id: string): Promise<Discount> {
  const discount = (await listDiscounts(ctx, true)).find((row) => row.id === id);
  if (!discount) throw notFound("That discount no longer exists.");
  return discount;
}

export async function createDiscount(ctx: ServiceContext, input: DiscountInput): Promise<Discount> {
  authorize(ctx.actor, "settings.manage");
  await assertDiscountName(ctx, input.name, null);
  const id = uuidv7();
  const values = { ...input, formula: input.mode === "formula" ? input.formula : null };
  await ctx.db.transaction(async (tx) => {
    await tx.insert(schema.discounts).values({ id, ...values });
    await audit(tx, ctx, {
      action: "discount.create",
      entity: "discount",
      entityId: id,
      after: values,
    });
  });
  return discountView(ctx, id);
}

/** Past sales keep their own discount amount and label; only future sales use the new rule. */
export async function updateDiscount(
  ctx: ServiceContext,
  id: string,
  input: DiscountInput,
): Promise<Discount> {
  authorize(ctx.actor, "settings.manage");
  const [before] = await ctx.db
    .select()
    .from(schema.discounts)
    .where(and(eq(schema.discounts.id, id), isNull(schema.discounts.deletedAt)));
  if (!before) throw notFound("That discount no longer exists.");
  await assertDiscountName(ctx, input.name, id);
  const values = { ...input, formula: input.mode === "formula" ? input.formula : null };
  await ctx.db.transaction(async (tx) => {
    await tx.update(schema.discounts).set(values).where(eq(schema.discounts.id, id));
    await audit(tx, ctx, {
      action: "discount.update",
      entity: "discount",
      entityId: id,
      before,
      after: values,
    });
  });
  return discountView(ctx, id);
}

export async function deleteDiscount(ctx: ServiceContext, id: string): Promise<void> {
  authorize(ctx.actor, "settings.manage");
  const [before] = await ctx.db
    .select()
    .from(schema.discounts)
    .where(and(eq(schema.discounts.id, id), isNull(schema.discounts.deletedAt)));
  if (!before) throw notFound("That discount no longer exists.");
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(schema.discounts)
      .set({ deletedAt: ctx.now().toISOString(), active: false })
      .where(eq(schema.discounts.id, id));
    await audit(tx, ctx, { action: "discount.delete", entity: "discount", entityId: id, before });
  });
}

// -- devices -------------------------------------------------------------------

const ENROLLMENT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ENROLLMENT_MINUTES = 15;

function newEnrollmentCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++)
    code += ENROLLMENT_ALPHABET.charAt(randomInt(ENROLLMENT_ALPHABET.length));
  return code;
}

async function issueEnrollment(ctx: ServiceContext, deviceId: string): Promise<DeviceEnrollment> {
  const code = newEnrollmentCode();
  const expiresAt = new Date(ctx.now().getTime() + ENROLLMENT_MINUTES * 60_000).toISOString();
  await ctx.db
    .update(schema.devices)
    .set({
      enrollmentCodeHash: sha256(code),
      enrollmentExpiresAt: expiresAt,
      enrolledByUserId: ctx.actor?.kind === "user" ? ctx.actor.user.id : null,
    })
    .where(eq(schema.devices.id, deviceId));
  const device = await deviceById(ctx, deviceId);
  if (!device) throw notFound("That device no longer exists.");
  return { device, code, expiresAt };
}

export async function createDevice(
  ctx: ServiceContext,
  input: DeviceCreateInput,
): Promise<DeviceEnrollment> {
  authorize(ctx.actor, "settings.manage");
  await requireBranch(ctx, input.branchId);
  const [clash] = await ctx.db
    .select({ id: schema.devices.id })
    .from(schema.devices)
    .where(
      and(
        eq(schema.devices.branchId, input.branchId),
        eq(schema.devices.receiptSeries, input.receiptSeries),
        isNull(schema.devices.revokedAt),
        isNull(schema.devices.deletedAt),
      ),
    );
  if (clash) {
    throw conflict("Another counter at this branch uses that receipt series.", {
      receiptSeries: "Another counter at this branch uses that receipt series.",
    });
  }
  const id = uuidv7();
  await ctx.db.transaction(async (tx) => {
    await tx.insert(schema.devices).values({ id, ...input });
    await audit(tx, ctx, { action: "device.create", entity: "device", entityId: id, after: input });
  });
  return issueEnrollment(ctx, id);
}

export async function renewEnrollmentCode(
  ctx: ServiceContext,
  id: string,
): Promise<DeviceEnrollment> {
  authorize(ctx.actor, "settings.manage");
  const device = await deviceById(ctx, id);
  if (!device) throw notFound("That device no longer exists.");
  if (device.revokedAt !== null)
    throw invalid("This device was revoked. Add it again as a new device.");
  await audit(ctx.db, ctx, { action: "device.enrollment_code", entity: "device", entityId: id });
  return issueEnrollment(ctx, id);
}

/** A revoked device is refused on its next request and locks itself. */
export async function revokeDevice(ctx: ServiceContext, id: string): Promise<Device> {
  authorize(ctx.actor, "settings.manage");
  const device = await deviceById(ctx, id);
  if (!device) throw notFound("That device no longer exists.");
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(schema.devices)
      .set({
        revokedAt: ctx.now().toISOString(),
        tokenHash: null,
        enrollmentCodeHash: null,
        enrollmentExpiresAt: null,
      })
      .where(eq(schema.devices.id, id));
    await audit(tx, ctx, {
      action: "device.revoke",
      entity: "device",
      entityId: id,
      before: { label: device.label, branchId: device.branchId },
    });
  });
  const updated = await deviceById(ctx, id);
  if (!updated) throw notFound("That device no longer exists.");
  return updated;
}
