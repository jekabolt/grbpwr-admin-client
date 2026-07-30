import { adminService } from 'api/api';
import { common_Category, common_StyleSizeChartCell } from 'api/proto-http/admin';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useMeasurements } from 'components/managers/product/utility/useMeasurements';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { DataTable } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { TechCardFormData } from './schema';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';

// One chart per style, so one staging key.
const STAGING_KEY = 'sizeChart';

// What this grid needs to rebuild itself after a refresh. The Map goes over as an entry array
// because localStorage speaks JSON and a Map serializes to `{}`.
type ChartSnapshot = {
  cells: Array<[number, Array<[number, string]>]>;
  touched: string[];
};

// A measurement is a plain non-negative number.
const MEASURE = /^\d*\.?\d*$/;

const cellKey = (sizeId: number, nameId: number) => `${sizeId}:${nameId}`;

// SizeChartField — the style-owned size chart (R5), authored at the tech-card level.
// Measurements belong to the STYLE (one pattern shared by every colourway of the style), so they
// are edited here, in the constructor, and shown read-only on each colourway card — where editing
// them would look colourway-scoped while silently rewriting the shared chart for all colourways.
// Values load and save through GetStyleSizeChart / UpdateStyleSizeChart (full-replace) under the
// shared tech_card.lock_version — the same version the main tech-card save uses.
//
// A plain hand-filled grid: measurements (rows) × sizes (columns), every cell typed by hand. There
// is no grade rule — the chart is saved with no base size and no grade steps (gradeBaseSizeId 0,
// gradeSteps []); the per-size cells are the sole source of truth.
export function SizeChartField({ styleId, canEdit }: { styleId?: number; canEdit: boolean }) {
  const { dictionary } = useDictionary();
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

  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();
  // Columns run in grade order (XS → XL), not insertion order.
  const ordered = useMemo(() => orderSizes(sizeIds), [orderSizes, sizeIds]);

  // cell values: sizeId -> measurementNameId -> string. Holds what was loaded plus what was typed.
  const [cells, setCells] = useState<Map<number, Map<number, string>>>(new Map());
  const [saving, setSaving] = useState(false);
  const staging = useTechCardStaging();
  // This grid lives outside react-hook-form, so the card's shared isDirty never sees these edits.
  // Instead of owning a save button it STAGES into the card's one save — `touched` is what makes
  // the header's "размерная таблица — 6 cells" a fact rather than a guess.
  const [dirty, setDirty] = useState(false);
  // Mirror of `dirty` readable inside async continuations: a server load that resolves
  // AFTER the operator typed (restored draft, or a keystroke while commitChart's trailing
  // refresh was in flight) must not overwrite the newer local grid or unstage it.
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const markTouched = (key: string) =>
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  const loadChart = useCallback(() => {
    if (!styleId) return;
    adminService
      .GetStyleSizeChart({ styleId })
      .then((res) => {
        if (dirtyRef.current) return;
        const next = new Map<number, Map<number, string>>();
        for (const c of res.chart?.cells ?? []) {
          if (c.sizeId == null || c.measurementNameId == null) continue;
          const row = next.get(c.sizeId) ?? new Map<number, string>();
          row.set(c.measurementNameId, c.value?.value ?? '');
          next.set(c.sizeId, row);
        }
        setCells(next);
        setDirty(false);
      })
      .catch(() => {
        /* no chart yet (draft) — leave the grid empty */
        if (dirtyRef.current) return;
        setDirty(false);
      });
  }, [styleId]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  // Claim any edits this panel had staged when the tab was refreshed. Runs after loadChart so the
  // restored grid wins over the server's — that is the whole point — and claims exactly once,
  // because takeSnapshot removes it. A card with no draft simply shows what the server returned.
  useEffect(() => {
    if (!staging || !styleId) return;
    const snap = staging.takeSnapshot(STAGING_KEY) as ChartSnapshot | undefined;
    if (!snap) return;
    setCells(new Map(snap.cells.map(([sizeId, row]) => [sizeId, new Map(row)])));
    setTouched(new Set(snap.touched));
    setDirty(true);
  }, [staging, styleId]);

  const stored = (sizeId: number, nameId: number) => cells.get(sizeId)?.get(nameId) ?? '';

  const setCell = (sizeId: number, nameId: number, value: string) => {
    setDirty(true);
    markTouched(cellKey(sizeId, nameId));
    setCells((prev) => {
      const next = new Map(prev);
      const row = new Map(next.get(sizeId) ?? []);
      row.set(nameId, value);
      next.set(sizeId, row);
      return next;
    });
  };

  // The panel's mutation, unwrapped: it THROWS on failure instead of toasting, because the header's
  // one save is what reports the outcome now — it needs the rejection to name this panel in a
  // partial-failure banner and keep everything after it staged.
  async function commitChart() {
    if (!styleId) return;
    setSaving(true);
    try {
      // Read the freshest shared tech_card.lock_version right before the write: the chart shares it
      // with the main tech-card save, so a version cached at mount could already be stale.
      const cur = await adminService.GetStyleSizeChart({ styleId });
      const expectedLockVersion = cur.chart?.lockVersion ?? 0;
      const payload: common_StyleSizeChartCell[] = [];
      const seen = new Set<string>();
      const put = (sizeId: number, measurementNameId: number, value: string) => {
        if (!value || value === '0') return;
        payload.push({ sizeId, measurementNameId, value: { value } });
      };
      for (const sizeId of ordered) {
        for (const m of measurements) {
          seen.add(cellKey(sizeId, m.id));
          put(sizeId, m.id, stored(sizeId, m.id));
        }
      }
      // Anything stored outside the current range/columns is carried through untouched — this save
      // is a full replace, so dropping it here would delete measurements the grid never showed.
      cells.forEach((row, sizeId) => {
        row.forEach((value, measurementNameId) => {
          if (seen.has(cellKey(sizeId, measurementNameId))) return;
          put(sizeId, measurementNameId, value);
        });
      });
      // No grade rule: the per-size cells are the whole chart.
      await adminService.UpdateStyleSizeChart({
        styleId,
        expectedLockVersion,
        cells: payload,
        gradeBaseSizeId: 0,
        gradeSteps: [],
      });
      loadChart();
    } finally {
      setSaving(false);
    }
  }

  // Hand the mutation to the card's one save. Re-staged on EVERY edit because `commit` closes over
  // this render's cells — a stale closure would write the edit before last. Unstaged the moment the
  // grid is pristine again, so the header count never claims work that is not there.
  useEffect(() => {
    if (!staging || !styleId || !canEdit) return;
    if (!dirty) {
      staging.unstage(STAGING_KEY);
      return;
    }
    const edited = touched.size;
    staging.stage({
      key: STAGING_KEY,
      label: `размерная таблица — ${edited} ${edited === 1 ? 'cell' : 'cells'}`,
      order: COMMIT_ORDER.sizeChart,
      commit: commitChart,
      settle: () => {
        setDirty(false);
        setTouched(new Set());
      },
      snapshot: {
        cells: [...cells].map(
          ([sizeId, row]) => [sizeId, [...row]] as [number, Array<[number, string]>],
        ),
        touched: [...touched],
      } satisfies ChartSnapshot,
    });
    // commitChart is redefined every render by design (it reads current state); depending on it
    // here would restage on every keystroke for no gain, so the state it reads is the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging, styleId, canEdit, dirty, touched, cells, ordered]);

  if (!styleId) {
    return (
      <Text size='micro' variant='label'>
        Save the tech card first, then enter the size chart here.
      </Text>
    );
  }
  if (sizeIds.length === 0) {
    return (
      <Text size='micro' variant='label'>
        Add sizes in “size range” above to enter measurements.
      </Text>
    );
  }
  if (measurements.length === 0) {
    return (
      <Text size='micro' variant='label'>
        This category has no measurement columns.
      </Text>
    );
  }

  const totalCells = ordered.length * measurements.length;
  let filled = 0;
  for (const sizeId of ordered)
    for (const m of measurements) if (stored(sizeId, m.id).trim()) filled += 1;

  return (
    <div className='space-y-2'>
      <Toolbar>
        <Text size='micro' variant='label' component='span'>
          measurements per size — fill in each cell by hand
        </Text>
        <ToolbarSpacer />
        <Pill tone={totalCells > 0 && filled === totalCells ? 'ok' : 'mut'}>
          {filled}/{totalCells} cells
        </Pill>
      </Toolbar>

      <DataTable
        variant='grid'
        className={cn(
          '[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10',
          '[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10',
        )}
      >
        <thead>
          <tr>
            <th>measurement</th>
            {ordered.map((id) => (
              <th key={id}>{formatSizeName(sizeById.get(id) ?? `#${id}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {measurements.map((m) => (
            <tr key={m.id}>
              <td className='uppercase'>{m.name}</td>
              {ordered.map((sizeId) => (
                <td key={sizeId} className='w-20'>
                  <Input
                    name={`size-chart-${sizeId}-${m.id}`}
                    value={stored(sizeId, m.id)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      if (MEASURE.test(e.target.value)) setCell(sizeId, m.id, e.target.value);
                    }}
                    className='border-transparent bg-transparent text-center'
                    disabled={!canEdit}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </DataTable>

      {canEdit && dirty && (
        <div className='flex flex-wrap items-center gap-2'>
          <Pill tone='attention'>{saving ? 'saving…' : 'staged for save'}</Pill>
          <Text size='micro' variant='label' component='span' className='ml-auto'>
            included in the card’s Save
          </Text>
        </div>
      )}
    </div>
  );
}
