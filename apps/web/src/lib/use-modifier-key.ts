import { useSyncExternalStore } from "react";

/** "⌘" on Apple devices, "Ctrl" elsewhere (the branch counters run Windows). */
export function useModifierKeyLabel(): string {
  return useSyncExternalStore(
    () => () => undefined,
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl "),
    () => "Ctrl ",
  );
}
