import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { failureClassOfError } from 'components/managers/tech-card/components/useTechCardAutosave';
import { notify } from 'lib/stores/store';
import { FC, useState } from 'react';
import { Button, CalloutBox, ConfirmationModal, Input, Text, useDoneFlash } from 'ui';
import { tabMetricsKeys } from '../useTabMetricsQuery';

const EMPTY = {
  productId: '',
  sizeId: '',
  reorderPoint: '',
  targetDaysCover: '',
  leadTimeDays: '',
};

/**
 * Operator entry for a per-SKU reorder target. Without a target the backend can't flag
 * needs_reorder, so the Reorder-now list stays empty. Scoped to continuity SKUs — don't target
 * one-off limited drops.
 */
export const InventoryTargetForm: FC = () => {
  const queryClient = useQueryClient();
  // Receipt at the button that opened the dialog: the dialog is gone by then.
  const saved = useDoneFlash();
  // A refusal stands in the dialog until the next edit.
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setError(null);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const mutation = useMutation({
    mutationFn: () =>
      adminService.UpsertInventoryTargets({
        targets: [
          {
            productId: Number(form.productId),
            sizeId: Number(form.sizeId),
            reorderPoint: Number(form.reorderPoint) || 0,
            targetDaysCover: Number(form.targetDaysCover) || 0,
            leadTimeDays: Number(form.leadTimeDays) || 0,
          },
        ],
      }),
    onSuccess: () => {
      saved.flash();
      queryClient.invalidateQueries({ queryKey: tabMetricsKeys.all });
      setForm(EMPTY);
      setOpen(false);
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : 'Failed to save target';
      if (failureClassOfError(e) === 'refused') return setError(msg);
      notify({
        sev: 'error',
        subject: 'REORDER TARGET',
        text: 'not saved',
        detail: msg,
        action:
          failureClassOfError(e) === 'transient'
            ? { label: 'retry', onClick: () => mutation.mutate() }
            : undefined,
      });
    },
  });

  const valid =
    Number(form.productId) > 0 &&
    Number(form.sizeId) > 0 &&
    (Number(form.reorderPoint) > 0 || Number(form.targetDaysCover) > 0);

  return (
    <>
      <Button
        type='button'
        variant='secondary'
        size='lg'
        done={saved.on}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        + Set reorder target
      </Button>
      <ConfirmationModal
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => valid && mutation.mutate()}
        title='Set reorder target'
        confirmLabel='save'
        confirmDisabled={!valid || mutation.isPending}
        closeOnConfirm={false}
      >
        <div className='flex flex-col gap-3 lg:w-[380px]'>
          <Text size='small' variant='inactive'>
            Set a reorder point (units) and/or target days of cover for a SKU. The backend then
            flags it on the Reorder-now list when stock drops to it. For continuity SKUs, not
            limited drops.
          </Text>
          <div className='grid grid-cols-2 gap-3'>
            <Field label='Product ID'>
              <Input
                type='number'
                value={form.productId}
                onChange={set('productId')}
                className='py-1'
                min='1'
              />
            </Field>
            <Field label='Size ID'>
              <Input
                type='number'
                value={form.sizeId}
                onChange={set('sizeId')}
                className='py-1'
                min='1'
              />
            </Field>
          </div>
          <Field label='Reorder point (units)'>
            <Input
              type='number'
              value={form.reorderPoint}
              onChange={set('reorderPoint')}
              className='py-1'
              min='0'
            />
          </Field>
          <div className='grid grid-cols-2 gap-3'>
            <Field label='Target days cover'>
              <Input
                type='number'
                value={form.targetDaysCover}
                onChange={set('targetDaysCover')}
                className='py-1'
                min='0'
              />
            </Field>
            <Field label='Lead time (days)'>
              <Input
                type='number'
                value={form.leadTimeDays}
                onChange={set('leadTimeDays')}
                className='py-1'
                min='0'
              />
            </Field>
          </div>
        </div>
        {error && (
          <CalloutBox tone='error' className='mt-3'>
            <Text size='micro' component='span' role='alert'>
              <b>not saved</b> · {error}
            </Text>
          </CalloutBox>
        )}
      </ConfirmationModal>
    </>
  );
};

const Field: FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className='flex flex-col gap-1'>
    <Text variant='uppercase' className='text-borderColor text-[10px]'>
      {label}
    </Text>
    {children}
  </label>
);
