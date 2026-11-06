import { describe, expect, it } from 'vitest';

import type { Edge, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';

import { planSurfaceByRows, shellSeamsUnderSurfaceRows, type RowLay } from './surface-rows';

const edge = (pieceKey: string, k: number, a: [number, number], b: [number, number]): Edge => ({
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

const piece = (pieceKey: string, compositeStretch = 100): PieceGeom => ({
  pieceKey,
  name: pieceKey,
  hand: null,
  cloth: null,
  rs: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  corners: [0, 1, 2, 3],
  notchIdx: [],
  edges: [
    edge(pieceKey, 0, [0, 0], [compositeStretch, 0]),
    edge(pieceKey, 1, [0, 100], [100, 100]),
  ],
  rect: true,
  areaMm2: 10_000,
  perimMm: 400,
  twinOf: [],
});

const row = (a: string, b: string, bParts?: string[]): SeamCandidate => ({
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
});

describe('surface rows', () => {
  it('places a composite pocket row on its shell stretch, not a nested surface piece', () => {
    const geoms = new Map([
      ['back', piece('back', 70)],
      ['under', piece('under', 30)],
      ['bag', piece('bag')],
    ]);
    const lays = planSurfaceByRows({
      parts: ['bag'],
      fixed: new Map([['under', { host: 'back', T: [1, 0, 0, 1, 0, 0] as const }]]),
      hosts: new Set(['back']),
      geoms,
      rows: [row('bag#0', 'back#0', ['back#0', 'under#0']), row('bag#1', 'under#1')],
    });

    expect(lays.get('bag')).toMatchObject({ host: 'back', on: 'back', depth: 0 });
  });

  it('sews shell edges together under a shared pocket edge', () => {
    const host = row('front#1', 'pocket#0');
    const caught = row('yoke#4', 'pocket#0');
    const lays = new Map<string, RowLay>([
      [
        'pocket',
        {
          host: 'front',
          T: [1, 0, 0, 1, 0, 0],
          cover: 1,
          row: 'front#1~pocket#0',
          on: 'front',
          depth: 0,
          how: '',
        },
      ],
    ]);

    expect(
      shellSeamsUnderSurfaceRows({
        rows: [host, caught],
        lays,
        drawn: new Set(['front', 'yoke']),
      }),
    ).toEqual([
      {
        row: caught,
        a: ['yoke#4'],
        b: ['front#1'],
        originalA: ['yoke#4'],
        originalB: ['pocket#0'],
        off: ['pocket'],
        over: ['front#1'],
      },
    ]);
  });
});
