// UI-facing view model for the orders-fulfillment board. Mirrors the generated
// client (api/proto-http/admin: common_Fulfillment* @ proto 5391a3a) but with
// required, defaulted fields so components stay clean. The adapter in
// fulfillmentService.ts maps between the two.
//
// The board is a KANBAN PROJECTION of real orders, not a copy: each column is
// bound 1:1 to a concrete order status, so orders stay the single source of
// truth for fulfillment state. The only board-owned data is a lightweight
// annotation (assignee / notes / packing checklist) overlaid on an order by its
// uuid. Moving a card forward performs the real order transition
// (ShipFulfillmentOrder / MarkFulfillmentDelivered), never a duplicated status.

export type FulfillmentColumn =
  | 'FULFILLMENT_COLUMN_UNKNOWN'
  | 'FULFILLMENT_COLUMN_TO_FULFILL' // order status CONFIRMED (paid, not yet shipped)
  | 'FULFILLMENT_COLUMN_SHIPPED'
  | 'FULFILLMENT_COLUMN_DELIVERED';

// One packing-checklist row on an order's annotation.
export interface FulfillmentChecklistItem {
  id: number;
  content: string;
  isDone: boolean;
  position: number;
}

// The board-owned overlay on an order (assignee / notes / checklist). Carries no
// order status — that lives on the order. Lazily created on first edit.
export interface FulfillmentAnnotation {
  orderUuid: string;
  assignee: string; // AdminAccount.username; '' = unassigned
  notes: string;
  checklist: FulfillmentChecklistItem[];
}

// One tile on the board: compact order + annotation summary.
export interface FulfillmentCard {
  orderUuid: string;
  orderId: number;
  placed: string; // RFC3339
  total: string; // decimal value string, e.g. "42.50"
  currency: string;
  column: FulfillmentColumn;
  assignee: string;
  checklistDone: number;
  checklistTotal: number;
  hasNotes: boolean;
}

// One column of the board, cards in fulfillment order (oldest order first).
export interface FulfillmentColumnCards {
  column: FulfillmentColumn;
  cards: FulfillmentCard[];
}

export function emptyAnnotation(orderUuid: string): FulfillmentAnnotation {
  return { orderUuid, assignee: '', notes: '', checklist: [] };
}
