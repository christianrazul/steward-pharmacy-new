import {
  addDays,
  addHours,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { MANILA_TZ } from "./dates";
import type { ReportPeriod } from "./schemas";

/**
 * Report periods, bucketed in Manila time:
 * Today (hourly), This week (daily, Monday first), This month (weekly),
 * This quarter (monthly), This year (quarterly). Each compares against the
 * previous period of the same length.
 */

export interface PeriodBucket {
  label: string;
  start: Date;
  end: Date;
}

export interface PeriodRange {
  period: ReportPeriod;
  /** "Today", "This week", … */
  label: string;
  /** "yesterday", "last week", … */
  previousLabel: string;
  start: Date;
  /** Exclusive end of the whole period. */
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  /** How far into the period `now` is; KPI deltas compare the same span of the previous period. */
  elapsedMs: number;
  buckets: PeriodBucket[];
  previousBuckets: PeriodBucket[];
}

const LABELS: Record<ReportPeriod, [string, string]> = {
  today: ["Today", "yesterday"],
  week: ["This week", "last week"],
  month: ["This month", "last month"],
  quarter: ["This quarter", "last quarter"],
  year: ["This year", "last year"],
};

/** First and last hour shown on the Today chart. Sales outside count toward the nearest edge. */
export const DAY_CHART_FIRST_HOUR = 7;
export const DAY_CHART_LAST_HOUR = 21;

const toUtc = (wallClock: Date) => fromZonedTime(wallClock, MANILA_TZ);

function periodStart(period: ReportPeriod, wallClock: Date): Date {
  switch (period) {
    case "today":
      return startOfDay(wallClock);
    case "week":
      return startOfWeek(wallClock, { weekStartsOn: 1 });
    case "month":
      return startOfMonth(wallClock);
    case "quarter":
      return startOfQuarter(wallClock);
    case "year":
      return startOfYear(wallClock);
  }
}

function shift(period: ReportPeriod, wallClock: Date, amount: number): Date {
  switch (period) {
    case "today":
      return addDays(wallClock, amount);
    case "week":
      return addWeeks(wallClock, amount);
    case "month":
      return addMonths(wallClock, amount);
    case "quarter":
      return addQuarters(wallClock, amount);
    case "year":
      return addYears(wallClock, amount);
  }
}

/** Buckets for a period starting at `start` (Manila wall clock). Labels are the same for current and previous. */
function bucketsFor(period: ReportPeriod, start: Date): PeriodBucket[] {
  const make = (label: string, from: Date, to: Date): PeriodBucket => ({
    label,
    start: toUtc(from),
    end: toUtc(to),
  });
  switch (period) {
    case "today": {
      const buckets: PeriodBucket[] = [];
      for (let hour = DAY_CHART_FIRST_HOUR; hour <= DAY_CHART_LAST_HOUR; hour++) {
        const from = hour === DAY_CHART_FIRST_HOUR ? start : addHours(start, hour);
        const to = hour === DAY_CHART_LAST_HOUR ? addDays(start, 1) : addHours(start, hour + 1);
        buckets.push(make(format(addHours(start, hour), "h a"), from, to));
      }
      return buckets;
    }
    case "week":
      return Array.from({ length: 7 }, (_, day) =>
        make(format(addDays(start, day), "EEE"), addDays(start, day), addDays(start, day + 1)),
      );
    case "month": {
      const end = addMonths(start, 1);
      const buckets: PeriodBucket[] = [];
      for (let week = 0; addDays(start, week * 7) < end; week++) {
        const from = addDays(start, week * 7);
        const next = addDays(start, (week + 1) * 7);
        buckets.push(make(`Week ${week + 1}`, from, next < end ? next : end));
      }
      return buckets;
    }
    case "quarter":
      return Array.from({ length: 3 }, (_, month) =>
        make(
          format(addMonths(start, month), "MMM"),
          addMonths(start, month),
          addMonths(start, month + 1),
        ),
      );
    case "year":
      return Array.from({ length: 4 }, (_, quarter) =>
        make(`Q${quarter + 1}`, addQuarters(start, quarter), addQuarters(start, quarter + 1)),
      );
  }
}

export function periodRange(period: ReportPeriod, now: Date = new Date()): PeriodRange {
  const wallNow = toZonedTime(now, MANILA_TZ);
  const startWall = periodStart(period, wallNow);
  const previousStartWall = shift(period, startWall, -1);
  const [label, previousLabel] = LABELS[period];
  const start = toUtc(startWall);
  return {
    period,
    label,
    previousLabel,
    start,
    end: toUtc(shift(period, startWall, 1)),
    previousStart: toUtc(previousStartWall),
    previousEnd: start,
    elapsedMs: now.getTime() - start.getTime(),
    buckets: bucketsFor(period, startWall),
    previousBuckets: bucketsFor(period, previousStartWall),
  };
}

/** Index of the bucket containing `at`, or -1 when outside. */
export function bucketIndex(buckets: readonly PeriodBucket[], at: Date): number {
  const time = at.getTime();
  return buckets.findIndex(
    (bucket) => time >= bucket.start.getTime() && time < bucket.end.getTime(),
  );
}

/** Percent change from previous to current, one decimal place. Null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
