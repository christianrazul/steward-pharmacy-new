"use client";

import { useState } from "react";
import Link from "next/link";
import { daysUntil, expiryTone, formatManila, type ReportPeriod } from "@steward/domain";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  FlameIcon,
  PackageIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  WalletIcon,
} from "lucide-react";
import { Badge } from "@steward/ui/components/badge";
import { Button } from "@steward/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@steward/ui/components/card";
import { EmptyState } from "@steward/ui/components/empty-state";
import { NativeSelect } from "@steward/ui/components/native-select";
import { Skeleton } from "@steward/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@steward/ui/components/table";
import { SegmentedControl } from "@steward/ui/components/segmented-control";
import { cn } from "@steward/ui/lib/utils";

import { BarRow } from "@/components/bar-row";
import { SalesTrendChart } from "@/components/dashboard/sales-trend-chart";
import { Delta, KpiCard, KpiGrid } from "@/components/kpi-card";
import { Page } from "@/components/page-header";
import { RequirePermission } from "@/components/require-permission";
import { useBranches, useDashboard } from "@/data/hooks";
import { int, peso } from "@/lib/format";
import { PERIOD_TABS } from "@/lib/periods";
import { useCurrentUser } from "@/lib/session";

function greeting(now: Date): string {
  const hour = Number(formatManila(now, "H"));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  return (
    <RequirePermission action="dashboard.view">
      <Dashboard />
    </RequirePermission>
  );
}

