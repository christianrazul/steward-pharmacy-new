"use client";

import { useState } from "react";
import { deviceCreateSchema } from "@steward/domain";
import type { Device, DeviceEnrollment } from "@steward/data";
import {
  KeyRoundIcon,
  MonitorIcon,
  MoreHorizontalIcon,
  PlusIcon,
  ShieldOffIcon,
} from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Badge } from "@steward/ui/components/badge";
import { Button } from "@steward/ui/components/button";
import { Card } from "@steward/ui/components/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@steward/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@steward/ui/components/dropdown-menu";
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
import { cn } from "@steward/ui/lib/utils";

import { useBranches, useDataMutation, useDevices } from "@/data/hooks";
import { errorMessage } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/format";
import { applyServerErrors, validateWith } from "@/lib/forms";
import { SettingsToolbar } from "./settings-row";

interface FormValues {
  branchId: string;
  label: string;
  receiptSeries: string;
  printWidth: "58" | "80";
}

const DEVICE_KEYS = [["devices"]];

function deviceStatus(device: Device) {
  if (device.revokedAt !== null) return <Badge variant="danger">Revoked</Badge>;
  if (!device.enrolled) return <Badge variant="warning">Waiting to enroll</Badge>;
  return (
    <Badge variant="success" dot>
      Enrolled
    </Badge>
  );
}

