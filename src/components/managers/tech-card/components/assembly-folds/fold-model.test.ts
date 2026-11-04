import { describe, expect, it } from 'vitest';

import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import type { Pt2, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import type { FoldHint, StoredFold } from 'lib/folds';
import { sideOf } from 'lib/folds';
import type { PieceDTO } from 'lib/nesting/types';
import {
  detectPleatFans,
  foldGroupsOf,
  openHints,
  rowsOfPleat,
  type PleatLine,
} from './fold-model';

const KEY = '01BACKPIECE000000000000001';
const apex: Pt2 = [285, 14];
const lines: [Pt2, Pt2][] = [
  [apex, [250, 662]],
  [apex, [285, 663]],
  [apex, [320, 662]],
  [
    [0, 0],
    [285, 32],
  ],
  [
    [569, 0],
    [285, 32],
  ],
];

const piece = segmentPiece({
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

const hint = (line: [Pt2, Pt2], index: number): FoldHint => ({
  id: `${KEY}:inner:${index}`,
  pieceKey: KEY,
  origin: 'inner',
  strength: 'strong',
  source: 'dxf',
  lineMm: line,
  line: [
    [line[0][0] / 569, line[0][1] / 692],
    [line[1][0] / 569, line[1][1] / 692],
  ],
  edge: null,
});

const candidates = lines.map(
  (line, index): PleatLine => ({ id: `line-${index + 1}`, line, source: 'dxf' }),
);

describe('detectPleatFans', () => {
  it('finds BP lines 1, 2, 3 and rejects lines 4, 5', () => {
    const fans = detectPleatFans(candidates);
    expect(fans).toHaveLength(1);
    expect(fans[0].lines.map((line) => line.id)).toEqual(['line-1', 'line-2', 'line-3']);
    expect(fans[0].apex).toEqual(apex);
  });

  it('rejects three lines without one apex or symmetric outer angles', () => {
    expect(
      detectPleatFans([
        candidates[0],
        {
          ...candidates[1],
          line: [
            [280, 14],
            [300, 663],
          ],
        },
        candidates[2],
      ]),
    ).toEqual([]);
    expect(
      detectPleatFans([
        candidates[0],
        candidates[1],
        { ...candidates[2], line: [apex, [380, 662]] },
      ]),
    ).toEqual([]);
  });
});

describe('PLEAT stored group', () => {
  const fan = detectPleatFans(candidates)[0];

  it('writes three consecutive rows with off-line flip points', () => {
    const rows = rowsOfPleat(piece, fan, { seq: 7, grainDeg: 0, anchoredSize: 'M' });
    expect(rows?.map((row) => [row.seq, row.kind])).toEqual([
      [7, 'pleat'],
      [8, 'pleat'],
      [9, 'pleat'],
    ]);
    expect(rows).toHaveLength(3);
    if (!rows) throw new Error('pleat rows missing');
    for (const row of rows) {
      const a: Pt2 = [row.line[0][0] * 569, row.line[0][1] * 692];
      const b: Pt2 = [row.line[1][0] * 569, row.line[1][1] * 692];
      const p: Pt2 = [row.flipAt[0] * 569, row.flipAt[1] * 692];
      expect(
        Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])),
      ).toBeGreaterThan(1);
    }
    const centreFar = fan.lines[1].line[1];
    const firstWedgeSide = sideOf(fan.lines[0].line[0], fan.lines[0].line[1], centreFar);
    const firstFlip: Pt2 = [rows[0].flipAt[0] * 569, rows[0].flipAt[1] * 692];
    expect(sideOf(fan.lines[0].line[0], fan.lines[0].line[1], firstFlip)).toBe(-firstWedgeSide);
  });

  it('reads three rows as one group and drops all three open hints', () => {
    const rows = rowsOfPleat(piece, fan, { seq: 1, grainDeg: 0 })!;
    const { groups, unresolved } = foldGroupsOf(piece, rows, 0, lines.slice(0, 3));
    expect(unresolved).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: 'pleat', rows: [{ seq: 1 }, { seq: 2 }, { seq: 3 }] });
    expect(groups[0].line).toEqual(lines[1]);
    expect(openHints(lines.slice(0, 3).map(hint), groups)).toEqual([]);
  });

  it('keeps a broken set visible and removable', () => {
    const rows = rowsOfPleat(piece, fan, { seq: 1, grainDeg: 0 })!;
    const broken = [rows[0], rows[2]];
    const { groups } = foldGroupsOf(piece, broken, 0, lines.slice(0, 3));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: 'pleat', complete: false });
    expect(groups[0].rows).toHaveLength(2);
    expect(
      groups
        .flatMap((group) => group.rows)
        .map((row) => row.foldKey)
        .sort(),
    ).toEqual(broken.map((row) => row.foldKey).sort());
    expect(groups.every((group) => group.kind === 'pleat')).toBe(true);
  });

  it('round trips on and remove through hints', () => {
    const hints = lines.slice(0, 3).map(hint);
    const offered = detectPleatFans(
      hints.map((item) => ({ id: item.id, line: item.lineMm, source: item.source })),
    );
    const saved = rowsOfPleat(piece, offered[0], { seq: 1, grainDeg: 0 })!;
    const on = foldGroupsOf(piece, saved, 0, lines.slice(0, 3)).groups;
    expect(openHints(hints, on)).toEqual([]);

    const removed: StoredFold[] = [];
    const off = foldGroupsOf(piece, removed, 0, lines.slice(0, 3)).groups;
    const restored = openHints(hints, off);
    expect(restored).toHaveLength(3);
    expect(
      detectPleatFans(
        restored.map((item) => ({ id: item.id, line: item.lineMm, source: item.source })),
      ),
    ).toHaveLength(1);
  });
});
