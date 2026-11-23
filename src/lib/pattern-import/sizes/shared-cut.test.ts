import { expect, it } from 'vitest';
import type { Chain, Sheet } from '../types';
import { sharedCutOutlines } from './shared-cut';

function fixture() {
  const pts = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const path = {
    id: 0,
    pts,
    style: 0,
    closed: true,
    visibleEdges: true,
    src: { file: '0', page: 0, op: 8, sub: 0 },
  } as const;
  const sheet: Sheet = {
    id: 0,
    bbox: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    pairs: [],
    missing: [],
    rasters: [],
    warnings: [],
    poses: [],
    paths: [path],
    styles: [
      {
        id: 0,
        strokeRgb: [20, 20, 20],
        widthMm: 0.5,
        dash: null,
        fill: false,
        layer: null,
        clip: null,
      },
    ],
    texts: ['D - TIE', 'FABRIC: CUT 1 OR 2', 'GRAINLINE'].map((text, id) => ({
      id,
      text,
      anchor: { x: 40, y: 30 + 5 * id },
      bbox: { minX: 40, minY: 30 + 5 * id, maxX: 52, maxY: 34 + 5 * id },
      fontSizeMm: 5,
      rotationDeg: 0,
      layer: null,
      src: path.src,
    })),
  };
  const chain: Chain = {
    id: 0,
    pts,
    style: 0,
    closed: true,
    lengthMm: 400,
    motif: null,
    ranges: [{ path: 0, from: 0, to: 4 }],
  };
  return { sheet, chain };
}

it('recognizes one fully visible cut containing its title, cutting quantity and grainline', () => {
  const { sheet, chain } = fixture();
  expect(sharedCutOutlines(sheet, [chain], [0], new Set(), ['S', 'M'])).toEqual(new Set([0]));
  sheet.paths[0].visibleEdges = [[0, 2]];
  expect(sharedCutOutlines(sheet, [chain], [0], new Set(), ['S', 'M']).size).toBe(0);
});

it('leaves a nearby size line, a nested outline or size-specific printing unresolved', () => {
  const { sheet, chain } = fixture();
  const rival = { ...chain, id: 1, closed: false };
  expect(sharedCutOutlines(sheet, [chain, rival], [0], new Set([1]), ['S', 'M']).size).toBe(0);
  expect(
    sharedCutOutlines(sheet, [chain, { ...rival, closed: true }], [0], new Set(), ['S', 'M']).size,
  ).toBe(0);
  sheet.texts.push({ ...sheet.texts[1], id: 3, text: 'SIZE M' });
  expect(sharedCutOutlines(sheet, [chain], [0], new Set(), ['S', 'M']).size).toBe(0);
});
