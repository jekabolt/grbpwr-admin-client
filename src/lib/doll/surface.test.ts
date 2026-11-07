import { describe, expect, it } from 'vitest';

import { apply } from 'lib/assembly-skeleton/union/affine';
import type { Hand, PieceGeom, PieceMark, Pt2 } from 'lib/assembly-skeleton/types';

import { inferFlapPlacements } from './surface';

const piece = (pieceKey: string, name: string, hand: Hand, rs: Pt2[], marks: PieceMark[] = []) => {
  const edges = rs.map((a, k) => {
    const b = rs[(k + 1) % rs.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return {
      id: `${pieceKey}#${k}`,
      pieceKey,
      k,
      s: k,
      e: (k + 1) % rs.length,
      pts: [a, b],
      lenMm: len,
      chordMm: len,
      turnDeg: 0,
      notchesMm: [],
      kind: 'edge' as const,
    };
  });
  let twice = 0;
  for (let i = 0; i < rs.length; i++) {
    const a = rs[i];
    const b = rs[(i + 1) % rs.length];
    twice += a[0] * b[1] - a[1] * b[0];
  }
  return {
    pieceKey,
    name,
    hand,
    cloth: null,
    rs,
    corners: rs.map((_, i) => i),
    notchIdx: [],
    edges,
    rect: rs.length === 4,
    areaMm2: Math.abs(twice) / 2,
    perimMm: edges.reduce((sum, edge) => sum + edge.lenMm, 0),
    twinOf: [],
    marks,
  } satisfies PieceGeom;
};

const mouth = (pieceKey: string): PieceMark => ({
  id: `${pieceKey}@0`,
  kind: 'parallel',
  layer: '',
  closed: false,
  pts: [
    [5, 100],
    [195, 100],
  ],
  bbox: { w: 190, h: 0, cx: 100, cy: 100 },
  lenMm: 190,
});

describe('inferFlapPlacements', () => {
  it('lays a rejected-only pair from the matching pocket mouth onto the same-side front', () => {
    const geoms = [
      piece('front', 'FRONT_L', 'L', [
        [0, 0],
        [240, 0],
        [215, 600],
        [25, 600],
      ]),
      piece(
        'pocket',
        'PCK_L_MAIN',
        'L',
        [
          [0, 0],
          [200, 0],
          [200, 250],
          [0, 250],
        ],
        [mouth('pocket')],
      ),
      piece('face', 'FLP_L', 'L', [
        [0, 0],
        [50, 0],
        [50, 160],
        [0, 160],
      ]),
      piece('main', 'FLP_L_MAIN', 'L', [
        [0, 0],
        [100, 0],
        [100, 160],
        [0, 160],
      ]),
    ];
    const rows = [
      {
        status: 'rejected' as const,
        sideA: [{ piece: 'face' }],
        sideB: [{ piece: 'main' }],
      },
    ];
    const placed = inferFlapPlacements(geoms, rows);
    expect(placed.map((placement) => placement.part).sort()).toEqual(['face', 'main']);
    for (const placement of placed) {
      expect(placement.host).toBe('front');
      expect(placement.pocket).toBe('pocket');
      expect(placement.mouth).toBe('front#2');
      const g = geoms.find((candidate) => candidate.pieceKey === placement.part)!;
      const centre: Pt2 = [
        g.rs.reduce((sum, point) => sum + point[0], 0) / g.rs.length,
        g.rs.reduce((sum, point) => sum + point[1], 0) / g.rs.length,
      ];
      const q = apply(placement.T, centre);
      expect(q[0]).toBeGreaterThan(20);
      expect(q[0]).toBeLessThan(220);
      expect(q[1]).toBeLessThan(600);
    }
  });

  it('does nothing when either ply has a live row', () => {
    const geoms = [
      piece('face', 'FLP_L', 'L', [
        [0, 0],
        [50, 0],
        [50, 160],
        [0, 160],
      ]),
      piece('main', 'FLP_L_MAIN', 'L', [
        [0, 0],
        [100, 0],
        [100, 160],
        [0, 160],
      ]),
    ];
    expect(
      inferFlapPlacements(geoms, [
        { status: 'rejected', sideA: [{ piece: 'face' }], sideB: [{ piece: 'main' }] },
        { status: 'confirmed', sideA: [{ piece: 'face' }], sideB: [{ piece: 'shell' }] },
      ]),
    ).toEqual([]);
  });
});
