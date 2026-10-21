type DecimalLike = { value?: string } | null | undefined;

export function decimalText(value: DecimalLike): string {
  return value?.value?.trim() ?? '';
}

export function decimalNumber(value: DecimalLike): number | undefined {
  const parsed = Number(decimalText(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function enumLabel(value: string | undefined, prefix: string): string {
  if (!value || value.endsWith('_UNKNOWN')) return '';
  return value.replace(prefix, '').toLowerCase().replaceAll('_', ' ');
}

export function shortDate(value: string | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

export function alphaLabel(index: number): string {
  let current = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (current % 26)) + out;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return out;
}
