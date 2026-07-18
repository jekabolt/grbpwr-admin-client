import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { common_OrderFull, common_OrderStripeDetails } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
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
  const { showMessage } = useSnackBarStore();
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
      showMessage(e instanceof Error ? e.message : 'Failed to set assignee', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: fulfillmentKeys.all }),
  });
}

export function useSetFulfillmentNotes(uuid: string) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (notes: string) => fulfillmentService.setNotes(uuid, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
      showMessage('Notes saved', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to save notes', 'error'),
  });
}

// ---- Packing checklist ----

export function useAddFulfillmentChecklistItem(uuid: string) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (content: string) => fulfillmentService.addChecklistItem(uuid, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: fulfillmentKeys.all }),
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : 'Failed to add checklist item', 'error'),
  });
}

export function useSetFulfillmentChecklistItemDone(uuid: string) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
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
      showMessage(e instanceof Error ? e.message : 'Failed to update checklist', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: fulfillmentKeys.all }),
  });
}

export function useDeleteFulfillmentChecklistItem(uuid: string) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
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
      showMessage(e instanceof Error ? e.message : 'Failed to remove checklist item', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: fulfillmentKeys.all }),
  });
}

// ---- Real order transitions ----
// These change the order's true status (and column), so they invalidate the
// whole tree. Ship also fires the shipped email backend-side.

export function useShipFulfillmentOrder() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { orderUuid: string; trackingCode: string }) =>
      fulfillmentService.ship(vars.orderUuid, vars.trackingCode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
      showMessage('Order marked shipped', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to ship order', 'error'),
  });
}

export function useMarkFulfillmentDelivered() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (orderUuid: string) => fulfillmentService.markDelivered(orderUuid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
      showMessage('Order marked delivered', 'success');
    },
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : 'Failed to mark delivered', 'error'),
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
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { orderUuid: string; parcel: ShippingParcel }) =>
      fulfillmentService.getShippingOptions(vars.orderUuid, vars.parcel),
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : 'Failed to fetch shipping options', 'error'),
  });
}

// GenerateShippingLabel announces the parcel to Sendcloud AND performs the real
// shipped transition (+ shipped email) — irreversible except via void. Invalidate
// the whole tree so the board/card/label all reflect the new SHIPPED state.
export function useGenerateShippingLabel() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: {
      orderUuid: string;
      parcel: ShippingParcel;
      shippingOptionCode?: string;
    }) => fulfillmentService.generateLabel(vars.orderUuid, vars.parcel, vars.shippingOptionCode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
      showMessage('Label generated — order shipped', 'success');
    },
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : 'Failed to generate label', 'error'),
  });
}

// VoidShippingLabel cancels the carrier label and reverts Shipped -> Confirmed.
export function useVoidShippingLabel() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (orderUuid: string) => fulfillmentService.voidLabel(orderUuid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
      showMessage('Label voided — order reverted to confirmed', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to void label', 'error'),
  });
}

// SchedulePickup books an end-of-day carrier handover. Board-level, touches no order.
export function useSchedulePickup() {
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (input: SchedulePickupInput) => fulfillmentService.schedulePickup(input),
    onSuccess: (r) =>
      showMessage(
        r.confirmed
          ? `Pickup scheduled${r.pickupId ? ` (#${r.pickupId})` : ''}`
          : r.message || 'Pickup could not be confirmed',
        r.confirmed ? 'success' : 'error',
      ),
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : 'Failed to schedule pickup', 'error'),
  });
}
