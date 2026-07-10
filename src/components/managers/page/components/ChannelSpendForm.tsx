import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { tabMetricsKeys } from '../useTabMetricsQuery';

const EMPTY = { date: '', utmSource: '', utmMedium: '', utmCampaign: '', amount: '' };

/** Operator entry for per-channel, per-day marketing spend — the input that feeds ROAS. */
export const ChannelSpendForm: FC = () => {
  const queryClient = useQueryClient();
  const showMessage = useSnackBarStore((s) => s.showMessage);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
      showMessage('Channel spend saved', 'success');
      queryClient.invalidateQueries({ queryKey: tabMetricsKeys.all });
      setForm(EMPTY);
      setOpen(false);
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to save spend', 'error'),
  });

  const valid = Boolean(form.date) && Boolean(form.utmSource) && Number(form.amount) > 0;

  return (
    <>
      <Button type='button' variant='secondary' size='lg' onClick={() => setOpen(true)}>
        + Add channel spend
      </Button>
      <ConfirmationModal
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => valid && mutation.mutate()}
        title='Add channel spend'
        confirmLabel='save'
        confirmDisabled={!valid || mutation.isPending}
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
      </ConfirmationModal>
    </>
  );
};

const Field: FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className='flex flex-col gap-1'>
    <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
      {label}
    </Text>
    {children}
  </label>
);
