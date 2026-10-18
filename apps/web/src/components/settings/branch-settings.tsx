"use client";

import { useState } from "react";
import {
  DAY_LABELS,
  branchSchema,
  formatHours,
  formatOpenDays,
  formatPhPhone,
  isBranchOpen,
} from "@steward/domain";
import type { Branch } from "@steward/data";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Badge } from "@steward/ui/components/badge";
import { Button } from "@steward/ui/components/button";
import { Card } from "@steward/ui/components/card";
import { Chip } from "@steward/ui/components/chip";
import {
  Dialog,
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
import { Field, FormSection } from "@steward/ui/components/field";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@steward/ui/components/table";

import { keys, useBranches, useDataMutation } from "@/data/hooks";
import { applyServerErrors, validateWith } from "@/lib/forms";
import { errorMessage } from "@/lib/errors";
import { int } from "@/lib/format";
import { SettingsToolbar } from "./settings-row";

interface FormValues {
  name: string;
  code: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  opensAt: string;
  closesAt: string;
  openDays: number[];
}

const BRANCH_KEYS = [keys.branches, ["inventory"], ["dashboard"], ["staff"], ["requests"]];

export function BranchSettings() {
  const { data: branches, isPending } = useBranches();
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [removing, setRemoving] = useState<Branch | null>(null);
  const remove = useDataMutation((client, id: string) => client.deleteBranch(id), BRANCH_KEYS);

  return (
    <div>
      <SettingsToolbar
        text="Branch details print on every receipt from that branch."
        action={
          <Button
            onClick={() => {
              setEditing("new");
            }}
          >
            <PlusIcon aria-hidden="true" />
            Add branch
          </Button>
        }
      />
      <Card>
        {isPending || !branches ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-12" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="text-right max-[860px]:hidden">Products</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch) => {
                const open = isBranchOpen(branch);
                return (
                  <TableRow key={branch.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-[10.5px] font-semibold">
                          {branch.code}
                        </span>
                        <div>
                          <div className="font-medium">{branch.name}</div>
                          <div className="text-[12.5px] text-muted-foreground">
                            {branch.isCentral ? "Central warehouse" : "Retail branch"} ·{" "}
                            {formatPhPhone(branch.phone)}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-[13px]">{branch.address}</div>
                      <div className="text-[12.5px] text-muted-foreground">{branch.city}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-[13px]">
                        {formatHours(branch)}
                        <Badge variant={open ? "success" : "secondary"} dot>
                          {open ? "Open" : "Closed"}
                        </Badge>
                      </div>
                      <div className="text-[12.5px] text-muted-foreground">
                        {formatOpenDays(branch.openDays)}
                      </div>
                    </TableCell>
                    <TableCell className="num text-right max-[860px]:hidden">
                      {int(branch.productCount)}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {branch.staffCount > 0
                        ? `${branch.staffCount} ${branch.staffCount === 1 ? "person" : "people"}`
                        : "No staff yet"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${branch.name}`}
                          >
                            <MoreHorizontalIcon aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[190px] min-w-[190px]">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(branch);
                            }}
                          >
                            <PencilIcon aria-hidden="true" />
                            Edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={branch.isCentral}
                            className="text-danger-foreground focus:text-danger-foreground"
                            onSelect={() => {
                              setRemoving(branch);
                            }}
                          >
                            <Trash2Icon aria-hidden="true" />
                            {branch.isCentral ? "Central can’t be removed" : "Remove branch"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      <BranchSheet
        branch={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              Its staff move to central. Past sales and stock records stay for reports.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-5">
            <Button
              variant="outline"
              onClick={() => {
                setRemoving(null);
              }}
            >
              Keep branch
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (!removing) return;
                remove.mutate(removing.id, {
                  onSuccess: () => {
                    toast.info(`${removing.name} removed`);
                    setRemoving(null);
                  },
                  onError: (error) => {
                    toast.error(errorMessage(error));
                  },
                });
              }}
            >
              Remove branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function defaults(branch: Branch | "new" | null): FormValues {
  if (branch === null || branch === "new") {
    return {
      name: "",
      code: "",
      phone: "",
      email: "",
      address: "",
      city: "Davao City",
      opensAt: "08:00",
      closesAt: "20:00",
      openDays: [1, 2, 3, 4, 5, 6],
    };
  }
  return {
    name: branch.name,
    code: branch.code,
    phone: formatPhPhone(branch.phone),
    email: branch.email ?? "",
    address: branch.address,
    city: branch.city,
    opensAt: branch.opensAt,
    closesAt: branch.closesAt,
    openDays: branch.openDays,
  };
}

function BranchSheet({ branch, onClose }: { branch: Branch | "new" | null; onClose: () => void }) {
  const isNew = branch === "new";
  const form = useForm<FormValues>({ values: defaults(branch) });
  const create = useDataMutation(
    (client, input: Parameters<typeof client.createBranch>[0]) => client.createBranch(input),
    BRANCH_KEYS,
  );
  const update = useDataMutation(
    (client, input: { id: string; values: Parameters<typeof client.updateBranch>[1] }) =>
      client.updateBranch(input.id, input.values),
    BRANCH_KEYS,
  );
  const { errors } = form.formState;
  const days = useWatch({ control: form.control, name: "openDays" });
  const hoursPreview = useWatch({ control: form.control, name: ["opensAt", "closesAt"] });

  const submit = form.handleSubmit((values) => {
    const input = validateWith(form, branchSchema, values);
    if (!input) return;
    const callbacks = {
      onSuccess: (saved: Branch) => {
        toast.success(isNew ? `${saved.name} added` : `${saved.name} updated`, {
          ...(isNew
            ? { description: "Assign staff under Staff accounts, then stock it with Add stock." }
            : {}),
        });
        onClose();
      },
      onError: (error: unknown) => {
        const message = applyServerErrors(form, error);
        if (message) toast.error(message);
      },
    };
    if (isNew) create.mutate(input, callbacks);
    else if (branch) update.mutate({ id: branch.id, values: input }, callbacks);
  });

  return (
    <Sheet
      open={branch !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent>
        <form
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <SheetHeader>
            <SheetTitle>{isNew ? "Add branch" : "Edit branch"}</SheetTitle>
            <SheetDescription>
              {isNew ? "Set up a new location. You can change any of this later." : branch?.name}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FormSection>Branch</FormSection>
            <div className="grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
              <Field
                label="Branch name"
                htmlFor="branch-name"
                error={errors.name?.message}
                className="col-span-full"
              >
                <Input
                  id="branch-name"
                  autoFocus
                  placeholder="e.g. Lanang"
                  aria-invalid={errors.name !== undefined}
                  {...form.register("name")}
                />
              </Field>
              <Field
                label="Branch code"
                htmlFor="branch-code"
                error={errors.code?.message}
                hint="Short code for reports and transfers"
              >
                <Input
                  id="branch-code"
                  className="code uppercase"
                  placeholder="e.g. LAN"
                  maxLength={4}
                  aria-invalid={errors.code !== undefined}
                  {...form.register("code")}
                />
              </Field>
              <Field label="Contact number" htmlFor="branch-phone" error={errors.phone?.message}>
                <Input
                  id="branch-phone"
                  inputMode="tel"
                  placeholder="0917 123 4567"
                  aria-invalid={errors.phone !== undefined}
                  {...form.register("phone")}
                />
              </Field>
              <Field
                label="Email"
                htmlFor="branch-email"
                hint="Optional"
                error={errors.email?.message}
                className="col-span-full"
              >
                <Input
                  id="branch-email"
                  type="email"
                  placeholder="branch@stewardpharmacy.ph"
                  aria-invalid={errors.email !== undefined}
                  {...form.register("email")}
                />
              </Field>
            </div>
            <FormSection>Location</FormSection>
            <div className="grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
              <Field
                label="Street and barangay"
                htmlFor="branch-address"
                error={errors.address?.message}
                className="col-span-full"
              >
                <Input
                  id="branch-address"
                  placeholder="e.g. J.P. Laurel Ave., Lanang"
                  aria-invalid={errors.address !== undefined}
                  {...form.register("address")}
                />
              </Field>
              <Field label="City" htmlFor="branch-city" error={errors.city?.message}>
                <Input
                  id="branch-city"
                  aria-invalid={errors.city !== undefined}
                  {...form.register("city")}
                />
              </Field>
            </div>
            <FormSection>Store hours</FormSection>
            <div className="grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
              <Field label="Opens" htmlFor="branch-opens">
                <Input
                  id="branch-opens"
                  type="time"
                  aria-invalid={errors.closesAt !== undefined}
                  {...form.register("opensAt")}
                />
              </Field>
              <Field label="Closes" htmlFor="branch-closes">
                <Input
                  id="branch-closes"
                  type="time"
                  aria-invalid={errors.closesAt !== undefined}
                  {...form.register("closesAt")}
                />
              </Field>
              {errors.closesAt?.message && (
                <div
                  role="alert"
                  className="col-span-full -mt-1.5 text-[12.5px] text-danger-foreground"
                >
                  {errors.closesAt.message}
                </div>
              )}
              <div className="col-span-full">
                <div className="mb-1.5 text-[13px] font-medium">Open on</div>
                <Controller
                  control={form.control}
                  name="openDays"
                  render={({ field }) => (
                    <div role="group" aria-label="Days open" className="flex flex-wrap gap-1.5">
                      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                        <Chip
                          key={day}
                          className="min-w-12"
                          pressed={field.value.includes(day)}
                          onClick={() => {
                            form.clearErrors("openDays");
                            field.onChange(
                              field.value.includes(day)
                                ? field.value.filter((d) => d !== day)
                                : [...field.value, day].sort((a, b) => a - b),
                            );
                          }}
                        >
                          {DAY_LABELS[day]}
                        </Chip>
                      ))}
                    </div>
                  )}
                />
                {errors.openDays?.message ? (
                  <div role="alert" className="mt-1.5 text-[12.5px] text-danger-foreground">
                    {errors.openDays.message}
                  </div>
                ) : (
                  <div className="mt-1.5 text-[12.5px] text-muted-foreground">
                    {formatOpenDays(days)}
                    {hoursPreview[0] && hoursPreview[1] && hoursPreview[1] > hoursPreview[0]
                      ? `, ${formatHours({ opensAt: hoursPreview[0], closesAt: hoursPreview[1] })}`
                      : ""}
                  </div>
                )}
              </div>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {isNew ? "Add branch" : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
