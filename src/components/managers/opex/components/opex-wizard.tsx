import * as DialogPrimitives from '@radix-ui/react-dialog';
import { useEmployees } from 'components/managers/employees/utils/hooks';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, normalizeDecimalInput, parseDecimalNumber } from 'utils/decimal';
import {
  monthToApi,
  useCostingFxRates,
  useOpexLines,
  useUpsertOpexLines,
  useUpsertOpexRecurring,
} from '../utils/hooks';
import {
  currentMonth,
  formatMoney,
  isRecurringLine,
  latestRateToBase,
  monthLabelShort,
  opexCategoryLabel,
  opexCurrencySymbol,
  shiftMonth,
} from '../utils/options';
import { AmountInput, CategorySelect, CurrencySelect, Field, fieldCls, MonthInput } from './fields';

type Kind = 'oneoff' | 'recurring';
type Step = 'type' | 'details' | 'review';

type Draft = {
  category: string;
  label: string;
  amount: string;
  currency: string;
  note: string;
  // one-off
  month: string;
  // recurring
  activeFrom: string;
  activeTo: string;
  employeeId: number;
};

const emptyDraft = (month: string): Draft => ({
  category: 'salaries',
  label: '',
  amount: '',
  currency: 'EUR',
  note: '',
  month,
  activeFrom: month,
  activeTo: '',
  employeeId: 0,
});

