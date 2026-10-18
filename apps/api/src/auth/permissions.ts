import { type Action, can } from "@steward/domain";
import type { SessionUser } from "@steward/domain/view-models";

import { forbidden, unauthorized } from "../http/errors";
import type { Actor } from "./actor";

/**
 * The server-side permission check every service calls. Role permissions come
 * from the single map in @steward/domain; branch scoping is added here:
 * staff only ever act on their assigned branch.
 */
export function authorize(
  actor: Actor | null,
  action: Action,
  scope: { branchId?: string | null } = {},
): SessionUser {
  if (actor?.kind !== "user") throw unauthorized();
  const { user } = actor;
  if (!can(user.role, action)) throw forbidden();
  if (
    scope.branchId !== undefined &&
    scope.branchId !== null &&
    !canAccessBranch(user, scope.branchId)
  ) {
    throw forbidden("You can only work with your own branch.");
  }
  return user;
}

/** Admins see every branch; staff only their own. */
export function canAccessBranch(user: SessionUser, branchId: string): boolean {
  return user.role === "admin" || user.branchId === branchId;
}

/** The branch filter to apply for a list query: admins may pick any (or all); staff always get theirs. */
export function scopedBranch(user: SessionUser, requested: string | null): string | null {
  return user.role === "admin" ? requested : user.branchId;
}

export function requireUser(actor: Actor | null): SessionUser {
  if (actor?.kind !== "user") throw unauthorized();
  return actor.user;
}
