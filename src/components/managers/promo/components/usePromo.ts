import { common_PromoCodeInsert } from 'api/proto-http/admin';
import { failureClassOfError } from 'components/managers/tech-card/components/useTechCardAutosave';
import { notify } from 'lib/stores/store';
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
  // A refusal of the open create/edit row: stands under it until the next attempt.
  const [draftError, setDraftError] = useState<string | null>(null);
  // Promo codes steer discounts: errors only change their feedback, and no retry action.
  const failed = useCallback((code: string, text: string, error: unknown, fallback: string) => {
    notify({
      sev: 'error',
      subject: `PROMO ${code}`.trim(),
      text,
      detail: error instanceof Error ? error.message : fallback,
    });
  }, []);
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
          onError: (error) => failed(code, 'not disabled', error, 'Promo cannot be disabled'),
        });
      });
      setConfirmOpen(true);
    },
    [disablePromoMutation, failed],
  );

  // H2: the "Allowed" checkbox used to only ever call disable, even when the code
  // was already disabled — there was no way back. Re-enable now calls the atomic
  // UpdatePromoCode RPC (see useUpdatePromo) with every field unchanged except
  // `allowed`.
  const openEnableConfirm = useCallback(
    (promo: common_PromoCodeInsert) => {
      const code = promo.code || '';
      setConfirmMessage(`Re-enable promo code "${code}"?`);
      setConfirmAction(() => () => {
        updatePromoMutation.mutate(
          { ...promo, allowed: true },
          {
            onError: (error) => failed(code, 'not enabled', error, 'Promo cannot be enabled'),
          },
        );
      });
      setConfirmOpen(true);
    },
    [updatePromoMutation, failed],
  );

  const openDeleteConfirm = useCallback(
    (code: string) => {
      setConfirmMessage(`Delete promo code "${code}"? This cannot be undone.`);
      setConfirmAction(() => () => {
        deletePromoMutation.mutate(code, {
          onError: (error) => failed(code, 'not deleted', error, 'Promo cannot be deleted'),
        });
      });
      setConfirmOpen(true);
    },
    [deletePromoMutation, failed],
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
    setDraftError(null);
    setEditingCode(null);
    setIsCreating(true);
  }, []);

  const cancelCreate = useCallback(() => setIsCreating(false), []);

  const submitCreate = useCallback(
    (data: PromoDraftSchema) => {
      setDraftError(null);
      addPromoMutation.mutate(
        { ...toPromoInsert(data), allowed: true },
        {
          // The new row in the table is the receipt.
          onSuccess: () => setIsCreating(false),
          onError: (error) => {
            const message = error instanceof Error ? error.message : 'Failed to create promo';
            if (failureClassOfError(error) === 'refused') setDraftError(message);
            else failed(data.code, 'not created', error, 'Failed to create promo');
          },
        },
      );
    },
    [addPromoMutation, failed],
  );

  // H8: there was previously no way to fix a typo'd discount or extend an
  // expiration without deleting and recreating the code by hand (losing it from
  // the list momentarily and forcing the operator to re-type everything). This
  // wraps the atomic UpdatePromoCode RPC behind an "edit" affordance that
  // pre-fills the current values.
  const startEdit = useCallback((code: string) => {
    setDraftError(null);
    setIsCreating(false);
    setEditingCode(code);
  }, []);

  const cancelEdit = useCallback(() => setEditingCode(null), []);

  const submitEdit = useCallback(
    (data: PromoDraftSchema) => {
      setDraftError(null);
      updatePromoMutation.mutate(toPromoInsert(data), {
        // The row closing with the new values is the receipt.
        onSuccess: () => setEditingCode(null),
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Failed to update promo';
          if (failureClassOfError(error) === 'refused') setDraftError(message);
          else failed(data.code, 'not saved', error, 'Failed to update promo');
        },
      });
    },
    [updatePromoMutation, failed],
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
    draftError,
    isSaving: addPromoMutation.isPending || updatePromoMutation.isPending,
  };
}
