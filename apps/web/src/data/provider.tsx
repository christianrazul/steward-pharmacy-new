"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isDataError, type DataClient } from "@steward/data";

import { createDataClient, type AppDataClient } from "./client";

const DataClientContext = createContext<AppDataClient | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createDataClient);
  const [queryClient] = useState(() => {
    const instance: QueryClient = new QueryClient({
      // An expired or revoked session anywhere sends people back to sign in.
      queryCache: new QueryCache({
        onError: (error) => {
          if (isDataError(error) && error.code === "unauthorized")
            instance.setQueryData(["session"], null);
        },
      }),
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
    });
    return instance;
  });
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
