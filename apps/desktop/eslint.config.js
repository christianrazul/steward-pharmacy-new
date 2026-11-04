import { nodeConfig } from "@steward/config/eslint/node";

export default [
  { ignores: ["release/**", "test-results/**", "playwright-report/**"] },
  ...nodeConfig(import.meta.dirname),
];
