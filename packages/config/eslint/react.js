import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { baseConfig } from "./base.js";

/** For React component packages that are not a Next.js app (packages/ui). */
export function reactConfig(tsconfigRootDir) {
  return [
    ...baseConfig(tsconfigRootDir),
    {
      plugins: { "react-hooks": reactHooks },
      languageOptions: { globals: { ...globals.browser } },
      rules: { ...reactHooks.configs.recommended.rules },
    },
  ];
}
