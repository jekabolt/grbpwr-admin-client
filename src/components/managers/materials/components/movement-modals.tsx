import * as DialogPrimitives from '@radix-ui/react-dialog';
import { common_Material, common_MaterialMovement } from 'api/proto-http/admin';
import { useSuppliers } from 'components/managers/accounting/utils/hooks';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { EntityPicker } from 'components/managers/tasks/components/entity-picker';
import { runConfig, sampleConfig } from 'components/managers/tasks/utils/entity-configs';
import { EXPENSE_CURRENCIES } from 'constants/constants';
import {
  FailNote,
  isRefusal,
  notifyFailure,
} from 'components/managers/production-runs/components/feedback';
import { notify } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { ReactNode, useEffect, useState } from 'react';
import { AddDoor, Button, Close, Text } from 'ui';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { InvoiceDrop, useInvoiceUpload } from './invoice-drop';
import { MaterialPickerDialog } from './material-picker';
import {
  useAdjustMaterialStock,
  useIssueMaterialStock,
  useMaterialLots,
  useReceiveMaterialStockBatch,
} from './useWarehouse';

const cell = 'w-full border border-borderColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// The material a movement acts on. Callers pass a label (code · name) and unit for display;
// the balance (onHand) is passed where known (the stock tab) to power the over-issue guard.
export type MovementTarget = {
  materialId: number;
  materialLabel: string;
  unit: string;
  onHand?: string;
};

