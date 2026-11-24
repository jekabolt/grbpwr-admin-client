import { expect, it } from 'vitest';

import type { IRText } from '../types';
import { sizeLabelledFold } from './size-labelled-fold';
import { labelledFoldNotches } from './size-labelled-fold-notches';

const y = [120, 40, -50];
const sizes = ['S', 'M', 'L'].map((label) => ({ label }));
const chains = y.map((h) => ({
  pts: [
    { x: 0, y: h },
    { x: 54, y: h },
    { x: 65, y: 250 },
    { x: 0, y: 250 },
  ],
  closed: true,
}));
const candidates = chains.map((ch, rank) => ({
  rank,
  outer: ch.pts,
  walls: [rank],
  textsInside: [0],
}));
const text = (id: number, word: string, x: number, h: number): IRText => ({
  id,
  text: word,
  anchor: { x, y: h + 1 },
  bbox: { minX: x, maxX: x + 8, minY: h + 1, maxY: h + 4 },
  fontSizeMm: 3,
  rotationDeg: 0,
  layer: null,
  src: { file: '0', page: 1, op: id, sub: 0 },
});
const labels = [
  text(0, 'FOLD', 10, y[0]),
  ...sizes.map((s, i) => text(i + 1, 'SIZE ' + s.label, 30, y[i])),
];
const lines = { nearer: () => false, nearest: () => null };

it('reads each translated fold from its own closed, size-labelled cut', () => {
  const found = sizeLabelledFold(candidates, sizes, chains, labels, lines);
  expect([...found!.values()].map((e) => e.a.y)).toEqual(y);
});

it('requires an unambiguous complete size series on the same source page', () => {
  const run = (texts: IRText[]) => sizeLabelledFold(candidates, sizes, chains, texts, lines);
  expect(run(labels.slice(1))).toBeNull();
  expect(run(labels.slice(0, -1))).toBeNull();
  expect(run([...labels, { ...labels[1], id: 13 }])).toBeNull();
  expect(
    run(labels.map((t) => (t.id === 3 ? { ...t, src: { ...t.src, page: 3 } } : t))),
  ).toBeNull();
  expect(
    sizeLabelledFold(
      candidates,
      sizes,
      chains.map((ch, i) => ({ ...ch, closed: i !== 1 })),
      labels,
      lines,
    ),
  ).toBeNull();
});

it('keeps a proven corner notch with its own size when neighbouring cuts run across it', () => {
  const edges = sizeLabelledFold(candidates, sizes, chains, labels, lines)!;
  const ticks = y.map((h, id) => ({
    id,
    pts: [
      { x: 0, y: h },
      { x: 3, y: h + 3 },
    ],
    closed: false,
    ranges: [{ path: id, from: 0, to: 1 }],
    lengthMm: Math.sqrt(18),
  }));
  const notchClasses = [{ role: 'notch' as const, chains: [0, 1, 2] }];
  const assign = labelledFoldNotches(edges, candidates, { classes: notchClasses, chains: ticks })!;
  const all = ticks.map((_, i) => assign([], i)[0]);
  expect(assign(all, 1).map((f) => f.ranges[0].path)).toEqual([1]);
  expect(
    labelledFoldNotches(edges, candidates, { classes: notchClasses, chains: ticks.slice(1) }),
  ).toBeNull();
  expect(labelledFoldNotches(edges, candidates, { classes: [], chains: ticks })).toBeNull();
});
