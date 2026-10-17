import { describe, expect, it } from "vitest";
import type { ZodError } from "zod";
import {
  adminUpdateSchema,
  branchSchema,
  dashboardQuerySchema,
  deviceCreateSchema,
  deviceEnrollSchema,
  discountSchema,
  fieldErrors,
  inventoryQuerySchema,
  newProductSchema,
  paymentSchema,
  productSearchSchema,
  requestApproveSchema,
  requestDeclineSchema,
  requestListQuerySchema,
  saleCreateSchema,
  salesQuerySchema,
  settingsSchema,
  signInSchema,
  staffCreateSchema,
  staffUpdateSchema,
  stockReceiveSchema,
  stockRequestCreateSchema,
} from "./schemas";

const id = "0192f0a0-0000-7000-8000-000000000001";
const id2 = "0192f0a0-0000-7000-8000-000000000002";

function errorsOf(result: { success: boolean; error?: ZodError }) {
  return result.error ? fieldErrors(result.error) : {};
}

describe("sign in and payments", () => {
  it("normalizes usernames", () => {
    expect(signInSchema.parse({ username: " Cashier1 ", password: "pos" }).username).toBe(
      "cashier1",
    );
    expect(errorsOf(signInSchema.safeParse({ username: "", password: "" }))).toEqual({
      username: "Enter your username.",
      password: "Enter your password.",
    });
  });

  it("stores GCash references as digits and refuses short ones", () => {
    expect(paymentSchema.parse({ method: "gcash", gcashRef: "1234 5678 90123" })).toEqual({
      method: "gcash",
      gcashRef: "1234567890123",
    });
    expect(paymentSchema.safeParse({ method: "gcash", gcashRef: "123" }).success).toBe(false);
    expect(paymentSchema.safeParse({ method: "cash", cashReceivedCentavos: 0 }).success).toBe(
      false,
    );
  });

  it("accepts a sale and refuses an empty cart", () => {
    const sale = {
      id,
      branchId: id2,
      lines: [{ productId: id, qty: 2 }],
      discountId: null,
      payment: { method: "cash", cashReceivedCentavos: 50000 },
      expectedTotalCentavos: 900,
    };
    expect(saleCreateSchema.safeParse(sale).success).toBe(true);
    expect(errorsOf(saleCreateSchema.safeParse({ ...sale, lines: [] }))).toEqual({
      lines: "Add items to charge.",
    });
  });
});

describe("stock", () => {
  const receive = {
    id,
    product: { kind: "existing", productId: id2 },
    branchId: id,
    batchNo: " b26-104 ",
    qty: 10,
    expiryDate: "2027-01-01",
    today: "2026-10-18",
  };

  it("uppercases batch numbers and requires a future expiry", () => {
    expect(stockReceiveSchema.parse(receive).batchNo).toBe("B26-104");
    expect(
      errorsOf(stockReceiveSchema.safeParse({ ...receive, expiryDate: "2026-10-18" })),
    ).toEqual({
      expiryDate: "This batch has already expired.",
    });
    expect(
      errorsOf(stockReceiveSchema.safeParse({ ...receive, qty: 0, batchNo: "x" })),
    ).toMatchObject({
      qty: "Enter how many units arrived.",
      batchNo: "Enter the batch number printed on the box.",
    });
  });

  it("validates new products", () => {
    const product = {
      genericName: "Cetirizine",
      brand: "Virlix",
      strength: "10mg",
      form: "Tab",
      category: "Antihistamine",
      priceCentavos: 875,
      isTaxable: true,
    };
    expect(newProductSchema.safeParse(product).success).toBe(true);
    expect(
      errorsOf(newProductSchema.safeParse({ ...product, genericName: "", priceCentavos: 0 })),
    ).toMatchObject({
      genericName: "Enter the generic name.",
      priceCentavos: "Enter an amount above zero.",
    });
  });

  it("validates stock requests", () => {
    const request = {
      id,
      branchId: id2,
      priority: "urgent",
      note: "",
      items: [{ productId: id, qty: 5 }],
    };
    expect(stockRequestCreateSchema.safeParse(request).success).toBe(true);
    expect(errorsOf(stockRequestCreateSchema.safeParse({ ...request, items: [] }))).toEqual({
      items: "Add at least one product with a quantity.",
    });
    expect(
      stockRequestCreateSchema.safeParse({
        ...request,
        items: [request.items[0], request.items[0]],
      }).success,
    ).toBe(false);
    expect(
      requestApproveSchema.safeParse({
        allocations: [{ productId: id, qtyAllocated: 0 }],
        note: "",
      }).success,
    ).toBe(true);
    expect(requestDeclineSchema.parse({ note: "  out of stock " }).note).toBe("out of stock");
  });
});

