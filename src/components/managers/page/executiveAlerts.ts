import type { BusinessMetrics } from 'api/proto-http/admin';
import { formatPercent, getMetricComparison } from './utils';

export type ExecutiveAlertSeverity = 'high' | 'warning';

export type ExecutiveAlert = {
  severity: ExecutiveAlertSeverity;
  title: string;
  detail?: string;
  href?: string;
};

export type HealthStatus = 'needs_attention' | 'mixed' | 'on_track';

const REVENUE_DROP_ALERT_PCT = -20;
const ORDERS_DROP_ALERT_PCT = -20;
const SESSIONS_DROP_ALERT_PCT = -15;
const CONVERSION_DROP_ALERT_PCT = -15;
// Refund-rate spikes are measured in percentage POINTS (change_absolute), not as a
// "rate of a rate" — 5% → 8% is +3pp, which is what we alert on.
const REFUND_RATE_SPIKE_PP = 3;
const CANCELLATION_SHARE_ALERT = 15;
const REFUND_RATE_LEVEL_WARNING = 8;

// Volume floors: below these, a percentage swing is boutique noise (one big order, a
// handful of sessions), so we suppress the alert instead of crying wolf every week.
const MIN_ORDERS_FOR_ALERT = 10;
const MIN_SESSIONS_FOR_ALERT = 300;

function asMetricRecord(m: unknown): Record<string, unknown> | undefined {
  if (!m || typeof m !== 'object' || !('value' in m)) return undefined;
  return m as Record<string, unknown>;
}

/**
 * Current-period magnitude — the volume a rate/change alert must clear to be trusted.
 * Deliberately NOT max(current, compare): a strong PRIOR period must never license an alert
 * about a tiny CURRENT one. Prefers the backend `sample_size` when present (e.g. the order
 * count a refund rate was computed over).
 */
export function currentMetricValue(m: unknown): number {
  const c = getMetricComparison(asMetricRecord(m));
  return c.sampleSize ?? c.value;
}

/** Whether there are enough current-period orders for order-derived rates to be trusted. */
export function hasEnoughOrdersForAlert(metrics: BusinessMetrics | undefined): boolean {
  return currentMetricValue(metrics?.ordersCount) >= MIN_ORDERS_FOR_ALERT;
}

function effectiveChangePct(m: unknown): number | null {
  const r = getMetricComparison(asMetricRecord(m));
  const { value, compareValue, changePct: backendPct } = r;
  if (compareValue === undefined) return backendPct ?? null;
  if (compareValue === 0) {
    if (value === 0) return 0;
    return null;
  }
  return backendPct ?? ((value - compareValue) / compareValue) * 100;
}

export function orderCancellationSharePercent(metrics: BusinessMetrics | undefined): number | null {
  const rows = metrics?.ordersByStatus;
  if (!rows?.length) return null;
  let statusSum = 0;
  let cancelled = 0;
  for (const r of rows) {
    const c = r.count ?? 0;
    statusSum += c;
    const name = (r.statusName ?? '').toUpperCase();
    if (name.includes('CANCELLED')) cancelled += c;
  }
  // `ordersByStatus` counts status transitions (its sum exceeds the order count), so the share of
  // cancelled orders must be divided by the real order total, not by the sum of all status rows.
  const totalOrders = getMetricComparison(asMetricRecord(metrics?.ordersCount)).value;
  const denom = totalOrders > 0 ? totalOrders : statusSum;
  if (denom <= 0) return null;
  return Math.min(100, (cancelled / denom) * 100);
}

export function computeExecutiveAlerts(
  metrics: BusinessMetrics | undefined,
  compareEnabled: boolean,
  links: { revenue: string },
): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];
  if (!metrics) return alerts;

  // Gate order- and session-derived alerts behind current-period volume floors so single-order
  // or low-traffic weeks don't trigger red/amber on pure noise.
  const enoughOrders = currentMetricValue(metrics.ordersCount) >= MIN_ORDERS_FOR_ALERT;
  const enoughSessions = currentMetricValue(metrics.sessions) >= MIN_SESSIONS_FOR_ALERT;

  const cancelPct = orderCancellationSharePercent(metrics);
  if (enoughOrders && cancelPct != null && cancelPct >= CANCELLATION_SHARE_ALERT) {
    alerts.push({
      severity: 'high',
      title: `${cancelPct.toFixed(0)}% of orders this period are cancelled`,
      detail: 'See orders by status on Revenue & Sales.',
      href: links.revenue,
    });
  }

  const refundRec = asMetricRecord(metrics.refundRate);
  const refund = getMetricComparison(refundRec);
  if (enoughOrders && refund.value >= REFUND_RATE_LEVEL_WARNING) {
    alerts.push({
      severity: 'warning',
      title: `Refund rate is ${refund.value.toFixed(1)}% this period`,
    });
  }

  if (compareEnabled) {
    const revPct = effectiveChangePct(metrics.revenue);
    if (enoughOrders && revPct != null && revPct <= REVENUE_DROP_ALERT_PCT) {
      alerts.push({
        severity: 'warning',
        title: `Revenue ${formatPercent(revPct)} vs comparison period`,
      });
    }
    const ordPct = effectiveChangePct(metrics.ordersCount);
    if (enoughOrders && ordPct != null && ordPct <= ORDERS_DROP_ALERT_PCT) {
      alerts.push({
        severity: 'warning',
        title: `Orders ${formatPercent(ordPct)} vs comparison period`,
      });
    }
    const sessPct = effectiveChangePct(metrics.sessions);
    if (enoughSessions && sessPct != null && sessPct <= SESSIONS_DROP_ALERT_PCT) {
      alerts.push({
        severity: 'warning',
        title: `Sessions ${formatPercent(sessPct)} vs comparison period`,
      });
    }
    const convPct = effectiveChangePct(metrics.conversionRate);
    if (enoughSessions && convPct != null && convPct <= CONVERSION_DROP_ALERT_PCT) {
      alerts.push({
        severity: 'warning',
        title: `Conversion rate ${formatPercent(convPct)} vs comparison period`,
      });
    }
    // Percentage-point rise in refund rate (change_absolute), not a rate-of-rate percentage.
    const refundPp = refund.changeAbsolute;
    if (
      enoughOrders &&
      refund.lowerIsBetter &&
      refundPp != null &&
      refundPp > REFUND_RATE_SPIKE_PP
    ) {
      alerts.push({
        severity: 'warning',
        title: `Refund rate up ${refundPp.toFixed(1)}pp vs comparison period`,
      });
    }
  }

  alerts.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === 'high' ? -1 : 1;
  });
  return alerts;
}

export function deriveHealthStatus(
  alerts: ExecutiveAlert[],
  metrics: BusinessMetrics | undefined,
  compareEnabled: boolean,
): HealthStatus {
  if (alerts.some((a) => a.severity === 'high')) return 'needs_attention';

  if (
    compareEnabled &&
    metrics &&
    currentMetricValue(metrics.ordersCount) >= MIN_ORDERS_FOR_ALERT
  ) {
    const revPct = effectiveChangePct(metrics.revenue);
    const ordPct = effectiveChangePct(metrics.ordersCount);
    if (revPct != null && revPct <= -15 && ordPct != null && ordPct <= -15) {
      return 'needs_attention';
    }
  }

  if (alerts.some((a) => a.severity === 'warning')) return 'mixed';

  return 'on_track';
}
