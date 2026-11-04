import { describe, expect, it } from 'vitest';

import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import type { StoredFold } from 'lib/folds/types';
import type { StoredSeam } from 'lib/seams/types';

import { hemDepthOf, hemFoldsOf, hemSigOf, isHemStep, type HemStepLike } from './hem-folds';

/** A rectangle 200 wide, 300 tall, its loop split into runs: bottom, right, top, left. */
function rect(
  key: string,
  name: string,
  w = 200,
  h = 300,
  bottom: Pt2[] = [
    [0, 0],
    [w, 0],
  ],
): PieceGeom {
  const runs: Pt2[][] = [
    bottom,
    [bottom[bottom.length - 1], [w, h]],
    [
      [w, h],
      [0, h],
    ],
    [[0, h], bottom[0]],
  ];
  const rs: Pt2[] = [];
  const edges = runs.map((pts, index): Edge => {
    const s = rs.length;
    pts.slice(0, -1).forEach((point) => rs.push(point));
    const lenMm = pts
      .slice(1)
      .reduce(
        (sum, point, at) => sum + Math.hypot(point[0] - pts[at][0], point[1] - pts[at][1]),
        0,
      );
    return {
      id: `${key}#${index}`,
      s,
      e: s + pts.length - 1,
      pts,
      lenMm,
      notchesMm: [],
      turnDeg: 0,
    } as unknown as Edge;
  });
  return { pieceKey: key, name, rs, edges, notchIdx: [], corners: [] } as unknown as PieceGeom;
}

const stored = (over: Partial<StoredFold>): StoredFold => ({
  foldKey: 'F1',
  pieceKey: 'P',
  seq: 1,
  kind: 'inward',
  source: 'owner',
  line: [
    [0, 0.1],
    [1, 0.1],
  ],
  flipAt: [0.5, 0.05],
  edge: null,
  contourSig: '',
  anchoredSize: 'M',
  note: '',
  stale: false,
  ...over,
});

const seam = (key: string, edge: string, piece = 'P'): StoredSeam =>
  ({
    seamKey: key,
    status: 'confirmed',
    kind: 'edge',
    direction: 'unknown',
    source: 'manual',
    sideA: [
      {
        piece,
        edgeHint: edge,
        range: [0, 1],
        samples: [],
        perimShare: 0,
        lenMm: 0,
        notches: 0,
        turnDeg: 0,
        contourSig: '',
      },
    ],
    sideB: [],
    anchoredSize: 'M',
    note: '',
    stale: false,
    updatedAt: '',
  }) as unknown as StoredSeam;

const HEM: HemStepLike = {
  operationNumber: 10,
  work: 'hem_turned',
  inputKeys: ['P'],
  seamAllowanceMm: '35',
};
const run = (ops: HemStepLike[], over: Partial<Parameters<typeof hemFoldsOf>[0]> = {}) =>
  hemFoldsOf({ ops, pieces: [rect('P', 'FRONT')], seams: [], storedFolds: [], ...over });

