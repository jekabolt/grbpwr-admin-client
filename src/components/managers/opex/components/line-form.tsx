import { OpexLine, OpexLineInsert } from 'api/proto-http/admin';
import { errorText, isRefused, reasonOf } from 'components/managers/accounting/utils/feedback';
import { notify } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { CalloutBox, ConfirmationModal, Text, EmptyCell } from 'ui';
import { decimalToInput, normalizeDecimalInput, parseDecimalNumber } from 'utils/decimal';
import { monthToApi, useDeleteOpexLine, useUpsertOpexLines } from '../utils/hooks';
import { isRecurringLine, opexVatRegimeOptions } from '../utils/options';
import { AmountInput, CategorySelect, CurrencySelect, Field, fieldCls } from './fields';

// opxLineEdit v1 (keep) — edit one manual OPEX line for a month (creation goes through the wizard),
// now on the shared ConfirmationModal shell. OpexLineInsert carries no id, so the server upserts by
// natural key (month, category, label): an amount-only edit is a plain upsert, but changing the
// category/label also deletes the old row (after the new one is safely written) so it isn't
// orphaned. `lines` = the month's current lines, used to refuse silent natural-key clobbers.
//
// opxVat v2 — the optional "document" group (below the fold) surfaces the VAT/purchase-register
// fields OpexLineInsert already carries (vat_amount, vat_regime, doc_number, doc_date,
// supplier_vat_id, supplier_name). None are required to save a line; the only rule mirrors the
// backend — a VAT amount needs a regime.

type Draft = {
  category: string;
  label: string;
  amount: string;
  currency: string;
  note: string;
  vatAmount: string;
  vatRegime: string;
  docNumber: string;
  docDate: string;
  supplierVatId: string;
  supplierName: string;
};

const emptyDraft = (): Draft => ({
  category: 'salaries',
  label: '',
  amount: '',
  currency: 'EUR',
  note: '',
  vatAmount: '',
  vatRegime: '',
  docNumber: '',
  docDate: '',
  supplierVatId: '',
  supplierName: '',
});

const hasDoc = (l?: OpexLine) =>
  !!(
    l?.vatAmount?.value ||
    l?.vatRegime ||
    l?.docNumber ||
    l?.docDate ||
    l?.supplierVatId ||
    l?.supplierName
  );

