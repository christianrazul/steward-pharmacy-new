"use client";

import { Fragment, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type INVENTORY_SORTS,
  INVENTORY_STATUS_FILTERS,
  can,
  daysUntil,
  type InventoryQuery,
} from "@steward/domain";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  PackageIcon,
  PackagePlusIcon,
  SearchIcon,
  SendIcon,
  TrendingUpIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@steward/ui/components/badge";
import { Button } from "@steward/ui/components/button";
import { Card } from "@steward/ui/components/card";
import { EmptyState } from "@steward/ui/components/empty-state";
import { Input } from "@steward/ui/components/input";
import { InputGroup } from "@steward/ui/components/input-group";
import { NativeSelect } from "@steward/ui/components/native-select";
import { Skeleton } from "@steward/ui/components/skeleton";
import { StatusBadge } from "@steward/ui/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@steward/ui/components/table";
import { cn } from "@steward/ui/lib/utils";

import { AddStockSheet } from "@/components/inventory/add-stock-sheet";
import { BatchRows } from "@/components/inventory/batch-rows";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { Page } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { RequirePermission } from "@/components/require-permission";
import { useBranches, useInventory, useSettings } from "@/data/hooks";
import { int, longDate, peso } from "@/lib/format";
import { useCurrentUser, useWorkingBranch } from "@/lib/session";
import { useFilterPage } from "@/lib/use-filter-page";
import { useBranchStore } from "@/stores/branch-store";

type StatusFilter = (typeof INVENTORY_STATUS_FILTERS)[number];
type Sort = (typeof INVENTORY_SORTS)[number];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "expiring", label: "Expiring ≤ 90 days" },
];

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "sku", label: "Sort: SKU" },
  { value: "name", label: "Sort: Name" },
  { value: "stock", label: "Sort: Lowest stock" },
  { value: "expiry", label: "Sort: Soonest expiry" },
  { value: "price", label: "Sort: Highest price" },
];

export default function InventoryPage() {
  return (
    <RequirePermission action="inventory.view">
      <Suspense>
        <InventoryForUrl />
      </Suspense>
    </RequirePermission>
  );
}

/** Starts fresh when the URL changes, so links like ?status=low_stock apply even on this page. */
function InventoryForUrl() {
  const params = useSearchParams();
  return <Inventory key={params.toString()} />;
}

