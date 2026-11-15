import { describe, expect, it } from 'vitest';

import type { DerivedEdge, PieceSpec, PtMm, WriteJob } from '../types';
import { squareSpec } from '../gate';
import { roundTrip } from '../gate/roundtrip';
import { DRAWN_LAYER, DRAWN_OPEN_GAP_MM, drawnStretches, drawnText } from './drawn';
import { polylineLength } from './geom';
import { writeDxfDetailed } from './index';

const SQ: PtMm[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
const len = (pts: PtMm[]) => polylineLength(pts, false);

describe('drawnStretches: the drawn edge laid on the written cut', () => {
  it('takes the way round the edge runs along, corner included', () => {
    // an L-shaped edge round the corner (100,0): 30 + 20 mm
    const edge = [
      { x: 70, y: 0.3 },
      { x: 100, y: 0 },
      { x: 99.8, y: 20 },
    ];
    const { stretches, skipped } = drawnStretches(SQ, [{ pts: edge }]);
    expect(skipped).toBe(0);
    expect(stretches).toHaveLength(1);
    expect(len(stretches[0])).toBeCloseTo(50, 0);
    expect(stretches[0].some((p) => p.x === 100 && p.y === 0)).toBe(true);
  });

  it('skips an edge whose end is off the cut line', () => {
    const r = drawnStretches(SQ, [
      {
        pts: [
          { x: 50, y: 10 },
          { x: 60, y: 0 },
        ],
      },
    ]);
    expect(r).toEqual({ stretches: [], skipped: 1 });
  });

  it('never closes and never writes a 2-point line', () => {
    // four edges covering the whole ring
    const edges = SQ.map((a, i) => ({ pts: [a, SQ[(i + 1) % 4]] }));
    const { stretches } = drawnStretches(SQ, edges);
    expect(stretches).toHaveLength(1);
    expect(len(stretches[0])).toBeCloseTo(400 - DRAWN_OPEN_GAP_MM, 3);
    const one = drawnStretches(SQ, [
      {
        pts: [
          { x: 10, y: 0 },
          { x: 40, y: 0 },
        ],
      },
    ]).stretches[0];
    expect(one.length).toBe(3);
  });
});

describe('drawnText', () => {
  const rep = { kind: 'leak' as const, from: [1, 3] as [number, number], cover: 0.8, holes: 1 };
  it('says how much and from which sizes', () => {
    const r = { ...rep, holesMm: 12, drawnMm: 33.6, fromTokens: ['22', '24'] as [string, string] };
    expect(drawnText({ repair: { ...r, score: 0.5, devMm: 0.2 } })).toBe(
      'DRAWN FROM GRADE 34MM (22-24)',
    );
  });
  it('is silent without a drawn line', () => {
    expect(drawnText({ repair: undefined })).toBeNull();
    expect(drawnText({ repair: { ...rep, holesMm: 0, score: 0.5, devMm: 0.2 } })).toBeNull();
  });
});

// The 100 mm square with its bottom side drawn from the grade, written and read back by the card.
const job = (dialect: WriteJob['dialect']): WriteJob => {
  const spec: PieceSpec = squareSpec();
  spec.sizes[0].repair = {
    kind: 'leak',
    from: [0, 0],
    fromTokens: ['S', 'L'],
    cover: 0.75,
    holes: 1,
    holesMm: 100,
    score: 0.4,
    devMm: 0.1,
  };
  return {
    techCardId: 0,
    scope: {
      scopeKey: 'probe',
      fabricPurpose: 'probe',
      bomLineKey: '',
      label: 'probe',
      isInterlining: false,
    },
    pieces: [spec],
    sizes: [{ token: 'M', sizeId: 1, name: 'm', sourceLabel: 'M', rank: 0 }],
    source: {
      files: [],
      scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
      sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      sizeEncoding: 'single',
      variant: null,
    },
    generator: 'test',
    dialect,
  };
};
const bottom: DerivedEdge[] = [
  {
    kind: 'grade-fill',
    pts: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  },
];

describe.each(['r2000', 'r12'] as const)('%s: GRADE_DRAWN in the file', (dialect) => {
  it('marks the stretch and the card still reads one piece', async () => {
    const d = writeDxfDetailed(job(dialect), {
      embed: null,
      now: () => new Date(0),
      derivedOf: () => bottom,
    });
    expect(d.plan.blocks[0].drawn).toHaveLength(1);
    expect(d.dxfText).toContain(DRAWN_LAYER);
    expect(d.dxfText).toContain('DRAWN FROM GRADE 100MM (S-L)');
    const rt = await roundTrip(d.dxfText);
    const pieces = rt.pieces.filter((p) => p.layer === '1');
    expect(pieces).toHaveLength(1);
    expect(rt.pieces.some((p) => p.layer === DRAWN_LAYER)).toBe(false);
  });

  it('a file with nothing drawn keeps its old layer table', () => {
    const d = writeDxfDetailed(job(dialect), { embed: null, now: () => new Date(0) });
    expect(d.dxfText).not.toContain(DRAWN_LAYER);
  });
});
