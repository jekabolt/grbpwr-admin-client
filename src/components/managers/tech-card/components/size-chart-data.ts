import type { common_StyleSizeChartCellSource } from 'api/proto-http/admin';
import { DEFAULT_POINTS, POM_CHART_NAME, type ChartMeasurementName } from 'lib/pom/chart-points';
import type { PatternChartValues } from 'lib/pom/chart-values';
import type { GarmentKind, PomCode } from 'lib/pom/types';

export type ChartSource = Exclude<
  common_StyleSizeChartCellSource,
  'STYLE_SIZE_CHART_CELL_SOURCE_UNKNOWN'
>;

export type ChartCellDraft = {
  sizeId: number;
  measurementNameId: number;
  value: string;
  source: ChartSource;
};

export type ChartPointDraft = {
  measurementNameId: number;
  pomCode?: PomCode;
  position: number;
  tolMinusCm: string;
  tolPlusCm: string;
  inShop: boolean;
  basisPieceLineKeys: string[];
  stale: boolean;
};

export type ChartReviewCell = {
  sizeId: number;
  saved: string;
  pattern: number;
};

export type ChartReview = {
  point: ChartPointDraft;
  cells: ChartReviewCell[];
  staleOnly: boolean;
};

const keyOf = (sizeId: number, measurementNameId: number) => `${sizeId}:${measurementNameId}`;

