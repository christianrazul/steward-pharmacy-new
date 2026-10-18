"use client";

import { useState } from "react";
import type { ReportPeriod } from "@steward/domain";
import {
  BanknoteIcon,
  CloudOffIcon,
  DownloadIcon,
  PackageIcon,
  PercentIcon,
  PrinterIcon,
  ReceiptIcon,
  SearchIcon,
  SmartphoneIcon,
  WalletIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@steward/ui/components/badge";
import { Button } from "@steward/ui/components/button";
import { Card } from "@steward/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@steward/ui/components/dialog";
import { EmptyState } from "@steward/ui/components/empty-state";
import { Input } from "@steward/ui/components/input";
import { InputGroup } from "@steward/ui/components/input-group";
import { NativeSelect } from "@steward/ui/components/native-select";
import { Skeleton } from "@steward/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@steward/ui/components/table";
import { SegmentedControl } from "@steward/ui/components/segmented-control";

import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { Page } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { Receipt } from "@/components/receipt";
import { RequirePermission } from "@/components/require-permission";
import { useBranches, useSale, useSales } from "@/data/hooks";
import { useDataClient } from "@/data/provider";
import { errorMessage } from "@/lib/errors";
import { dateTime, int, peso } from "@/lib/format";
import { PERIOD_TABS } from "@/lib/periods";
import { printReceipt } from "@/lib/print";
import { useFilterPage } from "@/lib/use-filter-page";

type Payment = "all" | "cash" | "gcash";

export default function ActivityPage() {
  return (
    <RequirePermission action="sales_activity.view">
      <Activity />
    </RequirePermission>
  );
}

function Activity() {
  const client = useDataClient();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [q, setQ] = useState("");
  const [payment, setPayment] = useState<Payment>("all");
  const [page, setPage] = useFilterPage(`${branchId ?? ""}|${period}|${q}|${payment}`);
  const [viewId, setViewId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { data: branches = [] } = useBranches();
  const { data, isPending } = useSales({ branchId, period, q, payment, page, pageSize: 20 });
  const { data: receipt } = useSale(viewId);

  async function exportCsv() {
    setExporting(true);
    try {
      const file = await client.exportSalesCsv({ branchId, period, q, payment });
      const url = URL.createObjectURL(new Blob([file.content], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${int(file.rows)} sales`, { description: file.filename });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  const totals = data?.totals;
  const periodLower = (data?.periodLabel ?? "Today").toLowerCase();

  return (
    <Page
      title="Sales activity"
      description={`Every receipt issued across your branches, ${periodLower}.`}
      actions={
        <>
          <NativeSelect
            aria-label="Branch"
            wrapperClassName="w-[190px]"
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
          <Button
            variant="outline"
            disabled={!data || data.total === 0 || exporting}
            onClick={() => {
              void exportCsv();
            }}
          >
            <DownloadIcon aria-hidden="true" />
            Export CSV
          </Button>
        </>
      }
    >
      <KpiGrid className="mb-5">
        <KpiCard
          label="Revenue"
          icon={WalletIcon}
          value={peso(totals?.revenue ?? 0)}
          foot={data?.periodLabel ?? "Today"}
        />
        <KpiCard
          label="Receipts issued"
          icon={ReceiptIcon}
          value={int(totals?.receipts ?? 0)}
          foot={
            (totals?.queued ?? 0) > 0 ? `${int(totals?.queued ?? 0)} waiting to sync` : "All synced"
          }
        />
        <KpiCard
          label="Items sold"
          icon={PackageIcon}
          value={int(totals?.items ?? 0)}
          foot={
            totals && totals.receipts > 0
              ? `${(totals.items / totals.receipts).toFixed(1)} per receipt`
              : "No receipts"
          }
        />
        <KpiCard
          label="Discounts given"
          icon={PercentIcon}
          value={peso(totals?.discount ?? 0)}
          foot={`${int(totals?.discountedReceipts ?? 0)} discounted receipts`}
        />
      </KpiGrid>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3.5">
          <InputGroup
            className="max-w-[300px] min-w-[200px] flex-[1_1_220px]"
            start={<SearchIcon />}
          >
            <Input
              aria-label="Search sales"
              placeholder="Search receipt number or cashier"
              className="h-8 text-[13px]"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
              }}
            />
          </InputGroup>
          <NativeSelect
            size="sm"
            aria-label="Payment method"
            value={payment}
            onValueChange={(value) => {
              setPayment(value as Payment);
            }}
            options={[
              { value: "all", label: "Any payment" },
              { value: "cash", label: "Cash" },
              { value: "gcash", label: "GCash" },
            ]}
          />
        </div>
        {isPending ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="h-10" />
            ))}
          </div>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState icon={ReceiptIcon} title="No sales in this range">
            Try a longer period or another branch.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt no.</TableHead>
                <TableHead>Date and time</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="max-[860px]:hidden">Cashier</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right max-[860px]:hidden">Discount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((sale) => (
                <TableRow
                  key={sale.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => {
                    setViewId(sale.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setViewId(sale.id);
                  }}
                >
                  <TableCell>
                    <span className="code font-medium">{sale.receiptNo}</span>
                    {!sale.synced && (
                      <Badge variant="warning" className="ml-1.5">
                        <CloudOffIcon aria-hidden="true" />
                        Queued
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="num text-muted-foreground">
                    {dateTime(sale.soldAt)}
                  </TableCell>
                  <TableCell>{sale.branchName}</TableCell>
                  <TableCell className="text-muted-foreground max-[860px]:hidden">
                    {sale.cashierName}
                  </TableCell>
                  <TableCell className="num text-right">{sale.itemCount}</TableCell>
                  <TableCell className="num text-right max-[860px]:hidden">
                    {sale.discount > 0 ? (
                      <span className="text-success-foreground">−{peso(sale.discount)}</span>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {sale.paymentMethod === "cash" ? (
                        <BanknoteIcon aria-hidden="true" />
                      ) : (
                        <SmartphoneIcon aria-hidden="true" />
                      )}
                      {sale.paymentMethod === "cash" ? "Cash" : "GCash"}
                    </Badge>
                  </TableCell>
                  <TableCell className="num text-right font-semibold">{peso(sale.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total · {int(data.totals.receipts)} receipts</TableCell>
                <TableCell />
                <TableCell className="max-[860px]:hidden" />
                <TableCell className="num text-right">{int(data.totals.items)}</TableCell>
                <TableCell className="num text-right max-[860px]:hidden">
                  {data.totals.discount > 0 ? `−${peso(data.totals.discount)}` : "–"}
                </TableCell>
                <TableCell />
                <TableCell className="num text-right">{peso(data.totals.revenue)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
        {data && data.total > 0 && (
          <Pager
            page={page}
            pageSize={data.pageSize}
            total={data.total}
            noun="receipts"
            onPage={setPage}
          />
        )}
      </Card>
      <Dialog
        open={viewId !== null}
        onOpenChange={(open) => {
          if (!open) setViewId(null);
        }}
      >
        <DialogContent className="w-[min(420px,calc(100vw-32px))]">
          <DialogHeader>
            <DialogTitle className="code">{receipt?.receiptNo ?? "Receipt"}</DialogTitle>
            <DialogDescription>
              {receipt ? `${receipt.branch.name} · ${dateTime(receipt.soldAt)}` : "Loading…"}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 mb-[18px]">
            {receipt ? <Receipt sale={receipt} /> : <Skeleton className="mx-6 h-80" />}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!receipt}
              onClick={() => {
                if (receipt) printReceipt(receipt);
              }}
            >
              <PrinterIcon aria-hidden="true" />
              Reprint
            </Button>
            <Button
              onClick={() => {
                setViewId(null);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
