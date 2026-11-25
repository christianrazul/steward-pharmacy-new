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

import type {
  AttentionItem,
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
} from "./types";

/**
 * The only way screens read or change data. Implementations:
 * - RemoteClient: HTTP to the API (web build).
 * - LocalClient: PGlite plus outbox through the desktop's preload bridge.
 * - FakeDataClient: in-memory fixtures (static front end and tests).
 *
 * Every method enforces nothing about permissions on the client side; the API
 * and the local services re-check role and branch on every call.
 */
export interface DataClient {
  // Session
  getSession(): Promise<Session | null>;
  signIn(input: SignInInput): Promise<Session>;
  signOut(): Promise<void>;

  // Reference data
  listBranches(): Promise<Branch[]>;
  getSettings(): Promise<Settings>;
  listDiscounts(options?: { includeInactive?: boolean }): Promise<Discount[]>;

  // Point of sale
  searchProducts(query: ProductSearchQuery): Promise<ProductSearchResult>;
  createSale(input: SaleCreateInput): Promise<SaleReceipt>;

  // Inventory
  listInventory(query: InventoryQuery): Promise<InventoryPage>;
  listBatches(productId: string, branchId: string): Promise<BatchDetail[]>;
  lookupProducts(query: {
    q: string;
    branchId: string | null;
    limit?: number;
  }): Promise<ProductLookup[]>;
  receiveStock(input: StockReceiveInput): Promise<ReceiveStockResult>;

  // Stock requests
  listRequests(query: RequestListQuery): Promise<StockRequestList>;
  getRequest(id: string): Promise<StockRequestDetail>;
  createRequest(input: StockRequestCreateInput): Promise<StockRequestSummary>;
  approveRequest(id: string, input: RequestApproveInput): Promise<StockRequestDetail>;
  declineRequest(id: string, input: RequestDeclineInput): Promise<StockRequestDetail>;
  fulfillRequest(id: string): Promise<StockRequestDetail>;
  listRestockSuggestions(branchId: string): Promise<RestockSuggestion[]>;

  // Reports
  getDashboard(query: DashboardQuery): Promise<DashboardData>;
  listSales(query: SalesQuery): Promise<SalesPage>;
  getSale(id: string): Promise<SaleReceipt>;
  exportSalesCsv(query: Omit<SalesQuery, "page" | "pageSize">): Promise<CsvExport>;

  // Settings (admins)
  updateSettings(input: SettingsInput): Promise<Settings>;
  createBranch(input: BranchInput): Promise<Branch>;
  updateBranch(id: string, input: BranchInput): Promise<Branch>;
  deleteBranch(id: string): Promise<void>;
  listStaff(): Promise<StaffAccount[]>;
  createStaff(input: StaffCreateInput): Promise<StaffAccount>;
  updateStaff(id: string, input: StaffUpdateInput): Promise<StaffAccount>;
  setStaffActive(id: string, active: boolean): Promise<StaffAccount>;
  deleteStaff(id: string): Promise<void>;
  createDiscount(input: DiscountInput): Promise<Discount>;
  updateDiscount(id: string, input: DiscountInput): Promise<Discount>;
  deleteDiscount(id: string): Promise<void>;
  listDevices(): Promise<Device[]>;
  createDevice(input: DeviceCreateInput): Promise<DeviceEnrollment>;
  renewEnrollmentCode(id: string): Promise<DeviceEnrollment>;
  revokeDevice(id: string): Promise<Device>;
  /** Synced changes the server refused or flagged (oversold, total mismatch). */
  listAttention(): Promise<AttentionItem[]>;
  resolveAttention(mutationId: string): Promise<void>;

  // Sync and connectivity
  getSyncStatus(): SyncStatus;
  subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void;
}
