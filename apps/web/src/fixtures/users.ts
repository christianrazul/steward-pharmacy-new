import type { Role, StaffPosition } from "@steward/domain";

/** Temporary demo accounts from the mockup. Real accounts arrive in Milestone 5. */
export interface SessionUser {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  position: StaffPosition | null;
  branchId: string;
}

export const DEMO_ADMIN: SessionUser = {
  id: "u-admin",
  fullName: "Richard Boquia",
  username: "admin",
  role: "admin",
  position: null,
  branchId: "central",
};

export const DEMO_CASHIER: SessionUser = {
  id: "u-cashier1",
  fullName: "Jo Santos",
  username: "cashier1",
  role: "staff",
  position: "cashier",
  branchId: "b1",
};
