import { describe, expect, it } from "vitest";
import { assertCentavos, formatPeso, isCentavos, parsePesoInput, sumCentavos } from "./money";

describe("formatPeso", () => {
  it.each([
    [0, "₱0.00"],
    [5, "₱0.05"],
    [450, "₱4.50"],
    [29857, "₱298.57"],
    [123456, "₱1,234.56"],
    [100000000, "₱1,000,000.00"],
    [-21200, "-₱212.00"],
  ])("formats %i centavos as %s", (centavos, expected) => {
    expect(formatPeso(centavos)).toBe(expected);
  });

  it("refuses fractional centavos", () => {
    expect(() => formatPeso(10.5)).toThrow(RangeError);
  });
});

describe("parsePesoInput", () => {
  it.each([
    ["0", 0],
    ["20", 2000],
    ["20.5", 2050],
    ["20.50", 2050],
    [".75", 75],
    ["1,234.56", 123456],
    ["₱ 1,000", 100000],
    ["-4.50", -450],
    ["0.10", 10],
  ])("parses %s as %i centavos", (input, expected) => {
    expect(parsePesoInput(input)).toBe(expected);
  });

  it.each(["", " ", "abc", "1.234", "1,23", "12,34.00", "1.2.3", "--1", ".", "1e3"])(
    "rejects %j",
    (input) => {
      expect(parsePesoInput(input)).toBeNull();
    },
  );

  it("does not lose precision on values floats get wrong", () => {
    // 0.1 + 0.2 style errors: 1.15 * 100 is 114.99999999999999 in floating point.
    expect(parsePesoInput("1.15")).toBe(115);
    expect(parsePesoInput("4.35")).toBe(435);
  });
});

describe("centavo guards", () => {
  it("accepts only safe integers", () => {
    expect(isCentavos(100)).toBe(true);
    expect(isCentavos(1.5)).toBe(false);
    expect(isCentavos(Number.NaN)).toBe(false);
    expect(isCentavos("100")).toBe(false);
    expect(() => {
      assertCentavos(Number.POSITIVE_INFINITY);
    }).toThrow(RangeError);
  });

  it("sums centavos", () => {
    expect(sumCentavos([])).toBe(0);
    expect(sumCentavos([900, 38500, 2400])).toBe(41800);
    expect(() => sumCentavos([1, 0.5])).toThrow(RangeError);
  });
});
