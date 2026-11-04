import type { DataClient } from "@steward/data";
import { FakeDataClient } from "@steward/data/fake";
import { RemoteClient } from "@steward/data/remote";

import { env } from "@/env";

export type AppDataClient = DataClient & { simulateConnectivity?: (online: boolean) => void };

/**
 * Picks the DataClient for this build: the API (RemoteClient) on the web, or
 * in-memory demo data when NEXT_PUBLIC_DATA_SOURCE=fake. The desktop app swaps
 * in its LocalClient (Milestone 11).
 */
export function createDataClient(): AppDataClient {
  if (env.NEXT_PUBLIC_DATA_SOURCE === "fake") {
    const storage = typeof window === "undefined" ? undefined : safeSessionStorage();
    return new FakeDataClient({ latencyMs: 150, ...(storage ? { storage } : {}) });
  }
  return new RemoteClient({ baseUrl: env.NEXT_PUBLIC_API_URL });
}

function safeSessionStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
