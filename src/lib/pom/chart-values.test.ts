import { describe, expect, it } from 'vitest';

import type { PomReport, PomValue } from './types';
import { chartFromReport } from './chart-values';

const value = (overrides: Partial<PomValue>): PomValue => ({
  code: 'front-rise',
  name: 'Front rise',
  method: 'edge-length',
  valueMm: 268,
  exactness: 'exact',
  path: { landmarks: [], edges: [], lines: [] },
  ...overrides,
});

const report = (values: PomValue[]): PomReport => ({
  garment: 'bottom',
  baseSize: 'M',
  convention: 'full',
  conventionSource: 'card',
  pieces: [],
  roles: {},
  sizes: [{ size: 'M', values, regraded: [], warnings: [] }],
  warnings: [],
});

describe('chartFromReport', () => {
  it('converts millimetres to finished centimetres with zero shrink', () => {
    const chart = chartFromReport(report([value({})]), ['front-rise'], new Map([['M', 7]]), 0);
    expect(chart.get('front-rise')?.get(7)).toBe(26.8);
  });

  it('applies shrinkage and rounds to one decimal', () => {
    const chart = chartFromReport(report([value({})]), ['front-rise'], new Map([['M', 7]]), 3);
    expect(chart.get('front-rise')?.get(7)).toBe(26);
  });

  it('stores girths as half values and omits not-found readings', () => {
    const chart = chartFromReport(
      report([
        value({ code: 'waist', valueMm: 820, halfMm: 410, fullMm: 820 }),
        value({ code: 'inseam', valueMm: null, exactness: 'not-found' }),
      ]),
      ['waist', 'inseam'],
      new Map([['M', 7]]),
      0,
    );
    expect(chart.get('waist')?.get(7)).toBe(41);
    expect(chart.has('inseam')).toBe(false);
  });
});