// Guided creation flow for a new OPEX cost. Step 1 makes the one-off-vs-recurring decision explicit
// (the single most confusing part of OPEX for an operator); steps 2–3 collect the fields for the
// chosen kind and preview exactly what will be booked — base-currency fold, uncosted-currency
// warning, and a natural-key collision check — before writing. Editing an existing line/template
// stays in the dedicated edit modals; this component only creates.
export function OpexWizard({
  open,
  onOpenChange,
  defaultKind,
  defaultMonth,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultKind?: Kind;
  defaultMonth?: string;
}) {
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  const base = (dictionary?.baseCurrency || 'EUR').toUpperCase();

  const upsertLine = useUpsertOpexLines();
  const upsertRecurring = useUpsertOpexRecurring();
  const busy = upsertLine.isPending || upsertRecurring.isPending;

  const [kind, setKind] = useState<Kind | null>(defaultKind ?? null);
  const [step, setStep] = useState<Step>(defaultKind ? 'details' : 'type');
  const [d, setD] = useState<Draft>(emptyDraft(defaultMonth || currentMonth()));

  useEffect(() => {
    if (!open) return;
    setKind(defaultKind ?? null);
    setStep(defaultKind ? 'details' : 'type');
    setD(emptyDraft(defaultMonth || currentMonth()));
  }, [open, defaultKind, defaultMonth]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  // Employees only matter for salary templates; fetch lazily.
  const { data: employeeData } = useEmployees(false, open && kind === 'recurring');
  const employees = employeeData?.employees ?? [];

  // FX rates power the base-currency preview + uncosted warning on the review step.
  const { data: fxData } = useCostingFxRates(open);
  const rates = fxData?.rates ?? [];

  // The target month's existing lines, only for the one-off natural-key collision guard.
  const collisionMonth = kind === 'oneoff' ? d.month : '';
  const {
    data: monthData,
    isLoading: monthDataLoading,
    isFetching: monthDataFetching,
  } = useOpexLines(collisionMonth, open && kind === 'oneoff' && !!collisionMonth);

  const amountNum = parseDecimalNumber(d.amount);
  const amountValid = Number.isFinite(amountNum) && amountNum >= 0;

  const detailsError = useMemo(() => {
    if (!d.label.trim()) return 'Enter a label';
    if (!d.amount.trim() || !amountValid) return 'Enter a valid amount (0 or more)';
    if (kind === 'oneoff' && !d.month) return 'Pick a month';
    if (kind === 'recurring') {
      if (!d.activeFrom) return 'Pick an active-from month';
      if (d.activeTo && d.activeTo < d.activeFrom) return 'Active-to month is before active-from';
    }
    return '';
  }, [d, kind, amountValid]);

  // Natural-key collision: the backend upserts one-off lines on (month, category, label), so a new
  // line under a key already used this month would silently overwrite it (a worker-owned ⟳ line
  // especially). Surface it as a blocking review error instead.
  const collision = useMemo(() => {
    if (kind !== 'oneoff') return undefined;
    const cat = d.category || 'other';
    const label = d.label.trim();
    return (monthData?.lines ?? []).find(
      (l) => (l.category || 'other') === cat && (l.label || '') === label,
    );
  }, [kind, monthData, d.category, d.label]);

  // While the collision query above is still loading/fetching, `collision` reads `undefined` —
  // indistinguishable from "checked, no collision found". Without this, the Create button stays
  // enabled and submit()'s `if (collision)` guard silently passes on a not-yet-answered check, so
  // a slow-loading month could let a real collision through. Treat "unknown" as "not yet safe to
  // create": block Create until the check has actually resolved.
  const collisionChecking =
    kind === 'oneoff' && !!collisionMonth && (monthDataLoading || monthDataFetching);

  // Base-currency preview. rate === null means the currency has no costing FX rate today → the
  // backend will book the line uncosted (excluded from the operating result until a rate exists).
  const rate = latestRateToBase(rates, d.currency, base);
  const willBeUncosted = rate === null;
  const basePreview = rate != null && amountValid ? amountNum * rate : null;
  const sameCurrency = d.currency.toUpperCase() === base;

  // For a recurring template: how many months the worker books immediately (active_from .. min(now,
  // active_to)); a future start books nothing yet.
  const recurringMonths = useMemo(() => {
    if (kind !== 'recurring' || !d.activeFrom) return 0;
    const now = currentMonth();
    let end = now;
    if (d.activeTo && d.activeTo < end) end = d.activeTo;
    if (d.activeFrom > end) return 0;
    let n = 0;
    for (let m = d.activeFrom; m <= end; m = shiftMonth(m, 1)) n += 1;
    return n;
  }, [kind, d.activeFrom, d.activeTo]);

  const chooseKind = (k: Kind) => {
    setKind(k);
    // Salary is the common recurring case; keep the sensible default category.
    setStep('details');
  };

  const applyEmployee = (employeeId: number) => {
    const emp = employees.find((e) => e.id === employeeId)?.employee;
    setD((prev) => ({
      ...prev,
      employeeId,
      category: 'salaries',
      // Pre-fill from the registry defaults only where the operator hasn't typed anything.
      label: prev.label.trim() ? prev.label : emp?.fullName || prev.label,
      amount:
        prev.amount.trim() || !emp?.defaultMonthlyCost?.value
          ? prev.amount
          : decimalToInput(emp.defaultMonthlyCost),
      currency: emp?.defaultCurrency || prev.currency,
    }));
  };

  const submit = async () => {
    if (kind === 'oneoff') {
      if (collisionChecking) {
        // Defense in depth alongside the disabled Create button below: don't let a submit through
        // while we still don't know whether this (month, category, label) is taken.
        showMessage(
          'Still checking for a conflicting line this month — try again in a moment',
          'error',
        );
        return;
      }
      if (collision) {
        showMessage(
          isRecurringLine(collision)
            ? 'A recurring (⟳) line already uses this category + label this month'
            : 'A line with this category + label already exists this month — edit that line instead',
          'error',
        );
        return;
      }
      try {
        await upsertLine.mutateAsync([
          {
            month: monthToApi(d.month),
            category: d.category || 'other',
            label: d.label.trim(),
            amount: { value: normalizeDecimalInput(d.amount) },
            currency: d.currency,
            note: d.note.trim(),
          },
        ]);
        showMessage('One-off expense added', 'success');
        onOpenChange(false);
      } catch (e) {
        showMessage(e instanceof Error ? e.message : 'Failed to add expense', 'error');
      }
      return;
    }

    // Unlike the one-off path above, recurring creation has no natural-key collision guard.
    // UpsertOpexRecurring(id: 0) always INSERTS a new template rather than upserting on a key (see
    // its RPC doc comment), so two templates can knowingly share (category, label). The gap that
    // leaves open: `isRecurringLine`/`collision` above show that a worker's monthly materialisation
    // books each template's line into the *same* OpexLine table the one-off path upserts on — keyed
    // on (month, category, label) — so two active templates sharing that key would silently
    // overwrite each other's materialised line every month both are active (most likely two salary
    // templates for the same person/label). Not guarded here: the exact materialisation key isn't
    // visible from this frontend-only repo, and the dedicated recurring-edit modal
    // (recurring-tab.tsx) has the same gap, so a guard only in this wizard would be a false sense of
    // safety rather than real protection. Flagging for a backend-side unique constraint instead.
    try {
      await upsertRecurring.mutateAsync({
        id: 0,
        recurring: {
          label: d.label.trim(),
          category: d.category || 'other',
          amount: { value: normalizeDecimalInput(d.amount) },
          currency: d.currency,
          activeFrom: monthToApi(d.activeFrom),
          activeTo: d.activeTo ? monthToApi(d.activeTo) : '',
          note: d.note.trim(),
          employeeId: d.employeeId || 0,
        },
      });
      showMessage('Recurring template added', 'success');
      onOpenChange(false);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to add template', 'error');
    }
  };

  const steps: { key: Step; label: string }[] = [
    { key: 'type', label: 'type' },
    { key: 'details', label: 'details' },
    { key: 'review', label: 'review' },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[480px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>add opex</DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='shrink-0 cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            create a new operating-expense line or recurring template
          </DialogPrimitives.Description>

          {/* step indicator */}
          <div className='flex items-center gap-1 border-b border-textInactiveColor px-4 py-2'>
            {steps.map((s, i) => (
              <div key={s.key} className='flex items-center gap-1'>
                <span
                  className={`text-small uppercase ${
                    i === stepIndex
                      ? 'text-textColor'
                      : i < stepIndex
                        ? 'text-textColor/60'
                        : 'text-textInactiveColor'
                  }`}
                >
                  {i + 1}. {s.label}
                </span>
                {i < steps.length - 1 && <span className='text-textInactiveColor'>›</span>}
              </div>
            ))}
          </div>

          <div className='flex flex-col gap-3 p-4'>
            {step === 'type' && (
              <>
                <Text size='small' variant='inactive'>
                  What kind of cost is this?
                </Text>
                <KindCard
                  title='one-off'
                  desc='A single expense in one month. Books one line you can edit or delete afterwards.'
                  example='e.g. a legal fee, a hardware purchase, a one-time repair.'
                  onClick={() => chooseKind('oneoff')}
                />
                <KindCard
                  title='recurring'
                  desc='A monthly template. A worker books it automatically into every month from its start date until you archive it.'
                  example='e.g. salaries, rent, an Adobe subscription.'
                  onClick={() => chooseKind('recurring')}
                />
              </>
            )}

            {step === 'details' && (
              <>
                <Field label='category'>
                  <CategorySelect value={d.category} onChange={(v) => set({ category: v })} />
                </Field>

                {kind === 'recurring' && (employees.length > 0 || d.employeeId > 0) && (
                  <Field
                    label='employee (optional — salary link)'
                    hint='Links this template to a person and pre-fills their default cost.'
                  >
                    <select
                      className={fieldCls}
                      value={d.employeeId || 0}
                      onChange={(e) => applyEmployee(Number(e.target.value) || 0)}
                    >
                      <option value={0}>— none —</option>
                      {d.employeeId > 0 && !employees.some((e) => e.id === d.employeeId) ? (
                        <option value={d.employeeId}>employee #{d.employeeId}</option>
                      ) : null}
                      {employees.map((e) => (
                        <option key={e.id} value={e.id ?? 0}>
                          {e.employee?.fullName || `employee #${e.id}`}
                          {e.employee?.role ? ` · ${e.employee.role}` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <Field label='label'>
                  <input
                    className={fieldCls}
                    value={d.label}
                    onChange={(e) => set({ label: e.target.value })}
                    placeholder={
                      kind === 'recurring' ? 'e.g. Adobe CC' : 'e.g. legal fee — trademark'
                    }
                  />
                </Field>

                <div className='grid grid-cols-[1fr_7rem] gap-2'>
                  <Field label='amount'>
                    <AmountInput value={d.amount} onChange={(v) => set({ amount: v })} />
                  </Field>
                  <Field label='currency'>
                    <CurrencySelect value={d.currency} onChange={(v) => set({ currency: v })} />
                  </Field>
                </div>

                {kind === 'oneoff' ? (
                  <Field label='month'>
                    <MonthInput value={d.month} onChange={(v) => set({ month: v })} />
                  </Field>
                ) : (
                  <div className='grid grid-cols-2 gap-2'>
                    <Field label='active from'>
                      <MonthInput value={d.activeFrom} onChange={(v) => set({ activeFrom: v })} />
                    </Field>
                    <Field label='active to (optional)'>
                      <MonthInput
                        value={d.activeTo}
                        min={d.activeFrom}
                        onChange={(v) => set({ activeTo: v })}
                      />
                    </Field>
                  </div>
                )}

                <Field label='note (optional)'>
                  <input
                    className={fieldCls}
                    value={d.note}
                    onChange={(e) => set({ note: e.target.value })}
                  />
                </Field>

                {detailsError && (
                  <Text variant='error' size='small'>
                    {detailsError}
                  </Text>
                )}
              </>
            )}

            {step === 'review' && (
              <div className='flex flex-col gap-3'>
                <div className='border border-textInactiveColor'>
                  <ReviewRow label='kind' value={kind === 'oneoff' ? 'one-off' : 'recurring'} />
                  <ReviewRow label='category' value={opexCategoryLabel(d.category)} />
                  <ReviewRow label='label' value={d.label.trim() || '—'} />
                  <ReviewRow
                    label='amount'
                    value={`${opexCurrencySymbol(d.currency)}${formatMoney(amountNum)} ${d.currency}`}
                  />
                  {kind === 'oneoff' ? (
                    <ReviewRow label='month' value={monthLabelShort(d.month)} />
                  ) : (
                    <ReviewRow
                      label='active'
                      value={`${monthLabelShort(d.activeFrom)} → ${
                        d.activeTo ? monthLabelShort(d.activeTo) : 'open'
                      }`}
                    />
                  )}
                  {d.note.trim() && <ReviewRow label='note' value={d.note.trim()} />}
                </div>

                {/* base-currency fold preview */}
                {sameCurrency ? (
                  <Text size='small' variant='inactive'>
                    Booked in the base currency ({base}).
                  </Text>
                ) : willBeUncosted ? (
                  <Text variant='error' size='small'>
                    No costing FX rate for {d.currency} — this will be booked UNCOSTED and left out
                    of the operating result until a {d.currency} rate is added (tech-cards → FX
                    rates).
                  </Text>
                ) : (
                  basePreview != null && (
                    <Text size='small' variant='inactive'>
                      ≈ {opexCurrencySymbol(base)}
                      {formatMoney(basePreview)} {base} (folded on save at the current {d.currency}{' '}
                      rate)
                    </Text>
                  )
                )}

                {kind === 'recurring' && (
                  <Text size='small' variant='inactive'>
                    {recurringMonths > 0
                      ? `Books ${recurringMonths} month(s) now (${monthLabelShort(d.activeFrom)} → ${monthLabelShort(currentMonth())}), then one line each new month.`
                      : `Starts in the future — books its first line in ${monthLabelShort(d.activeFrom)}.`}
                  </Text>
                )}

                {collisionChecking && (
                  <Text variant='inactive' size='small'>
                    Checking for a conflicting line this month…
                  </Text>
                )}

                {collision && (
                  <Text variant='error' size='small'>
                    {isRecurringLine(collision)
                      ? 'A recurring (⟳) line already uses this category + label this month. Change the label or pick another month.'
                      : 'A line with this category + label already exists this month. Edit that line instead, or change the label.'}
                  </Text>
                )}
              </div>
            )}
          </div>

          {/* footer nav */}
          <div className='sticky bottom-0 flex items-center justify-between gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
            <div>
              {step !== 'type' && (
                <Button
                  type='button'
                  variant='secondary'
                  size='lg'
                  onClick={() => setStep(step === 'review' ? 'details' : 'type')}
                >
                  back
                </Button>
              )}
            </div>
            <div className='flex gap-2'>
              {step === 'details' && (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  disabled={!!detailsError}
                  onClick={() => setStep('review')}
                >
                  review
                </Button>
              )}
              {step === 'review' && (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  disabled={busy || !!collision || collisionChecking}
                  onClick={submit}
                >
                  {busy ? 'saving…' : collisionChecking ? 'checking…' : 'create'}
                </Button>
              )}
            </div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}

function KindCard({
  title,
  desc,
  example,
  onClick,
}: {
  title: string;
  desc: string;
  example: string;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='group flex flex-col gap-1 border border-textInactiveColor p-3 text-left transition-colors hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor'
    >
      <div className='flex items-center justify-between'>
        <Text variant='uppercase'>{title}</Text>
        <span className='text-textInactiveColor transition-colors group-hover:text-textColor'>
          ›
        </span>
      </div>
      <Text size='small'>{desc}</Text>
      <Text size='small' variant='inactive'>
        {example}
      </Text>
    </button>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-start justify-between gap-3 border-b border-textInactiveColor/40 px-3 py-1.5 last:border-b-0'>
      <Text size='small' variant='inactive' className='uppercase'>
        {label}
      </Text>
      <Text size='small' className='text-right'>
        {value}
      </Text>
    </div>
  );
}
