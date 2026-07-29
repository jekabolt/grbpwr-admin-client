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
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import {
  decimalToInput,
  normalizeDecimalInput,
  parseDecimalNumber,
  sanitizeDecimal,
} from 'utils/decimal';
import { ulid } from 'utils/ulid';
import { AuxCardPickerModal, DUST_BAG_SUBTYPE, Field, auxCardLabel } from './labels-pkg-shared';
import { usePackagingRecipe, useUpsertPackagingRecipe } from './useAssemblyPacking';

type RecipeRow = {
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
type AuxResolved = Pick<RecipeRow, 'materialId' | 'materialName' | 'materialUnit' | 'sourceLabel'>;

const rowFrom = (i: PackagingRecipeLine): RecipeRow => ({
  key: ulid(),
  materialId: i.materialId ?? 0,
  materialName: i.materialName ?? '',
  materialUnit: i.materialUnit ?? '',
  qtyPerOrder: decimalToInput(i.qtyPerOrder),
  qtyPerItem: decimalToInput(i.qtyPerItem),
  active: i.active ?? true,
  sourceLabel: '',
});

const newRow = (): RecipeRow => ({
  key: ulid(),
  materialId: 0,
  materialName: '',
  materialUnit: '',
  qtyPerOrder: '',
  qtyPerItem: '',
  active: true,
  sourceLabel: '',
});

// One packaging-recipe line as a card: the material thumbnail + name up top, the material picker
// (+ "from an aux card's output" swap) to change it, then the two quantities side by side with
// their meaning spelled out, and active + remove always in place.
function PackagingRow({
  row,
  canEdit,
  material,
  resolveAux,
  resolvingId,
  onPatch,
  onRemove,
}: {
  row: RecipeRow;
  canEdit: boolean;
  material?: common_Material; // resolved from the catalog for the thumbnail (id-only rows)
  resolveAux: (card: common_TechCardListItem) => Promise<AuxResolved | null>;
  resolvingId: number | null;
  onPatch: (patch: Partial<RecipeRow>) => void;
  onRemove: () => void;
}) {
  const [auxOpen, setAuxOpen] = useState(false);

  return (
    <div className='border border-borderColor p-2'>
      <div className='flex items-center gap-2'>
        <MaterialThumb material={material} size='sm' />
        <div className='min-w-0 flex-1'>
          <Text size='control' component='span' className='block truncate font-bold uppercase'>
            {row.materialName || (row.materialId ? `#${row.materialId}` : '— not set —')}
          </Text>
          {row.sourceLabel && (
            <Text size='micro' variant='label' className='truncate'>
              via {row.sourceLabel}
            </Text>
          )}
        </div>
        {!row.active && <Pill tone='mut'>inactive</Pill>}
        {canEdit && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            aria-label='remove material'
            onClick={onRemove}
          >
            ✕
          </Button>
        )}
      </div>

      {canEdit && (
        <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
          <div className='min-w-40 flex-1'>
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
          </div>
          <Button type='button' variant='secondary' size='xs' onClick={() => setAuxOpen(true)}>
            from an aux card
          </Button>
        </div>
      )}

      <div className='mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <Field label={`qty / order${row.materialUnit ? ` (${row.materialUnit})` : ''}`}>
          {canEdit ? (
            <Input
              name={`pkg-per-order-${row.key}`}
              inputMode='decimal'
              value={row.qtyPerOrder}
              className='text-right'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onPatch({ qtyPerOrder: sanitizeDecimal(e.target.value) })
              }
            />
          ) : (
            <Text size='control'>{row.qtyPerOrder || '—'}</Text>
          )}
          <Text size='micro' variant='label'>
            once per shipment — a branded box, a filler
          </Text>
        </Field>
        <Field label={`qty / item${row.materialUnit ? ` (${row.materialUnit})` : ''}`}>
          {canEdit ? (
            <Input
              name={`pkg-per-item-${row.key}`}
              inputMode='decimal'
              value={row.qtyPerItem}
              className='text-right'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onPatch({ qtyPerItem: sanitizeDecimal(e.target.value) })
              }
            />
          ) : (
            <Text size='control'>{row.qtyPerItem || '—'}</Text>
          )}
          <Text size='micro' variant='label'>
            × every unit of this style — a dust bag, a hangtag
          </Text>
        </Field>
      </div>

      <label className='mt-1.5 flex items-center gap-1.5'>
        <input
          type='checkbox'
          disabled={!canEdit}
          checked={row.active}
          onChange={(e) => onPatch({ active: e.target.checked })}
        />
        <Text size='micro' variant='label' component='span' className='uppercase'>
          active
        </Text>
      </label>

      {canEdit && auxOpen && (
        <AuxCardPickerModal
          open
          onOpenChange={(o) => !o && setAuxOpen(false)}
          title="from an aux card's output"
          hint='resolves the chosen auxiliary card’s output material into this row'
          busyId={resolvingId}
          onPick={async (card) => {
            const r = await resolveAux(card);
            if (r) {
              onPatch(r);
              setAuxOpen(false);
            }
          }}
        />
      )}
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

  const [rows, setRows] = useState<RecipeRow[]>([]);
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

  const patch = (i: number, p: Partial<RecipeRow>) => {
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
      const res = await adminService.GetTechCard({ id: card.id, vatCountryCode: undefined });
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
    <div className='flex flex-col gap-2'>
      {/* Context, not content: what this style falls back to at order time while it has no active
          recipe of its own. A note box, so it never reads as something you edit here. */}
      <CalloutBox tone='note'>
        <Text size='micro' component='span'>
          <b>inherited global fallback</b> — used at order time only while this style has no active
          recipe of its own. Edit the global list from materials → packaging BOM.
        </Text>
        {isLoading ? (
          <Text size='micro' className='mt-1'>
            loading…
          </Text>
        ) : globalLines.length === 0 ? (
          <Text size='micro' className='mt-1'>
            no global packaging recipe
          </Text>
        ) : (
          <div className='mt-1'>
            {globalLines.map((l) => (
              <Row
                key={l.id}
                label={
                  <span className='flex min-w-0 items-center gap-1.5'>
                    <MaterialThumb material={materialsById.get(l.materialId ?? 0)} size='sm' />
                    <span className='truncate'>
                      {l.materialName || `#${l.materialId}`}
                      {l.active === false ? ' (inactive)' : ''}
                    </span>
                  </span>
                }
                value={`${decimalToInput(l.qtyPerOrder) || '—'} / order · ${
                  decimalToInput(l.qtyPerItem) || '—'
                } / item ${l.materialUnit ?? ''}`}
              />
            ))}
          </div>
        )}
      </CalloutBox>

      <GroupLabel>this style's own recipe</GroupLabel>

      <Toolbar>
        <Text size='micro' variant='label' component='span'>
          overrides the global fallback above while active
        </Text>
        {dirty && <Pill tone='attention'>unsaved</Pill>}
        <ToolbarSpacer />
        {canEdit && (
          <>
            {/* The common case, surfaced as an obvious action (#43): the garment ships inside an
                aux fabric dust bag (пыльник) — same aux-output mechanism, one prominent button. */}
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => setAddPicker('dust')}
            >
              ＋ dust bag (aux)
            </Button>
            <Button type='button' variant='secondary' size='sm' onClick={() => setAddPicker('aux')}>
              ＋ from an aux card
            </Button>
            <Button type='button' variant='secondary' size='sm' onClick={addRow}>
              ＋ material
            </Button>
            {/* Distinct from the main card's header Save — this persists to UpsertPackagingRecipe,
                a separate RPC the header Save does NOT cover. */}
            <Button
              type='button'
              variant='main'
              size='sm'
              disabled={upsert.isPending || !dirty}
              onClick={save}
            >
              {upsert.isPending ? 'saving…' : 'save packaging recipe'}
            </Button>
          </>
        )}
      </Toolbar>

      {addPicker && canEdit && (
        <AuxCardPickerModal
          // Remount when the mode flips (dust ↔ aux) so the sub-type filter re-initialises
          // instead of keeping the previous mode's stale value.
          key={addPicker}
          open
          onOpenChange={(o) => !o && setAddPicker(null)}
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
          onPick={(card) => addFromAux(card, addPicker === 'dust')}
        />
      )}

      {isLoading ? (
        <Text size='micro' variant='label'>
          loading…
        </Text>
      ) : isError ? (
        <CalloutBox tone='error'>
          <div className='flex flex-wrap items-center gap-2'>
            <Text size='micro' component='span'>
              <b>failed to load the packaging recipe</b>
            </Text>
            <Button type='button' variant='secondary' size='xs' onClick={() => refetch()}>
              retry
            </Button>
          </div>
        </CalloutBox>
      ) : rows.length === 0 ? (
        <Text size='micro' variant='label'>
          no style-specific packaging yet
          {canEdit
            ? ' — add a dust bag, an aux output, or a material to override the global fallback'
            : ''}
        </Text>
      ) : (
        <div className='grid grid-cols-1 gap-1.5 lg:grid-cols-2'>
          {rows.map((r, i) => (
            <PackagingRow
              key={r.key}
              row={r}
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
