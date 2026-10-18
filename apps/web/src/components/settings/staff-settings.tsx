"use client";

import { useState } from "react";
import {
  POSITION_LABELS,
  STAFF_POSITIONS,
  formatPhPhone,
  staffCreateSchema,
  staffUpdateSchema,
  type StaffPosition,
} from "@steward/domain";
import type { StaffAccount } from "@steward/data";
import {
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LockIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Avatar, AvatarFallback, initialsOf } from "@steward/ui/components/avatar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@steward/ui/components/dropdown-menu";
import { Field, FormSection } from "@steward/ui/components/field";
import { Input } from "@steward/ui/components/input";
import { InputGroup } from "@steward/ui/components/input-group";
import { NativeSelect } from "@steward/ui/components/native-select";
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
import { Switch } from "@steward/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@steward/ui/components/table";
import { Textarea } from "@steward/ui/components/textarea";
import { cn } from "@steward/ui/lib/utils";

import { keys, useBranches, useDataMutation, useStaff } from "@/data/hooks";
import { errorMessage } from "@/lib/errors";
import { applyServerErrors, validateWith } from "@/lib/forms";
import { useCurrentUser } from "@/lib/session";
import { SettingsToolbar } from "./settings-row";

interface FormValues {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  position: StaffPosition;
  branchId: string;
  prcLicenseNo: string;
  username: string;
  password: string;
  passwordConfirm: string;
  active: boolean;
}

const STAFF_KEYS = [keys.staff, keys.branches];

/** Eight characters without look-alikes (no 0/O, 1/l/I). */
function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet.charAt(value % alphabet.length)).join("");
}

