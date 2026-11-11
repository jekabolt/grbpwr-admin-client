import { describe, expect, it } from 'vitest';

import type { Affine, Edge, EdgeId, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

import { edgesLyingOnHost, readOverStack } from './stack-rows';

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

/** A closed outline, one edge between each two corners in order. */
const outline = (pieceKey: string, rs: Pt2[]): PieceGeom => ({
  pieceKey,
  name: pieceKey,
  hand: null,
  cloth: null,
  rs,
  corners: rs.map((_, i) => i),
  notchIdx: [],
  edges: rs.map((p, k) => edge(pieceKey, k, p, rs[(k + 1) % rs.length])),
  rect: false,
  areaMm2: 10_000,
  perimMm: 400,
  twinOf: [],
});

const shift = (dx: number, dy: number): Affine => [1, 0, 0, 1, dx, dy];

// The undrawn ply: a 100 mm panel. #0 armhole side, #1 shoulder, #2 front edge, #3 lower edge.
const HOST = outline('H', [
  [0, 0],
  [0, 100],
  [100, 100],
  [100, 0],
]);
// The drawn ply cut in its own frame 500 mm away; its shoulder is notched in two.
const PART = outline('P', [
  [500, 0],
  [500, 100],
  [550, 100],
  [600, 100],
  [600, 0],
]);
const geoms = new Map([
  ['H', HOST],
  ['P', PART],
]);
const len = (id: EdgeId) =>
  [...geoms.values()].flatMap((g) => g.edges).find((e) => e.id === id)?.lenMm ?? 100;

describe('edgesLyingOnHost', () => {
  it('finds the drawn ply’s edges on each undrawn edge, in order along it', () => {
    const on = edgesLyingOnHost([{ part: 'P', host: 'H', T: shift(-500, 0) }], geoms);
    expect(Object.fromEntries([...on].map(([id, o]) => [id, o.edges]))).toEqual({
      'H#0': ['P#0'],
      'H#1': ['P#1', 'P#2'],
      'H#2': ['P#3'],
      'H#3': ['P#4'],
    });
    expect(on.get('H#1')).toMatchObject({ host: 'H', part: 'P' });
  });

  it('finds nothing where the surface row lays the ply elsewhere', () => {
    expect(edgesLyingOnHost([{ part: 'P', host: 'H', T: shift(-480, 20) }], geoms).size).toBe(0);
  });
});

describe('readOverStack', () => {
  const on = edgesLyingOnHost([{ part: 'P', host: 'H', T: shift(-500, 0) }], geoms);

  it('reads a shoulder named on the undrawn ply over the drawn one', () => {
    expect(readOverStack(['H#1'], ['B#2'], on, len)).toEqual({
      kind: 'over',
      a: ['P#1', 'P#2'],
      b: ['B#2'],
      over: ['P#1', 'P#2'],
      off: ['H'],
    });
  });

  it('reads a composite armhole run part by part', () => {
    const read = readOverStack(['S#0'], ['M#0', 'H#0'], on, (id) => (id === 'S#0' ? 200 : len(id)));
    expect(read).toMatchObject({ kind: 'over', a: ['S#0'], b: ['M#0', 'P#0'], over: ['P#0'] });
  });

  it('calls a row sewing the drawn ply onto the edge it lies on one stack', () => {
    expect(readOverStack(['P#4'], ['M#1', 'H#3'], on, len)).toEqual({
      kind: 'stack',
      edge: 'P#4',
      on: 'H#3',
      part: 'P',
      host: 'H',
    });
  });

  it('leaves rows that name no undrawn edge, or do not fit read over it', () => {
    expect(readOverStack(['M#0'], ['B#0'], on, len)).toBeNull();
    expect(readOverStack(['H#0'], ['B#0'], on, (id) => (id === 'B#0' ? 160 : len(id)))).toBeNull();
  });
});
