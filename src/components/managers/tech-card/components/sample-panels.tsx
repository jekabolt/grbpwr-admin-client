import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  BatchIssueMaterialStockRequest,
  common_Fitting,
  common_Material,
  common_MaterialMovement,
  common_MaterialStockRow,
  common_TechCard,
} from 'api/proto-http/admin';
import {
  formatFittingDate,
  statusLabel,
  verdictLabel,
} from 'components/managers/fittings/components/utils';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
import { resolveMaterialPurpose } from 'components/managers/materials/components/purpose-options';
import { MovementsList } from 'components/managers/materials/components/movements-tab';
import {
  useMaterialMovements,
  useMaterialStock,
  warehouseKeys,
} from 'components/managers/materials/components/useWarehouse';
import { ROUTES } from 'constants/routes';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { wireInt } from './schema';
import { sampleKeys, useSampleFittings } from './useSamples';

// ---------------------------------------------------------------------------
// Shared form grammar for the samples area (reference `.f`): a 10px uppercase grey
// label sitting 1px above a full 1px control box. `ui/form/fields/*` are RHF-bound and
// these screens hold plain local state, so the samples area carries its own thin
// wrapper rather than re-deriving the label metrics at every call site.
// ---------------------------------------------------------------------------

export const selectCell =
  'block min-h-[22px] w-full appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize transition-colors focus:border-textColor focus:outline-none disabled:bg-bgZebra disabled:text-labelColor';

