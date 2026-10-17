// Bundles the API into dist/index.js. Workspace packages (@steward/*) are
// TypeScript source, so they are bundled in; npm dependencies stay external
// and are installed in the production image.
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies ?? {}).filter(
  (name) => !name.startsWith("@steward/"),
);

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
  logLevel: "info",
});
