import { adminService } from 'api/api';
import { common_Category, common_StyleSizeChartCell } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useMeasurements } from 'components/managers/product/utility/useMeasurements';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { cn } from 'lib/utility';
import { TechCardFormData } from './schema';

const cellClass = 'text-center border-r border-textInactiveColor w-20 lg:w-auto';
const lastCellClass = 'text-center w-20 lg:w-auto';

// SizeChartField — the style-owned size chart (R5), authored at the tech-card level.
// Measurements belong to the STYLE (one pattern shared by every colourway of the style), so they
// are edited here, in the constructor, and shown read-only on each colourway card — where editing
// them would look colourway-scoped while silently rewriting the shared chart for all colourways.
// Rows = the card's selected sizeIds; columns = the category's measurement names. Values load and
// save through GetStyleSizeChart / UpdateStyleSizeChart (full-replace) under the shared
// tech_card.lock_version — the same version the main tech-card save uses.
export function SizeChartField({ styleId, canEdit }: { styleId?: number; canEdit: boolean }) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const { control } = useFormContext<TechCardFormData>();

  const categoryId = (useWatch({ control, name: 'categoryId' }) as number | undefined) ?? 0;
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];

  // Walk the stored leaf category up to its { top, sub, type } ids — the same derivation the
  // header category cascade uses — so the measurement columns resolve exactly as the colourway
  // card's grid did (useMeasurements takes the three levels).
  const catPath = useMemo(() => {
    const byId = new Map<number, common_Category>();
    for (const c of dictionary?.categories ?? []) if (c.id != null) byId.set(c.id, c);
    const out = { top: 0, sub: 0, type: 0 };
    let cur = categoryId ? byId.get(categoryId) : undefined;
    let guard = 0;
    while (cur && guard++ < 8) {
      if (cur.level === 'top_category') out.top = cur.id ?? 0;
      else if (cur.level === 'sub_category') out.sub = cur.id ?? 0;
      else out.type = cur.id ?? 0;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return out;
  }, [categoryId, dictionary?.categories]);

  const { measurements } = useMeasurements(dictionary, catPath.top, catPath.sub, catPath.type);

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  // cell values: sizeId -> measurementNameId -> string
  const [cells, setCells] = useState<Map<number, Map<number, string>>>(new Map());
  const [saving, setSaving] = useState(false);

  const loadChart = useCallback(() => {
    if (!styleId) return;
    adminService
      .GetStyleSizeChart({ styleId })
      .then((res) => {
        const next = new Map<number, Map<number, string>>();
        for (const c of res.chart?.cells ?? []) {
          if (c.sizeId == null || c.measurementNameId == null) continue;
          const row = next.get(c.sizeId) ?? new Map<number, string>();
          row.set(c.measurementNameId, c.value?.value ?? '');
          next.set(c.sizeId, row);
        }
        setCells(next);
      })
      .catch(() => {
        /* no chart yet (draft) — leave the grid empty */
      });
  }, [styleId]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  const setCell = (sizeId: number, nameId: number, value: string) => {
    setCells((prev) => {
      const next = new Map(prev);
      const row = new Map(next.get(sizeId) ?? []);
      row.set(nameId, value);
      next.set(sizeId, row);
      return next;
    });
  };

  async function save() {
    if (!styleId) return;
    setSaving(true);
    try {
      // Read the freshest shared tech_card.lock_version right before the write: the chart shares it
      // with the main tech-card save, so a version cached at mount could already be stale.
      const cur = await adminService.GetStyleSizeChart({ styleId });
      const expectedLockVersion = cur.chart?.lockVersion ?? 0;
      const payload: common_StyleSizeChartCell[] = [];
      cells.forEach((row, sizeId) => {
        row.forEach((value, measurementNameId) => {
          if (value && value !== '0') payload.push({ sizeId, measurementNameId, value: { value } });
        });
      });
      await adminService.UpdateStyleSizeChart({ styleId, expectedLockVersion, cells: payload });
      showMessage('Size chart saved', 'success');
      loadChart();
    } catch (e) {
      const err = e as Error & { status?: number };
      showMessage(
        err?.status === 409
          ? 'This style changed since you loaded it — reload and retry.'
          : err instanceof Error
            ? err.message
            : 'Failed to save size chart',
        'error',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!styleId) {
    return (
      <Text variant='inactive' size='small'>
        Save the tech card first, then enter the size chart here.
      </Text>
    );
  }
  if (sizeIds.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        Add sizes in “size range” above to enter measurements.
      </Text>
    );
  }
  if (measurements.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        This category has no measurement columns.
      </Text>
    );
  }

  return (
    <div className='space-y-3'>
      <Text variant='inactive' size='small'>
        Measurements belong to the style — one chart shared by every colourway. Edit here.
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full border-collapse border-2 border-textInactiveColor min-w-max'>
          <thead className='bg-textInactiveColor'>
            <tr className='border-b border-text'>
              <th className={cn(cellClass, 'sticky left-0 bg-textInactiveColor z-10')}>
                <Text variant='uppercase'>size</Text>
              </th>
              {measurements.map((m, i) => (
                <th key={m.id} className={i < measurements.length - 1 ? cellClass : lastCellClass}>
                  <Text variant='uppercase'>{m.name}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='bg-bgColor'>
            {sizeIds.map((sizeId) => (
              <tr key={sizeId} className='border-b border-text last:border-b-0'>
                <td className={cn(cellClass, 'sticky left-0 bg-bgColor z-10')}>
                  <Text variant='uppercase'>
                    {formatSizeName(sizeById.get(sizeId) ?? String(sizeId))}
                  </Text>
                </td>
                {measurements.map((m, i) => (
                  <td key={m.id} className={i < measurements.length - 1 ? cellClass : lastCellClass}>
                    <Input
                      name={`size-chart-${sizeId}-${m.id}`}
                      value={cells.get(sizeId)?.get(m.id) ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        if (/^\d*$/.test(e.target.value)) setCell(sizeId, m.id, e.target.value);
                      }}
                      className='w-full border-none text-center'
                      disabled={!canEdit}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <Button
          type='button'
          variant='secondary'
          size='lg'
          className='uppercase'
          disabled={saving}
          onClick={save}
        >
          {saving ? 'saving…' : 'save size chart'}
        </Button>
      )}
    </div>
  );
}
