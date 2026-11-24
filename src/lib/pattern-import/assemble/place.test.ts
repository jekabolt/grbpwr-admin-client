import { expect, it } from 'vitest';

import type { IRPage, IRPath } from '../types';
import { placePages } from './place';

const page = (index: number, left: number, right: number, height: number): IRPage => {
  const path: IRPath = {
    id: 0,
    style: 0,
    closed: true,
    src: { file: 'pdf', page: index, op: 10, sub: 0 },
    pts: [
      [left, 0],
      [right, 0],
      [right, height],
      [left, height],
      [left, 0],
    ].map(([x, y]) => ({ x, y })),
  };
  return {
    file: 'pdf',
    page: index,
    widthMm: 200,
    heightMm: 200,
    paths: [path],
    styles: [
      {
        id: 0,
        dash: [4, 2],
        layer: null,
        strokeRgb: [0, 0, 0],
        fill: false,
        widthMm: 0.5,
        clip: null,
      },
    ],
    texts: [],
    rasters: [],
    layers: [],
  };
};
const pose = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

it('preserves the common cut edge of distinct size loops across tiles', () => {
  const pages = [page(0, 0, 150, 120), page(1, 10, 130, 90), page(2, 10, 130, 90)];
  const result = placePages(pages.map((page) => ({ page, pose })));
  expect(result.paths.map((p) => p.closed)).toEqual([true, true]);
  expect(result.stats.wholeDuplicates).toBe(1);
  expect(result.stats.edgesDropped).toBe(0);
});

it('retains multiple shared edges only on a separately printed complete closed cut', () => {
  const outer = page(0, 0, 150, 120);
  const first = page(1, 10, 130, 80);
  const copy = page(2, 10, 130, 80);
  // Two bottom segments on the other size, four other original segments unique to this cut.
  for (const cut of [first, copy])
    cut.paths[0].pts = [
      [10, 0],
      [55, 0],
      [130, 0],
      [130, 40],
      [110, 80],
      [35, 80],
      [10, 40],
    ].map(([x, y]) => ({ x, y }));
  first.paths[0].visibleEdges = [[0, 3.5]];
  copy.paths[0].visibleEdges = [[3.5, 7]];
  const placed = [outer, first, copy].map((page) => ({ page, pose }));
  expect(placePages(placed).paths.map((p) => p.closed)).toEqual([true, true]);
  copy.paths[0].visibleEdges = [[4, 7]];
  expect(placePages(placed).paths.map((p) => p.closed)).toEqual([true, false]);
  copy.paths[0].visibleEdges = [[3.5, 7]];
  outer.paths[0].closed = false;
  expect(placePages(placed).paths.map((p) => p.closed)).toEqual([false, false]);
});

it('keeps the operation of each registered copy of a filled size stamp', () => {
  const first = page(0, 10, 12, 2);
  const copy = page(1, 10, 12, 2);
  for (const tile of [first, copy]) tile.styles[0].fill = true;
  copy.paths[0].src.op = 507;
  const { paths } = placePages([first, copy].map((page) => ({ page, pose })));
  expect(paths).toHaveLength(1);
  expect([paths[0].src, ...(paths[0].stampCopies ?? [])].map((s) => s.op).sort()).toEqual([
    10, 507,
  ]);
});

it('retains the full painted stamp when a shared edge is removed on the adjacent tile', () => {
  const clipped = page(0, 10, 12, 1);
  const complete = page(1, 10, 12, 2);
  for (const tile of [clipped, complete]) tile.styles[0].fill = true;
  for (const tile of [clipped, complete]) tile.paths[0].pts = tile.paths[0].pts.slice(0, 3);
  complete.paths[0].visibleMotif = true;
  const { paths } = placePages([clipped, complete].map((page) => ({ page, pose })));
  const fragments = paths.filter((p) => p.src.page === 1 && !p.closed);
  expect(fragments.filter((p) => p.printedGlyph)).toHaveLength(1);
  expect(fragments.find((p) => p.printedGlyph)?.printedGlyph).toEqual(complete.paths[0].pts);
});
