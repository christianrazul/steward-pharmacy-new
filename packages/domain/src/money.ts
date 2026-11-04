/**
 * Money is always an integer number of centavos (1 peso = 100 centavos).
 * Never store or pass pesos as floating point numbers.
 */
export type Centavos = number;

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function isCentavos(value: unknown): value is Centavos {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertCentavos(value: number, label = "amount"): asserts value is Centavos {
  if (!isCentavos(value)) {
    throw new RangeError(`${label} must be a whole number of centavos, got ${String(value)}`);
  }
}

/** 123456 → "₱1,234.56". Negative amounts render as "-₱1,234.56". */
export function formatPeso(centavos: Centavos): string {
  assertCentavos(centavos);
  // Format the peso and centavo parts as integers so no float ever reaches the formatter.
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const pesos = Math.trunc(abs / 100);
  const cents = abs % 100;
  const formattedPesos = pesoFormatter.format(pesos).replace(/\.00$/, "");
  return `${sign}${formattedPesos}.${String(cents).padStart(2, "0")}`;
}

const PESO_INPUT = /^(-)?(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{0,2}))?$/;

/**
 * Parses what a person typed as pesos ("1,234.5", "₱ 20", "0.75") into centavos
 * without floating point. Returns null when the text is not a valid amount
 * or has more than two decimal places.
 */
export function parsePesoInput(input: string): Centavos | null {
  const cleaned = input.replace(/[₱\s]/g, "");
  const match = PESO_INPUT.exec(cleaned);
  if (!match) return null;
  const [, minus, wholePart, fractionPart] = match;
  if (wholePart === undefined && (fractionPart === undefined || fractionPart === "")) return null;

  const whole = Number((wholePart ?? "0").replaceAll(",", ""));
  const fraction = Number((fractionPart ?? "").padEnd(2, "0"));
  const centavos = whole * 100 + fraction;
  if (!Number.isSafeInteger(centavos)) return null;
  return minus && centavos !== 0 ? -centavos : centavos;
}

export function sumCentavos(amounts: readonly Centavos[]): Centavos {
  let total = 0;
  for (const amount of amounts) {
    assertCentavos(amount);
    total += amount;
  }
  assertCentavos(total, "total");
  return total;
}
