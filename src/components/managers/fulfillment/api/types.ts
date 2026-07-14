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

// ---------------------------------------------------------------------------
// Shipping labels (Sendcloud) — proto beefb0e
// ---------------------------------------------------------------------------

// The physical parcel a label is generated for. Weight in grams; dimensions in
// whole centimetres (0 = unknown, omitted from the label).
export interface ShippingParcel {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  boxType: string; // carrier box type; '' => "custom"
}

export function emptyParcel(): ShippingParcel {
  return { weightGrams: 0, lengthCm: 0, widthCm: 0, heightCm: 0, boxType: '' };
}

// PrepareShippingLabel result — everything the label form needs to pre-fill.
export interface LabelPrep {
  parcel: ShippingParcel; // default derived from tech cards, editable
  complete: boolean; // false => some products lack weight/box; a manual override is required
  missingProductIds: number[];
  carrierId: number;
  carrierName: string;
  labelsEnabled: boolean; // Sendcloud configured (else operators enter tracking manually)
  alreadyGenerated: boolean; // a label already exists for this shipment
  labelUrl: string; // existing label URL when alreadyGenerated
  trackingCode: string; // existing tracking code, if any
}

// One Sendcloud shipping option (carrier + service) with its quote.
export interface ShippingOptionVM {
  code: string; // shipping_option_code passed back to generate to select it
  carrierCode: string;
  carrierName: string;
  productName: string;
  totalCharge: string; // decimal value string, e.g. "6.95"
  currency: string;
  transitDays: number; // 0 = not provided
  deliveryDate: string; // ISO date; '' if not provided
}

// GenerateShippingLabel result.
export interface GeneratedLabel {
  trackingCode: string;
  labelUrl: string; // durable printable label PDF URL (our bucket)
  carrierShipmentId: string;
  shippingOptionCode: string;
  carrierName: string;
}

// SchedulePickup input/result (end-of-day carrier handover).
export interface SchedulePickupInput {
  carrierCode: string; // Sendcloud carrier to collect (e.g. "dhl")
  date: string; // pickup day, YYYY-MM-DD
  quantity: number; // parcel count (>=1)
  fromTime?: string; // optional window start HH:MM:SS
  toTime?: string; // optional window end HH:MM:SS
}

export interface SchedulePickupResult {
  pickupId: string;
  confirmed: boolean;
  message: string; // provider status
}
