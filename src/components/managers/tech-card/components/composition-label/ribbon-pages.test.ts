import { describe, expect, it } from 'vitest';
import type { PaperDoc } from '../../assembly-print/paper';
import type { PlannedSide, PrintSet } from '../../care-labels/pages';
import { builtRibbonPages, ribbonPagesOf } from './ribbon-pages';

const doc = (stem: string) => ({ w: 100, h: 30, prims: [], fileStem: stem }) as unknown as PaperDoc;

const side = (
  label: PlannedSide['label'],
  role: PlannedSide['role'],
  sizeId?: number,
): PlannedSide =>
  ({
    key: `${label}-${role}-${sizeId ?? ''}`,
    colorwayId: 1,
    label,
    role,
    sizeId,
    side: { doc: doc(`${label}-${role}${sizeId ? `-${sizeId}` : ''}`) },
    svgStem: '',
  }) as unknown as PlannedSide;

const setOf = (sides: PlannedSide[]): PrintSet => ({
  mode: 'duplex',
  sides: new Map(sides.map((p) => [p.key, p])),
  files: [],
  holes: [],
});

const stems = (docs: PaperDoc[]) => docs.map((d) => d.fileStem);

describe('ribbonPagesOf', () => {
  it('orders A, B, B2, B3 by number, faces first', () => {
    const set = setOf([
      side('B3', 'back'),
      side('B2', 'face'),
      side('B', 'back'),
      side('B', 'face'),
      side('A', 'back'),
      side('A', 'face', 7),
      side('A', 'face', 8),
      side('B3', 'face'),
      side('B2', 'back'),
    ]);
    expect(stems(ribbonPagesOf(set, 8))).toEqual(['A-face-8', 'B-face', 'B2-face', 'B3-face']);
  });

  it('falls back to the back when a ribbon has no face', () => {
    const set = setOf([side('A', 'back'), side('B', 'back')]);
    expect(stems(ribbonPagesOf(set, 3))).toEqual(['A-back', 'B-back']);
  });

  it('is empty with no set or no size', () => {
    expect(ribbonPagesOf(undefined, 1)).toEqual([]);
    expect(ribbonPagesOf(setOf([side('B', 'face')]), undefined)).toEqual([]);
  });
});

describe('builtRibbonPages', () => {
  it('takes the first colour that has a set and the first size', () => {
    const sets = new Map([
      [2, setOf([side('A', 'face', 5), side('A', 'face', 6), side('B', 'face')])],
    ]);
    expect(stems(builtRibbonPages(sets, [1, 2], [6, 5]))).toEqual(['A-face-6', 'B-face']);
  });

  it('is empty without a plan or a colour with a set', () => {
    expect(builtRibbonPages(undefined, [1], [1])).toEqual([]);
    expect(builtRibbonPages(new Map(), [1], [1])).toEqual([]);
  });
});
