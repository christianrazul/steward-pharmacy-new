"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isDataError, type DataClient } from "@steward/data";

import { createDataClient } from "./client";

type AppDataClient = ReturnType<typeof createDataClient>;

const DataClientContext = createContext<AppDataClient | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createDataClient);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Permission and validation errors will not fix themselves on retry.
            retry: (failureCount, error) =>
              !(isDataError(error) && error.code !== "unknown" && error.code !== "offline") &&
              failureCount < 2,
          },
        },
      }),
  );
  return (
    <DataClientContext.Provider value={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </DataClientContext.Provider>
  );
}

export function useDataClient(): AppDataClient & DataClient {
  const client = useContext(DataClientContext);
  if (!client) throw new Error("useDataClient must be used inside DataProvider");
  return client;
}
