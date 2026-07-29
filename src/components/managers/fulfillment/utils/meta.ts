import { FulfillmentColumn } from '../api/types';

// ffBoard v3 — the three status lanes are the same order-bound projection as before
// (work flows left → right), but re-weighted: TO_FULFILL is the focus (a wide
// to-pack queue) and SHIPPED / DELIVERED are two narrow side lists beside it. Each
// column is still bound 1:1 to a concrete order status, so moving a card forward is
// a real order transition, never a free drag.

export const COLUMNS: FulfillmentColumn[] = [
  'FULFILLMENT_COLUMN_TO_FULFILL',
  'FULFILLMENT_COLUMN_SHIPPED',
  'FULFILLMENT_COLUMN_DELIVERED',
];

// The focus lane (wide) vs the two side lists (narrow).
export const PRIMARY_COLUMN: FulfillmentColumn = 'FULFILLMENT_COLUMN_TO_FULFILL';
export const SIDE_COLUMNS: FulfillmentColumn[] = [
  'FULFILLMENT_COLUMN_SHIPPED',
  'FULFILLMENT_COLUMN_DELIVERED',
];

// BoardColumn widths — the primary queue gets roughly twice a side list so the
// to-pack work reads as the job and shipped/delivered as reference.
export const PRIMARY_WIDTH = 496;
export const SIDE_WIDTH = 288;

export const COLUMN_LABEL: Record<FulfillmentColumn, string> = {
  FULFILLMENT_COLUMN_UNKNOWN: 'unknown',
  FULFILLMENT_COLUMN_TO_FULFILL: 'to pack',
  FULFILLMENT_COLUMN_SHIPPED: 'in transit',
  FULFILLMENT_COLUMN_DELIVERED: 'delivered',
};

// One-line hint under each column, explaining what the lane means.
export const COLUMN_HINT: Record<FulfillmentColumn, string> = {
  FULFILLMENT_COLUMN_UNKNOWN: '',
  FULFILLMENT_COLUMN_TO_FULFILL: 'paid, awaiting shipment — oldest first',
  FULFILLMENT_COLUMN_SHIPPED: 'shipped, not yet delivered',
  FULFILLMENT_COLUMN_DELIVERED: 'recently completed',
};

// Teaching empty-state per lane (shown when the column has no cards).
export const COLUMN_EMPTY: Record<FulfillmentColumn, string> = {
  FULFILLMENT_COLUMN_UNKNOWN: 'empty',
  FULFILLMENT_COLUMN_TO_FULFILL: 'nothing to pack — inbox zero',
  FULFILLMENT_COLUMN_SHIPPED: 'nothing in transit',
  FULFILLMENT_COLUMN_DELIVERED: 'no recent deliveries',
};

// The single forward transition available from each column. Both call a real
// order transition (ship needs a tracking code / label + fires the shipped email);
// delivered is terminal, so it has no action.
export type ColumnAction = 'ship' | 'deliver' | null;

export const COLUMN_ACTION: Record<FulfillmentColumn, ColumnAction> = {
  FULFILLMENT_COLUMN_UNKNOWN: null,
  FULFILLMENT_COLUMN_TO_FULFILL: 'ship',
  FULFILLMENT_COLUMN_SHIPPED: 'deliver',
  FULFILLMENT_COLUMN_DELIVERED: null,
};

// The card-detail RPC returns the full order but not the column, so derive the
// lane from the resolved order-status name (getOrderStatusName strips the enum
// prefix, e.g. "CONFIRMED" / "SHIPPED" / "DELIVERED").
export function columnFromStatusName(name: string | undefined): FulfillmentColumn {
  switch ((name ?? '').toUpperCase().trim()) {
    case 'CONFIRMED':
      return 'FULFILLMENT_COLUMN_TO_FULFILL';
    case 'SHIPPED':
      return 'FULFILLMENT_COLUMN_SHIPPED';
    case 'DELIVERED':
      return 'FULFILLMENT_COLUMN_DELIVERED';
    default:
      return 'FULFILLMENT_COLUMN_UNKNOWN';
  }
}

// Money the same way the rest of the orders domain renders it: raw value + code.
export function formatMoney(value: string | undefined, currency: string | undefined): string {
  const v = value?.trim();
  return v ? `${v} ${currency ?? ''}`.trim() : '—';
}

// ffKpi v2 — "overdue" means a paid order has been sitting in the to-pack queue
// longer than this many days. There is no SLA on the backend, so the threshold is
// a client-side convention and the KPI label states it out loud (aged > Nd).
export const AGING_DAYS = 3;

// Whole days since the order was placed (its age in the to-pack queue). Returns 0
// for an unparseable / missing timestamp so a bad date never reads as overdue.
export function cardAgeDays(placed: string | undefined): number {
  if (!placed) return 0;
  const t = new Date(placed).getTime();
  if (!Number.isFinite(t)) return 0;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  return days > 0 ? days : 0;
}

export function isOverdue(placed: string | undefined): boolean {
  return cardAgeDays(placed) > AGING_DAYS;
}
