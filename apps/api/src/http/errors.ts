import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { DataErrorCode } from "@steward/domain/view-models-errors";

/**
 * An error the API sends to clients. `message` is written for people (what
 * happened and how to fix it); `code` lets clients react; `fields` maps form
 * fields to messages.
 */
export class AppError extends Error {
  override name = "AppError";
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: DataErrorCode,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const unauthorized = (message = "Your session ended. Sign in again to continue.") =>
  new AppError(401, "unauthorized", message);
export const forbidden = (
  message = "Your account can’t do that. Ask a super admin if you need access.",
) => new AppError(403, "forbidden", message);
export const notFound = (message: string) => new AppError(404, "not_found", message);
export const conflict = (message: string, fields: Record<string, string> = {}) =>
  new AppError(409, "conflict", message, fields);
export const invalid = (message: string, fields: Record<string, string> = {}) =>
  new AppError(422, "validation", message, fields);

export interface ErrorBody {
  error: { code: DataErrorCode; message: string; fields: Record<string, string> };
}

export function errorResponse(c: Context, error: AppError) {
  return c.json<ErrorBody>(
    { error: { code: error.code, message: error.message, fields: error.fields } },
    error.status,
  );
}
