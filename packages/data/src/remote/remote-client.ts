import type { AppType } from "@steward/api/app-type";
import type {
  BranchInput,
  DashboardQuery,
  DeviceCreateInput,
  DiscountInput,
  InventoryQuery,
  ProductSearchQuery,
  RequestApproveInput,
  RequestDeclineInput,
  RequestListQuery,
  SaleCreateInput,
  SalesQuery,
  SettingsInput,
  SignInInput,
  StaffCreateInput,
  StaffUpdateInput,
  StockReceiveInput,
  StockRequestCreateInput,
} from "@steward/domain";
import type { DataErrorCode } from "@steward/domain/view-models-errors";
import { hc } from "hono/client";

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
  ProductLookup,
  ProductSearchResult,
  ReceiveStockResult,
  RestockSuggestion,
  SaleReceipt,
  SalesPage,
  Session,
  Settings,
  StaffAccount,
  StockRequestDetail,
  StockRequestList,
  StockRequestSummary,
  SyncStatus,
} from "../types";

export interface RemoteClientOptions {
  /** The API's base URL, e.g. https://pos.stewardpharmacy.ph/api or http://localhost:4000. */
  baseUrl: string;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** How often to check /health while the page is open. */
  healthIntervalMs?: number;
}

const CODES = new Set<DataErrorCode>([
  "unauthorized",
  "forbidden",
  "not_found",
  "validation",
  "conflict",
  "offline",
  "unknown",
]);

function isErrorBody(
  body: unknown,
): body is { error: { code: string; message: string; fields?: Record<string, string> } } {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  );
}

/** Query strings carry strings only; drop empty values so defaults apply on the server. */
function query(
  values: Record<string, string | number | boolean | null | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") continue;
    result[key] = String(value);
  }
  return result;
}

/**
 * DataClient over HTTP to the API, used by the web build. Session cookies are
 * httpOnly and sent with every request. The API re-checks permissions on every
 * call; nothing here is a security boundary.
 */
