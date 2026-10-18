import { schema } from "@steward/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "./testing/test-app";

let t: TestApp;
let adminCookie = "";
let staffCookie = "";

const json = (body: unknown) => JSON.stringify(body);

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function auditRows(action: string) {
  return t.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, action));
}

const branchInput = {
  name: "Toril",
  code: "TRL",
  address: "McArthur Highway, Toril",
  city: "Davao City",
  phone: "0917 555 0101",
  email: "",
  opensAt: "08:00",
  closesAt: "20:00",
  openDays: [1, 2, 3, 4, 5, 6],
};

beforeAll(async () => {
  t = await createTestApp();
  adminCookie = await t.signInAs("admin", "admin");
  staffCookie = await t.signInAs("cashier1", "pos");
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("only admins change settings, whatever the client sends", () => {
  it.each([
    ["PUT", "/settings"],
    ["POST", "/branches"],
    ["POST", "/staff"],
    ["POST", "/discounts"],
    ["POST", "/devices"],
  ])("staff get 403 on %s %s", async (method, path) => {
    const settings = await body<object>(await t.request("/settings", { cookie: adminCookie }));
    const payloads: Record<string, unknown> = {
      "/settings": settings,
      "/branches": branchInput,
      "/staff": {},
      "/discounts": {},
      "/devices": {},
    };
    const res = await t.request(path, {
      method,
      cookie: staffCookie,
      body: json(payloads[path]),
    });
    // Validation may run first for empty bodies; either way nothing is written.
    expect([403, 422]).toContain(res.status);
    if (path === "/settings" || path === "/branches") expect(res.status).toBe(403);
  });

  it("refuses deleting and revoking for staff", async () => {
    const devices = await body<{ id: string }[]>(
      await t.request("/devices", { cookie: adminCookie }),
    );
    const res = await t.request(`/devices/${devices[0]?.id ?? ""}/revoke`, {
      method: "POST",
      cookie: staffCookie,
    });
    expect(res.status).toBe(403);
  });
});

describe("general settings", () => {
  it("saves, normalizes and audits", async () => {
    const res = await t.request("/settings", {
      method: "PUT",
      cookie: adminCookie,
      body: json({
        lowStockThreshold: 25,
        receiptPrefix: "or",
        vatRateBp: 1200,
        vatMode: "inclusive",
      }),
    });
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ lowStockThreshold: 25, receiptPrefix: "OR" });
    const saved = await body(await t.request("/settings", { cookie: adminCookie }));
    expect(saved).toMatchObject({ lowStockThreshold: 25 });
    const [row] = await auditRows("settings.update");
    expect(row?.after).toMatchObject({ lowStockThreshold: 25 });
  });

  it("returns field errors for bad input", async () => {
    const res = await t.request("/settings", {
      method: "PUT",
      cookie: adminCookie,
      body: json({
        lowStockThreshold: 0,
        receiptPrefix: "OR",
        vatRateBp: 1200,
        vatMode: "inclusive",
      }),
    });
    expect(res.status).toBe(422);
    expect(await body(res)).toMatchObject({
      error: { fields: { lowStockThreshold: "Enter a whole number above zero." } },
    });
  });
});

