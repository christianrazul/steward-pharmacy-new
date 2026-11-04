import { formatInTimeZone } from "date-fns-tz";
import { MANILA_TZ } from "./dates";

/** 0 is Sunday, as in the database (open_days) and JavaScript. */
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface BranchHours {
  /** "HH:mm", 24-hour. */
  opensAt: string | null;
  closesAt: string | null;
  openDays: readonly number[];
}

/** Whether the branch is open right now, by Manila time. */
export function isBranchOpen(hours: BranchHours, now: Date = new Date()): boolean {
  if (!hours.opensAt || !hours.closesAt) return false;
  const day = Number(formatInTimeZone(now, MANILA_TZ, "i")) % 7; // ISO: Monday 1 … Sunday 7
  if (!hours.openDays.includes(day)) return false;
  const time = formatInTimeZone(now, MANILA_TZ, "HH:mm");
  return time >= hours.opensAt && time < hours.closesAt;
}

/** Returns an error for invalid hours, or null. Closing must be after opening; at least one open day. */
export function branchHoursError(hours: BranchHours): string | null {
  if (!hours.opensAt || !hours.closesAt) return "Set both opening and closing time.";
  if (hours.closesAt <= hours.opensAt) return "Closing time must be after opening time.";
  if (hours.openDays.length === 0) return "Pick at least one day the branch is open.";
  return null;
}

/** "08:00" → "8 AM", "19:30" → "7:30 PM". */
export function formatClock(time: string): string {
  const [hourText = "0", minuteText = "0"] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${hour12} ${suffix}`
    : `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** "8 AM – 8 PM", or "Hours not set". */
export function formatHours(hours: Pick<BranchHours, "opensAt" | "closesAt">): string {
  if (!hours.opensAt || !hours.closesAt) return "Hours not set";
  return `${formatClock(hours.opensAt)} – ${formatClock(hours.closesAt)}`;
}

/** "Every day", "Mon – Sat", "Mon – Fri", "Closed", or a list like "Mon, Wed, Fri". */
export function formatOpenDays(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  if (sorted.length === 0) return "Closed";
  const key = sorted.join(",");
  if (key === "1,2,3,4,5,6") return "Mon – Sat";
  if (key === "1,2,3,4,5") return "Mon – Fri";
  return sorted.map((day) => DAY_LABELS[day] ?? "").join(", ");
}
