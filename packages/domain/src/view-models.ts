import type { Role, StaffPosition } from "./permissions";
import type { RequestPriority, RequestStatus } from "./requests";
import type { StockStatus } from "./stock-status";
import type { DiscountMode, VatMode } from "./totals";

/**
 * What screens receive from a DataClient. These are view models, shaped for
 * the screens; they are the same whether the data came from the API (web),
 * the local database (desktop) or fixtures (static front end and tests).
 * Money is always integer centavos; timestamps are ISO strings in UTC.
 */

export interface SessionUser {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  position: StaffPosition | null;
  branchId: string;
}

export interface Session {
  user: SessionUser;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  isCentral: boolean;
  address: string;
  city: string;
  phone: string;
  email: string | null;
  opensAt: string;
  closesAt: string;
  openDays: number[];
  staffCount: number;
  productCount: number;
}

export interface Settings {
  lowStockThreshold: number;
  receiptPrefix: string;
  vatRateBp: number;
  vatMode: VatMode;
  /** Preview of the next web receipt number at the signed-in person's branch. */
  nextReceiptNo: string;
}

export interface Discount {
  id: string;
  name: string;
  mode: DiscountMode;
  value: number;
  formula: string | null;
  capCentavos: number | null;
  minSpendCentavos: number | null;
  isVatExempt: boolean;
  active: boolean;
}

export interface PosProduct {
  id: string;
  sku: string;
  name: string;
  genericName: string;
  brand: string;
  strength: string;
  form: string;
  category: string;
  priceCentavos: number;
  isTaxable: boolean;
  /** Sellable on hand at the branch: not expired, sum of the ledger. */
  sellable: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface ProductSearchResult {
  products: PosProduct[];
  /** Matches before the limit was applied. */
  total: number;
  categories: CategoryCount[];
}

export interface InventoryRow {
  productId: string;
  sku: string;
  brand: string;
  genericName: string;
  strength: string;
  form: string;
  category: string;
  priceCentavos: number;
  isTaxable: boolean;
  onHand: number;
  nextExpiry: string | null;
  status: StockStatus;
}

export interface InventorySummary {
  productCount: number;
  stockValueCentavos: number;
  lowCount: number;
  outCount: number;
  expiringBatches: number;
  bestSeller: { name: string; units: number } | null;
}

export interface InventoryPage {
  rows: InventoryRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: InventorySummary;
  categories: string[];
  forms: string[];
}

export interface BatchDetail {
  batchId: string;
  batchNo: string;
  expiryDate: string;
  receivedAt: string;
  onHand: number;
  isExpired: boolean;
  sellsNext: boolean;
}

export interface ProductLookup {
  id: string;
  sku: string;
  name: string;
  genericName: string;
  priceCentavos: number;
  isTaxable: boolean;
  /** On hand at the requested branch, or null when it has never carried the product. */
  onHand: number | null;
}

export interface ReceiveStockResult {
  productId: string;
  productName: string;
  branchName: string;
  qty: number;
  toppedUp: boolean;
}

export type PaymentMethod = "cash" | "gcash";

export interface ReceiptLine {
  name: string;
  qty: number;
  unitPriceCentavos: number;
  lineTotalCentavos: number;
  isTaxable: boolean;
}

export interface SaleReceipt {
  id: string;
  receiptNo: string;
  branch: { id: string; name: string; address: string; city: string; phone: string };
  soldAt: string;
  cashierName: string;
  lines: ReceiptLine[];
  itemCount: number;
  subtotal: number;
  discount: number;
  discountLabel: string | null;
  vatExemptRemoved: number;
  vat: number;
  vatable: number;
  nonVat: number;
  total: number;
  isVatExemptSale: boolean;
  paymentMethod: PaymentMethod;
  cashReceived: number | null;
  change: number | null;
  gcashRef: string | null;
  /** False while the sale waits in the device's outbox. */
  synced: boolean;
}

export interface SaleSummary {
  id: string;
  receiptNo: string;
  soldAt: string;
  branchId: string;
  branchName: string;
  cashierName: string;
  itemCount: number;
  discount: number;
  paymentMethod: PaymentMethod;
  total: number;
  synced: boolean;
}

export interface SalesTotals {
  revenue: number;
  receipts: number;
  items: number;
  discount: number;
  discountedReceipts: number;
  queued: number;
}

export interface SalesPage {
  rows: SaleSummary[];
  total: number;
  page: number;
  pageSize: number;
  totals: SalesTotals;
  periodLabel: string;
}

export interface StockRequestSummary {
  id: string;
  requestNo: string;
  branchId: string;
  branchName: string;
  requestedBy: string;
  createdAt: string;
  priority: RequestPriority;
  status: RequestStatus;
  itemCount: number;
  units: number;
  synced: boolean;
}

export interface StockRequestList {
  rows: StockRequestSummary[];
  counts: Record<RequestStatus | "all", number>;
  pending: { count: number; urgent: number; units: number };
}

export interface StockRequestItem {
  productId: string;
  sku: string;
  name: string;
  genericName: string;
  qtyRequested: number;
  qtyAllocated: number | null;
  /** Central's sellable on hand right now. */
  centralSellable: number;
}

export interface TimelineEntry {
  kind: "created" | "approved" | "declined" | "fulfilled";
  actorName: string;
  at: string;
  note: string;
}

export interface StockRequestDetail extends StockRequestSummary {
  note: string;
  items: StockRequestItem[];
  events: TimelineEntry[];
}

export interface RestockSuggestion {
  productId: string;
  name: string;
  onHand: number;
}

export interface DashboardKpis {
  revenue: number;
  revenueDelta: number | null;
  transactions: number;
  transactionsDelta: number | null;
  averageBasket: number;
  averageBasketDelta: number | null;
  lowStock: number;
  outOfStock: number;
}

export interface DashboardData {
  scopeName: string;
  periodLabel: string;
  previousLabel: string;
  lowStockThreshold: number;
  kpis: DashboardKpis;
  attention: {
    urgentRequests: number;
    pendingRequests: number;
    batchesExpiring30: number;
    lowStockItems: number;
  };
  trend: { label: string; current: number; previous: number }[];
  branchPerformance: { branchId: string; name: string; revenue: number; share: number }[];
  topSellers: { name: string; units: number }[];
  expiringSoon: {
    batchId: string;
    productName: string;
    genericName: string;
    batchNo: string;
    branchName: string;
    qty: number;
    expiryDate: string;
  }[];
  expiringSoonCount: number;
}

export interface StaffAccount {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  position: StaffPosition | null;
  branchId: string;
  branchName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  prcLicenseNo: string | null;
  active: boolean;
}

export interface Device {
  id: string;
  branchId: string;
  branchName: string;
  label: string;
  receiptSeries: string;
  printWidth: 58 | 80;
  enrolled: boolean;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export interface DeviceEnrollment {
  device: Device;
  code: string;
  expiresAt: string;
}

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  queued: number;
  lastSyncedAt: string | null;
}

export interface CsvExport {
  filename: string;
  content: string;
  rows: number;
}
