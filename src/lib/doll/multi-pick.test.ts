import { describe, expect, it } from 'vitest';

import type { Edge, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';

import { splitMultiPickRows } from './multi-pick';

const edge = (pieceKey: string, k: number, a: Pt2, b: Pt2): Edge => ({
  id: `${pieceKey}#${k}`,
  pieceKey,
  k,
  s: 0,
  e: 1,
  pts: [a, b],
  lenMm: Math.hypot(b[0] - a[0], b[1] - a[1]),
  chordMm: Math.hypot(b[0] - a[0], b[1] - a[1]),
  turnDeg: 0,
  notchesMm: [],
  kind: 'edge',
});

/** A 100 mm square: #0 hem, #1 armhole side, #2 shoulder, #3 neck side. */
const square = (pieceKey: string, x0: number): PieceGeom => {
  const rs: Pt2[] = [
    [x0, 0],
    [x0 + 100, 0],
    [x0 + 100, 100],
    [x0, 100],
  ];
  return {
    pieceKey,
    name: pieceKey,
    hand: null,
    cloth: null,
    rs,
    corners: [0, 1, 2, 3],
    notchIdx: [],
    edges: rs.map((p, k) => edge(pieceKey, k, p, rs[(k + 1) % 4])),
    rect: true,
    areaMm2: 10_000,
    perimMm: 400,
    twinOf: [],
  };
};

const pieces = [square('FL', 0), square('BL', 200), square('BR', 400), square('FR', 600)];

const row = (a: string, b: string, bParts?: string[], confirmed = true): SeamCandidate => ({
  a,
  b,
  ...(bParts ? { bParts } : {}),
  score: 1,
  evidence: {
    dLenMm: 0,
    relLen: 0,
    notchScore: null,
    curvature: 'flat',
    hand: 'neutral',
    twin: 'none',
    self: false,
  },
  kind: bParts ? 'composite' : 'edge',
  ...(confirmed
    ? {
        provenance: {
          seamKey: `${a}~${b}`,
          status: 'confirmed' as const,
          source: 'graph' as const,
          direction: 'unknown' as const,
          by: 'person',
          at: '2026-11-11',
          how: 'hint' as const,
        },
      }
    : {}),
});

// One shoulder picked against both back shoulders and the other front shoulder in one go.
const picked = row('FL#2', 'BL#2', ['BL#2', 'BR#2', 'FR#2']);
// The armholes and the neck: each meets two shoulders at their corners.
const corners = [
  row('SL#0', 'FL#1', ['FL#1', 'BL#1']),
  row('SR#0', 'FR#1', ['FR#1', 'BR#1']),
  row('C#0', 'FL#3', ['FL#3', 'BL#3', 'BR#3', 'FR#3']),
];

describe('splitMultiPickRows', () => {
  it('sews a row a person picked several seams in as the seams its corners bear out', () => {
    const { rows, splits } = splitMultiPickRows([picked, ...corners], pieces);
    expect(splits).toEqual([
      {
        id: 'FL#2~BL#2',
        la: 100,
        lb: 300,
        into: [
          ['FL#2', 'BL#2'],
          ['BR#2', 'FR#2'],
        ],
      },
    ]);
    expect(rows.map((c) => `${c.a}~${c.b}`)).toEqual([
      'FL#2~BL#2',
      'BR#2~FR#2',
      'SL#0~FL#1',
      'SR#0~FR#1',
      'C#0~FL#3',
    ]);
    expect(rows[0].bParts).toBeUndefined();
    expect(rows[1].kind).toBe('edge');
    expect(rows[1].provenance?.status).toBe('confirmed');
  });

  it('keeps the row when no other row sews its corners', () => {
    const { rows, splits } = splitMultiPickRows([picked], pieces);
    expect(splits).toEqual([]);
    expect(rows).toEqual([picked]);
  });

  it('keeps a row whose two sides fit as one seam', () => {
    const balanced = row('FL#2', 'BL#2', ['BL#2', 'BR#2']);
    const both = { ...balanced, aParts: ['FL#2', 'FR#2'] };
    const { rows, splits } = splitMultiPickRows([both, ...corners], pieces);
    expect(splits).toEqual([]);
    expect(rows[0]).toBe(both);
  });

  it('sews one edge of a strip whose both edges a row sews onto one edge', () => {
    // A 100 × 10 mm strip: #0 and #2 are its long edges, each as long as the front edge FL#3.
    const strip: PieceGeom = {
      ...square('PL', 0),
      pieceKey: 'PL',
      edges: [
        edge('PL', 0, [0, 0], [100, 0]),
        edge('PL', 1, [100, 0], [100, 10]),
        edge('PL', 2, [100, 10], [0, 10]),
        edge('PL', 3, [0, 10], [0, 0]),
      ],
    };
    const folded = { ...row('PL#2', 'FL#3'), aParts: ['PL#2', 'PL#0'], kind: 'composite' as const };
    const { rows, splits } = splitMultiPickRows([folded], [...pieces, strip]);
    expect(splits).toEqual([
      {
        id: 'PL#2~FL#3',
        la: 200,
        lb: 100,
        into: [],
        fold: { ply: 'PL#2', over: 'PL#0', edge: ['FL#3'] },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ a: 'PL#2', b: 'FL#3', kind: 'edge' });
    expect(rows[0].aParts).toBeUndefined();
  });

  it('leaves the engine’s own readings alone', () => {
    const guess = row('FL#2', 'BL#2', ['BL#2', 'BR#2', 'FR#2'], false);
    const { rows, splits } = splitMultiPickRows([guess, ...corners], pieces);
    expect(splits).toEqual([]);
    expect(rows[0]).toBe(guess);
  });
});
