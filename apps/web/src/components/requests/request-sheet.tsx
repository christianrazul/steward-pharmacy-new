"use client";

import { useState } from "react";
import { allocationError, can, suggestedAllocation } from "@steward/domain";
import { DataError, type StockRequestDetail } from "@steward/data";
import { CheckIcon, CircleDashedIcon, TruckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@steward/ui/components/button";
import { Field } from "@steward/ui/components/field";
import { Input } from "@steward/ui/components/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@steward/ui/components/sheet";
import { Skeleton } from "@steward/ui/components/skeleton";
import { Textarea } from "@steward/ui/components/textarea";
import { cn } from "@steward/ui/lib/utils";

import { PriorityBadge, RequestStatusBadge } from "@/components/request-badges";
import { STOCK_KEYS, useDataMutation, useRequest } from "@/data/hooks";
import { errorMessage } from "@/lib/errors";
import { dateTime, int } from "@/lib/format";
import { useCurrentUser } from "@/lib/session";

/** A request's details, allocation and timeline (mockup RequestSheet). Admins act on it; staff read it. */
export function RequestSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isPending } = useRequest(id);
  return (
    <Sheet
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-[min(600px,100vw)]">
        {isPending || !data ? (
          <>
            <SheetHeader>
              <SheetTitle>Loading request</SheetTitle>
              <SheetDescription>One moment.</SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-24" />
            </SheetBody>
          </>
        ) : (
          <RequestBody key={data.id} request={data} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function RequestBody({ request, onClose }: { request: StockRequestDetail; onClose: () => void }) {
  const user = useCurrentUser();
  const canAct = can(user.role, "stock_requests.review");
  const pending = request.status === "pending";
  // Approved requests can be re-allocated when central's stock changed before fulfilment.
  const [editing, setEditing] = useState(false);
  const allocating = canAct && (pending || editing);
  const [allocation, setAllocation] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      request.items.map((item) => [
        item.productId,
        String(item.qtyAllocated ?? suggestedAllocation(item.qtyRequested, item.centralSellable)),
      ]),
    ),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const approve = useDataMutation(
    (client, input: Parameters<typeof client.approveRequest>[1]) =>
      client.approveRequest(request.id, input),
    STOCK_KEYS,
  );
  const decline = useDataMutation(
    (client, input: Parameters<typeof client.declineRequest>[1]) =>
      client.declineRequest(request.id, input),
    STOCK_KEYS,
  );
  const fulfill = useDataMutation(
    (client, _input: undefined) => client.fulfillRequest(request.id),
    STOCK_KEYS,
  );
  const busy = approve.isPending || decline.isPending || fulfill.isPending;

  function onApprove() {
    const lines = request.items.map((item) => ({
      productId: item.productId,
      productName: item.name,
      qtyRequested: item.qtyRequested,
      qtyAllocated: Number(allocation[item.productId] ?? "0") || 0,
      centralSellable: item.centralSellable,
    }));
    const problem = allocationError(lines);
    if (problem) {
      setError(problem);
      return;
    }
    approve.mutate(
      {
        allocations: lines.map((line) => ({
          productId: line.productId,
          qtyAllocated: line.qtyAllocated,
        })),
        note,
      },
      {
        onSuccess: () => {
          const units = lines.reduce((sum, line) => sum + line.qtyAllocated, 0);
          toast.success(
            pending ? `${request.requestNo} approved` : `${request.requestNo} allocation saved`,
            { description: `${int(units)} units allocated to ${request.branchName}` },
          );
          onClose();
        },
        onError: (err) => {
          setError(errorMessage(err));
        },
      },
    );
  }

  function onDecline() {
    decline.mutate(
      { note },
      {
        onSuccess: () => {
          toast.info(`${request.requestNo} declined`, {
            description: `${request.branchName} will see your note.`,
          });
          onClose();
        },
        onError: (err) => {
          setError(errorMessage(err));
        },
      },
    );
  }

  function onFulfill() {
    fulfill.mutate(undefined, {
      onSuccess: () => {
        toast.success(`${request.requestNo} fulfilled`, {
          description: `Stock moved from central to ${request.branchName}, oldest batches first.`,
        });
        onClose();
      },
      onError: (err) => {
        setError(errorMessage(err));
        // Central no longer has enough: let the admin lower the allocation right here.
        if (err instanceof DataError && err.code === "conflict") setEditing(true);
      },
    });
  }

  // The latest decision: a changed allocation adds another "approved" event.
  const decision = request.events.findLast(
    (event) => event.kind === "approved" || event.kind === "declined",
  );
  const fulfilled = request.events.find((event) => event.kind === "fulfilled");
  const created = request.events.find((event) => event.kind === "created");
  const steps = [
    {
      label: `Sent by ${request.requestedBy}`,
      at: created?.at ?? request.createdAt,
      done: true,
      declined: false,
    },
    decision?.kind === "declined"
      ? { label: `Declined by ${decision.actorName}`, at: decision.at, done: true, declined: true }
      : {
          label: decision ? `Approved by ${decision.actorName}` : "Waiting for approval",
          at: decision?.at ?? null,
          done: decision !== undefined,
          declined: false,
        },
    ...(decision?.kind === "declined"
      ? []
      : [
          {
            label: fulfilled ? `Delivered to ${request.branchName}` : "Delivery to branch",
            at: fulfilled?.at ?? null,
            done: fulfilled !== undefined,
            declined: false,
          },
        ]),
  ];
  const units = request.items.reduce((sum, item) => sum + item.qtyRequested, 0);

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2 pr-9">
          <SheetTitle className="code text-lg">{request.requestNo}</SheetTitle>
          <RequestStatusBadge status={request.status} />
        </div>
        <SheetDescription>
          From {request.branchName} · {dateTime(request.createdAt)}
        </SheetDescription>
      </SheetHeader>
      <SheetBody>
        <div className="mb-5 grid grid-cols-3 gap-3 max-[860px]:grid-cols-2">
          <Meta label="Priority">
            <PriorityBadge priority={request.priority} />
          </Meta>
          <Meta label="Products">
            <span className="num">{request.itemCount}</span>
          </Meta>
          <Meta label="Units asked for">
            <span className="num">{int(units)}</span>
          </Meta>
        </div>
        {request.note !== "" && <Note who={`${request.requestedBy} wrote`}>{request.note}</Note>}
        <div className="grid grid-cols-[minmax(0,1fr)_80px_90px_96px] items-center gap-3 pb-2 text-[12.5px] font-medium text-muted-foreground">
          <span>Product</span>
          <span className="text-right">Asked</span>
          <span className="text-right">At central</span>
          <span className="text-right">{allocating ? "Send" : "Allocated"}</span>
        </div>
        {request.items.map((item) => {
          const value = Number(allocation[item.productId] ?? "0") || 0;
          return (
            <div
              key={item.productId}
              className="grid grid-cols-[minmax(0,1fr)_80px_90px_96px] items-center gap-3 border-b border-border py-3 text-[13.5px]"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{item.name}</div>
                <div className="truncate text-[12.5px] text-muted-foreground">
                  {item.genericName} · <span className="code">{item.sku}</span>
                </div>
              </div>
              <span className="num text-right">{int(item.qtyRequested)}</span>
              <span
                className={cn(
                  "num text-right",
                  item.centralSellable < item.qtyRequested
                    ? "text-warning-foreground"
                    : "text-muted-foreground",
                )}
              >
                {int(item.centralSellable)}
              </span>
              {allocating ? (
                <Input
                  className="num h-8 text-right text-[13px]"
                  inputMode="numeric"
                  aria-label={`Units to send of ${item.name}`}
                  aria-invalid={value > item.centralSellable}
                  value={allocation[item.productId] ?? ""}
                  onChange={(event) => {
                    setError("");
                    setAllocation((current) => ({
                      ...current,
                      [item.productId]: event.target.value.replace(/\D/g, ""),
                    }));
                  }}
                />
              ) : (
                <span className="num text-right font-medium">
                  {item.qtyAllocated === null ? "–" : int(item.qtyAllocated)}
                </span>
              )}
            </div>
          );
        })}
        {error !== "" && (
          <div role="alert" className="mt-2.5 text-[12.5px] text-danger-foreground">
            {error}
          </div>
        )}
        {allocating ? (
          <Field
            label="Note to the branch"
            htmlFor="request-note"
            hint="Optional. Shown to the cashier with your decision."
            className="mt-5"
          >
            <Textarea
              id="request-note"
              placeholder="e.g. Two boxes short. The balance follows on Friday’s delivery."
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          </Field>
        ) : (
          decision &&
          decision.note !== "" && (
            <Note who={`${decision.actorName} replied`} className="mt-[18px]">
              {decision.note}
            </Note>
          )
        )}
        <div className="mt-[22px]">
          <div className="mb-1.5 text-[13px] font-medium">Timeline</div>
          <ol className="mt-[22px] flex flex-col">
            {steps.map((step, index) => (
              <li
                key={index}
                className="relative grid grid-cols-[20px_1fr] gap-2.5 pb-3.5 before:absolute before:top-[18px] before:bottom-0 before:left-[9px] before:w-px before:bg-border last:before:hidden"
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground",
                    step.done && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {step.declined ? (
                    <XIcon aria-hidden="true" className="size-[11px]" strokeWidth={2.5} />
                  ) : step.done ? (
                    <CheckIcon aria-hidden="true" className="size-[11px]" strokeWidth={2.5} />
                  ) : (
                    <CircleDashedIcon
                      aria-hidden="true"
                      className="size-[11px]"
                      strokeWidth={2.5}
                    />
                  )}
                </span>
                <div>
                  <b className="block text-[13.5px] font-medium">{step.label}</b>
                  <span className="text-[12.5px] text-muted-foreground">
                    {step.at ? dateTime(step.at) : "Not yet"}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </SheetBody>
      <SheetFooter>
        {canAct && pending ? (
          <>
            <Button variant="danger-outline" disabled={busy} onClick={onDecline}>
              Decline
            </Button>
            <Button disabled={busy} onClick={onApprove}>
              <CheckIcon aria-hidden="true" />
              Approve allocation
            </Button>
          </>
        ) : allocating ? (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={onApprove}>
              <CheckIcon aria-hidden="true" />
              Save allocation
            </Button>
          </>
        ) : canAct && request.status === "approved" ? (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditing(true);
              }}
            >
              Change allocation
            </Button>
            <Button disabled={busy} onClick={onFulfill}>
              <TruckIcon aria-hidden="true" />
              Mark fulfilled
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <span className="mb-[3px] block text-xs text-muted-foreground">{label}</span>
      <b className="text-[13.5px] font-medium">{children}</b>
    </div>
  );
}

function Note({
  who,
  children,
  className,
}: {
  who: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mb-5 rounded-lg bg-muted px-3.5 py-3 text-[13.5px] leading-[1.55]", className)}
    >
      <div className="mb-1 text-xs text-muted-foreground">{who}</div>
      {children}
    </div>
  );
}