/** Desktop counters. Each one enrolls once with a short-lived code, then works offline. */
export function DeviceSettings() {
  const { data: devices, isPending } = useDevices();
  const [adding, setAdding] = useState(false);
  const [enrollment, setEnrollment] = useState<DeviceEnrollment | null>(null);
  const [revoking, setRevoking] = useState<Device | null>(null);
  const renew = useDataMutation(
    (client, id: string) => client.renewEnrollmentCode(id),
    DEVICE_KEYS,
  );
  const revoke = useDataMutation((client, id: string) => client.revokeDevice(id), DEVICE_KEYS);

  return (
    <div>
      <SettingsToolbar
        text="Each counter PC runs the desktop app and keeps selling when the internet drops."
        action={
          <Button
            onClick={() => {
              setAdding(true);
            }}
          >
            <PlusIcon aria-hidden="true" />
            Add device
          </Button>
        }
      />
      <Card>
        {isPending || !devices ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-12" />
            ))}
          </div>
        ) : devices.length === 0 ? (
          <EmptyState icon={MonitorIcon} title="No devices yet">
            Add a device, then enter its code in the desktop app on that counter.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="max-[860px]:hidden">Receipts</TableHead>
                <TableHead className="max-[860px]:hidden">Last seen</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => (
                <TableRow key={device.id} className={cn(device.revokedAt !== null && "opacity-60")}>
                  <TableCell>
                    <div className="font-medium">{device.label}</div>
                    <div className="text-[12.5px] text-muted-foreground">
                      {device.printWidth} mm printer
                    </div>
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">
                    {device.branchName}
                  </TableCell>
                  <TableCell className="code text-[13px] max-[860px]:hidden">
                    Series {device.receiptSeries}
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground max-[860px]:hidden">
                    {device.lastSeenAt === null ? (
                      "Never"
                    ) : (
                      <span title={dateTime(device.lastSeenAt)}>
                        {relativeTime(device.lastSeenAt)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{deviceStatus(device)}</TableCell>
                  <TableCell className="text-right">
                    {device.revokedAt === null && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${device.label}`}
                          >
                            <MoreHorizontalIcon aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[220px] min-w-[220px]">
                          <DropdownMenuItem
                            onSelect={() => {
                              renew.mutate(device.id, {
                                onSuccess: setEnrollment,
                                onError: (error) => {
                                  toast.error(errorMessage(error));
                                },
                              });
                            }}
                          >
                            <KeyRoundIcon aria-hidden="true" />
                            New enrollment code
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => {
                              setRevoking(device);
                            }}
                          >
                            <ShieldOffIcon aria-hidden="true" />
                            Revoke device
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <AddDeviceDialog
        open={adding}
        onClose={() => {
          setAdding(false);
        }}
        onCreated={(created) => {
          setAdding(false);
          setEnrollment(created);
        }}
      />

      <Dialog
        open={enrollment !== null}
        onOpenChange={(open) => {
          if (!open) setEnrollment(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll {enrollment?.device.label}</DialogTitle>
            <DialogDescription>
              Open the desktop app on that counter and enter this code. It works once and expires{" "}
              {enrollment ? `at ${dateTime(enrollment.expiresAt)}` : "soon"}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div
              aria-label="Enrollment code"
              className="code rounded-lg bg-muted py-5 text-center text-[28px] font-semibold tracking-[0.3em]"
            >
              {enrollment?.code}
            </div>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              The code isn’t shown again. If it expires, make a new one from the device’s menu.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => {
                setEnrollment(null);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revoking?.label}?</DialogTitle>
            <DialogDescription>
              It locks on its next connection and can’t sell anymore. Sales it already saved still
              sync. To use that PC again, add it as a new device.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-5">
            <Button
              variant="outline"
              onClick={() => {
                setRevoking(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => {
                if (!revoking) return;
                revoke.mutate(revoking.id, {
                  onSuccess: (saved) => {
                    toast.info(`${saved.label} revoked`);
                    setRevoking(null);
                  },
                  onError: (error) => {
                    toast.error(errorMessage(error));
                  },
                });
              }}
            >
              Revoke device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddDeviceDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (enrollment: DeviceEnrollment) => void;
}) {
  const { data: branches = [] } = useBranches();
  const form = useForm<FormValues>({
    defaultValues: { branchId: "", label: "", receiptSeries: "", printWidth: "58" },
  });
  const create = useDataMutation(
    (client, input: Parameters<typeof client.createDevice>[0]) => client.createDevice(input),
    DEVICE_KEYS,
  );
  const { errors } = form.formState;
  // Until someone picks a branch, the first one (central) is selected.
  const branchId = useWatch({ control: form.control, name: "branchId" }) || (branches[0]?.id ?? "");
  const printWidth = useWatch({ control: form.control, name: "printWidth" });

  const submit = form.handleSubmit((values) => {
    const input = validateWith(form, deviceCreateSchema, {
      ...values,
      branchId,
      printWidth: Number(values.printWidth),
    });
    if (!input) return;
    create.mutate(input, {
      onSuccess: (created) => {
        form.reset();
        onCreated(created);
      },
      onError: (error) => {
        const message = applyServerErrors(form, error);
        if (message) toast.error(message);
      },
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="w-[min(480px,calc(100vw-32px))]">
        <form
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Add device</DialogTitle>
            <DialogDescription>
              You’ll get a one-time code to enter in the desktop app on that counter.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Name" htmlFor="device-label" error={errors.label?.message}>
              <Input
                id="device-label"
                autoFocus
                placeholder="e.g. Counter 1"
                aria-invalid={errors.label !== undefined}
                {...form.register("label")}
              />
            </Field>
            <Field label="Branch" htmlFor="device-branch" error={errors.branchId?.message}>
              <NativeSelect
                id="device-branch"
                value={branchId}
                onValueChange={(value) => {
                  form.setValue("branchId", value, { shouldDirty: true });
                }}
                options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3.5">
              <Field
                label="Receipt series"
                htmlFor="device-series"
                hint="Two digits, unique per branch"
                error={errors.receiptSeries?.message}
              >
                <Input
                  id="device-series"
                  className="num"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="01"
                  aria-invalid={errors.receiptSeries !== undefined}
                  {...form.register("receiptSeries")}
                />
              </Field>
              <Field label="Receipt printer" htmlFor="device-width">
                <NativeSelect
                  id="device-width"
                  value={printWidth}
                  onValueChange={(value) => {
                    form.setValue("printWidth", value === "80" ? "80" : "58");
                  }}
                  options={[
                    { value: "58", label: "58 mm" },
                    { value: "80", label: "80 mm" },
                  ]}
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Add device
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
