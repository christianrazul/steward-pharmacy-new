import { parseWebEnv } from "./env-schema";

// Next.js inlines NEXT_PUBLIC_* only when each variable is referenced by its full name.
export const env = parseWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
