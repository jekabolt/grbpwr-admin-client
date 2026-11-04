import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { frameOf, toUV, type PieceFrame } from 'lib/seams/frame';
import { coincidentGroups, foldedSideLengthMm } from './coincide';
import type { StoredFold } from './types';

const FLAP = '01FLAP00000000000000000001';

type Part = Parameters<typeof coincidentGroups>[0][number];

function fold(
  pieceKey = FLAP,
  line: [Pt2, Pt2] = [
    [0.5, 0],
    [0.5, 1],
  ],
): StoredFold {
  return {
    foldKey: `fold-${pieceKey}`,
    pieceKey,
    seq: 1,
    kind: 'inward',
    source: 'owner',
    line,
    flipAt: [0.25, 0.5],
    edge: null,
    contourSig: '',
    anchoredSize: 'M',
    note: '',
    stale: false,
  };
}

function rectangleFrame(pieceKey = FLAP): PieceFrame {
  return { pieceKey, deg: 0, c: [40, 100], x0: 0, y0: 0, w: 80, h: 200 };
}

const frameFor = (piece: string) => (piece === FLAP ? rectangleFrame() : null);
const flapEdges = (
  rightPts: readonly Pt2[] = [
    [80, 0],
    [80, 200],
  ],
): Part[] => [
  {
    id: 'edge-1',
    piece: FLAP,
    pts: [
      [0, 0],
      [0, 200],
    ],
    lenMm: 200,
  },
  { id: 'edge-3', piece: FLAP, pts: rightPts, lenMm: 200 },
];