// Same box, fixed-width and right-aligned, for a quantity cell inside a table. Deliberately
// carries no `w-full` so a width utility at the call site cannot collide with it.
const qtyCell =
  'ml-auto block min-h-[22px] w-20 appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-right text-textBaseSize transition-colors focus:border-textColor focus:outline-none aria-[invalid=true]:border-error disabled:bg-bgZebra disabled:text-labelColor';

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col ${className ?? ''}`}>
      <Text
        size='micro'
        variant='label'
        tracking='label'
        component='span'
        className='mb-px uppercase'
      >
        {label}
      </Text>
      {children}
      {hint ? (
        <Text size='micro' variant='label' className='mt-px'>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text size='micro' variant='error' className='mt-px'>
          {error}
        </Text>
      ) : null}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Batch material write-off (10.5). Nobody issues one material at a time when a sample
// is sewn — the whole BOM goes out at once. So the sample's write-off is ONE SHEET of
// the style's BOM lines (spec · actual · on hand · cost), not a pick-a-material →
// modal → repeat loop.
//
// The sheet posts through BatchIssueMaterialStock, ONE atomic call: every line lands or
// none does, and a rejection names the offending line without leaving anything on the
// ledger. So the outcome is binary — there is no per-line verdict to report, no partial
// state to reconcile, and a retry re-sends the whole sheet rather than a failed subset.
// ---------------------------------------------------------------------------

export type WriteoffRow = {
  // Stable across re-renders: BOM lines key by their server id, off-BOM extras by material.
  key: string;
  materialId: number;
  label: string;
  material?: common_Material;
  unit: string;
  /** Spec consumption for this line, '' when the colourway recipe has no norm for it. */
  spec: string;
  onHand: number;
  onHandText: string;
  avgUnitCost: number;
  /** Material purpose is sample|both — i.e. "помечен как для семпла". */
  sampleMarked: boolean;
  /** Added by hand through the MaterialPicker rather than read off the BOM. */
  offBom: boolean;
};

export type WriteoffLineState = { checked: boolean; actual: string };

export type WriteoffSelection = {
  key: string;
  materialId: number;
  label: string;
  unit: string;
  quantity: string;
  qty: number;
  over: boolean;
  overBy: number;
  cost: number;
};

/** One line as the batch will see it — after the per-material fold below. */
export type WriteoffLine = {
  key: string;
  materialId: number;
  label: string;
  unit: string;
  quantity: string;
  /** >1 when several sheet rows carried the same material and were folded into this line. */
  mergedRows?: number;
};

/** A line of a POSTED batch, paired with the movement it produced. Nothing here can have failed. */
export type WriteoffPostedLine = WriteoffLine & { movement?: common_MaterialMovement };

/** Binary by construction: the batch is atomic, so either every line posted or none did. */
export type WriteoffOutcome =
  | { ok: true; lines: WriteoffPostedLine[] }
  | { ok: false; error: string };

const materialText = (m?: common_Material): string =>
  `${m?.code ? `${m.code} · ` : ''}${m?.name ?? `#${m?.id ?? '?'}`}`;

function todayISO(): string {
  // Local wall-clock date (not toISOString) — mirrors the warehouse movement modals so a
  // write-off is dated the operator's "today", not a UTC day-off around midnight.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// The spec quantity of one BOM line: the colourway recipe's consumption norm
// (TechCardColorwayUsage), preferring the sample's own colourway and its own size before
// falling back to any colourway that has a norm for the line. '' when the style has no
// recipe yet — the sheet then asks the operator to type the actual.
function specQuantity(
  techCard: common_TechCard | undefined,
  bomItemId: number,
  colorwayId: number,
  sizeId: number,
): string {
  if (!bomItemId) return '';
  const colorways = techCard?.colorways ?? [];
  const usageOf = (cw: (typeof colorways)[number]) =>
    (cw.usages ?? []).find((u) => wireInt(u.bomItemId) === bomItemId);
  const own = colorwayId
    ? colorways.find((cw) => wireInt(cw.colorwayId) === colorwayId)
    : undefined;
  let usage = own ? usageOf(own) : undefined;
  if (!usage) {
    for (const cw of colorways) {
      usage = usageOf(cw);
      if (usage) break;
    }
  }
  if (!usage) return '';
  const bySize = sizeId
    ? (usage.sizeConsumptions ?? []).find((s) => wireInt(s.sizeId) === sizeId)
    : undefined;
  return (
    decimalToInput(bySize?.consumption) ||
    decimalToInput(usage.consumption) ||
    decimalToInput(usage.quantity) ||
    ''
  );
}

/**
 * Rows + editable state for one write-off sheet. Shared by the creation form (10.2) and
 * the open sample's MATERIALS area (10.5) so both issue stock through exactly the same
 * derivation of spec / on-hand / cost.
 */
export function useSampleWriteoff({
  techCard,
  colorwayId = 0,
  sizeId = 0,
  canReadCosting,
}: {
  techCard?: common_TechCard;
  colorwayId?: number;
  sizeId?: number;
  canReadCosting: boolean;
}) {
  // Sample-marked stock: one row per catalog material with its on-hand balance and
  // moving-average valuation. Money fields are absent without costing:read; the write-off
  // itself does not need them.
  const {
    data: stockData,
    isLoading: stockLoading,
    isError: stockError,
  } = useMaterialStock({ withStockOnly: false });

  // Keyed by a COERCED id. Material.id is int64, which grpc-gateway serialises as a STRING
  // while the generated type claims `number` — keying on the raw value builds a Map of "12"
  // that `.get(12)` can never hit (the same trap that once broke BOM material linking).
  const rowByMaterial = useMemo(() => {
    const m = new Map<number, common_MaterialStockRow>();
    for (const r of stockData?.rows ?? []) {
      const id = wireInt(r.material?.id);
      if (id) m.set(id, r);
    }
    return m;
  }, [stockData]);

  const baseCurrency = (stockData?.rows ?? []).find((r) => r.baseCurrency)?.baseCurrency ?? '';

  const bomItems = useMemo(() => techCard?.techCard?.bomItems ?? [], [techCard]);
  // A BOM line with no catalog material cannot move stock — count them so the sheet can say
  // so out loud instead of silently listing fewer lines than the BOM tab shows.
  const unlinkedBomCount = bomItems.filter((b) => !wireInt(b.materialId)).length;

  const bomRows = useMemo<WriteoffRow[]>(
    () =>
      bomItems
        .filter((b) => wireInt(b.materialId) > 0)
        .map((b, i) => {
          const materialId = wireInt(b.materialId);
          const stock = rowByMaterial.get(materialId);
          const material = stock?.material;
          return {
            key: `bom-${wireInt(b.id) || b.lineKey || i}`,
            materialId,
            label: b.name?.trim() || materialText(material),
            material,
            unit: b.unit?.trim() || material?.unit || '',
            spec: specQuantity(techCard, wireInt(b.id), colorwayId, sizeId),
            onHand: parseDecimalNumber(decimalToInput(stock?.onHand)),
            onHandText: stock ? decimalToInput(stock.onHand) || '0' : '—',
            avgUnitCost: parseDecimalNumber(decimalToInput(stock?.avgUnitCostBase)),
            sampleMarked:
              resolveMaterialPurpose(material?.purpose) !== 'MATERIAL_PURPOSE_PRODUCTION',
            offBom: false,
          };
        }),
    [bomItems, rowByMaterial, techCard, colorwayId, sizeId],
  );

  // Off-BOM additions: "issue something the BOM does not carry" stays possible (a one-off
  // trim, a replacement fabric) — the MaterialPicker feeds this list.
  const [extras, setExtras] = useState<WriteoffRow[]>([]);
  const extraRows = useMemo<WriteoffRow[]>(
    () =>
      extras.map((e) => {
        const stock = rowByMaterial.get(e.materialId);
        const material = stock?.material ?? e.material;
        return {
          ...e,
          material,
          unit: material?.unit || e.unit,
          onHand: parseDecimalNumber(decimalToInput(stock?.onHand)),
          onHandText: stock ? decimalToInput(stock.onHand) || '0' : '—',
          avgUnitCost: parseDecimalNumber(decimalToInput(stock?.avgUnitCostBase)),
          sampleMarked: resolveMaterialPurpose(material?.purpose) !== 'MATERIAL_PURPOSE_PRODUCTION',
        };
      }),
    [extras, rowByMaterial],
  );

  const rows = useMemo(() => [...bomRows, ...extraRows], [bomRows, extraRows]);

  // Overrides only. The default (checked when the line is sample-marked AND the recipe has a
  // norm; actual pre-filled from spec) is derived, so a late-arriving stock/recipe read fills
  // the sheet in without clobbering anything already typed.
  const [edits, setEdits] = useState<Record<string, Partial<WriteoffLineState>>>({});
  const stateOf = (r: WriteoffRow): WriteoffLineState => {
    const specNum = parseDecimalNumber(r.spec);
    const fallback: WriteoffLineState = {
      checked: r.offBom || (r.sampleMarked && Number.isFinite(specNum) && specNum > 0),
      actual: r.spec,
    };
    const e = edits[r.key];
    return { checked: e?.checked ?? fallback.checked, actual: e?.actual ?? fallback.actual };
  };

  const toggle = (r: WriteoffRow) =>
    setEdits((prev) => ({ ...prev, [r.key]: { ...prev[r.key], checked: !stateOf(r).checked } }));
  const setActual = (r: WriteoffRow, actual: string) =>
    setEdits((prev) => ({ ...prev, [r.key]: { ...prev[r.key], actual } }));

  const addOther = (materialId: number, material?: common_Material) => {
    if (!materialId) return;
    if (rows.some((r) => r.materialId === materialId)) return;
    setExtras((prev) => [
      ...prev,
      {
        key: `mat-${materialId}`,
        materialId,
        label: materialText(material),
        material,
        unit: material?.unit ?? '',
        spec: '',
        onHand: NaN,
        onHandText: '—',
        avgUnitCost: NaN,
        sampleMarked: true,
        offBom: true,
      },
    ]);
  };
  const removeRow = (r: WriteoffRow) => {
    if (r.offBom) setExtras((prev) => prev.filter((x) => x.key !== r.key));
    else setEdits((prev) => ({ ...prev, [r.key]: { ...prev[r.key], checked: false } }));
  };

  // Called after a successful issue: leaving the sheet ticked invites issuing the same lines
  // twice, which silently doubles a write-off.
  const clearSelection = () => {
    setExtras([]);
    setEdits(() => {
      const next: Record<string, Partial<WriteoffLineState>> = {};
      for (const r of rows) next[r.key] = { checked: false };
      return next;
    });
  };

  // A ticked line only counts once its quantity is a real positive number; a ticked-but-blank
  // line blocks the issue so it cannot be silently dropped.
  const ticked = rows.filter((r) => stateOf(r).checked);
  const selected: WriteoffSelection[] = ticked
    .map((r) => {
      const { actual } = stateOf(r);
      const qty = parseDecimalNumber(actual);
      const over = Number.isFinite(qty) && Number.isFinite(r.onHand) && qty > r.onHand;
      const cost = Number.isFinite(qty) && Number.isFinite(r.avgUnitCost) ? qty * r.avgUnitCost : 0;
      return {
        key: r.key,
        materialId: r.materialId,
        label: r.label,
        unit: r.unit,
        quantity: actual,
        qty,
        over,
        overBy: over ? qty - r.onHand : 0,
        cost,
      };
    })
    .filter((s) => Number.isFinite(s.qty) && s.qty > 0);

  const incomplete = ticked.length - selected.length;
  // Ticked rows that repeat a material already on the sheet — one fabric can sit on two BOM lines.
  // The batch takes one line per material, so those are summed on the way out (mergeWriteoffLines).
  // Counted here so the sheet can say it BEFORE the issue, instead of the receipt reporting fewer
  // lines than were ticked and looking like it dropped some.
  const mergedRowCount = selected.length - new Set(selected.map((s) => s.materialId)).size;
  // Over-stock is a WARNING, never a block — sampling legitimately overdraws.
  const overLines = selected.filter((s) => s.over);
  const totalCost = selected.reduce((sum, s) => sum + s.cost, 0);
  const hasCost =
    canReadCosting &&
    selected.some((s) => {
      const r = rows.find((x) => x.key === s.key);
      return !!r && Number.isFinite(r.avgUnitCost) && r.avgUnitCost > 0;
    });

  const money = (n: number) => `${Number(n.toFixed(2))}${baseCurrency ? ` ${baseCurrency}` : ''}`;

  // One-line preview for the collapsed write-off block on the creation form.
  const summary = selected
    .slice(0, 3)
    .map((s) => `${s.label} ${s.quantity}${s.unit ? ` ${s.unit}` : ''}`)
    .join(', ');

  return {
    rows,
    stateOf,
    toggle,
    setActual,
    addOther,
    removeRow,
    clearSelection,
    selected,
    incomplete,
    mergedRowCount,
    overLines,
    totalCost,
    hasCost,
    money,
    baseCurrency,
    summary,
    unlinkedBomCount,
    stockLoading,
    stockError,
    canReadCosting,
  };
}

export type SampleWriteoff = ReturnType<typeof useSampleWriteoff>;

// How many stock movements this sample carries — the editor's "issued N lines" row, readable
// WITHOUT opening the materials panel (10.3: seeing the counts without a click is the point of the
// two-column editor). Deliberately the same filter/limit pair MovementsList uses, so React Query
// serves both from one request instead of firing a second, count-only read.
export function useSampleMovementCount(sampleId?: number): number {
  const { data } = useMaterialMovements({ sampleId: sampleId ?? 0 }, 50);
  return data?.pages?.[0]?.total ?? 0;
}

// Sum two sheet quantities. The inputs are already clamped to 3 decimals by sanitizeDecimal, so
// rounding back to 3 can only undo float noise (0.1 + 0.2 = 0.30000000000000004), never precision.
function addQuantities(a: string, b: string): string {
  const sum = (parseDecimalNumber(a) || 0) + (parseDecimalNumber(b) || 0);
  return Number.isFinite(sum) ? String(Number(sum.toFixed(3))) : a;
}

/**
 * Fold the sheet's rows by material. BatchIssueMaterialStock rejects a duplicate materialId across
 * lines BEFORE it writes anything, and a BOM legitimately carries one catalog material on two lines
 * (the same fabric on the shell and the hood). Summing here is what the operator means anyway —
 * "issue 2.4 m of this fabric", not "two separate 1.2 m issues of it".
 */
export function mergeWriteoffLines(lines: WriteoffLine[]): WriteoffLine[] {
  const out: WriteoffLine[] = [];
  const seatOf = new Map<number, number>();
  for (const l of lines) {
    const seat = seatOf.get(l.materialId);
    if (seat === undefined) {
      seatOf.set(l.materialId, out.length);
      out.push({ ...l });
      continue;
    }
    const prev = out[seat];
    out[seat] = {
      ...prev,
      quantity: addQuantities(prev.quantity, l.quantity),
      label: prev.label === l.label ? prev.label : `${prev.label} + ${l.label}`,
      mergedRows: (prev.mergedRows ?? 1) + 1,
    };
  }
  return out;
}

// The batch write. It sits here rather than beside useWarehouse's movement hooks because those wrap
// the single-movement RPCs and this is the sample sheet's only writer; it invalidates the same two
// trees a single issue does — balances move, and so does the sample's composed cost.
function useBatchIssueMaterialStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: BatchIssueMaterialStockRequest) => adminService.BatchIssueMaterialStock(req),
    onSuccess: (_res, req) => {
      qc.invalidateQueries({ queryKey: warehouseKeys.all });
      if (req.sampleId) qc.invalidateQueries({ queryKey: sampleKeys.all });
    },
  });
}

/**
 * The whole sheet in ONE atomic call. Never throws: a rejection resolves to `{ ok: false }` and
 * means the ledger is untouched, so the caller has nothing to reconcile and can re-send as-is.
 */
export function useWriteoffBatch() {
  const batch = useBatchIssueMaterialStock();
  const run = async (
    sampleId: number,
    lines: WriteoffLine[],
    comment: string,
  ): Promise<WriteoffOutcome> => {
    const merged = mergeWriteoffLines(lines);
    try {
      const res = await batch.mutateAsync({
        lines: merged.map((l) => ({
          materialId: l.materialId,
          quantity: inputToDecimal(l.quantity),
          lotId: 0,
          comment: '',
        })),
        productionRunId: 0,
        sampleId,
        isReturn: false,
        occurredAt: todayISO(),
        comment,
        productId: 0,
      });
      // Movements come back in the order the lines were sent, so index pairing is the contract.
      const movements = res.movements ?? [];
      return { ok: true, lines: merged.map((l, i) => ({ ...l, movement: movements[i] })) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'the write-off was rejected' };
    }
  };
  return { run, isPending: batch.isPending };
}

/** The sheet itself: one row per BOM line, plus the `+ other material` escape hatch. */
export function WriteoffSheet({
  wo,
  canEdit,
  action,
}: {
  wo: SampleWriteoff;
  canEdit: boolean;
  /** Trailing action bar (issue / create) — the caller owns the verb. */
  action?: React.ReactNode;
}) {
  if (wo.stockError) {
    return (
      <CalloutBox tone='error'>
        <Text size='micro'>
          Stock is unavailable — the warehouse backend may not be reachable. The sample can still be
          created or edited; issue its materials later from here.
        </Text>
      </CalloutBox>
    );
  }

  return (
    <div className='flex flex-col gap-1.5'>
      <DataTable>
        <thead>
          <tr>
            <th>BOM line</th>
            <th>spec</th>
            <th>actual</th>
            <th>on hand</th>
            <th>cost</th>
          </tr>
        </thead>
        <tbody>
          {wo.rows.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <Text size='micro' variant='label'>
                  {wo.stockLoading
                    ? 'loading stock…'
                    : 'no BOM line links a catalog material — link materials in the BOM tab, or add one below'}
                </Text>
              </td>
            </tr>
          ) : (
            wo.rows.map((r) => {
              const st = wo.stateOf(r);
              const qty = parseDecimalNumber(st.actual);
              const over =
                st.checked && Number.isFinite(qty) && Number.isFinite(r.onHand) && qty > r.onHand;
              const cost =
                st.checked && Number.isFinite(qty) && Number.isFinite(r.avgUnitCost)
                  ? qty * r.avgUnitCost
                  : NaN;
              const blank = st.checked && !(Number.isFinite(qty) && qty > 0);
              return (
                <tr key={r.key}>
                  <td>
                    <span className='flex items-center gap-2'>
                      <CheckboxCommon
                        name={`wo-${r.key}`}
                        checked={st.checked}
                        disabled={!canEdit}
                        onChange={() => wo.toggle(r)}
                      />
                      <span className='flex min-w-0 flex-col'>
                        <Text size='micro' className={st.checked ? '' : 'text-labelColor'}>
                          {r.label}
                        </Text>
                        {r.offBom ? (
                          <Text size='nano' variant='label' className='uppercase'>
                            not on the BOM
                          </Text>
                        ) : !r.sampleMarked ? (
                          <Text size='nano' variant='label' className='uppercase'>
                            production-only material
                          </Text>
                        ) : null}
                      </span>
                      {r.offBom && canEdit ? (
                        <Button
                          type='button'
                          variant='secondary'
                          size='xs'
                          aria-label={`remove ${r.label}`}
                          onClick={() => wo.removeRow(r)}
                        >
                          ✕
                        </Button>
                      ) : null}
                    </span>
                  </td>
                  <td>{r.spec ? `${r.spec}${r.unit ? ` ${r.unit}` : ''}` : <EmptyCell />}</td>
                  <td>
                    {st.checked ? (
                      <input
                        className={qtyCell}
                        inputMode='decimal'
                        aria-label={`actual quantity for ${r.label}`}
                        aria-invalid={blank || undefined}
                        placeholder={r.unit || 'qty'}
                        disabled={!canEdit}
                        value={st.actual}
                        onChange={(e) => wo.setActual(r, sanitizeDecimal(e.target.value))}
                      />
                    ) : (
                      <EmptyCell />
                    )}
                  </td>
                  <td className={over ? 'text-error' : undefined}>
                    {r.onHandText}
                    {over ? ' !' : ''}
                  </td>
                  <td>
                    {Number.isFinite(cost) && wo.canReadCosting ? wo.money(cost) : <EmptyCell />}
                  </td>
                </tr>
              );
            })
          )}
          {wo.selected.length > 0 && (
            <TotalRow>
              <td>
                {wo.selected.length} line{wo.selected.length === 1 ? '' : 's'}
                {wo.overLines.length > 0 ? ` · ${wo.overLines.length} over stock` : ''}
              </td>
              <td />
              <td />
              <td />
              <td>{wo.hasCost ? wo.money(wo.totalCost) : <EmptyCell />}</td>
            </TotalRow>
          )}
        </tbody>
      </DataTable>

      {/* Off-BOM issue: the MaterialPicker stays available for the one-off that the style's
          BOM does not carry. */}
      {canEdit && (
        <div className='flex flex-wrap items-end gap-2'>
          <div className='w-64'>
            <Field label='+ other material'>
              <MaterialPicker
                value={0}
                onChange={(id, m) => wo.addOther(id, m)}
                placeholder='issue something not on the BOM'
              />
            </Field>
          </div>
          {wo.unlinkedBomCount > 0 ? (
            <Text size='micro' variant='label'>
              {wo.unlinkedBomCount} BOM line(s) link no catalog material — they cannot move stock
              until they do.
            </Text>
          ) : null}
        </div>
      )}

      {wo.incomplete > 0 ? (
        <Text size='micro' variant='error'>
          enter a quantity ( &gt; 0 ) for every ticked line, or untick it
        </Text>
      ) : null}

      {wo.mergedRowCount > 0 ? (
        <Text size='micro' variant='label'>
          {wo.mergedRowCount} ticked line(s) repeat a material already on the sheet — a material is
          issued once, with those quantities summed
        </Text>
      ) : null}

      {/* Over-stock is a WARNING, not a block — sampling legitimately overdraws. */}
      {wo.overLines.length > 0 ? (
        <CalloutBox tone='warning'>
          <Text size='micro'>
            {wo.overLines
              .map(
                (s) =>
                  `${s.label} exceeds on-hand by ${Number(s.overBy.toFixed(3))}${s.unit ? ` ${s.unit}` : ''}`,
              )
              .join(' · ')}
            {' — issuing anyway is allowed; the balance goes negative.'}
          </Text>
        </CalloutBox>
      ) : null}

      {action ? <div className='flex flex-wrap items-center gap-2'>{action}</div> : null}
    </div>
  );
}

/** Receipt for a posted batch: what moved and where each balance landed. No verdict column — a
 *  rendered receipt means the whole batch went through. */
export function WriteoffReceipt({
  lines,
  money,
  canReadCosting,
}: {
  lines: WriteoffPostedLine[];
  money: (n: number) => string;
  canReadCosting: boolean;
}) {
  if (!lines.length) return null;
  const lineCost = (l: WriteoffPostedLine): number => {
    const qn = Number(l.movement?.quantity?.value);
    const cn = Number(l.movement?.unitCostBase?.value);
    return Number.isFinite(qn) && Number.isFinite(cn) ? qn * cn : NaN;
  };
  const posted = lines.reduce(
    (sum, l) => sum + (Number.isFinite(lineCost(l)) ? lineCost(l) : 0),
    0,
  );
  const postedHasCost = canReadCosting && lines.some((l) => l.movement?.unitCostBase);

  return (
    <div className='flex flex-col'>
      {lines.map((l) => {
        const cost = lineCost(l);
        return (
          <Row
            key={l.key}
            label={
              <span className='flex min-w-0 flex-col'>
                <Text size='micro'>{l.label}</Text>
                <Text size='nano' variant='label'>
                  {l.quantity} {l.unit}
                  {l.movement
                    ? ` · on hand ${decimalToInput(l.movement.onHandBefore) || '0'} → ${
                        decimalToInput(l.movement.onHandAfter) || '0'
                      }`
                    : ''}
                  {l.mergedRows ? ` · ${l.mergedRows} sheet lines on this material` : ''}
                </Text>
              </span>
            }
            value={
              canReadCosting && Number.isFinite(cost) ? (
                <Text size='micro'>{money(cost)}</Text>
              ) : (
                <EmptyCell />
              )
            }
          />
        );
      })}
      <Row
        emphasis
        label={`${lines.length} line${lines.length === 1 ? '' : 's'} issued`}
        value={postedHasCost ? money(posted) : <EmptyCell />}
      />
    </div>
  );
}

// Material issued to / returned from this sample (NF-01). Replaces the old
// pick-a-material → IssueStockModal → repeat loop with the batch sheet: the style's BOM,
// pre-filled, issued in one action. `IssueStockModal` still exists for one-off corrections
// from the materials manager — this is the sample path only.
export function SampleMovements({
  sampleId,
  techCard,
  colorwayId,
  sizeId,
  canEdit,
  canReadCosting,
}: {
  sampleId: number;
  techCard?: common_TechCard;
  colorwayId?: number;
  sizeId?: number;
  canEdit: boolean;
  canReadCosting: boolean;
}) {
  const wo = useSampleWriteoff({ techCard, colorwayId, sizeId, canReadCosting });
  const issuer = useWriteoffBatch();
  const [posted, setPosted] = useState<WriteoffPostedLine[]>([]);
  const [failure, setFailure] = useState('');

  const issueSheet = async () => {
    if (!wo.selected.length || issuer.isPending) return;
    const res = await issuer.run(sampleId, wo.selected, 'sample write-off');
    if (!res.ok) {
      // The batch wrote nothing, so the sheet is still exactly what it was — leave it ticked and
      // let the same button re-send it whole.
      setPosted([]);
      setFailure(res.error);
      return;
    }
    setFailure('');
    setPosted(res.lines);
    // Untick what went out so the same sheet cannot be issued a second time by accident.
    wo.clearSelection();
  };

  return (
    <div className='flex flex-col gap-2'>
      <GroupLabel>write off the BOM</GroupLabel>
      <WriteoffSheet
        wo={wo}
        canEdit={canEdit}
        action={
          canEdit ? (
            <Button
              type='button'
              variant='main'
              size='sm'
              disabled={!wo.selected.length || issuer.isPending}
              onClick={issueSheet}
            >
              {issuer.isPending ? 'issuing…' : `issue ${wo.selected.length} line(s)`}
            </Button>
          ) : null
        }
      />

      {/* No retry button of its own: the batch left nothing behind, so retrying IS re-sending the
          sheet, and the sheet's own issue button — still ticked, directly above — already does it. */}
      {failure ? (
        <CalloutBox tone='error'>
          <Text size='micro'>
            <b>Nothing was written off.</b> The write-off posts as one transaction, so a rejected
            line leaves the ledger and every balance untouched. Fix the offending line and press
            issue again to re-send the whole sheet. {failure}
          </Text>
        </CalloutBox>
      ) : null}

      {posted.length > 0 ? (
        <WriteoffReceipt lines={posted} money={wo.money} canReadCosting={canReadCosting} />
      ) : null}

      <GroupLabel>ledger</GroupLabel>
      <MovementsList filter={{ sampleId }} />
    </div>
  );
}

// Verdict → Pill tone. Approved is done (green), rejected is broken (red), needs-rework is
// mid-flight and waiting on a human (blue — never amber).
function verdictTone(v?: string): 'ok' | 'warn' | 'attention' | 'mut' {
  if (v === 'FITTING_VERDICT_APPROVED') return 'ok';
  if (v === 'FITTING_VERDICT_REJECTED') return 'warn';
  if (v === 'FITTING_VERDICT_NEEDS_REWORK') return 'attention';
  return 'mut';
}

// Russian plural agreement for "примерка" (1 примерка, 2 примерки, 5/11 примерок, 21 примерка…).
function fittingsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'примерка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'примерки';
  return 'примерок';
}

// Card-board summary text (owner decision 1, quoted verbatim): "N примерок · последний вердикт" —
// read without opening the sample. Fittings arrive newest-first (ListFittings ORDER_FACTOR_DESC,
// preserved by useSampleFittings' grouping), so the first entry is the latest.
export function fittingsSummary(fittings: common_Fitting[]): string {
  if (!fittings.length) return 'нет примерок';
  const n = fittings.length;
  return `${n} ${fittingsWord(n)} · последний вердикт: ${verdictLabel(fittings[0].fitting?.verdict)}`;
}

/** Unresolved change requests across a sample's fittings — the editor's "N open" pill. */
export function openChangeRequests(fittings: common_Fitting[]): number {
  return fittings.reduce(
    (n, f) => n + (f.fitting?.changeRequests ?? []).filter((c) => !c.resolved).length,
    0,
  );
}

/** The two facts the editor's FITTINGS rows show without any click. */
export function FittingRows({ fittings }: { fittings: common_Fitting[] }) {
  if (!fittings.length) {
    return <Row label='no fittings yet' tone='label' value={<EmptyCell />} />;
  }
  const open = openChangeRequests(fittings);
  return (
    <>
      {fittings.slice(0, 3).map((f) => (
        <Row
          key={f.id}
          label={`${formatFittingDate(f.fitting?.fittingDate)} — ${verdictLabel(f.fitting?.verdict)}`}
          value={
            <Pill tone={verdictTone(f.fitting?.verdict)}>
              round {f.fitting?.roundNumber ?? '—'}
            </Pill>
          }
        />
      ))}
      <Row
        label={`${fittings.length} ${fittingsWord(fittings.length)}`}
        value={open > 0 ? <Pill tone='attention'>{open} open</Pill> : <EmptyCell />}
      />
    </>
  );
}

// Fittings that tried this sample on (NF-04): a sample:fittings 1:N link that already existed but
// was invisible (only reachable by filtering the card's whole fitting list). This is the FITTINGS
// area's expand body — the summary lives in the editor's always-visible rows.
export function SampleFittings({
  sampleId,
  techCardId,
  returnTo,
}: {
  sampleId: number;
  techCardId: number;
  returnTo: string;
}) {
  const { bySample } = useSampleFittings(techCardId);
  const fittings = bySample.get(sampleId) ?? [];
  const addHref = `${ROUTES.addFitting}?techCardId=${techCardId}&sampleId=${sampleId}&returnTo=${encodeURIComponent(
    returnTo,
  )}`;

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Text size='micro' variant='label'>
          {fittingsSummary(fittings)}
        </Text>
        <Button asChild variant='secondary' size='sm'>
          <Link to={addHref}>+ примерка на этом семпле</Link>
        </Button>
      </div>
      {fittings.length > 0 && (
        <div className='flex flex-col'>
          {fittings.map((f) => (
            <Link key={f.id} to={`/fittings/${f.id}`} className='block'>
              <Row
                label={
                  <span className='flex min-w-0 flex-col'>
                    <Text size='micro'>
                      round {f.fitting?.roundNumber ?? '—'} ·{' '}
                      {formatFittingDate(f.fitting?.fittingDate)}
                    </Text>
                    <Text size='nano' variant='label'>
                      {statusLabel(f.fitting?.status)} · {f.media?.length ?? 0} photo(s)
                    </Text>
                  </span>
                }
                value={
                  <Pill tone={verdictTone(f.fitting?.verdict)}>
                    {verdictLabel(f.fitting?.verdict)}
                  </Pill>
                }
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
