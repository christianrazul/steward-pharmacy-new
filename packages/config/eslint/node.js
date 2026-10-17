import globals from "globals";
import { baseConfig } from "./base.js";

/** For Node workspaces (api, desktop main process, scripts). */
export function nodeConfig(tsconfigRootDir) {
  return [
    ...baseConfig(tsconfigRootDir),
    {
      languageOptions: {
        globals: globals.node,
      },
    },
  ];
}
