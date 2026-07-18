import * as DialogPrimitives from '@radix-ui/react-dialog';
import { createFiber } from 'components/managers/dictionaries/dictionary-adapters';
import { cn } from 'lib/utility';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';

// #37: one structured fibre share — a dictionary fibre code + a percent (edited as a plain string,
// converted to google.type.Decimal at the schema boundary by the material modal's submit()). Owned
// here so the wizard is the single editor of composition and the modal only imports the shape.
export type CompRow = { fiberCode: string; percent: string };

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

type Step = 'fibres' | 'percent' | 'review';
const STEPS: { key: Step; label: string }[] = [
  { key: 'fibres', label: 'fibres' },
  { key: 'percent', label: 'percentages' },
  { key: 'review', label: 'review' },
];

// Guided composition editor for a material's fibre blend. Replaces the old inline row editor that
// (a) only appeared for MATERIAL_CLASS_FABRIC — no way to add composition for any other class or
// before a class was picked — and (b) dead-ended on an empty fibres dictionary (a bare `<select>`
// with nothing to pick and no way to create a fibre). Step 1 picks fibres from the dictionary with a
// prominent inline "create fibre" affordance (so an empty/short dictionary never blocks the blend);
// step 2 sets each share; step 3 reviews against a running total that must equal 100%. Editing writes
// the same compositionEntries (fiber_code + percent) the material modal already persists — this
// component only edits an in-memory copy and commits it via onSave when the operator finishes.
export function CompositionWizard({
  open,
  onOpenChange,
  initialEntries,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialEntries: CompRow[];
  // Commit the edited blend back onto the material draft (filled rows only). Empty = unset (allowed).
  onSave: (entries: CompRow[]) => void;
}) {
  const { dictionary, refetch } = useDictionary();
  const { showMessage } = useSnackBarStore();

  const [step, setStep] = useState<Step>('fibres');
  const [rows, setRows] = useState<CompRow[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Seed from the material draft on open only — depending on initialEntries would re-seed on every
    // parent render and wipe in-wizard edits. Drop any code-less legacy row: the structured model is
    // keyed on a fibre code, and step 1 is driven by fibre cards.
    setRows(initialEntries.filter((r) => r.fiberCode.trim()).map((r) => ({ ...r })));
    setStep('fibres');
    setNewCode('');
    setNewName('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // All fibres (incl. archived) power name resolution; only non-archived are offered as new picks,
  // but an already-selected archived fibre stays visible so editing never silently drops it.
  const allFibers = useMemo(() => (dictionary?.fibers ?? []).filter((f) => f.code), [dictionary]);
  const activeFibers = useMemo(() => allFibers.filter((f) => !f.archived), [allFibers]);
  const displayFibers = useMemo(() => {
    const selected = [...new Set(rows.map((r) => r.fiberCode).filter(Boolean))];
    const extra = selected
      .filter((c) => !activeFibers.some((f) => f.code === c))
      .map(
        (c) => allFibers.find((f) => f.code === c) ?? { code: c, name: undefined, archived: true },
      );
    return [...activeFibers, ...extra];
  }, [activeFibers, allFibers, rows]);

  const fiberLabel = (code: string) => {
    const f = allFibers.find((x) => x.code === code);
    return f?.name ? `${f.name} (${code})` : code;
  };

  const total = rows.reduce((s, r) => {
    const n = parseDecimalNumber(r.percent);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const codes = rows.map((r) => r.fiberCode);
  const unique = new Set(codes).size === codes.length;
  const complete = rows.every((r) => r.fiberCode && parseDecimalNumber(r.percent) > 0);
  // Valid = empty (unset, allowed) OR every fibre complete, no duplicates, sums to 100.
  const valid = rows.length === 0 || (complete && unique && Math.abs(total - 100) < 0.01);

  const toggle = (code: string) =>
    setRows((prev) =>
      prev.some((r) => r.fiberCode === code)
        ? prev.filter((r) => r.fiberCode !== code)
        : [...prev, { fiberCode: code, percent: '' }],
    );
  const setPercent = (code: string, percent: string) =>
    setRows((prev) => prev.map((r) => (r.fiberCode === code ? { ...r, percent } : r)));

  // Split 100% evenly across the selected fibres, dumping the rounding remainder on the last row so
  // the total lands on exactly 100 — the quickest path to a valid blend (a single fibre → 100).
  const distributeEvenly = () =>
    setRows((prev) => {
      const n = prev.length;
      if (n === 0) return prev;
      const each = Math.round((100 / n) * 100) / 100;
      return prev.map((r, i) => ({
        ...r,
        percent: String(i === n - 1 ? Number((100 - each * (n - 1)).toFixed(2)) : each),
      }));
    });

  const createAndSelect = async () => {
    const code = newCode.trim();
    const name = newName.trim();
    if (!code || !name) {
      showMessage('Fibre code and name are required', 'error');
      return;
    }
    // Already in the dictionary (possibly typed by mistake) — just select it, no duplicate create.
    if (activeFibers.some((f) => f.code === code)) {
      setRows((p) =>
        p.some((r) => r.fiberCode === code) ? p : [...p, { fiberCode: code, percent: '' }],
      );
      setNewCode('');
      setNewName('');
      showMessage('Fibre already exists — selected it', 'success');
      return;
    }
    setCreating(true);
    try {
      await createFiber({ code, name });
      // Reload the shared dictionary so the new fibre appears as a pickable card; we already hold its
      // code, so select it immediately without waiting to read it back out of the refreshed list.
      await refetch();
      setRows((p) =>
        p.some((r) => r.fiberCode === code) ? p : [...p, { fiberCode: code, percent: '' }],
      );
      setNewCode('');
      setNewName('');
      showMessage(`Fibre “${name}” created`, 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to create fibre', 'error');
    } finally {
      setCreating(false);
    }
  };

  const finish = () => {
    onSave(rows.filter((r) => r.fiberCode));
    onOpenChange(false);
  };

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const over = total > 100.0001;

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal container={document.body}>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[480px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              composition
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='shrink-0 cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            build a material's fibre blend and set each fibre's percentage
          </DialogPrimitives.Description>

          {/* step indicator (mirrors the opex wizard chrome) */}
          <div className='flex items-center gap-1 border-b border-textInactiveColor px-4 py-2'>
            {STEPS.map((s, i) => (
              <div key={s.key} className='flex items-center gap-1'>
                <span
                  className={cn(
                    'text-small uppercase',
                    i === stepIndex
                      ? 'text-textColor'
                      : i < stepIndex
                        ? 'text-textColor/60'
                        : 'text-textInactiveColor',
                  )}
                >
                  {i + 1}. {s.label}
                </span>
                {i < STEPS.length - 1 && <span className='text-textInactiveColor'>›</span>}
              </div>
            ))}
          </div>

          <div className='flex flex-col gap-3 p-4'>
            {step === 'fibres' && (
              <>
                <Text size='small' variant='inactive'>
                  Which fibres are in this material? Pick one or more.
                </Text>

                {displayFibers.length === 0 ? (
                  <div className='flex flex-col gap-1 border border-textInactiveColor p-3'>
                    <Text size='small'>no fibres in the dictionary yet</Text>
                    <Text size='small' variant='inactive'>
                      create your first fibre below — it is added to the shared dictionary and
                      selected into this blend.
                    </Text>
                  </div>
                ) : (
                  <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                    {displayFibers.map((f) => {
                      const selected = rows.some((r) => r.fiberCode === f.code);
                      return (
                        <button
                          key={f.code}
                          type='button'
                          onClick={() => toggle(f.code!)}
                          className={cn(
                            'flex items-center justify-between gap-2 border px-3 py-2 text-left transition-colors',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
                            selected
                              ? 'border-textColor bg-textColor/5'
                              : 'border-textInactiveColor hover:border-textColor',
                          )}
                        >
                          <span className='flex min-w-0 flex-col'>
                            <Text size='small' className='truncate'>
                              {f.name || f.code}
                            </Text>
                            {f.name && (
                              <Text size='small' variant='inactive' className='truncate'>
                                {f.code}
                                {f.archived ? ' · archived' : ''}
                              </Text>
                            )}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 text-small uppercase',
                              selected ? 'text-textColor' : 'text-textInactiveColor',
                            )}
                          >
                            {selected ? '✓' : 'add'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {rows.length === 0 && displayFibers.length > 0 && (
                  <Text size='small' variant='inactive'>
                    select at least one fibre to set percentages.
                  </Text>
                )}

                {/* inline create fibre — always available so an empty/short dictionary never blocks. */}
                <div className='flex flex-col gap-2 border border-textInactiveColor p-3'>
                  <Text size='small' variant='uppercase'>
                    create a new fibre
                  </Text>
                  <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                    <label className='flex flex-col gap-1'>
                      <Text size='small'>code</Text>
                      <input
                        className={cell}
                        placeholder='e.g. CO'
                        value={newCode}
                        onChange={(e) => setNewCode(e.target.value)}
                      />
                    </label>
                    <label className='flex flex-col gap-1'>
                      <Text size='small'>name</Text>
                      <input
                        className={cell}
                        placeholder='e.g. cotton'
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    </label>
                  </div>
                  <div>
                    <Button
                      type='button'
                      variant='secondary'
                      className='uppercase'
                      disabled={creating || !newCode.trim() || !newName.trim()}
                      onClick={createAndSelect}
                    >
                      {creating ? 'creating…' : '＋ create fibre'}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {step === 'percent' && (
              <>
                <Text size='small' variant='inactive'>
                  Set each fibre's share — they must total 100%.
                </Text>
                <div className='flex flex-col gap-2'>
                  {rows.map((r) => (
                    <div key={r.fiberCode} className='flex items-center gap-2'>
                      <Text size='small' className='min-w-0 flex-1 truncate'>
                        {fiberLabel(r.fiberCode)}
                      </Text>
                      <div className='flex shrink-0 items-center gap-1'>
                        <input
                          className={cn(cell, 'w-24')}
                          inputMode='decimal'
                          value={r.percent}
                          onChange={(e) =>
                            setPercent(r.fiberCode, sanitizeDecimal(e.target.value, 2))
                          }
                        />
                        <Text size='small'>%</Text>
                      </div>
                    </div>
                  ))}
                </div>

                {/* running total + meter */}
                <div className='flex items-center justify-between gap-2'>
                  <Button
                    type='button'
                    variant='secondary'
                    className='uppercase'
                    onClick={distributeEvenly}
                  >
                    distribute evenly
                  </Button>
                  <Text variant={valid ? 'label' : 'error'} size='small'>
                    total {Number(total.toFixed(2))}%{valid ? ' ✓' : ' / 100'}
                  </Text>
                </div>
                <div className='h-1.5 w-full bg-textInactiveColor/30'>
                  <div
                    className={cn('h-full transition-all', over ? 'bg-error' : 'bg-textColor')}
                    style={{ width: `${Math.min(Math.max(total, 0), 100)}%` }}
                  />
                </div>
              </>
            )}

            {step === 'review' && (
              <>
                {rows.length === 0 ? (
                  <Text size='small' variant='inactive'>
                    No fibres selected — composition will be left unset.
                  </Text>
                ) : (
                  <div className='border border-textInactiveColor'>
                    {rows.map((r) => (
                      <div
                        key={r.fiberCode}
                        className='flex items-center justify-between gap-3 border-b border-textInactiveColor/40 px-3 py-1.5'
                      >
                        <Text size='small' variant='inactive' className='min-w-0 truncate'>
                          {fiberLabel(r.fiberCode)}
                        </Text>
                        <Text size='small'>{r.percent ? `${r.percent}%` : '—'}</Text>
                      </div>
                    ))}
                    <div className='flex items-center justify-between gap-3 px-3 py-1.5'>
                      <Text size='small' variant='uppercase'>
                        total
                      </Text>
                      <Text size='small' variant={valid ? 'label' : 'error'}>
                        {Number(total.toFixed(2))}%{valid ? ' ✓' : ' / 100'}
                      </Text>
                    </div>
                  </div>
                )}

                {!valid && rows.length > 0 && (
                  <Text variant='error' size='small'>
                    {!complete
                      ? 'every fibre needs a percent greater than 0'
                      : !unique
                        ? 'a fibre is listed twice — remove the duplicate'
                        : `must sum to 100% (now ${Number(total.toFixed(2))}%)`}
                  </Text>
                )}
              </>
            )}
          </div>

          {/* footer nav */}
          <div className='sticky bottom-0 flex items-center justify-between gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
            <div>
              {step !== 'fibres' && (
                <Button
                  type='button'
                  variant='secondary'
                  size='lg'
                  onClick={() =>
                    setStep(step === 'review' ? (rows.length > 0 ? 'percent' : 'fibres') : 'fibres')
                  }
                >
                  back
                </Button>
              )}
            </div>
            <div className='flex gap-2'>
              {step === 'fibres' && (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  onClick={() => setStep(rows.length > 0 ? 'percent' : 'review')}
                >
                  next
                </Button>
              )}
              {step === 'percent' && (
                <Button type='button' variant='main' size='lg' onClick={() => setStep('review')}>
                  review
                </Button>
              )}
              {step === 'review' && (
                <Button type='button' variant='main' size='lg' disabled={!valid} onClick={finish}>
                  {rows.length === 0 ? 'leave unset' : 'save composition'}
                </Button>
              )}
            </div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
