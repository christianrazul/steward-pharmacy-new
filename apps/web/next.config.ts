import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { parseWebEnv } from "./src/env-schema";

const nextConfig: NextConfig = {
  // One static build, served by Caddy on the web and loaded by the Electron shell.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ["@steward/domain"],
  poweredByHeader: false,
};

export default function config(phase: string): NextConfig {
  // Fail fast when `next dev` or `next build` starts with a bad environment.
  // `next typegen` (used by pnpm typecheck) runs in the build phase but bakes nothing in.
  const isTypegen = process.argv.includes("typegen");
  if ((phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) && !isTypegen) {
    parseWebEnv(process.env);
  }
  return nextConfig;
}
