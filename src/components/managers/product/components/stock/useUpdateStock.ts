import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect } from 'react';
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

interface SizeOption {
  id?: number;
  name?: string;
}

export function useUpdateStock({
  productId,
  sizes = [],
  onStockUpdated,
}: {
  productId?: number;
  sizes?: SizeOption[];
  onStockUpdated?: () => void;
}) {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();

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
    if (!productId) {
      showMessage('Product ID is required', 'error');
      return;
    }
    const payload: Parameters<typeof adminService.UpdateProductSizeStock>[0] = {
      productId,
      mode: data.mode,
      sizeId: data.sizeId,
      quantity: data.quantity,
      reason: data.reason,
      comment: data.comment,
      direction: data.mode === 'STOCK_ADJUSTMENT_MODE_ADJUST' ? data.direction : undefined,
    };
    try {
      await adminService.UpdateProductSizeStock(payload);
      showMessage('Stock updated successfully', 'success');
      form.reset();
      queryClient.invalidateQueries({ queryKey: stockChangeHistoryKeys.all });
      onStockUpdated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update stock';
      showMessage(message, 'error');
      console.error('Failed to update stock', error);
    }
  }

  const sizeItems = sizes
    .filter((s) => s.id != null)
    .map((s) => ({ value: String(s.id), label: s.name ?? String(s.id) }));

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
    return [];
  }

  return {
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
