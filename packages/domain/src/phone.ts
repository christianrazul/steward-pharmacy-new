/**
 * Philippine contact numbers. Stored normalized as digits starting with 0:
 * mobile 09XXXXXXXXX (11 digits), landline with area code, e.g. 0822345678 or
 * 0212345678 (10 digits). Accepts spaces, dashes, dots, parentheses and +63.
 */
export function normalizePhPhone(input: string): string | null {
  let digits = input.replace(/[\s().-]/g, "");
  if (digits.startsWith("+63")) digits = `0${digits.slice(3)}`;
  else if (/^63\d{9,10}$/.test(digits)) digits = `0${digits.slice(2)}`;
  if (!/^\d+$/.test(digits)) return null;
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^0[2-8]\d{8}$/.test(digits)) return digits;
  return null;
}

export function isValidPhPhone(input: string): boolean {
  return normalizePhPhone(input) !== null;
}

/** "09171234567" → "0917 123 4567"; "0822345678" → "(082) 234 5678"; "0212345678" → "(02) 1234 5678". */
export function formatPhPhone(normalized: string): string {
  if (/^09\d{9}$/.test(normalized)) {
    return `${normalized.slice(0, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7)}`;
  }
  if (/^02\d{8}$/.test(normalized)) {
    return `(02) ${normalized.slice(2, 6)} ${normalized.slice(6)}`;
  }
  if (/^0[3-8]\d{8}$/.test(normalized)) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)} ${normalized.slice(6)}`;
  }
  return normalized;
}
