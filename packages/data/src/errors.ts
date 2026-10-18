/**
 * Errors a DataClient throws. `message` is written for people: it says what
 * happened and how to fix it, and screens show it as is.
 */
export type DataErrorCode =
  "unauthorized" | "forbidden" | "not_found" | "validation" | "conflict" | "offline" | "unknown";

export class DataError extends Error {
  override name = "DataError";
  readonly code: DataErrorCode;
  /** Field name → message, for forms. */
  readonly fields: Record<string, string>;

  constructor(code: DataErrorCode, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.code = code;
    this.fields = fields;
  }
}

export function isDataError(error: unknown): error is DataError {
  return error instanceof DataError;
}
