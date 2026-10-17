import { useSyncExternalStore } from "react";

import {
  SIDEBAR_ATTRIBUTE as ATTRIBUTE,
  SIDEBAR_STORAGE_KEY as STORAGE_KEY,
} from "./sidebar-init-script";

/**
 * Whether the desktop sidebar is collapsed to its 60px icon rail.
 *
 * The choice lives on <html data-sidebar="collapsed"> and in localStorage. An
 * inline script in the root layout (sidebar-init-script.ts) sets the attribute before first paint, and
 * the sidebar's collapsed styles key off the attribute in CSS, so reloading a
 * collapsed sidebar never flashes the expanded one.
 */

const listeners = new Set<() => void>();

function readCollapsed(): boolean {
  return document.documentElement.getAttribute(ATTRIBUTE) === "collapsed";
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (collapsed) document.documentElement.setAttribute(ATTRIBUTE, "collapsed");
  else document.documentElement.removeAttribute(ATTRIBUTE);
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Storage can be unavailable (private mode). The choice then lasts for this page only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, readCollapsed, () => false);
}
