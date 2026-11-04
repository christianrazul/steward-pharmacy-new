// Bundles the main process (ESM) and the preload script (CommonJS, required by
// Electron's sandbox). Native and WebAssembly packages stay external and ship in
// node_modules; everything else, including the API's services, is bundled.
import { build } from "esbuild";

const external = ["electron", "@electric-sql/pglite", "@node-rs/argon2", "electron-updater"];

await build({
  entryPoints: ["src/main/main.ts"],
  outfile: "dist/main.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  external,
  // Some bundled CommonJS dependencies call require() for Node built-ins.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

await build({
  entryPoints: ["src/preload.ts"],
  outfile: "dist/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
});
