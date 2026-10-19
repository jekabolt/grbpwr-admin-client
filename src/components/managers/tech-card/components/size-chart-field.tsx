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
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button, DataTable, Input, Pill, Placeholder } from 'ui';
import { TechCardFormData } from './schema';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';

// One chart per style, so one staging key.
const STAGING_KEY = 'sizeChart';

// What this grid holds, for the staging to compare by value (JSON — `sameSnapshot`). The Map goes
// over as an entry array because a Map serializes to `{}`.
type ChartSnapshot = {
  cells: Array<[number, Array<[number, string]>]>;
  steps: Array<[number, string]>;
  touched: string[];
};

// A measurement is a plain non-negative number.
const MEASURE = /^\d*\.?\d*$/;
// A grade step may shrink a measurement as the sizes grow (rare, but a step is signed on the wire).
const STEP = /^-?\d*\.?\d*$/;

type Rule = { baseId: number; base: string; step: string };

const cellKey = (sizeId: number, nameId: number) => `${sizeId}:${nameId}`;

// A typed string as a number, or null when it is not one yet ('', '.', '-').
function num(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Two decimals is finer than any tape measure; trailing zeros dropped so «52» stays «52».
function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// value(size) = base + step × (position(size) − position(base)), the rule the wire stores
// (StyleSizeChart.grade_steps). Null when there is no rule for this row or it would go negative.
function gradeValue(base: string | undefined, step: string | undefined, distance: number) {
  const b = num(base);
  const s = num(step);
  if (b == null || s == null || s === 0) return null;
  const v = b + s * distance;
  return v < 0 ? null : fmt(v);
}

// A cell follows the rule when it is empty or holds the computed value; anything else was typed
// over it by hand and survives a re-grade.
function follows(value: string | undefined, computed: string | null) {
  if (computed == null) return false;
  const v = num(value);
  return v == null || Math.abs(v - Number(computed)) < 0.005;
}

// SizeChartField — the style-owned size chart (R5), authored at the tech-card level.
// Measurements belong to the STYLE (one pattern shared by every colourway of the style), so they
// are edited here, in the constructor, and shown read-only on each colourway card — where editing
// them would look colourway-scoped while silently rewriting the shared chart for all colourways.
// Values load and save through GetStyleSizeChart / UpdateStyleSizeChart (full-replace) under the
// shared tech_card.lock_version — the same version the main tech-card save uses.
//
// Grading: the base column (the card's sample size) is typed by hand; each row may carry one
// `step` (cm per size step). The other sizes are computed client-side by run position and written
// into the cells, so `cells` stays the source of truth the factory reads; the rule itself is saved
// alongside (gradeBaseSizeId + gradeSteps) only so a reopened card can tell computed cells from
// overtyped ones by recomputing. A cell typed over its computed value keeps the typed value on
// every re-grade until the row's `reset`. A row without a step is a plain hand-typed row.
export function SizeChartField({
  styleId,
  canEdit,
  onFilledChange,
}: {
  styleId?: number;
  canEdit: boolean;
  /** Whether any cell of the current range holds a measurement — the SIZES tab's ✓ reads it. */
  onFilledChange?: (filled: boolean) => void;
}) {
  const { dictionary } = useDictionary();
  const { control } = useFormContext<TechCardFormData>();
  // Subscribed here (getFieldState alone reads dirtyFields only if someone subscribed to them).
  const { dirtyFields } = useFormState({ control, name: 'sizeIds' });
  // RHF marks an array field per index ([false, true, …]) or as a plain true.
  const runDirty = dirtyFields.sizeIds as unknown;
  const runEdited = Array.isArray(runDirty) ? runDirty.some(Boolean) : !!runDirty;

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

  // The base is the card's sample size; a rule saved from another base is the fallback while the
  // sample size is unset or outside the run. Neither in the run = no grading, cells typed by hand.
  const sampleSizeId = (useWatch({ control, name: 'baseSampleSizeId' }) as number | undefined) ?? 0;
  const [ruleBaseId, setRuleBaseId] = useState(0);
  const baseId = ordered.includes(sampleSizeId)
    ? sampleSizeId
    : ordered.includes(ruleBaseId)
      ? ruleBaseId
      : 0;
  const basePos = ordered.indexOf(baseId);
  // measurementNameId -> step as typed.
  const [steps, setSteps] = useState<Map<number, string>>(new Map());
  // The last COMPLETE rule each row was graded by. Typing passes through non-rules («0» on the way
  // to «0.5», a cleared base before the new one), so «which cells followed the rule» is judged
  // against this, not against the keystroke before.
  const lastRule = useRef<Map<number, Rule>>(new Map());

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

  // The chart answered at least once: before that an empty grid is «not read yet», not «empty».
  const [chartLoaded, setChartLoaded] = useState(false);

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
        const nextSteps = new Map<number, string>();
        for (const g of res.chart?.gradeSteps ?? []) {
          if (g.measurementNameId == null || !g.step?.value) continue;
          nextSteps.set(g.measurementNameId, g.step.value);
        }
        setSteps(nextSteps);
        const loadedBase = res.chart?.gradeBaseSizeId ?? 0;
        setRuleBaseId(loadedBase);
        lastRule.current = new Map();
        nextSteps.forEach((step, nameId) => {
          const base = next.get(loadedBase)?.get(nameId) ?? '';
          if (loadedBase && num(base) != null)
            lastRule.current.set(nameId, { baseId: loadedBase, base, step });
        });
        setDirty(false);
        setChartLoaded(true);
      })
      .catch(() => {
        /* no chart yet (draft) — leave the grid empty */
        setChartLoaded(true);
        if (dirtyRef.current) return;
        setDirty(false);
      });
  }, [styleId]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  const stored = (sizeId: number, nameId: number) => cells.get(sizeId)?.get(nameId) ?? '';

  // Same rule as the save (`put`): an empty or zero cell is not a measurement. Only sizes still in
  // the range count — a value parked under a removed size is not one the tab shows.
  const filled = ordered.some((sizeId) =>
    [...(cells.get(sizeId)?.values() ?? [])].some((v) => !!v && v !== '0'),
  );
  useEffect(() => {
    onFilledChange?.(filled);
  }, [filled, onFilledChange]);

  // The computed value of one cell under the CURRENT base and step, or null (no rule / no base).
  const computedOf = (sizeId: number, nameId: number) => {
    if (basePos < 0 || sizeId === baseId) return null;
    const pos = ordered.indexOf(sizeId);
    if (pos < 0) return null;
    return gradeValue(stored(baseId, nameId), steps.get(nameId), pos - basePos);
  };

  const writeCells = (writes: Array<[number, number, string]>) => {
    if (writes.length === 0) return;
    setCells((prev) => {
      const next = new Map(prev);
      for (const [sizeId, nameId, value] of writes) {
        const row = new Map(next.get(sizeId) ?? []);
        row.set(nameId, value);
        next.set(sizeId, row);
      }
      return next;
    });
  };

  // Re-grade one row after its base or step moved: every cell that followed the row's last rule
  // takes the new computed value; overtyped cells stay. A row never graded before only fills its
  // empty cells, so a step typed onto a hand-filled row never wipes what was typed (reset does).
  const regrade = (nameId: number, newBase: string, newStep: string | undefined) => {
    if (basePos < 0) return;
    const old = lastRule.current.get(nameId);
    const oldPos = old ? ordered.indexOf(old.baseId) : -1;
    const writes: Array<[number, number, string]> = [];
    ordered.forEach((sizeId, pos) => {
      if (sizeId === baseId) return;
      const cur = stored(sizeId, nameId);
      const was =
        old && oldPos >= 0 && sizeId !== old.baseId
          ? gradeValue(old.base, old.step, pos - oldPos)
          : null;
      const keep = was == null ? num(cur) != null : !follows(cur, was);
      if (keep) return;
      const now = gradeValue(newBase, newStep, pos - basePos);
      if (now != null && now !== cur) writes.push([sizeId, nameId, now]);
    });
    const s = num(newStep);
    if (num(newBase) != null && s != null && s !== 0)
      lastRule.current.set(nameId, { baseId, base: newBase, step: newStep ?? '' });
    writeCells(writes);
  };

  const setCell = (sizeId: number, nameId: number, value: string) => {
    setDirty(true);
    markTouched(cellKey(sizeId, nameId));
    if (sizeId === baseId) {
      regrade(nameId, value, steps.get(nameId));
    }
    writeCells([[sizeId, nameId, value]]);
  };

  const setStep = (nameId: number, value: string) => {
    setDirty(true);
    markTouched(`step:${nameId}`);
    regrade(nameId, stored(baseId, nameId), value);
    setSteps((prev) => new Map(prev).set(nameId, value));
  };

  // Every non-base cell of the row back to its computed value.
  const resetRow = (nameId: number) => {
    const writes: Array<[number, number, string]> = [];
    for (const sizeId of ordered) {
      const c = computedOf(sizeId, nameId);
      const v = stored(sizeId, nameId);
      if (c != null && (v === '' || !follows(v, c))) writes.push([sizeId, nameId, c]);
    }
    const step = steps.get(nameId) ?? '';
    lastRule.current.set(nameId, { baseId, base: stored(baseId, nameId), step });
    if (writes.length === 0) return;
    setDirty(true);
    markTouched(`reset:${nameId}`);
    writeCells(writes);
  };

  // A size ADDED to the run gets its computed values written into the graded rows, so the save
  // carries them (a placeholder alone would leave the chart without that size). Only an operator's
  // add counts: the run seen once the chart has loaded is the baseline, and a run that moves while
  // `sizeIds` is not dirty (the card's own read / reset) only moves the baseline. Viewing writes
  // nothing.
  const seenRun = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!chartLoaded || ordered.length === 0) return;
    const prev = seenRun.current;
    seenRun.current = new Set(ordered);
    if (!prev || !canEdit || basePos < 0 || !runEdited) return;
    const added = ordered.filter((id) => !prev.has(id));
    if (added.length === 0) return;
    const writes: Array<[number, number, string]> = [];
    for (const sizeId of added) {
      for (const m of measurements) {
        if (stored(sizeId, m.id) !== '') continue;
        const c = computedOf(sizeId, m.id);
        if (c != null) writes.push([sizeId, m.id, c]);
      }
    }
    if (writes.length === 0) return;
    setDirty(true);
    for (const [sizeId, nameId] of writes) markTouched(cellKey(sizeId, nameId));
    writeCells(writes);
    // Runs on a run change only; the cells, steps and base it reads are this render's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, chartLoaded]);

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
      // The grade rule rides along. The server refuses a step for a measurement with no cell and a
      // base outside the style's sizes, so a step goes only with a cell to back it and a base in
      // the run; no step left = no rule (base 0), which is how a hand-typed chart is stored.
      const withCells = new Set(payload.map((c) => c.measurementNameId));
      const gradeSteps: common_StyleSizeChartGradeStep[] = [];
      if (baseId) {
        steps.forEach((step, measurementNameId) => {
          const n = num(step);
          if (n == null || n === 0 || !withCells.has(measurementNameId)) return;
          gradeSteps.push({ measurementNameId, step: { value: fmt(n) } });
        });
      }
      await adminService.UpdateStyleSizeChart({
        styleId,
        expectedLockVersion,
        cells: payload,
        gradeBaseSizeId: gradeSteps.length > 0 ? baseId : 0,
        gradeSteps,
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
      label: `size chart — ${edited} ${edited === 1 ? 'edit' : 'edits'}`,
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
        steps: [...steps],
        touched: [...touched],
      } satisfies ChartSnapshot,
    });
    // commitChart is redefined every render by design (it reads current state); depending on it
    // here would restage on every keystroke for no gain, so the state it reads is the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging, styleId, canEdit, dirty, touched, cells, steps, ordered, baseId]);

  if (!styleId) {
    return <Placeholder className='h-12' label='save the card first' />;
  }
  if (sizeIds.length === 0) {
    return <Placeholder className='h-12' label='pick sizes first' />;
  }
  if (measurements.length === 0) {
    return <Placeholder className='h-12' label='no measurement columns' />;
  }

  return (
    <div className='space-y-2'>
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
            <th>step</th>
            {ordered.map((id) => (
              <th key={id}>
                {formatSizeName(sizeById.get(id) ?? `#${id}`)}
                {id === baseId && <span className='ml-1 text-labelColor'>base</span>}
              </th>
            ))}
            {canEdit && <th aria-label='reset' />}
          </tr>
        </thead>
        <tbody>
          {measurements.map((m) => {
            const graded = basePos >= 0 && num(steps.get(m.id)) != null;
            // Cells off the rule: typed over, or empty (a size added to the run after grading).
            // `reset` puts both back on it.
            const offRule = graded
              ? ordered.filter((sizeId) => {
                  const c = computedOf(sizeId, m.id);
                  const v = stored(sizeId, m.id);
                  return c != null && (v === '' || !follows(v, c));
                })
              : [];
            return (
              // Подсветка строки — на ЯЧЕЙКАХ, не на <tr>: первая ячейка липкая и красит себя сама,
              // фон строки ушёл бы под неё. focus-within держит строку, пока в ней печатают.
              <tr
                key={m.id}
                className='[&>td]:transition-colors hover:[&>td]:bg-pageBg focus-within:[&>td]:bg-pageBg'
              >
                <td className='uppercase'>{m.name}</td>
                <td className='w-20'>
                  <Input
                    name={`size-chart-step-${m.id}`}
                    value={steps.get(m.id) ?? ''}
                    placeholder={basePos >= 0 ? '±' : ''}
                    title={basePos >= 0 ? 'cm per size step' : 'no base size in the run'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      if (STEP.test(e.target.value)) setStep(m.id, e.target.value);
                    }}
                    className='border-transparent bg-transparent text-center'
                    disabled={!canEdit || basePos < 0}
                  />
                </td>
                {ordered.map((sizeId) => {
                  const value = stored(sizeId, m.id);
                  const computed = graded ? computedOf(sizeId, m.id) : null;
                  const isComputed = computed != null && !!value && follows(value, computed);
                  const isOvertyped = computed != null && !follows(value, computed);
                  return (
                    <td key={sizeId} className='w-20'>
                      <Input
                        name={`size-chart-${sizeId}-${m.id}`}
                        value={value}
                        // An empty cell of a graded row is not saved; it shows what reset fills in.
                        placeholder={computed ?? undefined}
                        title={
                          isOvertyped
                            ? `typed by hand · computed ${computed}`
                            : isComputed
                              ? 'computed'
                              : undefined
                        }
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          if (MEASURE.test(e.target.value)) setCell(sizeId, m.id, e.target.value);
                        }}
                        className={cn(
                          'border-transparent bg-transparent text-center',
                          isComputed && 'text-labelColor',
                          isOvertyped && 'underline decoration-dotted underline-offset-2',
                        )}
                        disabled={!canEdit}
                      />
                    </td>
                  );
                })}
                {canEdit && (
                  <td className='w-14 text-center'>
                    {offRule.length > 0 && (
                      <Button
                        type='button'
                        variant='underline'
                        size='xs'
                        onClick={() => resetRow(m.id)}
                        title={`${offRule.length} off the grade`}
                      >
                        reset
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      {canEdit && sizeIds.length > 1 && basePos < 0 && (
        <p className='text-micro text-labelColor'>pick a sample size in the run to grade</p>
      )}

      {canEdit && dirty && (
        <div className='flex flex-wrap items-center gap-2'>
          <Pill tone='attention'>{saving ? 'saving…' : 'staged'}</Pill>
        </div>
      )}
    </div>
  );
}
