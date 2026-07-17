import * as DialogPrimitives from '@radix-ui/react-dialog';
import { common_MaterialMovement } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { CURRENCIES } from 'constants/constants';
import { useSnackBarStore } from 'lib/stores/store';
import { ReactNode, useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import {
  useAdjustMaterialStock,
  useIssueMaterialStock,
  useMaterialLots,
  useReceiveMaterialStock,
} from './useWarehouse';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

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

// Snackbar copy that reports the balance change straight from the posted ledger row.
function posted(m?: common_MaterialMovement): string {
  return `Movement posted · on hand ${decimalToInput(m?.onHandBefore) || '0'} → ${
    decimalToInput(m?.onHandAfter) || '0'
  }`;
}

// Shared raw-dialog shell (not ConfirmationModal, which auto-closes on confirm — a validation
// error must keep the modal open). Mirrors receive-modal's chrome.
function MovementDialog({
  open,
  onOpenChange,
  title,
  busy,
  onSubmit,
  submitLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  busy: boolean;
  onSubmit: () => void;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[440px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>{title}</DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='shrink-0 cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>{title}</DialogPrimitives.Description>
          <div className='flex flex-col gap-3 p-4'>{children}</div>
          <div className='sticky bottom-0 flex justify-end gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button type='button' variant='main' size='lg' disabled={busy} onClick={onSubmit}>
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

export function ReceiveStockModal({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: MovementTarget;
}) {
  const { showMessage } = useSnackBarStore();
  const { canWriteCosting } = usePermissions();
  const receive = useReceiveMaterialStock();
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [lot, setLot] = useState('');
  const [supplierDoc, setSupplierDoc] = useState('');
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuantity('');
    setUnitCost('');
    setCurrency('EUR');
    setLot('');
    setSupplierDoc('');
    setOccurredAt(todayISO());
    setComment('');
  }, [open]);

  const submit = async () => {
    const qty = parseDecimalNumber(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      showMessage('Quantity must be greater than zero', 'error');
      return;
    }
    // Setting a cost is a costing write; omit it (uncosted receipt, average unchanged) otherwise.
    const cost = canWriteCosting ? inputToDecimal(unitCost) : undefined;
    try {
      const res = await receive.mutateAsync({
        materialId: target.materialId,
        quantity: inputToDecimal(quantity),
        unitCost: cost,
        currency: cost ? currency : '',
        lot: lot.trim(),
        supplierDoc: supplierDoc.trim(),
        occurredAt,
        comment: comment.trim(),
      });
      showMessage(posted(res.movement), 'success');
      onOpenChange(false);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to receive stock', 'error');
    }
  };

  return (
    <MovementDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`receive · ${target.materialLabel}`}
      busy={receive.isPending}
      onSubmit={submit}
      submitLabel='receive'
    >
      <Field label={`quantity (${target.unit || 'unit'})`}>
        <input
          className={cell}
          inputMode='decimal'
          value={quantity}
          onChange={(e) => setQuantity(sanitizeDecimal(e.target.value))}
        />
      </Field>
      {canWriteCosting ? (
        <div className='grid grid-cols-[1fr_auto] gap-2'>
          <Field label='unit cost'>
            <input
              className={cell}
              inputMode='decimal'
              placeholder='blank = uncosted'
              value={unitCost}
              onChange={(e) => setUnitCost(sanitizeDecimal(e.target.value))}
            />
          </Field>
          <Field label='currency'>
            <select className={cell} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.value}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : (
        <Text variant='inactive' size='small'>
          Uncosted receipt — moving average unchanged.
        </Text>
      )}
      <div className='grid grid-cols-2 gap-2'>
        <Field label='lot / roll'>
          <input className={cell} value={lot} onChange={(e) => setLot(e.target.value)} />
        </Field>
        <Field label='supplier doc'>
          <input
            className={cell}
            value={supplierDoc}
            onChange={(e) => setSupplierDoc(e.target.value)}
          />
        </Field>
      </div>
      <Field label='date'>
        <input
          className={cell}
          type='date'
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
      </Field>
      <Field label='comment'>
        <input className={cell} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
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
  const { showMessage } = useSnackBarStore();
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
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      showMessage('Quantity must be greater than zero', 'error');
      return;
    }
    const id = Number(targetId) || 0;
    if (id <= 0) {
      showMessage(`Enter the ${targetKind === 'run' ? 'production run' : 'sample'} id`, 'error');
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
      showMessage(posted(res.movement), 'success');
      onOpenChange(false);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to issue stock', 'error');
    }
  };

  return (
    <MovementDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${isReturn ? 'return' : 'issue'} · ${target.materialLabel}`}
      busy={issue.isPending}
      onSubmit={submit}
      submitLabel={isReturn ? 'return' : 'issue'}
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
          <Field label={targetKind === 'run' ? 'production run id' : 'sample id'}>
            <input
              className={cell}
              type='number'
              min='0'
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            />
          </Field>
        </div>
      )}

      {targetKind === 'run' && colorways && colorways.length > 0 ? (
        <Field label='colourway (optional — attributes cost)'>
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
        <Text size='small'>this is a return (leftover back to stock)</Text>
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
        <Field label='lot (optional)'>
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
  const { showMessage } = useSnackBarStore();
  const adjust = useAdjustMaterialStock();
  const [mode, setMode] = useState<'set' | 'adjust' | 'writeoff'>('set');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('stock_count');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!open) return;
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
    const n = parseDecimalNumber(quantity);
    if (!Number.isFinite(n) || (mode !== 'adjust' && n < 0)) {
      showMessage('Enter a valid quantity', 'error');
      return;
    }
    if (mode === 'adjust' && n === 0) {
      showMessage('Adjustment delta cannot be zero', 'error');
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
      showMessage(posted(res.movement), 'success');
      onOpenChange(false);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to adjust stock', 'error');
    }
  };

  return (
    <MovementDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`adjust · ${target.materialLabel}`}
      busy={adjust.isPending}
      onSubmit={submit}
      submitLabel='post'
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
