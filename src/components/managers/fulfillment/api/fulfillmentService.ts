import { adminService } from 'api/api';
import type {
  common_FulfillmentAnnotation,
  common_FulfillmentCard,
  common_FulfillmentChecklistItem,
  common_FulfillmentColumnCards,
  common_OrderFull,
  common_OrderStripeDetails,
} from 'api/proto-http/admin';
import {
  FulfillmentAnnotation,
  FulfillmentCard,
  FulfillmentChecklistItem,
  FulfillmentColumnCards,
} from './types';

// fulfillmentService is the single seam between the fulfillment UI and the
// backend. Its methods mirror the AdminService ORDER FULFILLMENT RPCs 1:1 (proto
// 5391a3a), so the feature stays backend-shape-agnostic. It maps the all-optional
// generated types to the required, defaulted UI view model in ./types.
//
// getCard keeps the order as the raw common_OrderFull so the detail page can
// reuse the existing order-display components (Buyer, OrderTable, …) unchanged.
export interface FulfillmentService {
  getBoard(deliveredLimit?: number): Promise<FulfillmentColumnCards[]>;
  getCard(orderUuid: string): Promise<{
    order: common_OrderFull | undefined;
    annotation: FulfillmentAnnotation;
    stripeDetails: common_OrderStripeDetails | undefined;
  }>;
  setAssignee(orderUuid: string, assignee: string): Promise<void>;
  setNotes(orderUuid: string, notes: string): Promise<void>;
  addChecklistItem(orderUuid: string, content: string): Promise<{ id: number }>;
  setChecklistItemDone(id: number, isDone: boolean): Promise<void>;
  deleteChecklistItem(id: number): Promise<void>;
  ship(orderUuid: string, trackingCode: string): Promise<void>;
  markDelivered(orderUuid: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Generated → UI mapping
// ---------------------------------------------------------------------------
function mapCard(c: common_FulfillmentCard): FulfillmentCard {
  return {
    orderUuid: c.order?.uuid ?? '',
    orderId: c.order?.id ?? 0,
    placed: c.order?.placed ?? '',
    total: c.order?.totalPrice?.value ?? '',
    currency: c.order?.currency ?? '',
    column: c.column ?? 'FULFILLMENT_COLUMN_UNKNOWN',
    assignee: c.assignee ?? '',
    checklistDone: c.checklistDone ?? 0,
    checklistTotal: c.checklistTotal ?? 0,
    hasNotes: c.hasNotes ?? false,
  };
}

function mapColumn(col: common_FulfillmentColumnCards): FulfillmentColumnCards {
  return {
    column: col.column ?? 'FULFILLMENT_COLUMN_UNKNOWN',
    cards: (col.cards ?? []).map(mapCard),
  };
}

function mapChecklistItem(c: common_FulfillmentChecklistItem): FulfillmentChecklistItem {
  return {
    id: c.id ?? 0,
    content: c.content ?? '',
    isDone: c.isDone ?? false,
    position: c.position ?? 0,
  };
}

function mapAnnotation(
  orderUuid: string,
  a: common_FulfillmentAnnotation | undefined,
): FulfillmentAnnotation {
  return {
    orderUuid: a?.orderUuid ?? orderUuid,
    assignee: a?.assignee ?? '',
    notes: a?.notes ?? '',
    checklist: (a?.checklist ?? []).map(mapChecklistItem).sort((x, y) => x.position - y.position),
  };
}

// ---------------------------------------------------------------------------
// Live backend adapter — thin, typed wrappers over the generated AdminService.
// ---------------------------------------------------------------------------
export const fulfillmentService: FulfillmentService = {
  getBoard: (deliveredLimit) =>
    adminService
      .GetFulfillmentBoard({ deliveredLimit })
      .then((r) => (r.columns ?? []).map(mapColumn)),

  getCard: (orderUuid) =>
    adminService.GetFulfillmentCard({ orderUuid }).then((r) => ({
      order: r.order,
      annotation: mapAnnotation(orderUuid, r.annotation),
      stripeDetails: r.stripeDetails,
    })),

  setAssignee: (orderUuid, assignee) =>
    adminService.SetFulfillmentAssignee({ orderUuid, assignee }).then(() => undefined),

  setNotes: (orderUuid, notes) =>
    adminService.SetFulfillmentNotes({ orderUuid, notes }).then(() => undefined),

  addChecklistItem: (orderUuid, content) =>
    adminService
      .AddFulfillmentChecklistItem({ orderUuid, content })
      .then((r) => ({ id: r.id ?? 0 })),

  setChecklistItemDone: (id, isDone) =>
    adminService.SetFulfillmentChecklistItemDone({ id, isDone }).then(() => undefined),

  deleteChecklistItem: (id) =>
    adminService.DeleteFulfillmentChecklistItem({ id }).then(() => undefined),

  ship: (orderUuid, trackingCode) =>
    adminService.ShipFulfillmentOrder({ orderUuid, trackingCode }).then(() => undefined),

  markDelivered: (orderUuid) =>
    adminService.MarkFulfillmentDelivered({ orderUuid }).then(() => undefined),
};
