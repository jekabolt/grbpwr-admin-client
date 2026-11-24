import { expect, it } from 'vitest';
import type { IRText } from '../types';
import { restoreCutLabels } from './cut-text';

function fragment(page: number, x: number, text: string): IRText {
  return {
    id: page,
    text,
    anchor: { x, y: 5 },
    bbox: { minX: x, maxX: x + 3, minY: 4, maxY: 8 },
    rotationDeg: 0,
    fontSizeMm: 4,
    layer: null,
    src: { file: 'tiles', page, op: 1, sub: 0 },
  };
}
it('reads a cut quantity and both materials across the tile edge', () => {
  const a = fragment(0, 8, 'C'),
    b = fragment(1, 11, 'UT 2 OF FABRIC AND LINING');
  expect(restoreCutLabels([a, b]).map((t) => t.text)).toEqual(['CUT 2 OF FABRIC AND LINING']);
  expect(restoreCutLabels([a, b, { ...b, src: { ...b.src, page: 2 } }])).toHaveLength(3);
  expect(restoreCutLabels([a, { ...b, anchor: { x: 11, y: 8 } }])).toHaveLength(2);
});