export function StaffSettings() {
  const me = useCurrentUser();
  const { data: staff, isPending } = useStaff();
  const [editing, setEditing] = useState<StaffAccount | "new" | null>(null);
  const [deleting, setDeleting] = useState<StaffAccount | null>(null);
  const setActive = useDataMutation(
    (client, input: { id: string; active: boolean }) =>
      client.setStaffActive(input.id, input.active),
    STAFF_KEYS,
  );
  const remove = useDataMutation((client, id: string) => client.deleteStaff(id), STAFF_KEYS);

  return (
    <div>
      <SettingsToolbar
        text="Staff can only sell from and request stock for their assigned branch."
        action={
          <Button
            onClick={() => {
              setEditing("new");
            }}
          >
            <PlusIcon aria-hidden="true" />
            Add staff
          </Button>
        }
      />
      <Card>
        {isPending || !staff ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-12" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="max-[860px]:hidden">Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((account) => (
                <TableRow key={account.id} className={cn(!account.active && "opacity-60")}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{initialsOf(account.fullName)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {account.fullName}
                          {account.id === me.id && (
                            <span className="font-normal text-muted-foreground"> (you)</span>
                          )}
                        </div>
                        <div className="code text-[12.5px] text-muted-foreground">
                          {account.username}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {account.role === "admin" ? (
                      <Badge variant="solid">
                        <ShieldCheckIcon aria-hidden="true" />
                        Super admin
                      </Badge>
                    ) : (
                      <>
                        <div className="text-[13px]">
                          {account.position ? POSITION_LABELS[account.position] : "Staff"}
                        </div>
                        {account.prcLicenseNo && (
                          <div className="text-[12.5px] text-muted-foreground">
                            PRC {account.prcLicenseNo}
                          </div>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">
                    {account.role === "admin" ? "All branches" : account.branchName}
                  </TableCell>
                  <TableCell className="max-[860px]:hidden">
                    <div className="num text-[13px]">
                      {account.phone ? (
                        formatPhPhone(account.phone)
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </div>
                    {account.email && (
                      <div className="max-w-[200px] truncate text-[12.5px] text-muted-foreground">
                        {account.email}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {account.active ? (
                      <Badge variant="success" dot>
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" dot>
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${account.fullName}`}
                        >
                          <MoreHorizontalIcon aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[200px] min-w-[200px]">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(account);
                          }}
                        >
                          <PencilIcon aria-hidden="true" />
                          Edit details
                        </DropdownMenuItem>
                        {account.role !== "admin" && (
                          <>
                            <DropdownMenuItem
                              onSelect={() => {
                                setActive.mutate(
                                  { id: account.id, active: !account.active },
                                  {
                                    onSuccess: (saved) => {
                                      if (saved.active)
                                        toast.success(`${saved.fullName} is active`, {
                                          description: "They can sign in again.",
                                        });
                                      else
                                        toast.info(`${saved.fullName} is inactive`, {
                                          description: "They can no longer sign in.",
                                        });
                                    },
                                    onError: (error) => {
                                      toast.error(errorMessage(error));
                                    },
                                  },
                                );
                              }}
                            >
                              {account.active ? (
                                <LockIcon aria-hidden="true" />
                              ) : (
                                <UserIcon aria-hidden="true" />
                              )}
                              {account.active ? "Mark as inactive" : "Mark as active"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-danger-foreground focus:text-danger-foreground"
                              onSelect={() => {
                                setDeleting(account);
                              }}
                            >
                              <Trash2Icon aria-hidden="true" />
                              Delete account
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <StaffSheet
        account={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.fullName}’s account?</DialogTitle>
            <DialogDescription>
              They won’t be able to sign in. Their past sales stay in activity. To keep the account
              for later, mark it inactive instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-5">
            <Button
              variant="outline"
              onClick={() => {
                setDeleting(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (!deleting) return;
                remove.mutate(deleting.id, {
                  onSuccess: () => {
                    toast.info("Account deleted");
                    setDeleting(null);
                  },
                  onError: (error) => {
                    toast.error(errorMessage(error));
                  },
                });
              }}
            >
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StaffSheet({
  account,
  onClose,
}: {
  account: StaffAccount | "new" | null;
  onClose: () => void;
}) {
  const isNew = account === "new";
  const isAdminRow = account !== null && account !== "new" && account.role === "admin";
  const { data: branches = [] } = useBranches();
  const [showPassword, setShowPassword] = useState(false);
  const defaultBranch = branches.find((branch) => !branch.isCentral)?.id ?? branches[0]?.id ?? "";
  const values: FormValues =
    account === null || account === "new"
      ? {
          fullName: "",
          phone: "",
          email: "",
          address: "",
          position: "cashier",
          branchId: defaultBranch,
          prcLicenseNo: "",
          username: "",
          password: "",
          passwordConfirm: "",
          active: true,
        }
      : {
          fullName: account.fullName,
          phone: account.phone ? formatPhPhone(account.phone) : "",
          email: account.email ?? "",
          address: account.address ?? "",
          position: account.position ?? "cashier",
          branchId: account.branchId,
          prcLicenseNo: account.prcLicenseNo ?? "",
          username: account.username,
          password: "",
          passwordConfirm: "",
          active: account.active,
        };
  const form = useForm<FormValues>({ values });
  const create = useDataMutation(
    (client, input: Parameters<typeof client.createStaff>[0]) => client.createStaff(input),
    STAFF_KEYS,
  );
  const update = useDataMutation(
    (client, input: { id: string; values: Parameters<typeof client.updateStaff>[1] }) =>
      client.updateStaff(input.id, input.values),
    STAFF_KEYS,
  );
  const { errors } = form.formState;
  const position = useWatch({ control: form.control, name: "position" });
  const branchId = useWatch({ control: form.control, name: "branchId" });

  const submit = form.handleSubmit((formValues) => {
    const onError = (error: unknown) => {
      const message = applyServerErrors(form, error);
      if (message) toast.error(message);
    };
    if (isNew) {
      const input = validateWith(form, staffCreateSchema, formValues);
      if (!input) return;
      create.mutate(input, {
        onSuccess: (saved) => {
          toast.success("Account created", {
            description: `${saved.fullName} can sign in as ${saved.username} at ${saved.branchName}.`,
          });
          onClose();
        },
        onError,
      });
      return;
    }
    if (!account) return;
    // Admin rows keep their role and branch; the data layer ignores those fields for them.
    const input = validateWith(form, staffUpdateSchema, formValues);
    if (!input) return;
    update.mutate(
      { id: account.id, values: input },
      {
        onSuccess: () => {
          toast.success(
            "Account updated",
            formValues.password !== ""
              ? { description: "Password was reset. Share the new one in person." }
              : {},
          );
          onClose();
        },
        onError,
      },
    );
  });

  return (
    <Sheet
      open={account !== null}
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
            <SheetTitle>{isNew ? "Add staff" : "Edit staff"}</SheetTitle>
            <SheetDescription>
              {isNew
                ? "Share the username and temporary password with them in person."
                : values.fullName}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FormSection>Personal details</FormSection>
            <div className="grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
              <Field
                label="Full name"
                htmlFor="staff-name"
                error={errors.fullName?.message}
                className="col-span-full"
              >
                <Input
                  id="staff-name"
                  autoFocus
                  placeholder="e.g. Jo Santos"
                  aria-invalid={errors.fullName !== undefined}
                  {...form.register("fullName")}
                />
              </Field>
              <Field label="Contact number" htmlFor="staff-phone" error={errors.phone?.message}>
                <Input
                  id="staff-phone"
                  inputMode="tel"
                  placeholder="0917 123 4567"
                  aria-invalid={errors.phone !== undefined}
                  {...form.register("phone")}
                />
              </Field>
              <Field
                label="Email"
                htmlFor="staff-email"
                hint="Optional"
                error={errors.email?.message}
              >
                <Input
                  id="staff-email"
                  type="email"
                  placeholder="name@email.com"
                  aria-invalid={errors.email !== undefined}
                  {...form.register("email")}
                />
              </Field>
              <Field
                label="Home address"
                htmlFor="staff-address"
                hint="Optional"
                className="col-span-full"
              >
                <Textarea
                  id="staff-address"
                  className="min-h-[60px]"
                  placeholder="Street, barangay, city"
                  {...form.register("address")}
                />
              </Field>
            </div>
            <FormSection>Work</FormSection>
            {isAdminRow ? (
              <p className="text-[12.5px] text-muted-foreground">
                Super admins can work at every branch.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
                <Field label="Position" htmlFor="staff-position">
                  <NativeSelect
                    id="staff-position"
                    value={position}
                    onValueChange={(value) => {
                      form.setValue("position", value as StaffPosition, { shouldDirty: true });
                    }}
                    options={STAFF_POSITIONS.map((value) => ({
                      value,
                      label: POSITION_LABELS[value],
                    }))}
                  />
                </Field>
                <Field label="Assigned branch" htmlFor="staff-branch">
                  <NativeSelect
                    id="staff-branch"
                    value={branchId}
                    onValueChange={(value) => {
                      form.setValue("branchId", value, { shouldDirty: true });
                    }}
                    options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                  />
                </Field>
                {position === "pharmacist" && (
                  <Field
                    label="PRC license number"
                    htmlFor="staff-prc"
                    error={errors.prcLicenseNo?.message}
                    className="col-span-full"
                  >
                    <Input
                      id="staff-prc"
                      className="code"
                      inputMode="numeric"
                      placeholder="e.g. 0012345"
                      aria-invalid={errors.prcLicenseNo !== undefined}
                      {...form.register("prcLicenseNo")}
                    />
                  </Field>
                )}
              </div>
            )}
            <FormSection>Sign-in</FormSection>
            <div className="grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
              <Field
                label="Username"
                htmlFor="staff-username"
                error={errors.username?.message}
                hint={isNew ? "Lowercase, no spaces" : "Usernames can’t be changed"}
                className="col-span-full"
              >
                <Input
                  id="staff-username"
                  className="code"
                  disabled={!isNew}
                  placeholder="e.g. jsantos"
                  aria-invalid={errors.username !== undefined}
                  {...form.register("username")}
                />
              </Field>
              <Field
                label={isNew ? "Temporary password" : "New password"}
                htmlFor="staff-password"
                error={errors.password?.message}
                hint={isNew ? "At least 6 characters" : "Leave blank to keep the current one"}
              >
                <InputGroup
                  end={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => {
                        setShowPassword((value) => !value);
                      }}
                    >
                      {showPassword ? (
                        <EyeOffIcon aria-hidden="true" />
                      ) : (
                        <EyeIcon aria-hidden="true" />
                      )}
                    </Button>
                  }
                >
                  <Input
                    id="staff-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    aria-invalid={errors.password !== undefined}
                    {...form.register("password")}
                  />
                </InputGroup>
              </Field>
              <Field
                label="Confirm password"
                htmlFor="staff-password2"
                error={errors.passwordConfirm?.message}
              >
                <Input
                  id="staff-password2"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  aria-invalid={errors.passwordConfirm !== undefined}
                  {...form.register("passwordConfirm")}
                />
              </Field>
              <div className="col-span-full">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const password = generatePassword();
                    form.setValue("password", password, { shouldDirty: true });
                    form.setValue("passwordConfirm", password, { shouldDirty: true });
                    form.clearErrors(["password", "passwordConfirm"]);
                    setShowPassword(true);
                  }}
                >
                  <KeyRoundIcon aria-hidden="true" />
                  Generate a password
                </Button>
              </div>
              {!isAdminRow && (
                <Controller
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <div className="col-span-full flex items-center gap-3 rounded-lg border border-border px-3.5 py-3">
                      <div className="flex-1">
                        <div className="font-medium">{field.value ? "Active" : "Inactive"}</div>
                        <div className="text-[12.5px] text-muted-foreground">
                          Inactive staff can’t sign in. Use this for staff on leave instead of
                          deleting their account.
                        </div>
                      </div>
                      <Switch
                        aria-label="Active"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </div>
                  )}
                />
              )}
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {isNew ? "Create account" : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
