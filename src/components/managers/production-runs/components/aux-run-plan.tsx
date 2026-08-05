import {
  common_Material,
  common_ProductionRun,
  common_ProductionRunLine,
  common_TechCardOutputVariant,
} from 'api/proto-http/admin';
import { activeVariantCount } from 'components/managers/tech-card/components/output-variants-field';
import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { ulid } from 'utils/ulid';
import { updateRunErrorMessage, useUpdateRunSection } from './useProductionRuns';

const input = 'w-32 border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

export function materialLabel(m?: common_Material, fallbackId = 0): string {
  if (m) return `${m.code ? `${m.code} · ` : ''}${m.name ?? `#${m.id}`}`;
  return fallbackId ? `#${fallbackId}` : '';
}

// A pale dye vanishes into the page without the outline, so the swatch keeps its 1px ink box.
function Swatch({ hex, title }: { hex?: string; title?: string }) {
  return (
    <span
      aria-hidden
      title={title ?? hex ?? undefined}
      className='inline-block size-3 shrink-0 border border-textColor'
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

/**
 * Is this run planned PER COLOUR? Either the card registers live colours today, or the run already
 * carries colour lines — the second arm matters on a run whose colours have since been retired, so
 * an existing plan never silently reverts to the single-quantity editor and loses its rows.
 */
export function isVariantRun(
  variants: common_TechCardOutputVariant[],
  lines: common_ProductionRunLine[],
): boolean {
  return activeVariantCount(variants) > 0 || lines.some((l) => (l.outputVariantId ?? 0) > 0);
}

// Auxiliary run planning (NF-07 / B-3). An auxiliary tech card produces a MATERIAL, not sellable
// products, so the colour-model × size grid doesn't apply. There are two shapes:
//   legacy  — the card has one output_material_id and the run is a single product-less quantity;
//   0252    — the card produces one bucket PER COLOUR, and the run carries one line per colour.
// Both receipt into the MATERIAL warehouse; neither line ever carries a product_id or a size (a
// line with either would be rejected by ReceiveProductionRun with InvalidArgument).
export function AuxRunPlan({
  run,
  canEdit,
  locked,
  outputMaterialId,
  outputMaterial,
  outputVariants = [],
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  locked: boolean;
  outputMaterialId: number;
  outputMaterial?: common_Material;
  outputVariants?: common_TechCardOutputVariant[];
}) {
  const lines = useMemo(() => run.run?.lines ?? [], [run.run?.lines]);
  if (isVariantRun(outputVariants, lines))
    return (
      <VariantRunPlan run={run} canEdit={canEdit} locked={locked} outputVariants={outputVariants} />
    );
  return (
    <SingleOutputRunPlan
      run={run}
      canEdit={canEdit}
      locked={locked}
      outputMaterialId={outputMaterialId}
      outputMaterial={outputMaterial}
    />
  );
}

// One qty per registered colour. Full-replace on save, like every other line editor here.
function VariantRunPlan({
  run,
  canEdit,
  locked,
  outputVariants,
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  locked: boolean;
  outputVariants: common_TechCardOutputVariant[];
}) {
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  const update = useUpdateRunSection();
  const editable = canEdit && !locked;
  const lines = useMemo(() => run.run?.lines ?? [], [run.run?.lines]);

  const hexByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of dictionary?.colors ?? []) if (c.code && c.hex) m.set(c.code, c.hex);
    return m;
  }, [dictionary?.colors]);

  // A run whose card was still single-output when it was planned, and which has ALREADY been
  // counted against, cannot be re-planned per colour: the server refuses a run that mixes colour
  // lines with an unvarianted product-less one, and dropping that line to satisfy it would throw
  // away its received history. Say so and stop, rather than quietly destroying the count.
  const legacyStamped = lines.find(
    (l) =>
      !l.productId &&
      !(l.outputVariantId ?? 0) &&
      ((l.receivedQty ?? 0) > 0 || (l.defectQty ?? 0) > 0),
  );

  // Every colour this run can carry: the card's LIVE colours, plus any colour already on the run
  // whose variant has since been retired. The server grandfathers that second group — an existing
  // line stays savable and still receipts into its own bucket — but it will not accept a NEW line
  // for a retired colour, which is why they are marked and never offered fresh.
  const rows = useMemo<VariantRow[]>(() => {
    // A LIST per colour, not one line: nothing in the schema stops two lines naming the same
    // variant (there is no unique index on (run_id, output_variant_id)), and collapsing them here
    // would make the survivor's full-replace save DELETE a line the operator never saw.
    const byVariant = new Map<number, common_ProductionRunLine[]>();
    for (const l of lines) {
      const id = l.outputVariantId ?? 0;
      if (id > 0) byVariant.set(id, [...(byVariant.get(id) ?? []), l]);
    }
    const out: VariantRow[] = [];
    const take = (v: common_TechCardOutputVariant | undefined, id: number) => {
      const ls = byVariant.get(id) ?? [];
      byVariant.delete(id);
      const base = {
        variantId: id,
        colorCode: v?.colorCode ?? '',
        colorName: v?.colorName ?? '',
        materialName: v?.materialName ?? '',
        unit: v?.unit ?? '',
        active: !!v?.active,
      };
      if (ls.length === 0) {
        out.push({
          ...base,
          rowKey: `v${id}`,
          lineKey: '',
          plannedQty: 0,
          receivedQty: undefined,
          defectQty: undefined,
          stamped: false,
          duplicate: false,
        });
        return;
      }
      ls.forEach((l, n) => {
        out.push({
          ...base,
          rowKey: l.lineKey || `v${id}-${n}`,
          lineKey: l.lineKey ?? '',
          plannedQty: l.plannedQty ?? 0,
          receivedQty: l.receivedQty,
          defectQty: l.defectQty,
          stamped: (l.receivedQty ?? 0) > 0 || (l.defectQty ?? 0) > 0,
          duplicate: ls.length > 1,
        });
      });
    };
    for (const v of outputVariants) if (v.active && (v.id ?? 0) > 0) take(v, v.id ?? 0);
    // Whatever is left is on the run but not a live colour — retired, or (defensively) a variant
    // this card no longer reports at all. Rendered either way: a row we drop is a plan we lose.
    for (const id of [...byVariant.keys()])
      take(
        outputVariants.find((v) => v.id === id),
        id,
      );
    return out;
  }, [lines, outputVariants]);

  const duplicates = rows.filter((r) => r.duplicate);
  const blocked = !!legacyStamped || duplicates.length > 0;

  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  // A sibling save (marker / costs) refetches the run — a dirty guard keeps a refetch from
  // discarding typed-but-unsaved quantities, matching the lines grid.
  const [dirty, setDirty] = useState(false);
  // What the last successful save SENT. Clearing `dirty` the moment the mutation resolves re-seeds
  // the inputs from `rows`, which still describe the pre-save run until the refetch lands — a
  // colour just zeroed would visibly reappear at its old quantity and then vanish again. Instead
  // the flag is held until the run actually reads back the plan we submitted.
  const savedPlan = useRef<string | null>(null);
  const planSignature = (ls: { outputVariantId?: number; plannedQty?: number }[]) =>
    ls
      .filter((l) => (l.outputVariantId ?? 0) > 0)
      .map((l) => `${l.outputVariantId}:${l.plannedQty ?? 0}`)
      .sort()
      .join('|');

  useEffect(() => {
    if (dirty) {
      if (savedPlan.current !== null && savedPlan.current === planSignature(lines)) {
        savedPlan.current = null;
        setDirty(false);
      }
      return;
    }
    const next: Record<string, string> = {};
    for (const r of rows) next[r.rowKey] = r.plannedQty ? String(r.plannedQty) : '';
    setQtyById(next);
  }, [rows, lines, dirty]);

  const qtyOf = (r: VariantRow) => Number(qtyById[r.rowKey] ?? '') || 0;

  const save = async () => {
    if (blocked) return;
    // A retired colour may keep the line it already has, but a new one is refused at plan time.
    const revived = rows.find((r) => !r.active && !r.lineKey && qtyOf(r) > 0);
    if (revived) {
      showMessage(
        `${revived.colorCode || 'this colour'} is retired — reactivate it on the tech card before planning it`,
        'error',
      );
      return;
    }
    // Zero-qty rows drop out (that is how a colour is removed from the run) — EXCEPT one that
    // already carries counted units, where dropping the line would discard the receipt history it
    // holds. Those stay on the run at whatever quantity is typed.
    const payload = rows
      .filter((r) => qtyOf(r) > 0 || (r.stamped && r.lineKey))
      .map((r) => ({
        productId: 0,
        sizeId: 0,
        outputVariantId: r.variantId,
        plannedQty: qtyOf(r),
        receivedQty: r.receivedQty,
        defectQty: r.defectQty,
        // Keep the stored line's stable identity so re-planning UPDATEs that row in place instead
        // of retiring it and its id; mint one only for a colour that has no line yet.
        lineKey: r.lineKey || ulid(),
      }));
    if (payload.length === 0) {
      showMessage('Enter a planned quantity greater than 0 for at least one colour', 'error');
      return;
    }
    try {
      await update.mutateAsync({
        id: run.id!,
        lockVersion: run.lockVersion ?? 0,
        patch: { lines: payload },
      });
      // Not setDirty(false) — the effect above clears it once the refetched run reports this plan,
      // so the inputs never flash the pre-save quantities in between.
      savedPlan.current = planSignature(payload);
      showMessage('Plan saved', 'success');
    } catch (e) {
      showMessage(updateRunErrorMessage(e), 'error');
    }
  };

  return (
    <div className='flex flex-col gap-2'>
      <Text variant='uppercase' size='small'>
        auxiliary output · by colour
        {dirty ? <span className='ml-2 lowercase text-labelColor'>· unsaved</span> : null}
      </Text>
      <Text variant='inactive' size='small'>
        each colour is produced into its own warehouse bucket — on receive the good units of every
        line are booked into that colour's material, not into one shared output.
      </Text>

      {legacyStamped ? (
        <Text size='small'>
          ! this run was planned as a single output and has already been counted against (
          {legacyStamped.receivedQty ?? 0} received). A run cannot mix that line with per-colour
          ones, and removing it would discard its receipt history — finish or reverse this run, then
          plan the colours on a new one.
        </Text>
      ) : null}

      {duplicates.length > 0 ? (
        <Text size='small'>
          ! this run has more than one line for the same colour ({duplicates.length} rows below are
          marked). Saving replaces the run's lines wholesale, so it would delete the extras — which
          nothing here planned and nobody has reviewed. Sort the duplicates out directly before
          re-planning; the editor stays read-only until then.
        </Text>
      ) : null}

      {rows.length === 0 ? (
        <Text size='small'>
          ! no colours registered on the tech card ·{' '}
          <Link to={`${ROUTES.techCards}/${run.run?.techCardId}`} className='underline'>
            open tech card ↗
          </Link>
        </Text>
      ) : null}

      <div className='flex flex-col'>
        {rows.map((r) => (
          <div
            key={r.rowKey}
            className='flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-1.5'
          >
            <span className='flex min-w-0 items-center gap-2'>
              <Swatch hex={hexByCode.get(r.colorCode)} title={r.colorName || undefined} />
              <span className='uppercase'>{r.colorCode || `#${r.variantId}`}</span>
              <Text size='micro' variant='label' component='span' className='truncate'>
                {r.colorName || ''}
                {r.materialName ? ` · → ${r.materialName}` : ''}
                {r.unit ? ` · ${r.unit}` : ''}
              </Text>
              {!r.active ? <Pill tone='mut'>retired</Pill> : null}
              {r.duplicate ? <Pill tone='warn'>duplicate line</Pill> : null}
            </span>
            <span className='flex items-center gap-3'>
              {r.receivedQty != null ? (
                <Text variant='inactive' size='small'>
                  received {r.receivedQty}
                  {r.defectQty ? ` · defect ${r.defectQty}` : ''}
                </Text>
              ) : null}
              <input
                className={input}
                inputMode='numeric'
                aria-label={`planned quantity ${r.colorCode || r.variantId}`}
                value={qtyById[r.rowKey] ?? ''}
                disabled={!editable || blocked}
                onChange={(e) => {
                  setDirty(true);
                  setQtyById((prev) => ({
                    ...prev,
                    [r.rowKey]: e.target.value.replace(/[^0-9]/g, ''),
                  }));
                }}
              />
            </span>
          </div>
        ))}
      </div>

      {editable && rows.length > 0 ? (
        <div>
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            disabled={update.isPending || blocked}
            onClick={save}
          >
            {update.isPending ? 'saving…' : 'save plan'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type VariantRow = {
  /** Stable per ROW — the line's key, or `v<id>` for a colour that has no line yet. */
  rowKey: string;
  variantId: number;
  colorCode: string;
  colorName: string;
  materialName: string;
  unit: string;
  /** false = the colour is retired on the card; its existing line is grandfathered, no new one. */
  active: boolean;
  lineKey: string;
  plannedQty: number;
  receivedQty?: number;
  defectQty?: number;
  /** Already counted against — dropping this line would discard its receipt history. */
  stamped: boolean;
  /** This colour has more than one line on the run; a full-replace save would delete the others. */
  duplicate: boolean;
};

// The legacy single-output editor, unchanged: one product-less line holding the whole quantity,
// received into the card's output_material_id.
function SingleOutputRunPlan({
  run,
  canEdit,
  locked,
  outputMaterialId,
  outputMaterial,
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  locked: boolean;
  outputMaterialId: number;
  outputMaterial?: common_Material;
}) {
  const { showMessage } = useSnackBarStore();
  const update = useUpdateRunSection();
  const editable = canEdit && !locked;

  // The aux run's single product-less line holds the whole planned quantity.
  const lines = run.run?.lines ?? [];
  const line = lines.find((l) => !l.productId) ?? lines[0];

  const [qty, setQty] = useState('');
  // A sibling save (marker / costs) refetches the run — a dirty guard keeps a refetch from
  // discarding a typed-but-unsaved quantity, matching the lines grid.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (dirty) return;
    setQty(line?.plannedQty ? String(line.plannedQty) : '');
  }, [line, dirty]);

  const unit = outputMaterial?.unit?.trim();
  const label = materialLabel(outputMaterial, outputMaterialId);

  const save = async () => {
    const planned = Number(qty);
    if (!qty.trim() || !Number.isFinite(planned) || planned <= 0) {
      showMessage('Enter a planned quantity greater than 0', 'error');
      return;
    }
    // Replace the run's lines with the single aux line; keep any already-counted received/defect
    // so re-planning before receive doesn't wipe a partial count.
    try {
      await update.mutateAsync({
        id: run.id!,
        lockVersion: run.lockVersion ?? 0,
        patch: {
          lines: [
            {
              productId: 0,
              sizeId: 0,
              plannedQty: planned,
              receivedQty: line?.receivedQty,
              defectQty: line?.defectQty,
              // The legacy single-output line carries no colour.
              outputVariantId: undefined,
              // Keep the stored line's stable identity so re-planning UPDATEs that row in place
              // instead of retiring it and its id; mint one only for a run that has no line yet.
              lineKey: line?.lineKey || ulid(),
            },
          ],
        },
      });
      setDirty(false);
      showMessage('Plan saved', 'success');
    } catch (e) {
      showMessage(updateRunErrorMessage(e), 'error');
    }
  };

  return (
    <div className='flex flex-col gap-2'>
      <Text variant='uppercase' size='small'>
        auxiliary output
        {dirty ? <span className='ml-2 lowercase text-labelColor'>· unsaved</span> : null}
      </Text>

      {outputMaterialId ? (
        <Text variant='inactive' size='small'>
          produces → {label}
          {unit ? ` · ${unit}` : ''} · booked into the material warehouse on receive
        </Text>
      ) : (
        <Text size='small'>
          ! nowhere to book this run's output — set an output material, or register a colour variant
          per colour it produces, before planning or receiving ·{' '}
          <Link to={`${ROUTES.techCards}/${run.run?.techCardId}`} className='underline'>
            open tech card ↗
          </Link>
        </Text>
      )}

      <div className='flex flex-wrap items-end gap-3'>
        <label className='flex flex-col gap-1'>
          <Text size='small'>planned quantity{unit ? ` (${unit})` : ''}</Text>
          <input
            className={input}
            inputMode='numeric'
            value={qty}
            disabled={!editable}
            onChange={(e) => {
              setDirty(true);
              setQty(e.target.value.replace(/[^0-9]/g, ''));
            }}
          />
        </label>
        {line?.receivedQty != null ? (
          <Text variant='inactive' size='small'>
            received {line.receivedQty}
            {line.defectQty ? ` · defect ${line.defectQty}` : ''}
          </Text>
        ) : null}
        {editable ? (
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            disabled={update.isPending}
            onClick={save}
          >
            {update.isPending ? 'saving…' : 'save plan'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
