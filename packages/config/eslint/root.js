import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

/** Plain JS config for the few config files at the repo root. */
export const rootConfig = [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
];
