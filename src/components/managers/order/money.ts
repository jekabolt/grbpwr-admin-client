import type { googletype_Decimal } from 'api/proto-http/admin';

/** Decimals arrive as strings on the wire; an unparseable one is 0, never NaN on screen. */
export function toNum(value?: string | null): number {
  const n = parseFloat(value ?? '');
  return Number.isNaN(n) ? 0 : n;
}

export function decimalToNum(d?: googletype_Decimal): number {
  return toNum(d?.value);
}

/** Two decimals plus the currency code. Currency is optional so it composes inside a column. */
export function money(n: number, currency?: string): string {
  return `${n.toFixed(2)}${currency ? ` ${currency}` : ''}`;
}

/** True when the decimal carries an actual figure (as opposed to being unset). */
export function hasValue(d?: googletype_Decimal): boolean {
  return d?.value != null && d.value !== '';
}
