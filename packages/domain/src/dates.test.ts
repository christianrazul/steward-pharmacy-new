import { describe, expect, it } from "vitest";
import {
  formatManila,
  isSameManilaDay,
  manilaDateKey,
  startOfManilaDay,
  startOfNextManilaDay,
} from "./dates";

// Manila is UTC+8 all year (no daylight saving).
const lateNightManila = new Date("2026-10-12T15:59:00Z"); // Oct 12, 11:59 PM Manila
const midnightManila = new Date("2026-10-12T16:00:00Z"); // Oct 13, 12:00 AM Manila

describe("Manila dates", () => {
  it("puts a sale at 11:59 PM Manila on that Manila day, not the UTC day", () => {
    expect(manilaDateKey(lateNightManila)).toBe("2026-10-12");
    expect(manilaDateKey(midnightManila)).toBe("2026-10-13");
    expect(isSameManilaDay(lateNightManila, midnightManila)).toBe(false);
  });

  it("formats in Manila time", () => {
    expect(formatManila(lateNightManila, "MMM d, yyyy h:mm a")).toBe("Oct 12, 2026 11:59 PM");
  });

  it("finds the UTC bounds of a Manila day", () => {
    expect(startOfManilaDay(lateNightManila).toISOString()).toBe("2026-10-11T16:00:00.000Z");
    expect(startOfNextManilaDay(lateNightManila).toISOString()).toBe("2026-10-12T16:00:00.000Z");
    expect(startOfManilaDay(midnightManila).toISOString()).toBe("2026-10-12T16:00:00.000Z");
  });

  it("gives the same answer whatever the machine's own time zone is", () => {
    // Bucketing must not depend on process.env.TZ; these helpers never use local time.
    const early = new Date("2026-01-01T00:30:00+08:00");
    expect(manilaDateKey(early)).toBe("2026-01-01");
    expect(startOfManilaDay(early).toISOString()).toBe("2025-12-31T16:00:00.000Z");
  });
});
