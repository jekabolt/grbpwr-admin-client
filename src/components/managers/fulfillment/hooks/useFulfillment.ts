import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { common_OrderFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { fulfillmentService } from '../api/fulfillmentService';
import { FulfillmentAnnotation } from '../api/types';

type CardData = { order: common_OrderFull | undefined; annotation: FulfillmentAnnotation };

export const fulfillmentKeys = {
  all: ['fulfillment'] as const,
  board: (deliveredLimit?: number) =>
    [...fulfillmentKeys.all, 'board', deliveredLimit ?? 0] as const,
  card: (uuid: string) => [...fulfillmentKeys.all, 'card', uuid] as const,
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
