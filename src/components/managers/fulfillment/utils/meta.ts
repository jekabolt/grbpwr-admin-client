import { FulfillmentColumn } from '../api/types';

// Display order + labels for the three fulfillment lanes. Each column is bound to
// a concrete order status, so the order is meaningful: work flows left → right.

export const COLUMNS: FulfillmentColumn[] = [
  'FULFILLMENT_COLUMN_TO_FULFILL',
  'FULFILLMENT_COLUMN_SHIPPED',
  'FULFILLMENT_COLUMN_DELIVERED',
];

export const COLUMN_LABEL: Record<FulfillmentColumn, string> = {
  FULFILLMENT_COLUMN_UNKNOWN: 'unknown',
  FULFILLMENT_COLUMN_TO_FULFILL: 'to fulfill',
  FULFILLMENT_COLUMN_SHIPPED: 'shipped',
  FULFILLMENT_COLUMN_DELIVERED: 'delivered',
};

// One-line hint under each column header, explaining what the lane means.
export const COLUMN_HINT: Record<FulfillmentColumn, string> = {
  FULFILLMENT_COLUMN_UNKNOWN: '',
  FULFILLMENT_COLUMN_TO_FULFILL: 'paid, awaiting shipment',
  FULFILLMENT_COLUMN_SHIPPED: 'in transit',
  FULFILLMENT_COLUMN_DELIVERED: 'recently completed',
};

// Teaching empty-state per lane (shown when the column has no cards).
export const COLUMN_EMPTY: Record<FulfillmentColumn, string> = {
  FULFILLMENT_COLUMN_UNKNOWN: 'empty',
  FULFILLMENT_COLUMN_TO_FULFILL: 'nothing to pack',
  FULFILLMENT_COLUMN_SHIPPED: 'nothing in transit',
  FULFILLMENT_COLUMN_DELIVERED: 'no recent deliveries',
};

// The single forward transition available from each column. Both call a real
// order transition (ship needs a tracking code + fires the shipped email);
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

// Cyrillic-safe two-letter avatar initials (matches the tasks board).
export function initials(username: string): string {
  return username.replace(/\s+/g, '').slice(0, 2).toUpperCase() || '?';
}
