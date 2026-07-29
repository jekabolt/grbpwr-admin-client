import { common_Dictionary, common_Order } from 'api/proto-http/admin';
import { normalizeStatusName } from './order-status';
import { getOrderStatusName } from './utility';

/**
 * ordHead v2 — the counts strip.
 *
 * backend gap: there is no aggregate RPC for orders. `ListOrdersResponse` is
 * `{ orders: common_Order[] }` and nothing else — no `total`, no per-status counts,
 * no day revenue. Everything below is therefore derived from the pages the client has
 * actually fetched, and the strip must say so (the page renders a `Pill` carrying the
 * loaded-row count next to it). A real strip needs something like
 * `AdminService.GetOrderCounts(status[]) -> { status -> count, today: Money }`, or a
 * `total` on `ListOrdersResponse` at minimum, before any figure here can claim to
 * describe the whole table.
 */

const MONEY = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DAY_MS = 24 * 60 * 60 * 1000;

export type OrderStat = { value: string; sub: string };

export type OrderCounts = {
  /** Paid but not yet shipped — the fulfilment queue. */
  toFulfil: OrderStat;
  awaitingPayment: OrderStat;
  refundInProgress: OrderStat;
  today: OrderStat;
};

const EMPTY: OrderStat = { value: '—', sub: 'nothing loaded' };

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function parsedTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * Counts by resolved status name rather than by `orderStatusId` — the ids are
 * dictionary-assigned and not stable across environments, the names are.
 */
export function deriveOrderCounts(
  orders: common_Order[],
  dictionary: common_Dictionary | undefined,
): OrderCounts {
  if (!orders.length) {
    return { toFulfil: EMPTY, awaitingPayment: EMPTY, refundInProgress: EMPTY, today: EMPTY };
  }

  const dayStart = startOfToday();
  let toFulfil = 0;
  let awaitingPayment = 0;
  let refundInProgress = 0;
  let todayCount = 0;
  let todayTotal = 0;
  let oldestUnpaidMs: number | undefined;
  const todayCurrencies = new Set<string>();

  for (const order of orders) {
    const status = normalizeStatusName(getOrderStatusName(dictionary, order.orderStatusId));
    const placedAt = parsedTime(order.placed);

    if (status === 'CONFIRMED') toFulfil += 1;
    if (status === 'REFUND IN PROGRESS') refundInProgress += 1;
    if (status === 'AWAITING PAYMENT') {
      awaitingPayment += 1;
      if (placedAt !== undefined && (oldestUnpaidMs === undefined || placedAt < oldestUnpaidMs)) {
        oldestUnpaidMs = placedAt;
      }
    }

    if (placedAt !== undefined && placedAt >= dayStart) {
      todayCount += 1;
      const amount = Number(order.totalPrice?.value ?? '');
      if (Number.isFinite(amount)) todayTotal += amount;
      if (order.currency) todayCurrencies.add(order.currency);
    }
  }

  const oldestDays =
    oldestUnpaidMs === undefined ? undefined : Math.floor((Date.now() - oldestUnpaidMs) / DAY_MS);

  return {
    toFulfil: { value: String(toFulfil), sub: 'paid, unshipped' },
    awaitingPayment: {
      value: String(awaitingPayment),
      sub: oldestDays === undefined ? 'none waiting' : `oldest ${oldestDays}d`,
    },
    refundInProgress: {
      value: String(refundInProgress),
      sub: refundInProgress ? 'needs action' : 'clear',
    },
    today: buildTodayStat(todayCount, todayTotal, todayCurrencies),
  };
}

function buildTodayStat(count: number, total: number, currencies: Set<string>): OrderStat {
  if (!count) return { value: '—', sub: 'no orders yet' };
  const orders = `${count} order${count === 1 ? '' : 's'}`;
  // Summing across currencies would produce a number that means nothing. Say so
  // rather than printing a plausible-looking lie.
  if (currencies.size > 1) return { value: '—', sub: `mixed currencies · ${orders}` };
  const currency = [...currencies][0];
  return { value: MONEY.format(total), sub: currency ? `${currency} · ${orders}` : orders };
}
