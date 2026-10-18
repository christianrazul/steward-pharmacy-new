import { zValidator } from "@hono/zod-validator";
import { fieldErrors } from "@steward/domain";
import type { ValidationTargets } from "hono";
import type { z } from "zod";

import { invalid } from "./errors";

/**
 * Validates a request part with a shared Zod schema. Every route validates its
 * input; nothing from the client is trusted. Failures become a 422 with the
 * same field messages the forms show.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const fields = fieldErrors(result.error);
      throw invalid(Object.values(fields)[0] ?? "Check the highlighted fields.", fields);
    }
  });
}
