/**
 * The one place that says what each role may do. Screens use it to decide what
 * to show, and from Milestone 5 every API service uses it to decide what to
 * allow, together with branch scoping. Hiding a button is never the security
 * boundary.
 *
 * All staff positions share the staff permissions for now. Giving positions
 * their own permissions later means changing this file only.
 */
export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_POSITIONS = [
  "cashier",
  "pharmacist",
  "pharmacy_assistant",
  "branch_supervisor",
] as const;
export type StaffPosition = (typeof STAFF_POSITIONS)[number];

export const ACTIONS = [
  "dashboard.view",
  "sales_activity.view",
  "pos.sell",
  "inventory.view",
  "inventory.add_stock",
  "stock_requests.view",
  "stock_requests.create",
  "stock_requests.review",
  "settings.manage",
  "branches.switch",
  "command_palette.open",
] as const;
export type Action = (typeof ACTIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Action[]> = {
  admin: ACTIONS,
  staff: ["pos.sell", "inventory.view", "stock_requests.view", "stock_requests.create"],
};

export function can(role: Role, action: Action): boolean {
  return ROLE_PERMISSIONS[role].includes(action);
}

/** UI label for a person's role: "Super admin" for admins, their position for staff. */
export function roleLabel(role: Role, position: StaffPosition | null): string {
  if (role === "admin") return "Super admin";
  return position === null ? "Staff" : POSITION_LABELS[position];
}

export const POSITION_LABELS: Record<StaffPosition, string> = {
  cashier: "Cashier",
  pharmacist: "Pharmacist",
  pharmacy_assistant: "Pharmacy assistant",
  branch_supervisor: "Branch supervisor",
};
