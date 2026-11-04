import { describe, expect, it } from "vitest";
import { bucketIndex, percentChange, periodRange } from "./reports";

// Sunday Oct 18, 2026, 10:00 AM Manila.
const now = new Date("2026-10-18T02:00:00Z");

describe("report periods", () => {
  it("buckets today by hour in Manila time", () => {
    const range = periodRange("today", now);
    expect(range.label).toBe("Today");
    expect(range.previousLabel).toBe("yesterday");
    expect(range.start.toISOString()).toBe("2026-10-17T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-18T16:00:00.000Z");
    expect(range.previousStart.toISOString()).toBe("2026-10-16T16:00:00.000Z");
    expect(range.buckets.map((b) => b.label)).toEqual([
      "7 AM",
      "8 AM",
      "9 AM",
      "10 AM",
      "11 AM",
      "12 PM",
      "1 PM",
      "2 PM",
      "3 PM",
      "4 PM",
      "5 PM",
      "6 PM",
      "7 PM",
      "8 PM",
      "9 PM",
    ]);
    expect(range.elapsedMs).toBe(10 * 3_600_000);
  });

  it("puts a sale at 11:59 PM Manila on that day, in the last bucket", () => {
    const range = periodRange("today", now);
    expect(bucketIndex(range.buckets, new Date("2026-10-18T15:59:00Z"))).toBe(
      range.buckets.length - 1,
    );
    expect(bucketIndex(range.buckets, new Date("2026-10-18T16:00:00Z"))).toBe(-1);
    // 2 AM Manila counts toward the first bucket.
    expect(bucketIndex(range.buckets, new Date("2026-10-17T18:00:00Z"))).toBe(0);
    expect(bucketIndex(range.previousBuckets, new Date("2026-10-17T15:59:00Z"))).toBe(
      range.buckets.length - 1,
    );
  });

  it("starts weeks on Monday", () => {
    const range = periodRange("week", now);
    expect(range.buckets.map((b) => b.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(range.start.toISOString()).toBe("2026-10-11T16:00:00.000Z");
    expect(range.previousStart.toISOString()).toBe("2026-10-04T16:00:00.000Z");
  });

  it("splits months into weeks", () => {
    const range = periodRange("month", now);
    expect(range.buckets.map((b) => b.label)).toEqual([
      "Week 1",
      "Week 2",
      "Week 3",
      "Week 4",
      "Week 5",
    ]);
    expect(range.buckets.at(-1)?.end.toISOString()).toBe(range.end.toISOString());
    expect(periodRange("month", new Date("2026-02-10T00:00:00Z")).buckets).toHaveLength(4);
  });

  it("splits quarters into months and years into quarters", () => {
    expect(periodRange("quarter", now).buckets.map((b) => b.label)).toEqual(["Oct", "Nov", "Dec"]);
    expect(periodRange("quarter", now).previousBuckets.map((b) => b.label)).toEqual([
      "Jul",
      "Aug",
      "Sep",
    ]);
    const year = periodRange("year", now);
    expect(year.buckets.map((b) => b.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(year.previousLabel).toBe("last year");
    expect(year.start.toISOString()).toBe("2025-12-31T16:00:00.000Z");
  });

  it("computes percent change", () => {
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(90, 120)).toBe(-25);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(1, 3)).toBe(-66.7);
  });
});
