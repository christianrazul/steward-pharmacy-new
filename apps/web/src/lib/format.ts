import { formatManila, formatPeso } from "@steward/domain";

export { formatPeso as peso };

const integerFormatter = new Intl.NumberFormat("en-PH");

/** 1234 → "1,234". */
export function int(value: number): string {
  return integerFormatter.format(value);
}

/** "Oct 18, 2:05 PM" in Manila time. */
export function dateTime(iso: string): string {
  return formatManila(new Date(iso), "MMM d, h:mm a");
}

/** "Oct 18, 2026" for a date-only string or a timestamp. */
export function longDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00+08:00`)
    : new Date(value);
  return formatManila(date, "MMM d, yyyy");
}

/** "just now", "5m ago", "2h ago", "3d ago". */
export function relativeTime(iso: string | number, now: number = Date.now()): string {
  const at = typeof iso === "number" ? iso : new Date(iso).getTime();
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "₱1.2k", "₱2.50M" for chart axes. */
export function pesoShort(centavos: number): string {
  const pesos = centavos / 100;
  if (pesos >= 1_000_000) return `₱${(pesos / 1_000_000).toFixed(2)}M`;
  if (pesos >= 10_000) return `₱${(pesos / 1_000).toFixed(1)}k`;
  return `₱${integerFormatter.format(Math.round(pesos))}`;
}

/** Cash input text ("1,234.5") → centavos, or null. */
export { parsePesoInput } from "@steward/domain";
