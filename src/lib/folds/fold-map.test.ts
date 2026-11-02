import { describe, expect, it } from 'vitest';

import type { Pt2 } from 'lib/assembly-skeleton/types';
import {
  activeFoldKeys,
  foldedOutline,
  foldMap,
  type FlatFold,
  type FoldMapGeometry,
} from './index';

const rectangle = (width: number): Pt2[] => [
  [0, 0],
  [width, 0],
  [width, 20],
  [0, 20],
];

const geometry = (width = 80): FoldMapGeometry => ({
  rings: [rectangle(width)],
  edges: [],
  marks: [],
  innerLines: [],
});

const foldAt = (x: number, flipX: number): FlatFold => ({
  a: [x, -10],
  b: [x, 30],
  flipAt: [flipX, 10],
  kind: 'inward',
});

const xSpan = (points: readonly Pt2[]) => {
  const xs = points.map(([x]) => x);
  return Math.max(...xs) - Math.min(...xs);
};

describe('foldMap', () => {
  it('folds an 80-wide rectangle to 40 while its fixed side stays in place', () => {
    const out = foldMap(geometry(), [foldAt(40, 20)]);

    expect(xSpan(out.rings[0])).toBeCloseTo(40, 0);
    expect(out.rings[0]).toContainEqual([80, 0]);
    expect(out.rings[0]).toContainEqual([80, 20]);
  });

  it('applies two folds in sequence', () => {
    const out = foldMap(geometry(90), [foldAt(30, 10), foldAt(60, 45)]);

    expect(xSpan(out.rings[0])).toBeCloseTo(30, 6);
    expect(Math.min(...out.rings[0].map(([x]) => x))).toBeCloseTo(60, 6);
  });

  it('leaves the piece unchanged when the moving side misses its contour', () => {
    const input = geometry();
    const fold = foldAt(100, 120);
    const out = foldMap(input, [fold]);

    expect(out).toEqual(input);
    expect(out.rings[0]).toEqual(foldedOutline(input.rings[0], [fold]).outline);
  });

  it('keeps the piece when the whole of it moves', () => {
    const out = foldMap(geometry(), [foldAt(-10, 40)]);

    expect(xSpan(out.rings[0])).toBeCloseTo(80, 6);
    expect(Math.max(...out.rings[0].map(([x]) => x))).toBeCloseTo(-20, 6);
  });

  it('returns the input unchanged without folds', () => {
    const input: FoldMapGeometry = {
      rings: [rectangle(80)],
      edges: [
        [
          [0.125, 4.75],
          [79.875, 4.75],
        ],
      ],
      marks: [[17.375, 8.625]],
      innerLines: [
        [
          [12.25, 2.5],
          [12.25, 17.5],
        ],
      ],
    };

    expect(foldMap(input, [])).toBe(input);
    expect(foldMap(input, [])).toEqual(input);
  });

  it('splits crossing lines and reflects only points on the moving side', () => {
    const fixedMark: Pt2 = [60, 5];
    const out = foldMap(
      {
        rings: [rectangle(80)],
        edges: [
          [
            [0, 10],
            [80, 10],
          ],
        ],
        marks: [[20, 5], fixedMark],
        innerLines: [
          [
            [20, 2],
            [20, 18],
          ],
        ],
      },
      [foldAt(40, 20)],
    );

    expect(out.edges).toHaveLength(2);
    expect(out.edges.map(xSpan)).toEqual([40, 40]);
    expect(out.innerLines).toEqual([
      [
        [60, 2],
        [60, 18],
      ],
    ]);
    expect(out.marks).toEqual([
      [60, 5],
      [60, 5],
    ]);
    expect(out.marks[1]).toBe(fixedMark);
  });
});

describe('activeFoldKeys', () => {
  const operations = [{}, { foldKeys: ['hem'] }, {}];

  it('is flat before an event and active on and after it', () => {
    expect(activeFoldKeys(operations, 0)).toEqual([]);
    expect(activeFoldKeys(operations, 1)).toEqual(['hem']);
    expect(activeFoldKeys(operations, 2)).toEqual(['hem']);
  });

  it('returns two folds introduced on one step', () => {
    expect(activeFoldKeys([{ foldKeys: ['turn-1', 'turn-2'] }], 0)).toEqual(['turn-1', 'turn-2']);
  });

  it('stays flat without fold steps', () => {
    expect(activeFoldKeys([], 0)).toEqual([]);
    expect(activeFoldKeys([{}, {}], 1)).toEqual([]);
  });
});