export function LineFormModal({
  open,
  onOpenChange,
  month,
  existing,
  lines = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  month: string;
  existing?: OpexLine;
  lines?: OpexLine[];
}) {
  const upsert = useUpsertOpexLines();
  // A check or refusal stands over the form until the next edit or attempt; `field` goes red.
  const [formError, setFormError] = useState<{ text: string; field?: keyof Draft } | null>(null);
  const del = useDeleteOpexLine();
  const busy = upsert.isPending || del.isPending;

  const [d, setD] = useState<Draft>(emptyDraft());
  // Document group opens itself when the line already carries VAT/doc data, so an edit never hides
  // populated fields; a fresh line keeps it folded away.
  const [docOpen, setDocOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setDocOpen(hasDoc(existing));
    setD(
      existing
        ? {
            category: existing.category ?? 'other',
            label: existing.label ?? '',
            amount: decimalToInput(existing.amount),
            currency: existing.currency ?? 'EUR',
            note: existing.note ?? '',
            vatAmount: decimalToInput(existing.vatAmount),
            vatRegime: existing.vatRegime ?? '',
            docNumber: existing.docNumber ?? '',
            docDate: existing.docDate ? existing.docDate.slice(0, 10) : '',
            supplierVatId: existing.supplierVatId ?? '',
            supplierName: existing.supplierName ?? '',
          }
        : emptyDraft(),
    );
  }, [existing, open]);

  const set = (patch: Partial<Draft>) => {
    setFormError(null);
    setD((prev) => ({ ...prev, ...patch }));
  };
  const bad = (field: keyof Draft) => formError?.field === field;

  // A line with a VAT amount but no document identity is still deducted in the app summary but
  // dropped from the generated JPK register — surface it as a soft caveat, not a blocker.
  const docIncomplete = useMemo(
    () => !!d.vatAmount.trim() && !d.docNumber.trim(),
    [d.vatAmount, d.docNumber],
  );

  const submit = async () => {
    if (!d.label.trim() || !d.amount.trim()) {
      setFormError({
        text: 'enter a label and amount',
        field: d.label.trim() ? 'amount' : 'label',
      });
      return;
    }
    const amountNum = parseDecimalNumber(d.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      setFormError({ text: 'amount must be a non-negative number', field: 'amount' });
      return;
    }
    // opxVat v2: mirror the backend rule — a VAT amount needs a regime (and vice-versa is fine: a
    // regime with no amount is simply ignored).
    if (d.vatAmount.trim()) {
      const vatNum = parseDecimalNumber(d.vatAmount);
      if (!Number.isFinite(vatNum) || vatNum < 0) {
        setFormError({ text: 'VAT amount must be a non-negative number', field: 'vatAmount' });
        setDocOpen(true);
        return;
      }
      if (!d.vatRegime) {
        setFormError({
          text: 'a VAT amount needs a regime (domestic PL / UK)',
          field: 'vatRegime',
        });
        setDocOpen(true);
        return;
      }
    }

    const monthApi = monthToApi(month);
    const line: OpexLineInsert = {
      month: monthApi,
      category: d.category.trim() || 'other',
      label: d.label.trim(),
      amount: { value: normalizeDecimalInput(d.amount) },
      currency: d.currency,
      note: d.note.trim(),
      vatAmount: d.vatAmount.trim() ? { value: normalizeDecimalInput(d.vatAmount) } : undefined,
      vatRegime: d.vatRegime || undefined,
      docNumber: d.docNumber.trim() || undefined,
      docDate: d.docDate || undefined,
      supplierVatId: d.supplierVatId.trim() || undefined,
      supplierName: d.supplierName.trim() || undefined,
    };
    // The server upserts by (month, category, label): refuse to silently clobber a different
    // existing line — a worker-owned ⟳ line especially — under the same key.
    const collision = lines.find(
      (l) =>
        l.id !== existing?.id &&
        (l.category || 'other') === line.category &&
        (l.label || '') === line.label,
    );
    if (collision) {
      setFormError({
        text: isRecurringLine(collision)
          ? 'a recurring (⟳) line already uses this category + label this month'
          : 'a line with this category + label already exists this month — edit that line instead',
        field: 'label',
      });
      return;
    }
    setFormError(null);
    try {
      // Write the new row first, THEN drop the old one when the natural key changed: the reverse
      // order loses the line entirely if the upsert fails after the delete.
      await upsert.mutateAsync([line]);
      const keyChanged =
        existing &&
        (existing.category !== line.category ||
          existing.label !== line.label ||
          existing.month !== monthApi);
      if (existing?.id && keyChanged) {
        try {
          await del.mutateAsync(existing.id);
        } catch (e) {
          notify({
            sev: 'warn',
            subject: `OPEX ${line.label}`,
            text: 'saved',
            bad: 'old line not removed',
            detail: errorText(e, 'delete the old line manually'),
          });
          onOpenChange(false);
          return;
        }
      }
      // No receipt: the line shows in the month's table.
      onOpenChange(false);
    } catch (e) {
      const said = errorText(e, 'failed to save line') ?? '';
      if (isRefused(e)) {
        setFormError({ text: said });
        return;
      }
      notify({
        sev: 'error',
        subject: `OPEX ${line.label}`,
        text: 'not saved',
        bad: reasonOf(e),
        detail: said,
      });
    }
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={submit}
      title={existing ? 'edit line' : 'add line'}
      confirmLabel={existing ? 'save' : 'add'}
      confirmDisabled={busy}
      closeOnConfirm={false}
      width='md'
    >
      <div className='flex flex-col gap-2.5'>
        <Field label='category'>
          <CategorySelect value={d.category} onChange={(v) => set({ category: v })} />
        </Field>
        <Field label='label'>
          <input
            className={fieldCls}
            value={d.label}
            aria-invalid={bad('label') || undefined}
            onChange={(e) => set({ label: e.target.value })}
            placeholder='e.g. seamstress Maria'
          />
        </Field>
        <div className='grid grid-cols-[1fr_7rem] gap-2'>
          <Field label='amount'>
            <AmountInput
              value={d.amount}
              invalid={bad('amount')}
              onChange={(v) => set({ amount: v })}
            />
          </Field>
          <Field label='currency'>
            <CurrencySelect value={d.currency} onChange={(v) => set({ currency: v })} />
          </Field>
        </div>
        <Field label='note (optional)'>
          <input
            className={fieldCls}
            value={d.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </Field>

        {/* opxVat v2: the document group is optional and folded away by default. */}
        <div className='border-t border-borderColor pt-2.5'>
          <button
            type='button'
            aria-expanded={docOpen}
            onClick={() => setDocOpen((v) => !v)}
            className='flex w-full items-center gap-1.5 text-left text-labelColor hover:text-textColor'
          >
            <span aria-hidden className='inline-block w-3 tabular-nums'>
              {docOpen ? <EmptyCell /> : '+'}
            </span>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='font-bold uppercase'
            >
              document / VAT (optional)
            </Text>
          </button>

          {docOpen && (
            <div className='mt-2 flex flex-col gap-2.5'>
              <div className='grid grid-cols-[1fr_9rem] gap-2'>
                <Field label='VAT amount' hint={`in ${d.currency}`}>
                  <AmountInput
                    value={d.vatAmount}
                    invalid={bad('vatAmount')}
                    onChange={(v) => set({ vatAmount: v })}
                  />
                </Field>
                <Field label='VAT regime'>
                  <select
                    className={fieldCls}
                    value={d.vatRegime}
                    aria-invalid={bad('vatRegime') || undefined}
                    onChange={(e) => set({ vatRegime: e.target.value })}
                  >
                    {opexVatRegimeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className='grid grid-cols-2 gap-2'>
                <Field label='invoice no.'>
                  <input
                    className={fieldCls}
                    value={d.docNumber}
                    onChange={(e) => set({ docNumber: e.target.value })}
                    placeholder='e.g. FV/2026/07/12'
                  />
                </Field>
                <Field label='invoice date'>
                  <input
                    className={fieldCls}
                    type='date'
                    value={d.docDate}
                    onChange={(e) => set({ docDate: e.target.value })}
                  />
                </Field>
              </div>
              <div className='grid grid-cols-2 gap-2'>
                <Field label='supplier VAT id'>
                  <input
                    className={fieldCls}
                    value={d.supplierVatId}
                    onChange={(e) => set({ supplierVatId: e.target.value })}
                    placeholder='e.g. PL1234567890'
                  />
                </Field>
                <Field label='supplier name'>
                  <input
                    className={fieldCls}
                    value={d.supplierName}
                    onChange={(e) => set({ supplierName: e.target.value })}
                  />
                </Field>
              </div>
              {docIncomplete && (
                <Text size='micro' variant='label' component='span'>
                  VAT with no invoice number is still deducted in the summary but left out of the
                  generated JPK register.
                </Text>
              )}
            </div>
          )}
        </div>
        {formError && <CalloutBox tone='error'>{formError.text}</CalloutBox>}
      </div>
    </ConfirmationModal>
  );
}
