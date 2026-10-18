// Bundles the API into dist/index.js. Workspace packages (@steward/*) are
// TypeScript source, so they are bundled in. Every npm package stays external
// (including native ones like @node-rs/argon2) and is installed in the
// production image with `pnpm deploy`.
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const declared = new Set(Object.keys(pkg.dependencies ?? {}));
/** "drizzle-orm/pg-core" → "drizzle-orm"; "@scope/name/sub" → "@scope/name". */
const packageName = (path) =>
  path.startsWith("@") ? path.split("/").slice(0, 2).join("/") : path.split("/")[0];
const missing = new Set();

/** @type {import("esbuild").Plugin} */
const externalizeNpmPackages = {
  name: "externalize-npm-packages",
  setup(builder) {
    builder.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith("@steward/")) return undefined;
      const name = packageName(args.path);
      // Node built-ins need no install; everything else must be an API dependency so production has it.
      if (!args.path.startsWith("node:") && !declared.has(name)) missing.add(name);
      return { path: args.path, external: true };
    });
  },
};

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  plugins: [externalizeNpmPackages],
  logLevel: "info",
});

if (missing.size > 0) {
  throw new Error(
    `These packages are imported by bundled code but missing from apps/api/package.json dependencies: ${[...missing].join(", ")}`,
  );
}
