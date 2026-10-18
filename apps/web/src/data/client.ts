import type { DataClient } from "@steward/data";
import { FakeDataClient } from "@steward/data/fake";
import { desktopBridge, LocalClient } from "@steward/data/local";
import { RemoteClient } from "@steward/data/remote";

import { env } from "@/env";

export type AppDataClient = DataClient & { simulateConnectivity?: (online: boolean) => void };

/**
 * Picks the DataClient: inside the desktop app, the counter's own database
 * (LocalClient, through the preload bridge); on the web, the API
 * (RemoteClient), or in-memory demo data when NEXT_PUBLIC_DATA_SOURCE=fake.
 * One static build serves both.
 */
export function createDataClient(): AppDataClient {
  const bridge = desktopBridge();
  if (bridge) return new LocalClient(bridge);
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
