import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url({ protocol: /^https?$/ }),
});

export type WebEnv = z.infer<typeof envSchema>;

export function parseWebEnv(source: Record<string, string | undefined>): WebEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid web environment. Fix these in apps/web/.env.local (see .env.example):\n${problems}`,
    );
  }
  return result.data;
}
