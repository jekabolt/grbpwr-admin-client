import * as DialogPrimitives from '@radix-ui/react-dialog';
import {
  common_Material,
  common_MaterialConversion,
  common_MaterialLot,
  common_MaterialMovement,
} from 'api/proto-http/admin';
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
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AddDoor, Arrow, Button, Chip, ChipRow, Close, Input, Select, Text } from 'ui';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { InvoiceDrop, useInvoiceUpload } from './invoice-drop';
import { MaterialModal } from './material-modal';
import { MaterialPickerDialog } from './material-picker';
import { MaterialThumb } from './material-thumb';
import { useMaterials } from './useMaterials';
import {
  useAdjustMaterialStock,
  useConvertMaterialStock,
  useIssueMaterialStock,
  useMaterialLots,
  useMaterialMovements,
  useReceiveMaterialStockBatch,
  useShrinkMaterialLot,
} from './useWarehouse';

const cell = 'w-full border border-borderColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// The material a movement acts on. Callers pass a label (code · name) and unit for display;
// the balance (onHand) is passed where known (the stock tab) to power the over-issue guard.
export type MovementTarget = {
  materialId: number;
  materialLabel: string;
  unit: string;
  onHand?: string;
  avgUnitCostBase?: string;
  baseCurrency?: string;
};

