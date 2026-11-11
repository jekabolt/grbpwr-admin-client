import { describe, expect, it } from 'vitest';

import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import type { PieceGeom, Pt2, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import type { StoredFold } from 'lib/folds';
import type { PieceDTO } from 'lib/nesting/types';
import { detectPleatFans, foldGroupsOf, rowsOfChoice, type PickKind } from './fold-model';
import {
  drawnLineRefusal,
  FOLD_LINE_REFUSAL,
  FOLD_ORDER_REFUSAL,
  FOLD_SAME_REFUSAL,
  planKindChange,
  planNewFold,
  planPleat,
  type FoldPlanCtx,
} from './fold-plan';
import { FOLD_MAX_SEQ, placeFolds } from './fold-seq';
import { foldStepBlocked } from './fold-step';

// A cuff 600 × 1300 mm; folds run straight across it.
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
const fold = (y: number, seq: number, kind: PickKind = 'in'): StoredFold[] =>
  rowsOfChoice(piece, { line: across(y), side: 1, kind, source: 'owner' }, { seq, grainDeg: 0 })!;

const ctxOf = (
  rows: StoredFold[],
  operations: { foldKeys?: string[] }[],
  stepIndex?: number,
): FoldPlanCtx => ({ geom: piece, deg: 0, size: 'M', rows, operations, stepIndex });

const plan = <T>(p: T) => {
  if (p && typeof p === 'object' && 'refused' in p) throw new Error(`refused ${String(p.refused)}`);
  return p as Exclude<T, { refused: unknown }>;
};

const seqsAfter = (rows: StoredFold[], upsert: StoredFold[], remove: StoredFold[] = []) => {
  const written = new Map(upsert.map((r) => [r.foldKey, r]));
  const gone = new Set(remove.map((r) => r.foldKey));
  const kept = rows.filter((r) => !gone.has(r.foldKey)).map((r) => written.get(r.foldKey) ?? r);
  const all = [...kept, ...upsert.filter((r) => !kept.some((k) => k.foldKey === r.foldKey))];
  return all;
};

describe('D2: a freed place is taken again', () => {
  it('16 created and 15 removed: the next fold still fits (max + 1 was 17, refused)', () => {
    const left = fold(100, 16);
    const p = plan(
      planNewFold(ctxOf(left, []), { line: across(400), kind: 'in', source: 'owner' }),
    );
    expect(p.upsert.every((row) => row.seq >= 1 && row.seq <= FOLD_MAX_SEQ)).toBe(true);
    const all = seqsAfter(left, p.upsert);
    expect(new Set(all.map((r) => r.seq)).size).toBe(all.length);
  });

  it('a piece with 16 folds refuses the 17th before writing', () => {
    const rows = Array.from({ length: 16 }, (_, i) => fold(50 + i * 70, i + 1)).flat();
    expect(
      planNewFold(ctxOf(rows, []), { line: across(1250), kind: 'in', source: 'owner' }),
    ).toEqual({ refused: ['16 folds max', 'remove a fold first'] });
  });

  it('a fold picked on a middle step goes between the folds of earlier and later steps', () => {
    const a = fold(100, 1);
    const b = fold(300, 2);
    const ops = [{ foldKeys: [a[0].foldKey] }, {}, { foldKeys: [b[0].foldKey] }];
    const p = plan(
      planNewFold(ctxOf([...a, ...b], ops, 1), { line: across(200), kind: 'in', source: 'owner' }),
    );
    expect(p.link?.step).toBe(1);
    const all = seqsAfter([...a, ...b], p.upsert);
    const seqOf = (key: string) => all.find((r) => r.foldKey === key)!.seq;
    const fresh = p.link!.keys[0];
    expect(seqOf(a[0].foldKey)).toBeLessThan(seqOf(fresh));
    expect(seqOf(fresh)).toBeLessThan(seqOf(b[0].foldKey));
  });

  it('room is made by moving later rows, never by touching a stale one', () => {
    const rows = [{ ...fold(100, 1)[0] }, { ...fold(300, 2)[0], stale: true }];
    expect(placeFolds(rows, { count: 1, replaced: [rows[0].foldKey] })).toEqual({
      seqs: [1],
      moved: [],
    });
    expect(placeFolds(rows, { count: 2, replaced: [rows[0].foldKey] })).toEqual({
      refused: 'stale',
    });
  });
});

describe('D3: a kind change keeps the fold in its place and on its step', () => {
  // seq 1 closes on step 0, seq 2 on step 1. Single → double used to write seq 3–4 back on step 0:
  // the next card save was refused (fold_order) and the old row was already deleted.
  it('single → double: one write, the old key kept, the later fold moved up, the order holds', () => {
    const a = fold(100, 1);
    const b = fold(400, 2);
    const ops = [{ foldKeys: [a[0].foldKey] }, { foldKeys: [b[0].foldKey] }];
    const rows = [...a, ...b];
    const group = foldGroupsOf(piece, rows, 0).groups.find((g) =>
      g.rows.some((r) => r.foldKey === a[0].foldKey),
    )!;
    // The bug as it was: new keys at max + 1 (3, 4) put back on step 0 read the piece out of order.
    const old = fold(100, 3, 'double');
    const oldOps = [{ foldKeys: old.map((r) => r.foldKey) }, { foldKeys: [b[0].foldKey] }];
    expect(foldStepBlocked(oldOps, [...b, ...old], old[0].foldKey, 0)).toBe(true);

    const p = plan(planKindChange(ctxOf(rows, ops, 1), group, 'double'));
    expect(p.remove).toEqual([]);
    expect(p.upsert.map((r) => r.foldKey)).toContain(a[0].foldKey);
    expect(p.link?.step).toBe(0);
    const all = seqsAfter(rows, p.upsert);
    expect(all.find((r) => r.foldKey === b[0].foldKey)!.seq).toBe(3);
    expect(p.upsert.filter((r) => p.link!.keys.includes(r.foldKey)).map((r) => r.seq)).toEqual([
      1, 2,
    ]);
    const next = [{ foldKeys: p.link!.keys }, { foldKeys: [b[0].foldKey] }];
    for (const key of p.link!.keys) expect(foldStepBlocked(next, all, key, 0)).toBe(false);
  });

  it('double → single: the first key stays where it was, the second goes after the write', () => {
    const d = fold(200, 1, 'double');
    const b = fold(600, 3);
    const rows = [...d, ...b];
    const ops = [{ foldKeys: d.map((r) => r.foldKey) }, { foldKeys: [b[0].foldKey] }];
    const group = foldGroupsOf(piece, rows, 0).groups.find((g) => g.kind === 'double')!;
    const p = plan(planKindChange(ctxOf(rows, ops), group, 'in'));
    expect(p.upsert.map((r) => [r.foldKey, r.seq])).toEqual([[d[0].foldKey, 1]]);
    expect(p.remove.map((r) => r.foldKey)).toEqual([d[1].foldKey]);
    expect(p.link).toEqual({ keys: [d[0].foldKey], step: 0 });
  });

  it('a step already out of order is refused before anything is written', () => {
    const a = fold(100, 1);
    const b = fold(400, 2);
    // b closes on step 0, before a's step 1: a cannot keep step 1 as a double either.
    const ops = [{ foldKeys: [b[0].foldKey] }, { foldKeys: [a[0].foldKey] }];
    const rows = [...a, ...b];
    const group = foldGroupsOf(piece, rows, 0).groups.find((g) =>
      g.rows.some((r) => r.foldKey === a[0].foldKey),
    )!;
    expect(planKindChange(ctxOf(rows, ops), group, 'double')).toEqual({
      refused: FOLD_ORDER_REFUSAL,
    });
  });
});

describe('D3: the upsert itself passes the order check', () => {
  // A fan of three lines from one point on the cuff's left edge. A (seq 1, step 0) and C (seq 3, step 2) lie on it;
  // B (seq 2, step 1) does not. The pleat reuses C at seq 2 and moves B to 4 — while the upsert runs C
  // still closes on step 2 and B on step 1, so the server refuses the call.
  const ray = (s: number): [Pt2, Pt2] => [
    [0, 300],
    [600, 300 + 600 * s],
  ];
  it('a pleat that would be refused mid-write is refused before writing', () => {
    const a = rowsOfChoice(
      piece,
      { line: ray(-0.2), side: 1, kind: 'in', source: 'owner' },
      { seq: 1, grainDeg: 0 },
    )!;
    const b = rowsOfChoice(
      piece,
      {
        line: [
          [0, 900],
          [600, 1100],
        ],
        side: 1,
        kind: 'in',
        source: 'owner',
      },
      { seq: 2, grainDeg: 0 },
    )!;
    const c = rowsOfChoice(
      piece,
      { line: ray(0), side: 1, kind: 'in', source: 'owner' },
      { seq: 3, grainDeg: 0 },
    )!;
    const rows = [...a, ...b, ...c];
    const ops = [
      { foldKeys: [a[0].foldKey] },
      { foldKeys: [b[0].foldKey] },
      { foldKeys: [c[0].foldKey] },
    ];
    const groups = foldGroupsOf(piece, rows, 0).groups;
    const groupOf = (key: string) => groups.find((g) => g.rows.some((r) => r.foldKey === key))!;
    const [fan] = detectPleatFans([
      { id: 'a', line: ray(-0.2), source: 'owner', group: groupOf(a[0].foldKey) },
      { id: 'm', line: ray(-0.1), source: 'owner' },
      { id: 'c', line: ray(0), source: 'owner', group: groupOf(c[0].foldKey) },
    ]);
    expect(fan).toBeDefined();
    expect(
      planPleat(ctxOf(rows, ops), fan, [groupOf(a[0].foldKey), groupOf(c[0].foldKey)]),
    ).toEqual({ refused: FOLD_ORDER_REFUSAL });
    // Without B on a middle step the same pleat goes through.
    const free = [{ foldKeys: [a[0].foldKey] }, {}, { foldKeys: [c[0].foldKey] }];
    expect(
      'refused' in
        planPleat(ctxOf(rows, free), fan, [groupOf(a[0].foldKey), groupOf(c[0].foldKey)]),
    ).toBe(false);
  });
});

describe('D4: a bad line is refused before it is written, the drawing stays', () => {
  // An L: 600 wide at the bottom, 200 wide above y = 500. A chord from the top arm to the foot
  // crosses the empty corner.
  const ell: PieceGeom = segmentPiece({
    pieceKey: '01ELLPIECE0000000000000001',
    name: 'ELL',
    piece: {
      name: 'ELL',
      layer: '1',
      poly: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 50 },
        { x: 20, y: 50 },
        { x: 20, y: 130 },
        { x: 0, y: 130 },
      ],
    } as PieceDTO,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  } satisfies SkeletonPieceInput);

  it('a chord through the empty corner of a concave piece', () => {
    expect(
      drawnLineRefusal(
        ell,
        [
          [200, 1000],
          [600, 200],
        ],
        [],
      ),
    ).toEqual(FOLD_LINE_REFUSAL);
    expect(
      drawnLineRefusal(
        ell,
        [
          [0, 300],
          [600, 300],
        ],
        [],
      ),
    ).toBeNull();
  });

  it('a line lying on the contour', () => {
    expect(
      drawnLineRefusal(
        ell,
        [
          [0, 0],
          [600, 0],
        ],
        [],
      ),
    ).toEqual(FOLD_LINE_REFUSAL);
    expect(
      drawnLineRefusal(
        piece,
        [
          [600, 100],
          [600, 900],
        ],
        [],
      ),
    ).toEqual(FOLD_LINE_REFUSAL);
  });

  it('a short chord across a small corner is a fold', () => {
    // 40 mm across the foot's corner: points near the ends sit under 1 mm from the contour.
    expect(
      drawnLineRefusal(
        ell,
        [
          [560, 0],
          [600, 30],
        ],
        [],
      ),
    ).toBeNull();
  });

  it('the same line as a saved fold (it printed as a double fold)', () => {
    const rows = fold(400, 1);
    const groups = foldGroupsOf(piece, rows, 0).groups;
    expect(
      drawnLineRefusal(
        piece,
        [
          [600, 402],
          [0, 398],
        ],
        groups,
      ),
    ).toEqual(FOLD_SAME_REFUSAL);
    expect(drawnLineRefusal(piece, across(500), groups)).toBeNull();
  });
});
