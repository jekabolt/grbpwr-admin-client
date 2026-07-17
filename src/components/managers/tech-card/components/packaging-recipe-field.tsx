import { PackagingRecipeItem, PackagingRecipeLine } from 'api/proto-http/admin';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
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
import { usePackagingRecipe, useUpsertPackagingRecipe } from './useAssemblyPacking';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';
const th =
  'border border-textInactiveColor bg-textInactiveColor/20 px-2 py-1 text-left text-textBaseSize uppercase';
const td = 'border border-textInactiveColor px-2 py-1 align-top text-textBaseSize';

type Row = {
  key: string; // client-only stable id (ulid) — add/remove never remaps another row's inputs
  materialId: number;
  materialName: string;
  materialUnit: string;
  qtyPerOrder: string;
  qtyPerItem: string;
  active: boolean;
};

const rowFrom = (i: PackagingRecipeLine): Row => ({
  key: ulid(),
  materialId: i.materialId ?? 0,
  materialName: i.materialName ?? '',
  materialUnit: i.materialUnit ?? '',
  qtyPerOrder: decimalToInput(i.qtyPerOrder),
  qtyPerItem: decimalToInput(i.qtyPerItem),
  active: i.active ?? true,
});

const newRow = (): Row => ({
  key: ulid(),
  materialId: 0,
  materialName: '',
  materialUnit: '',
  qtyPerOrder: '',
  qtyPerItem: '',
  active: true,
});

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
          used at order time when this style has no active recipe of its own. Edit it from materials
          → packaging BOM.
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
          <div className='overflow-x-auto'>
            <table className='w-full min-w-max border-collapse'>
              <thead>
                <tr>
                  <th className={th}>material</th>
                  <th className={th}>qty / order</th>
                  <th className={th}>qty / item</th>
                  <th className={th}>active</th>
                </tr>
              </thead>
              <tbody>
                {globalLines.map((l) => (
                  <tr key={l.id}>
                    <td className={td}>{l.materialName || `#${l.materialId}`}</td>
                    <td className={td}>
                      {decimalToInput(l.qtyPerOrder) || '—'} {l.materialUnit}
                    </td>
                    <td className={td}>
                      {decimalToInput(l.qtyPerItem) || '—'} {l.materialUnit}
                    </td>
                    <td className={td}>{l.active === false ? 'no' : 'yes'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              + material
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              className='uppercase'
              disabled={upsert.isPending || !dirty}
              onClick={save}
            >
              {upsert.isPending ? 'saving…' : 'save'}
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
          no style-specific packaging
          {canEdit ? ' — add a material to override the global fallback' : ''}
        </Text>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full min-w-max border-collapse'>
            <thead>
              <tr>
                <th className={th}>material</th>
                <th className={th}>qty / order</th>
                <th className={th}>qty / item</th>
                <th className={th}>active</th>
                {canEdit ? <th className={th} /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td className={`${td} w-72`}>
                    {canEdit ? (
                      <MaterialPicker
                        value={r.materialId}
                        section='TECH_CARD_BOM_SECTION_PACKAGING'
                        onChange={(materialId, material) =>
                          patch(i, {
                            materialId,
                            materialName: material?.name ?? '',
                            materialUnit: material?.unit ?? '',
                          })
                        }
                      />
                    ) : (
                      <Text size='small'>{r.materialName || `#${r.materialId}`}</Text>
                    )}
                  </td>
                  <td className={td}>
                    <div className='flex items-center gap-1'>
                      {canEdit ? (
                        <input
                          className={`${cell} w-24`}
                          inputMode='decimal'
                          value={r.qtyPerOrder}
                          onChange={(e) =>
                            patch(i, { qtyPerOrder: sanitizeDecimal(e.target.value) })
                          }
                        />
                      ) : (
                        <Text size='small'>{r.qtyPerOrder || '—'}</Text>
                      )}
                      <Text variant='inactive' size='small'>
                        {r.materialUnit}
                      </Text>
                    </div>
                  </td>
                  <td className={td}>
                    <div className='flex items-center gap-1'>
                      {canEdit ? (
                        <input
                          className={`${cell} w-24`}
                          inputMode='decimal'
                          value={r.qtyPerItem}
                          onChange={(e) =>
                            patch(i, { qtyPerItem: sanitizeDecimal(e.target.value) })
                          }
                        />
                      ) : (
                        <Text size='small'>{r.qtyPerItem || '—'}</Text>
                      )}
                      <Text variant='inactive' size='small'>
                        {r.materialUnit}
                      </Text>
                    </div>
                  </td>
                  <td className={`${td} text-center`}>
                    <input
                      type='checkbox'
                      disabled={!canEdit}
                      checked={r.active}
                      onChange={(e) => patch(i, { active: e.target.checked })}
                    />
                  </td>
                  {canEdit ? (
                    <td className={td}>
                      <Button
                        type='button'
                        variant='secondary'
                        aria-label='remove material'
                        onClick={() => removeRow(i)}
                      >
                        ✕
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
