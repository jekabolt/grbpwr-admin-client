import * as DialogPrimitives from '@radix-ui/react-dialog';
import { AcctJournalEntry, AcctJournalLineInput } from 'api/proto-http/admin';
import { CreateSupplierModal } from 'components/managers/accounting/subledgers/components/create-supplier-modal';
import { useSnackBarStore } from 'lib/stores/store';
import { ReactNode, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { ToggleSwitch } from 'ui/components/toggle-switch';
import { inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { Callout, CheckRow, CheckStrip, GroupHeader, Verdict } from '../../../components/kit';
import {
  useAcctPeriods,
  useCreateFixedAsset,
  useCreateJournalEntry,
  useSuppliers,
} from '../../../utils/hooks';
import { WIZARD_SCENARIOS, WizardField, WizardResult, WizardScenario } from './catalog';

// Business-case wizard — the "+ new entry" default. Three steps: PICK a plain-words case,
// ANSWER its few fields, REVIEW the exact Dr/Cr lines the catalog built, then post. The
// accounting itself is fixed in ./catalog.ts; this component only renders fields, validates,
// and posts. "manual (advanced)" hands over to ManualEntryModal for anything off-catalog
// (FX lines, exotic accounts, multi-leg entries).

type Props = {
  // Mounted only while open (parent conditionally renders), so state resets per open.
  onClose: () => void;
  // The escape hatch: parent closes the wizard and opens ManualEntryModal (no prefill).
  onAdvanced: () => void;
  // Same contract as ManualEntryModal: the toast's "view" action hands the fresh entry back so
  // the parent can open the detail modal even when it's dated outside the current list range.
  onCreated?: (entry: AcctJournalEntry) => void;
};

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function WizardModal({ onClose, onAdvanced, onCreated }: Props) {
  const navigate = useNavigate();
  const { showMessage } = useSnackBarStore();
  const { data: periodsData } = useAcctPeriods();
  const { data: suppliersData } = useSuppliers();
  const createEntry = useCreateJournalEntry();
  const createAsset = useCreateFixedAsset();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState('');
  const [routeCase, setRouteCase] = useState<WizardScenario | null>(null);
  const [scenario, setScenario] = useState<WizardScenario | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [buildError, setBuildError] = useState<string | null>(null);
  const [result, setResult] = useState<WizardResult | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  // Survives a failed entry post so "post" again does NOT re-create the fixed asset.
  const assetCreatedRef = useRef(false);

  // Step 1 search: title + RU/EN keywords, case-insensitive; grouped in catalog order.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (s: WizardScenario) =>
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.keywords.some((k) => k.toLowerCase().includes(q));
    const groups: { group: string; items: WizardScenario[] }[] = [];
    WIZARD_SCENARIOS.filter(matches).forEach((s) => {
      const g = groups.find((x) => x.group === s.group);
      if (g) g.items.push(s);
      else groups.push({ group: s.group, items: [s] });
    });
    return groups;
  }, [query]);

  const supplierOptions = useMemo(
    () => [
      { value: 'none', label: 'pick supplier…' },
      ...(suppliersData?.suppliers ?? []).map((s) => ({
        value: String(s.id ?? 0),
        label: s.name ?? `supplier #${s.id}`,
      })),
    ],
    [suppliersData],
  );

  // Period awareness for the chosen date — same semantics and copy as ManualEntryModal: a CLOSED
  // month is rejected by the backend (block before the round trip); a PAST-but-open month is
  // legal but invisible in the list's default current-month range, so say so upfront.
  const occurredAt = String(answers.date ?? '');
  const monthInfo = useMemo(() => {
    const v = occurredAt;
    if (v.length < 7) return null;
    const month = v.slice(0, 7);
    const nowMonth = new Date().toISOString().slice(0, 7);
    const period = (periodsData?.periods ?? []).find((p) => (p.period ?? '').slice(0, 7) === month);
    return {
      month,
      closed: period?.status === 'closed',
      isPast: month < nowMonth,
    };
  }, [occurredAt, periodsData]);

  const pickScenario = (s: WizardScenario) => {
    if (s.route) {
      setRouteCase(s);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const a: Record<string, any> = {};
    (s.fields ?? []).forEach((f) => {
      switch (f.kind) {
        case 'date':
          a[f.id] = f.defaultToday ? today : '';
          break;
        case 'select':
          a[f.id] = f.defaultValue ?? f.options[0]?.value ?? '';
          break;
        case 'toggle':
          a[f.id] = f.defaultValue ?? false;
          break;
        case 'supplier':
          a[f.id] = undefined;
          break;
        case 'amount':
        case 'number':
          a[f.id] = f.defaultValue ?? '';
          break;
        case 'text':
          a[f.id] = '';
          break;
      }
    });
    setAnswers(a);
    setScenario(s);
    setFieldErrors({});
    setBuildError(null);
    setResult(null);
    assetCreatedRef.current = false;
    setStep(2);
  };

  const setAnswer = (id: string, v: any) => {
    setAnswers((prev) => ({ ...prev, [id]: v }));
    setFieldErrors((prev) => (prev[id] ? { ...prev, [id]: '' } : prev));
    setBuildError(null);
  };

  // Supplier answers carry both the id (posted) and the display name (used in notes/description).
  const setSupplierAnswer = (id: string, raw: string) => {
    const supplierId = raw === 'none' ? undefined : Number(raw);
    const label = supplierOptions.find((o) => o.value === raw)?.label;
    setAnswers((prev) => ({
      ...prev,
      [id]: supplierId,
      [`${id}Name`]: supplierId ? label : undefined,
    }));
    setFieldErrors((prev) => (prev[id] ? { ...prev, [id]: '' } : prev));
    setBuildError(null);
  };

  const toReview = () => {
    if (!scenario?.build) return;
    const errs: Record<string, string> = {};
    (scenario.fields ?? []).forEach((f) => {
      const v = answers[f.id];
      switch (f.kind) {
        case 'text':
          if (f.required && !String(v ?? '').trim()) errs[f.id] = 'required';
          break;
        case 'amount': {
          const s = String(v ?? '').trim();
          const n = parseDecimalNumber(s);
          if (f.required && !(n > 0)) errs[f.id] = 'enter an amount greater than 0';
          else if (!f.required && s && !(n >= 0)) errs[f.id] = 'not a number';
          break;
        }
        case 'number': {
          const n = parseDecimalNumber(String(v ?? ''));
          if (!(n > 0)) errs[f.id] = 'enter a number greater than 0';
          break;
        }
        case 'date':
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''))) errs[f.id] = 'pick a date';
          break;
        case 'supplier':
          if (f.required && !v) errs[f.id] = 'pick the supplier';
          break;
        default:
          break;
      }
    });
    setFieldErrors(errs);
    if (Object.keys(errs).some((k) => errs[k])) return;
    const built = scenario.build(answers);
    if ('error' in built) {
      setBuildError(built.error);
      return;
    }
    setBuildError(null);
    setResult(built);
    setStep(3);
  };

  // Defensive balance check over the catalog's output — an unbalanced result is a catalog bug and
  // must never reach the server (which would reject it anyway; refuse client-side with a red strip).
  const sums = useMemo(() => {
    let debit = 0;
    let credit = 0;
    (result?.lines ?? []).forEach((l) => {
      const n = parseFloat(l.amount);
      if (!Number.isFinite(n)) return;
      if (l.side === 'debit') debit += n;
      else credit += n;
    });
    return { debit, credit, diff: debit - credit };
  }, [result]);
  const unbalanced = Math.abs(sums.diff) > 0.005;

  const postEntry = () => {
    if (!result) return;
    const lines: AcctJournalLineInput[] = result.lines.map((l) => ({
      accountCode: l.accountCode,
      isDebit: l.side === 'debit',
      amount: inputToDecimal(l.amount),
      amountSrc: undefined,
      currencySrc: undefined,
      note: l.note,
    }));
    createEntry.mutate(
      {
        occurredAt,
        description: result.description,
        lines,
        supplierId: result.supplierId,
      },
      {
        onSuccess: (res) => {
          const entry = res.entry;
          const suffix = monthInfo?.isPast ? ` in ${monthInfo.month}` : '';
          showMessage(
            `Entry #${entry?.id ?? '?'} posted${suffix}`,
            'success',
            entry && onCreated ? { label: 'view', onClick: () => onCreated(entry) } : undefined,
          );
          if (result.checklist.length > 0) {
            showMessage(`after posting: ${result.checklist[0]}`, 'success');
          }
          onClose();
        },
        onError: (e) => {
          showMessage(
            result.fixedAsset && assetCreatedRef.current
              ? 'asset was registered but the ENTRY failed — retry posting; if you retry from ' +
                  'scratch, delete the duplicate asset in reports → fixed assets'
              : e instanceof Error
                ? e.message
                : 'Failed to create entry',
            'error',
          );
        },
      },
    );
  };

  const post = () => {
    if (!result || unbalanced || monthInfo?.closed) return;
    // The fixed asset goes first (the register drives depreciation); the entry follows only when
    // it succeeds. A retry after an entry-side failure skips straight to the entry.
    if (result.fixedAsset && !assetCreatedRef.current) {
      const fa = result.fixedAsset;
      const costBase = inputToDecimal(fa.cost);
      if (!costBase) {
        showMessage('asset cost is invalid — go back and re-enter it', 'error');
        return;
      }
      createAsset.mutate(
        {
          name: fa.name,
          costBase,
          acquiredOn: fa.acquiredOn,
          usefulLifeMonths: fa.usefulLifeMonths,
        },
        {
          onSuccess: () => {
            assetCreatedRef.current = true;
            postEntry();
          },
          onError: (e) =>
            showMessage(
              e instanceof Error ? e.message : 'Failed to register the fixed asset',
              'error',
            ),
        },
      );
      return;
    }
    postEntry();
  };

  const requestClose = () => {
    if (step > 1) setDiscardOpen(true);
    else onClose();
  };

  const route = routeCase?.route;
  const pending = createEntry.isPending || createAsset.isPending;

  const periodWarning = monthInfo?.closed ? (
    <div className='border border-error p-3'>
      <Text size='small' className='text-error'>
        {monthInfo.month} is closed — the server will reject this entry. pick a date in an open
        month, or reopen the period first (periods tab).
      </Text>
    </div>
  ) : monthInfo?.isPast ? (
    <div className='border border-textInactiveColor p-3'>
      <Text size='small' variant='inactive'>
        dated {monthInfo.month} (an open past month) — the list shows the current month by default,
        so this entry won&apos;t appear there after posting. use the toast&apos;s &quot;view&quot;
        or switch the list range to find it.
      </Text>
    </div>
  ) : null;

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
          className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[680px] lg:-translate-x-1/2'
        >
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <div className='flex items-baseline gap-3'>
              <DialogPrimitives.Title className='text-lg uppercase'>
                new journal entry
              </DialogPrimitives.Title>
              <Text size='small' variant='inactive'>
                {step === 1
                  ? 'step 1 — what happened?'
                  : step === 2
                    ? 'step 2 — details'
                    : 'step 3 — review'}
              </Text>
            </div>
            <div className='flex items-center gap-3'>
              <button
                type='button'
                onClick={onAdvanced}
                className='underline underline-offset-2 hover:opacity-70'
              >
                <Text size='small'>manual (advanced)</Text>
              </button>
              <Button type='button' className='shrink-0 cursor-pointer' onClick={requestClose}>
                [x]
              </Button>
            </div>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            Create a journal entry from a business case
          </DialogPrimitives.Description>

          <div className='flex flex-col gap-4 p-4'>
            {step === 1 && (
              <>
                <Verdict className='mb-0'>
                  Pick what happened in plain words — the accounts are already decided for you.
                </Verdict>
                <Input
                  value={query}
                  autoFocus
                  placeholder='search: stripe, rent, influencer, vat…'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                />

                {routeCase && route ? (
                  <Callout className='text-textColor'>
                    <Text size='small' className='font-bold'>
                      {routeCase.title} — no journal entry here
                    </Text>
                    <Text size='small' variant='label' className='mt-1'>
                      {route.hint}
                    </Text>
                    <div className='mt-2 flex gap-2'>
                      <Button
                        variant='main'
                        size='lg'
                        onClick={() => {
                          onClose();
                          navigate(route.to);
                        }}
                      >
                        go there
                      </Button>
                      <Button variant='secondary' size='lg' onClick={() => setRouteCase(null)}>
                        cancel
                      </Button>
                    </div>
                  </Callout>
                ) : null}

                {grouped.length === 0 ? (
                  <Text variant='inactive'>
                    nothing matches — try another word, or use manual (advanced)
                  </Text>
                ) : (
                  grouped.map((g) => (
                    <div key={g.group}>
                      <GroupHeader className='mt-0'>{g.group}</GroupHeader>
                      <div className='flex flex-col gap-2'>
                        {g.items.map((s) => (
                          <button
                            key={s.id}
                            type='button'
                            onClick={() => pickScenario(s)}
                            className='flex w-full flex-col gap-0.5 border border-textInactiveColor p-2.5 text-left hover:border-textColor'
                          >
                            <span className='flex w-full items-center gap-2'>
                              <Text component='span' className='font-bold'>
                                {s.emoji ? `${s.emoji} ` : ''}
                                {s.title}
                              </Text>
                              {s.route ? (
                                <Text component='span' variant='inactive' className='ml-auto'>
                                  →
                                </Text>
                              ) : null}
                            </span>
                            <Text component='span' size='small' variant='label'>
                              {s.what}
                            </Text>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {step === 2 && scenario && (
              <>
                <button
                  type='button'
                  onClick={() => setStep(1)}
                  className='w-fit underline underline-offset-2 hover:opacity-70'
                >
                  <Text size='small'>← back to all cases</Text>
                </button>
                <div>
                  <Verdict className='mb-1'>
                    {scenario.emoji ? `${scenario.emoji} ` : ''}
                    {scenario.title}
                  </Verdict>
                  <Text size='small' variant='label'>
                    {scenario.what}
                  </Text>
                </div>
                <div className='flex flex-col gap-4'>
                  {(scenario.fields ?? []).map((f) => (
                    <WizardFieldControl
                      key={f.id}
                      field={f}
                      value={answers[f.id]}
                      error={fieldErrors[f.id]}
                      supplierOptions={supplierOptions}
                      onChange={(v) =>
                        f.kind === 'supplier'
                          ? setSupplierAnswer(f.id, String(v))
                          : setAnswer(f.id, v)
                      }
                      onNewSupplier={() => setSupplierModalOpen(true)}
                    />
                  ))}
                </div>
                {periodWarning}
                {buildError && (
                  <Text size='small' className='text-error'>
                    {buildError}
                  </Text>
                )}
                <div className='flex items-center justify-end gap-2'>
                  <Button type='button' variant='secondary' size='lg' onClick={() => setStep(1)}>
                    back
                  </Button>
                  <Button
                    type='button'
                    variant='main'
                    size='lg'
                    disabled={!!monthInfo?.closed}
                    onClick={toReview}
                  >
                    review
                  </Button>
                </div>
              </>
            )}

            {step === 3 && scenario && result && (
              <>
                <div>
                  <Verdict className='mb-1'>what will happen</Verdict>
                  <Text size='small'>{result.description}</Text>
                  <Text size='small' variant='label' className='mt-1'>
                    posts {result.lines.length} lines dated {occurredAt}
                    {result.supplierId ? ', tagged to the supplier for ap / ar' : ''}
                    {result.fixedAsset
                      ? ` — and first registers fixed asset “${result.fixedAsset.name}” ` +
                        `(${result.fixedAsset.cost} EUR over ${result.fixedAsset.usefulLifeMonths} months)`
                      : ''}
                  </Text>
                </div>

                <div className='border border-textInactiveColor'>
                  <div className='grid grid-cols-[56px_1fr_40px_96px] gap-2 border-b border-textInactiveColor bg-bgSecondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-labelColor'>
                    <span>code</span>
                    <span>account</span>
                    <span>side</span>
                    <span className='text-right'>amount</span>
                  </div>
                  {result.lines.map((l, i) => (
                    <div
                      key={i}
                      className='grid grid-cols-[56px_1fr_40px_96px] items-baseline gap-2 border-b border-textInactiveColor px-2.5 py-1 last:border-b-0'
                    >
                      <span className='tabular-nums'>{l.accountCode}</span>
                      <span>
                        {l.accountName}
                        {l.note ? <span className='text-labelColor'> — {l.note}</span> : null}
                      </span>
                      <span>{l.side === 'debit' ? 'Dr' : 'Cr'}</span>
                      <span className='text-right tabular-nums'>{l.amount}</span>
                    </div>
                  ))}
                </div>

                <CheckStrip
                  tone={unbalanced ? 'bad' : 'ok'}
                  label={
                    <span className='tabular-nums'>
                      Σ debit {fmt(sums.debit)} · Σ credit {fmt(sums.credit)}
                    </span>
                  }
                  value={
                    unbalanced
                      ? `off by ${fmt(sums.diff)} — catalog bug, posting refused`
                      : 'balanced'
                  }
                  className='mt-0'
                />

                {result.caveats.map((c, i) => (
                  <Callout key={i} className='border-warning'>
                    <Text size='small' className='text-warning'>
                      {c}
                    </Text>
                  </Callout>
                ))}

                {result.checklist.length > 0 && (
                  <div className='border border-textInactiveColor p-2.5'>
                    <Text size='small' className='mb-1 font-bold uppercase'>
                      after posting, also do:
                    </Text>
                    {result.checklist.map((c, i) => (
                      <CheckRow key={i}>
                        <Text component='span' size='small'>
                          {c}
                        </Text>
                      </CheckRow>
                    ))}
                  </div>
                )}

                {periodWarning}

                <div className='flex items-center justify-end gap-2'>
                  <Button type='button' variant='secondary' size='lg' onClick={() => setStep(2)}>
                    back
                  </Button>
                  <Button
                    type='button'
                    variant='main'
                    size='lg'
                    disabled={pending || unbalanced || !!monthInfo?.closed}
                    onClick={post}
                  >
                    {createAsset.isPending
                      ? 'registering asset…'
                      : createEntry.isPending
                        ? 'posting…'
                        : 'post entry'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>

      <ConfirmationModal
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
        title='Discard this entry?'
        confirmLabel='discard'
      >
        <Text size='small'>Your answers will be lost.</Text>
      </ConfirmationModal>

      {/* Inline supplier creation, same as ManualEntryModal — the suppliers query invalidates on
          create, so the new name shows up in the selector right away. */}
      <CreateSupplierModal open={supplierModalOpen} onOpenChange={setSupplierModalOpen} />
    </DialogPrimitives.Root>
  );
}

type FieldProps = {
  field: WizardField;
  value: any;
  error?: string;
  supplierOptions: { value: string; label: string }[];
  onChange: (v: any) => void;
  onNewSupplier: () => void;
};

// One catalog field. Amount inputs sanitize to 2-decimal EUR strings (sanitizeDecimal), number
// inputs to bare digits; supplier renders the shared Selector plus the inline "+ new supplier".
function WizardFieldControl({
  field,
  value,
  error,
  supplierOptions,
  onChange,
  onNewSupplier,
}: FieldProps) {
  const hint = 'hint' in field ? field.hint : undefined;

  if (field.kind === 'toggle') {
    return (
      <div className='flex flex-col gap-1'>
        <ToggleSwitch checked={!!value} label={field.label} onCheckedChange={onChange} />
        {hint && (
          <Text size='small' variant='label'>
            {hint}
          </Text>
        )}
      </div>
    );
  }

  if (field.kind === 'select') {
    return (
      <div className='flex flex-col gap-1'>
        <Text variant='inactive' size='small'>
          {field.label}
        </Text>
        <Selector
          label={field.label}
          options={field.options}
          value={String(value ?? '')}
          onChange={(v: string) => onChange(v)}
        />
        {hint && (
          <Text size='small' variant='label'>
            {hint}
          </Text>
        )}
        {error && (
          <Text size='small' className='text-error'>
            {error}
          </Text>
        )}
      </div>
    );
  }

  if (field.kind === 'supplier') {
    return (
      <div className='flex flex-col gap-1'>
        <Text variant='inactive' size='small'>
          {field.label}
        </Text>
        <div className='flex flex-wrap items-center gap-3'>
          <Selector
            label='supplier'
            options={supplierOptions}
            value={value ? String(value) : 'none'}
            onChange={(v: string) => onChange(v)}
            compact
          />
          <button
            type='button'
            onClick={onNewSupplier}
            className='underline underline-offset-2 hover:opacity-70'
          >
            <Text size='small'>+ new supplier</Text>
          </button>
        </div>
        {error && (
          <Text size='small' className='text-error'>
            {error}
          </Text>
        )}
      </div>
    );
  }

  let input: ReactNode;
  if (field.kind === 'date') {
    input = (
      <Input
        type='date'
        value={String(value ?? '')}
        max={new Date(Date.now() + 864e5).toISOString().slice(0, 10)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    );
  } else if (field.kind === 'amount') {
    input = (
      <Input
        inputMode='decimal'
        placeholder='0.00'
        value={String(value ?? '')}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(sanitizeDecimal(e.target.value, 2))
        }
      />
    );
  } else if (field.kind === 'number') {
    input = (
      <Input
        inputMode='numeric'
        placeholder='0'
        value={String(value ?? '')}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value.replace(/[^0-9]/g, ''))
        }
      />
    );
  } else {
    input = (
      <Input
        value={String(value ?? '')}
        placeholder={field.placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    );
  }

  return (
    <label className='flex flex-col gap-1'>
      <Text variant='inactive' size='small'>
        {field.label}
      </Text>
      {input}
      {hint && (
        <Text size='small' variant='label'>
          {hint}
        </Text>
      )}
      {error && (
        <Text size='small' className='text-error'>
          {error}
        </Text>
      )}
    </label>
  );
}