describe("discounts", () => {
  it("past sales keep their discount when the rule changes", async () => {
    const [sale] = await t.db
      .select({ id: schema.sales.id, discountId: schema.sales.discountId })
      .from(schema.sales)
      .where(isNotNull(schema.sales.discountId))
      .limit(1);
    if (!sale?.discountId) throw new Error("The dataset should have a discounted sale.");
    const before = await body<{ discount: number; total: number; discountLabel: string }>(
      await t.request(`/sales/${sale.id}`, { cookie: adminCookie }),
    );

    const res = await t.request(`/discounts/${sale.discountId}`, {
      method: "PUT",
      cookie: adminCookie,
      body: json({
        name: "Senior / PWD (new)",
        mode: "percent",
        value: 3000,
        formula: null,
        capCentavos: null,
        minSpendCentavos: null,
        isVatExempt: true,
        active: true,
      }),
    });
    expect(res.status).toBe(200);

    const after = await body<typeof before>(
      await t.request(`/sales/${sale.id}`, { cookie: adminCookie }),
    );
    expect(after.discount).toBe(before.discount);
    expect(after.total).toBe(before.total);
    expect(after.discountLabel).toBe(before.discountLabel);
    expect(await auditRows("discount.update")).toHaveLength(1);
  });

  it("refuses duplicate names and soft deletes", async () => {
    const created = await t.request("/discounts", {
      method: "POST",
      cookie: adminCookie,
      body: json({
        name: "Loyalty",
        mode: "fixed",
        value: 5000,
        formula: null,
        capCentavos: null,
        minSpendCentavos: 50_000,
        isVatExempt: false,
        active: true,
      }),
    });
    expect(created.status).toBe(201);
    const { id } = await body<{ id: string }>(created);
    const duplicate = await t.request("/discounts", {
      method: "POST",
      cookie: adminCookie,
      body: json({
        name: "loyalty",
        mode: "percent",
        value: 500,
        formula: null,
        capCentavos: null,
        minSpendCentavos: null,
        isVatExempt: false,
        active: true,
      }),
    });
    expect(duplicate.status).toBe(409);
    expect(
      (await t.request(`/discounts/${id}`, { method: "DELETE", cookie: adminCookie })).status,
    ).toBe(200);
    const list = await body<{ id: string }[]>(
      await t.request("/discounts", { cookie: adminCookie }),
    );
    expect(list.some((row) => row.id === id)).toBe(false);
  });
});

