import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, startOfDay } from "date-fns";

/**
 * Timestamps are stored in UTC. Everything people see, and every report bucket,
 * uses Manila time.
 */
export const MANILA_TZ = "Asia/Manila";

/** Formats a UTC instant as Manila wall-clock time using a date-fns pattern. */
export function formatManila(date: Date, pattern: string): string {
  return formatInTimeZone(date, MANILA_TZ, pattern);
}

/** The Manila calendar day of an instant, as "yyyy-MM-dd". Use it as a grouping key. */
export function manilaDateKey(date: Date): string {
  return formatManila(date, "yyyy-MM-dd");
}

/** The UTC instant at which the Manila day containing `date` starts. */
export function startOfManilaDay(date: Date): Date {
  const manilaWallClock = toZonedTime(date, MANILA_TZ);
  return fromZonedTime(startOfDay(manilaWallClock), MANILA_TZ);
}

/** The UTC instant at which the next Manila day starts (exclusive end of the day). */
export function startOfNextManilaDay(date: Date): Date {
  const manilaWallClock = toZonedTime(date, MANILA_TZ);
  return fromZonedTime(addDays(startOfDay(manilaWallClock), 1), MANILA_TZ);
}

export function isSameManilaDay(a: Date, b: Date): boolean {
  return manilaDateKey(a) === manilaDateKey(b);
}
