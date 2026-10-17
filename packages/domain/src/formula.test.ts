import { describe, expect, it } from "vitest";
import {
  FORMULA_SAMPLE,
  FormulaError,
  evaluateFormula,
  formulaError,
  parseFormula,
} from "./formula";

const run = (source: string) =>
  evaluateFormula(parseFormula(source), FORMULA_SAMPLE.basket, FORMULA_SAMPLE.lines);

describe("formula parser", () => {
  it.each([
    ["subtotal * 0.20", 200],
    ["min(subtotal * 0.20, 150)", 150],
    ["max(50, itemCount * 2)", 50],
    ["2 + 3 * 4", 14],
    ["(2 + 3) * 4", 20],
    ["-5 + 10", 5],
    ["+5", 5],
    ["--5", 5],
    ["10 % 3", 1],
    ["10 / 4", 2.5],
    ["round(2.5)", 3],
    ["floor(2.9)", 2],
    ["ceil(2.1)", 3],
    [".5 * 4", 2],
    ["total - subtotal", 0],
    ["qty * 5", 50],
    ["lineTotal * 0.1", 100],
    ["min(unitPrice, 10) * qty", 100],
  ])("evaluates %s", (source, expected) => {
    expect(run(source)).toBeCloseTo(expected, 10);
  });

  it("uses vatBase in pesos", () => {
    expect(run("vatBase")).toBeCloseTo(892.857142857, 6);
  });

  it.each([
    ["", "Enter a formula."],
    ["   ", "Enter a formula."],
    ["price * 2", 'Unknown name "price".'],
    ["subtotal *", "The formula ends too early."],
    ["(subtotal", 'Missing ")".'],
    ["min subtotal", "min needs parentheses, like min(a, b)."],
    ["round(1, 2)", "round takes one value."],
    ["subtotal 5", 'Unexpected "5".'],
    ["subtotal $ 2", 'Unexpected character "$".'],
    [")", 'Unexpected ")".'],
    ["subtotal / 0", "The formula does not produce a number."],
    ["min()", 'Unexpected ")".'],
  ])("rejects %j", (source, message) => {
    expect(formulaError(source)).toBe(message);
  });

  it("accepts a valid formula", () => {
    expect(formulaError("min(subtotal * 0.20, 500)")).toBeNull();
  });

  it("never uses eval or new Function", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./formula.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/new\s+Function/);
  });

  it("throws FormulaError from evaluateFormula on non-finite results", () => {
    expect(() => run("1 / 0")).toThrow(FormulaError);
  });

  it("evaluates basket formulas without lines", () => {
    expect(evaluateFormula(parseFormula("itemCount"), FORMULA_SAMPLE.basket, [])).toBe(10);
    expect(evaluateFormula(parseFormula("qty"), FORMULA_SAMPLE.basket, [])).toBe(0);
  });
});
