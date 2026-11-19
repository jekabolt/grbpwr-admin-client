import { describe, expect, it } from 'vitest';
import {
  authoredInternalVertices,
  parseManifestAuthoredInternal,
  sampleAuthoredQuadratic,
} from './authored-internal';
import type { AuthoredQuadraticGrid } from '../types';

const grid: AuthoredQuadraticGrid = [0, 0, 3_000_000, 0, 10_000_000, 0];

describe('the fixed-grid French curve contract', () => {
  it('samples the actual quadratic midpoint even when start, control and end are collinear', () => {
    expect(sampleAuthoredQuadratic(grid)).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 10, y: 0 },
    ]);
    const reversal: AuthoredQuadraticGrid = [0, 0, 20_000_000, 0, 10_000_000, 0];
    const points = sampleAuthoredQuadratic(reversal)!;
    expect(points.length).toBeGreaterThan(3);
    expect(Math.max(...points.map(({ x }) => x))).toBeGreaterThan(10);
    expect(points.at(-1)).toEqual({ x: 10, y: 0 });
  });

  it('refuses coincident endpoints, non-grid controls and excessive subdivision', () => {
    expect(sampleAuthoredQuadratic([0, 0, 3_000_000, 0, 0, 0])).toBeNull();
    expect(sampleAuthoredQuadratic([0, 0, Number.NaN, 0, 1_000_000, 0])).toBeNull();
    expect(sampleAuthoredQuadratic([0, 0, 0, 10 ** 15, 10 ** 15, 0])).toBeNull();
  });

  it('retains legacy samples and only parses an explicit, open French-curve grid', () => {
    const ordinary = {
      index: 0,
      label: 'draft-cad:french-curve',
      closed: false,
      vertices: authoredInternalVertices(sampleAuthoredQuadratic(grid)!),
    };
    expect(parseManifestAuthoredInternal([ordinary], 1)).toEqual([ordinary]);
    expect(parseManifestAuthoredInternal([{ ...ordinary, quadratic: grid }], 1)).toEqual([
      { ...ordinary, quadratic: grid },
    ]);
    for (const invalid of [
      { ...ordinary, quadratic: [0, 0, 0] },
      { ...ordinary, quadratic: [0, 0, 0.5, 0, 10_000_000, 0] },
      { ...ordinary, quadratic: grid, label: 'draft-cad:internal-line' },
      { ...ordinary, quadratic: grid, closed: true },
    ])
      expect(parseManifestAuthoredInternal([invalid], 1)).toBeNull();
  });
});
