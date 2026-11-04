import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * Shared type-checked rules for every TypeScript workspace.
 * @param {string} tsconfigRootDir The workspace folder (pass import.meta.dirname).
 */
export function baseConfig(tsconfigRootDir) {
  return defineConfig(
    {
      ignores: ["dist/**", "out/**", ".next/**", "coverage/**", "next-env.d.ts"],
    },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        eqeqeq: ["error", "always"],
        "no-console": "error",
      },
    },
    {
      files: ["**/*.js", "**/*.mjs"],
      extends: [tseslint.configs.disableTypeChecked],
    },
    prettier,
  );
}
