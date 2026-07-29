import { adminService } from 'api/api';
import {
  common_Category,
  common_StyleSizeChartCell,
  common_StyleSizeChartGradeStep,
} from 'api/proto-http/admin';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useMeasurements } from 'components/managers/product/utility/useMeasurements';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { DataTable } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { TechCardFormData } from './schema';

// Accepts "114", "1.5", "+4", "-2" — a grade step is signed, a measurement is not.
const NUMERIC = /^-?\d*\.?\d*$/;
const MEASURE = /^\d*\.?\d*$/;

function parseNum(raw?: string): number | null {
  if (!raw) return null;
  const t = raw.trim().replace(/^\+/, '');
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Grade arithmetic on 1.5-cm steps produces 63.44999999999999 without this.
function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

const cellKey = (sizeId: number, nameId: number) => `${sizeId}:${nameId}`;

const sameKeys = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((k) => b.has(k));

// Which cells were overtyped, recomputed rather than read off a flag: a cell is an override exactly
// when it holds a number the rule does not produce. A blank cell is not one — an empty cell is one
// nobody has typed yet, and blanking a cell is how the grid hands it back to the rule.
function ruleOverrides(
  cells: Map<number, Map<number, string>>,
  steps: Map<number, string>,
  ordered: number[],
  baseSizeId: number,
): Set<string> {
  const out = new Set<string>();
  const baseIdx = ordered.indexOf(baseSizeId);
  if (baseIdx < 0) return out;
  steps.forEach((raw, nameId) => {
    const step = parseNum(raw);
    const base = parseNum(cells.get(baseSizeId)?.get(nameId));
    if (step == null || base == null) return;
    ordered.forEach((sizeId, idx) => {
      if (sizeId === baseSizeId) return;
      const value = cells.get(sizeId)?.get(nameId)?.trim();
      if (!value) return;
      const n = parseNum(value);
      if (n == null || fmt(n) !== fmt(base + step * (idx - baseIdx)))
        out.add(cellKey(sizeId, nameId));
    });
  });
  return out;
}

// SizeChartField — the style-owned size chart (R5), authored at the tech-card level.
// Measurements belong to the STYLE (one pattern shared by every colourway of the style), so they
// are edited here, in the constructor, and shown read-only on each colourway card — where editing
// them would look colourway-scoped while silently rewriting the shared chart for all colourways.
// Values load and save through GetStyleSizeChart / UpdateStyleSizeChart (full-replace) under the
// shared tech_card.lock_version — the same version the main tech-card save uses.
//
// ─── the grade rule ───────────────────────────────────────────────────────────────────────────
// The grid used to be sizes × measurements with every cell typed by hand: 5 sizes × 8 measurements
// is 40 numbers, 35 of which a grader derives from the other 5. So the primary input is now a base
// size plus a step per measurement, and the rest of the row is computed:
//
//     value(size) = base + step × (position(size) − position(base))
//
// Derived cells render grey. Overtype one and it turns ink and stops following the rule until you
// press ↺ on it.
//
// IMPORTANT — the rule is STORED (common_StyleSizeChart.gradeBaseSizeId / gradeSteps, replaced with
// the cells under the same lock version), but the expanded grid stays the source of truth: the
// factory reads cells, and a cell the grader overtyped keeps its typed number. What is deliberately
// NOT stored is a per-cell "this one was overtyped" flag. Whether a cell follows the rule is DERIVED
// by recomputing base + step × Δposition and comparing — see ruleOverrides. That is what keeps the
// rule from desynchronising: the colourway measurement editor writes into the same table by another
// path, and whatever it changes simply reads back as an override next load instead of contradicting
// a stored flag.
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

  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();
  // A step of +4 only means anything against an ordered run.
  const ordered = useMemo(() => orderSizes(sizeIds), [orderSizes, sizeIds]);

  // cell values: sizeId -> measurementNameId -> string. Holds what was loaded plus what was typed;
  // derived values are computed at render and materialised only when the chart is saved.
  const [cells, setCells] = useState<Map<number, Map<number, string>>>(new Map());
  // measurementNameId -> raw step text ("+4", "-2", "1.5"), hydrated from the stored rule.
  const [steps, setSteps] = useState<Map<number, string>>(new Map());
  // "sizeId:nameId" of cells the grader overtyped — these stop following the rule. Seeded by
  // recomputation from the loaded grid (see the effect below), then owned by the session.
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [pickedBase, setPickedBase] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // This grid lives outside react-hook-form and saves through its own RPC, so the card's shared
  // isDirty / beforeunload guard (useTechCardDraft) never sees these edits. Track dirtiness here
  // and run a self-contained unload guard so measurements can't be silently lost on refresh/close.
  const [dirty, setDirty] = useState(false);

  // The stored base is still resolved against the live range: a base removed from the size range
  // must not linger as a dangling id, and a chart with no rule grades from the middle of the run.
  const baseSizeId =
    pickedBase != null && ordered.includes(pickedBase)
      ? pickedBase
      : ordered[Math.floor((ordered.length - 1) / 2)] ?? 0;
  const baseIdx = ordered.indexOf(baseSizeId);

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
        const nextSteps = new Map<number, string>();
        for (const s of res.chart?.gradeSteps ?? []) {
          const step = parseNum(s.step?.value);
          if (s.measurementNameId == null || step == null) continue;
          nextSteps.set(s.measurementNameId, fmt(step));
        }
        setCells(next);
        setSteps(nextSteps);
        // 0 = no rule authored; fall back to the middle of the run.
        setPickedBase(res.chart?.gradeBaseSizeId || null);
        setDirty(false);
      })
      .catch(() => {
        /* no chart yet (draft) — leave the grid empty */
        setDirty(false);
      });
  }, [styleId]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  // Seed the override set by recomputation, not from a stored flag (there is none — see the header
  // note). While the grid is untouched, `cells` and `steps` are exactly what the server returned, so
  // this also self-corrects when the size dictionary lands after the chart and the run reorders.
  // Once the grader edits, the session set takes over: a pin is intent, and must survive a step or
  // base change that happens to make the numbers agree again.
  useEffect(() => {
    if (dirty) return;
    const next = ruleOverrides(cells, steps, ordered, baseSizeId);
    setOverrides((prev) => (sameKeys(prev, next) ? prev : next));
  }, [dirty, cells, steps, ordered, baseSizeId]);

  // Mirror useTechCardDraft's unload guard for this out-of-form grid: warn on refresh/tab close
  // while measurements are unsaved. In-app navigation is covered by the visible "unsaved" badge.
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, canEdit]);

  const stored = (sizeId: number, nameId: number) => cells.get(sizeId)?.get(nameId) ?? '';

  // A cell follows the rule when it is not the base, its row has a usable step, the base cell has
  // a usable value, and the grader has not overtyped it.
  const derivedValue = (sizeId: number, nameId: number): string | null => {
    if (sizeId === baseSizeId || baseIdx < 0) return null;
    if (overrides.has(cellKey(sizeId, nameId))) return null;
    const step = parseNum(steps.get(nameId));
    const base = parseNum(stored(baseSizeId, nameId));
    if (step == null || base == null) return null;
    const idx = ordered.indexOf(sizeId);
    if (idx < 0) return null;
    return fmt(base + step * (idx - baseIdx));
  };

  const displayValue = (sizeId: number, nameId: number) =>
    derivedValue(sizeId, nameId) ?? stored(sizeId, nameId);

  const setCell = (sizeId: number, nameId: number, value: string) => {
    setDirty(true);
    setCells((prev) => {
      const next = new Map(prev);
      const row = new Map(next.get(sizeId) ?? []);
      row.set(nameId, value);
      next.set(sizeId, row);
      return next;
    });
  };

  const editCell = (sizeId: number, nameId: number, value: string) => {
    setCell(sizeId, nameId, value);
    if (sizeId === baseSizeId) return;
    // Pin the cell only when there is a rule to escape. Typing into a row with no step yet is just
    // data entry — pinning it there would stop the row regrading when a step is added later, which
    // is the whole point of filling five numbers to get forty.
    if (parseNum(steps.get(nameId)) == null) return;
    setOverrides((prev) => {
      const next = new Set(prev);
      const key = cellKey(sizeId, nameId);
      // Clearing an override hands the cell back to the rule rather than pinning it as blank.
      if (value.trim() === '') next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const releaseCell = (sizeId: number, nameId: number) => {
    setDirty(true);
    setOverrides((prev) => {
      const next = new Set(prev);
      next.delete(cellKey(sizeId, nameId));
      return next;
    });
  };

  const setStep = (nameId: number, value: string) => {
    setDirty(true);
    setSteps((prev) => {
      const next = new Map(prev);
      next.set(nameId, value);
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
      const seen = new Set<string>();
      const measured = new Set<number>();
      const put = (sizeId: number, measurementNameId: number, value: string) => {
        if (!value || value === '0') return;
        payload.push({ sizeId, measurementNameId, value: { value } });
        measured.add(measurementNameId);
      };
      // Materialise the rule: what goes over the wire is the full per-size grid, plus the rule it
      // was authored from — the grid stays what the factory reads.
      for (const sizeId of ordered) {
        for (const m of measurements) {
          seen.add(cellKey(sizeId, m.id));
          put(sizeId, m.id, displayValue(sizeId, m.id));
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
      // A step for a measurement the chart carries no cell for is rejected, so a step left behind by
      // a column that dropped out of the category is dropped here rather than failing the save.
      const gradeSteps: common_StyleSizeChartGradeStep[] = [];
      steps.forEach((raw, measurementNameId) => {
        const step = parseNum(raw);
        if (step == null || !measured.has(measurementNameId)) return;
        gradeSteps.push({ measurementNameId, step: { value: fmt(step) } });
      });
      // No surviving step is no rule: send the documented clear (base 0, no steps) rather than half
      // of one. The expanded cells are untouched by that — they are already in `payload`.
      const rule = gradeSteps.length > 0 && ordered.includes(baseSizeId);
      await adminService.UpdateStyleSizeChart({
        styleId,
        expectedLockVersion,
        cells: payload,
        gradeBaseSizeId: rule ? baseSizeId : 0,
        gradeSteps: rule ? gradeSteps : [],
      });
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

  const graded = ordered.filter((id) => id !== baseSizeId);
  const baseName = formatSizeName(sizeById.get(baseSizeId) ?? `#${baseSizeId}`);
  const totalCells = ordered.length * measurements.length;
  let filled = 0;
  for (const sizeId of ordered)
    for (const m of measurements) if (displayValue(sizeId, m.id).trim()) filled += 1;

  return (
    <div className='space-y-2'>
      <Toolbar>
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          base size
        </Text>
        <SelectComponent
          name='size-chart-base'
          placeholder='base size'
          className='w-24'
          value={String(baseSizeId)}
          // The base is part of what gets saved now, so picking one is an unsaved change.
          onValueChange={(v: string) => {
            setPickedBase(Number(v));
            setDirty(true);
          }}
          disabled={!canEdit}
          items={ordered.map((id) => ({
            value: String(id),
            label: formatSizeName(sizeById.get(id) ?? `#${id}`),
          }))}
        />
        <Text size='micro' variant='label' component='span'>
          everything else is derived
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
            <th>base ({baseName})</th>
            <th>grade step</th>
            {graded.map((id) => (
              <th key={id}>{formatSizeName(sizeById.get(id) ?? `#${id}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {measurements.map((m) => (
            <tr key={m.id}>
              <td className='uppercase'>{m.name}</td>
              <td className='w-20'>
                <Input
                  name={`size-chart-base-${m.id}`}
                  value={stored(baseSizeId, m.id)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    if (MEASURE.test(e.target.value)) setCell(baseSizeId, m.id, e.target.value);
                  }}
                  className='border-transparent bg-transparent text-center font-bold'
                  disabled={!canEdit}
                />
              </td>
              <td className='w-20'>
                <Input
                  name={`size-chart-step-${m.id}`}
                  value={steps.get(m.id) ?? ''}
                  placeholder='±'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const v = e.target.value.replace(/^\+/, '');
                    if (NUMERIC.test(v)) setStep(m.id, e.target.value);
                  }}
                  className='border-transparent bg-transparent text-center'
                  disabled={!canEdit}
                />
              </td>
              {graded.map((sizeId) => {
                const isDerived = derivedValue(sizeId, m.id) != null;
                const pinned = overrides.has(cellKey(sizeId, m.id));
                return (
                  <td key={sizeId} className='w-20'>
                    <span className='flex items-center gap-0.5'>
                      <Input
                        name={`size-chart-${sizeId}-${m.id}`}
                        value={displayValue(sizeId, m.id)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          if (MEASURE.test(e.target.value)) editCell(sizeId, m.id, e.target.value);
                        }}
                        className={cn(
                          'min-w-0 flex-1 border-transparent bg-transparent text-center',
                          // grey = following the rule, ink = a number somebody stands behind
                          isDerived ? 'text-labelColor' : 'text-textColor',
                        )}
                        disabled={!canEdit}
                      />
                      {pinned && canEdit && (
                        <button
                          type='button'
                          aria-label='return this cell to the grade rule'
                          title='return this cell to the grade rule'
                          className='shrink-0 px-0.5 text-micro text-labelColor hover:text-textColor'
                          onClick={() => releaseCell(sizeId, m.id)}
                        >
                          ↺
                        </button>
                      )}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </DataTable>

      <Text size='micro' variant='label'>
        a derived cell you overtype turns ink and stops following the rule — ↺ hands it back. The
        base size and the steps save with the grid, so reopening the card shows the rule and which
        cells still follow it.
      </Text>

      {canEdit && (
        <div className='flex flex-wrap items-center gap-2'>
          {dirty && <Pill tone='attention'>unsaved measurements</Pill>}
          <div className='ml-auto flex items-center gap-2'>
            {dirty && (
              <Text size='micro' variant='label' component='span'>
                this grid saves separately from the card’s Save
              </Text>
            )}
            <Button
              type='button'
              variant={dirty ? 'main' : 'secondary'}
              size='sm'
              disabled={saving}
              onClick={save}
            >
              {saving ? 'saving…' : 'save size chart'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
