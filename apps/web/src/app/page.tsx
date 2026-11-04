"use client";

import { formatPeso } from "@steward/domain";

// Placeholder until Milestone 1 builds the app shell.
export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
      <h1>Steward Pharmacy</h1>
      <p>Point of sale and inventory. The app shell arrives in Milestone 1.</p>
      <p style={{ fontVariantNumeric: "tabular-nums" }}>
        Money formatting check: <span data-testid="peso-sample">{formatPeso(123456)}</span>
      </p>
    </main>
  );
}
