import { PackagingBomItem } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import {
  FailNote,
  isRefusal,
  notifyFailure,
} from 'components/managers/production-runs/components/feedback';
import { useEffect, useState } from 'react';
import { Button, Text, EmptyCell, Close, useDoneFlash } from 'ui';
import {
  decimalToInput,
  normalizeDecimalInput,
  parseDecimalNumber,
  sanitizeDecimal,
} from 'utils/decimal';
import { MaterialPicker } from './material-picker';
import { usePackagingBom, useUpsertPackagingBom } from './useMaterials';

const cell = 'w-full border border-borderColor bg-bgColor px-2 py-1.5 text-textBaseSize';
const th =
  'border border-borderColor bg-borderColor/20 px-2 py-1 text-left text-textBaseSize uppercase';
const td = 'border border-borderColor px-2 py-1 align-top text-textBaseSize';

type Row = {
  materialId: number;
  materialName: string;
  materialUnit: string;
  qtyPerOrder: string;
  qtyPerItem: string;
  active: boolean;
};

const rowFrom = (i: PackagingBomItem): Row => ({
  materialId: i.materialId ?? 0,
  materialName: i.materialName ?? '',
  materialUnit: i.materialUnit ?? '',
  qtyPerOrder: decimalToInput(i.qtyPerOrder),
  qtyPerItem: decimalToInput(i.qtyPerItem),
  active: i.active ?? true,
});

// Packaging BOM editor (gap-07 v2 B): the single global recipe of packaging materials consumed on
// ship — a per-order quantity (fixed, e.g. one box) and/or a per-item quantity (scales with the
// order, e.g. a polybag per garment). UpsertPackagingBom is a full replace, so the editor holds the
// whole list in local state and submits every row at once.
export function PackagingBomTab() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(SECTION.techCards);
  const saved = useDoneFlash();
  const [fail, setFail] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = usePackagingBom();
  const upsert = useUpsertPackagingBom();

  const [rows, setRows] = useState<Row[]>([]);
  // A refetch (e.g. after save) must not clobber unsaved edits mid-flow.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (dirty) return;
    setRows((data?.items ?? []).map(rowFrom));
  }, [data, dirty]);

  const patch = (i: number, p: Partial<Row>) => {
    setDirty(true);
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  };
  const addRow = () => {
    setDirty(true);
    setRows((prev) => [
      ...prev,
      {
        materialId: 0,
        materialName: '',
        materialUnit: '',
        qtyPerOrder: '',
        qtyPerItem: '',
        active: true,
      },
    ]);
  };
  const removeRow = (i: number) => {
    setDirty(true);
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const save = async () => {
    setFail(null);
    for (const r of rows) {
      if (!r.materialId) {
        setFail('every row needs a material (or remove it)');
        return;
      }
      for (const q of [r.qtyPerOrder, r.qtyPerItem]) {
        if (q.trim()) {
          const n = parseDecimalNumber(q);
          if (!Number.isFinite(n) || n < 0) {
            setFail('quantities must be zero or more');
            return;
          }
        }
      }
      if (!r.qtyPerOrder.trim() && !r.qtyPerItem.trim()) {
        setFail('each material needs a per-order or per-item quantity');
        return;
      }
    }
    if (new Set(rows.map((r) => r.materialId)).size !== rows.length) {
      setFail('a material appears twice — merge the rows');
      return;
    }
    const items: PackagingBomItem[] = rows.map((r) => ({
      materialId: r.materialId,
      materialName: r.materialName || undefined,
      materialUnit: r.materialUnit || undefined,
      qtyPerOrder: r.qtyPerOrder.trim()
        ? { value: normalizeDecimalInput(r.qtyPerOrder) }
        : undefined,
      qtyPerItem: r.qtyPerItem.trim() ? { value: normalizeDecimalInput(r.qtyPerItem) } : undefined,
      active: r.active,
    }));
    try {
      await upsert.mutateAsync(items);
      setDirty(false);
      saved.flash();
    } catch (e) {
      const sentence = e instanceof Error ? e.message : "couldn't save the packaging BOM";
      if (isRefusal(e)) setFail(sentence);
      else notifyFailure('PACKAGING BOM', 'not saved', e, sentence, save);
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Text variant='inactive' size='small'>
          materials consumed on every shipment — per order (fixed) and/or per item (scales with the
          order). Booked as cost on ship.
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
              done={saved.on && 'saved'}
              onClick={save}
            >
              {upsert.isPending ? 'saving…' : 'save'}
            </Button>
          </div>
        )}
      </div>
      <FailNote verb='not saved' text={fail} />

      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading…
        </Text>
      ) : isError ? (
        <div className='flex items-center gap-3'>
          <Text variant='error' size='small'>
            failed to load packaging BOM
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
          no packaging materials yet{canEdit ? ' — add one to start the recipe' : ''}
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
                <tr key={i}>
                  <td className={`${td} w-72`}>
                    {canEdit ? (
                      // #7 (M7): pin the picker to the packaging section so the "consumed on every
                      // shipment" recipe can't pull in an arbitrary fabric/hardware/thread material.
                      <MaterialPicker
                        section='TECH_CARD_BOM_SECTION_PACKAGING'
                        value={r.materialId}
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
                        <Text size='small'>{r.qtyPerOrder || <EmptyCell />}</Text>
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
                        <Text size='small'>{r.qtyPerItem || <EmptyCell />}</Text>
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
                      <Close size='sm' aria-label='remove material' onClick={() => removeRow(i)} />
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