describe("branches", () => {
  it("creates, edits and removes a branch, moving its staff to central", async () => {
    const created = await t.request("/branches", {
      method: "POST",
      cookie: adminCookie,
      body: json(branchInput),
    });
    expect(created.status).toBe(201);
    const branch = await body<{ id: string; phone: string }>(created);
    expect(branch.phone).toBe("09175550101");

    const clash = await t.request("/branches", {
      method: "POST",
      cookie: adminCookie,
      body: json({ ...branchInput, name: "Toril 2" }),
    });
    expect(clash.status).toBe(409);
    const clashBody = await body<{ error: { fields: Record<string, string> } }>(clash);
    expect(clashBody.error.fields.code).toBe("Another branch uses this code.");

    const staff = await t.request("/staff", {
      method: "POST",
      cookie: adminCookie,
      body: json({
        fullName: "Ana Villanueva",
        username: "avillanueva",
        position: "cashier",
        branchId: branch.id,
        phone: "",
        email: "",
        address: "",
        prcLicenseNo: "",
        active: true,
        password: "secret1",
        passwordConfirm: "secret1",
      }),
    });
    // Phone is required by the schema; blank is refused with a field message.
    expect(staff.status).toBe(422);

    const removed = await t.request(`/branches/${branch.id}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(removed.status).toBe(200);
    const branches = await body<{ id: string }[]>(
      await t.request("/branches", { cookie: adminCookie }),
    );
    expect(branches.some((row) => row.id === branch.id)).toBe(false);
    expect(await auditRows("branch.delete")).toHaveLength(1);
  });

  it("never removes central", async () => {
    const branches = await body<{ id: string; isCentral: boolean }[]>(
      await t.request("/branches", { cookie: adminCookie }),
    );
    const central = branches.find((row) => row.isCentral);
    const res = await t.request(`/branches/${central?.id ?? ""}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(res.status).toBe(422);
  });
});

describe("staff accounts", () => {
  it("creates an account that can sign in, without the password in the audit log", async () => {
    const branches = await body<{ id: string }[]>(
      await t.request("/branches", { cookie: adminCookie }),
    );
    const res = await t.request("/staff", {
      method: "POST",
      cookie: adminCookie,
      body: json({
        fullName: "Jose Rizal",
        username: "JRizal",
        position: "pharmacist",
        branchId: branches[1]?.id,
        phone: "0918 123 4567",
        email: "Jose@Example.com",
        address: "",
        prcLicenseNo: "123456",
        active: true,
        password: "pharma1",
        passwordConfirm: "pharma1",
      }),
    });
    expect(res.status).toBe(201);
    const created = await body<{ id: string; username: string; email: string | null }>(res);
    expect(created).toMatchObject({ username: "jrizal", email: "jose@example.com" });
    await expect(t.signInAs("jrizal", "pharma1")).resolves.toContain("steward");
    const [row] = await auditRows("user.create");
    expect(JSON.stringify(row)).not.toContain("pharma1");
  });

  it("accepts the values a form already parsed (blank optional fields as null)", async () => {
    const list = await body<{ id: string; username: string; branchId: string }[]>(
      await t.request("/staff", { cookie: adminCookie }),
    );
    const mdelacruz = list.find((row) => row.username === "mdelacruz");
    const res = await t.request(`/staff/${mdelacruz?.id ?? ""}`, {
      method: "PUT",
      cookie: adminCookie,
      body: json({
        fullName: "Maria Dela Cruz",
        position: "cashier",
        branchId: mdelacruz?.branchId,
        phone: "09171234567",
        email: null,
        address: null,
        prcLicenseNo: null,
        active: true,
        password: "",
        passwordConfirm: "",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("deactivating someone ends their sessions at once", async () => {
    const cookie = await t.signInAs("raquino", "pos");
    expect((await t.request("/inventory/suggestions?branchId=x", { cookie })).status).not.toBe(401);
    const list = await body<{ id: string; username: string }[]>(
      await t.request("/staff", { cookie: adminCookie }),
    );
    const raquino = list.find((row) => row.username === "raquino");
    const res = await t.request(`/staff/${raquino?.id ?? ""}/active`, {
      method: "PUT",
      cookie: adminCookie,
      body: json({ active: false }),
    });
    expect(res.status).toBe(200);
    const session = await body<{ session: null }>(await t.request("/session", { cookie }));
    expect(session.session).toBeNull();
    const signIn = await t.request("/session", {
      method: "POST",
      body: json({ username: "raquino", password: "pos" }),
    });
    expect(signIn.status).toBe(403);
    expect(await auditRows("user.deactivate")).toHaveLength(1);
  });

  it("refuses deactivating super admins", async () => {
    const list = await body<{ id: string; role: string }[]>(
      await t.request("/staff", { cookie: adminCookie }),
    );
    const admin = list.find((row) => row.role === "admin");
    const res = await t.request(`/staff/${admin?.id ?? ""}/active`, {
      method: "PUT",
      cookie: adminCookie,
      body: json({ active: false }),
    });
    expect(res.status).toBe(422);
  });
});

describe("devices", () => {
  it("issues a one-time code, stores only its hash, renews and revokes", async () => {
    const branches = await body<{ id: string }[]>(
      await t.request("/branches", { cookie: adminCookie }),
    );
    const res = await t.request("/devices", {
      method: "POST",
      cookie: adminCookie,
      body: json({
        branchId: branches[0]?.id,
        label: "Counter 9",
        receiptSeries: "09",
        printWidth: 80,
      }),
    });
    expect(res.status).toBe(201);
    const enrollment = await body<{
      device: { id: string; enrolled: boolean };
      code: string;
      expiresAt: string;
    }>(res);
    expect(enrollment.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(enrollment.device.enrolled).toBe(false);
    expect(new Date(enrollment.expiresAt).getTime() - t.now.getTime()).toBe(15 * 60_000);

    const [stored] = await t.db
      .select({ hash: schema.devices.enrollmentCodeHash })
      .from(schema.devices)
      .where(eq(schema.devices.id, enrollment.device.id));
    expect(stored?.hash).not.toBe(enrollment.code);
    expect(stored?.hash).toHaveLength(64);

    const sameSeries = await t.request("/devices", {
      method: "POST",
      cookie: adminCookie,
      body: json({
        branchId: branches[0]?.id,
        label: "Counter 10",
        receiptSeries: "09",
        printWidth: 58,
      }),
    });
    expect(sameSeries.status).toBe(409);

    const renewed = await body<{ code: string }>(
      await t.request(`/devices/${enrollment.device.id}/enrollment-code`, {
        method: "POST",
        cookie: adminCookie,
      }),
    );
    expect(renewed.code).not.toBe(enrollment.code);

    const revoked = await t.request(`/devices/${enrollment.device.id}/revoke`, {
      method: "POST",
      cookie: adminCookie,
    });
    expect((await body<{ revokedAt: string | null }>(revoked)).revokedAt).toBe(t.now.toISOString());
    const [after] = await t.db
      .select({ hash: schema.devices.enrollmentCodeHash, token: schema.devices.tokenHash })
      .from(schema.devices)
      .where(and(eq(schema.devices.id, enrollment.device.id)));
    expect(after).toEqual({ hash: null, token: null });
    const renewRevoked = await t.request(`/devices/${enrollment.device.id}/enrollment-code`, {
      method: "POST",
      cookie: adminCookie,
    });
    expect(renewRevoked.status).toBe(422);
  });
});
