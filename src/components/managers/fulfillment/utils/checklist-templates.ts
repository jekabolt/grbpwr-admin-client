// ffCheck v2 — packing checklist TEMPLATES applied per order.
//
// Gap note (ff-checklist-template): there is NO ApplyChecklistTemplate RPC. A
// template is therefore a pure client-side constant — a named list of step
// strings — and "apply template" simply loops the existing AddFulfillmentChecklistItem
// RPC once per step (see fulfillment-checklist.tsx). Nothing here touches the order.

export interface ChecklistTemplate {
  id: string;
  label: string;
  items: string[];
}

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    id: 'standard-garment',
    label: 'standard garment',
    items: [
      'Pick items from rack',
      'Verify size & SKU against the order',
      'Fold & tissue-wrap',
      'Box & seal',
      'Print & attach shipping label',
    ],
  },
  {
    id: 'fragile',
    label: 'fragile',
    items: [
      'Pick items',
      'Bubble-wrap each item individually',
      'Fill voids with padding',
      'Mark the box FRAGILE',
      'Box & seal',
      'Print & attach shipping label',
    ],
  },
];
