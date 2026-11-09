import { describe, expect, it } from 'vitest';

import type { PatternChartValues } from 'lib/pom/chart-values';
import {
  keepSaved,
  mergePatternIntoCells,
  reviewCount,
  reviewDiffs,
  seedChart,
  usePattern,
  type ChartCellDraft,
  type ChartPointDraft,
} from './size-chart-data';

const point = (overrides: Partial<ChartPointDraft> = {}): ChartPointDraft => ({
  measurementNameId: 10,
  pomCode: 'front-rise',
  position: 1,
  tolMinusCm: '1',
  tolPlusCm: '1',
  inShop: true,
  basisPieceLineKeys: [],
  stale: false,
  ...overrides,
});

const cell = (overrides: Partial<ChartCellDraft> = {}): ChartCellDraft => ({
  sizeId: 2,
  measurementNameId: 10,
  value: '26.8',
  source: 'STYLE_SIZE_CHART_CELL_SOURCE_MANUAL',
  ...overrides,
});

const pattern = (value = 27.2): PatternChartValues =>
  new Map([['front-rise', new Map([[2, value]])]]);

describe('size chart data rules', () => {
  it('seeds defaults and retains a legacy typed row', () => {
    const names = new Map<string, number>([
      ['waist', 1],
      ['hip', 2],
      ['rise', 10],
      ['thigh', 11],
      ['knee', 12],
      ['leg-opening', 13],
      ['inseam', 14],
      ['height', 15],
    ]);
    const seeded = seedChart('bottom', [], [cell({ measurementNameId: 99 })], names);
    expect(seeded.seeded).toBe(true);
    expect(seeded.points.map((row) => row.pomCode)).toEqual([
      'waist',
      'hip',
      'front-rise',
      'thigh',
      'knee',
      'leg-opening',
      'inseam',
      'outseam',
      undefined,
    ]);
    expect(seeded.points.at(-1)?.measurementNameId).toBe(99);
  });

  it('fills empty and pattern cells without overwriting manual cells', () => {
    const manual = mergePatternIntoCells([cell()], [point()], pattern());
    expect(manual.changed).toBe(false);
    expect(manual.cells[0].value).toBe('26.8');

    const automatic = mergePatternIntoCells(
      [cell({ value: '26.8', source: 'STYLE_SIZE_CHART_CELL_SOURCE_PATTERN' })],
      [point()],
      pattern(),
    );
    expect(automatic.changed).toBe(true);
    expect(automatic.cells[0]).toMatchObject({
      value: '27.2',
      source: 'STYLE_SIZE_CHART_CELL_SOURCE_PATTERN',
    });
  });

  it('does not mark a round pattern value changed when the server dropped its zero', () => {
    const reopened = mergePatternIntoCells(
      [cell({ value: '30', source: 'STYLE_SIZE_CHART_CELL_SOURCE_PATTERN' })],
      [point()],
      pattern(30),
    );
    expect(reopened.changed).toBe(false);
  });

  it('reviews stale manual differences and counts changed cells', () => {
    const reviews = reviewDiffs([point({ stale: true })], [cell()], pattern());
    expect(reviews[0].cells).toEqual([{ sizeId: 2, saved: '26.8', pattern: 27.2 }]);
    expect(reviewCount(reviews)).toBe(1);
  });

  it('keeps saved values as manual or takes pattern values as pattern', () => {
    const kept = keepSaved([point({ stale: true })], [cell()], 10);
    expect(kept.points[0].stale).toBe(false);
    expect(kept.cells[0].source).toBe('STYLE_SIZE_CHART_CELL_SOURCE_MANUAL');
    expect(reviewDiffs(kept.points, kept.cells, pattern())).toEqual([]);

    const taken = usePattern([point({ stale: true })], [cell()], 10, pattern());
    expect(taken.points[0].stale).toBe(false);
    expect(taken.cells[0]).toMatchObject({
      value: '27.2',
      source: 'STYLE_SIZE_CHART_CELL_SOURCE_PATTERN',
    });
  });
});

describe('seedChart without a known garment', () => {
  it('adds no default points, only the rows old cells carry', () => {
    const names = new Map<string, number>([
      ['waist', 1],
      ['chest', 7],
    ]);
    const cells = [{ sizeId: 56, measurementNameId: 99, value: '10', source: 'manual' as const }];
    const seeded = seedChart(null, [], cells as never, names as never);
    expect(seeded.points.map((point) => point.measurementNameId)).toEqual([99]);
  });
});

describe('seedChart with a hooded picture', () => {
  it('adds the hood rows after the defaults when the dictionary has them', () => {
    const names = new Map<string, number>([
      ['chest', 7],
      ['hood-height', 38],
      ['hood-width', 45],
    ]);
    const seeded = seedChart('top', [], [], names, ['hood-height', 'hood-width', 'hood-depth']);
    expect(seeded.points.map((point) => point.measurementNameId)).toEqual([7, 38, 45]);
    expect(seedChart(null, [], [], names, ['hood-height']).points).toEqual([]);
  });
});
