/**
 * Exact fractions over bigint, so money math never meets floating point.
 * Only used inside the domain package; results are always rounded to whole
 * centavos before they leave it.
 */
export interface Fraction {
  num: bigint;
  den: bigint;
}

export function frac(num: bigint | number, den: bigint | number = 1n): Fraction {
  const n = BigInt(num);
  const d = BigInt(den);
  if (d === 0n) throw new RangeError("Division by zero");
  return d < 0n ? { num: -n, den: -d } : { num: n, den: d };
}

export function mul(a: Fraction, b: Fraction): Fraction {
  return frac(a.num * b.num, a.den * b.den);
}

export function div(a: Fraction, b: Fraction): Fraction {
  return frac(a.num * b.den, a.den * b.num);
}

export function add(a: Fraction, b: Fraction): Fraction {
  return frac(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Fraction, b: Fraction): Fraction {
  return frac(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function compare(a: Fraction, b: Fraction): number {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function min(a: Fraction, b: Fraction): Fraction {
  return compare(a, b) <= 0 ? a : b;
}

export function max(a: Fraction, b: Fraction): Fraction {
  return compare(a, b) >= 0 ? a : b;
}

/** Rounds half away from zero ("half-up" for the non-negative amounts we handle) to a whole number. */
export function roundHalfUp(value: Fraction): number {
  const { num, den } = value;
  const sign = num < 0n ? -1n : 1n;
  const abs = num < 0n ? -num : num;
  const rounded = (2n * abs + den) / (2n * den);
  return Number(sign * rounded);
}
