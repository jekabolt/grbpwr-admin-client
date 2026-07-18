import { common_PromoCodeInsert } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useState } from 'react';
import { type PromoDraftSchema } from './schema';
import { useAddPromo, useDeletePromo, useDisablePromo, useUpdatePromo } from './usePromoQuery';

export type PromoDraft = PromoDraftSchema;

// Shared draft-form -> insert-payload mapping (create + edit both funnel through
// this so date handling and field coercion stay in one place).
function toPromoInsert(data: PromoDraftSchema): common_PromoCodeInsert {
  return {
    code: data.code.trim(),
    start: data.start ? new Date(data.start).toISOString() : undefined,
    // H15: a date-only "expires the 20th" input used to cut off at 00:00 UTC on
    // the 20th (the moment it started); anchor to the end of the chosen day so
    // the code actually survives through the day it names.
    expiration: data.expiration
      ? new Date(`${data.expiration}T23:59:59.999Z`).toISOString()
      : undefined,
    discount: { value: data.discount || '0' },
    freeShipping: data.freeShipping,
    voucher: data.voucher,
    allowed: data.allowed,
  };
}

export function usePromo() {
  const { showMessage } = useSnackBarStore();
  const deletePromoMutation = useDeletePromo();
  const disablePromoMutation = useDisablePromo();
  const addPromoMutation = useAddPromo();
  const updatePromoMutation = useUpdatePromo();

  const [isCreating, setIsCreating] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);

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

  // H2: the "Allowed" checkbox used to only ever call disable, even when the code
  // was already disabled — there was no way back. Re-enable recreates the code
  // (see useUpdatePromo) with every field unchanged except `allowed`.
  const openEnableConfirm = useCallback(
    (promo: common_PromoCodeInsert) => {
      const code = promo.code || '';
      setConfirmMessage(`Re-enable promo code "${code}"?`);
      setConfirmAction(() => () => {
        updatePromoMutation.mutate(
          { originalCode: code, promo: { ...promo, allowed: true } },
          {
            onError: (error) => {
              const message = error instanceof Error ? error.message : 'Promo cannot be enabled';
              showMessage(message, 'error');
            },
          },
        );
      });
      setConfirmOpen(true);
    },
    [updatePromoMutation, showMessage],
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

  const startCreate = useCallback(() => {
    setEditingCode(null);
    setIsCreating(true);
  }, []);

  const cancelCreate = useCallback(() => setIsCreating(false), []);

  const submitCreate = useCallback(
    (data: PromoDraftSchema) => {
      addPromoMutation.mutate(
        { ...toPromoInsert(data), allowed: true },
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

  // H8: there was previously no way to fix a typo'd discount or extend an
  // expiration without deleting and recreating the code by hand (losing it from
  // the list momentarily and forcing the operator to re-type everything). This
  // wraps the same delete+recreate workaround behind an "edit" affordance that
  // pre-fills the current values.
  const startEdit = useCallback((code: string) => {
    setIsCreating(false);
    setEditingCode(code);
  }, []);

  const cancelEdit = useCallback(() => setEditingCode(null), []);

  const submitEdit = useCallback(
    (originalCode: string, data: PromoDraftSchema) => {
      updatePromoMutation.mutate(
        { originalCode, promo: toPromoInsert(data) },
        {
          onSuccess: () => {
            showMessage('Promo updated', 'success');
            setEditingCode(null);
          },
          onError: (error) => {
            const message = error instanceof Error ? error.message : 'Failed to update promo';
            showMessage(message, 'error');
          },
        },
      );
    },
    [updatePromoMutation, showMessage],
  );

  return {
    handleDisablePromo: openDisableConfirm,
    handleEnablePromo: openEnableConfirm,
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
    editingCode,
    startEdit,
    cancelEdit,
    submitEdit,
    isSaving: addPromoMutation.isPending || updatePromoMutation.isPending,
  };
}
