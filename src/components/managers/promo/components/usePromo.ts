import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useState } from 'react';
import { type PromoDraftSchema } from './schema';
import { useAddPromo, useDeletePromo, useDisablePromo } from './usePromoQuery';

export type PromoDraft = PromoDraftSchema;

export function usePromo() {
  const { showMessage } = useSnackBarStore();
  const deletePromoMutation = useDeletePromo();
  const disablePromoMutation = useDisablePromo();
  const addPromoMutation = useAddPromo();

  const [isCreating, setIsCreating] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

  const openDisableConfirm = useCallback(
    (code: string) => {
      setConfirmMessage(`Disable promo code "${code}"?`);
      setConfirmAction(() => () => {
        disablePromoMutation.mutate(code, {
          onError: (error) => {
            const message = error instanceof Error ? error.message : 'Promo cannot be disabled';
            showMessage(message, 'error');
          },
        });
      });
      setConfirmOpen(true);
    },
    [disablePromoMutation, showMessage],
  );

  const openDeleteConfirm = useCallback(
    (code: string) => {
      setConfirmMessage(`Delete promo code "${code}"? This cannot be undone.`);
      setConfirmAction(() => () => {
        deletePromoMutation.mutate(code, {
          onError: (error) => {
            const message = error instanceof Error ? error.message : 'Promo cannot be deleted';
            showMessage(message, 'error');
          },
        });
      });
      setConfirmOpen(true);
    },
    [deletePromoMutation, showMessage],
  );

  const onConfirm = useCallback(() => {
    confirmAction?.();
    setConfirmAction(null);
  }, [confirmAction]);

  const onConfirmOpenChange = useCallback((open: boolean) => {
    setConfirmOpen(open);
    if (!open) {
      setConfirmMessage('');
      setConfirmAction(null);
    }
  }, []);

  const startCreate = useCallback(() => setIsCreating(true), []);

  const cancelCreate = useCallback(() => setIsCreating(false), []);

  const submitCreate = useCallback(
    (data: PromoDraftSchema) => {
      addPromoMutation.mutate(
        {
          code: data.code.trim(),
          start: data.start ? new Date(data.start).toISOString() : undefined,
          expiration: data.expiration ? new Date(data.expiration).toISOString() : undefined,
          discount: { value: data.discount || '0' },
          freeShipping: data.freeShipping,
          voucher: data.voucher,
          allowed: true,
        },
        {
          onSuccess: () => {
            showMessage('Promo created', 'success');
            setIsCreating(false);
          },
          onError: (error) => {
            const message = error instanceof Error ? error.message : 'Failed to create promo';
            showMessage(message, 'error');
          },
        },
      );
    },
    [addPromoMutation, showMessage],
  );

  return {
    handleDisablePromo: openDisableConfirm,
    handleDeletePromo: openDeleteConfirm,
    confirm: {
      open: confirmOpen,
      message: confirmMessage,
      onOpenChange: onConfirmOpenChange,
      onConfirm,
    },
    isCreating,
    startCreate,
    cancelCreate,
    submitCreate,
  };
}
