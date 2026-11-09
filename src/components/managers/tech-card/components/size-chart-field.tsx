import { adminService } from 'api/api';
import { uploadMediaInput } from 'components/managers/media/utils/useUploadMedia';
import type {
  common_StyleSizeChart,
  common_StyleSizeChartCell,
  common_StyleSizeChartGradeStep,
  common_StyleSizeChartPoint,
  common_TechCard,
} from 'api/proto-http/admin';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import {
  POM_CHART_NAME,
  POM_CODES_BY_GARMENT,
  type ChartMeasurementName,
} from 'lib/pom/chart-points';
import { SIZE_CHART_ICONS } from 'lib/pom/size-chart-icons';
import {
  defaultSizeChartIcon,
  iconLineMeasurementId,
  type PicturePoint,
  type SizeChartPictureDraft,
  type SizeChartPictureSource,
} from 'lib/pom/size-chart-picture';
import type { PomCode } from 'lib/pom/types';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import {
  Button,
  CheckboxCommon,
  Close,
  DataTable,
  EmptyCell,
  Input,
  Placeholder,
  Select,
  type ViewSwitchOption,
} from 'ui';

import {
  addPoint,
  keepSaved,
  mergePatternIntoCells,
  normalizePoints,
  reviewCount,
  reviewDiffs,
  seedChart,
  usePattern,
  type ChartCellDraft,
  type ChartPointDraft,
} from './size-chart-data';
import { SizeChartPictureEditor, type SizeChartSketch } from './size-chart-picture';
import { type TechCardFormData } from './schema';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';
import { usePatternChart } from './use-pattern-chart';

const STAGING_KEY = 'sizeChart';
const MEASURE = /^\d*\.?\d*$/;
const STEP = /^-?\d*\.?\d*$/;
const POM_CODES = new Set<PomCode>(Object.keys(POM_CHART_NAME) as PomCode[]);

type Rule = { baseId: number; base: string; step: string };

type ChartSnapshot = {
  cells: ChartCellDraft[];
  picture: SizeChartPictureDraft;
  points: ChartPointDraft[];
  shrinkagePct: string;
  steps: Array<[number, string]>;
  touched: string[];
};

const EMPTY_PICTURE: SizeChartPictureDraft = {
  source: 'upload',
  iconKey: '',
  mediaId: 0,
  mediaUrl: '',
  lines: [],
};

const cellKey = (sizeId: number, measurementNameId: number) => `${sizeId}:${measurementNameId}`;