function Dashboard() {
  const user = useCurrentUser();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const { data: branches = [] } = useBranches();
  const { data, isPending, isError } = useDashboard({ branchId, period });
  const now = new Date();

  return (
    <Page
      title={`${greeting(now)}, ${user.fullName.split(" ")[0] ?? ""}`}
      description={`${data?.scopeName ?? "All branches"} · ${formatManila(now, "EEEE, MMMM d")}`}
      actions={
        <>
          <NativeSelect
            aria-label="Branch"
            wrapperClassName="w-[200px]"
            value={branchId ?? "all"}
            onValueChange={(value) => {
              setBranchId(value === "all" ? null : value);
            }}
            options={[
              { value: "all", label: "All branches" },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <SegmentedControl
            label="Period"
            value={period}
            onValueChange={setPeriod}
            options={PERIOD_TABS.map(([value, label]) => ({ value, label }))}
          />
        </>
      }
    >
      {isError ? (
        <Card>
          <EmptyState icon={AlertTriangleIcon} title="The dashboard didn’t load">
            Check your connection, then reload the page.
          </EmptyState>
        </Card>
      ) : isPending ? (
        <DashboardSkeleton />
      ) : (
        <DashboardBody data={data} branchId={branchId} onBranch={setBranchId} />
      )}
    </Page>
  );
}

function DashboardBody({
  data,
  branchId,
  onBranch,
}: {
  data: NonNullable<ReturnType<typeof useDashboard>["data"]>;
  branchId: string | null;
  onBranch: (id: string) => void;
}) {
  const { attention, kpis } = data;
  const showAttention =
    attention.urgentRequests > 0 ||
    attention.batchesExpiring30 > 0 ||
    attention.pendingRequests > 0;
  const branchMax = Math.max(1, ...data.branchPerformance.map((row) => row.revenue));
  const topMax = Math.max(1, ...data.topSellers.map((row) => row.units));
  const periodLower = data.periodLabel.toLowerCase();

  return (
    <>
      {showAttention && (
        <div className="mb-4 grid grid-cols-3 gap-3 max-[980px]:grid-cols-1">
          <AttentionCard
            href="/requests"
            icon={FlameIcon}
            tone="bg-danger-soft text-danger-foreground"
            title={`${attention.urgentRequests} urgent ${attention.urgentRequests === 1 ? "request" : "requests"}`}
            description={`${attention.pendingRequests} pending in total`}
          />
          <AttentionCard
            href="/inventory?status=expiring"
            icon={CalendarClockIcon}
            tone="bg-brand-soft text-brand-soft-foreground"
            title={`${attention.batchesExpiring30} ${attention.batchesExpiring30 === 1 ? "batch expires" : "batches expire"} within 30 days`}
            description="Sell first or pull from shelves"
          />
          <AttentionCard
            href="/inventory?status=low_stock"
            icon={PackageIcon}
            tone="bg-warning-soft text-warning-foreground"
            title={`${int(attention.lowStockItems)} items running low`}
            description={`Below ${data.lowStockThreshold} units at ${branchId === null ? "one or more branches" : "this branch"}`}
          />
        </div>
      )}

      <KpiGrid>
        <KpiCard
          label="Revenue"
          icon={WalletIcon}
          value={peso(kpis.revenue)}
          foot={
            <>
              <Delta value={kpis.revenueDelta} />
              vs {data.previousLabel}
            </>
          }
        />
        <KpiCard
          label="Transactions"
          icon={ReceiptIcon}
          value={int(kpis.transactions)}
          foot={
            <>
              <Delta value={kpis.transactionsDelta} />
              vs {data.previousLabel}
            </>
          }
        />
        <KpiCard
          label="Average basket"
          icon={ShoppingCartIcon}
          value={peso(kpis.averageBasket)}
          foot={
            <>
              <Delta value={kpis.averageBasketDelta} />
              per transaction
            </>
          }
        />
        <KpiCard
          label="Low stock"
          icon={AlertTriangleIcon}
          value={int(kpis.lowStock)}
          foot={`${int(kpis.outOfStock)} out of stock · below ${data.lowStockThreshold} units`}
        />
      </KpiGrid>

      <div className="mt-4 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <div className="min-w-0 flex-1">
              <CardTitle>Sales trend</CardTitle>
              <CardDescription>
                {data.periodLabel} compared with {data.previousLabel}
              </CardDescription>
            </div>
            <CardAction className="flex items-center gap-3.5 text-[12.5px] text-muted-foreground max-[860px]:hidden">
              <span>
                <i className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-chart-1 align-[-1px]" />
                {data.periodLabel}
              </span>
              <span>
                <i className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-chart-2 align-[-1px]" />
                Previous
              </span>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-3">
            <SalesTrendChart data={data.trend} currentLabel={data.periodLabel} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Branch performance</CardTitle>
              <CardDescription>Revenue · {periodLower}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {data.branchPerformance.map((row, index) => (
              <button
                key={row.branchId}
                type="button"
                onClick={() => {
                  onBranch(row.branchId);
                }}
                className={cn(
                  "block w-full py-[11px] text-left",
                  index > 0 && "border-t border-border",
                  branchId !== null && branchId !== row.branchId && "opacity-45",
                )}
              >
                <BarRow
                  label={
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{row.name}</span>
                      {index === 0 && row.revenue > 0 && <Badge variant="brand">Top</Badge>}
                    </span>
                  }
                  value={<span className="font-medium">{peso(row.revenue)}</span>}
                  fraction={row.revenue / branchMax}
                  barStyle={{ opacity: 1 - index * 0.2 }}
                  sub={`${(row.share * 100).toFixed(1)}% of all sales`}
                />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <div className="min-w-0 flex-1">
              <CardTitle>Expiring soon</CardTitle>
              <CardDescription>
                {int(data.expiringSoonCount)} batches with stock expire in the next 6 months
              </CardDescription>
            </div>
            <CardAction>
              <Button variant="outline" size="sm" asChild>
                <Link href="/inventory?status=expiring">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <div className="mt-3">
            {data.expiringSoon.length === 0 ? (
              <EmptyState icon={ShieldCheckIcon} title="Nothing expiring soon">
                No batches with stock expire in the next 6 months.
              </EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="max-[860px]:hidden">Batch</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expiringSoon.map((batch) => {
                    const days = daysUntil(batch.expiryDate);
                    return (
                      <TableRow key={batch.batchId}>
                        <TableCell>
                          <div className="font-medium">{batch.productName}</div>
                          <div className="text-[12.5px] text-muted-foreground">
                            {batch.genericName}
                          </div>
                        </TableCell>
                        <TableCell className="max-[860px]:hidden">
                          <span className="code text-muted-foreground">{batch.batchNo}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{batch.branchName}</TableCell>
                        <TableCell className="num text-right">{int(batch.qty)}</TableCell>
                        <TableCell>
                          <Badge variant={expiryTone(batch.expiryDate)}>
                            {days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top sellers</CardTitle>
              <CardDescription>Units sold · {periodLower}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-1.5">
            {data.topSellers.length === 0 ? (
              <p className="py-2.5 text-[12.5px] text-muted-foreground">
                No sales in this period yet.
              </p>
            ) : (
              data.topSellers.map((row, index) => (
                <div key={row.name} className={cn("py-2.5", index > 0 && "border-t border-border")}>
                  <BarRow
                    label={
                      <span className="flex items-center gap-3">
                        <span className="num w-3.5 text-[12.5px] text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="truncate font-medium">{row.name}</span>
                      </span>
                    }
                    value={<span className="text-muted-foreground">{int(row.units)} units</span>}
                    fraction={row.units / topMax}
                    barClassName={index === 0 ? "bg-brand" : "bg-foreground"}
                    barStyle={{ opacity: index === 0 ? 1 : 0.8 - index * 0.12 }}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function AttentionCard({
  href,
  icon: Icon,
  tone,
  title,
  description,
}: {
  href: string;
  icon: typeof FlameIcon;
  tone: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-ring"
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", tone)}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-px block text-[13px] text-muted-foreground">{description}</span>
      </span>
      <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading dashboard">
      <div className="mb-4 grid grid-cols-3 gap-3 max-[980px]:grid-cols-1">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-[66px] rounded-xl" />
        ))}
      </div>
      <KpiGrid>
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-[116px] rounded-xl" />
        ))}
      </KpiGrid>
      <div className="mt-4 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 max-[980px]:grid-cols-1">
        <Skeleton className="h-[340px] rounded-xl" />
        <Skeleton className="h-[340px] rounded-xl" />
      </div>
    </div>
  );
}
