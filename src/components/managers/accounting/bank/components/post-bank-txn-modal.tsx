import * as DialogPrimitives from '@radix-ui/react-dialog';
import { AcctBankTxn } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Form } from 'ui/form';
import ComboField from 'ui/form/fields/combo-field';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { extractLeadingCode } from '../../journal/components/schema';
import { formatBase, isNegative } from '../../utils/format';
import { useAcctAccounts, usePostBankTxn } from '../../utils/hooks';

type FormValues = { account: string; occurredAt: string };

// Post one inbox line (4.1): the backend books a manual-provenance entry Dr/Cr by the SIGNED amount
// (1010 is the money leg) against the counter-account chosen here. The account defaults to the rule
// suggestion carried on the line; the date defaults to the line's booked date. A raw dialog (not
// ConfirmationModal) so a server rejection keeps the picked account on screen.
export function PostBankTxnModal({ txn, onClose }: { txn: AcctBankTxn; onClose: () => void }) {
  const { showMessage } = useSnackBarStore();
  const { data, isLoading: accountsLoading } = useAcctAccounts(false);
  const post = usePostBankTxn();

  const activeAccounts = useMemo(() => (data?.accounts ?? []).filter((a) => !a.archived), [data]);
  const accountOptions = useMemo(
    () => activeAccounts.map((a) => `${a.code} — ${a.name}`),
    [activeAccounts],
  );
  const validCodes = useMemo(
    () => new Set(activeAccounts.map((a) => a.code ?? '').filter(Boolean)),
    [activeAccounts],
  );

  // Prefill the suggested counter-account as the full "code — name" combo label once the chart of
  // accounts has loaded, so the field shows a resolved name rather than a bare code.
  const suggestedLabel = useMemo(() => {
    if (!txn.suggestedAccount) return '';
    const hit = activeAccounts.find((a) => a.code === txn.suggestedAccount);
    return hit ? `${hit.code} — ${hit.name}` : txn.suggestedAccount;
  }, [txn.suggestedAccount, activeAccounts]);

  const form = useForm<FormValues>({
    defaultValues: { account: '', occurredAt: (txn.bookedAt ?? '').slice(0, 10) },
  });

  useEffect(() => {
    if (suggestedLabel) form.setValue('account', suggestedLabel);
  }, [suggestedLabel, form]);

  // PostBankTxn cannot attach a supplier (no supplier_id on its request yet), so a 2010 posting
  // from here always lands in the anonymous "(untagged)" AP row. Warn and point to the journal
  // path, which requires a supplier — but don't block: sometimes booking fast beats tagging.
  const watchedAccount = useWatch({ control: form.control, name: 'account' }) as string | undefined;
  const watchedCode = extractLeadingCode(watchedAccount ?? '');
  const postsToAP = watchedCode === '2010';
  // Double-expense trap (audit finding 3): monthly opex and carrier costs are ACCRUED
  // (Dr 6xxx / Cr 2030) by the worker — paying that bill from the bank against a 6xxx account
  // books the same expense twice. The settlement leg of an accrued cost is 2030 (2010 for
  // supplier receipts); warn, don't block: a one-off un-accrued cost straight to 6xxx is fine.
  const postsToExpense = /^6\d{3}$/.test(watchedCode);

  const onSubmit = (values: FormValues) => {
    const code = extractLeadingCode(values.account);
    if (!code || !validCodes.has(code)) {
      form.setError('account', { message: 'pick an account from the chart' });
      return;
    }
    post.mutate(
      { id: txn.id ?? 0, accountCode: code, occurredAt: values.occurredAt || undefined },
      {
        onSuccess: () => {
          showMessage('Transaction posted', 'success');
          onClose();
        },
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to post transaction', 'error'),
      },
    );
  };

  const amountCls = isNegative(txn.amount) ? 'text-error' : '';

  return (
    <DialogPrimitives.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitives.Portal container={document.body}>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[480px] lg:-translate-x-1/2'
        >
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              post transaction
            </DialogPrimitives.Title>
            <Button type='button' className='shrink-0 cursor-pointer' onClick={onClose}>
              [x]
            </Button>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            Book a journal entry for this bank inbox line
          </DialogPrimitives.Description>

          <Form {...form}>
            <div className='flex flex-col gap-4 p-4'>
              {/* The line under review — read-only context for the posting decision. */}
              <div className='flex flex-col gap-1 border border-textInactiveColor p-3'>
                <div className='flex items-baseline justify-between gap-2'>
                  <Text size='small' variant='inactive'>
                    amount
                  </Text>
                  <Text className={`tabular-nums ${amountCls}`}>
                    {formatBase(txn.amount)} {txn.currency}
                  </Text>
                </div>
                {txn.description ? (
                  <Text size='small' className='break-words'>
                    {txn.description}
                  </Text>
                ) : null}
                {txn.counterparty ? (
                  <Text size='small' variant='inactive'>
                    {txn.counterparty}
                  </Text>
                ) : null}
              </div>

              <ComboField
                name='account'
                label='counter-account (1010 is the money leg)'
                placeholder='code or name'
                options={accountOptions}
              />

              {postsToAP && (
                <div className='border border-textInactiveColor p-3'>
                  <Text size='small' variant='inactive'>
                    heads up: a 2010 payment posted from the bank inbox carries NO supplier tag — it
                    lands in the “(untagged)” row of ap / ar. to keep payables per supplier,{' '}
                    <Link
                      to={`${ROUTES.accounting}?new=1`}
                      className='underline underline-offset-2 hover:opacity-70'
                    >
                      post it as a journal entry
                    </Link>{' '}
                    with the supplier picked (then ignore this line).
                  </Text>
                </div>
              )}

              {postsToExpense && (
                <div className='border border-warning p-3'>
                  <Text size='small' className='text-warning'>
                    careful: if this cost was already ACCRUED (monthly opex, carrier shipping — the
                    worker books Dr 6xxx / Cr 2030), posting the payment to a 6xxx account counts
                    the expense TWICE. paying an accrued bill = counter-account 2030 accrued
                    expenses (supplier receipts = 2010). straight to 6xxx is right only for a cost
                    that was never accrued.
                  </Text>
                </div>
              )}

              <Controller
                control={form.control}
                name='occurredAt'
                render={({ field }) => (
                  <label className='flex flex-col gap-1'>
                    <Text variant='inactive' size='small'>
                      date
                    </Text>
                    <Input {...field} type='date' />
                  </label>
                )}
              />

              <div className='flex items-center justify-end gap-2'>
                <Button type='button' variant='secondary' size='lg' onClick={onClose}>
                  cancel
                </Button>
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  disabled={post.isPending || accountsLoading}
                  onClick={form.handleSubmit(onSubmit)}
                >
                  {post.isPending ? 'posting…' : 'post entry'}
                </Button>
              </div>
            </div>
          </Form>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
