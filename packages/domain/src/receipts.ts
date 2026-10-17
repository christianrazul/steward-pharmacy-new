/**
 * Receipt numbers: {prefix}-{branch code}-{device series}-{6-digit sequence},
 * for example OR-NCC-01-000123. Web sales use series W. Sequences are gapless
 * per device (or per branch for web) and never reused.
 */
export const WEB_RECEIPT_SERIES = "W";

export interface ReceiptNumberParts {
  prefix: string;
  branchCode: string;
  series: string;
  sequence: number;
}

export function formatReceiptNo({
  prefix,
  branchCode,
  series,
  sequence,
}: ReceiptNumberParts): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999_999) {
    throw new RangeError("Receipt sequence must be between 1 and 999999");
  }
  return `${prefix.toUpperCase()}-${branchCode.toUpperCase()}-${series.toUpperCase()}-${String(sequence).padStart(6, "0")}`;
}

const RECEIPT_PATTERN = /^([A-Z0-9-]{1,6})-([A-Z0-9]{2,4})-([A-Z0-9]{1,2})-(\d{6})$/;

export function parseReceiptNo(receiptNo: string): ReceiptNumberParts | null {
  const match = RECEIPT_PATTERN.exec(receiptNo);
  if (!match) return null;
  const [, prefix = "", branchCode = "", series = "", sequence = "0"] = match;
  return { prefix, branchCode, series, sequence: Number(sequence) };
}
