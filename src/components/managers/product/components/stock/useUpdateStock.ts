import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  defaultData,
  DIRECTION_OPTIONS,
  MODE_OPTIONS,
  REASON_OPTIONS,
  UpdateStockData,
  updateStockSchema,
} from './update-stock-schema';
import { stockChangeHistoryKeys } from './useStockChangeHistory';

interface VariantOption {
  variantId?: number;
  name?: string;
}

export function useUpdateStock({
  variants = [],
  onStockUpdated,
}: {
  variants?: VariantOption[];
  onStockUpdated?: () => void;
}) {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  // Controlled modal open state so a successful save can auto-close the dialog (M5: the form used to
  // silently reset to blank, leaving the operator unsure the write landed).
  const [open, setOpen] = useState(false);

  const form = useForm<UpdateStockData>({
    resolver: zodResolver(updateStockSchema),
    defaultValues: defaultData,
  });

  const mode = form.watch('mode');
  const reason = form.watch('reason');
  const direction = form.watch('direction');

  useEffect(() => {
    if (mode === 'STOCK_ADJUSTMENT_MODE_SET') {
      form.setValue('reason', 'STOCK_CHANGE_REASON_STOCK_COUNT');
      form.setValue('direction', undefined);
    } else {
      const adjustReasons = getReasonOptionsForMode('STOCK_ADJUSTMENT_MODE_ADJUST');
      const currentValid = adjustReasons.some((r) => r.value === reason);
      if (!currentValid) {
        form.setValue('reason', adjustReasons[0].value as UpdateStockData['reason']);
      }
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'STOCK_ADJUSTMENT_MODE_ADJUST') return;
    const dirOpts = getDirectionOptionsForReason(reason);
    const currentValid = dirOpts.some((d) => d.value === direction);
    if (!currentValid && dirOpts.length > 0) {
      form.setValue('direction', dirOpts[0].value as UpdateStockData['direction']);
    }
  }, [mode, reason]);

  async function onSubmit(data: UpdateStockData) {
    if (!data.variantId) {
      showMessage('Select a size/variant', 'error');
      return;
    }
    const payload: Parameters<typeof adminService.UpdateVariantStock>[0] = {
      variantId: data.variantId,
      mode: data.mode,
      quantity: data.quantity,
      reason: data.reason,
      comment: data.comment,
      direction: data.mode === 'STOCK_ADJUSTMENT_MODE_ADJUST' ? data.direction : undefined,
    };
    try {
      await adminService.UpdateVariantStock(payload);
      // Summarise the applied change (the RPC returns no quantity), then auto-close and refresh the
      // table behind the modal so the operator can confirm the new stock.
      const sizeLabel =
        variants.find((v) => v.variantId === data.variantId)?.name ?? `#${data.variantId}`;
      const summary =
        data.mode === 'STOCK_ADJUSTMENT_MODE_SET'
          ? `set to ${data.quantity}`
          : `${data.direction === 'STOCK_ADJUSTMENT_DIRECTION_DECREASE' ? '−' : '+'}${data.quantity}`;
      showMessage(`Stock updated — ${sizeLabel} ${summary}`, 'success');
      form.reset();
      queryClient.invalidateQueries({ queryKey: stockChangeHistoryKeys.all });
      onStockUpdated?.();
      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update stock';
      showMessage(message, 'error');
      console.error('Failed to update stock', error);
    }
  }

  const sizeItems = variants
    .filter((v) => v.variantId != null)
    .map((v) => ({ value: String(v.variantId), label: v.name ?? String(v.variantId) }));

  function getReasonOptionsForMode(
    mode: UpdateStockData['mode'],
  ): { label: string; value: string }[] {
    if (mode === 'STOCK_ADJUSTMENT_MODE_SET') {
      return REASON_OPTIONS.filter((o) => o.value === 'STOCK_CHANGE_REASON_STOCK_COUNT');
    }
    return REASON_OPTIONS.filter((o) => o.value !== 'STOCK_CHANGE_REASON_STOCK_COUNT');
  }

  function getDirectionOptionsForReason(
    reason: UpdateStockData['reason'],
  ): { label: string; value: string }[] {
    if (['STOCK_CHANGE_REASON_DAMAGE', 'STOCK_CHANGE_REASON_LOSS'].includes(reason)) {
      return DIRECTION_OPTIONS.filter((o) => o.value === 'STOCK_ADJUSTMENT_DIRECTION_DECREASE');
    }
    if (['STOCK_CHANGE_REASON_FOUND', 'STOCK_CHANGE_REASON_RESERVED_RELEASE'].includes(reason)) {
      return DIRECTION_OPTIONS.filter((o) => o.value === 'STOCK_ADJUSTMENT_DIRECTION_INCREASE');
    }
    // correction, other: both directions allowed
    return DIRECTION_OPTIONS;
  }

  // Reset the form whenever the modal is closed (via [x], overlay, escape or a successful save) so it
  // never reopens showing a stale half-filled entry.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) form.reset();
  }

  return {
    open,
    onOpenChange,
    form,
    mode,
    reason,
    direction,
    sizeItems,
    modeOptions: MODE_OPTIONS,
    reasonOptions: getReasonOptionsForMode(mode),
    directionOptions: getDirectionOptionsForReason(reason),
    commentPlaceholder:
      reason === 'STOCK_CHANGE_REASON_OTHER' ? 'comment (required)' : 'leave comment (optional)',
    onSubmit,
  };
}
