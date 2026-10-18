import { isDataError } from "@steward/data";

/** A message to show for any error: DataErrors are written for people; anything else gets a generic line. */
export function errorMessage(error: unknown): string {
  if (isDataError(error)) return error.message;
  return "Something went wrong. Try again, and if it keeps happening, reload the page.";
}

export function fieldErrorsOf(error: unknown): Record<string, string> {
  return isDataError(error) ? error.fields : {};
}
