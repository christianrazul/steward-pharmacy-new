"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DashboardQuery,
  InventoryQuery,
  ProductSearchQuery,
  RequestListQuery,
  SalesQuery,
} from "@steward/domain";
import type { DataClient, Session, SyncStatus } from "@steward/data";

import { useDataClient } from "./provider";

/** Query keys in one place, so mutations know what to refresh. */
export const keys = {
  session: ["session"] as const,
  branches: ["branches"] as const,
  settings: ["settings"] as const,
  discounts: (includeInactive: boolean) => ["discounts", includeInactive] as const,
  products: (query: ProductSearchQuery) => ["products", query] as const,
  inventory: (query: InventoryQuery) => ["inventory", query] as const,
  batches: (productId: string, branchId: string) => ["batches", productId, branchId] as const,
  lookup: (q: string, branchId: string | null) => ["lookup", q, branchId] as const,
  requests: (query: RequestListQuery) => ["requests", query] as const,
  request: (id: string) => ["request", id] as const,
  suggestions: (branchId: string) => ["suggestions", branchId] as const,
  dashboard: (query: DashboardQuery) => ["dashboard", query] as const,
  sales: (query: SalesQuery) => ["sales", query] as const,
  sale: (id: string) => ["sale", id] as const,
  staff: ["staff"] as const,
  devices: ["devices"] as const,
  attention: ["attention"] as const,
};

/** Everything that depends on stock or sales; refreshed after any stock-changing write. */
export const STOCK_KEYS = [
  ["products"],
  ["inventory"],
  ["batches"],
  ["lookup"],
  ["dashboard"],
  ["sales"],
  ["suggestions"],
  ["requests"],
  ["request"],
];

export function useSession() {
  const client = useDataClient();
  return useQuery<Session | null>({
    queryKey: keys.session,
    queryFn: () => client.getSession(),
    staleTime: Infinity,
  });
}

export function useBranches() {
  const client = useDataClient();
  return useQuery({ queryKey: keys.branches, queryFn: () => client.listBranches() });
}

export function useSettings() {
  const client = useDataClient();
  return useQuery({ queryKey: keys.settings, queryFn: () => client.getSettings() });
}

export function useDiscounts(includeInactive = false) {
  const client = useDataClient();
  return useQuery({
    queryKey: keys.discounts(includeInactive),
    queryFn: () => client.listDiscounts({ includeInactive }),
  });
}

export function useProductSearch(query: ProductSearchQuery, enabled = true) {
  const client = useDataClient();
  return useQuery({
    queryKey: keys.products(query),
    queryFn: () => client.searchProducts(query),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 5_000,
  });
}

export function useInventory(query: InventoryQuery, enabled = true) {
  const client = useDataClient();
  return useQuery({
    queryKey: keys.inventory(query),
    queryFn: () => client.listInventory(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useBatches(productId: string, branchId: string) {
  const client = useDataClient();
  return useQuery({
    queryKey: keys.batches(productId, branchId),
    queryFn: () => client.listBatches(productId, branchId),
  });
}

export function useProductLookup(q: string, branchId: string | null) {
  const client = useDataClient();
  return useQuery({
    queryKey: keys.lookup(q, branchId),
    queryFn: () => client.lookupProducts({ q, branchId }),
    enabled: q.trim() !== "",
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useRequests(query: RequestListQuery) {
  const client = useDataClient();
  return useQuery({
    queryKey: keys.requests(query),
    queryFn: () => client.listRequests(query),
    placeholderData: keepPreviousData,
  });
}

export function useRequest(id: string | null) {
  const client = useDataClient();
  return useQuery({
    queryKey: keys.request(id ?? ""),
    queryFn: () => client.getRequest(id ?? ""),
    enabled: id !== null,
  });
}

export function useRestockSuggestions(branchId: string) {
  const client = useDataClient();
  return useQuery({
    queryKey: keys.suggestions(branchId),
    queryFn: () => client.listRestockSuggestions(branchId),
  });
}

export function useDashboard(query: DashboardQuery) {
  const client = useDataClient();
  return useQuery({
    queryKey: keys.dashboard(query),
    queryFn: () => client.getDashboard(query),
    placeholderData: keepPreviousData,
  });
}

export function useSales(query: SalesQuery) {
  const client = useDataClient();
  return useQuery({
    queryKey: keys.sales(query),
    queryFn: () => client.listSales(query),
    placeholderData: keepPreviousData,
  });
}

export function useSale(id: string | null) {
  const client = useDataClient();
  return useQuery({
    queryKey: keys.sale(id ?? ""),
    queryFn: () => client.getSale(id ?? ""),
    enabled: id !== null,
  });
}

export function useStaff() {
  const client = useDataClient();
  return useQuery({ queryKey: keys.staff, queryFn: () => client.listStaff() });
}

export function useDevices() {
  const client = useDataClient();
  return useQuery({ queryKey: keys.devices, queryFn: () => client.listDevices() });
}

export function useAttention() {
  const client = useDataClient();
  return useQuery({ queryKey: keys.attention, queryFn: () => client.listAttention() });
}

/**
 * A mutation that refreshes the given query groups when it succeeds.
 * Screens show their own toasts, reusing the button's verb.
 */
export function useDataMutation<TInput, TResult>(
  run: (client: DataClient, input: TInput) => Promise<TResult>,
  invalidate: readonly (readonly unknown[])[],
) {
  const client = useDataClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => run(client, input),
    onSuccess: async () => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

export function useSyncStatus(): SyncStatus {
  const client = useDataClient();
  return useSyncExternalStore(
    (listener) => client.subscribeSyncStatus(listener),
    () => client.getSyncStatus(),
    () => client.getSyncStatus(),
  );
}

/** Refreshes queued markers once a sync finishes. */
export function useRefreshAfterSync() {
  const queryClient = useQueryClient();
  const status = useSyncStatus();
  const wasSyncing = useRef(false);
  useEffect(() => {
    if (wasSyncing.current && !status.syncing) void queryClient.invalidateQueries();
    wasSyncing.current = status.syncing;
  }, [status.syncing, queryClient]);
}
