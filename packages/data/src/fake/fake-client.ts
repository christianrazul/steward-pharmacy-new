import { buildMockupDataset, type MockupDataset, type UserRow } from "@steward/db/seed-dataset";
import {
  type Action,
  type BranchInput,
  type DashboardQuery,
  type DeviceCreateInput,
  type DiscountInput,
  type InventoryQuery,
  type ProductSearchQuery,
  type RequestApproveInput,
  type RequestDeclineInput,
  type RequestListQuery,
  type SaleCreateInput,
  type SalesQuery,
  type SettingsInput,
  type SignInInput,
  type StaffCreateInput,
  type StaffUpdateInput,
  type StockReceiveInput,
  type StockRequestCreateInput,
  WEB_RECEIPT_SERIES,
  allocateFifo,
  allocationError,
  InvalidTransitionError,
  assertTransition as assertDomainTransition,
  bucketIndex,
  branchSchema,
  can,
  computeTotals,
  daysUntil,
  deviceCreateSchema,
  discountSchema,
  saleDiscountLabel,
  fieldErrors,
  fifoOrder,
  formatManila,
  formatReceiptNo,
  formatRequestNo,
  isExpired,
  manilaToday,
  percentChange,
  periodRange,
  productDisplayName,
  requestApproveSchema,
  requestDeclineSchema,
  saleCreateSchema,
  settingsSchema,
  staffCreateSchema,
  staffUpdateSchema,
  stockReceiveSchema,
  stockRequestCreateSchema,
  stockStatus,
} from "@steward/domain";
import { v7 as uuidv7 } from "uuid";
import type { z } from "zod";

import type { DataClient } from "../client";
import { DataError } from "../errors";
import type {
  BatchDetail,
  Branch,
  CsvExport,
  DashboardData,
  Device,
  DeviceEnrollment,
  Discount,
  InventoryPage,
  InventoryRow,
  ProductLookup,
  ProductSearchResult,
  ReceiveStockResult,
  RestockSuggestion,
  SaleReceipt,
  SaleSummary,
  SalesPage,
  Session,
  SessionUser,
  Settings,
  StaffAccount,
  StockRequestDetail,
  StockRequestList,
  StockRequestSummary,
  SyncStatus,
} from "../types";
import { FakeState, csvCell, enrollmentCode, matchesQuery } from "./state";

type SaleRow = MockupDataset["sales"][number];

function assertTransition(...args: Parameters<typeof assertDomainTransition>) {
  try {
    assertDomainTransition(...args);
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      throw new DataError(
        "conflict",
        "This request changed in the meantime. Reload to see its current status.",
      );
    }
    throw error;
  }
}
type RequestRow = MockupDataset["requests"][number];

interface DeviceState {
  id: string;
  branchId: string;
  label: string;
  receiptSeries: string;
  printWidth: 58 | 80;
  enrolled: boolean;
  lastSeenAt: string | null;
  revokedAt: string | null;
  code: string | null;
  codeExpiresAt: string | null;
}

export interface FakeDataClientOptions {
  /** Defaults to a fresh mockup dataset built around `now()`. */
  dataset?: MockupDataset;
  now?: () => Date;
  /** Simulated network delay, so loading states show. 0 in tests. */
  latencyMs?: number;
  /** Where the signed-in user id is kept between reloads (browser sessionStorage). */
  storage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  /** Signed-in user id to start with. */
  signedInAs?: string;
}

const SESSION_KEY = "steward:fake-session";
const SIMULATED_SYNC_MS = 1400;

/**
 * In-memory DataClient over the mockup's data, for the static front end and
 * tests. It applies the same domain rules and the same role and branch checks
 * the API does, so screens behave the same against it.
 */
export class FakeDataClient implements DataClient {
  private readonly state: FakeState;
  private readonly now: () => Date;
  private readonly latencyMs: number;
  private readonly storage: FakeDataClientOptions["storage"];
  private sessionUserId: string | null;
  private readonly devices: DeviceState[];
  private syncStatus: SyncStatus;
  private readonly listeners = new Set<(status: SyncStatus) => void>();

  constructor(options: FakeDataClientOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.state = new FakeState(options.dataset ?? buildMockupDataset(this.now()));
    this.latencyMs = options.latencyMs ?? 0;
    this.storage = options.storage;
    this.sessionUserId = options.signedInAs ?? this.storage?.getItem(SESSION_KEY) ?? null;
    this.devices = this.state.data.devices.map((device) => ({
      ...device,
      enrolled: true,
      lastSeenAt: this.now().toISOString(),
      revokedAt: null,
      code: null,
      codeExpiresAt: null,
    }));
    this.syncStatus = {
      online: true,
      syncing: false,
      queued: 0,
      lastSyncedAt: this.now().toISOString(),
    };
  }

  // -- plumbing -------------------------------------------------------------

  private async tick(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }

  private currentUser(): UserRow {
    const user = this.sessionUserId === null ? undefined : this.state.user(this.sessionUserId);
    if (!user || !user.active || this.state.deletedUsers.has(user.id)) {
      throw new DataError("unauthorized", "Your session ended. Sign in again to continue.");
    }
    return user;
  }

  private requireAction(action: Action): UserRow {
    const user = this.currentUser();
    if (!can(user.role, action)) {
      throw new DataError(
        "forbidden",
        "Your account can’t do that. Ask a super admin if you need access.",
      );
    }
    return user;
  }

  /** Staff only ever touch their own branch. */
  private requireBranch(user: UserRow, branchId: string): void {
    if (!this.state.branch(branchId))
      throw new DataError("not_found", "That branch no longer exists.");
    if (user.role !== "admin" && user.branchId !== branchId) {
      throw new DataError("forbidden", "You can only work with your own branch.");
    }
  }

  private requireOnline(what: string): void {
    if (!this.syncStatus.online) {
      throw new DataError("offline", `${what} needs a connection. Reconnect and try again.`);
    }
  }