function todayISO(): string {
  // Local date parts, not toISOString(): the warehouse user's "today" is their wall-clock
  // date, and UTC is a day off around midnight in non-UTC timezones.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// The balance change straight from the posted ledger row. The dialog is gone by then and no screen
// shows before → after, so it is the one receipt kept as an ok toast (never logged).
function posted(target: MovementTarget, m?: common_MaterialMovement) {
  notify({
    sev: 'ok',
    subject: target.materialLabel.toUpperCase(),
    text: 'posted',
    detail: `on hand ${decimalToInput(m?.onHandBefore) || '0'} → ${
      decimalToInput(m?.onHandAfter) || '0'
    }`,
  });
}

// Money path (stock valuation): no retry from the toast; a refusal stays in the dialog.
function failed(target: MovementTarget, text: string, e: unknown, setFail: (v: string) => void) {
  const sentence = e instanceof Error ? e.message : text;
  if (isRefusal(e)) setFail(sentence);
  else notifyFailure(target.materialLabel.toUpperCase(), text, e, sentence);
}

// Shared raw-dialog shell (not ConfirmationModal, which auto-closes on confirm — a validation
// error must keep the modal open). Mirrors receive-modal's chrome.
function MovementDialog({
  open,
  onOpenChange,
  title,
  busy,
  blocked = false,
  onSubmit,
  submitLabel,
  fail,
  failVerb,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  busy: boolean;
  /** Submit is held (e.g. an attachment still uploading) without reading as `saving…`. */
  blocked?: boolean;
  onSubmit: () => void;
  submitLabel: string;
  /** A failed check or the server's refusal: one line above the footer. */
  fail: string | null;
  failVerb: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-borderColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[440px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-borderColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg'>{title}</DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Close />
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>{title}</DialogPrimitives.Description>
          <div className='flex flex-col gap-3 p-4'>
            {children}
            <FailNote verb={failVerb} text={fail} />
          </div>
          <div className='sticky bottom-0 flex justify-end gap-2 border-t border-borderColor bg-bgColor px-4 py-3'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              disabled={busy || blocked}
              onClick={onSubmit}
            >
              {busy ? 'saving…' : submitLabel}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className='flex flex-col gap-1'>
      <Text size='small'>{label}</Text>
      {children}
    </label>
  );
}

// ---- Receive (purchase-in) ------------------------------------------------------------------

// Input-VAT treatment for the extended M1 posting rule (phase 2). Matches the backend's accepted
// set (wnt|import|domestic_pl|domestic_uk); '' = not recorded.
const vatRegimeOptions = [
  { value: 'wnt', label: 'WNT (intra-EU)' },
  { value: 'import', label: 'import' },
  { value: 'domestic_pl', label: 'domestic PL' },
  { value: 'domestic_uk', label: 'domestic UK' },
];

// One material of the invoice. `key` is local (React identity), never sent.
type ReceiveLine = {
  key: number;
  materialId: number;
  label: string;
  unit: string;
  quantity: string;
  unitCost: string;
  lot: string;
  showLot: boolean;
};

let lineKey = 0;
const newLine = (materialId: number, label: string, unit: string): ReceiveLine => ({
  key: ++lineKey,
  materialId,
  label,
  unit,
  quantity: '',
  unitCost: '',
  lot: '',
  showLot: false,
});

const pickedLabel = (m: common_Material) =>
  `${m.code ? `${m.code} · ` : ''}${m.name || `#${m.id}`}`;

// A positive finite number from a decimal input, else NaN.
const positive = (v: string) => {
  const n = parseDecimalNumber(v);
  return Number.isFinite(n) && n > 0 ? n : NaN;
};

// One supplier invoice → several materials, posted in ONE transaction (ReceiveMaterialStockBatch,
// even for a single line). Delivery and input VAT are invoice totals; the server allocates both
// across the lines in proportion to each line's net.
export function ReceiveStockModal({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: MovementTarget;
}) {
  const [fail, setFail] = useState<string | null>(null);
  const { canWriteCosting } = usePermissions();
  const receive = useReceiveMaterialStockBatch();
  // Supplier catalog for the AP-by-supplier tag (phase 2, wave 4): a costed receipt accrues 2010
  // Accounts Payable, and tagging it here groups that payable under the counterparty on the AP/AR
  // screen. Optional — 0 = untagged. Only fetched while the modal is mounted (it opens conditionally).
  const { data: suppliersData } = useSuppliers();
  const suppliers = suppliersData?.suppliers ?? [];
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [picking, setPicking] = useState(false);
  const [currency, setCurrency] = useState('EUR');
  const [delivery, setDelivery] = useState('');
  // Recoverable input VAT for the whole invoice (base currency EUR) + its regime — kept separate
  // from the NET unit costs so the two aren't double-counted. Both optional; both or neither.
  const [inputVat, setInputVat] = useState('');
  const [inputVatRegime, setInputVatRegime] = useState('');
  const [supplierId, setSupplierId] = useState(0);
  const [supplierDoc, setSupplierDoc] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [comment, setComment] = useState('');
  // The supplier's invoice, uploaded to the files library first; the receipt carries its id.
  const invoice = useInvoiceUpload();
  const clearInvoice = invoice.clear;

  useEffect(() => {
    if (!open) return;
    setFail(null);
    clearInvoice();
    // Line 1 is the material the dialog was opened from.
    setLines([newLine(target.materialId, target.materialLabel, target.unit)]);
    setCurrency('EUR');
    setDelivery('');
    setInputVat('');
    setInputVatRegime('');
    setSupplierId(0);
    setSupplierDoc('');
    setExpectedAt('');
    setOccurredAt(todayISO());
    setComment('');
  }, [open, clearInvoice, target.materialId, target.materialLabel, target.unit]);

  const patchLine = (key: number, patch: Partial<ReceiveLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));
  const addMaterial = (m?: common_Material) => {
    setPicking(false);
    const id = Number(m?.id) || 0;
    if (!m || !id) return;
    // A material appears once per invoice (the server refuses duplicates).
    setLines((ls) =>
      ls.some((l) => l.materialId === id) ? ls : [...ls, newLine(id, pickedLabel(m), m.unit ?? '')],
    );
  };

  // Invoice cross-check: Σ line net + delivery, + VAT = the invoice's gross total. Only computable
  // in EUR (input VAT is always base-EUR); it catches a GROSS price typed into net / u.
  const totals = (() => {
    if (!canWriteCosting || currency !== 'EUR') return null;
    let net = 0;
    for (const l of lines) {
      const q = positive(l.quantity);
      const c = positive(l.unitCost);
      if (Number.isNaN(q) || Number.isNaN(c)) return null;
      net += q * c;
    }
    const d = parseDecimalNumber(delivery);
    if (Number.isFinite(d) && d > 0) net += d;
    const v = parseDecimalNumber(inputVat);
    const vat = Number.isFinite(v) && v > 0 ? v : 0;
    return net > 0 ? { net, vat } : null;
  })();

  const submit = async () => {
    if (invoice.uploading) return;
    setFail(null);
    if (lines.length === 0) {
      setFail('add a material');
      return;
    }
    if (lines.some((l) => Number.isNaN(positive(l.quantity)))) {
      setFail('quantity must be greater than zero');
      return;
    }
    // Input VAT is all-or-nothing (the backend rejects one without the other).
    const hasInputVat = inputVat.trim() !== '';
    if (canWriteCosting && hasInputVat !== (inputVatRegime !== '')) {
      setFail('input VAT needs both an amount and a regime, or neither');
      return;
    }
    // Delivery and VAT are split by line net — an unpriced line has no weight.
    const hasDelivery = parseDecimalNumber(delivery) > 0;
    if (
      canWriteCosting &&
      (hasDelivery || hasInputVat) &&
      lines.some((l) => Number.isNaN(positive(l.unitCost)))
    ) {
      setFail('every line needs a price');
      return;
    }
    // Any cost / VAT / delivery is a costing write; omitted otherwise (uncosted receipt).
    const costed = canWriteCosting && lines.some((l) => l.unitCost.trim() !== '');
    try {
      const res = await receive.mutateAsync({
        lines: lines.map((l) => ({
          materialId: l.materialId,
          quantity: inputToDecimal(l.quantity),
          unitCost: canWriteCosting ? inputToDecimal(l.unitCost) : undefined,
          lot: l.showLot ? l.lot.trim() : '',
        })),
        currency: costed || (canWriteCosting && hasDelivery) ? currency : '',
        supplierId: supplierId || undefined, // AP-by-supplier tag (phase 2, wave 4); 0 = untagged
        supplierDoc: supplierDoc.trim(),
        invoiceFileId: invoice.file?.id || undefined, // library_file id; 0/unset = none
        occurredAt,
        // When the delivery was promised (Phase 9) — lateness becomes a fact, no PO needed.
        expectedAt: expectedAt || '',
        comment: comment.trim(),
        inputVatAmount: canWriteCosting ? inputToDecimal(inputVat) : undefined,
        inputVatRegime: canWriteCosting && inputVatRegime ? inputVatRegime : undefined,
        deliveryCost: canWriteCosting ? inputToDecimal(delivery) : undefined,
      });
      const movements = res.movements ?? [];
      // One line keeps the before → after receipt; several get one toast, not one per line.
      if (lines.length === 1) {
        posted({ ...target, materialLabel: lines[0].label }, movements[0]);
      } else {
        notify({
          sev: 'ok',
          subject: (supplierDoc.trim() || 'IN').toUpperCase(),
          text: `${movements.length || lines.length} lines posted`,
        });
      }
      onOpenChange(false);
    } catch (e) {
      failed(target, 'not moved in', e, setFail);
    }
  };

  const lineCols = canWriteCosting
    ? 'sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem_auto]'
    : 'sm:grid-cols-[minmax(0,1fr)_6rem_auto]';

  return (
    <MovementDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`in · ${target.materialLabel}`}
      busy={receive.isPending}
      blocked={invoice.uploading}
      onSubmit={submit}
      submitLabel='in'
      fail={fail}
      failVerb='not moved in'
    >
      <InvoiceDrop invoice={invoice} />
      {suppliers.length > 0 ? (
        <Field label='supplier'>
          <select
            className={cell}
            value={supplierId || 0}
            onChange={(e) => setSupplierId(Number(e.target.value) || 0)}
          >
            <option value={0}>— none —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id ?? 0}>
                {s.name || `supplier #${s.id}`}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label='supplier doc'>
        <input
          className={cell}
          value={supplierDoc}
          onChange={(e) => setSupplierDoc(e.target.value)}
        />
      </Field>
      <div className='flex flex-col gap-1.5'>
        <div className={cn('hidden gap-1.5 sm:grid', lineCols)}>
          <Text size='small'>material</Text>
          <Text size='small'>qty</Text>
          {canWriteCosting ? <Text size='small'>net / u</Text> : null}
          <span className='w-4' />
        </div>
        {lines.map((l) => (
          <div key={l.key} className='flex flex-col gap-1'>
            {/* Phone: material + × on one row, qty and price under it. sm+: one grid row. */}
            <div className={cn('grid grid-cols-2 gap-1.5 sm:items-center', lineCols)}>
              <div className='col-span-2 flex items-center gap-1.5 sm:contents'>
                <div className={cn(cell, 'min-w-0 flex-1 truncate')} title={l.label}>
                  {l.label}
                </div>
                <Close
                  size='sm'
                  className='sm:order-last'
                  aria-label='remove line'
                  disabled={lines.length === 1}
                  onClick={() => removeLine(l.key)}
                />
              </div>
              <label
                className={cn(
                  cell,
                  'flex items-baseline gap-1 focus-within:border-textColor',
                  !canWriteCosting && 'col-span-2 sm:col-span-1',
                )}
              >
                <input
                  className='w-full min-w-0 bg-transparent outline-none'
                  inputMode='decimal'
                  placeholder='qty'
                  aria-label={`quantity · ${l.label}`}
                  value={l.quantity}
                  onChange={(e) => patchLine(l.key, { quantity: sanitizeDecimal(e.target.value) })}
                />
                <span className='text-labelColor'>{l.unit}</span>
              </label>
              {canWriteCosting ? (
                <input
                  className={cell}
                  inputMode='decimal'
                  placeholder='net / u'
                  aria-label={`net per unit · ${l.label}`}
                  value={l.unitCost}
                  onChange={(e) => patchLine(l.key, { unitCost: sanitizeDecimal(e.target.value) })}
                />
              ) : null}
            </div>
            {l.showLot ? (
              <input
                className={cell}
                placeholder='lot / roll'
                aria-label={`lot · ${l.label}`}
                value={l.lot}
                onChange={(e) => patchLine(l.key, { lot: e.target.value })}
              />
            ) : (
              <Button
                type='button'
                variant='underline'
                size='xs'
                className='self-start px-0'
                onClick={() => patchLine(l.key, { showLot: true })}
              >
                + lot
              </Button>
            )}
          </div>
        ))}
        <AddDoor shape='inline' onClick={() => setPicking(true)}>
          material
        </AddDoor>
      </div>
      {canWriteCosting ? (
        <>
          <div className='grid grid-cols-[1fr_auto] gap-2'>
            <Field label='delivery (net)'>
              <input
                className={cell}
                inputMode='decimal'
                value={delivery}
                onChange={(e) => setDelivery(sanitizeDecimal(e.target.value))}
              />
            </Field>
            <Field label='currency'>
              <select
                className={cell}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {EXPENSE_CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className='grid grid-cols-[1fr_auto] gap-2'>
            <Field label='vat (eur)'>
              <input
                className={cell}
                inputMode='decimal'
                value={inputVat}
                onChange={(e) => setInputVat(sanitizeDecimal(e.target.value))}
              />
            </Field>
            <Field label='vat regime'>
              <select
                className={cell}
                value={inputVatRegime}
                onChange={(e) => setInputVatRegime(e.target.value)}
              >
                <option value=''>— none —</option>
                {vatRegimeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {totals ? (
            <div className='flex items-baseline justify-between gap-2 border-t border-hairline pt-2'>
              <Text size='small' component='span'>
                net {totals.net.toFixed(2)} + vat {totals.vat.toFixed(2)}
              </Text>
              <Text size='small' component='span'>
                {(totals.net + totals.vat).toFixed(2)} eur
              </Text>
            </div>
          ) : null}
        </>
      ) : null}
      <Field label='date'>
        <input
          className={cell}
          type='date'
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
      </Field>
      <Field label='expected'>
        <input
          className={cell}
          type='date'
          value={expectedAt}
          onChange={(e) => setExpectedAt(e.target.value)}
        />
      </Field>
      <Field label='comment'>
        <input className={cell} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <MaterialPickerDialog
        open={picking}
        clearable={false}
        title='add material'
        confirmLabel='add'
        onPick={addMaterial}
        onClose={() => setPicking(false)}
      />
    </MovementDialog>
  );
}

// ---- Issue / return -------------------------------------------------------------------------

export function IssueStockModal({
  open,
  onOpenChange,
  target,
  defaultTarget,
  defaultQty,
  lockTarget,
  colorways,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: MovementTarget;
  // Prefill + optionally lock the issue target (run detail / sample panel pass this).
  defaultTarget?: { productionRunId?: number; sampleId?: number };
  defaultQty?: string;
  lockTarget?: boolean;
  // gap-07 v2 C: the run's colourways, so a run issue can be attributed to the product it was cut
  // for (feeds ProductionRunActuals.by_colorway). Only meaningful when issuing to a run.
  colorways?: { productId: number; label: string }[];
}) {
  const [fail, setFail] = useState<string | null>(null);
  const issue = useIssueMaterialStock();
  const [quantity, setQuantity] = useState('');
  const [targetKind, setTargetKind] = useState<'run' | 'sample'>('run');
  const [targetId, setTargetId] = useState('');
  const [isReturn, setIsReturn] = useState(false);
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [comment, setComment] = useState('');
  // gap-07 v2 D: optionally attribute the issue to a specific received lot (roll / dye-lot) for
  // traceability — informational only, never a costing basis.
  const [lotId, setLotId] = useState(0);
  // gap-07 v2 C: which colourway (product) this fabric was cut for; 0 = whole run (unattributed).
  const [productId, setProductId] = useState(0);

  const defRun = defaultTarget?.productionRunId ?? 0;
  const defSample = defaultTarget?.sampleId ?? 0;
  // Depend on primitives, not the defaultTarget object — a fresh literal from a parent re-render
  // (e.g. a stock refetch) must not reset the form mid-edit.
  useEffect(() => {
    if (!open) return;
    setFail(null);
    setQuantity(defaultQty ?? '');
    setTargetKind(defSample > 0 ? 'sample' : 'run');
    setTargetId(defSample > 0 ? String(defSample) : defRun > 0 ? String(defRun) : '');
    setIsReturn(false);
    setOccurredAt(todayISO());
    setComment('');
    setLotId(0);
    setProductId(0);
  }, [open, defaultQty, defRun, defSample]);

  // Lots to draw from: this material's non-archived batches with stock left. Only fetched while
  // the modal is open (a returned lot with 0 remaining stays selectable if it was pre-picked).
  const { data: lotsData } = useMaterialLots(
    target.materialId,
    false,
    open && target.materialId > 0,
  );
  const lots = (lotsData?.lots ?? []).filter(
    (l) => l.id === lotId || Number(l.remainingQty?.value ?? '0') > 0,
  );

  const qtyNum = parseDecimalNumber(quantity);
  const onHandNum = parseDecimalNumber(target.onHand);
  const overStock =
    !isReturn &&
    target.onHand != null &&
    Number.isFinite(qtyNum) &&
    Number.isFinite(onHandNum) &&
    qtyNum > onHandNum;

  const submit = async () => {
    setFail(null);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setFail('quantity must be greater than zero');
      return;
    }
    const id = Number(targetId) || 0;
    if (id <= 0) {
      setFail(`enter the ${targetKind === 'run' ? 'production run' : 'sample'} id`);
      return;
    }
    try {
      const res = await issue.mutateAsync({
        materialId: target.materialId,
        quantity: inputToDecimal(quantity),
        productionRunId: targetKind === 'run' ? id : 0,
        sampleId: targetKind === 'sample' ? id : 0,
        isReturn,
        occurredAt,
        comment: comment.trim(),
        // gap-07 v2: colourway (product_id) attribution only applies to a run issue; lot (lot_id)
        // is optional traceability. Both default to 0 (whole-run / unspecified).
        productId: targetKind === 'run' ? productId : 0,
        lotId,
      });
      posted(target, res.movement);
      onOpenChange(false);
    } catch (e) {
      failed(target, isReturn ? 'not returned' : 'not moved out', e, setFail);
    }
  };

  return (
    <MovementDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${isReturn ? 'return' : 'out'} · ${target.materialLabel}`}
      busy={issue.isPending}
      onSubmit={submit}
      submitLabel={isReturn ? 'return' : 'out'}
      fail={fail}
      failVerb={isReturn ? 'not returned' : 'not moved out'}
    >
      {target.onHand != null ? (
        <Text variant='inactive' size='small'>
          on hand: {decimalToInput(inputToDecimal(target.onHand)) || '0'} {target.unit}
        </Text>
      ) : null}
      <Field label={`quantity (${target.unit || 'unit'})`}>
        <input
          className={cell}
          inputMode='decimal'
          value={quantity}
          onChange={(e) => setQuantity(sanitizeDecimal(e.target.value))}
        />
      </Field>
      {overStock ? (
        <Text size='small'>! exceeds stock by {(qtyNum - onHandNum).toFixed(2)}</Text>
      ) : null}

      {lockTarget ? (
        <Text variant='inactive' size='small'>
          into {targetKind === 'run' ? `PR-${targetId}` : `sample #${targetId}`}
        </Text>
      ) : (
        <div className='flex flex-col gap-2'>
          <div className='flex gap-3'>
            <label className='flex items-center gap-1'>
              <input
                type='radio'
                checked={targetKind === 'run'}
                onChange={() => setTargetKind('run')}
              />
              <Text size='small'>production run</Text>
            </label>
            <label className='flex items-center gap-1'>
              <input
                type='radio'
                checked={targetKind === 'sample'}
                onChange={() => setTargetKind('sample')}
              />
              <Text size='small'>sample</Text>
            </label>
          </div>
          {/* gap-04 (M2): a searchable run/sample picker — a mistyped raw id silently books the
              movement (and its cost) against the wrong run. key by kind so switching run<>sample
              resets the picker instead of showing a stale resolved label. */}
          <Field label={targetKind === 'run' ? 'production run' : 'sample'}>
            <EntityPicker
              key={targetKind}
              config={targetKind === 'run' ? runConfig : sampleConfig}
              value={Number(targetId) || 0}
              onChange={(v) => setTargetId(v ? String(v) : '')}
            />
          </Field>
        </div>
      )}

      {targetKind === 'run' && colorways && colorways.length > 0 ? (
        <Field label='colourway'>
          <select
            className={cell}
            value={productId || 0}
            onChange={(e) => setProductId(Number(e.target.value) || 0)}
          >
            <option value={0}>— whole run (unattributed) —</option>
            {colorways.map((c) => (
              <option key={c.productId} value={c.productId}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <label className='flex items-center gap-2'>
        <input type='checkbox' checked={isReturn} onChange={(e) => setIsReturn(e.target.checked)} />
        <Text size='small'>return</Text>
      </label>
      <Field label='date'>
        <input
          className={cell}
          type='date'
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
      </Field>
      {lots.length > 0 ? (
        <div className='flex flex-col gap-1'>
          <Field label='lot'>
            <select
              className={cell}
              value={lotId || 0}
              onChange={(e) => setLotId(Number(e.target.value) || 0)}
            >
              <option value={0}>— any / unspecified —</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id ?? 0}>
                  {l.lotCode || `lot #${l.id}`} · rem {decimalToInput(l.remainingQty) || '0'}
                  {target.unit ? ` ${target.unit}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Text variant='inactive' size='small'>
            Draw from one received batch for traceability — leave as "any" if you don't track lots.
          </Text>
        </div>
      ) : null}
      <Field label='comment'>
        <input className={cell} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </MovementDialog>
  );
}

// ---- Adjust (set / adjust ± / write off) ----------------------------------------------------

const adjustReasonOptions = [
  { value: 'stock_count', label: 'stock count' },
  { value: 'damage', label: 'damage' },
  { value: 'loss', label: 'loss' },
  { value: 'found', label: 'found' },
  { value: 'correction', label: 'correction' },
  { value: 'packaging', label: 'packaging' },
  { value: 'scrap', label: 'scrap' },
  { value: 'other', label: 'other' },
];

const adjustModeOptions: { value: 'set' | 'adjust' | 'writeoff'; label: string }[] = [
  { value: 'set', label: 'set count' },
  { value: 'adjust', label: 'adjust ±' },
  { value: 'writeoff', label: 'write off' },
];

export function AdjustStockModal({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: MovementTarget;
}) {
  const [fail, setFail] = useState<string | null>(null);
  const adjust = useAdjustMaterialStock();
  const [mode, setMode] = useState<'set' | 'adjust' | 'writeoff'>('set');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('stock_count');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!open) return;
    setFail(null);
    setMode('set');
    setQuantity('');
    setReason('stock_count');
    setComment('');
  }, [open]);

  // adjust takes a signed delta (leading minus allowed); set / writeoff take a magnitude.
  const onQtyChange = (raw: string) => {
    if (mode === 'adjust') {
      const neg = raw.trim().startsWith('-');
      setQuantity((neg ? '-' : '') + sanitizeDecimal(raw));
    } else {
      setQuantity(sanitizeDecimal(raw));
    }
  };

  // Mirror the issue modal's exceeds-stock hint for the modes that subtract stock
  // (write-off, negative adjust) — same situation, same warning.
  const qtyNum = parseDecimalNumber(quantity);
  const onHandNum = parseDecimalNumber(target.onHand);
  const removed = mode === 'writeoff' ? qtyNum : mode === 'adjust' && qtyNum < 0 ? -qtyNum : NaN;
  const overStock =
    target.onHand != null &&
    Number.isFinite(removed) &&
    Number.isFinite(onHandNum) &&
    removed > onHandNum;

  const submit = async () => {
    setFail(null);
    const n = parseDecimalNumber(quantity);
    if (!Number.isFinite(n) || (mode !== 'adjust' && n < 0)) {
      setFail('enter a valid quantity');
      return;
    }
    if (mode === 'adjust' && n === 0) {
      setFail('adjustment delta cannot be zero');
      return;
    }
    try {
      const res = await adjust.mutateAsync({
        materialId: target.materialId,
        mode,
        quantity: inputToDecimal(quantity),
        reason,
        comment: comment.trim(),
      });
      posted(target, res.movement);
      onOpenChange(false);
    } catch (e) {
      failed(target, 'not counted', e, setFail);
    }
  };

  return (
    <MovementDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`count · ${target.materialLabel}`}
      busy={adjust.isPending}
      onSubmit={submit}
      submitLabel='count'
      fail={fail}
      failVerb='not counted'
    >
      {target.onHand != null ? (
        <Text variant='inactive' size='small'>
          on hand: {decimalToInput(inputToDecimal(target.onHand)) || '0'} {target.unit}
        </Text>
      ) : null}
      <Field label='mode'>
        <select
          className={cell}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as 'set' | 'adjust' | 'writeoff');
            setQuantity('');
          }}
        >
          {adjustModeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={
          mode === 'set'
            ? `new on-hand count (${target.unit || 'unit'})`
            : mode === 'writeoff'
              ? `write-off quantity (${target.unit || 'unit'})`
              : `delta ± (${target.unit || 'unit'})`
        }
      >
        <input
          className={cell}
          inputMode='decimal'
          value={quantity}
          onChange={(e) => onQtyChange(e.target.value)}
        />
      </Field>
      {overStock ? (
        <Text size='small'>! exceeds stock by {(removed - onHandNum).toFixed(2)}</Text>
      ) : null}
      <Field label='reason'>
        <select className={cell} value={reason} onChange={(e) => setReason(e.target.value)}>
          {adjustReasonOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label='comment'>
        <input className={cell} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <Text variant='inactive' size='small'>
        The ledger is append-only — corrections post as new movements, never edits.
      </Text>
    </MovementDialog>
  );
}
