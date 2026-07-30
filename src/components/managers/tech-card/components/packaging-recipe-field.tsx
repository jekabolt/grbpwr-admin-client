import { PackagingRecipeItem, PackagingRecipeLine } from 'api/proto-http/admin';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import {
  decimalToInput,
  normalizeDecimalInput,
  parseDecimalNumber,
  sanitizeDecimal,
} from 'utils/decimal';
import { ulid } from 'utils/ulid';
import { Field } from './labels-pkg-shared';
import { usePackagingRecipe, useUpsertPackagingRecipe } from './useAssemblyPacking';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';

// One style-scoped recipe per card, so one staging key.
const STAGING_KEY = 'packagingRecipe';

type RecipeRow = {
  key: string; // client-only stable id (ulid) — add/remove never remaps another row's inputs
  materialId: number;
  materialName: string;
  materialUnit: string;
  qtyPerOrder: string;
  qtyPerItem: string;
  active: boolean; // preserved through load/save; not toggled in this pared-down editor
};

const rowFrom = (i: PackagingRecipeLine): RecipeRow => ({
  key: ulid(),
  materialId: i.materialId ?? 0,
  materialName: i.materialName ?? '',
  materialUnit: i.materialUnit ?? '',
  qtyPerOrder: decimalToInput(i.qtyPerOrder),
  qtyPerItem: decimalToInput(i.qtyPerItem),
  active: i.active ?? true,
});

const newRow = (): RecipeRow => ({
  key: ulid(),
  materialId: 0,
  materialName: '',
  materialUnit: '',
  qtyPerOrder: '',
  qtyPerItem: '',
  active: true,
});

// What would make this recipe unsavable, in the operator's words — or null when it is fine. Shown
// next to the staged pill AND thrown from the commit, so the header's partial-failure banner names
// the same problem.
function recipeProblem(rows: RecipeRow[]): string | null {
  for (const r of rows) {
    if (!r.materialId) return 'Every row needs a material (or remove it)';
    for (const q of [r.qtyPerOrder, r.qtyPerItem]) {
      if (!q.trim()) continue;
      const n = parseDecimalNumber(q);
      if (!Number.isFinite(n) || n < 0) return 'Quantities must be zero or more';
    }
    if (!r.qtyPerOrder.trim() && !r.qtyPerItem.trim())
      return 'Each material needs a per-order or per-item quantity';
  }
  if (new Set(rows.map((r) => r.materialId)).size !== rows.length)
    return 'A material appears twice — merge the rows';
  return null;
}

// One packaging-recipe line, pared down: pick the packaging material, set how much ships once per
// order and how much per item, remove. Nothing else.
function PackagingRow({
  row,
  canEdit,
  onPatch,
  onRemove,
}: {
  row: RecipeRow;
  canEdit: boolean;
  onPatch: (patch: Partial<RecipeRow>) => void;
  onRemove: () => void;
}) {
  const unit = row.materialUnit ? ` (${row.materialUnit})` : '';
  return (
    <div className='flex flex-col gap-1.5 border border-borderColor bg-bgColor p-2'>
      <div className='flex items-center gap-1.5'>
        <div className='min-w-0 flex-1'>
          {canEdit ? (
            <MaterialPicker
              value={row.materialId}
              section='TECH_CARD_BOM_SECTION_PACKAGING'
              onChange={(materialId, picked) =>
                onPatch({
                  materialId,
                  materialName: picked?.name ?? '',
                  materialUnit: picked?.unit ?? '',
                })
              }
            />
          ) : (
            <Text size='control' component='span' className='font-bold uppercase'>
              {row.materialName || (row.materialId ? `#${row.materialId}` : '— not set —')}
            </Text>
          )}
        </div>
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

      <div className='grid grid-cols-2 gap-2'>
        <Field label={`/ order${unit}`}>
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
        </Field>
        <Field label={`/ item${unit}`}>
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
        </Field>
      </div>
    </div>
  );
}

