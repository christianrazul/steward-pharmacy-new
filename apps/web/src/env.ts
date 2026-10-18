import { parseWebEnv } from "./env-schema";

// Next.js inlines NEXT_PUBLIC_* only when each variable is referenced by its full name.
export const env = parseWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_DATA_SOURCE: process.env.NEXT_PUBLIC_DATA_SOURCE,
  NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV,
  NEXT_PUBLIC_DEV_ROLE_SWITCHER: process.env.NEXT_PUBLIC_DEV_ROLE_SWITCHER,
});
