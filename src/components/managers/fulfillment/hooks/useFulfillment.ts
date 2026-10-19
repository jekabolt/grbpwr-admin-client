import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { common_OrderFull, common_OrderStripeDetails } from 'api/proto-http/admin';
import { notify } from 'lib/stores/store';
import { fulfillmentService } from '../api/fulfillmentService';
import { FulfillmentAnnotation, SchedulePickupInput, ShippingParcel } from '../api/types';

type CardData = {
  order: common_OrderFull | undefined;
  annotation: FulfillmentAnnotation;
  stripeDetails: common_OrderStripeDetails | undefined;
};

export const fulfillmentKeys = {
  all: ['fulfillment'] as const,
  board: (deliveredLimit?: number) =>
    [...fulfillmentKeys.all, 'board', deliveredLimit ?? 0] as const,
  card: (uuid: string) => [...fulfillmentKeys.all, 'card', uuid] as const,
  label: (uuid: string) => [...fulfillmentKeys.all, 'label', uuid] as const,
};

// MONEY PATH (order transitions): only the feedback changed here — no retry actions, the
// requests and their order are untouched. Errors carry the order on them into the inbox.
const orderSubject = (uuid: string) => `ORDER ${uuid.slice(0, 8)}`;
function failed(
  subject: string,
  text: string,
  e: unknown,
  fallback: string,
  opts?: { toast?: boolean },
) {
  notify({ sev: 'error', subject, text, detail: e instanceof Error ? e.message : fallback }, opts);
}

// ---- Reads ----

export function useFulfillmentBoard(deliveredLimit?: number) {
  return useQuery({
    queryKey: fulfillmentKeys.board(deliveredLimit),
    queryFn: () => fulfillmentService.getBoard(deliveredLimit),
    staleTime: 30_000,
  });
}

export function useFulfillmentCard(uuid: string | null) {
  return useQuery({
    queryKey: fulfillmentKeys.card(uuid ?? ''),
    queryFn: () => fulfillmentService.getCard(uuid as string),
    enabled: !!uuid,
    staleTime: 15_000,
  });
}

// ---- Annotation mutations (assignee / notes) ----
// Both change board-summary fields (assignee chip, notes dot), so they invalidate
// the whole `fulfillment` tree — board + the open card refetch.

export function useSetFulfillmentAssignee(uuid: string) {
  const qc = useQueryClient();
  const key = fulfillmentKeys.card(uuid);
  return useMutation({
    mutationFn: (assignee: string) => fulfillmentService.setAssignee(uuid, assignee),
    // Optimistic so the controlled picker shows the new assignee immediately
    // instead of snapping back until the refetch settles.
    onMutate: async (assignee) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CardData>(key);
      if (previous) {
        qc.setQueryData<CardData>(key, {
          ...previous,
          annotation: { ...previous.annotation, assignee },
        });
      }
      return { previous };
    },
    onError: (e, _assignee, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      failed(orderSubject(uuid), 'assignee not saved', e, 'Failed to set assignee');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: fulfillmentKeys.all }),
  });
}

export function useSetFulfillmentNotes(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notes: string) => fulfillmentService.setNotes(uuid, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
    onError: (e) => failed(orderSubject(uuid), 'notes not saved', e, 'Failed to save notes'),
  });
}

// ---- Packing checklist ----

export function useAddFulfillmentChecklistItem(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => fulfillmentService.addChecklistItem(uuid, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: fulfillmentKeys.all }),
    onError: (e) => failed(orderSubject(uuid), 'item not added', e, 'Failed to add checklist item'),
  });
}

export function useSetFulfillmentChecklistItemDone(uuid: string) {
  const qc = useQueryClient();
  const key = fulfillmentKeys.card(uuid);
  return useMutation({
    mutationFn: (vars: { id: number; isDone: boolean }) =>
      fulfillmentService.setChecklistItemDone(vars.id, vars.isDone),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CardData>(key);
      if (previous) {
        qc.setQueryData<CardData>(key, {
          ...previous,
          annotation: {
            ...previous.annotation,
            checklist: previous.annotation.checklist.map((c) =>
              c.id === vars.id ? { ...c, isDone: vars.isDone } : c,
            ),
          },
        });
      }
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      failed(orderSubject(uuid), 'checklist not saved', e, 'Failed to update checklist');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: fulfillmentKeys.all }),
  });
}

