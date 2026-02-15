import type { googletype_Decimal } from 'api/proto-http/admin';

export function parseDecimal(d: googletype_Decimal | undefined): number {
  if (!d?.value) return 0;
  return parseFloat(d.value);
}

/** MetricWithComparison from API - backend may return snake_case (compare_value, change_pct) */
export function getMetricComparison(m: Record<string, unknown> | undefined) {
  if (!m) return { value: 0, compareValue: undefined, changePct: undefined };
  const value = parseDecimal(m.value as googletype_Decimal);
  const compareValueRaw = m.compareValue ?? m.compare_value;
  const compareValue =
    compareValueRaw != null ? parseDecimal(compareValueRaw as googletype_Decimal) : undefined;
  const changePct = (m.changePct ?? m.change_pct) as number | undefined;
  return { value, compareValue, changePct };
}

export function formatCurrency(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}