  private parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
    const result = schema.safeParse(input);
    if (!result.success) {
      const fields = fieldErrors(result.error);
      throw new DataError(
        "validation",
        Object.values(fields)[0] ?? "Check the highlighted fields.",
        fields,
      );
    }
    return result.data;
  }

  private newId(): string {
    return uuidv7({ msecs: this.now().getTime() });
  }

  private sessionUser(user: UserRow): SessionUser {
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      position: user.position,
      branchId: user.branchId,
    };
  }

  private markQueued(id: string): boolean {
    if (this.syncStatus.online) return true;
    this.state.unsynced.add(id);
    this.setSync({ ...this.syncStatus, queued: this.state.unsynced.size });
    return false;
  }

  private setSync(status: SyncStatus) {
    this.syncStatus = status;
    for (const listener of this.listeners) listener(status);
  }

  /** Dev-only: pretend the connection dropped or came back. */
  simulateConnectivity(online: boolean): void {
    if (!online) {
      this.setSync({ ...this.syncStatus, online: false, syncing: false });
      return;
    }
    if (this.syncStatus.online || this.syncStatus.syncing) return;
    this.setSync({ ...this.syncStatus, syncing: true });
    setTimeout(() => {
      this.state.unsynced.clear();
      this.setSync({
        online: true,
        syncing: false,
        queued: 0,
        lastSyncedAt: this.now().toISOString(),
      });
    }, SIMULATED_SYNC_MS);
  }

  getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // -- session --------------------------------------------------------------

  async getSession(): Promise<Session | null> {
    await this.tick();
    if (this.sessionUserId === null) return null;
    const user = this.state.user(this.sessionUserId);
    if (!user || !user.active || this.state.deletedUsers.has(user.id)) {
      this.sessionUserId = null;
      this.storage?.removeItem(SESSION_KEY);
      return null;
    }
    return { user: this.sessionUser(user) };
  }

  async signIn(input: SignInInput): Promise<Session> {
    await this.tick();
    const username = input.username.trim().toLowerCase();
    const user = this.state.users().find((candidate) => candidate.username === username);
    if (user?.demoPassword !== input.password) {
      throw new DataError(
        "unauthorized",
        "That username and password don’t match an account. Try one of the demo accounts below.",
      );
    }
    if (!user.active) {
      throw new DataError(
        "forbidden",
        "This account is inactive. Ask your admin to set it back to active in Settings.",
      );
    }
    this.sessionUserId = user.id;
    this.storage?.setItem(SESSION_KEY, user.id);
    return { user: this.sessionUser(user) };
  }

  async signOut(): Promise<void> {
    await this.tick();
    this.sessionUserId = null;
    this.storage?.removeItem(SESSION_KEY);
  }

  // -- reference data -------------------------------------------------------

  private toBranch(row: MockupDataset["branches"][number]): Branch {
    return {
      ...row,
      staffCount: this.state
        .users()
        .filter((user) => user.branchId === row.id && user.role !== "admin").length,
      productCount: this.state.carriedProducts(row.id).length,
    };
  }

  async listBranches(): Promise<Branch[]> {
    await this.tick();
    this.currentUser();
    return this.state.branches().map((row) => this.toBranch(row));
  }

  private nextWebReceiptNo(branchId: string, consume: boolean): string {
    const branch = this.state.branch(branchId) ?? this.state.centralBranch();
    const sequence = this.state.webReceiptSequence.get(branch.id) ?? 1;
    if (consume) this.state.webReceiptSequence.set(branch.id, sequence + 1);
    return formatReceiptNo({
      prefix: this.state.data.settings.receiptPrefix,
      branchCode: branch.code,
      series: WEB_RECEIPT_SERIES,
      sequence,
    });
  }

  async getSettings(): Promise<Settings> {
    await this.tick();
    const user = this.currentUser();
    return {
      ...this.state.data.settings,
      nextReceiptNo: this.nextWebReceiptNo(user.branchId, false),
    };
  }

  async listDiscounts(options: { includeInactive?: boolean } = {}): Promise<Discount[]> {
    await this.tick();
    this.currentUser();
    return this.state.data.discounts
      .filter((discount) => !this.state.deletedDiscounts.has(discount.id))
      .filter((discount) => options.includeInactive === true || discount.active)
      .map((discount) => ({ ...discount }));
  }

  // -- point of sale --------------------------------------------------------

  async searchProducts(query: ProductSearchQuery): Promise<ProductSearchResult> {
    await this.tick();
    const user = this.requireAction("pos.sell");
    this.requireBranch(user, query.branchId);
    const now = this.now();
    const carried = this.state.carriedProducts(query.branchId);
    const counts = new Map<string, number>();
    for (const product of carried)
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    const matches = carried
      .filter((product) => query.category === "" || product.category === query.category)
      .filter((product) => matchesQuery(product, query.q))
      .map((product) => ({
        product,
        sellable: this.state.sellable(query.branchId, product.id, now),
      }))
      .sort(
        (a, b) =>
          Number(b.sellable > 0) - Number(a.sellable > 0) ||
          (query.q.trim() === "" ? a.product.sku.localeCompare(b.product.sku) : 0),
      );
    return {
      total: matches.length,
      categories: [...counts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
      products: matches.slice(0, query.limit).map(({ product, sellable }) => ({
        id: product.id,
        sku: product.sku,
        name: productDisplayName(product),
        genericName: product.genericName,
        brand: product.brand,
        strength: product.strength,
        form: product.form,
        category: product.category,
        priceCentavos: product.priceCentavos,
        isTaxable: product.isTaxable,
        sellable,
      })),
    };
  }

  private receiptOf(sale: SaleRow): SaleReceipt {
    const branch = this.state.data.branches.find((row) => row.id === sale.branchId);
    return {
      id: sale.id,
      receiptNo: sale.receiptNo,
      branch: {
        id: sale.branchId,
        name: branch?.name ?? "",
        address: branch?.address ?? "",
        city: branch?.city ?? "",
        phone: branch?.phone ?? "",
      },
      soldAt: sale.soldAt,
      cashierName: this.state.userName(sale.cashierUserId),
      lines: sale.lines.map((line) => ({
        name: this.state.productName(line.productId),
        qty: line.qty,
        unitPriceCentavos: line.unitPriceCentavos,
        lineTotalCentavos: line.lineTotalCentavos,
        isTaxable: line.isTaxable,
      })),
      itemCount: sale.itemCount,
      subtotal: sale.subtotal,
      discount: sale.discount,
      discountLabel: sale.discountLabel,
      vatExemptRemoved: sale.vatExemptRemoved,
      vat: sale.vat,
      vatable: sale.vatable,
      nonVat: sale.nonVat,
      total: sale.total,
      isVatExemptSale: sale.isVatExemptSale,
      paymentMethod: sale.paymentMethod,
      cashReceived: sale.cashReceived,
      change: sale.change,
      gcashRef: sale.gcashRef,
      synced: !this.state.unsynced.has(sale.id),
    };
  }

  async createSale(raw: SaleCreateInput): Promise<SaleReceipt> {
    await this.tick();
    const user = this.requireAction("pos.sell");
    const input = this.parse(saleCreateSchema, raw);
    this.requireBranch(user, input.branchId);
    if (this.state.data.sales.some((sale) => sale.id === input.id)) {
      throw new DataError("conflict", "This sale was already recorded.");
    }
    const now = this.now();
    const settings = this.state.data.settings;

    const quantities = new Map<string, number>();
    for (const line of input.lines)
      quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.qty);
    const products = [...quantities.entries()].map(([productId, qty]) => {
      const product = this.state.product(productId);
      if (!product?.active || !this.state.carries(input.branchId, productId)) {
        throw new DataError(
          "validation",
          "One of these items is not sold at this branch. Remove it and try again.",
        );
      }
      const sellable = this.state.sellable(input.branchId, productId, now);
      if (qty > sellable) {
        throw new DataError(
          "conflict",
          sellable === 0
            ? `${productDisplayName(product)} just sold out. Remove it from the cart.`
            : `Only ${sellable} of ${productDisplayName(product)} left. Lower the quantity.`,
        );
      }
      return { product, qty };
    });

    const discount =
      input.discountId === null
        ? null
        : this.state.data.discounts.find(
            (row) =>
              row.id === input.discountId && row.active && !this.state.deletedDiscounts.has(row.id),
          );
    if (discount === undefined)
      throw new DataError("conflict", "That discount is no longer available. Pick another.");

    const totals = computeTotals(
      products.map(({ product, qty }) => ({
        qty,
        unitPriceCentavos: product.priceCentavos,
        isTaxable: product.isTaxable,
      })),
      discount,
      settings,
    );
    if (totals.total !== input.expectedTotalCentavos) {
      throw new DataError(
        "conflict",
        "Prices changed since you added these items. Check the cart and charge again.",
      );
    }
    if (input.payment.method === "cash" && input.payment.cashReceivedCentavos < totals.total) {
      throw new DataError("validation", "Cash received is less than the total.", {
        "payment.cashReceivedCentavos": "Cash received is less than the total.",
      });
    }

    const soldAt = now.toISOString();
    const lines = products.map(({ product, qty }, index) => {
      const { allocations } = allocateFifo(
        this.state.batchStock(input.branchId, product.id),
        qty,
        now,
      );
      const lineId = this.newId();
      for (const allocation of allocations) {
        this.state.recordMovement({
          id: this.newId(),
          batchId: allocation.batchId,
          qty: -allocation.qty,
          kind: "sale",
          refType: "sale",
          refId: input.id,
          createdByUserId: user.id,
          createdAt: soldAt,
        });
      }
      return {
        id: lineId,
        saleId: input.id,
        productId: product.id,
        qty,
        unitPriceCentavos: product.priceCentavos,
        isTaxable: product.isTaxable,
        lineTotalCentavos: totals.lineTotals[index] ?? 0,
        batches: allocations.map((allocation) => ({
          batchId: allocation.batchId,
          qty: allocation.qty,
        })),
      };
    });

    const cashReceived =
      input.payment.method === "cash" ? input.payment.cashReceivedCentavos : null;
    const sale: SaleRow = {
      id: input.id,
      receiptNo: this.nextWebReceiptNo(input.branchId, true),
      branchId: input.branchId,
      deviceId: null,
      cashierUserId: user.id,
      soldAt,
      subtotal: totals.subtotal,
      discount: totals.discount,
      vat: totals.vat,
      vatable: totals.vatable,
      nonVat: totals.nonVat,
      vatExemptRemoved: totals.vatExemptRemoved,
      total: totals.total,
      itemCount: totals.itemCount,
      paymentMethod: input.payment.method,
      cashReceived,
      change: cashReceived === null ? null : cashReceived - totals.total,
      gcashRef: input.payment.method === "gcash" ? input.payment.gcashRef : null,
      discountId: discount?.id ?? null,
      discountLabel: saleDiscountLabel(discount, totals),
      isVatExemptSale: totals.isVatExemptSale,
      status: "completed",
      lines,
    };
    this.state.data.sales.unshift(sale);
    this.markQueued(sale.id);
    return this.receiptOf(sale);
  }

  // -- inventory ------------------------------------------------------------

  private bestSellerThisMonth(branchId: string): { name: string; units: number } | null {
    const range = periodRange("month", this.now());
    const units = new Map<string, number>();
    for (const sale of this.state.sales()) {
      if (sale.branchId !== branchId || new Date(sale.soldAt) < range.start) continue;
      for (const line of sale.lines)
        units.set(line.productId, (units.get(line.productId) ?? 0) + line.qty);
    }
    let best: { name: string; units: number } | null = null;
    for (const [productId, count] of units) {
      if (!best || count > best.units)
        best = { name: this.state.productName(productId), units: count };
    }
    return best;
  }

  async listInventory(query: InventoryQuery): Promise<InventoryPage> {
    await this.tick();
    const user = this.requireAction("inventory.view");
    this.requireBranch(user, query.branchId);
    const now = this.now();
    const threshold = this.state.data.settings.lowStockThreshold;
    const carried = this.state.carriedProducts(query.branchId);
    const all: InventoryRow[] = carried.map((product) => {
      const onHand = this.state.productOnHand(query.branchId, product.id);
      const next = this.state.nextExpiry(query.branchId, product.id);
      return {
        productId: product.id,
        sku: product.sku,
        brand: product.brand,
        genericName: product.genericName,
        strength: product.strength,
        form: product.form,
        category: product.category,
        priceCentavos: product.priceCentavos,
        isTaxable: product.isTaxable,
        onHand,
        nextExpiry: next,
        status: stockStatus({ onHand, nextExpiryDate: next }, threshold, now),
      };
    });

    const q = query.q.toLowerCase();
    let rows = all.filter((row) => {
      if (q !== "") {
        const product = this.state.product(row.productId);
        const batchHit = this.state
          .batchesAt(query.branchId, row.productId)
          .some((batch) => batch.batchNo.toLowerCase().includes(q));
        if (!(product && matchesQuery(product, q)) && !batchHit) return false;
      }
      if (query.category !== "" && row.category !== query.category) return false;
      if (query.form !== "" && row.form !== query.form) return false;
      if (query.status === "expiring") {
        return row.onHand > 0 && row.nextExpiry !== null && daysUntil(row.nextExpiry, now) <= 90;
      }
      return query.status === "all" || row.status === query.status;
    });
    const sorters: Record<InventoryQuery["sort"], (a: InventoryRow, b: InventoryRow) => number> = {
      sku: (a, b) => a.sku.localeCompare(b.sku),
      name: (a, b) => a.brand.localeCompare(b.brand) || a.sku.localeCompare(b.sku),
      stock: (a, b) => a.onHand - b.onHand || a.sku.localeCompare(b.sku),
      expiry: (a, b) =>
        (a.nextExpiry ?? "9999").localeCompare(b.nextExpiry ?? "9999") ||
        a.sku.localeCompare(b.sku),
      price: (a, b) => b.priceCentavos - a.priceCentavos || a.sku.localeCompare(b.sku),
    };
    rows = rows.sort(sorters[query.sort]);

    const batchesAtBranch = this.state.data.batches.filter(
      (batch) => batch.branchId === query.branchId,
    );
    return {
      rows: rows.slice(query.page * query.pageSize, (query.page + 1) * query.pageSize),
      total: rows.length,
      page: query.page,
      pageSize: query.pageSize,
      categories: [...new Set(all.map((row) => row.category))].sort(),
      forms: [...new Set(all.map((row) => row.form))].sort(),
      summary: {
        productCount: all.length,
        stockValueCentavos: all.reduce(
          (sum, row) => sum + Math.max(0, row.onHand) * row.priceCentavos,
          0,
        ),
        lowCount: all.filter((row) => row.onHand > 0 && row.onHand < threshold).length,
        outCount: all.filter((row) => row.onHand <= 0).length,
        expiringBatches: batchesAtBranch.filter(
          (batch) => this.state.onHand(batch.id) > 0 && daysUntil(batch.expiryDate, now) <= 90,
        ).length,
        bestSeller: this.bestSellerThisMonth(query.branchId),
      },
    };
  }

  async listBatches(productId: string, branchId: string): Promise<BatchDetail[]> {
    await this.tick();
    const user = this.requireAction("inventory.view");
    this.requireBranch(user, branchId);
    const now = this.now();
    const stock = this.state.batchStock(branchId, productId);
    const next = fifoOrder(stock, now)[0]?.batchId ?? null;
    return stock
      .sort(
        (a, b) =>
          a.expiryDate.localeCompare(b.expiryDate) || a.receivedAt.localeCompare(b.receivedAt),
      )
      .map((batch) => ({
        batchId: batch.batchId,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        receivedAt: batch.receivedAt,
        onHand: batch.onHand,
        isExpired: isExpired(batch.expiryDate, now),
        sellsNext: batch.batchId === next,
      }));
  }

  async lookupProducts(query: {
    q: string;
    branchId: string | null;
    limit?: number;
  }): Promise<ProductLookup[]> {
    await this.tick();
    const user = this.currentUser();
    if (query.branchId !== null) this.requireBranch(user, query.branchId);
    if (query.q.trim() === "") return [];
    return this.state.data.products
      .filter((product) => product.active && matchesQuery(product, query.q))
      .slice(0, query.limit ?? 8)
      .map((product) => ({
        id: product.id,
        sku: product.sku,
        name: productDisplayName(product),
        genericName: product.genericName,
        priceCentavos: product.priceCentavos,
        isTaxable: product.isTaxable,
        onHand:
          query.branchId !== null && this.state.carries(query.branchId, product.id)
            ? this.state.productOnHand(query.branchId, product.id)
            : null,
      }));
  }

  async receiveStock(raw: StockReceiveInput): Promise<ReceiveStockResult> {
    await this.tick();
    const user = this.requireAction("inventory.add_stock");
    const now = this.now();
    const input = this.parse(stockReceiveSchema, { ...raw, today: manilaToday(now) });
    const branch = this.state.branch(input.branchId);
    if (!branch) throw new DataError("not_found", "That branch no longer exists.");

    let productId: string;
    if (input.product.kind === "new") {
      const skuNumbers = this.state.data.products.map(
        (product) => Number(product.sku.replace(/\D/g, "")) || 0,
      );
      productId = input.product.productId;
      this.state.data.products.push({
        id: productId,
        sku: `PS-${Math.max(...skuNumbers) + 1}`,
        ...input.product.details,
        active: true,
      });
    } else {
      productId = input.product.productId;
      if (!this.state.product(productId))
        throw new DataError("not_found", "That product no longer exists.");
    }

    const existing = this.state
      .batchesAt(branch.id, productId)
      .find((batch) => batch.batchNo === input.batchNo);
    if (existing && existing.expiryDate !== input.expiryDate) {
      throw new DataError(
        "validation",
        `Batch ${input.batchNo} is already on file with expiry ${existing.expiryDate}. Check the date on the box.`,
        { expiryDate: `This batch expires on ${existing.expiryDate}.` },
      );
    }
    const batch = existing ?? {
      id: this.newId(),
      productId,
      branchId: branch.id,
      batchNo: input.batchNo,
      expiryDate: input.expiryDate,
      receivedAt: now.toISOString(),
    };
    if (!existing) this.state.addBatch(batch);
    this.state.recordMovement({
      id: this.newId(),
      batchId: batch.id,
      qty: input.qty,
      kind: "receive",
      refType: "receipt",
      refId: input.id,
      createdByUserId: user.id,
      createdAt: now.toISOString(),
    });
    this.markQueued(input.id);
    return {
      productId,
      productName: this.state.productName(productId),
      branchName: branch.name,
      qty: input.qty,
      toppedUp: existing !== undefined,
    };
  }

  // -- stock requests -------------------------------------------------------

  private requestSummary(row: RequestRow): StockRequestSummary {
    return {
      id: row.id,
      requestNo: row.requestNo,
      branchId: row.branchId,
      branchName: this.state.data.branches.find((branch) => branch.id === row.branchId)?.name ?? "",
      requestedBy: this.state.userName(row.requestedByUserId),
      createdAt: row.createdAt,
      priority: row.priority,
      status: row.status,
      itemCount: row.items.length,
      units: row.items.reduce((sum, item) => sum + item.qtyRequested, 0),
      synced: !this.state.unsynced.has(row.id),
    };
  }

  private requestDetail(row: RequestRow): StockRequestDetail {
    const central = this.state.centralBranch();
    const now = this.now();
    return {
      ...this.requestSummary(row),
      note: row.note,
      items: row.items.map((item) => {
        const product = this.state.product(item.productId);
        return {
          productId: item.productId,
          sku: product?.sku ?? "",
          name: this.state.productName(item.productId),
          genericName: product?.genericName ?? "",
          qtyRequested: item.qtyRequested,
          qtyAllocated: item.qtyAllocated,
          centralSellable: this.state.sellable(central.id, item.productId, now),
        };
      }),
      events: row.events.map((event) => ({
        kind: event.kind,
        actorName: this.state.userName(event.actorUserId),
        at: event.createdAt,
        note: event.note,
      })),
    };
  }

  private findRequest(user: UserRow, id: string): RequestRow {
    const row = this.state.requests().find((request) => request.id === id);
    if (!row) throw new DataError("not_found", "That request no longer exists.");
    if (user.role !== "admin" && row.branchId !== user.branchId) {
      throw new DataError("forbidden", "You can only see requests from your own branch.");
    }
    return row;
  }

  async listRequests(query: RequestListQuery): Promise<StockRequestList> {
    await this.tick();
    const user = this.requireAction("stock_requests.view");
    const branchId = user.role === "admin" ? query.branchId : user.branchId;
    const base = this.state
      .requests()
      .filter((row) => branchId === null || row.branchId === branchId);
    const pending = base.filter((row) => row.status === "pending");
    const rows = base
      .filter((row) => query.status === "all" || row.status === query.status)
      .sort((a, b) => {
        if (
          a.status === "pending" &&
          b.status === "pending" &&
          (a.priority === "urgent") !== (b.priority === "urgent")
        ) {
          return a.priority === "urgent" ? -1 : 1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
    const count = (status: RequestRow["status"]) =>
      base.filter((row) => row.status === status).length;
    return {
      rows: rows.map((row) => this.requestSummary(row)),
      counts: {
        all: base.length,
        pending: count("pending"),
        approved: count("approved"),
        declined: count("declined"),
        fulfilled: count("fulfilled"),
      },
      pending: {
        count: pending.length,
        urgent: pending.filter((row) => row.priority === "urgent").length,
        units: pending.reduce(
          (sum, row) => sum + row.items.reduce((s, item) => s + item.qtyRequested, 0),
          0,
        ),
      },
    };
  }

  async getRequest(id: string): Promise<StockRequestDetail> {
    await this.tick();
    const user = this.requireAction("stock_requests.view");
    return this.requestDetail(this.findRequest(user, id));
  }

  async createRequest(raw: StockRequestCreateInput): Promise<StockRequestSummary> {
    await this.tick();
    const user = this.requireAction("stock_requests.create");
    const input = this.parse(stockRequestCreateSchema, raw);
    this.requireBranch(user, input.branchId);
    if (this.state.branch(input.branchId)?.isCentral) {
      throw new DataError("validation", "Central can’t request stock from itself.");
    }
    for (const item of input.items) {
      if (!this.state.product(item.productId))
        throw new DataError("not_found", "One of these products no longer exists.");
    }
    const createdAt = this.now().toISOString();
    const row: RequestRow = {
      id: input.id,
      requestNo: formatRequestNo(this.state.data.nextRequestSequence++),
      branchId: input.branchId,
      requestedByUserId: user.id,
      priority: input.priority,
      note: input.note,
      status: "pending",
      createdAt,
      items: input.items.map((item) => ({
        productId: item.productId,
        qtyRequested: item.qty,
        qtyAllocated: null,
      })),
      events: [{ id: this.newId(), kind: "created", actorUserId: user.id, note: "", createdAt }],
    };
    this.state.data.requests.unshift(row);
    this.markQueued(row.id);
    return this.requestSummary(row);
  }

  async approveRequest(id: string, raw: RequestApproveInput): Promise<StockRequestDetail> {
    await this.tick();
    const user = this.requireAction("stock_requests.review");
    this.requireOnline("Approving a request");
    const input = this.parse(requestApproveSchema, raw);
    const row = this.findRequest(user, id);
    assertTransition(row.status, "approved");
    const detail = this.requestDetail(row);
    const lines = detail.items.map((item) => ({
      productId: item.productId,
      productName: item.name,
      qtyRequested: item.qtyRequested,
      qtyAllocated:
        input.allocations.find((a) => a.productId === item.productId)?.qtyAllocated ?? 0,
      centralSellable: item.centralSellable,
    }));
    const error = allocationError(lines);
    if (error) throw new DataError("validation", error);
    for (const item of row.items) {
      item.qtyAllocated =
        lines.find((line) => line.productId === item.productId)?.qtyAllocated ?? 0;
    }
    row.status = "approved";
    row.events.push({
      id: this.newId(),
      kind: "approved",
      actorUserId: user.id,
      note: input.note,
      createdAt: this.now().toISOString(),
    });
    return this.requestDetail(row);
  }

  async declineRequest(id: string, raw: RequestDeclineInput): Promise<StockRequestDetail> {
    await this.tick();
    const user = this.requireAction("stock_requests.review");
    this.requireOnline("Declining a request");
    const input = this.parse(requestDeclineSchema, raw);
    const row = this.findRequest(user, id);
    assertTransition(row.status, "declined");
    row.status = "declined";
    row.events.push({
      id: this.newId(),
      kind: "declined",
      actorUserId: user.id,
      note: input.note,
      createdAt: this.now().toISOString(),
    });
    return this.requestDetail(row);
  }

  async fulfillRequest(id: string): Promise<StockRequestDetail> {
    await this.tick();
    const user = this.requireAction("stock_requests.review");
    this.requireOnline("Marking a request fulfilled");
    const row = this.findRequest(user, id);
    assertTransition(row.status, "fulfilled");
    const central = this.state.centralBranch();
    const now = this.now();
    const plans = row.items
      .filter((item) => (item.qtyAllocated ?? 0) > 0)
      .map((item) => {
        const result = allocateFifo(
          this.state.batchStock(central.id, item.productId),
          item.qtyAllocated ?? 0,
          now,
        );
        if (result.shortfall > 0) {
          throw new DataError(
            "conflict",
            `Central no longer has enough ${this.state.productName(item.productId)}. Decline and ask the branch to send a new request, or receive more stock first.`,
          );
        }
        return { item, allocations: result.allocations };
      });
    const at = now.toISOString();
    for (const { item, allocations } of plans) {
      for (const allocation of allocations) {
        const source = this.state.data.batches.find((batch) => batch.id === allocation.batchId);
        if (!source) continue;
        let target = this.state
          .batchesAt(row.branchId, item.productId)
          .find((batch) => batch.batchNo === source.batchNo);
        if (!target) {
          target = {
            id: this.newId(),
            productId: item.productId,
            branchId: row.branchId,
            batchNo: source.batchNo,
            expiryDate: source.expiryDate,
            receivedAt: at,
          };
          this.state.addBatch(target);
        }
        this.state.recordMovement({
          id: this.newId(),
          batchId: source.id,
          qty: -allocation.qty,
          kind: "transfer_out",
          refType: "stock_request",
          refId: row.id,
          createdByUserId: user.id,
          createdAt: at,
        });
        this.state.recordMovement({
          id: this.newId(),
          batchId: target.id,
          qty: allocation.qty,
          kind: "transfer_in",
          refType: "stock_request",
          refId: row.id,
          createdByUserId: user.id,
          createdAt: at,
        });
      }
    }
    row.status = "fulfilled";
    row.events.push({
      id: this.newId(),
      kind: "fulfilled",
      actorUserId: user.id,
      note: "",
      createdAt: at,
    });
    return this.requestDetail(row);
  }

  async listRestockSuggestions(branchId: string): Promise<RestockSuggestion[]> {
    await this.tick();
    const user = this.requireAction("stock_requests.create");
    this.requireBranch(user, branchId);
    const threshold = this.state.data.settings.lowStockThreshold;
    return this.state
      .carriedProducts(branchId)
      .map((product) => ({
        productId: product.id,
        name: productDisplayName(product),
        onHand: this.state.productOnHand(branchId, product.id),
      }))
      .filter((row) => row.onHand < threshold)
      .sort((a, b) => a.onHand - b.onHand || a.name.localeCompare(b.name))
      .slice(0, 20);
  }

  // -- reports --------------------------------------------------------------

  async getDashboard(query: DashboardQuery): Promise<DashboardData> {
    await this.tick();
    this.requireAction("dashboard.view");
    const now = this.now();
    const range = periodRange(query.period, now);
    const branches = this.state.branches();
    const scoped =
      query.branchId === null
        ? branches
        : branches.filter((branch) => branch.id === query.branchId);
    const scopedIds = new Set(scoped.map((branch) => branch.id));
    const threshold = this.state.data.settings.lowStockThreshold;
    const completed = this.state.sales().filter((sale) => sale.status === "completed");
    const inRange = (sale: SaleRow, start: Date, end: Date) => {
      const at = new Date(sale.soldAt);
      return at >= start && at < end;
    };
    const current = completed.filter(
      (sale) => scopedIds.has(sale.branchId) && inRange(sale, range.start, now),
    );
    const previousToDate = completed.filter(
      (sale) =>
        scopedIds.has(sale.branchId) &&
        inRange(
          sale,
          range.previousStart,
          new Date(range.previousStart.getTime() + range.elapsedMs),
        ),
    );
    const previousFull = completed.filter(
      (sale) =>
        scopedIds.has(sale.branchId) && inRange(sale, range.previousStart, range.previousEnd),
    );
    const sum = (sales: SaleRow[]) => sales.reduce((total, sale) => total + sale.total, 0);
    const revenue = sum(current);
    const previousRevenue = sum(previousToDate);
    const basket = current.length === 0 ? 0 : Math.round(revenue / current.length);
    const previousBasket =
      previousToDate.length === 0 ? 0 : Math.round(previousRevenue / previousToDate.length);

    let lowStock = 0;
    let outOfStock = 0;
    for (const branch of scoped) {
      for (const product of this.state.carriedProducts(branch.id)) {
        const onHand = this.state.productOnHand(branch.id, product.id);
        if (onHand <= 0) outOfStock++;
        else if (onHand < threshold) lowStock++;
      }
    }

    const trend = range.buckets.map((bucket) => ({ label: bucket.label, current: 0, previous: 0 }));
    for (const sale of current) {
      const index = bucketIndex(range.buckets, new Date(sale.soldAt));
      const point = trend[index];
      if (point) point.current += sale.total;
    }
    for (const sale of previousFull) {
      const index = bucketIndex(range.previousBuckets, new Date(sale.soldAt));
      const point = trend[index];
      if (point) point.previous += sale.total;
    }

    const allCurrent = completed.filter((sale) => inRange(sale, range.start, now));
    const allRevenue = sum(allCurrent);
    const branchPerformance = branches
      .map((branch) => {
        const value = sum(allCurrent.filter((sale) => sale.branchId === branch.id));
        return {
          branchId: branch.id,
          name: branch.name,
          revenue: value,
          share: allRevenue === 0 ? 0 : value / allRevenue,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const units = new Map<string, number>();
    for (const sale of current) {
      for (const line of sale.lines)
        units.set(line.productId, (units.get(line.productId) ?? 0) + line.qty);
    }
    const topSellers = [...units.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([productId, count]) => ({ name: this.state.productName(productId), units: count }));

    const expiring = this.state.data.batches
      .filter(
        (batch) =>
          scopedIds.has(batch.branchId) &&
          this.state.onHand(batch.id) > 0 &&
          daysUntil(batch.expiryDate, now) <= 180,
      )
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    const requests = this.state
      .requests()
      .filter((row) => scopedIds.has(row.branchId) && row.status === "pending");

    return {
      scopeName: query.branchId === null ? "All branches" : (scoped[0]?.name ?? ""),
      periodLabel: range.label,
      previousLabel: range.previousLabel,
      lowStockThreshold: threshold,
      kpis: {
        revenue,
        revenueDelta: percentChange(revenue, previousRevenue),
        transactions: current.length,
        transactionsDelta: percentChange(current.length, previousToDate.length),
        averageBasket: basket,
        averageBasketDelta: percentChange(basket, previousBasket),
        lowStock,
        outOfStock,
      },
      attention: {
        urgentRequests: requests.filter((row) => row.priority === "urgent").length,
        pendingRequests: requests.length,
        batchesExpiring30: expiring.filter((batch) => daysUntil(batch.expiryDate, now) <= 30)
          .length,
        lowStockItems: lowStock,
      },
      trend,
      branchPerformance,
      topSellers,
      expiringSoon: expiring.slice(0, 7).map((batch) => {
        const product = this.state.product(batch.productId);
        return {
          batchId: batch.id,
          productName: this.state.productName(batch.productId),
          genericName: product?.genericName ?? "",
          batchNo: batch.batchNo,
          branchName: this.state.branch(batch.branchId)?.name ?? "",
          qty: this.state.onHand(batch.id),
          expiryDate: batch.expiryDate,
        };
      }),
      expiringSoonCount: expiring.length,
    };
  }

  private filterSales(query: Omit<SalesQuery, "page" | "pageSize">): SaleRow[] {
    const range = periodRange(query.period, this.now());
    const q = query.q.toLowerCase();
    return this.state
      .sales()
      .filter((sale) => {
        const at = new Date(sale.soldAt);
        if (at < range.start || at >= range.end) return false;
        if (query.branchId !== null && sale.branchId !== query.branchId) return false;
        if (query.payment !== "all" && sale.paymentMethod !== query.payment) return false;
        if (q !== "") {
          const text = `${sale.receiptNo} ${this.state.userName(sale.cashierUserId)}`.toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.soldAt.localeCompare(a.soldAt));
  }

  private saleSummary(sale: SaleRow): SaleSummary {
    return {
      id: sale.id,
      receiptNo: sale.receiptNo,
      soldAt: sale.soldAt,
      branchId: sale.branchId,
      branchName:
        this.state.data.branches.find((branch) => branch.id === sale.branchId)?.name ?? "",
      cashierName: this.state.userName(sale.cashierUserId),
      itemCount: sale.itemCount,
      discount: sale.discount,
      paymentMethod: sale.paymentMethod,
      total: sale.total,
      synced: !this.state.unsynced.has(sale.id),
    };
  }

  async listSales(query: SalesQuery): Promise<SalesPage> {
    await this.tick();
    this.requireAction("sales_activity.view");
    const sales = this.filterSales(query);
    return {
      rows: sales
        .slice(query.page * query.pageSize, (query.page + 1) * query.pageSize)
        .map((sale) => this.saleSummary(sale)),
      total: sales.length,
      page: query.page,
      pageSize: query.pageSize,
      periodLabel: periodRange(query.period, this.now()).label,
      totals: {
        revenue: sales.reduce((sum, sale) => sum + sale.total, 0),
        receipts: sales.length,
        items: sales.reduce((sum, sale) => sum + sale.itemCount, 0),
        discount: sales.reduce((sum, sale) => sum + sale.discount, 0),
        discountedReceipts: sales.filter((sale) => sale.discount > 0).length,
        queued: sales.filter((sale) => this.state.unsynced.has(sale.id)).length,
      },
    };
  }

  async getSale(id: string): Promise<SaleReceipt> {
    await this.tick();
    const user = this.currentUser();
    const sale = this.state.sales().find((row) => row.id === id);
    if (!sale) throw new DataError("not_found", "That receipt could not be found.");
    if (!can(user.role, "sales_activity.view") && sale.branchId !== user.branchId) {
      throw new DataError("forbidden", "You can only see receipts from your own branch.");
    }
    return this.receiptOf(sale);
  }

  async exportSalesCsv(query: Omit<SalesQuery, "page" | "pageSize">): Promise<CsvExport> {
    await this.tick();
    this.requireAction("sales_activity.view");
    const sales = this.filterSales(query);
    const pesos = (centavos: number) => (centavos / 100).toFixed(2);
    const rows = [
      [
        "Receipt no.",
        "Date and time",
        "Branch",
        "Cashier",
        "Items",
        "Discount",
        "Payment",
        "Amount",
      ],
      ...sales.map((sale) => {
        const summary = this.saleSummary(sale);
        return [
          sale.receiptNo,
          formatManila(new Date(sale.soldAt), "yyyy-MM-dd HH:mm"),
          summary.branchName,
          summary.cashierName,
          String(sale.itemCount),
          pesos(sale.discount),
          sale.paymentMethod === "cash" ? "Cash" : "GCash",
          pesos(sale.total),
        ];
      }),
    ];
    return {
      filename: `steward-sales-${query.period}.csv`,
      content: `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
      rows: sales.length,
    };
  }

  // -- settings -------------------------------------------------------------

  async updateSettings(raw: SettingsInput): Promise<Settings> {
    await this.tick();
    const user = this.requireAction("settings.manage");
    this.requireOnline("Saving settings");
    const input = this.parse(settingsSchema, raw);
    Object.assign(this.state.data.settings, input);
    return {
      ...this.state.data.settings,
      nextReceiptNo: this.nextWebReceiptNo(user.branchId, false),
    };
  }

  private branchConflicts(input: BranchInput, exceptId: string | null) {
    for (const branch of this.state.branches()) {
      if (branch.id === exceptId) continue;
      if (branch.name.toLowerCase() === input.name.toLowerCase()) {
        throw new DataError("conflict", "A branch with that name already exists.", {
          name: "A branch with that name already exists.",
        });
      }
      if (branch.code === input.code) {
        throw new DataError("conflict", "Another branch uses this code.", {
          code: "Another branch uses this code.",
        });
      }
    }
  }

  async createBranch(raw: BranchInput): Promise<Branch> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Adding a branch");
    const input = this.parse(branchSchema, raw);
    this.branchConflicts(input, null);
    const row = { id: this.newId(), isCentral: false, ...input };
    this.state.data.branches.push(row);
    return this.toBranch(row);
  }

  async updateBranch(id: string, raw: BranchInput): Promise<Branch> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Saving a branch");
    const input = this.parse(branchSchema, raw);
    const row = this.state.branch(id);
    if (!row) throw new DataError("not_found", "That branch no longer exists.");
    this.branchConflicts(input, id);
    Object.assign(row, input);
    return this.toBranch(row);
  }

  async deleteBranch(id: string): Promise<void> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Removing a branch");
    const row = this.state.branch(id);
    if (!row) throw new DataError("not_found", "That branch no longer exists.");
    if (row.isCentral) throw new DataError("validation", "Central can’t be removed.");
    this.state.deletedBranches.add(id);
    const central = this.state.centralBranch();
    for (const user of this.state.users()) if (user.branchId === id) user.branchId = central.id;
  }

  private toStaff(user: UserRow): StaffAccount {
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      position: user.position,
      branchId: user.branchId,
      branchName:
        this.state.data.branches.find((branch) => branch.id === user.branchId)?.name ?? "",
      phone: user.phone,
      email: user.email,
      address: user.address,
      prcLicenseNo: user.prcLicenseNo,
      active: user.active,
    };
  }

  async listStaff(): Promise<StaffAccount[]> {
    await this.tick();
    this.requireAction("settings.manage");
    return this.state.users().map((user) => this.toStaff(user));
  }

  async createStaff(raw: StaffCreateInput): Promise<StaffAccount> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Creating an account");
    const input = this.parse(staffCreateSchema, raw);
    if (this.state.data.users.some((user) => user.username === input.username)) {
      throw new DataError("conflict", "That username is taken.", {
        username: "That username is taken.",
      });
    }
    if (!this.state.branch(input.branchId))
      throw new DataError("not_found", "That branch no longer exists.");
    const row: UserRow = {
      id: this.newId(),
      fullName: input.fullName,
      username: input.username,
      demoPassword: input.password,
      role: "staff",
      position: input.position,
      branchId: input.branchId,
      phone: input.phone,
      email: input.email,
      address: input.address,
      prcLicenseNo: input.position === "pharmacist" ? input.prcLicenseNo : null,
      active: input.active,
    };
    this.state.data.users.push(row);
    return this.toStaff(row);
  }

  async updateStaff(id: string, raw: StaffUpdateInput): Promise<StaffAccount> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Saving an account");
    const row = this.state.users().find((user) => user.id === id);
    if (!row) throw new DataError("not_found", "That account no longer exists.");
    const input = this.parse(staffUpdateSchema, raw);
    Object.assign(row, {
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      address: input.address,
      ...(row.role === "admin"
        ? {}
        : {
            position: input.position,
            branchId: input.branchId,
            prcLicenseNo: input.position === "pharmacist" ? input.prcLicenseNo : null,
            active: input.active,
          }),
      ...(input.password === "" ? {} : { demoPassword: input.password }),
    });
    return this.toStaff(row);
  }

  async setStaffActive(id: string, active: boolean): Promise<StaffAccount> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Changing an account");
    const row = this.state.users().find((user) => user.id === id);
    if (!row) throw new DataError("not_found", "That account no longer exists.");
    if (row.role === "admin")
      throw new DataError("validation", "Super admin accounts stay active.");
    row.active = active;
    return this.toStaff(row);
  }

  async deleteStaff(id: string): Promise<void> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Deleting an account");
    const row = this.state.users().find((user) => user.id === id);
    if (!row) throw new DataError("not_found", "That account no longer exists.");
    if (row.role === "admin")
      throw new DataError("validation", "Super admin accounts can’t be deleted.");
    this.state.deletedUsers.add(id);
  }

  private discountConflict(name: string, exceptId: string | null) {
    const taken = this.state.data.discounts.some(
      (row) =>
        row.id !== exceptId &&
        !this.state.deletedDiscounts.has(row.id) &&
        row.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken)
      throw new DataError("conflict", "A discount with that name already exists.", {
        name: "A discount with that name already exists.",
      });
  }

  async createDiscount(raw: DiscountInput): Promise<Discount> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Adding a discount");
    const input = this.parse(discountSchema, raw);
    this.discountConflict(input.name, null);
    const row = {
      id: this.newId(),
      ...input,
      formula: input.mode === "formula" ? input.formula : null,
    };
    this.state.data.discounts.push(row);
    return { ...row };
  }

  async updateDiscount(id: string, raw: DiscountInput): Promise<Discount> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Saving a discount");
    const input = this.parse(discountSchema, raw);
    const row = this.state.data.discounts.find(
      (discount) => discount.id === id && !this.state.deletedDiscounts.has(id),
    );
    if (!row) throw new DataError("not_found", "That discount no longer exists.");
    this.discountConflict(input.name, id);
    Object.assign(row, input, { formula: input.mode === "formula" ? input.formula : null });
    return { ...row };
  }

  async deleteDiscount(id: string): Promise<void> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Deleting a discount");
    this.state.deletedDiscounts.add(id);
  }

  private toDevice(row: DeviceState): Device {
    return {
      id: row.id,
      branchId: row.branchId,
      branchName: this.state.data.branches.find((branch) => branch.id === row.branchId)?.name ?? "",
      label: row.label,
      receiptSeries: row.receiptSeries,
      printWidth: row.printWidth,
      enrolled: row.enrolled,
      lastSeenAt: row.lastSeenAt,
      revokedAt: row.revokedAt,
    };
  }

  private enrollment(row: DeviceState): DeviceEnrollment {
    row.code = enrollmentCode();
    row.codeExpiresAt = new Date(this.now().getTime() + 15 * 60_000).toISOString();
    return { device: this.toDevice(row), code: row.code, expiresAt: row.codeExpiresAt };
  }

  async listDevices(): Promise<Device[]> {
    await this.tick();
    this.requireAction("settings.manage");
    return this.devices.map((row) => this.toDevice(row));
  }

  async createDevice(raw: DeviceCreateInput): Promise<DeviceEnrollment> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Adding a device");
    const input = this.parse(deviceCreateSchema, raw);
    if (
      this.devices.some(
        (row) =>
          row.branchId === input.branchId &&
          row.receiptSeries === input.receiptSeries &&
          row.revokedAt === null,
      )
    ) {
      throw new DataError("conflict", "Another counter at this branch uses that receipt series.", {
        receiptSeries: "Another counter at this branch uses that receipt series.",
      });
    }
    const row: DeviceState = {
      id: this.newId(),
      ...input,
      enrolled: false,
      lastSeenAt: null,
      revokedAt: null,
      code: null,
      codeExpiresAt: null,
    };
    this.devices.push(row);
    return this.enrollment(row);
  }

  async renewEnrollmentCode(id: string): Promise<DeviceEnrollment> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Creating an enrollment code");
    const row = this.devices.find((device) => device.id === id);
    if (!row) throw new DataError("not_found", "That device no longer exists.");
    if (row.revokedAt !== null)
      throw new DataError("validation", "This device was revoked. Add it again as a new device.");
    return this.enrollment(row);
  }

  async revokeDevice(id: string): Promise<Device> {
    await this.tick();
    this.requireAction("settings.manage");
    this.requireOnline("Revoking a device");
    const row = this.devices.find((device) => device.id === id);
    if (!row) throw new DataError("not_found", "That device no longer exists.");
    row.revokedAt = this.now().toISOString();
    row.code = null;
    return this.toDevice(row);
  }
}