export class RemoteClient implements DataClient {
  private readonly api;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private status: SyncStatus = { online: true, syncing: false, queued: 0, lastSyncedAt: null };
  private readonly listeners = new Set<(status: SyncStatus) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RemoteClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    const base = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.fetchImpl = (input, init) => base(input, { ...init, credentials: "include" });
    this.api = hc<AppType>(this.baseUrl, { fetch: this.fetchImpl });
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        void this.checkHealth();
      });
      window.addEventListener("offline", () => {
        this.setStatus({ ...this.status, online: false });
      });
      void this.checkHealth();
      this.timer = setInterval(() => {
        void this.checkHealth();
      }, options.healthIntervalMs ?? 30_000);
    }
  }

  /** Stops the health check timer (tests, hot reload). */
  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }

  // -- plumbing -------------------------------------------------------------

  private setStatus(status: SyncStatus) {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  /** Online means the API answers /health, not just navigator.onLine. */
  private async checkHealth(): Promise<void> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`, { method: "GET" });
      this.setStatus({
        ...this.status,
        online: response.ok,
        lastSyncedAt: response.ok ? new Date().toISOString() : this.status.lastSyncedAt,
      });
    } catch {
      this.setStatus({ ...this.status, online: false });
    }
  }

  /** Sends a request and returns its JSON, or throws a DataError with the API's message. */
  private async call<T>(
    send: () => Promise<{ ok: boolean; status: number; json: () => Promise<T> }>,
  ): Promise<T> {
    let response: Awaited<ReturnType<typeof send>>;
    try {
      response = await send();
    } catch {
      this.setStatus({ ...this.status, online: false });
      throw new DataError("offline", "Can’t reach the server. Check the connection and try again.");
    }
    if (!this.status.online) void this.checkHealth();
    if (response.ok) return response.json();
    const body: unknown = await response.json().catch(() => null);
    if (isErrorBody(body)) {
      const code = CODES.has(body.error.code as DataErrorCode)
        ? (body.error.code as DataErrorCode)
        : "unknown";
      throw new DataError(code, body.error.message, body.error.fields ?? {});
    }
    throw new DataError("unknown", "Something went wrong on the server. Try again in a moment.");
  }

  private notYet(): never {
    throw new DataError("unknown", "This action is not connected to the server yet.");
  }

  getSyncStatus(): SyncStatus {
    return this.status;
  }

  subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // -- session --------------------------------------------------------------

  async getSession(): Promise<Session | null> {
    const body = await this.call(() => this.api.session.$get());
    return body.session;
  }

  async signIn(input: SignInInput): Promise<Session> {
    const body = await this.call(() => this.api.session.$post({ json: input }));
    return body.session;
  }

  async signOut(): Promise<void> {
    await this.call(() => this.api.session.$delete());
  }

  // -- reads ----------------------------------------------------------------

  listBranches(): Promise<Branch[]> {
    return this.call(() => this.api.branches.$get());
  }

  getSettings(): Promise<Settings> {
    return this.call(() => this.api.settings.$get());
  }

  listDiscounts(options: { includeInactive?: boolean } = {}): Promise<Discount[]> {
    return this.call(() =>
      this.api.discounts.$get({
        query: { includeInactive: options.includeInactive === true ? "true" : "false" },
      }),
    );
  }

  searchProducts(q: ProductSearchQuery): Promise<ProductSearchResult> {
    return this.call(() =>
      this.api.products.search.$get({
        query: { branchId: q.branchId, q: q.q, category: q.category, limit: String(q.limit) },
      }),
    );
  }

  listInventory(q: InventoryQuery): Promise<InventoryPage> {
    return this.call(() =>
      this.api.inventory.$get({
        query: {
          branchId: q.branchId,
          q: q.q,
          category: q.category,
          form: q.form,
          status: q.status,
          sort: q.sort,
          page: String(q.page),
          pageSize: String(q.pageSize),
        },
      }),
    );
  }

  listBatches(productId: string, branchId: string): Promise<BatchDetail[]> {
    return this.call(() => this.api.inventory.batches.$get({ query: { productId, branchId } }));
  }

  lookupProducts(q: {
    q: string;
    branchId: string | null;
    limit?: number;
  }): Promise<ProductLookup[]> {
    return this.call(() => this.api.products.lookup.$get({ query: query(q) }));
  }

  listRequests(q: RequestListQuery): Promise<StockRequestList> {
    return this.call(() => this.api.requests.$get({ query: query(q) }));
  }

  getRequest(id: string): Promise<StockRequestDetail> {
    return this.call(() => this.api.requests[":id"].$get({ param: { id } }));
  }

  listRestockSuggestions(branchId: string): Promise<RestockSuggestion[]> {
    return this.call(() => this.api.inventory.suggestions.$get({ query: { branchId } }));
  }

  getDashboard(q: DashboardQuery): Promise<DashboardData> {
    return this.call(() => this.api.dashboard.$get({ query: query(q) }));
  }

  listSales(q: SalesQuery): Promise<SalesPage> {
    return this.call(() => this.api.sales.$get({ query: query(q) }));
  }

  getSale(id: string): Promise<SaleReceipt> {
    return this.call(() => this.api.sales[":id"].$get({ param: { id } }));
  }

  exportSalesCsv(q: Omit<SalesQuery, "page" | "pageSize">): Promise<CsvExport> {
    return this.call(() => this.api.sales.export.$get({ query: query(q) }));
  }

  listStaff(): Promise<StaffAccount[]> {
    return this.call(() => this.api.staff.$get());
  }

  listDevices(): Promise<Device[]> {
    return this.call(() => this.api.devices.$get());
  }

  // -- writes (connected milestone by milestone) ----------------------------

  createSale(_input: SaleCreateInput): Promise<SaleReceipt> {
    return this.notYet();
  }
  receiveStock(_input: StockReceiveInput): Promise<ReceiveStockResult> {
    return this.notYet();
  }
  createRequest(_input: StockRequestCreateInput): Promise<StockRequestSummary> {
    return this.notYet();
  }
  approveRequest(_id: string, _input: RequestApproveInput): Promise<StockRequestDetail> {
    return this.notYet();
  }
  declineRequest(_id: string, _input: RequestDeclineInput): Promise<StockRequestDetail> {
    return this.notYet();
  }
  fulfillRequest(_id: string): Promise<StockRequestDetail> {
    return this.notYet();
  }
  updateSettings(_input: SettingsInput): Promise<Settings> {
    return this.notYet();
  }
  createBranch(_input: BranchInput): Promise<Branch> {
    return this.notYet();
  }
  updateBranch(_id: string, _input: BranchInput): Promise<Branch> {
    return this.notYet();
  }
  deleteBranch(_id: string): Promise<void> {
    return this.notYet();
  }
  createStaff(_input: StaffCreateInput): Promise<StaffAccount> {
    return this.notYet();
  }
  updateStaff(_id: string, _input: StaffUpdateInput): Promise<StaffAccount> {
    return this.notYet();
  }
  setStaffActive(_id: string, _active: boolean): Promise<StaffAccount> {
    return this.notYet();
  }
  deleteStaff(_id: string): Promise<void> {
    return this.notYet();
  }
  createDiscount(_input: DiscountInput): Promise<Discount> {
    return this.notYet();
  }
  updateDiscount(_id: string, _input: DiscountInput): Promise<Discount> {
    return this.notYet();
  }
  deleteDiscount(_id: string): Promise<void> {
    return this.notYet();
  }
  createDevice(_input: DeviceCreateInput): Promise<DeviceEnrollment> {
    return this.notYet();
  }
  renewEnrollmentCode(_id: string): Promise<DeviceEnrollment> {
    return this.notYet();
  }
  revokeDevice(_id: string): Promise<Device> {
    return this.notYet();
  }
}
