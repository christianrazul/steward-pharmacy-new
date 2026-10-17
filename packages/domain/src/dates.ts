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

/** Today's date in Manila as "yyyy-MM-dd". */
export function manilaToday(now: Date = new Date()): string {
  return manilaDateKey(now);
}

const DAY_MS = 86_400_000;

function dateOnlyToUtcMs(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Expected a date like 2026-10-18, got "${date}"`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Whole Manila calendar days from today until `date` ("yyyy-MM-dd"). Negative when in the past. */
export function daysUntil(date: string, now: Date = new Date()): number {
  return Math.round((dateOnlyToUtcMs(date) - dateOnlyToUtcMs(manilaToday(now))) / DAY_MS);
}

/** Adds days to a "yyyy-MM-dd" date. */
export function addDaysToDate(date: string, days: number): string {
  return new Date(dateOnlyToUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}