function todayISO(): string {
  // Local date parts, not toISOString(): the warehouse user's "today" is their wall-clock
  // date, and UTC is a day off around midnight in non-UTC timezones.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// ConvertMaterialStock takes a protobuf Timestamp, not the date-only string the older movement
// RPCs accept. Local noon keeps the picked wall-clock day for any UTC offset under 12 h.
function dayToTimestamp(day: string): string | undefined {
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// The balance change straight from the posted ledger row. The dialog is gone by then and no screen
// shows before → after, so it is the one receipt kept as an ok toast (never logged).
function posted(target: MovementTarget, m?: common_MaterialMovement, detail?: string) {
  notify({
    sev: 'ok',
    subject: target.materialLabel.toUpperCase(),
    text: 'posted',
    detail: detail ?? `on hand ${decimalToInput(m?.onHandAfter) || '0'}`,
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
  `${m.code ? `${m.code} · ` : ''}${m.name || 'material'}`;

// A positive finite number from a decimal input, else NaN.
const positive = (v: string) => {
  const n = parseDecimalNumber(v);
  return Number.isFinite(n) && n > 0 ? n : NaN;
};

const numId = (value: unknown): number => Number(value) || 0;

const newClientRequestId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `convert-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const countableMaterial = (material?: common_Material): boolean =>
  [
    'MATERIAL_UNIT_PCS',
    'MATERIAL_UNIT_PAIR',
    'MATERIAL_UNIT_SET',
    'MATERIAL_UNIT_CONE',
    'MATERIAL_UNIT_ROLL',
  ].includes(material?.unitCode ?? '') || /^(pcs?|pieces?)$/i.test(material?.unit?.trim() ?? '');

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

// ---- Convert --------------------------------------------------------------------------------

const quantityCell = 'h-9 min-h-9 pr-9 text-right';

function QuantityField({
  label,
  value,
  unit,
  inputRef,
  invalid,
  onChange,
}: {
  label: string;
  value: string;
  unit: string;
  inputRef?: React.Ref<HTMLInputElement>;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <span className='relative block'>
        <Input
          ref={inputRef}
          inputMode='decimal'
          value={value}
          aria-label={label}
          aria-invalid={invalid || undefined}
          className={quantityCell}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onChange(sanitizeDecimal(event.target.value))
          }
        />
        <Text
          component='span'
          size='micro'
          variant='label'
          className='pointer-events-none absolute right-2 top-1/2 -translate-y-1/2'
        >
          {unit}
        </Text>
      </span>
    </Field>
  );
}

export function ConvertStockModal({
  open,
  onOpenChange,
  target,
  defaultOut,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: MovementTarget;
  defaultOut?: string;
}) {
  const { canReadCosting, canWriteCosting } = usePermissions();
  const convert = useConvertMaterialStock();
  const materialsQuery = useMaterials('', false, open);
  const movementsQuery = useMaterialMovements({ materialId: target.materialId }, 50);
  const lotsQuery = useMaterialLots(target.materialId, false, open && target.materialId > 0);
  const { data: suppliersData } = useSuppliers();
  const suppliers = suppliersData?.suppliers ?? [];

  const [fail, setFail] = useState<string | null>(null);
  const [lotId, setLotId] = useState(0);
  const lotTouched = useRef(false);
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [intoId, setIntoId] = useState(0);
  const [createdInto, setCreatedInto] = useState<common_Material | undefined>();
  const [outQty, setOutQty] = useState('');
  const [inQty, setInQty] = useState('');
  const [showLoss, setShowLoss] = useState(false);
  const [lossQty, setLossQty] = useState('');
  const [workCost, setWorkCost] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [supplierId, setSupplierId] = useState(0);
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const requestId = useRef('');
  const defaultChecked = useRef(false);
  const supplierTouched = useRef(false);
  const outRef = useRef<HTMLInputElement>(null);
  const inRef = useRef<HTMLInputElement>(null);

  const materials = useMemo(() => materialsQuery.data?.materials ?? [], [materialsQuery.data]);
  const materialsById = useMemo(() => {
    const map = new Map<number, common_Material>();
    materials.forEach((material) => {
      const id = numId(material.id);
      if (id) map.set(id, material);
    });
    return map;
  }, [materials]);
  const movements = useMemo(
    () => movementsQuery.data?.pages.flatMap((page) => page.movements) ?? [],
    [movementsQuery.data],
  );
  const conversions = useMemo(() => {
    const map = new Map<number, common_MaterialConversion>();
    (movementsQuery.data?.pages ?? []).forEach((page) => {
      page.conversions.forEach((conversion, id) => map.set(id, conversion));
    });
    return map;
  }, [movementsQuery.data]);

  const recentOutputIds = useMemo(() => {
    const ids: number[] = [];
    movements.forEach((movement) => {
      if (movement.movementType !== 'MATERIAL_MOVEMENT_TYPE_CONVERT_OUT') return;
      const conversion = conversions.get(numId(movement.conversionId));
      const output = conversion?.lines?.find(
        (line) => line.movement?.movementType === 'MATERIAL_MOVEMENT_TYPE_CONVERT_IN',
      );
      const id = numId(output?.movement?.materialId);
      if (id && id !== target.materialId && materialsById.has(id) && !ids.includes(id))
        ids.push(id);
    });
    return ids;
  }, [conversions, materialsById, movements, target.materialId]);

  const preferredIds = useMemo(() => {
    const ids = materials
      .filter((material) => numId(material.sourceMaterialId) === target.materialId)
      .map((material) => numId(material.id))
      .filter((id) => id > 0 && id !== target.materialId);
    recentOutputIds.forEach((id) => {
      if (!ids.includes(id)) ids.push(id);
    });
    return ids;
  }, [materials, recentOutputIds, target.materialId]);

  const into =
    createdInto && numId(createdInto.id) === intoId ? createdInto : materialsById.get(intoId);

  const defaultSupplierId = useMemo(() => {
    if (!intoId) return 0;
    for (const movement of movements) {
      if (movement.movementType !== 'MATERIAL_MOVEMENT_TYPE_CONVERT_OUT') continue;
      const conversion = conversions.get(numId(movement.conversionId));
      const output = conversion?.lines?.find(
        (line) =>
          line.movement?.movementType === 'MATERIAL_MOVEMENT_TYPE_CONVERT_IN' &&
          numId(line.movement.materialId) === intoId,
      );
      if (output) return numId(conversion?.supplierId);
    }
    return 0;
  }, [conversions, intoId, movements]);

  useEffect(() => {
    if (!open) return;
    setFail(null);
    setPicking(false);
    setCreating(false);
    setIntoId(0);
    setCreatedInto(undefined);
    setOutQty(defaultOut ?? '');
    setInQty('');
    setShowLoss(false);
    setLossQty('');
    setWorkCost('');
    setCurrency('EUR');
    setSupplierId(0);
    setOccurredAt(todayISO());
    setLotId(0);
    lotTouched.current = false;
    requestId.current = newClientRequestId();
    defaultChecked.current = false;
    supplierTouched.current = false;
  }, [defaultOut, open]);

  useEffect(() => {
    if (!open || defaultChecked.current || !materialsQuery.isFetched || !movementsQuery.isFetched)
      return;
    defaultChecked.current = true;
    if (preferredIds.length !== 1) return;
    setIntoId(preferredIds[0]);
    setCreatedInto(undefined);
    supplierTouched.current = false;
  }, [materialsQuery.isFetched, movementsQuery.isFetched, open, preferredIds]);

  useEffect(() => {
    if (!open || !movementsQuery.isFetched || supplierTouched.current) return;
    setSupplierId(defaultSupplierId);
  }, [defaultSupplierId, intoId, movementsQuery.isFetched, open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (intoId && Number.isFinite(positive(outQty))) inRef.current?.focus();
      else outRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [intoId, open]);

  const pickInto = (material?: common_Material) => {
    setPicking(false);
    const id = numId(material?.id);
    if (!material || !id || id === target.materialId) return;
    setIntoId(id);
    setCreatedInto(material);
    supplierTouched.current = false;
    setFail(null);
  };

  const outNumber = parseDecimalNumber(outQty);
  const inNumber = parseDecimalNumber(inQty);
  const lossNumber = lossQty.trim() ? parseDecimalNumber(lossQty) : 0;
  const onHand = parseDecimalNumber(target.onHand);
  const overStock = Number.isFinite(outNumber) && Number.isFinite(onHand) && outNumber > onHand;
  const overLoss =
    Number.isFinite(lossNumber) && Number.isFinite(outNumber) && lossNumber > outNumber;
  const wholeUnits = countableMaterial(into);

  // A lot-less convert leaves the roll's remaining untouched (the server refuses it while a lot
  // covers the quantity), so the fullest lot is picked by default and «none» shows only when no
  // lot can cover what goes out.
  const lots = useMemo(
    () =>
      (lotsQuery.data?.lots ?? [])
        .filter((lot) => !lot.archived && parseDecimalNumber(decimalToInput(lot.remainingQty)) > 0)
        .sort(
          (a, b) =>
            parseDecimalNumber(decimalToInput(b.remainingQty)) -
            parseDecimalNumber(decimalToInput(a.remainingQty)),
        ),
    [lotsQuery.data],
  );
  const lotRemaining = (lot?: common_MaterialLot) =>
    parseDecimalNumber(decimalToInput(lot?.remainingQty));
  const wantOut = Number.isFinite(outNumber) && outNumber > 0 ? outNumber : 0;
  const lotCovers = lots.some((lot) => lotRemaining(lot) >= wantOut);
  const selectedLot = lots.find((lot) => numId(lot.id) === lotId);
  const overLot = !!selectedLot && wantOut > lotRemaining(selectedLot);

  useEffect(() => {
    if (!open || lotTouched.current) return;
    setLotId(lots.length ? numId(lots[0].id) : 0);
  }, [lots, open]);

  const costPreview = useMemo(() => {
    if (!canReadCosting || currency !== 'EUR' || target.baseCurrency !== 'EUR') return null;
    const average = parseDecimalNumber(target.avgUnitCostBase);
    const work = workCost.trim() ? parseDecimalNumber(workCost) : 0;
    if (
      !Number.isFinite(average) ||
      !Number.isFinite(outNumber) ||
      !Number.isFinite(inNumber) ||
      !Number.isFinite(work) ||
      outNumber <= 0 ||
      inNumber <= 0 ||
      work < 0
    )
      return null;
    return ((outNumber * average + work) / inNumber).toFixed(2);
  }, [
    canReadCosting,
    currency,
    inNumber,
    outNumber,
    target.avgUnitCostBase,
    target.baseCurrency,
    workCost,
  ]);

  const submit = async () => {
    setFail(null);
    if (!into || !intoId) return setFail('choose into');
    if (!Number.isFinite(outNumber) || outNumber <= 0) return setFail('out above zero');
    if (overStock) return setFail(`over ${target.onHand} ${target.unit}`);
    if (!Number.isFinite(inNumber) || inNumber <= 0) return setFail('in above zero');
    if (wholeUnits && !Number.isInteger(inNumber)) return setFail('whole units only');
    if (!Number.isFinite(lossNumber) || lossNumber < 0) return setFail('invalid loss');
    if (overLoss) return setFail('loss over out');
    if (!selectedLot && lotCovers) return setFail('choose lot');
    if (overLot) return setFail('over lot');
    try {
      const res = await convert.mutateAsync({
        inputs: [
          {
            materialId: target.materialId,
            quantity: inputToDecimal(outQty),
            lossQty: inputToDecimal(lossQty),
            lotId: selectedLot ? numId(selectedLot.id) : 0,
          },
        ],
        output: {
          materialId: intoId,
          quantity: inputToDecimal(inQty),
          lotCode: '',
          measuredWidthCm: undefined,
          shadeCode: '',
        },
        workCost: canWriteCosting ? inputToDecimal(workCost) : undefined,
        workCurrency: canWriteCosting && workCost.trim() ? currency : '',
        supplierId: supplierId || undefined,
        supplierDoc: '',
        comment: '',
        occurredAt: dayToTimestamp(occurredAt),
        clientRequestId: requestId.current,
      });
      const inputMovement = res.conversion?.lines?.find(
        (line) =>
          line.movement?.movementType === 'MATERIAL_MOVEMENT_TYPE_CONVERT_OUT' &&
          numId(line.movement.materialId) === target.materialId,
      )?.movement;
      const serverCost = decimalToInput(res.conversion?.outputUnitCostBase);
      posted(
        target,
        inputMovement,
        serverCost && into.unit
          ? `cost ${Number(serverCost).toFixed(2)} € / ${into.unit}`
          : undefined,
      );
      onOpenChange(false);
    } catch (error) {
      failed(target, 'not converted', error, setFail);
    }
  };

  return (
    <>
      <MovementDialog
        open={open}
        onOpenChange={onOpenChange}
        title={`convert · ${target.materialLabel}`}
        busy={convert.isPending}
        onSubmit={submit}
        submitLabel='convert'
        fail={fail}
        failVerb='not converted'
      >
        <Field label='into'>
          <Button
            type='button'
            variant='default'
            className='flex h-9 min-h-9 w-full items-center gap-2 border border-borderColor bg-bgColor px-2 text-left text-textBaseSize focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
            onClick={() => setPicking(true)}
          >
            {into ? <MaterialThumb material={into} size='sm' className='size-4' /> : null}
            <Text
              component='span'
              variant={into ? 'default' : 'label'}
              className='min-w-0 flex-1 truncate'
            >
              {into ? pickedLabel(into) : 'choose'}
            </Text>
            <span aria-hidden className='shrink-0 rotate-180'>
              <Arrow />
            </span>
          </Button>
        </Field>

        <div className='grid grid-cols-2 gap-2'>
          <QuantityField
            label='out'
            value={outQty}
            unit={target.unit}
            inputRef={outRef}
            invalid={overStock}
            onChange={setOutQty}
          />
          <QuantityField
            label='in'
            value={inQty}
            unit={into?.unit ?? ''}
            inputRef={inRef}
            invalid={wholeUnits && Number.isFinite(inNumber) && !Number.isInteger(inNumber)}
            onChange={setInQty}
          />
        </div>
        {overStock ? (
          <Text size='micro' variant='error'>
            ! over {target.onHand} {target.unit}
          </Text>
        ) : null}

        {lots.length ? (
          <Field label='lot'>
            <ChipRow>
              {lots.map((lot) => {
                const id = numId(lot.id);
                const selected = id === lotId;
                return (
                  <Chip
                    key={id}
                    selected={selected}
                    pressed={selected}
                    onClick={() => {
                      lotTouched.current = true;
                      setLotId(id);
                      setFail(null);
                    }}
                  >
                    {lot.lotCode || lotDay(lot.receivedAt) || 'lot'} ·{' '}
                    {decimalToInput(lot.remainingQty)} {target.unit}
                  </Chip>
                );
              })}
              {!lotCovers ? (
                <Chip
                  selected={!selectedLot}
                  pressed={!selectedLot}
                  onClick={() => {
                    lotTouched.current = true;
                    setLotId(0);
                    setFail(null);
                  }}
                >
                  none
                </Chip>
              ) : null}
            </ChipRow>
          </Field>
        ) : null}
        {overLot ? (
          <Text size='micro' variant='error'>
            ! over lot {decimalToInput(selectedLot?.remainingQty)} {target.unit}
          </Text>
        ) : null}

        {showLoss ? (
          <div className='grid grid-cols-2 gap-2'>
            <QuantityField
              label='loss'
              value={lossQty}
              unit={target.unit}
              invalid={overLoss}
              onChange={setLossQty}
            />
          </div>
        ) : (
          <Button
            type='button'
            size='xs'
            variant='underline'
            className='self-start px-0'
            onClick={() => setShowLoss(true)}
          >
            + loss
          </Button>
        )}
        {overLoss ? (
          <Text size='micro' variant='error'>
            ! over {outQty || '0'} {target.unit}
          </Text>
        ) : null}

        {canWriteCosting ? (
          <div className='grid grid-cols-2 gap-2'>
            <Field label='work'>
              <Input
                inputMode='decimal'
                value={workCost}
                aria-label='work'
                className='h-9 min-h-9 text-right'
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setWorkCost(sanitizeDecimal(event.target.value))
                }
              />
            </Field>
            <Field label='currency'>
              <Select
                name='convert-currency'
                value={currency}
                fullWidth
                items={EXPENSE_CURRENCIES.map((item) => ({
                  value: item.value,
                  label: item.value,
                }))}
                onValueChange={setCurrency}
              />
            </Field>
          </div>
        ) : null}

        <div className='grid grid-cols-2 gap-2'>
          <Field label='supplier'>
            <Select
              name='convert-supplier'
              value={supplierId}
              fullWidth
              items={[
                { value: 0, label: 'none' },
                ...suppliers.map((supplier) => ({
                  value: numId(supplier.id),
                  label: supplier.name || 'supplier',
                })),
              ]}
              onValueChange={(value: string) => {
                supplierTouched.current = true;
                setSupplierId(Number(value) || 0);
              }}
            />
          </Field>
          <Field label='date'>
            <Input
              type='date'
              value={occurredAt}
              aria-label='date'
              className='h-9 min-h-9'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setOccurredAt(event.target.value)
              }
            />
          </Field>
        </div>

        {costPreview && into?.unit ? (
          <div className='flex items-baseline justify-between gap-2 border-t border-hairline pt-2.5'>
            <Text component='span'>cost</Text>
            <Text component='span'>
              {costPreview} € / {into.unit}
            </Text>
          </div>
        ) : null}

        <MaterialPickerDialog
          open={picking}
          value={intoId}
          clearable={false}
          title='into'
          confirmLabel='choose'
          preferredIds={preferredIds}
          excludedIds={[target.materialId]}
          onPick={pickInto}
          onClose={() => setPicking(false)}
          onCreate={() => {
            setPicking(false);
            setCreating(true);
          }}
        />
      </MovementDialog>
      <MaterialModal
        open={creating}
        onOpenChange={setCreating}
        onCreated={(_id, material) => pickInto(material)}
      />
    </>
  );
}

// ---- Shrink ---------------------------------------------------------------------------------

const lotDay = (at?: string): string => {
  if (!at) return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' })
    .format(date)
    .toLowerCase();
};

const lotWidth = (lot?: common_MaterialLot): string =>
  decimalToInput(lot?.washedWidthCm) || decimalToInput(lot?.measuredWidthCm);

export function ShrinkLotModal({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: MovementTarget;
}) {
  const { canReadCosting } = usePermissions();
  const shrink = useShrinkMaterialLot();
  const lotsQuery = useMaterialLots(target.materialId, false, open && target.materialId > 0);
  const lots = useMemo(
    () =>
      (lotsQuery.data?.lots ?? []).filter(
        (lot) => !lot.archived && parseDecimalNumber(decimalToInput(lot.remainingQty)) > 0,
      ),
    [lotsQuery.data],
  );
  const [fail, setFail] = useState<string | null>(null);
  const [lotId, setLotId] = useState(0);
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const selectedLot = lots.find((lot) => numId(lot.id) === lotId);

  useEffect(() => {
    if (!open) return;
    setFail(null);
    setLotId(0);
    setLength('');
    setWidth('');
    setOccurredAt(todayISO());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (lots.length === 1) setLotId(numId(lots[0].id));
    else if (lotId && !lots.some((lot) => numId(lot.id) === lotId)) setLotId(0);
  }, [lotId, lots, open]);

  useEffect(() => {
    if (!selectedLot) return;
    setLength(decimalToInput(selectedLot.remainingQty));
    setWidth(lotWidth(selectedLot));
    setFail(null);
  }, [selectedLot]);

  const beforeLength = parseDecimalNumber(decimalToInput(selectedLot?.remainingQty));
  const afterLength = parseDecimalNumber(length);
  const beforeWidthRaw = lotWidth(selectedLot);
  const beforeWidth = parseDecimalNumber(beforeWidthRaw);
  const afterWidth = parseDecimalNumber(width);
  const lengthChanged =
    Number.isFinite(beforeLength) && Number.isFinite(afterLength) && afterLength !== beforeLength;
  const widthChanged =
    width.trim() !== '' &&
    Number.isFinite(afterWidth) &&
    (!Number.isFinite(beforeWidth) || afterWidth !== beforeWidth);
  const changed = lengthChanged || widthChanged;
  const shrinkPct =
    Number.isFinite(beforeLength) && Number.isFinite(afterLength) && beforeLength > 0
      ? (((beforeLength - afterLength) / beforeLength) * 100).toFixed(1)
      : '0.0';

  const costPreview = useMemo(() => {
    if (!canReadCosting || !selectedLot || !Number.isFinite(afterLength) || afterLength <= 0)
      return null;
    const lotCost = parseDecimalNumber(decimalToInput(selectedLot.unitCost));
    const average = parseDecimalNumber(target.avgUnitCostBase);
    const cost = Number.isFinite(lotCost) && lotCost > 0 ? lotCost : average;
    const currency = selectedLot.currency || target.baseCurrency;
    if (!Number.isFinite(cost) || cost <= 0 || currency !== 'EUR' || !Number.isFinite(beforeLength))
      return null;
    return ((beforeLength * cost) / afterLength).toFixed(2);
  }, [
    afterLength,
    beforeLength,
    canReadCosting,
    selectedLot,
    target.avgUnitCostBase,
    target.baseCurrency,
  ]);

  const chooseLot = (lot: common_MaterialLot) => {
    setLotId(numId(lot.id));
    setFail(null);
  };

  const submit = async () => {
    setFail(null);
    if (!selectedLot) return setFail('choose lot');
    if (!Number.isFinite(afterLength) || afterLength <= 0) return setFail('invalid length');
    if (afterLength > beforeLength) return setFail('length over lot');
    if (width.trim() && (!Number.isFinite(afterWidth) || afterWidth <= 0))
      return setFail('invalid width');
    if (!changed) return;
    try {
      const res = await shrink.mutateAsync({
        lotId: numId(selectedLot.id),
        lengthAfter: inputToDecimal(length),
        widthAfter: width.trim() ? inputToDecimal(width) : undefined,
        lengthBefore: inputToDecimal(decimalToInput(selectedLot.remainingQty)),
        comment: '',
      });
      posted(target, res.movement);
      onOpenChange(false);
    } catch (error) {
      if ((error as { status?: number } | undefined)?.status === 409) {
        setFail('lot changed');
        void lotsQuery.refetch();
      } else {
        failed(target, 'not shrunk', error, setFail);
      }
    }
  };

  return (
    <MovementDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`shrink · ${target.materialLabel}`}
      busy={shrink.isPending}
      blocked={!selectedLot || !changed}
      onSubmit={submit}
      submitLabel='shrink'
      fail={fail}
      failVerb='not shrunk'
    >
      <Field label='lot'>
        <ChipRow>
          {lots.map((lot) => {
            const id = numId(lot.id);
            const selected = id === lotId;
            return (
              <Chip key={id} selected={selected} pressed={selected} onClick={() => chooseLot(lot)}>
                {lot.lotCode || lotDay(lot.receivedAt) || 'lot'} ·{' '}
                {decimalToInput(lot.remainingQty)} {target.unit}
              </Chip>
            );
          })}
        </ChipRow>
      </Field>

      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
        <QuantityField label='length' value={length} unit='m' onChange={setLength} />
        <QuantityField label='width' value={width} unit='cm' onChange={setWidth} />
        <div className='col-span-2 sm:col-span-1'>
          <Field label='date'>
            <Input
              type='date'
              value={occurredAt}
              aria-label='date'
              className='h-9 min-h-9'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setOccurredAt(event.target.value)
              }
            />
          </Field>
        </div>
      </div>

      <div className='flex items-baseline justify-between gap-2 border-t border-hairline pt-2.5'>
        <Text component='span'>shrink {shrinkPct} %</Text>
        {costPreview ? <Text component='span'>{costPreview} € / m</Text> : null}
      </div>
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
