import { adminService } from 'api/api';
import {
  PackagingRecipeItem,
  PackagingRecipeLine,
  common_Material,
  common_TechCardListItem,
} from 'api/proto-http/admin';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
import { MaterialThumb } from 'components/managers/materials/components/material-thumb';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import {
  decimalToInput,
  normalizeDecimalInput,
  parseDecimalNumber,
  sanitizeDecimal,
} from 'utils/decimal';
import { ulid } from 'utils/ulid';
import { AuxCardTilePicker, DUST_BAG_SUBTYPE, auxCardLabel } from './labels-pkg-shared';
import { usePackagingRecipe, useUpsertPackagingRecipe } from './useAssemblyPacking';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

type Row = {
  key: string; // client-only stable id (ulid) — add/remove never remaps another row's inputs
  materialId: number;
  materialName: string;
  materialUnit: string;
  qtyPerOrder: string;
  qtyPerItem: string;
  active: boolean;
  // Client-only display hint: which aux card's output this row was last picked from (§ below).
  // Never sent on save — PackagingRecipeItem is materialId-only — and not known for a row loaded
  // from the server, so it's blank until the user (re)picks it via "from an aux card's output".
  sourceLabel: string;
};

// The fields resolveAux resolves an aux card's output into (fed to a row as if MaterialPicker
// had picked it directly).
type AuxResolved = Pick<Row, 'materialId' | 'materialName' | 'materialUnit' | 'sourceLabel'>;

const rowFrom = (i: PackagingRecipeLine): Row => ({
  key: ulid(),
  materialId: i.materialId ?? 0,
  materialName: i.materialName ?? '',
  materialUnit: i.materialUnit ?? '',
  qtyPerOrder: decimalToInput(i.qtyPerOrder),
  qtyPerItem: decimalToInput(i.qtyPerItem),
  active: i.active ?? true,
  sourceLabel: '',
});

const newRow = (): Row => ({
  key: ulid(),
  materialId: 0,
  materialName: '',
  materialUnit: '',
  qtyPerOrder: '',
  qtyPerItem: '',
  active: true,
  sourceLabel: '',
});

