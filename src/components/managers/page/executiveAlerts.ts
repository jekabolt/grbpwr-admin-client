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

const NARRATIVE_PCT_THRESHOLD = 3;

const REVENUE_DROP_ALERT_PCT = -20;
const ORDERS_DROP_ALERT_PCT = -20;
const SESSIONS_DROP_ALERT_PCT = -15;
const CONVERSION_DROP_ALERT_PCT = -15;
const REFUND_RATE_SPIKE_CHANGE_PCT = 12;
const CANCELLATION_SHARE_ALERT = 15;
const REFUND_RATE_LEVEL_WARNING = 8;

function asMetricRecord(m: unknown): Record<string, unknown> | undefined {
  if (!m || typeof m !== 'object' || !('value' in m)) return undefined;
  return m as Record<string, unknown>;
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

function isHeadwind(changePct: number, lowerIsBetter: boolean): boolean {
  if (lowerIsBetter) return changePct > NARRATIVE_PCT_THRESHOLD;
  return changePct < -NARRATIVE_PCT_THRESHOLD;
}

function isTailwind(changePct: number, lowerIsBetter: boolean): boolean {
  if (lowerIsBetter) return changePct < -NARRATIVE_PCT_THRESHOLD;
  return changePct > NARRATIVE_PCT_THRESHOLD;
}

export function orderCancellationSharePercent(metrics: BusinessMetrics | undefined): number | null {
  const rows = metrics?.ordersByStatus;
  if (!rows?.length) return null;
  let total = 0;
  let cancelled = 0;
  for (const r of rows) {
    const c = r.count ?? 0;
    total += c;
    const name = (r.statusName ?? '').toUpperCase();
    if (name.includes('CANCELLED')) cancelled += c;
  }
  if (total <= 0) return null;
  return (cancelled / total) * 100;
}

export function computeExecutiveAlerts(
  metrics: BusinessMetrics | undefined,
  compareEnabled: boolean,
  links: { revenue: string },
): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];
  if (!metrics) return alerts;

  const cancelPct = orderCancellationSharePercent(metrics);
  if (cancelPct != null && cancelPct >= CANCELLATION_SHARE_ALERT) {
    alerts.push({
      severity: 'high',
      title: `${cancelPct.toFixed(0)}% of orders this period are cancelled`,
      detail: 'See orders by status on Revenue & Sales.',
      href: links.revenue,
    });
  }

  const refundRec = asMetricRecord(metrics.refundRate);
  const refund = getMetricComparison(refundRec);
  if (refund.value >= REFUND_RATE_LEVEL_WARNING) {
    alerts.push({
      severity: 'warning',
      title: `Refund rate is ${refund.value.toFixed(1)}% this period`,
    });
  }

  if (compareEnabled) {
    const revPct = effectiveChangePct(metrics.revenue);
    if (revPct != null && revPct <= REVENUE_DROP_ALERT_PCT) {
      alerts.push({
        severity: 'warning',
        title: `Revenue ${formatPercent(revPct)} vs comparison period`,
      });
    }
    const ordPct = effectiveChangePct(metrics.ordersCount);
    if (ordPct != null && ordPct <= ORDERS_DROP_ALERT_PCT) {
      alerts.push({
        severity: 'warning',
        title: `Orders ${formatPercent(ordPct)} vs comparison period`,
      });
    }
    const sessPct = effectiveChangePct(metrics.sessions);
    if (sessPct != null && sessPct <= SESSIONS_DROP_ALERT_PCT) {
      alerts.push({
        severity: 'warning',
        title: `Sessions ${formatPercent(sessPct)} vs comparison period`,
      });
    }
    const convPct = effectiveChangePct(metrics.conversionRate);
    if (convPct != null && convPct <= CONVERSION_DROP_ALERT_PCT) {
      alerts.push({
        severity: 'warning',
        title: `Conversion rate ${formatPercent(convPct)} vs comparison period`,
      });
    }
    const refundCh = effectiveChangePct(metrics.refundRate);
    const refundLower = refundRec ? getMetricComparison(refundRec).lowerIsBetter : true;
    if (
      refundCh != null &&
      refundLower &&
      refundCh > REFUND_RATE_SPIKE_CHANGE_PCT
    ) {
      alerts.push({
        severity: 'warning',
        title: `Refund rate up ${formatPercent(refundCh)} vs comparison period`,
      });
    }
  }

  alerts.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === 'high' ? -1 : 1;
  });
  return alerts;
}

