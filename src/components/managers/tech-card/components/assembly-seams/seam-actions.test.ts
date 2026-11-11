import { describe, expect, it } from 'vitest';

import type { Edge, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { resolveSeamDecisions, seamFromCandidate, type StoredSeam } from 'lib/seams';

import { autoReconfirmable, handRow, type AnchorCtx } from './seam-actions';

/** A straight-edged piece walking `corners` CCW: edge k runs from corner k to corner k + 1. */
function pieceOf(pieceKey: string, corners: Pt2[]): PieceGeom {
  const n = corners.length;
  const edges: Edge[] = corners.map((p, k) => {
    const q = corners[(k + 1) % n];
    const lenMm = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return {
      id: `${pieceKey}#${k}`,
      pieceKey,
      k,
      s: k,
      e: (k + 1) % n,
      pts: [p, q],
      lenMm,
      chordMm: lenMm,
      turnDeg: 0,
      notchesMm: [],
      kind: 'edge',
    };
  });
  let area = 0;
  for (let k = 0; k < n; k++) {
    const [x0, y0] = corners[k];
    const [x1, y1] = corners[(k + 1) % n];
    area += x0 * y1 - x1 * y0;
  }
  return {
    pieceKey,
    name: pieceKey,
    hand: 'none',
    cloth: null,
    rs: corners,
    corners: corners.map((_, k) => k),
    notchIdx: [],
    edges,
    rect: false,
    areaMm2: Math.abs(area) / 2,
    perimMm: edges.reduce((sum, e) => sum + e.lenMm, 0),
    twinOf: [],
  } as unknown as PieceGeom;
}

const scaled = (corners: Pt2[], k: number) => corners.map(([x, y]) => [x * k, y * k] as Pt2);

// Two irregular pieces (no symmetry, so every frame is told apart): BP#4 and FL#3 are both 760 mm.
const BACK: Pt2[] = [
  [0, 0],
  [400, 0],
  [460, 150],
  [400, 700],
  [0, 760],
];
const FRONT: Pt2[] = [
  [0, 0],
  [220, 30],
  [260, 700],
  [0, 760],
];

const ctxOf = (pieces: PieceGeom[]): AnchorCtx => ({
  pieces,
  grainDeg: null,
  nameOf: (k) => k,
});
const today = [pieceOf('BP', BACK), pieceOf('FL', FRONT)];

const candidate = (a: string, b: string, extra: Partial<SeamCandidate> = {}): SeamCandidate =>
  ({
    a,
    b,
    score: 1,
    kind: 'edge',
    evidence: {
      dLenMm: 0,
      relLen: 0,
      notchScore: null,
      curvature: 'flat',
      hand: 'neutral',
      twin: 'none',
      self: false,
    },
    ...extra,
  }) as SeamCandidate;

/** A row decided on `pieces`, then stamped stale by the server (the re-upload). */
function staleRow(
  c: SeamCandidate,
  o: { key: string; status?: StoredSeam['status']; pieces?: PieceGeom[] } = { key: 'S1' },
): StoredSeam {
  const row = seamFromCandidate(c, o.pieces ?? today, {
    seamKey: o.key,
    status: o.status ?? 'confirmed',
    source: 'manual',
    direction: 'reversed',
    note: 'kept',
  });
  if (!row) throw new Error('fixture row did not anchor');
  return { ...row, stale: true };
}

const sideSeam = () => staleRow(candidate('BP#4', 'FL#3'), { key: 'SIDE' });
const composite = () =>
  staleRow(
    candidate('FL#0', 'BP#3', { kind: 'composite', aParts: ['FL#0', 'FL#2'], bParts: ['BP#3'] }),
    { key: 'COMP' },
  );

describe('autoReconfirmable (T6: re-confirm a stale seam only on an unchanged edge)', () => {
  it('unchanged edge → re-confirmed: same key, decision, note; stale flag gone', () => {
    const was = sideSeam();
    const out = autoReconfirmable([was], ctxOf(today));
    expect(out).toHaveLength(1);
    const [row] = out;
    expect(row.stale).toBeUndefined();
    expect(row).toMatchObject({
      seamKey: 'SIDE',
      status: 'confirmed',
      kind: 'edge',
      direction: 'reversed',
      source: 'manual',
      note: 'kept',
    });
    expect(row.sideA.map((a) => a.edgeHint)).toEqual(['BP#4']);
    expect(row.sideB.map((a) => a.edgeHint)).toEqual(['FL#3']);
    expect(row.sideA[0].lenMm).toBe(was.sideA[0].lenMm);
  });

  it('keeps what the owner set on an anchor: range, placement, layer', () => {
    const was = sideSeam();
    const placement = { xMm: 12, yMm: 1, rotDeg: 0, flip: false };
    const marked: StoredSeam = {
      ...was,
      sideA: [{ ...was.sideA[0], placement, layer: 'over' }],
    };
    const [row] = autoReconfirmable([marked], ctxOf(today));
    expect(row.sideA[0].placement).toEqual(placement);
    expect(row.sideA[0].layer).toBe('over');
    expect(row.sideA[0].range).toEqual(was.sideA[0].range);
  });

  it('a rejected seam follows the same rule and stays rejected', () => {
    const was = staleRow(candidate('BP#4', 'FL#3'), { key: 'NO', status: 'rejected' });
    const [row] = autoReconfirmable([was], ctxOf(today));
    expect(row).toMatchObject({ seamKey: 'NO', status: 'rejected' });
  });

  it('a row the server did not flag is not touched', () => {
    const { stale: _drop, ...fresh } = sideSeam();
    void _drop;
    expect(autoReconfirmable([fresh], ctxOf(today))).toEqual([]);
  });

  it('a length wobble inside the resolver band (2.5 mm) still counts as the same edge', () => {
    const wobble = [pieceOf('BP', scaled(BACK, 1.002)), pieceOf('FL', scaled(FRONT, 1.002))];
    const [row] = autoReconfirmable([sideSeam()], ctxOf(wobble));
    expect(row?.sideA[0].edgeHint).toBe('BP#4');
    expect(row?.sideA[0].lenMm).toBeCloseTo(760 * 1.002, 1);
  });

  it('an edge the segmentation renumbered (same line, same place) comes back under its new number', () => {
    // A corner added on the bottom edge: the side edge BP#4 is BP#5 today, unchanged itself.
    const split: Pt2[] = [[0, 0], [200, 0], ...BACK.slice(1)];
    const renumbered = [pieceOf('BP', split), pieceOf('FL', FRONT)];
    const [row] = autoReconfirmable([sideSeam()], ctxOf(renumbered));
    expect(row?.sideA.map((a) => a.edgeHint)).toEqual(['BP#5']);
    expect(row?.sideB.map((a) => a.edgeHint)).toEqual(['FL#3']);
  });

  it('a piece turned 180° in the file stays stale: only «as is» is the same edge', () => {
    const turned = FRONT.map(([x, y]) => [260 - x, 760 - y] as Pt2);
    const today180 = [pieceOf('BP', BACK), pieceOf('FL', turned)];
    const r = resolveSeamDecisions([sideSeam()], today180);
    expect(r.stale[0]).toMatchObject({ reason: 'server', stillFits: true });
    expect(autoReconfirmable([sideSeam()], ctxOf(today180))).toEqual([]);
  });

  it('edge length moved (still fits) → stays stale', () => {
    const graded = [pieceOf('BP', scaled(BACK, 1.03)), pieceOf('FL', scaled(FRONT, 1.03))];
    // The resolver alone would call it «still fits»: the edge is found, only longer.
    const r = resolveSeamDecisions([sideSeam()], graded);
    expect(r.stale[0]).toMatchObject({ reason: 'server', stillFits: true });
    expect(autoReconfirmable([sideSeam()], ctxOf(graded))).toEqual([]);
  });

  it('no longer fits → stays stale', () => {
    const redrawn = [
      pieceOf('BP', BACK),
      pieceOf('FL', [
        [0, 0],
        [300, 200],
        [260, 700],
        [0, 500],
      ]),
    ];
    const r = resolveSeamDecisions([sideSeam()], redrawn);
    expect(r.stale[0]?.stillFits).toBe(false);
    expect(autoReconfirmable([sideSeam()], ctxOf(redrawn))).toEqual([]);
  });

  it('a piece gone from the card → stays stale', () => {
    expect(autoReconfirmable([sideSeam()], ctxOf([pieceOf('BP', BACK)]))).toEqual([]);
  });

  it('composite side, every part unchanged → re-confirmed with all its parts', () => {
    const was = composite();
    expect(was.sideA).toHaveLength(2);
    const [row] = autoReconfirmable([was], ctxOf(today));
    expect(row.kind).toBe('composite');
    expect(row.sideA.map((a) => a.edgeHint)).toEqual(['FL#0', 'FL#2']);
    expect(row.sideB.map((a) => a.edgeHint)).toEqual(['BP#3']);
  });

  it('composite side, its parts grown (still fits) → the whole row stays stale', () => {
    // FL grows 2.5 %: inside the ratio drift (3 %), so the resolver alone says «still fits».
    const grown = [pieceOf('BP', BACK), pieceOf('FL', scaled(FRONT, 1.025))];
    const r = resolveSeamDecisions([composite()], grown);
    expect(r.stale[0]).toMatchObject({ reason: 'server', stillFits: true });
    expect(autoReconfirmable([composite()], ctxOf(grown))).toEqual([]);
  });

  it('only the unchanged rows of a mixed list come back', () => {
    const other = staleRow(candidate('BP#0', 'FL#1'), { key: 'OTHER' });
    const out = autoReconfirmable([sideSeam(), composite(), other], ctxOf(today));
    expect(out.map((r) => r.seamKey).sort()).toEqual(['COMP', 'OTHER', 'SIDE']);
  });

  it('a surface row has no edge to compare: left stale', () => {
    const was = sideSeam();
    const surface: StoredSeam = { ...was, seamKey: 'SURF', kind: 'surface' };
    expect(autoReconfirmable([surface], ctxOf(today))).toEqual([]);
  });
});

describe('handRow: one edge on both sides (C1)', () => {
  const geoms = new Map(today.map((p) => [p.pieceKey, p]));
  const hand = (a: Parameters<typeof handRow>[0], b: Parameters<typeof handRow>[1]) =>
    handRow(a, b, geoms, ctxOf(today), { direction: 'unknown' });

  it('two edges of one piece are a seam', () => {
    expect(hand(['BP#1'], ['BP#3']).row).not.toBeNull();
  });

  it('the same edge on both sides is refused, whole or a shared stretch', () => {
    expect(hand(['BP#0', 'BP#3'], ['BP#3']).refusal).toBe('cannot pair');
    expect(
      hand([{ target: 'BP#3', range: [0, 300] }], [{ target: 'BP#3', range: [200, 500] }]).row,
    ).toBeNull();
  });

  it('two separate stretches of one edge still pair (a vent)', () => {
    expect(
      hand([{ target: 'BP#3', range: [0, 200] }], [{ target: 'BP#3', range: [300, 500] }]).row,
    ).not.toBeNull();
  });
});
