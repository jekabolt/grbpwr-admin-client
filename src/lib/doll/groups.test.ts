import { describe, expect, it } from 'vitest';

import type { SeamCandidate } from 'lib/assembly-skeleton/types';

import { gapStretchesOf, groupPieces, type GroupedSeam } from './groups';

const piece = (pieceKey: string, name: string, areaMm2: number) => ({
  pieceKey,
  name,
  areaMm2,
  twinOf: [],
  rs: [
    [0, 0],
    [10, 0],
    [10, 10],
  ],
});
const surface = (part: string, host: string) => ({
  a: `${part}#0`,
  b: `${host}#0`,
  kind: 'surface',
  surface: { part, host },
});
const edge = (a: string, b: string) => ({ a: `${a}#1`, b: `${b}#1`, kind: 'edge', evidence: {} });

const grouped = (name: string, chosen: object[]) =>
  groupPieces(
    {
      pieces: [piece('front', 'FRONT LEFT', 200000), piece('part', name, 40000)],
      chosen,
      rejected: [],
      components: [],
    } as unknown as Parameters<typeof groupPieces>[0],
    { pieces: [] } as unknown as Parameters<typeof groupPieces>[1],
    { owner: true },
  );
const placedByOwner = (g: ReturnType<typeof grouped>) =>
  g.skipped.some((s) => s.pieceKey === 'part' && s.surface);

describe('owner surface rows', () => {
  it('place a placket with no shell seam on its host', () => {
    expect(placedByOwner(grouped('PLACKET', [surface('part', 'front')]))).toBe(true);
  });

  it('leave a placket sewn by an edge seam in the shell', () => {
    const g = grouped('PLACKET', [surface('part', 'front'), edge('part', 'front')]);
    expect(placedByOwner(g)).toBe(false);
  });

  it('never take a shell panel out of the solve', () => {
    expect(placedByOwner(grouped('BACK', [surface('part', 'front')]))).toBe(false);
  });

  it('keeps a shell composite whose first target is a surface piece', () => {
    const geom = (pieceKey: string, name: string, areaMm2 = 100000) => ({
      ...piece(pieceKey, name, areaMm2),
      edges: [
        {
          id: `${pieceKey}#0`,
          k: 0,
          lenMm: 10,
          s: 0,
          e: 1,
          pts: [
            [0, 0],
            [10, 0],
          ],
        },
      ],
    });
    const cap: SeamCandidate = {
      a: 'sleeve#0',
      b: 'pocket#0',
      bParts: ['pocket#0', 'front#0'],
      kind: 'edge',
      score: 1,
      evidence: {} as SeamCandidate['evidence'],
    };
    const result = groupPieces(
      {
        pieces: [
          geom('sleeve', 'SLV_L'),
          geom('pocket', 'PCK_L_MAIN', 10000),
          geom('front', 'P_L_MAIN'),
        ],
        chosen: [cap],
        rejected: [],
        components: [['sleeve', 'pocket', 'front']],
      } as unknown as Parameters<typeof groupPieces>[0],
      { pieces: [], category: 'shirt' } as unknown as Parameters<typeof groupPieces>[1],
      { owner: true },
    );

    expect(result.skipped).toEqual(
      expect.arrayContaining([expect.objectContaining({ pieceKey: 'pocket', surface: true })]),
    );
    expect(result.seams).toHaveLength(1);
    expect(result.seams[0].a).toEqual(['sleeve#0']);
    expect(result.seams[0].b).toEqual(['pocket#0', 'front#0']);
  });
});

describe('gapStretchesOf: one edge sewn with a gap', () => {
  const candidate = (walk?: SeamCandidate['walk']): SeamCandidate => ({
    a: 'front#1',
    b: 'back#3',
    aParts: ['front#1', 'pocket#0'],
    kind: 'composite',
    score: 1,
    partRange: { 'front#1': [0, 200] },
    evidence: {} as SeamCandidate['evidence'],
    ...(walk ? { walk } : {}),
  });
  const grouped = (walk?: SeamCandidate['walk'], a = ['front#1', 'pocket#0']): GroupedSeam => ({
    seam: candidate(walk),
    a,
    b: ['back#3'],
  });
  const top = { target: 'front#1', range: [0, 50] as const };
  const pocket = { target: 'pocket#0' };
  const bottom = { target: 'front#1', range: [150, 200] as const };

  it('is null on a side with no gap, as on every row of today', () => {
    expect(gapStretchesOf(grouped(), 'a')).toBeNull();
    expect(gapStretchesOf(grouped({ a: [top, pocket, bottom] }), 'b')).toBeNull();
  });

  it('gives the stretches in walk order, the edge pinned forward when they run up it', () => {
    expect(gapStretchesOf(grouped({ a: [top, pocket, bottom] }), 'a')).toEqual([
      { id: 'front#1', range: [0, 50], reversed: false },
      { id: 'pocket#0' },
      { id: 'front#1', range: [150, 200], reversed: false },
    ]);
  });

  it('pins the edge backward when the stretches run down it: a mirrored frame', () => {
    expect(gapStretchesOf(grouped({ a: [bottom, pocket, top] }), 'a')).toEqual([
      { id: 'front#1', range: [150, 200], reversed: true },
      { id: 'pocket#0' },
      { id: 'front#1', range: [0, 50], reversed: true },
    ]);
  });

  it('names the lead ply when a follower was mapped onto it', () => {
    expect(
      gapStretchesOf(grouped({ a: [top, pocket, bottom] }, ['lead#1', 'pocket#0']), 'a')?.map(
        ({ id }) => id,
      ),
    ).toEqual(['lead#1', 'pocket#0', 'lead#1']);
  });
});
