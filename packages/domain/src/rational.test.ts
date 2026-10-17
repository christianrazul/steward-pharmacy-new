import { describe, expect, it } from "vitest";
import { add, compare, div, frac, max, min, mul, roundHalfUp, sub } from "./rational";

describe("rational", () => {
  it("rounds half up exactly where floats would not", () => {
    // 11200 / 1.12 is 9999.999999999998 in floating point.
    expect(roundHalfUp(div(frac(11200), frac(112, 100)))).toBe(10000);
    expect(roundHalfUp(frac(5, 2))).toBe(3);
    expect(roundHalfUp(frac(49, 10))).toBe(5);
    expect(roundHalfUp(frac(44, 10))).toBe(4);
    expect(roundHalfUp(frac(-5, 2))).toBe(-3);
  });

  it("does arithmetic and comparison", () => {
    expect(roundHalfUp(add(frac(1, 3), frac(2, 3)))).toBe(1);
    expect(roundHalfUp(sub(frac(10), frac(1, 2)))).toBe(10);
    expect(roundHalfUp(mul(frac(3), frac(7, 2)))).toBe(11);
    expect(compare(frac(1, 2), frac(2, 4))).toBe(0);
    expect(compare(frac(1, 3), frac(1, 2))).toBe(-1);
    expect(min(frac(1), frac(2)).num).toBe(1n);
    expect(max(frac(1), frac(2)).num).toBe(2n);
    expect(frac(1, -2)).toEqual({ num: -1n, den: 2n });
    expect(() => frac(1, 0)).toThrow(RangeError);
  });
});