// One packaging-recipe line as a scannable card (#70): a prominent material thumbnail + name up
// top, the material picker (+ "from an aux card's output" swap) to change it, then the two
// quantities side by side with their meaning spelled out, and active + remove always in place.
function PackagingRow({
  row,
  index,
  canEdit,
  material,
  resolveAux,
  resolvingId,
  onPatch,
  onRemove,
}: {
  row: Row;
  index: number;
  canEdit: boolean;
  material?: common_Material; // resolved from the catalog for the thumbnail (id-only rows)
  resolveAux: (card: common_TechCardListItem) => Promise<AuxResolved | null>;
  resolvingId: number | null;
  onPatch: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const [auxOpen, setAuxOpen] = useState(false);

  return (
    <div className='space-y-3 border border-textInactiveColor p-3'>
      <div className='flex items-start gap-3'>
        <MaterialThumb material={material} size='md' />
        <div className='min-w-0 flex-1 space-y-0.5'>
          <Text variant='uppercase' size='small'>
            material {index + 1}
          </Text>
          <Text size='small' className='truncate'>
            {row.materialName || (row.materialId ? `#${row.materialId}` : '— not set —')}
          </Text>
          {row.sourceLabel && (
            <Text variant='inactive' size='small' className='truncate'>
              via {row.sourceLabel}
            </Text>
          )}
        </div>
        {canEdit && (
          <Button type='button' variant='secondary' aria-label='remove material' onClick={onRemove}>
            ✕
          </Button>
        )}
      </div>

      {canEdit && (
        <div className='space-y-1'>
          <MaterialPicker
            value={row.materialId}
            section='TECH_CARD_BOM_SECTION_PACKAGING'
            onChange={(materialId, picked) =>
              onPatch({
                materialId,
                materialName: picked?.name ?? '',
                materialUnit: picked?.unit ?? '',
                sourceLabel: '', // picked directly — no longer "via" an aux card
              })
            }
          />
          {auxOpen ? (
            <AuxCardTilePicker
              title="from an aux card's output"
              hint='resolves the chosen auxiliary card’s output material into this row'
              busyId={resolvingId}
              onCancel={() => setAuxOpen(false)}
              onPick={async (card) => {
                const r = await resolveAux(card);
                if (r) {
                  onPatch(r);
                  setAuxOpen(false);
                }
              }}
            />
          ) : (
            <button
              type='button'
              className='text-left text-[11px] uppercase text-labelColor underline'
              onClick={() => setAuxOpen(true)}
            >
              or pick from an aux card's output ▸
            </button>
          )}
        </div>
      )}

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div className='space-y-1'>
          <Text size='small' variant='label'>
            qty / order
          </Text>
          <Text variant='inactive' size='small'>
            once per shipment — a branded box, a filler
          </Text>
          {canEdit ? (
            <div className='flex items-center gap-1'>
              <input
                className={cell}
                inputMode='decimal'
                value={row.qtyPerOrder}
                onChange={(e) => onPatch({ qtyPerOrder: sanitizeDecimal(e.target.value) })}
              />
              <Text variant='inactive' size='small'>
                {row.materialUnit}
              </Text>
            </div>
          ) : (
            <Text size='small'>
              {row.qtyPerOrder || '—'} {row.materialUnit}
            </Text>
          )}
        </div>
        <div className='space-y-1'>
          <Text size='small' variant='label'>
            qty / item
          </Text>
          <Text variant='inactive' size='small'>
            × every unit of this style — a dust bag, a hangtag
          </Text>
          {canEdit ? (
            <div className='flex items-center gap-1'>
              <input
                className={cell}
                inputMode='decimal'
                value={row.qtyPerItem}
                onChange={(e) => onPatch({ qtyPerItem: sanitizeDecimal(e.target.value) })}
              />
              <Text variant='inactive' size='small'>
                {row.materialUnit}
              </Text>
            </div>
          ) : (
            <Text size='small'>
              {row.qtyPerItem || '—'} {row.materialUnit}
            </Text>
          )}
        </div>
      </div>

      <label className='flex items-center gap-2'>
        <input
          type='checkbox'
          disabled={!canEdit}
          checked={row.active}
          onChange={(e) => onPatch({ active: e.target.checked })}
        />
        <Text size='small'>active</Text>
      </label>
    </div>
  );
}

// This style's packaging recipe (PLM rework §2.8, Q3): materials consumed on ship for orders that
// include this style — qty_per_order once per shipment (a branded box) plus qty_per_item × the
// order's unit count of this style (a dust bag). Resolution at order time is product -> style ->
// global (first active match wins), so the global lines are shown read-only above the editor: it's
// what this style falls back to while its own recipe is empty (or every line here is inactive).
// UpsertPackagingRecipe full-replaces this ONE scope target, so the editor holds this style's rows
// in local state and submits them all at once on Save — not per-keystroke.
export function PackagingRecipeField({
  techCardId,
  canEdit,
}: {
  techCardId: number;
  canEdit: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const { data, isLoading, isError, refetch } = usePackagingRecipe();
  const upsert = useUpsertPackagingRecipe();

  // Unfiltered catalog: a packaging-recipe material (esp. an aux card's output) can live under any
  // section, so resolve every row's thumbnail/name from the whole catalog, not just packaging.
  const { data: materialsData } = useMaterials('', false);
  const materialsById = useMemo(() => {
    const m = new Map<number, common_Material>();
    for (const x of materialsData?.materials ?? []) if (x.id != null) m.set(x.id, x);
    return m;
  }, [materialsData]);

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const globalLines = useMemo(() => allItems.filter((i) => i.scope === 'global'), [allItems]);
  const styleLines = useMemo(
    () => allItems.filter((i) => i.scope === 'style' && i.techCardId === techCardId),
    [allItems, techCardId],
  );

  const [rows, setRows] = useState<Row[]>([]);
  // A background refetch (e.g. right after save) must not clobber unsaved edits mid-flow.
  const [dirty, setDirty] = useState(false);
  // Top-level aux picker: 'dust' (the common пыльник case, pre-filtered) or 'aux' (any output).
  const [addPicker, setAddPicker] = useState<'dust' | 'aux' | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  useEffect(() => {
    if (dirty) return;
    setRows(styleLines.map(rowFrom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dirty, techCardId]);

  const patch = (i: number, p: Partial<Row>) => {
    setDirty(true);
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  };
  const addRow = () => {
    setDirty(true);
    setRows((prev) => [...prev, newRow()]);
  };
  const removeRow = (i: number) => {
    setDirty(true);
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  // Resolves an auxiliary tech card's OUTPUT material into a row (#43). The recipe backend only ever
  // stores a plain materialId (PackagingRecipeItem has no tech-card link) — so this is a client-side
  // convenience: fetch the chosen card's detail (list rows don't carry output_material_id, only
  // GetTechCard does), then resolve that id's name/unit from the catalog. Once saved it's
  // indistinguishable from a direct MaterialPicker pick.
  const resolveAux = async (card: common_TechCardListItem): Promise<AuxResolved | null> => {
    if (!card.id || resolvingId != null) return null;
    setResolvingId(card.id);
    try {
      const res = await adminService.GetTechCard({ id: card.id });
      const materialId = res.techCard?.techCard?.outputMaterialId ?? 0;
      if (!materialId) {
        showMessage(`${auxCardLabel(card)} has no output material set yet`, 'error');
        return null;
      }
      const material = materialsById.get(materialId);
      return {
        materialId,
        materialName: material?.name ?? '',
        materialUnit: material?.unit ?? '',
        sourceLabel: auxCardLabel(card),
      };
    } catch (e) {
      showMessage(
        e instanceof Error ? e.message : 'Failed to resolve the aux card output',
        'error',
      );
      return null;
    } finally {
      setResolvingId(null);
    }
  };

  // Adds a NEW row from an aux card's output. Dust bag ships with every garment → default 1 / item;
  // a generic aux output is left blank so the user states per-order vs per-item intent explicitly.
  const addFromAux = async (card: common_TechCardListItem, dust: boolean) => {
    const r = await resolveAux(card);
    if (!r) return;
    setDirty(true);
    setRows((prev) => [...prev, { ...newRow(), ...r, qtyPerItem: dust ? '1' : '' }]);
    setAddPicker(null);
  };

  const save = async () => {
    if (!techCardId) return;
    for (const r of rows) {
      if (!r.materialId) {
        showMessage('Every row needs a material (or remove it)', 'error');
        return;
      }
      for (const q of [r.qtyPerOrder, r.qtyPerItem]) {
        if (q.trim()) {
          const n = parseDecimalNumber(q);
          if (!Number.isFinite(n) || n < 0) {
            showMessage('Quantities must be zero or more', 'error');
            return;
          }
        }
      }
      if (!r.qtyPerOrder.trim() && !r.qtyPerItem.trim()) {
        showMessage('Each material needs a per-order or per-item quantity', 'error');
        return;
      }
    }
    if (new Set(rows.map((r) => r.materialId)).size !== rows.length) {
      showMessage('A material appears twice — merge the rows', 'error');
      return;
    }
    const items: PackagingRecipeItem[] = rows.map((r) => ({
      materialId: r.materialId,
      qtyPerOrder: r.qtyPerOrder.trim()
        ? { value: normalizeDecimalInput(r.qtyPerOrder) }
        : undefined,
      qtyPerItem: r.qtyPerItem.trim() ? { value: normalizeDecimalInput(r.qtyPerItem) } : undefined,
      active: r.active,
    }));
    try {
      await upsert.mutateAsync({ scope: 'style', techCardId, productId: undefined, items });
      setDirty(false);
      showMessage('Packaging recipe saved', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save packaging recipe', 'error');
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='space-y-2 border border-textInactiveColor bg-textInactiveColor/10 p-3'>
        <Text variant='uppercase' size='small'>
          inherited global fallback
        </Text>
        <Text variant='inactive' size='small'>
          used at order time only while this style has no active recipe of its own (below). Edit the
          global list from materials → packaging BOM.
        </Text>
        {isLoading ? (
          <Text variant='inactive' size='small'>
            loading…
          </Text>
        ) : globalLines.length === 0 ? (
          <Text variant='inactive' size='small'>
            no global packaging recipe
          </Text>
        ) : (
          <ul className='flex flex-col gap-2'>
            {globalLines.map((l) => (
              <li key={l.id} className='flex items-center gap-2'>
                <MaterialThumb material={materialsById.get(l.materialId ?? 0)} size='sm' />
                <div className='flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 text-textBaseSize'>
                  <span className='truncate'>
                    {l.materialName || `#${l.materialId}`}
                    {l.active === false ? ' (inactive)' : ''}
                  </span>
                  <span className='text-textInactiveColor'>
                    {decimalToInput(l.qtyPerOrder) || '—'} / order ·{' '}
                    {decimalToInput(l.qtyPerItem) || '—'} / item {l.materialUnit}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className='flex flex-col gap-3'>
        <Text variant='inactive' size='small'>
          this style's own packaging recipe — overrides the global fallback above while active.
          {dirty ? <span className='ml-2 text-labelColor'>· unsaved</span> : null}
        </Text>
        {canEdit && (
          <div className='flex flex-wrap items-center gap-2'>
            {/* The common case, surfaced as an obvious action (#43): the garment ships inside an
                aux fabric dust bag (пыльник) — same aux-output mechanism, one prominent button. */}
            <Button
              type='button'
              variant='main'
              size='lg'
              className='uppercase'
              onClick={() => setAddPicker((p) => (p === 'dust' ? null : 'dust'))}
            >
              ＋ goes in a dust bag (aux)
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={() => setAddPicker((p) => (p === 'aux' ? null : 'aux'))}
            >
              ＋ from an aux card's output
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={addRow}
            >
              ＋ add material
            </Button>
            {/* Distinct from the main card's header Save (variant='main' above) — this persists to
                UpsertPackagingRecipe, a separate RPC the header Save does NOT cover. */}
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              disabled={upsert.isPending || !dirty}
              onClick={save}
            >
              {upsert.isPending ? 'saving…' : 'save packaging recipe'}
            </Button>
          </div>
        )}

        {addPicker && canEdit && (
          <AuxCardTilePicker
            // Remount when the mode flips (dust ↔ aux) so the sub-type filter re-initialises
            // instead of keeping the previous mode's stale value.
            key={addPicker}
            initialSubtype={addPicker === 'dust' ? DUST_BAG_SUBTYPE : undefined}
            title={
              addPicker === 'dust'
                ? 'pick the dust bag (пыльник) this style ships in'
                : 'pick an aux card — its output material fills a new row'
            }
            hint={
              addPicker === 'dust'
                ? 'the garment ships inside this aux fabric bag — adds a per-item packaging line (1 / item)'
                : 'resolves the chosen auxiliary card’s output material into a new row'
            }
            busyId={resolvingId}
            onCancel={() => setAddPicker(null)}
            onPick={(card) => addFromAux(card, addPicker === 'dust')}
          />
        )}
      </div>

      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading…
        </Text>
      ) : isError ? (
        <div className='flex items-center gap-3'>
          <Text variant='error' size='small'>
            failed to load packaging recipe
          </Text>
          <button
            type='button'
            className='text-textBaseSize uppercase underline'
            onClick={() => refetch()}
          >
            retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <Text variant='inactive' size='small'>
          no style-specific packaging yet
          {canEdit
            ? ' — add a dust bag, an aux output, or a material to override the global fallback'
            : ''}
        </Text>
      ) : (
        <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
          {rows.map((r, i) => (
            <PackagingRow
              key={r.key}
              row={r}
              index={i}
              canEdit={canEdit}
              material={materialsById.get(r.materialId)}
              resolveAux={resolveAux}
              resolvingId={resolvingId}
              onPatch={(p) => patch(i, p)}
              onRemove={() => removeRow(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
