import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import type { PieceGeom, Pt2, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import type { StoredFold } from 'lib/folds';
import type { PieceDTO } from 'lib/nesting/types';
import { removeFoldRows } from './fold-execute';
import { foldGroupsOf, rowsOfChoice, type PickKind } from './fold-model';
import { FoldPicker, type PieceRead } from './fold-picker';

vi.mock('./use-fold-writes', () => ({
  useFoldWrites: () => ({
    upsert: async () => true,
    remove: async () => true,
    replace: async () => true,
  }),
}));
vi.mock('./fold-step', async (original) => ({
  ...(await original<typeof import('./fold-step')>()),
  useFoldStep: () => ({ operations: [], assign: () => undefined }),
}));

// A cuff 600 × 1300 mm with folds across it at seq 1, 2, 3. After a re-upload the edge seq 2 was
// tied to is gone: it resolves nowhere, and the picker used to drop it from the list entirely.
const piece: PieceGeom = segmentPiece({
  pieceKey: '01CUFFPIECE000000000000001',
  name: 'CUFF',
  piece: {
    name: 'CUFF',
    layer: '1',
    poly: [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 130 },
      { x: 0, y: 130 },
    ],
  } as PieceDTO,
  piecesPerGarment: 1,
  cutSymmetry: null,
  cloth: null,
  fused: false,
} satisfies SkeletonPieceInput);

const across = (y: number): [Pt2, Pt2] => [
  [0, y],
  [600, y],
];
const fold = (y: number, seq: number, kind: PickKind): StoredFold =>
  rowsOfChoice(
    piece,
    { line: across(y), side: 1, kind, source: 'owner' },
    { seq, grainDeg: 0 },
  )![0];

const lost: StoredFold = {
  ...fold(600, 2, 'in'),
  edge: { hint: '', samples: Array.from({ length: 5 }, () => [5, 5] as Pt2), offsetMm: 30 },
};
const rows = [fold(200, 1, 'out'), lost, fold(1000, 3, 'in')];

const render = () => {
  const { groups } = foldGroupsOf(piece, rows, 0, undefined, { staleToo: true });
  const read: PieceRead = { geom: piece, deg: 0, inner: [], groups, hints: [], rows };
  return renderToStaticMarkup(
    <FoldPicker
      read={read}
      cardId={1}
      frozen={false}
      size='M'
      stepIndex={0}
      onClose={() => undefined}
    />,
  );
};

describe('D6: a lost fold in the picker', () => {
  it('stands as row 2 between folds 1 and 3: not found, re-pick, remove, no kind chips', () => {
    const html = render();
    expect([...html.matchAll(/data-fold-row="(\d+)"/g)].map((m) => m[1])).toEqual(['1', '2', '3']);
    const start = html.indexOf('data-fold-row="2"');
    const end = html.indexOf('data-fold-row="3"');
    const row2 = html.slice(start, end);
    expect(row2).toContain('data-fold-lost');
    expect(row2).toContain('>not found<');
    expect(row2).toContain('>re-pick<');
    expect(row2).toContain('>remove<');
    expect(row2).not.toContain('data-fold-kind');
    expect(html.match(/data-fold-lost/g)).toHaveLength(1);
    // The other rows keep their kind chips.
    expect(html.slice(0, start)).toContain('data-fold-kind="out"');
    expect(html.slice(end)).toContain('data-fold-kind="in"');
  });

  it('remove on the lost row removes that row and lets its step go of the key', async () => {
    const remove = vi.fn(async () => true);
    const assign = vi.fn();
    expect(await removeFoldRows([lost], remove, assign)).toBe(true);
    expect(remove).toHaveBeenCalledWith([lost]);
    expect(assign).toHaveBeenCalledWith([lost.foldKey], null);

    const failed = vi.fn(async () => false);
    const untouched = vi.fn();
    expect(await removeFoldRows([lost], failed, untouched)).toBe(false);
    expect(untouched).not.toHaveBeenCalled();
  });
});