describe("settings, branches, staff, discounts, devices", () => {
  it("validates settings", () => {
    expect(
      settingsSchema.parse({
        lowStockThreshold: 20,
        receiptPrefix: "or",
        vatRateBp: 1200,
        vatMode: "inclusive",
      }).receiptPrefix,
    ).toBe("OR");
    expect(
      errorsOf(
        settingsSchema.safeParse({
          lowStockThreshold: 0,
          receiptPrefix: "TOOLONG",
          vatRateBp: 3100,
          vatMode: "inclusive",
        }),
      ),
    ).toEqual({
      lowStockThreshold: "Enter a whole number above zero.",
      receiptPrefix: "Use up to 6 letters, numbers or dashes.",
      vatRateBp: "Enter a rate between 0 and 30.",
    });
  });

  const branch = {
    name: "Lanang",
    code: "lan",
    address: "J.P. Laurel Ave.",
    city: "Davao City",
    phone: "0917 123 4567",
    email: "",
    opensAt: "08:00",
    closesAt: "20:00",
    openDays: [1, 2, 3],
  };

  it("normalizes branch fields and checks hours", () => {
    expect(branchSchema.parse(branch)).toMatchObject({
      code: "LAN",
      phone: "09171234567",
      email: null,
    });
    expect(errorsOf(branchSchema.safeParse({ ...branch, closesAt: "07:00" }))).toEqual({
      closesAt: "Closing time must be after opening time.",
    });
    expect(errorsOf(branchSchema.safeParse({ ...branch, openDays: [] }))).toEqual({
      openDays: "Pick at least one day the branch is open.",
    });
    expect(errorsOf(branchSchema.safeParse({ ...branch, phone: "123", email: "nope" }))).toEqual({
      phone: "Enter a mobile (09XX XXX XXXX) or landline number.",
      email: "Check the email address.",
    });
  });

  const staff = {
    fullName: "Jo Santos",
    username: "JSantos",
    password: "secret1",
    passwordConfirm: "secret1",
    position: "cashier",
    branchId: id,
    phone: "09181234567",
    email: "",
    address: "",
    prcLicenseNo: "",
    active: true,
  };

  it("validates new staff accounts", () => {
    expect(staffCreateSchema.parse(staff)).toMatchObject({
      username: "jsantos",
      address: null,
      prcLicenseNo: null,
    });
    expect(
      errorsOf(
        staffCreateSchema.safeParse({
          ...staff,
          fullName: "Jo",
          position: "pharmacist",
          passwordConfirm: "other1",
        }),
      ),
    ).toEqual({
      fullName: "Enter their first and last name.",
      prcLicenseNo: "Pharmacists need a PRC license number (digits only).",
      passwordConfirm: "Passwords don’t match.",
    });
    expect(
      errorsOf(staffCreateSchema.safeParse({ ...staff, password: "abc", passwordConfirm: "abc" })),
    ).toEqual({
      password: "Use at least 6 characters.",
    });
  });

  it("lets edits keep the current password", () => {
    const { username: _username, ...update } = staff;
    expect(
      staffUpdateSchema.safeParse({ ...update, password: "", passwordConfirm: "" }).success,
    ).toBe(true);
    expect(
      adminUpdateSchema.safeParse({
        fullName: "Richard Boquia",
        phone: "09170000000",
        email: "a@b.co",
        address: "",
        password: "",
        passwordConfirm: "",
      }).success,
    ).toBe(true);
  });

  const discount = {
    name: "Employee",
    mode: "percent",
    value: 1000,
    formula: null,
    capCentavos: null,
    minSpendCentavos: null,
    isVatExempt: false,
    active: true,
  };

  it("validates discounts", () => {
    expect(discountSchema.safeParse(discount).success).toBe(true);
    expect(errorsOf(discountSchema.safeParse({ ...discount, value: 10_001 }))).toEqual({
      value: "A percentage can’t be over 100.",
    });
    expect(errorsOf(discountSchema.safeParse({ ...discount, mode: "fixed", value: 0 }))).toEqual({
      value: "Enter a value above zero.",
    });
    expect(
      errorsOf(
        discountSchema.safeParse({ ...discount, mode: "formula", value: 0, formula: "foo" }),
      ),
    ).toEqual({
      formula: 'Unknown name "foo".',
    });
    expect(
      discountSchema.safeParse({
        ...discount,
        mode: "formula",
        value: 0,
        formula: "subtotal * 0.1",
      }).success,
    ).toBe(true);
  });

  it("validates devices", () => {
    expect(
      deviceCreateSchema.safeParse({
        branchId: id,
        label: "Counter 1",
        receiptSeries: "01",
        printWidth: 58,
      }).success,
    ).toBe(true);
    expect(
      deviceCreateSchema.safeParse({ branchId: id, label: "", receiptSeries: "1", printWidth: 70 })
        .success,
    ).toBe(false);
    expect(deviceEnrollSchema.parse({ code: " ab12cd34 " }).code).toBe("AB12CD34");
  });
});

describe("list queries", () => {
  it("applies defaults", () => {
    expect(inventoryQuerySchema.parse({ branchId: id })).toMatchObject({
      q: "",
      status: "all",
      sort: "sku",
      page: 0,
      pageSize: 20,
    });
    expect(productSearchSchema.parse({ branchId: id }).limit).toBe(60);
    expect(salesQuerySchema.parse({ page: "2" })).toMatchObject({
      branchId: null,
      period: "today",
      page: 2,
    });
    expect(dashboardQuerySchema.parse({})).toEqual({ branchId: null, period: "today" });
    expect(requestListQuerySchema.parse({})).toEqual({ branchId: null, status: "pending" });
  });
});
