import { zodResolver } from '@hookform/resolvers/zod';
import * as DialogPrimitives from '@radix-ui/react-dialog';
import { AcctJournalLineInput } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import {
  Controller,
  SubmitHandler,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from 'react-hook-form';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { inputToDecimal } from 'utils/decimal';
import { applyServerFieldErrors } from 'utils/field-errors';
import { Form } from 'ui/form';
import ComboField from 'ui/form/fields/combo-field';
import CurrencySelect from 'ui/form/fields/currency-select';
import DecimalField from 'ui/form/fields/decimal-field';
import { MANUAL_ENTRY_PRESETS, ManualEntryPreset } from '../../utils/constants';
import { useAcctAccounts, useCreateJournalEntry } from '../../utils/hooks';
import SegmentedField from './segmented-field';
import {
  extractLeadingCode,
  makeManualEntrySchema,
  ManualEntryForm,
  ManualEntryLine,
} from './schema';

type Props = {
  // Mounted only while open (parent conditionally renders), so useForm re-inits per open with the
  // current chart of accounts warm in the React Query cache. Close goes through onClose after the
  // dirty-guard.
  onClose: () => void;
};

const SIDE_ITEMS = [
  { value: 'debit', label: 'debit' },
  { value: 'credit', label: 'credit' },
];
const MODE_ITEMS = [
  { value: 'base', label: 'EUR' },
  { value: 'src', label: 'FX' },
];

function emptyLine(side: 'debit' | 'credit'): ManualEntryLine {
  return {
    account: '',
    side,
    amountMode: 'base',
    amount: '',
    amountSrc: '',
    currencySrc: '',
    note: '',
  };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function num(s?: string): number {
  const n = parseFloat((s ?? '').replace(/,/g, '.'));
  return Number.isFinite(n) ? n : NaN;
}

type Balance = {
  debit: number;
  credit: number;
  difference: number;
  allBase: boolean;
  hasSrc: boolean;
};

// Live footer maths — the ONLY place the client sums money (UX 8.6 #6: reports never recompute on
// the client; a pre-submit balance preview is the sole exception). Only base (EUR) lines count;
// an FX line's base value is known only after the backend converts.
function computeBalance(lines: ManualEntryLine[]): Balance {
  let debit = 0;
  let credit = 0;
  let hasSrc = false;
  for (const l of lines) {
    if (l.amountMode === 'src') {
      hasSrc = true;
      continue;
    }
    const n = num(l.amount);
    if (!Number.isFinite(n)) continue;
    if (l.side === 'debit') debit += n;
    else credit += n;
  }
  return { debit, credit, difference: debit - credit, allBase: !hasSrc, hasSrc };
}

export function ManualEntryModal({ onClose }: Props) {
  const { showMessage } = useSnackBarStore();
  const { data, isLoading: accountsLoading } = useAcctAccounts(false);
  const createEntry = useCreateJournalEntry();

  const activeAccounts = useMemo(() => (data?.accounts ?? []).filter((a) => !a.archived), [data]);
  const accountOptions = useMemo(
    () => activeAccounts.map((a) => `${a.code} — ${a.name}`),
    [activeAccounts],
  );
  const accountByCode = useMemo(() => {
    const m = new Map<string, string>();
    activeAccounts.forEach((a) => {
      if (a.code) m.set(a.code, `${a.code} — ${a.name}`);
    });
    return m;
  }, [activeAccounts]);

  const validCodes = useMemo(
    () => new Set(activeAccounts.map((a) => a.code ?? '').filter(Boolean)),
    [activeAccounts],
  );
  const schema = useMemo(() => makeManualEntrySchema(validCodes), [validCodes]);

  const form = useForm<ManualEntryForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      occurredAt: new Date().toISOString().slice(0, 10),
      description: '',
      lines: [emptyLine('debit'), emptyLine('credit')],
    },
  });

  const { fields, append, insert, remove, replace } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const [discardOpen, setDiscardOpen] = useState(false);

  const watchedLines = useWatch({ control: form.control, name: 'lines' }) as
    | ManualEntryLine[]
    | undefined;
  const balance = computeBalance(watchedLines ?? []);
  const baseImbalance = balance.allBase && Math.abs(balance.difference) > 0.005;
  const submitDisabled = createEntry.isPending || accountsLoading || baseImbalance;

  const applyPreset = (preset: ManualEntryPreset) => {
    replace(
      preset.lines.map((pl) => ({
        ...emptyLine(pl.side),
        account: accountByCode.get(pl.accountCode) ?? pl.accountCode,
      })),
    );
  };

  // "balance" on the last line: fill it with the amount that completes the entry. Computed from
  // the OTHER lines so it works no matter what the last line currently holds ("добей проводку").
  const balanceLastLine = () => {
    const lines = form.getValues('lines');
    const idx = lines.length - 1;
    let debit = 0;
    let credit = 0;
    lines.forEach((l, i) => {
      if (i === idx || l.amountMode === 'src') return;
      const n = num(l.amount);
      if (!Number.isFinite(n)) return;
      if (l.side === 'debit') debit += n;
      else credit += n;
    });
    const diff = debit - credit;
    if (Math.abs(diff) < 0.005) return;
    form.setValue(`lines.${idx}.amountMode`, 'base');
    form.setValue(`lines.${idx}.side`, diff > 0 ? 'credit' : 'debit');
    form.setValue(`lines.${idx}.amount`, Math.abs(diff).toFixed(2), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const requestClose = () => {
    if (form.formState.isDirty) setDiscardOpen(true);
    else onClose();
  };

  const onSubmit: SubmitHandler<ManualEntryForm> = (formData) => {
    const lines: AcctJournalLineInput[] = formData.lines.map((l) => {
      const base = l.amountMode === 'base';
      const note = l.note && l.note.trim() ? l.note.trim() : undefined;
      return {
        accountCode: extractLeadingCode(l.account),
        isDebit: l.side === 'debit',
        amount: base ? inputToDecimal(l.amount) : undefined,
        amountSrc: base ? undefined : inputToDecimal(l.amountSrc),
        currencySrc: base ? undefined : l.currencySrc || undefined,
        note,
      };
    });
    createEntry.mutate(
      { occurredAt: formData.occurredAt, description: formData.description.trim(), lines },
      {
        onSuccess: () => {
          showMessage('Entry created', 'success');
          onClose();
        },
        onError: (e) => {
          applyServerFieldErrors(e, form.setError);
          showMessage(e instanceof Error ? e.message : 'Failed to create entry', 'error');
        },
      },
    );
  };

  return (
    <DialogPrimitives.Root
      open
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
    >
      <DialogPrimitives.Portal container={document.body}>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[760px] lg:-translate-x-1/2'
        >
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              new journal entry
            </DialogPrimitives.Title>
            <Button type='button' className='shrink-0 cursor-pointer' onClick={requestClose}>
              [x]
            </Button>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            Create a manual journal entry
          </DialogPrimitives.Description>

          <Form {...form}>
            <div className='flex flex-col gap-4 p-4'>
              {/* Templates (03 §3.2): one-click prefill of the two lines, everything editable after. */}
              <div className='flex flex-wrap items-center gap-2'>
                <Text variant='inactive' size='small'>
                  templates:
                </Text>
                {MANUAL_ENTRY_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type='button'
                    variant='secondary'
                    size='sm'
                    className='px-2 py-1 uppercase'
                    onClick={() => applyPreset(p)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>

              <div className='grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]'>
                <Controller
                  control={form.control}
                  name='occurredAt'
                  render={({ field, fieldState }) => (
                    <label className='flex flex-col gap-1'>
                      <Text variant='inactive' size='small'>
                        date
                      </Text>
                      <Input
                        {...field}
                        type='date'
                        max={new Date(Date.now() + 864e5).toISOString().slice(0, 10)}
                      />
                      {fieldState.error && (
                        <Text size='small' className='text-error'>
                          {fieldState.error.message}
                        </Text>
                      )}
                    </label>
                  )}
                />
                <Controller
                  control={form.control}
                  name='description'
                  render={({ field, fieldState }) => (
                    <label className='flex flex-col gap-1'>
                      <Text variant='inactive' size='small'>
                        description
                      </Text>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        autoFocus
                        placeholder='what is this entry for?'
                      />
                      {fieldState.error && (
                        <Text size='small' className='text-error'>
                          {fieldState.error.message}
                        </Text>
                      )}
                    </label>
                  )}
                />
              </div>

              <div className='flex flex-col gap-3'>
                {fields.map((f, index) => (
                  <LineRow
                    key={f.id}
                    index={index}
                    count={fields.length}
                    accountOptions={accountOptions}
                    isLast={index === fields.length - 1}
                    showBalance={index === fields.length - 1 && baseImbalance}
                    onDuplicate={() => insert(index + 1, { ...form.getValues(`lines.${index}`) })}
                    onRemove={() => remove(index)}
                    onBalance={balanceLastLine}
                    onEnterLast={() => append(emptyLine('debit'))}
                  />
                ))}
                <button
                  type='button'
                  onClick={() => append(emptyLine('debit'))}
                  className='w-fit underline underline-offset-2 hover:opacity-70'
                >
                  <Text>+ add line</Text>
                </button>
              </div>

              {/* Live balance footer (UX 8.4). */}
              <div className='flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-textColor pt-3'>
                <Text size='small'>
                  Σ debit <span className='tabular-nums'>{fmt(balance.debit)}</span>
                </Text>
                <Text size='small'>
                  Σ credit <span className='tabular-nums'>{fmt(balance.credit)}</span>
                </Text>
                {balance.hasSrc ? (
                  <Text size='small' variant='inactive'>
                    balance validated on server (FX)
                  </Text>
                ) : (
                  <Text size='small' className={cn('tabular-nums', baseImbalance && 'text-error')}>
                    difference {fmt(balance.difference)}
                  </Text>
                )}
              </div>

              <div className='flex items-center justify-end gap-2'>
                <Button type='button' variant='secondary' size='lg' onClick={requestClose}>
                  cancel
                </Button>
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  disabled={submitDisabled}
                  onClick={form.handleSubmit(onSubmit)}
                >
                  {createEntry.isPending ? 'posting…' : 'post entry'}
                </Button>
              </div>
            </div>
          </Form>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>

      <ConfirmationModal
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
        title='Discard unsaved entry?'
        confirmLabel='discard'
      >
        <Text size='small'>Your changes will be lost.</Text>
      </ConfirmationModal>
    </DialogPrimitives.Root>
  );
}

type LineRowProps = {
  index: number;
  count: number;
  accountOptions: string[];
  isLast: boolean;
  showBalance: boolean;
  onDuplicate: () => void;
  onRemove: () => void;
  onBalance: () => void;
  onEnterLast: () => void;
};

function LineRow({
  index,
  count,
  accountOptions,
  isLast,
  showBalance,
  onDuplicate,
  onRemove,
  onBalance,
  onEnterLast,
}: LineRowProps) {
  const { control } = useFormContext();
  const mode = useWatch({ control, name: `lines.${index}.amountMode` }) as 'base' | 'src';

  return (
    <div className='flex flex-col gap-2 border border-textInactiveColor p-3'>
      <div className='flex items-center justify-between'>
        <Text size='small' variant='inactive'>
          line {index + 1}
        </Text>
        <div className='flex items-center gap-3'>
          <button
            type='button'
            onClick={onDuplicate}
            className='underline underline-offset-2 hover:opacity-70'
          >
            <Text size='small'>duplicate</Text>
          </button>
          <button
            type='button'
            onClick={onRemove}
            disabled={count <= 2}
            className='underline underline-offset-2 hover:opacity-70 disabled:opacity-40'
          >
            <Text size='small'>[x]</Text>
          </button>
        </div>
      </div>

      <ComboField
        name={`lines.${index}.account`}
        label='account'
        placeholder='code or name'
        options={accountOptions}
      />

      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <SegmentedField name={`lines.${index}.side`} label='side' items={SIDE_ITEMS} />
        <SegmentedField name={`lines.${index}.amountMode`} label='amount in' items={MODE_ITEMS} />
      </div>

      {mode === 'src' ? (
        <div className='grid grid-cols-2 gap-2'>
          <DecimalField
            name={`lines.${index}.amountSrc`}
            label='amount'
            maxDecimals={2}
            placeholder='0.00'
          />
          <CurrencySelect name={`lines.${index}.currencySrc`} label='currency' />
        </div>
      ) : (
        <DecimalField
          name={`lines.${index}.amount`}
          label='amount (EUR)'
          maxDecimals={2}
          placeholder='0.00'
        />
      )}

      <Controller
        control={control}
        name={`lines.${index}.note`}
        render={({ field }) => (
          <label className='flex flex-col gap-1'>
            <Text variant='inactive' size='small'>
              note
            </Text>
            <Input
              {...field}
              value={field.value ?? ''}
              placeholder='optional'
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (isLast) onEnterLast();
                }
              }}
            />
          </label>
        )}
      />

      {showBalance && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className='self-start px-2 py-1 uppercase'
          onClick={onBalance}
        >
          balance
        </Button>
      )}
    </div>
  );
}
