import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import type { PieceGeom, Pt2, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import type { FoldKind, StoredFold } from 'lib/folds';
import type { PieceDTO } from 'lib/nesting/types';
import { foldGroupsOf, pleatDirectionRows, rowsOfPleat, detectPleatFans } from './fold-model';
import { FoldPicker, type PieceRead } from './fold-picker';
import { SectionSvg } from './fold-picture';
import { stepOfFold } from './fold-step';

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

const KEY = '01BACKPIECE000000000000001';
const apex: Pt2 = [285, 14];
const lines: [Pt2, Pt2][] = [
  [apex, [250, 662]],
  [apex, [285, 663]],
  [apex, [320, 662]],
];
const piece: PieceGeom = segmentPiece({
  pieceKey: KEY,
  name: 'BP',
  piece: {
    name: 'BP',
    layer: '1',
    poly: [
      { x: 0, y: 0 },
      { x: 56.9, y: 0 },
      { x: 56.9, y: 69.2 },
      { x: 0, y: 69.2 },
    ],
  } as PieceDTO,
  piecesPerGarment: 1,
  cutSymmetry: null,
  cloth: null,
  fused: false,
} satisfies SkeletonPieceInput);
const fan = detectPleatFans(
  lines.map((line, index) => ({ id: `line-${index}`, line, source: 'dxf' as const })),
)[0];
const rowsOf = (kind: FoldKind): StoredFold[] =>
  rowsOfPleat(piece, fan, { seq: 4, grainDeg: 0 })!.map((row) => ({ ...row, kind }));

describe('pleat direction in the picker', () => {
  it('reads all three kinds as one complete group, its direction off the centre row', () => {
    for (const kind of ['pleat', 'pleat_l', 'pleat_r'] as const) {
      const { groups } = foldGroupsOf(piece, rowsOf(kind), 0, lines);
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({ kind: 'pleat', complete: true, pleatKind: kind });
    }
  });

  it('keeps a lone directional row visible as a broken set', () => {
    const { groups } = foldGroupsOf(piece, rowsOf('pleat_r').slice(0, 1), 0, lines);
    expect(groups[0]).toMatchObject({ kind: 'pleat', complete: false });
  });

  it('a direction change keeps the row keys, their order and the step', () => {
    const rows = rowsOf('pleat');
    const group = foldGroupsOf(piece, rows, 0, lines).groups[0];
    const next = pleatDirectionRows(group, 'pleat_r');
    expect(next.map((row) => [row.foldKey, row.seq, row.line, row.source])).toEqual(
      group.rows.map((row) => [row.foldKey, row.seq, row.line, row.source]),
    );
    expect(next.every((row) => row.kind === 'pleat_r')).toBe(true);
    const operations = [{ foldKeys: rows.map((row) => row.foldKey) }, {}];
    for (const row of next) expect(stepOfFold(operations, row.foldKey)).toBe(0);
    expect(foldGroupsOf(piece, next, 0, lines).groups[0].pleatKind).toBe('pleat_r');
  });

  it('draws the approved section with no legend and no ticks', () => {
    const svg = renderToStaticMarkup(
      <SectionSvg
        piece={piece}
        groups={foldGroupsOf(piece, rowsOf('pleat_r'), 0, lines).groups}
        big
      />,
    );
    expect(svg).toContain('data-fold-section="pleat"');
    expect(svg).toContain('data-fold-section-kind="pleat_r"');
    expect(svg).toContain('M170 12 C180 12 180 24 170 24 L95 24');
    expect(svg).not.toContain('<text');
  });

  const read = (rows: StoredFold[]): PieceRead => ({
    geom: piece,
    deg: 0,
    inner: lines,
    groups: foldGroupsOf(piece, rows, 0, lines).groups,
    hints: [],
    rows,
  });
  const picker = (rows: StoredFold[]) =>
    renderToStaticMarkup(
      <FoldPicker
        read={read(rows)}
        cardId={1}
        frozen={false}
        size='M'
        stepIndex={0}
        onClose={() => undefined}
      />,
    );

  it('hides the chips when the pleat is off', () => {
    expect(picker([])).not.toContain('data-fold-pleat-dir');
  });

  it('shows the three direction chips between PLEAT and remove, one on', () => {
    const html = picker(rowsOf('pleat_l'));
    const at = (needle: string) => html.indexOf(needle);
    expect(at('data-fold-kind="pleat"')).toBeGreaterThan(-1);
    expect(at('data-fold-pleat-dir="pleat_l"')).toBeGreaterThan(at('data-fold-kind="pleat"'));
    expect(at('data-fold-pleat-dir="pleat"')).toBeGreaterThan(at('data-fold-pleat-dir="pleat_l"'));
    expect(at('data-fold-pleat-dir="pleat_r"')).toBeGreaterThan(at('data-fold-pleat-dir="pleat"'));
    expect(at('data-fold-remove')).toBeGreaterThan(at('data-fold-pleat-dir="pleat_r"'));
    const chips = html.match(/<button[^>]*data-fold-pleat-dir="[^"]+"[^>]*>/g) ?? [];
    expect(chips).toHaveLength(3);
    expect(chips.filter((chip) => chip.includes('aria-pressed="true"'))).toEqual([
      expect.stringContaining('data-fold-pleat-dir="pleat_l"'),
    ]);
  });
});