function Inventory() {
  const router = useRouter();
  const params = useSearchParams();
  const user = useCurrentUser();
  const { branchId, branchName } = useWorkingBranch();
  const setWorkingBranchId = useBranchStore((state) => state.setWorkingBranchId);
  const { data: branches = [] } = useBranches();
  const { data: settings } = useSettings();
  const isAdmin = can(user.role, "branches.switch");
  const canAddStock = can(user.role, "inventory.add_stock");

  const initialStatus = params.get("status");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [form, setForm] = useState("");
  const [status, setStatus] = useState<StatusFilter>(
    INVENTORY_STATUS_FILTERS.includes(initialStatus as StatusFilter)
      ? (initialStatus as StatusFilter)
      : "all",
  );
  const [sort, setSort] = useState<Sort>("sku");
  const [page, setPage] = useFilterPage(`${q}|${category}|${form}|${status}|${sort}|${branchId}`);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(params.get("add") === "1" && canAddStock);

  const query: InventoryQuery = { branchId, q, category, form, status, sort, page, pageSize: 20 };
  const { data, isPending } = useInventory(query);
  const filtered = q !== "" || category !== "" || form !== "" || status !== "all";
  const threshold = settings?.lowStockThreshold ?? 20;
  const reset = () => {
    setQ("");
    setCategory("");
    setForm("");
    setStatus("all");
  };

  return (
    <Page
      title="Inventory"
      description={
        data
          ? `${int(data.summary.productCount)} products on the shelf at ${branchName}`
          : `Products on the shelf at ${branchName}`
      }
      actions={
        <>
          <NativeSelect
            aria-label="Branch"
            wrapperClassName="w-[210px]"
            disabled={!isAdmin}
            value={branchId}
            onValueChange={setWorkingBranchId}
            options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
          />
          {canAddStock ? (
            <Button
              onClick={() => {
                setAdding(true);
              }}
            >
              <PackagePlusIcon aria-hidden="true" />
              Add stock
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href="/requests">
                <SendIcon aria-hidden="true" />
                Request stock
              </Link>
            </Button>
          )}
        </>
      }
    >
      <KpiGrid className="mb-5">
        {data ? (
          <>
            <KpiCard
              label="Stock value"
              icon={WalletIcon}
              value={peso(data.summary.stockValueCentavos)}
              foot="At retail price"
            />
            <KpiCard
              label="Best seller this month"
              icon={TrendingUpIcon}
              value={data.summary.bestSeller?.name ?? "No sales yet"}
              valueClassName="mt-3.5 truncate text-xl"
              foot={
                data.summary.bestSeller
                  ? `${int(data.summary.bestSeller.units)} units sold`
                  : "This month"
              }
            />
            <KpiCard
              label="Low or out of stock"
              icon={AlertTriangleIcon}
              value={int(data.summary.lowCount + data.summary.outCount)}
              foot={`${int(data.summary.lowCount)} low · ${int(data.summary.outCount)} out · below ${threshold} units`}
              onClick={() => {
                setStatus("low_stock");
              }}
            />
            <KpiCard
              label="Expiring in 90 days"
              icon={CalendarClockIcon}
              value={int(data.summary.expiringBatches)}
              valueClassName={
                data.summary.expiringBatches > 0 ? "text-brand-soft-foreground" : undefined
              }
              foot="Batches with stock left"
              onClick={() => {
                setStatus("expiring");
              }}
            />
          </>
        ) : (
          [0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-[116px] rounded-xl" />)
        )}
      </KpiGrid>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3.5">
          <InputGroup
            className="max-w-[340px] min-w-[200px] flex-[1_1_240px]"
            start={<SearchIcon />}
          >
            <Input
              aria-label="Search inventory"
              placeholder="Search brand, generic, SKU or batch"
              className="h-8 text-[13px]"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
              }}
            />
          </InputGroup>
          <NativeSelect
            size="sm"
            aria-label="Category"
            value={category}
            onValueChange={setCategory}
            options={[{ value: "", label: "All categories" }, ...(data?.categories ?? [])]}
          />
          <NativeSelect
            size="sm"
            aria-label="Dosage form"
            value={form}
            onValueChange={setForm}
            options={[{ value: "", label: "All forms" }, ...(data?.forms ?? [])]}
          />
          <NativeSelect
            size="sm"
            aria-label="Status"
            value={status}
            onValueChange={(value) => {
              setStatus(value as StatusFilter);
            }}
            options={STATUS_OPTIONS}
          />
          {filtered && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Reset
              <XIcon aria-hidden="true" className="size-3.5" />
            </Button>
          )}
          <span className="flex-1" />
          <NativeSelect
            size="sm"
            aria-label="Sort"
            value={sort}
            onValueChange={(value) => {
              setSort(value as Sort);
            }}
            options={SORT_OPTIONS}
          />
        </div>
        {isPending ? (
          <TableSkeleton />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            icon={PackageIcon}
            title="No products match these filters"
            action={
              <Button variant="outline" size="sm" onClick={reset}>
                Clear filters
              </Button>
            }
          >
            Try a different search or reset the filters.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-11" />
                <TableHead>Product</TableHead>
                <TableHead className="max-[860px]:hidden">Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead>Next expiry</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => {
                const isOpen = open[row.productId] === true;
                const days = row.nextExpiry === null ? null : daysUntil(row.nextExpiry);
                const toggle = () => {
                  setOpen((current) => ({ ...current, [row.productId]: !isOpen }));
                };
                return (
                  <Fragment key={row.productId}>
                    <TableRow
                      className="cursor-pointer"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={toggle}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggle();
                        }
                      }}
                    >
                      <TableCell>
                        <ChevronRightIcon
                          aria-hidden="true"
                          className={cn(
                            "size-[15px] text-muted-foreground transition-transform duration-150",
                            isOpen && "rotate-90",
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {row.brand}{" "}
                          <span className="font-normal text-muted-foreground">
                            {row.strength} {row.form}
                          </span>
                          {!row.isTaxable && (
                            <Badge variant="outline" className="ml-1 h-[18px] text-[11px]">
                              Non-VAT
                            </Badge>
                          )}
                        </div>
                        <div className="text-[12.5px] text-muted-foreground">
                          {row.genericName} · <span className="code">{row.sku}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-[860px]:hidden">
                        <Badge variant="outline">{row.category}</Badge>
                      </TableCell>
                      <TableCell className="num text-right">{peso(row.priceCentavos)}</TableCell>
                      <TableCell
                        className={cn(
                          "num text-right font-medium",
                          row.onHand <= 0
                            ? "text-danger-foreground"
                            : row.onHand < threshold && "text-warning-foreground",
                        )}
                      >
                        {int(row.onHand)}
                      </TableCell>
                      <TableCell>
                        {row.nextExpiry !== null && days !== null ? (
                          <>
                            <div className="num text-[13px]">{longDate(row.nextExpiry)}</div>
                            <div className="text-[12.5px] text-muted-foreground">
                              {days <= 0 ? "Expired" : `in ${days} days`}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} className="border-b border-border bg-muted p-0">
                          <BatchRows productId={row.productId} branchId={branchId} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
        {data && data.total > 0 && (
          <Pager
            page={page}
            pageSize={data.pageSize}
            total={data.total}
            noun="products"
            onPage={setPage}
          />
        )}
      </Card>
      {canAddStock && (
        <AddStockSheet
          open={adding}
          branchId={branchId}
          onOpenChange={(next) => {
            setAdding(next);
            if (!next && params.get("add") === "1") router.replace("/inventory");
          }}
        />
      )}
    </Page>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-5" role="status" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-10" />
      ))}
    </div>
  );
}
