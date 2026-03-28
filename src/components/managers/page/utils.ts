import type { CompareMode, TimeRange, TimeSeriesPoint, googletype_Decimal } from 'api/proto-http/admin';
import { differenceInCalendarDays, format, isValid, parseISO, subDays, subYears } from 'date-fns';
import type { MetricsPeriod } from './useMetricsQuery';

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

/**
 * Compare mean of first half vs second half of daily values (within the selected period).
 * Returns null if fewer than 4 finite points or baseline mean is non-positive.
 */
export function periodMomentumFromValues(values: number[]): 'accelerating' | 'softening' | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 4) return null;
  const mid = Math.floor(v.length / 2);
  const first = v.slice(0, mid);
  const second = v.slice(mid);
  const mFirst = first.reduce((s, x) => s + x, 0) / first.length;
  const mSecond = second.reduce((s, x) => s + x, 0) / second.length;
  if (mFirst <= 0) return null;
  const rel = (mSecond - mFirst) / mFirst;
  if (rel > 0.15) return 'accelerating';
  if (rel < -0.15) return 'softening';
  return null;
}

function parseWellKnownTimestamp(s: string | undefined): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

/** Human span for API `period` / `comparePeriod` (e.g. Jan 13–Jan 19, 2025). */
export function formatTimeRangeSpan(tr: TimeRange | undefined): string | null {
  const from = parseWellKnownTimestamp(tr?.from);
  const to = parseWellKnownTimestamp(tr?.to);
  if (!from || !to) return null;
  if (from.getTime() > to.getTime()) return null;
  const yf = from.getFullYear();
  const yt = to.getFullYear();
  if (yf === yt) {
    return `${format(from, 'MMM d')}–${format(to, 'MMM d, yyyy')}`;
  }
  return `${format(from, 'MMM d, yyyy')} – ${format(to, 'MMM d, yyyy')}`;
}

function formatCalendarRange(from: Date, to: Date): string {
  const yf = from.getFullYear();
  const yt = to.getFullYear();
  if (yf === yt) {
    return `${format(from, 'MMM d')}–${format(to, 'MMM d, yyyy')}`;
  }
  return `${format(from, 'MMM d, yyyy')} – ${format(to, 'MMM d, yyyy')}`;
}

function presetWindowDays(p: MetricsPeriod): number {
  if (p === '7d') return 7;
  if (p === '30d') return 30;
  if (p === '90d') return 90;
  return 7;
}

/** When API omits `period`, derive labels from the same presets as GetMetrics. */
export function fallbackCurrentPeriodLabel(
  period: MetricsPeriod,
  customFrom?: Date,
  customTo?: Date,
): string {
  const end = customTo ?? new Date();
  if (period === 'custom') {
    if (!customFrom || !customTo) return 'Custom range';
    return formatCalendarRange(customFrom, customTo);
  }
  const start = subDays(end, presetWindowDays(period) - 1);
  return formatCalendarRange(start, end);
}

export function fallbackComparePeriodLabel(
  period: MetricsPeriod,
  compareMode: CompareMode,
  customFrom?: Date,
  customTo?: Date,
): string | null {
  if (compareMode === 'COMPARE_MODE_NONE') return null;
  const end = period === 'custom' ? (customTo ?? new Date()) : new Date();
  const start =
    period === 'custom'
      ? (customFrom ?? subDays(end, 6))
      : subDays(end, presetWindowDays(period) - 1);
  const inclusiveDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
  if (compareMode === 'COMPARE_MODE_SAME_PERIOD_LAST_YEAR') {
    return formatCalendarRange(subYears(start, 1), subYears(end, 1));
  }
  const compareEnd = subDays(start, 1);
  const compareStart = subDays(compareEnd, inclusiveDays - 1);
  return formatCalendarRange(compareStart, compareEnd);
}

export function resolveAnalyticsPeriodLabels(
  apiPeriod: TimeRange | undefined,
  apiCompare: TimeRange | undefined,
  compareEnabled: boolean,
  compareMode: CompareMode,
  period: MetricsPeriod,
  customFrom?: Date,
  customTo?: Date,
): { current: string; compare: string | null } {
  const apiCur = formatTimeRangeSpan(apiPeriod);
  const apiComp = formatTimeRangeSpan(apiCompare);
  const compare =
    compareEnabled && compareMode !== 'COMPARE_MODE_NONE'
      ? apiComp ?? fallbackComparePeriodLabel(period, compareMode, customFrom, customTo)
      : null;
  if (apiCur) {
    return { current: apiCur, compare };
  }
  return {
    current: fallbackCurrentPeriodLabel(period, customFrom, customTo),
    compare,
  };
}

/** One-line hint under the compare dropdown (aligned with overview period copy). */
export function compareModeHintLine(
  compareMode: CompareMode,
  period: MetricsPeriod,
  customFrom?: Date,
  customTo?: Date,
): string | null {
  if (compareMode === 'COMPARE_MODE_NONE') return 'No baseline — card deltas are hidden.';
  const compare = fallbackComparePeriodLabel(period, compareMode, customFrom, customTo);
  if (!compare) return null;
  if (compareMode === 'COMPARE_MODE_SAME_PERIOD_LAST_YEAR') {
    return `Baseline ≈ ${compare} (same calendar span, prior year — estimate).`;
  }
  return `Baseline ≈ ${compare} (same length, immediately before current window — estimate).`;
}

/** GA4 event names → readable step labels for journey paths (e.g. view_item → add_to_cart). */
const GA4_EVENT_STEP_LABELS: Record<string, string> = {
  page_view: 'Viewed page',
  view_item: 'Viewed product',
  view_item_list: 'Browsed the catalogue',
  select_item: 'Clicked on a product',
  add_to_cart: 'Added to cart',
  remove_from_cart: 'Removed from cart',
  view_cart: 'Viewed cart',
  begin_checkout: 'Started checkout',
  add_shipping_info: 'Added shipping info',
  add_payment_info: 'Added payment info',
  purchase: 'Purchased',
  search: 'Searched',
  scroll: 'Scrolled',
  user_engagement: 'Engaged',
  session_start: 'Visitors',
  first_visit: 'First visit',
  click: 'Clicked',
  generate_lead: 'Submitted lead',
  sign_up: 'Signed up',
  login: 'Logged in',
};

function titleCaseEventToken(token: string): string {
  const t = token.trim();
  if (!t) return t;
  const snake = t.replace(/\s+/g, '_').toLowerCase();
  return GA4_EVENT_STEP_LABELS[snake] ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Turns API journey strings like `view_item -> add_to_cart` into readable steps. */
export function humanizeGa4JourneyPath(path: string | undefined): string {
  if (path == null || path === '') return '';
  const raw = path.trim();
  if (raw === 'unknown') return 'Unknown';
  const segments = raw.split(/\s*(?:->|→)\s*/).filter(Boolean);
  if (segments.length === 0) return raw;
  return segments.map((s) => titleCaseEventToken(s)).join(' → ');
}
