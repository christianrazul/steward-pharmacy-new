import { z } from "zod";

const apiUrl = z
  .string()
  .refine(
    (value) => /^https?:\/\/\S+$/.test(value) || /^\/\S*$/.test(value),
    "Use a full URL (http://localhost:4000) or a path on this site (/api).",
  )
  .transform((value) => value.replace(/\/+$/, ""));

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const envSchema = z
  .object({
    NEXT_PUBLIC_API_URL: apiUrl,
    /** "remote" talks to the API; "fake" uses in-memory demo data (UI work, fast end-to-end tests). */
    NEXT_PUBLIC_DATA_SOURCE: z.enum(["remote", "fake"]).default("remote"),
    /** Production builds refuse the development-only tools. */
    NEXT_PUBLIC_DEPLOY_ENV: z.enum(["development", "staging", "production"]).default("development"),
    NEXT_PUBLIC_DEV_ROLE_SWITCHER: flag,
  })
  .superRefine((env, ctx) => {
    if (env.NEXT_PUBLIC_DEPLOY_ENV === "production" && env.NEXT_PUBLIC_DEV_ROLE_SWITCHER) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_DEV_ROLE_SWITCHER"],
        message: "must be false in production builds",
      });
    }
    if (env.NEXT_PUBLIC_DEPLOY_ENV === "production" && env.NEXT_PUBLIC_DATA_SOURCE === "fake") {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_DATA_SOURCE"],
        message: "must be remote in production builds",
      });
    }
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
