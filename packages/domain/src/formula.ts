/**
 * Discount formulas such as `min(subtotal * 0.20, 500)`.
 *
 * A small recursive-descent parser builds a syntax tree; evaluation walks the
 * tree. No string is ever executed as code (no eval, no Function constructor).
 *
 * Grammar:
 *   expr   := term (("+" | "-") term)*
 *   term   := unary (("*" | "/" | "%") unary)*
 *   unary  := ("-" | "+") unary | atom
 *   atom   := number | name | name "(" expr ("," expr)* ")" | "(" expr ")"
 *
 * Variables are in pesos. Basket variables: subtotal, itemCount, vatBase, total
 * (the discount base). Line variables: qty, unitPrice, lineTotal; using any of
 * them makes the formula run once per line and the results are summed.
 */

export const BASKET_VARIABLES = ["subtotal", "itemCount", "vatBase", "total"] as const;
export const LINE_VARIABLES = ["qty", "unitPrice", "lineTotal"] as const;
export const FORMULA_FUNCTIONS = ["min", "max", "round", "floor", "ceil"] as const;

type BasketVariable = (typeof BASKET_VARIABLES)[number];
type LineVariable = (typeof LINE_VARIABLES)[number];
type Variable = BasketVariable | LineVariable;
type FunctionName = (typeof FORMULA_FUNCTIONS)[number];

type Node =
  | { kind: "number"; value: number }
  | { kind: "variable"; name: Variable }
  | { kind: "unary"; op: "-"; operand: Node }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "%"; left: Node; right: Node }
  | { kind: "call"; fn: FunctionName; args: Node[] };

export interface FormulaBasket {
  subtotal: number;
  itemCount: number;
  vatBase: number;
  total: number;
}

export interface FormulaLine {
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ParsedFormula {
  ast: Node;
  perLine: boolean;
}

export class FormulaError extends Error {
  override name = "FormulaError";
}

const VARIABLE_SET = new Set<string>([...BASKET_VARIABLES, ...LINE_VARIABLES]);
const LINE_SET = new Set<string>(LINE_VARIABLES);
const FUNCTION_SET = new Set<string>(FORMULA_FUNCTIONS);

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  const pattern = /\s*(\d+(?:\.\d+)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|[-+*/%(),])/y;
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source.charAt(index))) {
      index += 1;
      continue;
    }
    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (!match?.[1]) throw new FormulaError(`Unexpected character "${source.charAt(index)}".`);
    tokens.push(match[1]);
    index = pattern.lastIndex;
  }
  return tokens;
}

export function parseFormula(source: string): ParsedFormula {
  const trimmed = source.trim();
  if (trimmed === "") throw new FormulaError("Enter a formula.");
  const tokens = tokenize(trimmed);
  let position = 0;
  let perLine = false;

  const peek = (): string | undefined => tokens[position];
  const next = (): string | undefined => tokens[position++];
  const expect = (token: string) => {
    if (next() !== token) throw new FormulaError(`Missing "${token}".`);
  };

  function expr(): Node {
    let node = term();
    for (let op = peek(); op === "+" || op === "-"; op = peek()) {
      next();
      node = { kind: "binary", op, left: node, right: term() };
    }
    return node;
  }

  function term(): Node {
    let node = unary();
    for (let op = peek(); op === "*" || op === "/" || op === "%"; op = peek()) {
      next();
      node = { kind: "binary", op, left: node, right: unary() };
    }
    return node;
  }

  function unary(): Node {
    const token = peek();
    if (token === "-") {
      next();
      return { kind: "unary", op: "-", operand: unary() };
    }
    if (token === "+") {
      next();
      return unary();
    }
    return atom();
  }

  function atom(): Node {
    const token = next();
    if (token === undefined) throw new FormulaError("The formula ends too early.");
    if (/^[\d.]/.test(token)) return { kind: "number", value: Number(token) };
    if (token === "(") {
      const inner = expr();
      expect(")");
      return inner;
    }
    if (FUNCTION_SET.has(token)) {
      if (next() !== "(")
        throw new FormulaError(`${token} needs parentheses, like ${token}(a, b).`);
      const args = [expr()];
      while (peek() === ",") {
        next();
        args.push(expr());
      }
      expect(")");
      const fn = token as FunctionName;
      if ((fn === "round" || fn === "floor" || fn === "ceil") && args.length !== 1) {
        throw new FormulaError(`${fn} takes one value.`);
      }
      return { kind: "call", fn, args };
    }
    if (VARIABLE_SET.has(token)) {
      if (LINE_SET.has(token)) perLine = true;
      return { kind: "variable", name: token as Variable };
    }
    if (/^[A-Za-z_]/.test(token)) throw new FormulaError(`Unknown name "${token}".`);
    throw new FormulaError(`Unexpected "${token}".`);
  }

  const ast = expr();
  const extra = peek();
  if (extra !== undefined) throw new FormulaError(`Unexpected "${extra}".`);
  return { ast, perLine };
}

function evaluate(node: Node, scope: Record<Variable, number>): number {
  switch (node.kind) {
    case "number":
      return node.value;
    case "variable":
      return scope[node.name];
    case "unary":
      return -evaluate(node.operand, scope);
    case "binary": {
      const left = evaluate(node.left, scope);
      const right = evaluate(node.right, scope);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "%":
          return left % right;
      }
      break;
    }
    case "call": {
      const values = node.args.map((arg) => evaluate(arg, scope));
      switch (node.fn) {
        case "min":
          return Math.min(...values);
        case "max":
          return Math.max(...values);
        case "round":
          return Math.round(values[0] ?? Number.NaN);
        case "floor":
          return Math.floor(values[0] ?? Number.NaN);
        case "ceil":
          return Math.ceil(values[0] ?? Number.NaN);
      }
    }
  }
}

/** Evaluates a parsed formula in pesos. Throws FormulaError when the result is not a finite number. */
export function evaluateFormula(
  formula: ParsedFormula,
  basket: FormulaBasket,
  lines: readonly FormulaLine[],
): number {
  const empty = { qty: 0, unitPrice: 0, lineTotal: 0 };
  const result = formula.perLine
    ? lines.reduce((sum, line) => sum + evaluate(formula.ast, { ...basket, ...line }), 0)
    : evaluate(formula.ast, { ...basket, ...empty });
  if (!Number.isFinite(result)) throw new FormulaError("The formula does not produce a number.");
  return result;
}

/** The ₱1,000.00, 10-item sale used for the live preview and for validation. */
export const FORMULA_SAMPLE: { basket: FormulaBasket; lines: FormulaLine[] } = {
  basket: { subtotal: 1000, itemCount: 10, vatBase: 1000 / 1.12, total: 1000 },
  lines: [
    { qty: 4, unitPrice: 100, lineTotal: 400 },
    { qty: 6, unitPrice: 100, lineTotal: 600 },
  ],
};

/** Returns an error message for an invalid formula, or null when it is valid. */
export function formulaError(source: string): string | null {
  try {
    evaluateFormula(parseFormula(source), FORMULA_SAMPLE.basket, FORMULA_SAMPLE.lines);
    return null;
  } catch (error) {
    if (error instanceof FormulaError) return error.message;
    throw error;
  }
}
