import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { failureClassOfError } from 'components/managers/tech-card/components/useTechCardAutosave';
import { notify } from 'lib/stores/store';
import { FC, useState } from 'react';
import { Button, CalloutBox, ConfirmationModal, Input, Text, useDoneFlash } from 'ui';
import { tabMetricsKeys } from '../useTabMetricsQuery';

const EMPTY = { date: '', utmSource: '', utmMedium: '', utmCampaign: '', amount: '' };

/** Operator entry for per-channel, per-day marketing spend — the input that feeds ROAS. */
export const ChannelSpendForm: FC = () => {
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
      adminService.UpsertChannelSpend({
        spend: [
          {
            date: form.date || undefined,
            utmSource: form.utmSource || undefined,
            utmMedium: form.utmMedium || undefined,
            utmCampaign: form.utmCampaign || undefined,
            amount: { value: form.amount || '0' },
            currency: 'EUR',
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
      const msg = e instanceof Error ? e.message : 'Failed to save spend';
      if (failureClassOfError(e) === 'refused') return setError(msg);
      notify({
        sev: 'error',
        subject: 'CHANNEL SPEND',
        text: 'not saved',
        detail: msg,
        action:
          failureClassOfError(e) === 'transient'
            ? { label: 'retry', onClick: () => mutation.mutate() }
            : undefined,
      });
    },
  });

  const valid = Boolean(form.date) && Boolean(form.utmSource) && Number(form.amount) > 0;

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
        + Add channel spend
      </Button>
      <ConfirmationModal
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => valid && mutation.mutate()}
        title='Add channel spend'
        confirmLabel='save'
        confirmDisabled={!valid || mutation.isPending}
        closeOnConfirm={false}
      >
        <div className='flex flex-col gap-3 lg:w-[380px]'>
          <Text size='small' variant='inactive'>
            Spend in EUR for a channel on a day. Match source/medium/campaign to your UTMs so it
            feeds ROAS on the campaign table.
          </Text>
          <Field label='Date'>
            <Input type='date' value={form.date} onChange={set('date')} className='py-1' />
          </Field>
          <Field label='UTM Source (e.g. instagram)'>
            <Input value={form.utmSource} onChange={set('utmSource')} className='py-1' />
          </Field>
          <Field label='UTM Medium (e.g. paid_social)'>
            <Input value={form.utmMedium} onChange={set('utmMedium')} className='py-1' />
          </Field>
          <Field label='UTM Campaign (optional)'>
            <Input value={form.utmCampaign} onChange={set('utmCampaign')} className='py-1' />
          </Field>
          <Field label='Amount (EUR)'>
            <Input
              type='number'
              value={form.amount}
              onChange={set('amount')}
              className='py-1'
              min='0'
              step='0.01'
            />
          </Field>
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