describe('coincidentGroups', () => {
  it('counts the two 200 mm sides of the folded 80 × 200 FLAP_L once', () => {
    const parts = flapEdges();

    expect(coincidentGroups(parts, [fold()], frameFor)).toEqual([['edge-1', 'edge-3']]);
    expect(foldedSideLengthMm(parts, 200, [fold()], frameFor)).toBe(200);
  });

  it('does not infer a fold when no declared row is active', () => {
    expect(coincidentGroups(flapEdges(), [], frameFor)).toEqual([['edge-1'], ['edge-3']]);
    expect(foldedSideLengthMm(flapEdges(), 200, [], frameFor)).toBe(400);
  });

  it('keeps the sum when the other side matches 400 mm', () => {
    expect(foldedSideLengthMm(flapEdges(), 400, [fold()], frameFor)).toBe(400);
    expect(foldedSideLengthMm(flapEdges(), null, [fold()], frameFor)).toBe(400);
  });

  it('guards on the whole side: a pair plus another part still counts the pair once', () => {
    const extra: Part = {
      id: 'edge-other',
      piece: '01OTHER0000000000000000001',
      pts: [
        [0, 0],
        [100, 0],
      ],
      lenMm: 100,
    };
    expect(foldedSideLengthMm([...flapEdges(), extra], 300, [fold()], frameFor)).toBe(300);
  });

  it('does not group two edges on the same side of the fold', () => {
    const sameSide = flapEdges([
      [20, 0],
      [20, 200],
    ]);

    expect(coincidentGroups(sameSide, [fold()], frameFor)).toEqual([['edge-1'], ['edge-3']]);
  });

  it('does not group parts from different pieces', () => {
    const parts = [
      flapEdges()[0],
      { ...flapEdges()[1], id: 'other-edge', piece: '01OTHER0000000000000000001' },
    ];

    expect(coincidentGroups(parts, [fold()], frameFor)).toEqual([['edge-1'], ['other-edge']]);
  });

  it('rejects a 5 mm slanted mirror gap but accepts a 2 mm slanted gap', () => {
    const gap5 = flapEdges([
      [84, 0],
      [86, 200],
    ]);
    const gap2 = flapEdges([
      [81, 0],
      [83, 200],
    ]);

    expect(coincidentGroups(gap5, [fold()], frameFor)).toEqual([['edge-1'], ['edge-3']]);
    expect(coincidentGroups(gap2, [fold()], frameFor)).toEqual([['edge-1', 'edge-3']]);
  });

  it('converts a UV fold through the grain-turned piece frame', () => {
    const piece: PieceGeom = {
      pieceKey: FLAP,
      name: 'FLAP_L',
      hand: 'L',
      cloth: 'main',
      rs: [
        [100, 200],
        [180, 200],
        [180, 400],
        [100, 400],
      ],
      corners: [],
      notchIdx: [],
      edges: [],
      rect: true,
      areaMm2: 16_000,
      perimMm: 560,
      twinOf: [],
    };
    const turned = frameOf(piece, 90);
    const lineMm: [Pt2, Pt2] = [
      [140, 200],
      [140, 400],
    ];
    const row = fold(FLAP, [toUV(turned, lineMm[0]), toUV(turned, lineMm[1])]);
    const parts: Part[] = [
      {
        id: 'turned-1',
        piece: FLAP,
        pts: [
          [100, 200],
          [100, 400],
        ],
        lenMm: 200,
      },
      {
        id: 'turned-3',
        piece: FLAP,
        pts: [
          [180, 200],
          [180, 400],
        ],
        lenMm: 200,
      },
    ];

    expect(row.line[0]).toEqual([1, 0.5]);
    expect(row.line[1][0]).toBeCloseTo(0, 12);
    expect(row.line[1][1]).toBeCloseTo(0.5, 12);
    expect(coincidentGroups(parts, [row], (key) => (key === FLAP ? turned : null))).toEqual([
      ['turned-1', 'turned-3'],
    ]);
  });

  it('matches the stored SS26-011 FLAP_L fold against its real sewing geometry', () => {
    // Small fixture transcribed from pants-SS26-011.zip: layer-14 FLAP_L_L and card.json pieceFolds.
    const pieceKey = '01M1M1ZAHFNFXSPQ3V9ZA46AVQ';
    const piece: PieceGeom = {
      pieceKey,
      name: 'FLAP_L',
      hand: 'L',
      cloth: 'main',
      rs: [
        [35.881752, 945.685303],
        [15.881752, 945.685303],
        [-4.118248, 945.685303],
        [-4.118248, 745.685303],
        [15.881721, 745.685303],
        [35.881691, 745.685303],
        [55.881729, 745.685303],
        [75.881767, 745.685303],
        [75.88176, 825.745178],
        [75.881744, 905.805054],
        [75.881737, 945.685303],
        [55.881744, 945.685303],
      ],
      corners: [],
      notchIdx: [],
      edges: [],
      rect: true,
      areaMm2: 16_000,
      perimMm: 560,
      twinOf: [],
    };
    const stored = {
      ...fold(pieceKey, [
        [0.5, 1],
        [0.5, 0],
      ]),
      foldKey: '01M6ERS5VZE1D699TP8N8V843K',
      source: 'accepted_hint',
      edge: {
        hint: `${pieceKey}#1`,
        samples: [
          [0, 1],
          [0, 0.75],
          [0, 0.5],
          [0, 0.25],
          [0, 0],
        ],
        offsetMm: 40,
      },
      contourSig: '05c1d3647ae05aca',
    } satisfies StoredFold;
    const parts: Part[] = [
      {
        id: `${pieceKey}#1`,
        piece: pieceKey,
        pts: [
          [-4.118248, 745.685303],
          [-4.118248, 945.685303],
        ],
        lenMm: 200,
      },
      {
        id: `${pieceKey}#3`,
        piece: pieceKey,
        pts: [
          [75.881767, 745.685303],
          [75.881737, 945.685303],
        ],
        lenMm: 200,
      },
    ];
    const realFrame = frameOf(piece);

    expect(coincidentGroups(parts, [stored], () => realFrame)).toEqual([
      [`${pieceKey}#1`, `${pieceKey}#3`],
    ]);
    expect(foldedSideLengthMm(parts, 200, [stored], () => realFrame)).toBe(200);
  });

  it('removes the 70 mm BP neck intake across a PLEAT', () => {
    const pieceKey = '01BACKPIECE000000000000001';
    const frame: PieceFrame = {
      pieceKey,
      deg: 0,
      c: [284.5, 346],
      x0: 0,
      y0: 0,
      w: 569,
      h: 692,
    };
    const mmLines: [Pt2, Pt2][] = [
      [
        [285, 14],
        [250, 662],
      ],
      [
        [285, 14],
        [285, 663],
      ],
      [
        [285, 14],
        [320, 662],
      ],
    ];
    const rows: StoredFold[] = mmLines.map((line, index) => ({
      ...fold(pieceKey, [toUV(frame, line[0]), toUV(frame, line[1])]),
      foldKey: `pleat-${index + 1}`,
      seq: index + 1,
      kind: 'pleat',
    }));
    const neck: Part = {
      id: `${pieceKey}#neck`,
      piece: pieceKey,
      pts: [
        [200, 662],
        [250, 662],
        [285, 663],
        [320, 662],
        [370, 662],
      ],
      lenMm: 170,
    };

    expect(foldedSideLengthMm([neck], 100, rows, () => frame)).toBeCloseTo(100, 0);
  });
});