export function computeNorthStarBullets(
  metrics: BusinessMetrics | undefined,
  compareEnabled: boolean,
): { headwinds: string[]; tailwinds: string[]; operational: string[] } {
  const headwinds: string[] = [];
  const tailwinds: string[] = [];
  const operational: string[] = [];
  if (!metrics) return { headwinds, tailwinds, operational };

  const cancelPct = orderCancellationSharePercent(metrics);
  if (cancelPct != null && cancelPct > 0) {
    operational.push(`${cancelPct.toFixed(1)}% of orders cancelled this period`);
  }

  const refundVal = getMetricComparison(asMetricRecord(metrics.refundRate)).value;
  if (refundVal >= 5) {
    operational.push(`Refund rate ${refundVal.toFixed(1)}% of orders`);
  }

  if (!compareEnabled) {
    return { headwinds, tailwinds, operational };
  }

  const pushIf = (
    label: string,
    m: unknown,
    lowerIsBetter: boolean,
    fmt: (pct: number) => string = (p) => formatPercent(p),
  ) => {
    const pct = effectiveChangePct(m);
    if (pct == null) return;
    if (isHeadwind(pct, lowerIsBetter)) headwinds.push(`${label} ${fmt(pct)} vs comparison`);
    else if (isTailwind(pct, lowerIsBetter)) tailwinds.push(`${label} ${fmt(pct)} vs comparison`);
  };

  pushIf('Revenue', metrics.revenue, false);
  pushIf('Orders', metrics.ordersCount, false);
  pushIf('Avg order value', metrics.avgOrderValue, false);
  pushIf('Sessions', metrics.sessions, false);
  pushIf('Conversion rate', metrics.conversionRate, false);
  pushIf('New users', metrics.newUsers, false);
  pushIf('Bounce rate', metrics.bounceRate, true);

  const oPct = effectiveChangePct(metrics.ordersCount);
  const aPct = effectiveChangePct(metrics.avgOrderValue);
  if (oPct != null && aPct != null && oPct < -3 && aPct > 1) {
    const ho = headwinds.findIndex((h) => h.startsWith('Orders '));
    if (ho >= 0) headwinds.splice(ho, 1);
    const ta = tailwinds.findIndex((t) => t.startsWith('Avg order value'));
    if (ta >= 0) tailwinds.splice(ta, 1);
    tailwinds.push('Fewer orders, higher AOV — larger baskets vs comparison');
  }

  return { headwinds, tailwinds, operational };
}

export function deriveHealthStatus(
  alerts: ExecutiveAlert[],
  metrics: BusinessMetrics | undefined,
  compareEnabled: boolean,
): HealthStatus {
  if (alerts.some((a) => a.severity === 'high')) return 'needs_attention';

  if (compareEnabled && metrics) {
    const revPct = effectiveChangePct(metrics.revenue);
    const ordPct = effectiveChangePct(metrics.ordersCount);
    if (
      revPct != null &&
      revPct <= -15 &&
      ordPct != null &&
      ordPct <= -15
    ) {
      return 'needs_attention';
    }
  }

  if (alerts.some((a) => a.severity === 'warning')) return 'mixed';

  if (compareEnabled && metrics) {
    const { headwinds, tailwinds } = computeNorthStarBullets(metrics, compareEnabled);
    if (headwinds.length > 0 && tailwinds.length > 0) return 'mixed';
    if (headwinds.length > 0) return 'mixed';
  }

  return 'on_track';
}