export function useDeleteFulfillmentChecklistItem(uuid: string) {
  const qc = useQueryClient();
  const key = fulfillmentKeys.card(uuid);
  return useMutation({
    mutationFn: (id: number) => fulfillmentService.deleteChecklistItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CardData>(key);
      if (previous) {
        qc.setQueryData<CardData>(key, {
          ...previous,
          annotation: {
            ...previous.annotation,
            checklist: previous.annotation.checklist.filter((c) => c.id !== id),
          },
        });
      }
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      failed(orderSubject(uuid), 'item not removed', e, 'Failed to remove checklist item');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: fulfillmentKeys.all }),
  });
}

// ---- Real order transitions ----
// These change the order's true status (and column), so they invalidate the
// whole tree. Ship also fires the shipped email backend-side.

export function useShipFulfillmentOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderUuid: string; trackingCode: string }) =>
      fulfillmentService.ship(vars.orderUuid, vars.trackingCode),
    // The card moving to «shipped» is the receipt.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
    // The ship dialog shows it; the inbox keeps it.
    onError: (e, vars) =>
      failed(orderSubject(vars.orderUuid), 'not shipped', e, 'Failed to ship order', {
        toast: false,
      }),
  });
}

export function useMarkFulfillmentDelivered() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderUuid: string) => fulfillmentService.markDelivered(orderUuid),
    // The card moving to «delivered» is the receipt.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
    onError: (e, orderUuid) =>
      failed(orderSubject(orderUuid), 'not delivered', e, 'Failed to mark delivered'),
  });
}

// ---- Shipping labels (Sendcloud) ----
// PrepareShippingLabel is read-only (derives the default parcel from tech cards,
// reports whether Sendcloud is configured, and returns an existing label if any).
// Gated by `enabled` so it only fires when the label flow is actually opened.

export function useShippingLabelPrep(uuid: string | null, enabled: boolean) {
  return useQuery({
    queryKey: fulfillmentKeys.label(uuid ?? ''),
    queryFn: () => fulfillmentService.prepareLabel(uuid as string),
    enabled: !!uuid && enabled,
    staleTime: 15_000,
  });
}

// On-demand carrier quote for the (possibly overridden) parcel. A mutation, not a
// query, because it's a POST triggered by an explicit "get options" click.
export function useShippingOptions() {
  return useMutation({
    mutationFn: (vars: { orderUuid: string; parcel: ShippingParcel }) =>
      fulfillmentService.getShippingOptions(vars.orderUuid, vars.parcel),
    // The ship dialog shows it; the inbox keeps it.
    onError: (e, vars) =>
      failed(
        orderSubject(vars.orderUuid),
        'no carrier options',
        e,
        'Failed to fetch shipping options',
        {
          toast: false,
        },
      ),
  });
}

// GenerateShippingLabel announces the parcel to Sendcloud AND performs the real
// shipped transition (+ shipped email) — irreversible except via void. Invalidate
// the whole tree so the board/card/label all reflect the new SHIPPED state.
export function useGenerateShippingLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      orderUuid: string;
      parcel: ShippingParcel;
      shippingOptionCode?: string;
    }) => fulfillmentService.generateLabel(vars.orderUuid, vars.parcel, vars.shippingOptionCode),
    // The label in the dialog is the receipt.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
    onError: (e, vars) =>
      failed(orderSubject(vars.orderUuid), 'no label', e, 'Failed to generate label', {
        toast: false,
      }),
  });
}

// VoidShippingLabel cancels the carrier label and reverts Shipped -> Confirmed.
export function useVoidShippingLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderUuid: string) => fulfillmentService.voidLabel(orderUuid),
    // The dialog going back to the parcel step is the receipt.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
    onError: (e, orderUuid) =>
      failed(orderSubject(orderUuid), 'label not voided', e, 'Failed to void label', {
        toast: false,
      }),
  });
}

// SchedulePickup books an end-of-day carrier handover. Board-level, touches no order.
export function useSchedulePickup() {
  return useMutation({
    mutationFn: (input: SchedulePickupInput) => fulfillmentService.schedulePickup(input),
    // Kept as a receipt: the carrier's pickup number shows nowhere else. An unconfirmed booking
    // and a failure stand in the pickup dialog (it stays open); the inbox keeps them.
    onSuccess: (r) =>
      r.confirmed
        ? notify({
            sev: 'ok',
            subject: 'PICKUP',
            text: r.pickupId ? `scheduled #${r.pickupId}` : 'scheduled',
          })
        : notify(
            {
              sev: 'warn',
              subject: 'PICKUP',
              text: 'not confirmed',
              detail: r.message || 'Pickup could not be confirmed',
            },
            { toast: false },
          ),
    onError: (e) =>
      failed('PICKUP', 'not scheduled', e, 'Failed to schedule pickup', { toast: false }),
  });
}