const decimal = (value: number) => value.toFixed(1);
const numberOf = (value: string | undefined): number | null => {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sameValue = (saved: string, pattern: number) => {
  const value = numberOf(saved);
  return value != null && Math.abs(value - pattern) < 0.05;
};

export function normalizePoints(points: readonly ChartPointDraft[]): ChartPointDraft[] {
  return [...points]
    .sort((a, b) => a.position - b.position)
    .map((point, index) => ({ ...point, position: index + 1 }));
}

/**
 * Seed an empty points list while retaining every legacy measurement carried by a cell.
 * A null kind (garment not known yet) adds no default points, only the legacy rows.
 */
export function seedChart(
  kind: GarmentKind | null,
  points: readonly ChartPointDraft[],
  cells: readonly ChartCellDraft[],
  nameIds: ReadonlyMap<ChartMeasurementName | string, number>,
): { points: ChartPointDraft[]; cells: ChartCellDraft[]; seeded: boolean } {
  if (points.length) return { points: normalizePoints(points), cells: [...cells], seeded: false };

  const seeded: ChartPointDraft[] = [];
  const used = new Set<number>();
  for (const pomCode of kind ? DEFAULT_POINTS[kind] : []) {
    const measurementNameId = nameIds.get(POM_CHART_NAME[pomCode]);
    if (!measurementNameId || used.has(measurementNameId)) continue;
    used.add(measurementNameId);
    seeded.push({
      measurementNameId,
      pomCode,
      position: seeded.length + 1,
      tolMinusCm: '1',
      tolPlusCm: '1',
      inShop: false,
      basisPieceLineKeys: [],
      stale: false,
    });
  }

  // Old cards have cells but no point rows. Their measurements remain typed rows after defaults.
  for (const measurementNameId of new Set(cells.map((cell) => cell.measurementNameId))) {
    if (used.has(measurementNameId)) continue;
    used.add(measurementNameId);
    seeded.push({
      measurementNameId,
      position: seeded.length + 1,
      tolMinusCm: '1',
      tolPlusCm: '1',
      inShop: false,
      basisPieceLineKeys: [],
      stale: false,
    });
  }
  return { points: seeded, cells: [...cells], seeded: seeded.length > 0 };
}

/** Fill empty cells and refresh pattern-owned cells; manual values are immutable here. */
export function mergePatternIntoCells(
  cells: readonly ChartCellDraft[],
  points: readonly ChartPointDraft[],
  pattern: PatternChartValues | null,
): { cells: ChartCellDraft[]; changed: boolean } {
  if (!pattern) return { cells: [...cells], changed: false };
  const next = new Map(
    cells.map((cell) => [keyOf(cell.sizeId, cell.measurementNameId), { ...cell }]),
  );
  let changed = false;
  for (const point of points) {
    if (!point.pomCode) continue;
    for (const [sizeId, value] of pattern.get(point.pomCode) ?? []) {
      const key = keyOf(sizeId, point.measurementNameId);
      const have = next.get(key);
      if (have?.source === 'STYLE_SIZE_CHART_CELL_SOURCE_MANUAL' && have.value.trim()) continue;
      const valueText = decimal(value);
      // Compare numbers: the server drops trailing zeros ("30"), the pattern prints "30.0".
      if (
        have?.source === 'STYLE_SIZE_CHART_CELL_SOURCE_PATTERN' &&
        numberOf(have.value) === Number(valueText)
      )
        continue;
      next.set(key, {
        sizeId,
        measurementNameId: point.measurementNameId,
        value: valueText,
        source: 'STYLE_SIZE_CHART_CELL_SOURCE_PATTERN',
      });
      changed = true;
    }
  }
  return { cells: [...next.values()], changed };
}

/** Pattern deltas grouped under their chart row. A stale point counts even without a readable POM. */
export function reviewDiffs(
  points: readonly ChartPointDraft[],
  cells: readonly ChartCellDraft[],
  pattern: PatternChartValues | null,
): ChartReview[] {
  const byKey = new Map(cells.map((cell) => [keyOf(cell.sizeId, cell.measurementNameId), cell]));
  return points.flatMap((point) => {
    if (!point.pomCode) return point.stale ? [{ point, cells: [], staleOnly: true }] : [];
    const changes: ChartReviewCell[] = [];
    for (const [sizeId, value] of pattern?.get(point.pomCode) ?? []) {
      const cell = byKey.get(keyOf(sizeId, point.measurementNameId));
      if (!cell?.value || sameValue(cell.value, value)) continue;
      // A pattern-owned value is always actionable. A manual value is actionable when the server
      // marked its point stale; keeping it clears that stale review without overwriting the value.
      if (cell.source !== 'STYLE_SIZE_CHART_CELL_SOURCE_PATTERN' && !point.stale) continue;
      changes.push({ sizeId, saved: cell.value, pattern: value });
    }
    return changes.length || point.stale
      ? [{ point, cells: changes, staleOnly: changes.length === 0 }]
      : [];
  });
}

export function reviewCount(reviews: readonly ChartReview[]): number {
  return reviews.reduce((count, review) => count + Math.max(1, review.cells.length), 0);
}

export function keepSaved(
  points: readonly ChartPointDraft[],
  cells: readonly ChartCellDraft[],
  measurementNameId: number,
): { points: ChartPointDraft[]; cells: ChartCellDraft[] } {
  return {
    points: points.map((point) =>
      point.measurementNameId === measurementNameId ? { ...point, stale: false } : point,
    ),
    cells: cells.map((cell) =>
      cell.measurementNameId === measurementNameId
        ? { ...cell, source: 'STYLE_SIZE_CHART_CELL_SOURCE_MANUAL' }
        : cell,
    ),
  };
}

export function usePattern(
  points: readonly ChartPointDraft[],
  cells: readonly ChartCellDraft[],
  measurementNameId: number,
  pattern: PatternChartValues | null,
): { points: ChartPointDraft[]; cells: ChartCellDraft[] } {
  const point = points.find((candidate) => candidate.measurementNameId === measurementNameId);
  if (!point?.pomCode || !pattern) return { points: [...points], cells: [...cells] };
  const next = new Map(
    cells.map((cell) => [keyOf(cell.sizeId, cell.measurementNameId), { ...cell }]),
  );
  for (const [sizeId, value] of pattern.get(point.pomCode) ?? []) {
    next.set(keyOf(sizeId, measurementNameId), {
      sizeId,
      measurementNameId,
      value: decimal(value),
      source: 'STYLE_SIZE_CHART_CELL_SOURCE_PATTERN',
    });
  }
  return {
    points: points.map((candidate) =>
      candidate.measurementNameId === measurementNameId
        ? { ...candidate, stale: false }
        : candidate,
    ),
    cells: [...next.values()],
  };
}

export function addPoint(
  points: readonly ChartPointDraft[],
  cells: readonly ChartCellDraft[],
  measurementNameId: number,
  pomCode: PomCode,
  pattern: PatternChartValues | null,
  basisPieceLineKeys: readonly string[] = [],
): { points: ChartPointDraft[]; cells: ChartCellDraft[] } {
  const point: ChartPointDraft = {
    measurementNameId,
    pomCode,
    position: points.length + 1,
    tolMinusCm: '1',
    tolPlusCm: '1',
    inShop: false,
    basisPieceLineKeys: [...basisPieceLineKeys],
    stale: false,
  };
  return {
    points: [...points, point],
    cells: mergePatternIntoCells(cells, [point], pattern).cells,
  };
}
