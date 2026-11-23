import { expect, it } from 'vitest';

import type { IRPath, IRText, InternalFeature } from '../types';
import { sizeLabelledButtons } from './size-labelled-buttons';

const sizes = ['S', 'M', 'L'];
const outer = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 150 },
  { x: 0, y: 150 },
];
const text = (id: number, word: string, x: number, y: number): IRText => ({
  id,
  text: word,
  anchor: { x, y },
  bbox: { minX: x, maxX: x + 3, minY: y - 1, maxY: y + 1 },
  fontSizeMm: 2,
  rotationDeg: 0,
  layer: null,
  src: { file: '0', page: 0, op: id, sub: 0 },
});
const note = text(
  0,
  '+ MARKINGS INDICATE BUTTON PLACEMENT AND CENTER OF VERTICAL BUTTONHOLES',
  15,
  110,
);
const labels = [note];
const paths: IRPath[] = [];
const styles = sizes.map((_, id) => ({
  id,
  strokeRgb: [0, 0, 0] as [number, number, number],
  widthMm: 0.5,
  dash: [id + 1, 1],
  fill: false,
  clip: null,
  layer: null,
}));
for (const [row, base] of [25, 60, 80].entries()) {
  for (const [rank, size] of sizes.entries()) {
    const y = base + (row === 2 ? 0 : rank * 4),
      x = 20;
    if (row !== 2) labels.push(text(labels.length, size, x + 4, y));
    for (const pts of [
      [
        { x: x - 3, y },
        { x: x + 3, y },
      ],
      [
        { x, y: y - 3 },
        { x, y: y + 3 },
      ],
    ]) {
      const id = paths.length;
      paths.push({
        id,
        style: rank,
        pts,
        closed: false,
        src: { file: '0', page: 0, op: id, sub: 0 },
      });
    }
  }
}
const read = (texts: IRText[], strokes = paths) =>
  sizeLabelledButtons(
    sizes.map((_, rank) => ({ rank, outer, textsInside: texts.map((t) => t.id) })),
    sizes,
    { paths: strokes, styles, texts },
    { chains: [] },
  );
const existing: InternalFeature = {
  kind: 'internal',
  pts: paths[0].pts,
  closed: false,
  confidence: 1,
  origin: 'detected',
  ranges: [{ path: 0, from: 0, to: 1 }],
};
it('assigns each complete printed plus to its own grade while keeping the overprinted shared mark', () => {
  const assigned = read(labels)!;
  const operator = { ...existing, origin: 'operator' as const };
  const foreign = { ...existing, ranges: [{ path: 99, from: 0, to: 1 }] };
  expect(assigned([existing, operator, foreign], 1)).toEqual([
    operator,
    foreign,
    ...[2, 3, 8, 9, 14, 15].map((path) =>
      expect.objectContaining({
        kind: 'internal',
        pts: paths[path].pts,
        ranges: [{ path, from: 0, to: 1 }],
      }),
    ),
  ]);
});
it('requires printed button instructions, two independently labelled rows and confirmation of every grade', () => {
  expect(read(labels.slice(1))).toBeNull();
  expect(read(labels.filter((t) => t.id < 4))).toBeNull();
  expect(read(labels.filter((t) => t.text !== 'M'))).toBeNull();
  expect(read(labels.filter((t) => t.id !== 2))?.([], 1)).toHaveLength(6);
  expect(
    read(
      labels,
      paths.map((p) => (p.id === 8 ? { ...p, style: 0 } : p)),
    ),
  ).toBeNull();
});

it('keeps clipped, ambiguous or operator-assigned arms out of grade proofs', () => {
  const cands = sizes.map((_, rank) => ({ rank, outer, textsInside: labels.map((t) => t.id) }));
  const blocked = sizeLabelledButtons(
    cands,
    sizes,
    { paths, styles, texts: labels },
    {
      assigned: [{ chain: 1, classes: [0] }],
      chains: [
        {
          id: 1,
          pts: paths[0].pts,
          ranges: [{ path: 0, from: 0, to: 1 }],
          style: 0,
          closed: false,
          lengthMm: 6,
          motif: null,
        },
      ],
    },
  );
  expect(blocked).toBeNull();
  const clipped = styles.map((s) => ({ ...s, clip: 'c11:18,0,24,130' }));
  expect(
    sizeLabelledButtons(cands, sizes, { paths, styles: clipped, texts: labels }, { chains: [] }),
  ).toBeNull();
});
