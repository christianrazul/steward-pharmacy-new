import { sql } from "drizzle-orm";
import type { Device, StaffAccount } from "@steward/domain/view-models";
import { rows } from "@steward/db";
import type { Role, StaffPosition } from "@steward/domain";

import { authorize } from "../auth/permissions";
import type { ServiceContext } from "./context";

interface StaffRow {
  id: string;
  full_name: string;
  username: string;
  role: Role;
  position: StaffPosition | null;
  branch_id: string;
  branch_name: string;
  phone: string | null;
  contact_email: string | null;
  address: string | null;
  prc_license_no: string | null;
  active: boolean;
}

export const STAFF_SELECT = sql`select u.id, u.full_name, u.username, u.role, u.position, u.branch_id, b.name as branch_name,
    u.phone, u.contact_email, u.address, u.prc_license_no, u.active
  from users u join branches b on b.id = u.branch_id where u.deleted_at is null`;

export function toStaff(row: StaffRow): StaffAccount {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    role: row.role,
    position: row.position,
    branchId: row.branch_id,
    branchName: row.branch_name,
    phone: row.phone,
    email: row.contact_email,
    address: row.address,
    prcLicenseNo: row.prc_license_no,
    active: row.active,
  };
}

export async function listStaff(ctx: ServiceContext): Promise<StaffAccount[]> {
  authorize(ctx.actor, "settings.manage");
  const result = await rows<StaffRow>(
    ctx.db,
    sql`${STAFF_SELECT} order by (u.role = 'admin') desc, u.created_at, u.full_name`,
  );
  return result.map(toStaff);
}

export async function staffById(ctx: ServiceContext, id: string): Promise<StaffAccount | null> {
  const [row] = await rows<StaffRow>(ctx.db, sql`${STAFF_SELECT} and u.id = ${id}`);
  return row ? toStaff(row) : null;
}

interface DeviceRow {
  id: string;
  branch_id: string;
  branch_name: string;
  label: string;
  receipt_series: string;
  print_width: number;
  enrolled: boolean;
  last_seen_at: string | null;
  revoked_at: string | null;
}

export const DEVICE_SELECT = sql`select d.id, d.branch_id, b.name as branch_name, d.label, d.receipt_series, d.print_width,
    (d.token_hash is not null) as enrolled, d.last_seen_at::text as last_seen_at, d.revoked_at::text as revoked_at
  from devices d join branches b on b.id = d.branch_id where d.deleted_at is null`;

export function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    label: row.label,
    receiptSeries: row.receipt_series,
    printWidth: row.print_width === 80 ? 80 : 58,
    enrolled: row.enrolled,
    lastSeenAt: row.last_seen_at === null ? null : new Date(row.last_seen_at).toISOString(),
    revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at).toISOString(),
  };
}

export async function listDevices(ctx: ServiceContext): Promise<Device[]> {
  authorize(ctx.actor, "settings.manage");
  const result = await rows<DeviceRow>(
    ctx.db,
    sql`${DEVICE_SELECT} order by b.name, d.receipt_series`,
  );
  return result.map(toDevice);
}

export async function deviceById(ctx: ServiceContext, id: string): Promise<Device | null> {
  const [row] = await rows<DeviceRow>(ctx.db, sql`${DEVICE_SELECT} and d.id = ${id}`);
  return row ? toDevice(row) : null;
}
