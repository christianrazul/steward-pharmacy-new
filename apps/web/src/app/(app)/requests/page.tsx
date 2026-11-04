"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { can, type RequestPriority } from "@steward/domain";
import type { ProductLookup } from "@steward/data";
import {
  BoxesIcon,
  ChevronRightIcon,
  CloudOffIcon,
  FlameIcon,
  HourglassIcon,
  InboxIcon,
  PlusIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { v7 as uuidv7 } from "uuid";
import { Avatar, AvatarFallback, initialsOf } from "@steward/ui/components/avatar";
import { Button } from "@steward/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@steward/ui/components/card";
import { EmptyState } from "@steward/ui/components/empty-state";
import { Field } from "@steward/ui/components/field";
import { Input } from "@steward/ui/components/input";
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
import { Textarea } from "@steward/ui/components/textarea";

import { KpiCard } from "@/components/kpi-card";
import { Page } from "@/components/page-header";
import { ProductCombo } from "@/components/product-combo";
import { PriorityBadge, RequestStatusBadge } from "@/components/request-badges";
import { RequestSheet } from "@/components/requests/request-sheet";
import { RequirePermission } from "@/components/require-permission";
import {
  STOCK_KEYS,
  useBranches,
  useDataMutation,
  useRequests,
  useRestockSuggestions,
  useSettings,
  useSyncStatus,
} from "@/data/hooks";
import { errorMessage } from "@/lib/errors";
import { dateTime, int, relativeTime } from "@/lib/format";
import { useCurrentUser } from "@/lib/session";

type StatusTab = "pending" | "approved" | "fulfilled" | "declined" | "all";

export default function RequestsPage() {
  return (
    <RequirePermission action="stock_requests.view">
      <Suspense>
        <Requests />
      </Suspense>
    </RequirePermission>
  );
}

function Requests() {
  const user = useCurrentUser();
  return can(user.role, "stock_requests.review") ? <RequestsAdmin /> : <RequestsStaff />;
}

function RequestsAdmin() {
  const params = useSearchParams();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusTab>("pending");
  const [openId, setOpenId] = useState<string | null>(params.get("id"));
  const { data: branches = [] } = useBranches();
  const { data, isPending } = useRequests({ branchId, status });
  const central = branches.find((branch) => branch.isCentral);

  return (
    <Page
      title="Stock requests"
      description={`Branches ask central (${central?.name ?? "central"}) for stock. Approve what you can send, then mark it fulfilled when it arrives.`}
      actions={
        <NativeSelect
          aria-label="Branch"
          wrapperClassName="w-[200px]"
          value={branchId ?? "all"}
          onValueChange={(value) => {
            setBranchId(value === "all" ? null : value);
          }}
          options={[
            { value: "all", label: "All branches" },
            ...branches.filter((b) => !b.isCentral).map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
      }
    >
      <div className="mb-5 grid grid-cols-3 gap-4 max-[860px]:grid-cols-1">
        <KpiCard
          label="Awaiting your decision"
          icon={HourglassIcon}
          value={int(data?.pending.count ?? 0)}
          foot={
            branchId === null
              ? "Across all branches"
              : (branches.find((b) => b.id === branchId)?.name ?? "")
          }
        />
        <KpiCard
          label="Marked urgent"
          icon={FlameIcon}
          value={int(data?.pending.urgent ?? 0)}
          valueClassName={(data?.pending.urgent ?? 0) > 0 ? "text-danger-foreground" : undefined}
          foot="Needs a same-day transfer"
        />
        <KpiCard
          label="Units requested"
          icon={BoxesIcon}
          value={int(data?.pending.units ?? 0)}
          foot="In pending requests"
        />
      </div>
      <Card>
        <div className="border-b border-border px-4 py-3.5">
          <SegmentedControl
            label="Status"
            value={status}
            onValueChange={setStatus}
            options={(
              [
                ["pending", "Pending"],
                ["approved", "Approved"],
                ["fulfilled", "Fulfilled"],
                ["declined", "Declined"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => ({
              value,
              label: (
                <>
                  {label}
                  <span className="num text-[11px] text-muted-foreground">
                    {data?.counts[value] ?? ""}
                  </span>
                </>
              ),
            }))}
          />
        </div>
        {isPending ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-11" />
            ))}
          </div>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title={status === "pending" ? "You’re all caught up" : "No requests here"}
          >
            {status === "pending"
              ? "No branch is waiting on you right now."
              : "Requests with this status will show up here."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="max-[860px]:hidden">Requested by</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right max-[860px]:hidden">Units</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => {
                    setOpenId(row.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setOpenId(row.id);
                  }}
                >
                  <TableCell>
                    <span className="code font-medium">{row.requestNo}</span>
                    {!row.synced && (
                      <CloudOffIcon
                        aria-label="Waiting to sync"
                        className="ml-1 inline size-[13px] align-[-2px] text-muted-foreground"
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{row.branchName}</TableCell>
                  <TableCell className="max-[860px]:hidden">
                    <div className="flex items-center gap-2">
                      <Avatar className="size-6 rounded-sm">
                        <AvatarFallback className="text-[10px]">
                          {initialsOf(row.requestedBy)}
                        </AvatarFallback>
                      </Avatar>
                      {row.requestedBy}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-[13px]">{relativeTime(row.createdAt)}</div>
                    <div className="text-[12.5px] text-muted-foreground">
                      {dateTime(row.createdAt)}
                    </div>
                  </TableCell>
                  <TableCell className="num text-right">{row.itemCount}</TableCell>
                  <TableCell className="num text-right max-[860px]:hidden">
                    {int(row.units)}
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={row.priority} />
                  </TableCell>
                  <TableCell>
                    <RequestStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="ml-auto size-[15px] text-muted-foreground"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <RequestSheet
        id={openId}
        onClose={() => {
          setOpenId(null);
        }}
      />
    </Page>
  );
}

interface DraftLine {
  productId: string;
  name: string;
  onHand: number | null;
  qty: string;
}

function RequestsStaff() {
  const user = useCurrentUser();
  const branchId = user.branchId;
  const { data: branches = [] } = useBranches();
  const branchName = branches.find((b) => b.id === branchId)?.name ?? "";
  const { data: settings } = useSettings();
  const threshold = settings?.lowStockThreshold ?? 20;
  const { online } = useSyncStatus();
  const { data: suggestions = [] } = useRestockSuggestions(branchId);
  const { data: mine } = useRequests({ branchId, status: "all" });
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [priority, setPriority] = useState<RequestPriority>("normal");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const create = useDataMutation(
    (client, input: Parameters<typeof client.createRequest>[0]) => client.createRequest(input),
    STOCK_KEYS,
  );

  const defaultQty = String(Math.max(10, threshold * 3));
  const add = (line: { productId: string; name: string; onHand: number | null }) => {
    setError("");
    setDraft((current) =>
      current.some((d) => d.productId === line.productId)
        ? current
        : [...current, { ...line, qty: defaultQty }],
    );
  };
  const units = draft.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
  const shownSuggestions = suggestions
    .filter((s) => !draft.some((d) => d.productId === s.productId))
    .slice(0, 6);

  function send() {
    const items = draft
      .map((line) => ({ productId: line.productId, qty: Number(line.qty) || 0 }))
      .filter((item) => item.qty > 0);
    if (items.length === 0) {
      setError("Add at least one product with a quantity.");
      return;
    }
    create.mutate(
      { id: uuidv7(), branchId, priority, note, items },
      {
        onSuccess: (request) => {
          setDraft([]);
          setNote("");
          setPriority("normal");
          toast.success(`${request.requestNo} sent to central`, {
            description: online
              ? "You’ll see the decision here."
              : "Saved offline. It sends when you reconnect.",
          });
        },
        onError: (err) => {
          setError(errorMessage(err));
        },
      },
    );
  }

  return (
    <Page
      title="Stock requests"
      description={`Ask central for stock when ${branchName} is running low.`}
    >
      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start gap-4 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>New request</CardTitle>
              <CardDescription>
                Search for products or pick from what’s running low.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ProductCombo
              branchId={branchId}
              showStock
              exclude={draft.map((d) => d.productId)}
              placeholder="Search any product to request"
              onPick={(product: ProductLookup) => {
                add({ productId: product.id, name: product.name, onHand: product.onHand });
              }}
            />
            {draft.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 pt-7 pb-3 text-center text-muted-foreground">
                <div className="text-sm font-medium text-foreground">No products yet</div>
                <p className="m-0 text-[13px]">Search above, or add one of the suggestions.</p>
              </div>
            ) : (
              <div className="mt-3 -mr-2 max-h-[300px] overflow-y-auto border-b border-border pr-2">
                {draft.map((line) => (
                  <div
                    key={line.productId}
                    className="grid grid-cols-[minmax(0,1fr)_84px_32px] items-center gap-2.5 border-b border-border py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{line.name}</div>
                      <div className="text-[12.5px] text-muted-foreground">
                        {line.onHand === null ? "Not carried yet" : `${int(line.onHand)} on hand`}
                      </div>
                    </div>
                    <Input
                      className="num h-8 text-right text-[13px]"
                      inputMode="numeric"
                      aria-label={`Quantity of ${line.name}`}
                      value={line.qty}
                      onChange={(event) => {
                        const qty = event.target.value.replace(/\D/g, "");
                        setDraft((current) =>
                          current.map((d) => (d.productId === line.productId ? { ...d, qty } : d)),
                        );
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${line.name}`}
                      onClick={() => {
                        setDraft((current) =>
                          current.filter((d) => d.productId !== line.productId),
                        );
                      }}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-[18px] grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
              <Field label="Priority" htmlFor="request-priority">
                <NativeSelect
                  id="request-priority"
                  value={priority}
                  onValueChange={(value) => {
                    setPriority(value as RequestPriority);
                  }}
                  options={[
                    { value: "low", label: "Low · next scheduled delivery" },
                    { value: "normal", label: "Normal · within 2 days" },
                    { value: "urgent", label: "Urgent · same day" },
                  ]}
                />
              </Field>
              <div />
              <Field
                label="Note for central"
                htmlFor="request-note-staff"
                className="col-span-full"
              >
                <Textarea
                  id="request-note-staff"
                  placeholder="e.g. Paracetamol runs out by Friday, walk-in demand is up."
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                  }}
                />
              </Field>
            </div>
            {error !== "" && (
              <div role="alert" className="mt-1.5 text-[12.5px] text-danger-foreground">
                {error}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <span className="text-[12.5px] text-muted-foreground">
              {draft.length} {draft.length === 1 ? "product" : "products"} · {int(units)} units
            </span>
            <span className="flex-1" />
            <Button disabled={draft.length === 0 || create.isPending} onClick={send}>
              <SendIcon aria-hidden="true" />
              Send request
            </Button>
          </CardFooter>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Running low</CardTitle>
                <CardDescription>
                  Below {threshold} units at {branchName}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-1.5">
              {shownSuggestions.length === 0 ? (
                <div className="py-2.5 text-[12.5px] text-muted-foreground">
                  Nothing is running low right now.
                </div>
              ) : (
                shownSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.productId}
                    className="flex items-center gap-2.5 border-b border-border py-[9px] last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{suggestion.name}</div>
                      <div className="text-[12.5px] text-muted-foreground">
                        {suggestion.onHand <= 0 ? "Out of stock" : `${suggestion.onHand} left`}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        add(suggestion);
                      }}
                    >
                      <PlusIcon aria-hidden="true" />
                      Add
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Your requests</CardTitle>
                <CardDescription>
                  {mine?.counts.all ?? 0} sent from {branchName}
                </CardDescription>
              </div>
            </CardHeader>
            <div className="pt-2 pb-1.5">
              {!mine || mine.rows.length === 0 ? (
                <div className="px-5 py-2 text-[12.5px] text-muted-foreground">
                  No requests sent yet.
                </div>
              ) : (
                mine.rows.slice(0, 8).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setOpenId(row.id);
                    }}
                    className="flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-[13.5px] hover:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="code font-medium">{row.requestNo}</span>
                        {row.priority === "urgent" && <PriorityBadge priority="urgent" />}
                        {!row.synced && (
                          <CloudOffIcon
                            aria-label="Waiting to sync"
                            className="size-[13px] text-muted-foreground"
                          />
                        )}
                      </div>
                      <div className="text-[12.5px] text-muted-foreground">
                        {row.itemCount} products · {relativeTime(row.createdAt)}
                      </div>
                    </div>
                    <RequestStatusBadge status={row.status} />
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
      <RequestSheet
        id={openId}
        onClose={() => {
          setOpenId(null);
        }}
      />
    </Page>
  );
}