const numberOf = (value: string | undefined): number | null => {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const wireNumber = (value: { value: string | undefined } | undefined, fallback = '1') =>
  value?.value?.trim() || fallback;

const oneDecimal = (value: string | number | undefined): string => {
  const parsed = typeof value === 'number' ? value : numberOf(value);
  return parsed == null ? '' : parsed.toFixed(1);
};

const humanName = (value: string): string => {
  const words = value.replace(/[-_]+/g, ' ').trim().toLowerCase();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : '';
};

function gradeValue(base: string | undefined, step: string | undefined, distance: number) {
  const b = numberOf(base);
  const s = numberOf(step);
  if (b == null || s == null || s === 0) return null;
  const value = b + s * distance;
  return value < 0 ? null : String(Math.round(value * 100) / 100);
}

function follows(value: string | undefined, computed: string | null) {
  if (computed == null) return false;
  const parsed = numberOf(value);
  return parsed == null || Math.abs(parsed - Number(computed)) < 0.005;
}

function sameStrings(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function SizeChartField({
  styleId,
  techCard,
  active,
  canEdit,
  headerEl,
  onFilledChange,
}: {
  styleId?: number;
  techCard?: common_TechCard;
  active: boolean;
  canEdit: boolean;
  headerEl?: HTMLElement | null;
  onFilledChange?: (filled: boolean) => void;
}) {
  const { dictionary } = useDictionary();
  const { control } = useFormContext<TechCardFormData>();
  const { dirtyFields } = useFormState({ control, name: 'sizeIds' });
  const runDirty = dirtyFields.sizeIds as unknown;
  const runEdited = Array.isArray(runDirty) ? runDirty.some(Boolean) : !!runDirty;
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const sampleSizeId = (useWatch({ control, name: 'baseSampleSizeId' }) as number | undefined) ?? 0;

  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();
  const ordered = useMemo(() => orderSizes(sizeIds), [orderSizes, sizeIds]);
  const measurementById = useMemo(
    () =>
      new Map(
        (dictionary?.measurements ?? []).flatMap((measurement) =>
          measurement.id && measurement.name ? [[measurement.id, measurement.name] as const] : [],
        ),
      ),
    [dictionary?.measurements],
  );
  const nameIds = useMemo(
    () =>
      new Map<ChartMeasurementName | string, number>(
        [...measurementById].map(([id, name]) => [name.trim().toLowerCase(), id]),
      ),
    [measurementById],
  );
  const sketches = useMemo<SizeChartSketch[]>(
    () =>
      (techCard?.resolvedTechnicalMedia ?? []).flatMap((item, index) => {
        const id = item.media?.id ?? 0;
        const url =
          item.media?.media?.fullSize?.mediaUrl ||
          item.media?.media?.compressed?.mediaUrl ||
          item.media?.media?.thumbnail?.mediaUrl ||
          '';
        return id && url ? [{ id, url, label: `Sketch ${index + 1}` }] : [];
      }),
    [techCard?.resolvedTechnicalMedia],
  );

  const [cells, setCells] = useState<ChartCellDraft[]>([]);
  const [savedCells, setSavedCells] = useState<ChartCellDraft[]>([]);
  const [points, setPoints] = useState<ChartPointDraft[]>([]);
  const [steps, setSteps] = useState<Map<number, string>>(new Map());
  const [ruleBaseId, setRuleBaseId] = useState(0);
  const [shrinkagePct, setShrinkagePct] = useState('');
  const [chartLoaded, setChartLoaded] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  // A click on a value in the read table opens edit mode with that cell focused.
  const [focusCell, setFocusCell] = useState('');
  useEffect(() => {
    if (!editing || !focusCell) return;
    const input = document.getElementsByName(focusCell)[0];
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
    setFocusCell('');
  }, [editing, focusCell]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [activePointId, setActivePointId] = useState<number | null>(null);
  const [activeFreeLinePosition, setActiveFreeLinePosition] = useState<number | null>(null);
  const [mobileSize, setMobileSize] = useState('');
  const [picture, setPicture] = useState<SizeChartPictureDraft>(EMPTY_PICTURE);
  const [picturePrepared, setPicturePrepared] = useState(false);
  const rowNameIds = useMemo(
    () => new Set(points.map((point) => point.measurementNameId)),
    [points],
  );
  const measurementNameIdOf = useCallback(
    (name: string) =>
      iconLineMeasurementId(
        picture.iconKey,
        name,
        (candidate) => nameIds.get(candidate.trim().toLowerCase()) ?? 0,
        rowNameIds,
      ),
    [nameIds, picture.iconKey, rowNameIds],
  );
  const [pendingLineValues, setPendingLineValues] = useState<
    Record<number, Record<number, string>>
  >({});
  const [uploading, setUploading] = useState(false);
  const lastRule = useRef<Map<number, Rule>>(new Map());
  const legacyRows = useRef<ChartPointDraft[] | null>(null);
  const dirtyRef = useRef(false);
  const rememberedPicture = useRef<{
    iconKey?: string;
    sketch?: SizeChartSketch;
    upload?: { id: number; url: string };
  }>({});
  const staging = useTechCardStaging();
  const showMessage = useSnackBarStore((state) => state.showMessage);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const markDirty = useCallback((key: string) => {
    setDirty(true);
    setTouched((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));
  }, []);

  const hydrate = useCallback(
    (chart: common_StyleSizeChart | undefined) => {
      const nextCells: ChartCellDraft[] = [];
      for (const cell of chart?.cells ?? []) {
        if (cell.sizeId == null || cell.measurementNameId == null) continue;
        nextCells.push({
          sizeId: cell.sizeId,
          measurementNameId: cell.measurementNameId,
          value: cell.value?.value ?? '',
          source:
            cell.source === 'STYLE_SIZE_CHART_CELL_SOURCE_PATTERN'
              ? 'STYLE_SIZE_CHART_CELL_SOURCE_PATTERN'
              : 'STYLE_SIZE_CHART_CELL_SOURCE_MANUAL',
        });
      }
      const nextPoints: ChartPointDraft[] = (chart?.points ?? []).flatMap((point) => {
        if (point.measurementNameId == null) return [];
        const pomCode =
          point.pomCode && POM_CODES.has(point.pomCode as PomCode)
            ? (point.pomCode as PomCode)
            : undefined;
        return [
          {
            measurementNameId: point.measurementNameId,
            ...(pomCode ? { pomCode } : {}),
            position: point.position ?? 0,
            tolMinusCm: wireNumber(point.tolMinusCm),
            tolPlusCm: wireNumber(point.tolPlusCm),
            inShop: !!point.inShop,
            basisPieceLineKeys: [...(point.basisPieceLineKeys ?? [])],
            stale: !!point.stale,
          },
        ];
      });
      const nextSteps = new Map<number, string>();
      for (const step of chart?.gradeSteps ?? []) {
        if (step.measurementNameId == null || !step.step?.value) continue;
        nextSteps.set(step.measurementNameId, step.step.value);
      }
      const loadedBase = chart?.gradeBaseSizeId ?? 0;
      lastRule.current = new Map();
      for (const [measurementNameId, step] of nextSteps) {
        const base = nextCells.find(
          (cell) => cell.sizeId === loadedBase && cell.measurementNameId === measurementNameId,
        )?.value;
        if (loadedBase && numberOf(base) != null)
          lastRule.current.set(measurementNameId, {
            baseId: loadedBase,
            base: base ?? '',
            step,
          });
      }
      const storedPicture = chart?.picture;
      const source = storedPicture?.source;
      const validSource = source === 'icon' || source === 'sketch' || source === 'upload';
      const nextPicture: SizeChartPictureDraft = validSource
        ? {
            source,
            iconKey: storedPicture?.iconKey ?? '',
            mediaId: storedPicture?.mediaId ?? 0,
            mediaUrl: storedPicture?.mediaUrl ?? '',
            lines: (storedPicture?.lines ?? []).map((line, index) => ({
              measurementNameId: line.measurementNameId ?? 0,
              x1: line.x1 ?? 0,
              y1: line.y1 ?? 0,
              x2: line.x2 ?? 0,
              y2: line.y2 ?? 0,
              position: line.position ?? index + 1,
            })),
          }
        : EMPTY_PICTURE;
      rememberedPicture.current = {
        ...(nextPicture.iconKey ? { iconKey: nextPicture.iconKey } : {}),
        ...(nextPicture.source === 'sketch' && nextPicture.mediaId
          ? {
              sketch: sketches.find((sketch) => sketch.id === nextPicture.mediaId) ?? {
                id: nextPicture.mediaId,
                url: nextPicture.mediaUrl,
                label: 'Sketch',
              },
            }
          : {}),
        ...(nextPicture.source === 'upload' && nextPicture.mediaId
          ? { upload: { id: nextPicture.mediaId, url: nextPicture.mediaUrl } }
          : {}),
      };
      setCells(nextCells);
      setSavedCells(nextCells);
      setPoints(normalizePoints(nextPoints));
      setSteps(nextSteps);
      setRuleBaseId(loadedBase);
      setShrinkagePct(chart?.shrinkagePct?.value ?? '');
      setPicture(nextPicture);
      setPicturePrepared(validSource);
      setPendingLineValues({});
      setPrepared(false);
      legacyRows.current = null;
      setChartLoaded(true);
      setDirty(false);
      setTouched(new Set());
    },
    [sketches],
  );

  const loadChart = useCallback(() => {
    if (!styleId) return;
    setChartLoaded(false);
    adminService
      .GetStyleSizeChart({ styleId })
      .then((response) => {
        if (!dirtyRef.current) hydrate(response.chart);
      })
      .catch(() => {
        if (!dirtyRef.current) hydrate(undefined);
      });
  }, [hydrate, styleId]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  const pattern = usePatternChart({
    active: active && chartLoaded,
    techCard,
    shrinkageOverride: shrinkagePct,
  });

  useEffect(() => {
    if (!chartLoaded || picturePrepared) return;
    const iconKey = defaultSizeChartIcon(pattern.categoryNames);
    if (iconKey) {
      rememberedPicture.current.iconKey = iconKey;
      setPicture({ ...EMPTY_PICTURE, source: 'icon', iconKey });
    } else if (sketches[0]) {
      rememberedPicture.current.sketch = sketches[0];
      setPicture({
        ...EMPTY_PICTURE,
        source: 'sketch',
        mediaId: sketches[0].id,
        mediaUrl: sketches[0].url,
      });
    } else {
      setPicture(EMPTY_PICTURE);
    }
    setPicturePrepared(true);
  }, [chartLoaded, pattern.categoryNames, picturePrepared, sketches]);

  // Icon lines and loaded free lines name rows, but never replace values already in the grid.
  useEffect(() => {
    // Only after the user touched the picture: opening a card never writes.
    if (
      !chartLoaded ||
      !picturePrepared ||
      !['picture', 'icon', 'sketch', 'upload'].some((key) => touched.has(key))
    )
      return;
    const measurementIds = new Set(
      picture.lines.flatMap((line) => (line.measurementNameId > 0 ? [line.measurementNameId] : [])),
    );
    if (picture.source === 'icon') {
      for (const line of SIZE_CHART_ICONS[picture.iconKey]?.lines ?? []) {
        const id = measurementNameIdOf(line.name);
        if (id) measurementIds.add(id);
      }
    }
    if (!measurementIds.size) return;

    let nextPoints = points;
    let nextCells = cells;
    let changed = false;
    for (const measurementNameId of measurementIds) {
      if (nextPoints.some((point) => point.measurementNameId === measurementNameId)) continue;
      const measurementName = measurementById.get(measurementNameId)?.trim().toLowerCase();
      const pomCode = POM_CODES_BY_GARMENT[pattern.kind].find(
        (code) => POM_CHART_NAME[code] === measurementName,
      );
      if (pomCode) {
        const added = addPoint(
          nextPoints,
          nextCells,
          measurementNameId,
          pomCode,
          pattern.patternValues,
          pattern.basis.get(pomCode),
        );
        nextPoints = added.points;
        nextCells = added.cells;
      } else {
        nextPoints = [
          ...nextPoints,
          {
            measurementNameId,
            position: nextPoints.length + 1,
            tolMinusCm: '1',
            tolPlusCm: '1',
            inShop: false,
            basisPieceLineKeys: [],
            stale: false,
          },
        ];
      }
      changed = true;
    }
    if (!changed) return;
    setPoints(normalizePoints(nextPoints));
    setCells(nextCells);
    markDirty('picture rows');
  }, [
    cells,
    chartLoaded,
    markDirty,
    measurementById,
    measurementNameIdOf,
    pattern.basis,
    pattern.kind,
    pattern.patternValues,
    picture,
    picturePrepared,
    points,
    touched,
  ]);

  // Seed once after the server answer. Pattern values may arrive later and merge in the next effect.
  useEffect(() => {
    if (!chartLoaded || prepared) return;
    const legacyOnly = !!legacyRows.current && points === legacyRows.current;
    if (!pattern.seedKind && (!points.length || legacyOnly)) {
      // The garment is not known yet: show the old cells' rows, save nothing.
      if (!legacyOnly && cells.length) {
        const shown = seedChart(null, [], cells, nameIds).points;
        legacyRows.current = shown;
        setPoints(shown);
      }
      return;
    }
    const seeded = seedChart(pattern.seedKind, legacyOnly ? [] : points, cells, nameIds);
    const merged = mergePatternIntoCells(seeded.cells, seeded.points, pattern.patternValues);
    setPoints(seeded.points);
    setCells(merged.cells);
    setPrepared(true);
    if (seeded.seeded || merged.changed) markDirty(seeded.seeded ? 'seed' : 'pattern');
    // This is deliberately one preparation pass for one server answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartLoaded, prepared, pattern.seedKind]);

  // A report or shrinkage change refreshes only empty/pattern-owned cells and its hidden evidence.
  useEffect(() => {
    if (!prepared || !pattern.patternValues) return;
    const merged = mergePatternIntoCells(cells, points, pattern.patternValues);
    const nextPoints = points.map((point) => {
      if (!point.pomCode) return point;
      const basis = pattern.basis.get(point.pomCode) ?? [];
      return sameStrings(point.basisPieceLineKeys, basis)
        ? point
        : { ...point, basisPieceLineKeys: basis };
    });
    const pointChanged = nextPoints.some((point, index) => point !== points[index]);
    if (!merged.changed && !pointChanged) return;
    if (merged.changed) setCells(merged.cells);
    if (pointChanged) setPoints(nextPoints);
    markDirty(merged.changed ? 'pattern' : 'basis');
  }, [cells, markDirty, pattern.basis, pattern.patternValues, points, prepared]);

  const baseId = ordered.includes(sampleSizeId)
    ? sampleSizeId
    : ordered.includes(ruleBaseId)
      ? ruleBaseId
      : 0;
  const basePos = ordered.indexOf(baseId);
  const stored = (list: readonly ChartCellDraft[], sizeId: number, measurementNameId: number) =>
    list.find((cell) => cell.sizeId === sizeId && cell.measurementNameId === measurementNameId)
      ?.value ?? '';
  const computedOf = (
    list: readonly ChartCellDraft[],
    sizeId: number,
    measurementNameId: number,
  ) => {
    if (basePos < 0 || sizeId === baseId) return null;
    const position = ordered.indexOf(sizeId);
    if (position < 0) return null;
    return gradeValue(
      stored(list, baseId, measurementNameId),
      steps.get(measurementNameId),
      position - basePos,
    );
  };

  const regrade = (
    list: readonly ChartCellDraft[],
    measurementNameId: number,
    newBase: string,
    newStep: string | undefined,
  ): ChartCellDraft[] => {
    if (basePos < 0) return [...list];
    const old = lastRule.current.get(measurementNameId);
    const oldPos = old ? ordered.indexOf(old.baseId) : -1;
    const next = new Map(list.map((cell) => [cellKey(cell.sizeId, cell.measurementNameId), cell]));
    ordered.forEach((sizeId, position) => {
      if (sizeId === baseId) return;
      const key = cellKey(sizeId, measurementNameId);
      const current = next.get(key)?.value ?? '';
      const previous =
        old && oldPos >= 0 && sizeId !== old.baseId
          ? gradeValue(old.base, old.step, position - oldPos)
          : null;
      const keep = previous == null ? numberOf(current) != null : !follows(current, previous);
      if (keep) return;
      const value = gradeValue(newBase, newStep, position - basePos);
      if (value == null) return;
      next.set(key, {
        sizeId,
        measurementNameId,
        value,
        source: 'STYLE_SIZE_CHART_CELL_SOURCE_MANUAL',
      });
    });
    const numericStep = numberOf(newStep);
    if (numberOf(newBase) != null && numericStep != null && numericStep !== 0)
      lastRule.current.set(measurementNameId, {
        baseId,
        base: newBase,
        step: newStep ?? '',
      });
    return [...next.values()];
  };

  const setCell = (sizeId: number, measurementNameId: number, value: string) => {
    markDirty(cellKey(sizeId, measurementNameId));
    setCells((previous) => {
      const graded =
        sizeId === baseId
          ? regrade(previous, measurementNameId, value, steps.get(measurementNameId))
          : [...previous];
      const next = new Map(
        graded.map((cell) => [cellKey(cell.sizeId, cell.measurementNameId), cell]),
      );
      next.set(cellKey(sizeId, measurementNameId), {
        sizeId,
        measurementNameId,
        value,
        source: 'STYLE_SIZE_CHART_CELL_SOURCE_MANUAL',
      });
      return [...next.values()];
    });
  };

  const setStep = (measurementNameId: number, value: string) => {
    markDirty(`step:${measurementNameId}`);
    setCells((previous) =>
      regrade(previous, measurementNameId, stored(previous, baseId, measurementNameId), value),
    );
    setSteps((previous) => new Map(previous).set(measurementNameId, value));
  };

  // A newly added run size inherits grade values on manual charts, preserving the old flow.
  const seenRun = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!prepared || ordered.length === 0) return;
    const previous = seenRun.current;
    seenRun.current = new Set(ordered);
    if (!previous || !canEdit || basePos < 0 || !runEdited || pattern.hasPatterns) return;
    const added = ordered.filter((sizeId) => !previous.has(sizeId));
    if (!added.length) return;
    const writes: ChartCellDraft[] = [];
    for (const sizeId of added) {
      for (const point of points) {
        if (stored(cells, sizeId, point.measurementNameId)) continue;
        const value = computedOf(cells, sizeId, point.measurementNameId);
        if (value)
          writes.push({
            sizeId,
            measurementNameId: point.measurementNameId,
            value,
            source: 'STYLE_SIZE_CHART_CELL_SOURCE_MANUAL',
          });
      }
    }
    if (!writes.length) return;
    setCells((previousCells) => [...previousCells, ...writes]);
    markDirty('run');
    // The run is the trigger; the grid values are the render that observed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, prepared]);

  const reviews = useMemo(
    () => reviewDiffs(points, savedCells, pattern.patternValues),
    [points, savedCells, pattern.patternValues],
  );
  const reviewByPoint = useMemo(
    () => new Map(reviews.map((review) => [review.point.measurementNameId, review])),
    [reviews],
  );
  const warnings = reviewCount(reviews);

  const filled = ordered.some((sizeId) =>
    points.some((point) => numberOf(stored(cells, sizeId, point.measurementNameId)) != null),
  );
  useEffect(() => {
    onFilledChange?.(filled);
  }, [filled, onFilledChange]);

  useEffect(() => {
    const initial = ordered.includes(baseId) ? baseId : ordered[0] ?? 0;
    if (!ordered.includes(Number(mobileSize))) setMobileSize(initial ? String(initial) : '');
  }, [baseId, mobileSize, ordered]);

  async function commitChart() {
    if (!styleId) return;
    setSaving(true);
    try {
      const current = await adminService.GetStyleSizeChart({ styleId });
      const expectedLockVersion = current.chart?.lockVersion ?? 0;
      const payload: common_StyleSizeChartCell[] = cells.flatMap((cell) => {
        const value = numberOf(cell.value);
        return value != null && value > 0
          ? [
              {
                sizeId: cell.sizeId,
                measurementNameId: cell.measurementNameId,
                value: { value: cell.value },
                source: cell.source,
              },
            ]
          : [];
      });
      const withCells = new Set(payload.map((cell) => cell.measurementNameId));
      const gradeSteps: common_StyleSizeChartGradeStep[] = [];
      if (baseId) {
        for (const [measurementNameId, step] of steps) {
          const value = numberOf(step);
          if (value == null || value === 0 || !withCells.has(measurementNameId)) continue;
          gradeSteps.push({ measurementNameId, step: { value: String(value) } });
        }
      }
      const pointPayload: common_StyleSizeChartPoint[] = normalizePoints(points).map((point) => ({
        measurementNameId: point.measurementNameId,
        pomCode: point.pomCode,
        position: point.position,
        tolMinusCm: { value: point.tolMinusCm || '1' },
        tolPlusCm: { value: point.tolPlusCm || '1' },
        inShop: point.inShop,
        basisPieceLineKeys: point.basisPieceLineKeys,
        stale: point.stale,
      }));
      const pictureValid =
        (picture.source === 'icon' && !!SIZE_CHART_ICONS[picture.iconKey]) ||
        (picture.source !== 'icon' && picture.mediaId > 0);
      const picturePayload = pictureValid
        ? {
            source: picture.source,
            iconKey: picture.source === 'icon' ? picture.iconKey : '',
            mediaId: picture.source === 'icon' ? 0 : picture.mediaId,
            lines: picture.lines.map((line) => ({
              measurementNameId: line.measurementNameId,
              x1: line.x1,
              y1: line.y1,
              x2: line.x2,
              y2: line.y2,
              position: line.position,
            })),
            mediaUrl: undefined,
          }
        : undefined;
      await adminService.UpdateStyleSizeChart({
        styleId,
        expectedLockVersion,
        cells: payload,
        gradeBaseSizeId: gradeSteps.length ? baseId : 0,
        gradeSteps,
        points: pointPayload,
        pointsSet: true,
        picture: picturePayload,
        // The default picture is only shown; it is saved once the user touched the picture.
        pictureSet: [...touched].some(
          (key) =>
            ['picture', 'icon', 'sketch', 'upload'].includes(key) ||
            key.startsWith('line:') ||
            key.startsWith('remove:'),
        ),
        shrinkagePct: shrinkagePct.trim() ? { value: shrinkagePct } : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!staging || !styleId || !canEdit) return;
    if (!dirty) {
      staging.unstage(STAGING_KEY);
      return;
    }
    const edited = touched.size;
    staging.stage({
      key: STAGING_KEY,
      label: `size chart · ${edited} ${edited === 1 ? 'edit' : 'edits'}`,
      order: COMMIT_ORDER.sizeChart,
      commit: commitChart,
      settle: () => {
        setDirty(false);
        setTouched(new Set());
        setSavedCells(cells);
      },
      snapshot: {
        cells,
        picture,
        points,
        shrinkagePct,
        steps: [...steps],
        touched: [...touched],
      } satisfies ChartSnapshot,
    });
    // commitChart intentionally closes over the exact state named here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    staging,
    styleId,
    canEdit,
    dirty,
    touched,
    cells,
    picture,
    points,
    shrinkagePct,
    steps,
    ordered,
    baseId,
  ]);

  const sizeOptions = useMemo<readonly ViewSwitchOption<string>[]>(
    () =>
      ordered.map((sizeId) => ({
        value: String(sizeId),
        label: formatSizeName(sizeById.get(sizeId) ?? `#${sizeId}`),
      })),
    [ordered, sizeById],
  );
  const selectedSizeId = Number(mobileSize) || baseId || ordered[0] || 0;
  const measurementOptions = useMemo(
    () =>
      [...measurementById]
        .map(([value, name]) => ({ value, label: humanName(name) }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label))),
    [measurementById],
  );
  const freeLineByMeasurementId = useMemo(
    () =>
      new Map(
        picture.lines.flatMap((line) =>
          line.measurementNameId > 0 ? [[line.measurementNameId, line] as const] : [],
        ),
      ),
    [picture.lines],
  );
  const unpickedFreeLines = picture.lines.filter((line) => line.measurementNameId === 0);
  const valueForPicture = (measurementNameId: number) =>
    oneDecimal(stored(cells, selectedSizeId, measurementNameId));

  const rememberCurrentPicture = () => {
    if (picture.source === 'icon' && picture.iconKey) {
      rememberedPicture.current.iconKey = picture.iconKey;
    } else if (picture.source === 'sketch' && picture.mediaId) {
      rememberedPicture.current.sketch =
        sketches.find((sketch) => sketch.id === picture.mediaId) ??
        ({ id: picture.mediaId, url: picture.mediaUrl, label: 'Sketch' } satisfies SizeChartSketch);
    } else if (picture.source === 'upload' && picture.mediaId) {
      rememberedPicture.current.upload = { id: picture.mediaId, url: picture.mediaUrl };
    }
  };

  const changePictureSource = (source: SizeChartPictureSource) => {
    rememberCurrentPicture();
    if (source === 'icon') {
      const iconKey =
        rememberedPicture.current.iconKey ??
        defaultSizeChartIcon(pattern.categoryNames) ??
        (pattern.kind === 'bottom' ? 'joggers' : 'shirt') ??
        '';
      setPicture((previous) => ({
        ...previous,
        source,
        iconKey,
        mediaId: 0,
        mediaUrl: '',
      }));
    } else if (source === 'sketch') {
      const sketch = rememberedPicture.current.sketch ?? sketches[0];
      if (!sketch) return;
      setPicture((previous) => ({
        ...previous,
        source,
        iconKey: '',
        mediaId: sketch.id,
        mediaUrl: sketch.url,
      }));
    } else {
      const upload = rememberedPicture.current.upload;
      setPicture((previous) => ({
        ...previous,
        source,
        iconKey: '',
        mediaId: upload?.id ?? 0,
        mediaUrl: upload?.url ?? '',
      }));
    }
    markDirty('picture');
  };

  const changeIcon = (iconKey: string) => {
    if (!SIZE_CHART_ICONS[iconKey]) return;
    rememberedPicture.current.iconKey = iconKey;
    setPicture((previous) => ({
      ...previous,
      source: 'icon',
      iconKey,
      mediaId: 0,
      mediaUrl: '',
    }));
    markDirty('icon');
  };

  const changeSketch = (sketch: SizeChartSketch) => {
    rememberedPicture.current.sketch = sketch;
    setPicture((previous) => ({
      ...previous,
      source: 'sketch',
      iconKey: '',
      mediaId: sketch.id,
      mediaUrl: sketch.url,
    }));
    markDirty('sketch');
  };

  const uploadPicture = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await uploadMediaInput(file);
      const id = uploaded.id ?? 0;
      const url =
        uploaded.media?.fullSize?.mediaUrl ||
        uploaded.media?.compressed?.mediaUrl ||
        uploaded.media?.thumbnail?.mediaUrl ||
        '';
      if (!id || !url) throw new Error('Upload failed');
      rememberedPicture.current.upload = { id, url };
      setPicture((previous) => ({
        ...previous,
        source: 'upload',
        iconKey: '',
        mediaId: id,
        mediaUrl: url,
      }));
      markDirty('upload');
    } catch {
      showMessage('Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const addFreeLine = (start: PicturePoint, end: PicturePoint) => {
    const position = Math.max(0, ...picture.lines.map((line) => line.position)) + 1;
    setPicture((previous) => ({
      ...previous,
      lines: [
        ...previous.lines,
        {
          measurementNameId: 0,
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          position,
        },
      ],
    }));
    setActivePointId(null);
    setActiveFreeLinePosition(position);
    markDirty(`line:${position}`);
  };

  const assignFreeLine = (position: number, measurementNameId: number) => {
    if (!measurementNameId || points.some((point) => point.measurementNameId === measurementNameId))
      return;
    const name = measurementById.get(measurementNameId)?.trim().toLowerCase();
    const pomCode = POM_CODES_BY_GARMENT[pattern.kind].find(
      (code) => POM_CHART_NAME[code] === name,
    );
    let nextPoints = points;
    let nextCells = cells;
    if (pomCode) {
      const added = addPoint(
        points,
        cells,
        measurementNameId,
        pomCode,
        pattern.patternValues,
        pattern.basis.get(pomCode),
      );
      nextPoints = added.points;
      nextCells = added.cells;
    } else {
      nextPoints = [
        ...points,
        {
          measurementNameId,
          position: points.length + 1,
          tolMinusCm: '1',
          tolPlusCm: '1',
          inShop: false,
          basisPieceLineKeys: [],
          stale: false,
        },
      ];
    }
    const cellMap = new Map(
      nextCells.map((cell) => [cellKey(cell.sizeId, cell.measurementNameId), cell]),
    );
    for (const [sizeIdText, value] of Object.entries(pendingLineValues[position] ?? {})) {
      if (!value.trim()) continue;
      const sizeId = Number(sizeIdText);
      cellMap.set(cellKey(sizeId, measurementNameId), {
        sizeId,
        measurementNameId,
        value,
        source: 'STYLE_SIZE_CHART_CELL_SOURCE_MANUAL',
      });
    }
    setPoints(normalizePoints(nextPoints));
    setCells([...cellMap.values()]);
    setPicture((previous) => ({
      ...previous,
      lines: previous.lines.map((line) =>
        line.position === position ? { ...line, measurementNameId } : line,
      ),
    }));
    setPendingLineValues((previous) => {
      const next = { ...previous };
      delete next[position];
      return next;
    });
    setActivePointId(measurementNameId);
    setActiveFreeLinePosition(null);
    markDirty(`line:${position}`);
  };

  const changeFreeLineMeasurement = (
    position: number,
    currentMeasurementNameId: number,
    nextMeasurementNameId: number,
  ) => {
    if (!currentMeasurementNameId) {
      assignFreeLine(position, nextMeasurementNameId);
      return;
    }
    if (
      !nextMeasurementNameId ||
      nextMeasurementNameId === currentMeasurementNameId ||
      points.some((point) => point.measurementNameId === nextMeasurementNameId)
    )
      return;
    const name = measurementById.get(nextMeasurementNameId)?.trim().toLowerCase();
    const pomCode = POM_CODES_BY_GARMENT[pattern.kind].find(
      (code) => POM_CHART_NAME[code] === name,
    );
    setPoints((previous) =>
      previous.map((point) =>
        point.measurementNameId === currentMeasurementNameId
          ? {
              ...point,
              measurementNameId: nextMeasurementNameId,
              pomCode,
              basisPieceLineKeys: pomCode ? [...(pattern.basis.get(pomCode) ?? [])] : [],
              stale: false,
            }
          : point,
      ),
    );
    setCells((previous) =>
      previous.map((cell) =>
        cell.measurementNameId === currentMeasurementNameId
          ? { ...cell, measurementNameId: nextMeasurementNameId }
          : cell,
      ),
    );
    setSteps((previous) => {
      const next = new Map(previous);
      const step = next.get(currentMeasurementNameId);
      next.delete(currentMeasurementNameId);
      if (step != null) next.set(nextMeasurementNameId, step);
      return next;
    });
    setPicture((previous) => ({
      ...previous,
      lines: previous.lines.map((line) =>
        line.position === position ? { ...line, measurementNameId: nextMeasurementNameId } : line,
      ),
    }));
    setActivePointId(nextMeasurementNameId);
    setActiveFreeLinePosition(null);
    markDirty(`line:${position}`);
  };

  const setPendingLineCell = (position: number, sizeId: number, value: string) => {
    setPendingLineValues((previous) => ({
      ...previous,
      [position]: { ...previous[position], [sizeId]: value },
    }));
    markDirty(`line:${position}`);
  };

  const removeFreeLine = (position: number, measurementNameId: number) => {
    setPicture((previous) => ({
      ...previous,
      lines: previous.lines.filter((line) => line.position !== position),
    }));
    if (measurementNameId) {
      setPoints((previous) =>
        normalizePoints(previous.filter((point) => point.measurementNameId !== measurementNameId)),
      );
      setCells((previous) =>
        previous.filter((cell) => cell.measurementNameId !== measurementNameId),
      );
      setSteps((previous) => {
        const next = new Map(previous);
        next.delete(measurementNameId);
        return next;
      });
    }
    setPendingLineValues((previous) => {
      const next = { ...previous };
      delete next[position];
      return next;
    });
    setActivePointId(null);
    setActiveFreeLinePosition(null);
    markDirty(`remove:${position}`);
  };

  const keepPoint = (measurementNameId: number) => {
    const kept = keepSaved(points, savedCells, measurementNameId);
    const keptCells = new Map(
      cells
        .filter((cell) => cell.measurementNameId !== measurementNameId)
        .map((cell) => [cellKey(cell.sizeId, cell.measurementNameId), cell]),
    );
    for (const cell of kept.cells.filter(
      (candidate) => candidate.measurementNameId === measurementNameId,
    ))
      keptCells.set(cellKey(cell.sizeId, cell.measurementNameId), cell);
    setPoints(kept.points);
    setCells([...keptCells.values()]);
    setSavedCells((previous) =>
      previous.map((cell) =>
        cell.measurementNameId === measurementNameId
          ? { ...cell, source: 'STYLE_SIZE_CHART_CELL_SOURCE_MANUAL' }
          : cell,
      ),
    );
    markDirty(`keep:${measurementNameId}`);
  };

  const takePoint = (measurementNameId: number) => {
    const taken = usePattern(points, cells, measurementNameId, pattern.patternValues);
    setPoints(taken.points);
    setCells(taken.cells);
    setSavedCells((previous) => {
      const next = new Map(
        previous.map((cell) => [cellKey(cell.sizeId, cell.measurementNameId), cell]),
      );
      for (const cell of taken.cells.filter(
        (candidate) => candidate.measurementNameId === measurementNameId,
      ))
        next.set(cellKey(cell.sizeId, cell.measurementNameId), cell);
      return [...next.values()];
    });
    markDirty(`pattern:${measurementNameId}`);
  };

  const header = headerEl
    ? createPortal(
        <>
          {editing && (
            <label className='flex items-center gap-1.5 whitespace-nowrap text-micro uppercase tracking-label text-labelColor'>
              <span>shrink %</span>
              <Input
                name='size-chart-shrinkage'
                inputMode='decimal'
                value={shrinkagePct}
                placeholder={oneDecimal(pattern.mainShrinkagePct)}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  if (!MEASURE.test(event.target.value)) return;
                  setShrinkagePct(event.target.value);
                  markDirty('shrinkage');
                }}
                className='w-14 text-right'
                disabled={!canEdit || saving}
              />
            </label>
          )}
          {warnings > 0 && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              className='text-error no-underline hover:underline'
              aria-pressed={reviewOpen}
              onClick={() => setReviewOpen((open) => !open)}
            >
              ! {warnings}
            </Button>
          )}
          {canEdit && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              disabled={saving}
              onClick={() => {
                setEditing((value) => !value);
              }}
            >
              {editing ? 'done' : 'edit'}
            </Button>
          )}
        </>,
        headerEl,
      )
    : null;

  if (!styleId) {
    return (
      <>
        {header}
        <Placeholder className='h-12' label='save card first' />
      </>
    );
  }
  if (sizeIds.length === 0) {
    return (
      <>
        {header}
        <Placeholder className='h-12' label='pick sizes first' />
      </>
    );
  }

  const visibleColumns = 3 + ordered.length + (editing ? 2 + (pattern.hasPatterns ? 0 : 1) : 0);

  return (
    <div className='@container flex min-w-0 flex-col gap-2.5'>
      {header}
      <div
        className='grid grid-cols-[minmax(0,1fr)_minmax(18.75rem,27.5rem)] items-start gap-gutter @max-[50rem]:grid-cols-1 @max-[50rem]:gap-2'
        onMouseLeave={() => {
          setActivePointId(null);
          setActiveFreeLinePosition(null);
        }}
      >
        <DataTable className='[&_td]:h-8 [&_td]:align-middle'>
          <thead>
            <tr>
              <th>#</th>
              <th data-align='left'>point</th>
              {editing && <th>±</th>}
              {ordered.map((sizeId) => (
                <th
                  key={sizeId}
                  className={cn(String(sizeId) !== mobileSize && '@max-[50rem]:hidden')}
                >
                  <Button
                    type='button'
                    variant='underline'
                    size='xs'
                    className={cn(
                      String(sizeId) === mobileSize && 'text-highlightColor no-underline',
                    )}
                    onClick={() => setMobileSize(String(sizeId))}
                  >
                    {formatSizeName(sizeById.get(sizeId) ?? `#${sizeId}`)}
                  </Button>
                </th>
              ))}
              {editing && !pattern.hasPatterns && <th>step</th>}
              <th data-align='left'>shop</th>
              {editing && <th aria-label='remove' />}
            </tr>
          </thead>
          <tbody>
            {points.map((point) => {
              const name = humanName(measurementById.get(point.measurementNameId) ?? '');
              const freeLine = freeLineByMeasurementId.get(point.measurementNameId);
              const review = reviewByPoint.get(point.measurementNameId);
              const activeRow = activePointId === point.measurementNameId;
              return (
                <FragmentRows key={point.measurementNameId}>
                  <tr
                    data-row={point.position}
                    className={cn(
                      'cursor-default transition-colors [&>td]:transition-colors',
                      activeRow && '[&>td]:bg-pageBg',
                    )}
                    onMouseEnter={() => {
                      setActivePointId(point.measurementNameId);
                      setActiveFreeLinePosition(null);
                    }}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('input,button')) return;
                      setActivePointId(point.measurementNameId);
                      setActiveFreeLinePosition(null);
                    }}
                  >
                    <td>{point.position}</td>
                    <td data-align='left'>
                      {freeLine ? (
                        <Select
                          name={`size-chart-line-point-${freeLine.position}`}
                          value={String(point.measurementNameId)}
                          placeholder='Point'
                          items={measurementOptions.map((option) => ({
                            ...option,
                            disabled:
                              option.value !== point.measurementNameId &&
                              points.some(
                                (candidate) => candidate.measurementNameId === option.value,
                              ),
                          }))}
                          onValueChange={(value) =>
                            changeFreeLineMeasurement(
                              freeLine.position,
                              point.measurementNameId,
                              Number(value),
                            )
                          }
                          readOnly={!editing || !canEdit}
                          size='sm'
                          className='min-w-32'
                        />
                      ) : (
                        name || <EmptyCell />
                      )}
                    </td>
                    {editing && (
                      <td className='w-14'>
                        <Input
                          name={`size-chart-tolerance-${point.measurementNameId}`}
                          inputMode='decimal'
                          value={point.tolPlusCm}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            if (!MEASURE.test(event.target.value)) return;
                            setPoints((previous) =>
                              previous.map((candidate) =>
                                candidate.measurementNameId === point.measurementNameId
                                  ? {
                                      ...candidate,
                                      tolMinusCm: event.target.value,
                                      tolPlusCm: event.target.value,
                                    }
                                  : candidate,
                              ),
                            );
                            markDirty(`tolerance:${point.measurementNameId}`);
                          }}
                          className='min-w-12 text-right'
                          disabled={!canEdit}
                        />
                      </td>
                    )}
                    {ordered.map((sizeId) => {
                      const value = stored(cells, sizeId, point.measurementNameId);
                      const changed = !!review?.cells.some((cell) => cell.sizeId === sizeId);
                      return (
                        <td
                          key={sizeId}
                          className={cn(
                            'min-w-16',
                            String(sizeId) !== mobileSize && '@max-[50rem]:hidden',
                            !editing && changed && 'text-error',
                            !editing && canEdit && 'cursor-pointer',
                          )}
                          onClick={
                            !editing && canEdit && !saving
                              ? () => {
                                  setFocusCell(`size-chart-${point.measurementNameId}-${sizeId}`);
                                  setEditing(true);
                                }
                              : undefined
                          }
                        >
                          {editing ? (
                            <Input
                              name={`size-chart-${point.measurementNameId}-${sizeId}`}
                              inputMode='decimal'
                              value={value}
                              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                if (MEASURE.test(event.target.value))
                                  setCell(sizeId, point.measurementNameId, event.target.value);
                              }}
                              className='min-w-14 text-right'
                              disabled={!canEdit}
                            />
                          ) : value ? (
                            oneDecimal(value)
                          ) : (
                            <EmptyCell />
                          )}
                        </td>
                      );
                    })}
                    {editing && !pattern.hasPatterns && (
                      <td className='w-14'>
                        <Input
                          name={`size-chart-step-${point.measurementNameId}`}
                          inputMode='decimal'
                          value={steps.get(point.measurementNameId) ?? ''}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            if (STEP.test(event.target.value))
                              setStep(point.measurementNameId, event.target.value);
                          }}
                          className='min-w-12 text-right'
                          disabled={!canEdit || basePos < 0}
                        />
                      </td>
                    )}
                    <td data-align='left'>
                      {editing ? (
                        <CheckboxCommon
                          name={`size-chart-shop-${point.measurementNameId}`}
                          checked={point.inShop}
                          onChange={(checked) => {
                            setPoints((previous) =>
                              previous.map((candidate) =>
                                candidate.measurementNameId === point.measurementNameId
                                  ? { ...candidate, inShop: checked }
                                  : candidate,
                              ),
                            );
                            markDirty(`shop:${point.measurementNameId}`);
                          }}
                          disabled={!canEdit}
                        />
                      ) : point.inShop ? (
                        '✓'
                      ) : null}
                    </td>
                    {editing && (
                      <td data-align='left'>
                        {freeLine && (
                          <Close
                            size='sm'
                            aria-label='Remove line'
                            onClick={() =>
                              removeFreeLine(freeLine.position, point.measurementNameId)
                            }
                            disabled={!canEdit}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                  {reviewOpen && review && (
                    <tr>
                      <td />
                      <td colSpan={visibleColumns - 1} data-align='left'>
                        <div className='flex flex-col gap-1 py-1 text-control text-labelColor'>
                          {review.cells.length ? (
                            review.cells.map((change) => (
                              <div
                                key={change.sizeId}
                                className='flex flex-wrap items-baseline gap-x-3'
                              >
                                <span>{formatSizeName(sizeById.get(change.sizeId) ?? '')}</span>
                                <span>saved {oneDecimal(change.saved)}</span>
                                <span className='text-error'>
                                  pattern {oneDecimal(change.pattern)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className='text-error'>stale</span>
                          )}
                          <div className='flex items-center gap-3'>
                            <Button
                              type='button'
                              variant='underline'
                              size='xs'
                              onClick={() => keepPoint(point.measurementNameId)}
                            >
                              keep saved
                            </Button>
                            {review.cells.length > 0 && (
                              <Button
                                type='button'
                                variant='underline'
                                size='xs'
                                onClick={() => takePoint(point.measurementNameId)}
                              >
                                use pattern
                              </Button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRows>
              );
            })}
            {unpickedFreeLines.map((line, lineIndex) => {
              const activeRow = activeFreeLinePosition === line.position;
              return (
                <tr
                  key={`free:${line.position}`}
                  className={cn(
                    'cursor-default transition-colors [&>td]:transition-colors',
                    activeRow && '[&>td]:bg-pageBg',
                  )}
                  onMouseEnter={() => {
                    setActivePointId(null);
                    setActiveFreeLinePosition(line.position);
                  }}
                >
                  <td>{points.length + lineIndex + 1}</td>
                  <td data-align='left'>
                    <Select
                      name={`size-chart-line-point-${line.position}`}
                      value={undefined}
                      placeholder='Point'
                      items={measurementOptions.map((option) => ({
                        ...option,
                        disabled: points.some((point) => point.measurementNameId === option.value),
                      }))}
                      onValueChange={(value) => assignFreeLine(line.position, Number(value))}
                      readOnly={!editing || !canEdit}
                      size='sm'
                      className='min-w-32'
                    />
                  </td>
                  {editing && (
                    <td>
                      <EmptyCell />
                    </td>
                  )}
                  {ordered.map((sizeId) => {
                    const value = pendingLineValues[line.position]?.[sizeId] ?? '';
                    return (
                      <td
                        key={sizeId}
                        className={cn(
                          'min-w-16',
                          String(sizeId) !== mobileSize && '@max-[50rem]:hidden',
                        )}
                      >
                        {editing ? (
                          <Input
                            name={`size-chart-free-${line.position}-${sizeId}`}
                            inputMode='decimal'
                            value={value}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => {
                              if (MEASURE.test(event.target.value))
                                setPendingLineCell(line.position, sizeId, event.target.value);
                            }}
                            className='min-w-14 text-right'
                            disabled={!canEdit}
                          />
                        ) : (
                          <EmptyCell />
                        )}
                      </td>
                    );
                  })}
                  {editing && !pattern.hasPatterns && (
                    <td>
                      <EmptyCell />
                    </td>
                  )}
                  <td data-align='left'>
                    <EmptyCell />
                  </td>
                  {editing && (
                    <td data-align='left'>
                      <Close
                        size='sm'
                        aria-label='Remove line'
                        onClick={() => removeFreeLine(line.position, 0)}
                        disabled={!canEdit}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </DataTable>

        <div className='sticky top-4 order-none @max-[50rem]:static @max-[50rem]:order-first'>
          <SizeChartPictureEditor
            picture={picture}
            sketches={sketches}
            size={mobileSize}
            sizeOptions={sizeOptions}
            editing={editing && canEdit}
            disabled={!editing || !canEdit || saving}
            uploading={uploading}
            measurementNameById={measurementById}
            measurementNameIdOf={measurementNameIdOf}
            valueFor={valueForPicture}
            activeMeasurementNameId={activePointId}
            activeFreeLinePosition={activeFreeLinePosition}
            onSizeChange={setMobileSize}
            onSourceChange={changePictureSource}
            onIconChange={changeIcon}
            onSketchChange={changeSketch}
            onUpload={uploadPicture}
            onAddLine={addFreeLine}
            onFocus={(focus) => {
              setActivePointId(focus.measurementNameId || null);
              setActiveFreeLinePosition(focus.measurementNameId ? null : focus.position || null);
            }}
            onBlur={() => {
              setActivePointId(null);
              setActiveFreeLinePosition(null);
            }}
          />
        </div>
      </div>

      {editing && (
        <Button
          type='button'
          variant='main'
          size='lg'
          className='hidden w-full @max-[50rem]:block'
          onClick={() => setEditing(false)}
        >
          save chart
        </Button>
      )}
    </div>
  );
}

function FragmentRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
