import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import type { PieceGeom, Pt2, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import type { FoldHint, StoredFold } from 'lib/folds';
import type { PieceDTO } from 'lib/nesting/types';
import { foldGroupsOf, openHints, rowsOfChoice } from './fold-model';
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

// Prod card 20, BP_OS_1_M: an outward fold down the middle, saved, then the piece was made fused.
// The source fingerprint moved, the server read the row back stale, and the picker hid it: a DXF
// hint drew itself in its place, with no remove, while the fold stayed on the card for good.
const KEY = '01BAGPANEL0000000000000001';
const piece: PieceGeom = segmentPiece({
  pieceKey: KEY,
  name: 'BP_OS_1_M',
  piece: {
    name: 'BP_OS_1_M',
    layer: '1',
    poly: [
      { x: 0, y: 0 },
      { x: 58, y: 0 },
      { x: 58, y: 128 },
      { x: 0, y: 128 },
    ],
  } as PieceDTO,
  piecesPerGarment: 1,
  cutSymmetry: null,
  cloth: null,
  fused: true,
} satisfies SkeletonPieceInput);
const middle: [Pt2, Pt2] = [
  [290, 1280],
  [290, 0],
];
const saved = (stale: boolean): StoredFold[] =>
  rowsOfChoice(
    piece,
    { line: middle, side: 1, kind: 'out', source: 'dxf' },
    { seq: 1, grainDeg: 0 },
  )!.map((row) => ({ ...row, stale }));
const hint: FoldHint = {
  id: 'mirror',
  lineMm: middle,
  source: 'dxf',
} as FoldHint;

describe('a stale fold in the picker', () => {
  it('the doll still leaves it out; the picker lays it, marked stale', () => {
    expect(foldGroupsOf(piece, saved(true), 0).groups).toHaveLength(0);
    const { groups } = foldGroupsOf(piece, saved(true), 0, undefined, { staleToo: true });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: 'out', stale: true });
    expect(
      foldGroupsOf(piece, saved(false), 0, undefined, { staleToo: true }).groups[0].stale,
    ).toBe(undefined);
  });

  it('shows one row with the saved kind on and remove — no hint in its place', () => {
    const rows = saved(true);
    const { groups } = foldGroupsOf(piece, rows, 0, undefined, { staleToo: true });
    const read: PieceRead = {
      geom: piece,
      deg: 0,
      inner: [],
      groups,
      hints: openHints([hint], groups),
      rows,
    };
    const html = renderToStaticMarkup(
      <FoldPicker
        read={read}
        cardId={20}
        frozen={false}
        size=''
        stepIndex={0}
        onClose={() => undefined}
      />,
    );
    expect(html.match(/data-fold-row=/g)).toHaveLength(1);
    expect(html).toContain('data-fold-remove');
    const pressed = html.match(/<button[^>]*data-fold-kind="[^"]+"[^>]*>/g) ?? [];
    expect(pressed.filter((chip) => chip.includes('aria-pressed="true"'))).toEqual([
      expect.stringContaining('data-fold-kind="out"'),
    ]);
  });
});
