import type { DataClient } from "@steward/data";
import { FakeDataClient } from "@steward/data/fake";

/**
 * Picks the DataClient for this build. The static front end uses fixtures;
 * Milestone 5 switches the web build to the API (RemoteClient) and Milestone 11
 * gives the desktop app its LocalClient.
 */
export function createDataClient(): DataClient & {
  simulateConnectivity?: (online: boolean) => void;
} {
  const storage = typeof window === "undefined" ? undefined : safeSessionStorage();
  return new FakeDataClient({ latencyMs: 150, ...(storage ? { storage } : {}) });
}

function safeSessionStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
