import type { TimeSeriesPoint, googletype_Decimal } from 'api/proto-http/admin';

/** Get time series data with snake_case fallback (backend may return orders_by_day) */
export function getTimeSeries(
  metrics: Record<string, unknown> | undefined,
  camelKey: string,
): TimeSeriesPoint[] | undefined {
  if (!metrics) return undefined;
  const snakeKey = camelKey.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  return (metrics[camelKey] ?? metrics[snakeKey]) as TimeSeriesPoint[] | undefined;
}

export function parseDecimal(d: googletype_Decimal | undefined): number {
  if (!d?.value) return 0;
  return parseFloat(d.value);
}

/** MetricWithComparison from API - backend may return snake_case (compare_value, change_pct, lower_is_better, change_absolute) */
export function getMetricComparison(m: Record<string, unknown> | undefined) {
  if (!m) return { value: 0, compareValue: undefined, changePct: undefined, lowerIsBetter: false, changeAbsolute: undefined, caveat: undefined };
  const value = parseDecimal(m.value as googletype_Decimal);
  const compareValueRaw = m.compareValue ?? m.compare_value;
  const compareValue =
    compareValueRaw != null ? parseDecimal(compareValueRaw as googletype_Decimal) : undefined;
  const changePct = (m.changePct ?? m.change_pct) as number | undefined;
  const lowerIsBetter = (m.lowerIsBetter ?? m.lower_is_better) === true;
  const changeAbsolute = (m.changeAbsolute ?? m.change_absolute) as number | undefined;
  const caveat = (m.caveat) as string | undefined;
  return { value, compareValue, changePct, lowerIsBetter, changeAbsolute, caveat };
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

/** True when we show "Same day" or "< 1 day" instead of a numeric day count. */
export function isAvgDaysBetweenOrdersNearZeroDisplay(value: number): boolean {
  return value === 0 || (value > 0 && Math.round(value * 10) / 10 === 0);
}

/**
 * Avg gap between consecutive orders. Exact 0 means same calendar day; tiny positives
 * still round to "0.0" with one decimal — show a human label instead.
 */
export function formatAvgDaysBetweenOrders(value: number): string {
  if (value === 0) return 'Same day';
  if (value > 0 && Math.round(value * 10) / 10 === 0) return '< 1 day';
  return formatNumber(value, 1);
}

/** Backend sentinel when there were zero sales in the period (effectively infinite days on hand). */
export const DAYS_ON_HAND_NO_SALES_SENTINEL = 99999;

export function formatDaysOnHand(days: number | undefined): string {
  const d = days ?? 0;
  if (d >= DAYS_ON_HAND_NO_SALES_SENTINEL) return 'No sales';
  return d.toFixed(0);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

/**
 * Admin API rates such as `cartRate`, `avgCartRate`, and `globalCartRate` are 0–1 fractions.
 * Use this for display on a 0–100 percentage scale. If the backend contract changes, update here only.
 */
export function toPercentage(fraction: number): number {
  return fraction * 100;
}

/** Normalize non-negative shares so they sum to 100 (stable stacked % bars). */
export function normalizeSharesTo100(values: number[]): number[] {
  const sum = values.reduce((a, x) => a + (Number.isFinite(x) && x > 0 ? x : 0), 0);
  if (sum <= 0) return values.map(() => 0);
  return values.map((x) => ((Number.isFinite(x) && x > 0 ? x : 0) / sum) * 100);
}