// This style's packaging recipe: packaging materials consumed on ship — qty_per_order once per
// shipment (a branded box) plus qty_per_item × the order's unit count of this style (a dust bag).
// Empty → the global packaging recipe applies (edited from materials → packaging BOM).
// UpsertPackagingRecipe full-replaces this ONE scope target, so the editor holds the rows in local
// state and submits them at once, STAGED into the card's one save.
export function PackagingRecipeField({
  techCardId,
  canEdit,
}: {
  techCardId: number;
  canEdit: boolean;
}) {
  const { data, isLoading, isError, refetch } = usePackagingRecipe();
  const upsert = useUpsertPackagingRecipe();
  const staging = useTechCardStaging();

  const styleLines = useMemo(
    () => (data?.items ?? []).filter((i) => i.scope === 'style' && i.techCardId === techCardId),
    [data, techCardId],
  );

  const [rows, setRows] = useState<RecipeRow[]>([]);
  // A background refetch (e.g. right after save) must not clobber unsaved edits mid-flow.
  const [dirty, setDirty] = useState(false);
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

  const problem = recipeProblem(rows);

  // The panel's mutation, unwrapped: it THROWS on failure instead of toasting, because the header's
  // one save reports the outcome now — it needs the rejection to name this panel in a partial-failure
  // banner and keep everything after it staged (19.3).
  const commitRecipe = async () => {
    if (!techCardId) return;
    if (problem) throw new Error(problem);
    const items: PackagingRecipeItem[] = rows.map((r) => ({
      materialId: r.materialId,
      qtyPerOrder: r.qtyPerOrder.trim()
        ? { value: normalizeDecimalInput(r.qtyPerOrder) }
        : undefined,
      qtyPerItem: r.qtyPerItem.trim() ? { value: normalizeDecimalInput(r.qtyPerItem) } : undefined,
      active: r.active,
    }));
    await upsert.mutateAsync({ scope: 'style', techCardId, productId: undefined, items });
  };

  // Hand the mutation to the card's one save. Re-staged on EVERY edit because `commit` closes over
  // this render's rows; unstaged the moment the recipe is pristine again.
  useEffect(() => {
    if (!staging || !techCardId || !canEdit) return;
    if (!dirty) {
      staging.unstage(STAGING_KEY);
      return;
    }
    staging.stage({
      key: STAGING_KEY,
      label:
        rows.length === 0
          ? 'packaging recipe — cleared (global fallback applies)'
          : `packaging recipe — ${rows.length} ${rows.length === 1 ? 'material' : 'materials'}`,
      order: COMMIT_ORDER.packaging,
      commit: commitRecipe,
      settle: () => setDirty(false),
    });
    // commitRecipe is redefined every render by design (it reads current rows); depending on it here
    // would restage twice per keystroke for no gain, so the state it reads is the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging, techCardId, canEdit, dirty, rows]);

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-2'>
        <Text size='micro' variant='label' component='span'>
          per shipment (/order) + per item (/item) · empty → global fallback (materials → packaging
          BOM)
        </Text>
        {canEdit && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='ml-auto'
            onClick={addRow}
          >
            ＋ material
          </Button>
        )}
      </div>

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
          no style packaging yet{canEdit ? ' — add a material to override the global fallback' : ''}
        </Text>
      ) : (
        <div className='grid grid-cols-1 gap-1.5 lg:grid-cols-2'>
          {rows.map((r, i) => (
            <PackagingRow
              key={r.key}
              row={r}
              canEdit={canEdit}
              onPatch={(p) => patch(i, p)}
              onRemove={() => removeRow(i)}
            />
          ))}
        </div>
      )}

      {canEdit && dirty && (
        <div className='flex flex-wrap items-center gap-2'>
          <Pill tone='attention'>{upsert.isPending ? 'saving…' : 'staged for save'}</Pill>
          {problem && (
            <Text size='micro' variant='error' component='span'>
              {problem}
            </Text>
          )}
          <Text size='micro' variant='label' component='span' className='ml-auto'>
            included in the card’s Save
          </Text>
        </div>
      )}
    </div>
  );
}
