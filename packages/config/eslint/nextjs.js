import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { baseConfig } from "./base.js";

/**
 * Screens never talk to the network or a database directly. They go through
 * the DataClient interface in @steward/data (RemoteClient on the web,
 * LocalClient on the desktop). See "Backend" in the build brief.
 */
const dataAccessRestrictions = {
  "no-restricted-imports": [
    "error",
    {
      paths: [
        { name: "hono", message: "Screens use @steward/data, not the API directly." },
        { name: "hono/client", message: "Screens use @steward/data, not the API directly." },
        { name: "postgres", message: "Screens use @steward/data, never SQL." },
        { name: "drizzle-orm", message: "Screens use @steward/data, never SQL." },
        { name: "@steward/db", message: "Screens use @steward/data, never the database." },
        { name: "@electric-sql/pglite", message: "Screens use @steward/data, never PGlite." },
      ],
      patterns: [
        {
          group: ["drizzle-orm/*", "@electric-sql/pglite/*", "@steward/db/*"],
          message: "Screens use @steward/data.",
        },
        {
          group: ["axios", "ky", "ofetch"],
          message: "Screens use @steward/data for all network access.",
        },
      ],
    },
  ],
  "no-restricted-globals": [
    "error",
    { name: "fetch", message: "Screens use @steward/data for all network access." },
    { name: "XMLHttpRequest", message: "Screens use @steward/data for all network access." },
  ],
  "no-restricted-properties": [
    "error",
    { object: "window", property: "fetch", message: "Screens use @steward/data." },
    { object: "globalThis", property: "fetch", message: "Screens use @steward/data." },
  ],
};

/** For the Next.js web app. */
export function nextjsConfig(tsconfigRootDir) {
  return [
    ...baseConfig(tsconfigRootDir),
    {
      plugins: {
        "@next/next": nextPlugin,
        "react-hooks": reactHooks,
      },
      languageOptions: {
        globals: { ...globals.browser },
      },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs["core-web-vitals"].rules,
        ...reactHooks.configs.recommended.rules,
      },
    },
    {
      files: ["src/**/*.{ts,tsx}"],
      rules: dataAccessRestrictions,
    },
    {
      // Config files and test servers run in Node, not the browser.
      files: ["**/*.mjs", "*.config.ts", "e2e/**/*.ts", "e2e-fullstack/**/*.ts"],
      languageOptions: { globals: { ...globals.node } },
    },
  ];
}