describe('isHemStep', () => {
  it('recognises the step by each of the three signs, none needed but one', () => {
    expect(isHemStep({ work: 'hem_turned' })).toBe(true);
    expect(isHemStep({ work: 'moscow_hem' })).toBe(true);
    expect(isHemStep({ seamKind: 'hem_closed', seamClass: 'ss_plain' })).toBe(true);
    expect(isHemStep({ seamClass: 'ef_hem_turned' })).toBe(true);
    expect(isHemStep({ seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW' })).toBe(true);
    expect(isHemStep({ work: 'join_lockstitch', seamClass: 'ss_plain', seamKind: 'plain' })).toBe(
      false,
    );
  });
  it.each([
    [{ work: 'hem_turned' }],
    [{ seamKind: 'blind_hem' }],
    [{ seamClass: 'ef_hem_turned' }],
  ])('each sign alone gives the fold: %j', (sign) => {
    const out = run([{ inputKeys: ['P'], seamAllowanceMm: '35', ...sign }]);
    expect(out.folds.P).toHaveLength(1);
  });
});

describe('depth', () => {
  it('keeps a real 0, inherits only an empty step', () => {
    expect(hemDepthOf({ seamAllowanceMm: '0' }, '7')).toBe(0);
    expect(hemDepthOf({ seamAllowanceMm: 0 }, '7')).toBe(0);
    expect(hemDepthOf({ seamAllowanceMm: '' }, '7')).toBe(7);
    expect(hemDepthOf({ seamAllowanceMm: '35.0' }, '7')).toBe(35);
    expect(hemDepthOf({ seamAllowanceMm: '' }, '')).toBeNull();
  });
  it('0 and none give a line and no fold', () => {
    const zero = run([{ ...HEM, seamAllowanceMm: '0' }], { standardMm: '7' });
    expect(zero.folds).toEqual({});
    expect(zero.words).toEqual(['Hem step 10: allowance 0 mm, nothing to turn']);
    const none = run([{ ...HEM, seamAllowanceMm: '' }]);
    expect(none.folds).toEqual({});
    expect(none.words[0]).toMatch(/no allowance/);
  });
  it('an empty step folds at the card standard', () => {
    const out = run([{ ...HEM, seamAllowanceMm: '' }], { standardMm: '7' });
    expect(out.applied[0].depthMm).toBe(7);
    expect(out.folds.P[0].a[1]).toBeCloseTo(7 / 300, 6);
  });
});

describe('the fold', () => {
  it('lies parallel to the hem at the depth, turning the hem side inward', () => {
    const { folds, applied, words } = run([HEM]);
    expect(words).toEqual([]);
    const fold = folds.P[0];
    expect(fold.kind).toBe('inward');
    expect(fold.a[1]).toBeCloseTo(35 / 300, 6);
    expect(fold.b[1]).toBeCloseTo(35 / 300, 6);
    expect(Math.abs(fold.b[0] - fold.a[0])).toBeCloseTo(1, 6);
    expect(fold.flipAt[1]).toBeLessThan(fold.a[1]);
    expect(applied[0]).toMatchObject({
      step: 10,
      depthMm: 35,
      cutLenMm: 200,
      finishedLenMm: 200,
      turned: [35, 35],
    });
  });

  it('gives the same result whatever the piece is called', () => {
    const named = run([HEM], { pieces: [rect('P', 'HEM_LEFT_FRONT')] });
    const other = run([HEM], { pieces: [rect('P', 'XX')] });
    expect(named.folds).toEqual(other.folds);
    expect(named.applied).toEqual(other.applied);
  });

  it('computes each size from that size', () => {
    const small = run([HEM], { pieces: [rect('P', 'FRONT', 180, 280)] }).folds.P[0];
    const large = run([HEM], { pieces: [rect('P', 'FRONT', 220, 320)] }).folds.P[0];
    expect(small.a[1]).toBeCloseTo(35 / 280, 6);
    expect(large.a[1]).toBeCloseTo(35 / 320, 6);
  });

  it('says the curve in numbers, the depth kept at both ends', () => {
    const arc: Pt2[] = [
      [0, 10],
      [100, 0],
      [200, 10],
    ];
    const out = run([HEM], { pieces: [rect('P', 'FRONT', 200, 300, arc)] });
    expect(out.folds.P).toHaveLength(1);
    expect(out.words[0]).toMatch(
      /Hem step 10, FRONT: the hem curves, the straight crease turns 35\.0 to 45\.0 mm/,
    );
  });

  it('refuses a curve no straight crease can stand for, in words', () => {
    const deep: Pt2[] = [
      [0, 50],
      [100, 0],
      [200, 50],
    ];
    const out = run([HEM], { pieces: [rect('P', 'FRONT', 200, 300, deep)] });
    expect(out.folds).toEqual({});
    expect(out.words[0]).toMatch(/not folded/);
    expect(out.words[0]).toMatch(/\d+\.\d mm/);
  });
});

describe('the edge', () => {
  it('unknown gives a line naming the step and the reason, and no fold', () => {
    const none = run([{ ...HEM, inputKeys: ['NOPE'] }]);
    expect(none.folds).toEqual({});
    expect(none.words).toEqual([
      'Hem step 10: hem edge unknown, no input piece on this size, not folded',
    ]);
    const taken = run([HEM], { seams: [seam('S', 'P#0')] });
    expect(taken.folds).toEqual({});
    expect(taken.words[0]).toMatch(/no free edge at the bottom/);
    const unit = run(
      [
        { operationNumber: 5, inputKeys: ['P', 'Q'], outputUnitKey: 'BODY' },
        { ...HEM, inputKeys: ['BODY'] },
      ],
      { pieces: [rect('P', 'A'), rect('Q', 'B')] },
    );
    expect(unit.folds).toEqual({});
    expect(unit.words[0]).toMatch(/more than one edge could be the hem/);
  });

  it('expands a unit into its pieces', () => {
    const out = run([
      { operationNumber: 5, inputKeys: ['P'], outputUnitKey: 'BODY' },
      { ...HEM, inputKeys: ['BODY'] },
    ]);
    expect(out.folds.P).toHaveLength(1);
  });

  it('a step row naming the edge wins over the bottom', () => {
    const out = run([{ ...HEM, seamKeys: ['S'] }], { seams: [seam('S', 'P#2')] });
    expect(out.folds.P[0].a[1]).toBeCloseTo(1 - 35 / 300, 6);
    expect(out.folds.P[0].flipAt[1]).toBeGreaterThan(out.folds.P[0].a[1]);
  });

  it('a pleat takes no edge', () => {
    const pleat = stored({
      kind: 'pleat',
      line: [
        [0, 0.05],
        [1, 0.05],
      ],
    });
    expect(run([HEM], { storedFolds: [pleat], laid: {} }).folds.P).toHaveLength(1);
  });
});

describe('with stored folds', () => {
  const near = stored({
    line: [
      [0, 0.1],
      [1, 0.1],
    ],
  });
  const laid = {
    P: [{ seq: 1, a: near.line[0], b: near.line[1], flipAt: near.flipAt, kind: 'inward' as const }],
  };

  it('an explicit fold on the edge wins, no double fold, its own step or another', () => {
    for (const foldKeys of [[], ['F1']]) {
      const out = run([{ ...HEM, foldKeys }], { storedFolds: [near], laid });
      expect(out.folds.P).toEqual(laid.P);
      expect(out.applied).toEqual([]);
      expect(out.words).toEqual(['Hem step 10, FRONT: a stored fold already turns this edge']);
    }
  });

  it('keeps the order of the steps, stored rows keep their seq', () => {
    const side = stored({
      foldKey: 'A',
      seq: 1,
      line: [
        [0.9, 0],
        [0.9, 1],
      ],
      flipAt: [0.95, 0.5],
    });
    const late = stored({
      foldKey: 'B',
      seq: 2,
      line: [
        [0.1, 0],
        [0.1, 1],
      ],
      flipAt: [0.05, 0.5],
    });
    const folds = {
      P: [side, late].map((row) => ({
        seq: row.seq,
        a: row.line[0],
        b: row.line[1],
        flipAt: row.flipAt,
        kind: row.kind,
      })),
    };
    const out = run(
      [
        { operationNumber: 5, inputKeys: ['P'], foldKeys: ['A'] },
        HEM,
        { operationNumber: 20, inputKeys: ['P'], foldKeys: ['B'] },
      ],
      { storedFolds: [side, late], laid: folds },
    );
    expect(out.folds.P.map((fold) => fold.seq)).toEqual([1, 1.5, 2]);
    expect(out.folds.P[1].kind).toBe('inward');
    expect(out.folds.P[1].a[1]).toBeCloseTo(35 / 300, 6);
    expect(out.applied[0].seq).toBe(1.5);
  });

  it('a second hem step on the same edge folds nothing more', () => {
    const out = run([HEM, { ...HEM, operationNumber: 20 }]);
    expect(out.folds.P).toHaveLength(1);
    expect(out.words).toEqual(['Hem step 20, FRONT: step 10 already turns this edge']);
  });

  it('never changes what it was given', () => {
    const before = JSON.stringify(laid);
    run([HEM], { storedFolds: [near], laid });
    expect(JSON.stringify(laid)).toBe(before);
  });
});

describe('hemSigOf', () => {
  it('is empty with no hem step, changes with the allowance', () => {
    expect(hemSigOf([{ work: 'join_lockstitch' }], '7')).toBe('');
    expect(hemSigOf([HEM], '7')).not.toBe(hemSigOf([{ ...HEM, seamAllowanceMm: '20' }], '7'));
  });
});
