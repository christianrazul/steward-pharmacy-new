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
import type { DesktopBridge } from "./bridge";

/**
 * DataClient for the desktop app: every call goes through the preload bridge
 * to the main process, which runs it against the counter's PGlite database
 * (and appends to the outbox for writes). The main process re-checks the
 * signed-in person's role and branch on every call.
 */
export class LocalClient implements DataClient {
  private status: SyncStatus = { online: false, syncing: false, queued: 0, lastSyncedAt: null };
  private readonly listeners = new Set<(status: SyncStatus) => void>();

  constructor(private readonly bridge: DesktopBridge) {
    void bridge.syncStatus().then((status) => {
      this.setStatus(status);
    });
    bridge.onSyncStatus((status) => {
      this.setStatus(status);
    });
  }

  private setStatus(status: SyncStatus) {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  private async call<T>(method: keyof DataClient, ...args: unknown[]): Promise<T> {
    let result;
    try {
      result = await this.bridge.invoke(method, args);
    } catch {
      throw new DataError("unknown", "The app had a problem. Restart it, then try again.");
    }
    if (result.ok) return result.value as T;
    throw new DataError(result.error.code, result.error.message, result.error.fields);
  }

  getSyncStatus(): SyncStatus {
    return this.status;
  }

  subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSession(): Promise<Session | null> {
    return this.call("getSession");
  }
  signIn(input: SignInInput): Promise<Session> {
    return this.call("signIn", input);
  }
  signOut(): Promise<void> {
    return this.call("signOut");
  }
  listBranches(): Promise<Branch[]> {
    return this.call("listBranches");
  }
  getSettings(): Promise<Settings> {
    return this.call("getSettings");
  }
  listDiscounts(options?: { includeInactive?: boolean }): Promise<Discount[]> {
    return this.call("listDiscounts", options);
  }
  searchProducts(query: ProductSearchQuery): Promise<ProductSearchResult> {
    return this.call("searchProducts", query);
  }
  createSale(input: SaleCreateInput): Promise<SaleReceipt> {
    return this.call("createSale", input);
  }
  listInventory(query: InventoryQuery): Promise<InventoryPage> {
    return this.call("listInventory", query);
  }
  listBatches(productId: string, branchId: string): Promise<BatchDetail[]> {
    return this.call("listBatches", productId, branchId);
  }
  lookupProducts(query: {
    q: string;
    branchId: string | null;
    limit?: number;
  }): Promise<ProductLookup[]> {
    return this.call("lookupProducts", query);
  }
  receiveStock(input: StockReceiveInput): Promise<ReceiveStockResult> {
    return this.call("receiveStock", input);
  }
  listRequests(query: RequestListQuery): Promise<StockRequestList> {
    return this.call("listRequests", query);
  }
  getRequest(id: string): Promise<StockRequestDetail> {
    return this.call("getRequest", id);
  }
  createRequest(input: StockRequestCreateInput): Promise<StockRequestSummary> {
    return this.call("createRequest", input);
  }
  approveRequest(id: string, input: RequestApproveInput): Promise<StockRequestDetail> {
    return this.call("approveRequest", id, input);
  }
  declineRequest(id: string, input: RequestDeclineInput): Promise<StockRequestDetail> {
    return this.call("declineRequest", id, input);
  }
  fulfillRequest(id: string): Promise<StockRequestDetail> {
    return this.call("fulfillRequest", id);
  }
  listRestockSuggestions(branchId: string): Promise<RestockSuggestion[]> {
    return this.call("listRestockSuggestions", branchId);
  }
  getDashboard(query: DashboardQuery): Promise<DashboardData> {
    return this.call("getDashboard", query);
  }
  listSales(query: SalesQuery): Promise<SalesPage> {
    return this.call("listSales", query);
  }
  getSale(id: string): Promise<SaleReceipt> {
    return this.call("getSale", id);
  }
  exportSalesCsv(query: Omit<SalesQuery, "page" | "pageSize">): Promise<CsvExport> {
    return this.call("exportSalesCsv", query);
  }
  updateSettings(input: SettingsInput): Promise<Settings> {
    return this.call("updateSettings", input);
  }
  createBranch(input: BranchInput): Promise<Branch> {
    return this.call("createBranch", input);
  }
  updateBranch(id: string, input: BranchInput): Promise<Branch> {
    return this.call("updateBranch", id, input);
  }
  deleteBranch(id: string): Promise<void> {
    return this.call("deleteBranch", id);
  }
  listStaff(): Promise<StaffAccount[]> {
    return this.call("listStaff");
  }
  createStaff(input: StaffCreateInput): Promise<StaffAccount> {
    return this.call("createStaff", input);
  }
  updateStaff(id: string, input: StaffUpdateInput): Promise<StaffAccount> {
    return this.call("updateStaff", id, input);
  }
  setStaffActive(id: string, active: boolean): Promise<StaffAccount> {
    return this.call("setStaffActive", id, active);
  }
  deleteStaff(id: string): Promise<void> {
    return this.call("deleteStaff", id);
  }
  createDiscount(input: DiscountInput): Promise<Discount> {
    return this.call("createDiscount", input);
  }
  updateDiscount(id: string, input: DiscountInput): Promise<Discount> {
    return this.call("updateDiscount", id, input);
  }
  deleteDiscount(id: string): Promise<void> {
    return this.call("deleteDiscount", id);
  }
  listDevices(): Promise<Device[]> {
    return this.call("listDevices");
  }
  createDevice(input: DeviceCreateInput): Promise<DeviceEnrollment> {
    return this.call("createDevice", input);
  }
  renewEnrollmentCode(id: string): Promise<DeviceEnrollment> {
    return this.call("renewEnrollmentCode", id);
  }
  revokeDevice(id: string): Promise<Device> {
    return this.call("revokeDevice", id);
  }
}
