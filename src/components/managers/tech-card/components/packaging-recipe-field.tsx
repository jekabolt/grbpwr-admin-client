import { adminService } from 'api/api';
import {
  PackagingRecipeItem,
  PackagingRecipeLine,
  common_TechCardListItem,
} from 'api/proto-http/admin';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
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
import { auxCardLabel, useAuxTechCards } from './assembly-field';
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

// Resolves an auxiliary tech card's OUTPUT material into a packaging-recipe row (#43). The recipe
// backend only ever stores a plain materialId — PackagingRecipeItem has no tech-card-link field —
// so this is a client-side convenience, not a new relationship: search the auxiliary-card catalog
// (ListTechCards purpose=auxiliary, same query AssemblyField's component picker uses), fetch the
// chosen card's own detail (list rows don't carry output_material_id, only GetTechCard does), then
// resolve that id's name/unit from the material catalog. The result is fed into the row exactly as
// if MaterialPicker had picked it directly — once saved it's indistinguishable from a direct pick.
function AuxOutputPicker({
  onPicked,
  onCancel,
}: {
  onPicked: (
    materialId: number,
    materialName: string,
    materialUnit: string,
    sourceLabel: string,
  ) => void;
  onCancel: () => void;
}) {
  const { showMessage } = useSnackBarStore();
  const { data, isLoading } = useAuxTechCards();
  const cards = useMemo(() => data?.techCards ?? [], [data]);
  // Unfiltered: an aux card's output material can live under any catalog section, not just
  // "packaging" (a dust bag's fabric might be tagged FABRIC, a hangtag's stock tagged elsewhere).
  const { data: materialsData } = useMaterials('', false);
  const materials = useMemo(() => materialsData?.materials ?? [], [materialsData]);
  const [q, setQ] = useState('');
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter(
      (c) =>
        (c.styleNumber ?? '').toLowerCase().includes(needle) ||
        (c.name ?? '').toLowerCase().includes(needle),
    );
  }, [cards, q]);

  const pick = async (card: common_TechCardListItem) => {
    if (!card.id || resolvingId != null) return;
    setResolvingId(card.id);
    try {
      const res = await adminService.GetTechCard({ id: card.id });
      const materialId = res.techCard?.techCard?.outputMaterialId ?? 0;
      if (!materialId) {
        showMessage(`${auxCardLabel(card)} has no output material set yet`, 'error');
        return;
      }
      const material = materials.find((m) => m.id === materialId);
      onPicked(materialId, material?.name ?? '', material?.unit ?? '', auxCardLabel(card));
    } catch (e) {
      showMessage(
        e instanceof Error ? e.message : 'Failed to resolve the aux card output',
        'error',
      );
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className='space-y-2 border border-textInactiveColor bg-textInactiveColor/10 p-2'>
      <div className='flex items-center justify-between gap-2'>
        <Text variant='label' size='small'>
          pick an auxiliary tech card — its output material fills this row
        </Text>
        <Button type='button' variant='secondary' onClick={onCancel}>
          cancel
        </Button>
      </div>
      <input
        className={cell}
        placeholder='search style № / name'
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading…
        </Text>
      ) : filtered.length === 0 ? (
        <Text variant='inactive' size='small'>
          no auxiliary tech cards found
        </Text>
      ) : (
        <div className='flex max-h-40 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor'>
          {filtered.map((c) => (
            <button
              key={c.id}
              type='button'
              disabled={resolvingId != null}
              className='px-2 py-1.5 text-left text-textBaseSize hover:bg-textInactiveColor/30 disabled:opacity-50'
              onClick={() => pick(c)}
            >
              {auxCardLabel(c)}
              {resolvingId === c.id ? ' · resolving…' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// One packaging-recipe line, as a guided card rather than a table row (#70): the material picker
// is the one control that matters, the two quantities sit side by side with their meaning spelled
// out, and "active" + remove are always in the same place.
function PackagingRow({
  row,
  index,
  canEdit,
  onPatch,
  onRemove,
}: {
  row: Row;
  index: number;
  canEdit: boolean;
  onPatch: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const [auxOpen, setAuxOpen] = useState(false);

  return (
    <div className='space-y-3 border border-textInactiveColor p-3'>
      <div className='flex items-center justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          material {index + 1}
        </Text>
        {canEdit && (
          <Button type='button' variant='secondary' aria-label='remove material' onClick={onRemove}>
            ✕
          </Button>
        )}
      </div>

      {canEdit ? (
        <div className='space-y-1'>
          <MaterialPicker
            value={row.materialId}
            section='TECH_CARD_BOM_SECTION_PACKAGING'
            onChange={(materialId, material) =>
              onPatch({
                materialId,
                materialName: material?.name ?? '',
                materialUnit: material?.unit ?? '',
                sourceLabel: '', // picked directly — no longer "via" an aux card
              })
            }
          />
          {auxOpen ? (
            <AuxOutputPicker
              onCancel={() => setAuxOpen(false)}
              onPicked={(materialId, materialName, materialUnit, sourceLabel) => {
                onPatch({ materialId, materialName, materialUnit, sourceLabel });
                setAuxOpen(false);
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
          {row.sourceLabel && (
            <Text variant='inactive' size='small'>
              via {row.sourceLabel}
            </Text>
          )}
        </div>
      ) : (
        <Text size='small'>{row.materialName || `#${row.materialId}`}</Text>
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

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const globalLines = useMemo(() => allItems.filter((i) => i.scope === 'global'), [allItems]);
  const styleLines = useMemo(
    () => allItems.filter((i) => i.scope === 'style' && i.techCardId === techCardId),
    [allItems, techCardId],
  );

  const [rows, setRows] = useState<Row[]>([]);
  // A background refetch (e.g. right after save) must not clobber unsaved edits mid-flow.
  const [dirty, setDirty] = useState(false);
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
          <ul className='flex flex-col gap-1'>
            {globalLines.map((l) => (
              <li
                key={l.id}
                className='flex flex-wrap items-baseline justify-between gap-x-3 text-textBaseSize'
              >
                <span>
                  {l.materialName || `#${l.materialId}`}
                  {l.active === false ? ' (inactive)' : ''}
                </span>
                <span className='text-textInactiveColor'>
                  {decimalToInput(l.qtyPerOrder) || '—'} / order ·{' '}
                  {decimalToInput(l.qtyPerItem) || '—'} / item {l.materialUnit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Text variant='inactive' size='small'>
          this style's own packaging recipe — overrides the global fallback above while active.
          {dirty ? <span className='ml-2 text-labelColor'>· unsaved</span> : null}
        </Text>
        {canEdit && (
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={addRow}
            >
              + add material
            </Button>
            {/* Distinct from the main card's header Save (variant='main') — this button persists
                to UpsertPackagingRecipe, a separate RPC the header Save does NOT cover. secondary
                + an explicit label (mirrors style-facts-field.tsx's own sub-panel save) so it's
                never mistaken for "save the whole tech card". */}
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
          {canEdit ? ' — add a material to override the global fallback' : ''}
        </Text>
      ) : (
        <div className='space-y-3'>
          {rows.map((r, i) => (
            <PackagingRow
              key={r.key}
              row={r}
              index={i}
              canEdit={canEdit}
              onPatch={(p) => patch(i, p)}
              onRemove={() => removeRow(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
