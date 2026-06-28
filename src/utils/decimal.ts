import { googletype_Decimal } from 'api/proto-http/admin';

// google.type.Decimal is a string-valued number/money on the wire: { value: "42.50" }.
// Forms edit decimals as plain strings; convert only at the schema boundary.

export function decimalToInput(d?: googletype_Decimal): string {
  return d?.value ?? '';
}

// Empty/blank → undefined so the field is omitted (treated as unset by the backend).
// We do not validate the numeric format here — the backend normalizes and rejects.
export function inputToDecimal(value?: string): googletype_Decimal | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  return { value: v };
}

// Sanitize free-typed input into a decimal string: digits + a single dot + at most
// `maxDecimals` fractional digits. Strips letters/symbols and any extra dots. Used by
// DecimalField so numeric fields (width, weight, price, consumption, wastage…) cannot
// accept garbage like letters. Empty stays empty (the field is optional).
export function sanitizeDecimal(raw: string, maxDecimals = 3): string {
  let v = raw.replace(/[^0-9.]/g, ''); // digits + dots only
  const firstDot = v.indexOf('.');
  if (firstDot === -1) return v;
  // keep the first dot, drop the rest, then clamp the fractional length
  const intPart = v.slice(0, firstDot);
  const decPart = v.slice(firstDot + 1).replace(/\./g, '');
  return `${intPart}.${decPart.slice(0, maxDecimals)}`;
}

// Best-effort client-side preview of a decimal product (e.g. qty × price). Returns ''
// when either operand is missing or non-numeric — the authoritative value is computed
// server-side (output-only fields like bom line_total).
export function multiplyDecimalInputs(a?: string, b?: string): string {
  const x = Number(a);
  const y = Number(b);
  if (!a?.trim() || !b?.trim() || Number.isNaN(x) || Number.isNaN(y)) return '';
  const result = x * y;
  return Number.isFinite(result) ? String(Number(result.toFixed(4))) : '';
}
