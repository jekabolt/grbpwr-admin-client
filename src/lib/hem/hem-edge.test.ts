import { describe, expect, it } from 'vitest';

import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { foldFromLine } from 'lib/folds';
import type { PieceDTO } from 'lib/nesting/types';
import { anchorOfRunId, type StoredSeam, type StoredSeamKind } from 'lib/seams';
import { hemEdgeOf, type HemEdgeInput } from './hem-edge';

const FRONT = 'A1';
const BACK = 'A2';
const SLEEVE = 'A3';

/** A piece from its corners in cm, CCW. The name says nothing the function may read. */
function piece(pieceKey: string, corners: readonly Pt2[]): PieceGeom {
  const dto = {
    name: 'X',
    layer: '1',
    poly: corners.map(([x, y]) => ({ x, y })),
    inner: [],
  } as unknown as PieceDTO;
  return segmentPiece({
    pieceKey,
    name: 'X',
    piece: dto,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  });
}

/** A body panel: flat hem, a free straight edge on the left, a slanted shoulder on top. */
const panel = (key = FRONT) =>
  piece(key, [
    [0, 0],
    [33, 0],
    [33, 45],
    [20, 65],
    [0, 60],
  ]);

const middleY = (edge: Edge) =>
  edge.pts.reduce((sum, point) => sum + point[1], 0) / edge.pts.length;
const middleX = (edge: Edge) =>
  edge.pts.reduce((sum, point) => sum + point[0], 0) / edge.pts.length;
const steep = (edge: Edge) => {
  const [a, b] = [edge.pts[0], edge.pts[edge.pts.length - 1]];
  return Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]);
};

const bottomOf = (geom: PieceGeom) =>
  geom.edges.reduce((best, edge) => (middleY(edge) < middleY(best) ? edge : best));
const leftOf = (geom: PieceGeom) =>
  geom.edges.filter(steep).reduce((best, edge) => (middleX(edge) < middleX(best) ? edge : best));
const rightOf = (geom: PieceGeom) =>
  geom.edges.filter(steep).reduce((best, edge) => (middleX(edge) > middleX(best) ? edge : best));

let keys = 0;
function row(
  pieces: readonly PieceGeom[],
  kind: StoredSeamKind,
  a: readonly Edge[],
  b: readonly Edge[],
  status: StoredSeam['status'] = 'confirmed',
): StoredSeam {
  const anchors = (edges: readonly Edge[]) =>
    edges.map((edge) => {
      const anchor = anchorOfRunId(pieces, edge.id);
      if (!anchor) throw new Error('no such run');
      return anchor;
    });
  return {
    seamKey: `S${++keys}`,
    status,
    kind,
    direction: 'reversed',
    source: 'manual',
    sideA: anchors(a),
    sideB: anchors(b),
    anchoredSize: 'M',
    note: '',
  };
}

const read = (input: Partial<HemEdgeInput> & { pieces: readonly PieceGeom[] }) =>
  hemEdgeOf({ inputKeys: [FRONT], seams: [], ...input });

describe('hemEdgeOf', () => {
  it('takes the bottom over a free centre front that is longer', () => {
    const front = panel();
    const result = read({ pieces: [front] });
    expect(result.status).toBe('computed');
    expect(result.parts).toEqual([{ target: bottomOf(front).id }]);
    expect(leftOf(front).lenMm).toBeGreaterThan(bottomOf(front).lenMm);
    expect(result.runs[0].v[0]).toBeCloseTo(0, 3);
    expect(result.runs[0].lenMm).toBeCloseTo(330, 0);
  });

  it('reads the same bottom whichever edge the loop starts on', () => {
    const turned = piece(FRONT, [
      [33, 45],
      [20, 65],
      [0, 60],
      [0, 0],
      [33, 0],
    ]);
    expect(read({ pieces: [turned] }).parts).toEqual([{ target: bottomOf(turned).id }]);
  });

  it('turns the piece by its grain before it says bottom', () => {
    const geom = panel();
    const upright = read({ pieces: [geom], grainDeg: new Map([[FRONT, 8]]) });
    expect(upright.parts).toEqual([{ target: bottomOf(geom).id }]);
  });

  it('never climbs to the next free edge when a seam uses the bottom', () => {
    const front = panel();
    const back = panel(BACK);
    const seam = row([front, back], 'edge', [bottomOf(front)], [bottomOf(back)]);
    const result = read({ pieces: [front, back], seams: [seam] });
    expect(result).toEqual({ status: 'unknown', reason: 'no-free-bottom', parts: [], runs: [] });
  });

  it('ignores a rejected row: that pair was refused, the edge stays free', () => {
    const front = panel();
    const back = panel(BACK);
    const seam = row([front, back], 'edge', [bottomOf(front)], [bottomOf(back)], 'rejected');
    expect(read({ pieces: [front, back], seams: [seam] }).status).toBe('computed');
  });

  it('takes out an edge a closure row names', () => {
    const front = panel();
    const back = panel(BACK);
    const seam = row([front, back], 'closure', [bottomOf(front)], [bottomOf(back)]);
    expect(read({ pieces: [front, back], seams: [seam] }).status).toBe('unknown');
  });

  it('takes out an edge a stored fold runs along', () => {
    const front = panel();
    const hem = foldFromLine(
      front,
      [
        [0, 35],
        [330, 35],
      ],
      [165, 10],
      { seq: 1, kind: 'inward', source: 'owner', foldKey: 'F1' },
    );
    expect(read({ pieces: [front], folds: [hem] })).toEqual({
      status: 'unknown',
      reason: 'no-free-bottom',
      parts: [],
      runs: [],
    });
  });

  it('keeps the bottom when the fold runs along the free front or crosses as a pleat', () => {
    const front = panel();
    const turn = foldFromLine(
      front,
      [
        [35, 0],
        [35, 600],
      ],
      [10, 300],
      { seq: 1, kind: 'inward', source: 'owner', foldKey: 'F1' },
    );
    const pleat = foldFromLine(
      front,
      [
        [0, 35],
        [330, 35],
      ],
      [165, 10],
      { seq: 2, kind: 'pleat', source: 'owner', foldKey: 'F2' },
    );
    expect(read({ pieces: [front], folds: [turn, pleat] }).parts).toEqual([
      { target: bottomOf(front).id },
    ]);
  });

  it('returns nothing for two bottoms at one level', () => {
    // A notch cut up the middle of the hem: two free runs, the same height.
    const slit = piece(FRONT, [
      [0, 0],
      [14, 0],
      [14, 20],
      [19, 20],
      [19, 0],
      [33, 0],
      [33, 60],
      [0, 60],
    ]);
    expect(read({ pieces: [slit] })).toEqual({
      status: 'unknown',
      reason: 'ambiguous',
      parts: [],
      runs: [],
    });
  });

  it('returns nothing for a free bottom broken by a seam in its middle', () => {
    // Three neighbouring bottom edges, split by real corners; the middle one is sewn.
    const stepped = piece(FRONT, [
      [0, 0],
      [11, 5],
      [22, 0],
      [33, 5],
      [33, 60],
      [0, 60],
    ]);
    const back = panel(BACK);
    const low = stepped.edges.filter((edge) => !steep(edge) && middleY(edge) < 100);
    expect(low.length).toBe(3);
    const seam = row([stepped, back], 'edge', [low[1]], [bottomOf(back)]);
    expect(read({ pieces: [stepped] }).status).toBe('computed');
    expect(read({ pieces: [stepped, back], seams: [seam] })).toEqual({
      status: 'unknown',
      reason: 'ambiguous',
      parts: [],
      runs: [],
    });
  });

  it('lets the row of the step win and runs nothing else', () => {
    const front = panel();
    const back = panel(BACK);
    const named = row([front, back], 'edge', [leftOf(front)], [leftOf(back)]);
    const result = read({ pieces: [front, back], seams: [named], ownSeamKeys: [named.seamKey] });
    expect(result).toEqual({
      status: 'owner',
      parts: [{ target: leftOf(front).id }],
      runs: [],
    });
  });

  it('keeps the span the row of the step really sews', () => {
    const front = panel();
    const back = panel(BACK);
    const anchor = anchorOfRunId([front], bottomOf(front).id, undefined, [0, 0.5]);
    const named: StoredSeam = {
      ...row([front, back], 'partial', [bottomOf(front)], [bottomOf(back)]),
      sideA: [anchor!],
    };
    const result = read({ pieces: [front, back], seams: [named], ownSeamKeys: [named.seamKey] });
    expect(result.status).toBe('owner');
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].target).toBe(bottomOf(front).id);
    expect(result.parts[0].range?.[0]).toBeCloseTo(0, 1);
    expect(result.parts[0].range?.[1]).toBeCloseTo(bottomOf(front).lenMm / 2, 0);
  });

  it('computes when the row of the step names only another piece', () => {
    const front = panel();
    const back = panel(BACK);
    const sleeve = panel(SLEEVE);
    const elsewhere = row([back, sleeve], 'edge', [leftOf(back)], [leftOf(sleeve)]);
    const result = read({
      pieces: [front, back, sleeve],
      seams: [elsewhere],
      ownSeamKeys: [elsewhere.seamKey],
    });
    expect(result.status).toBe('computed');
    expect(result.parts).toEqual([{ target: bottomOf(front).id }]);
  });

  it('reads a unit as one hem when side seams carry the line across', () => {
    const front = panel();
    const back = panel(BACK);
    const side = row([front, back], 'edge', [rightOf(front)], [leftOf(back)]);
    const result = read({ pieces: [front, back], inputKeys: [FRONT, BACK], seams: [side] });
    expect(result.status).toBe('computed');
    expect(result.parts).toEqual([{ target: bottomOf(front).id }, { target: bottomOf(back).id }]);
  });

  it('refuses a unit of two lines nothing joins: a body and a sleeve', () => {
    const front = panel();
    const sleeve = panel(SLEEVE);
    const result = read({ pieces: [front, sleeve], inputKeys: [FRONT, SLEEVE] });
    expect(result).toEqual({ status: 'unknown', reason: 'ambiguous', parts: [], runs: [] });
  });

  it('skips a unit piece whose bottom is sewn', () => {
    const front = panel();
    const yoke = panel(BACK);
    const sleeve = panel(SLEEVE);
    const seam = row([yoke, sleeve], 'edge', [bottomOf(yoke)], [bottomOf(sleeve)]);
    const result = read({
      pieces: [front, yoke, sleeve],
      inputKeys: [FRONT, BACK],
      seams: [seam],
    });
    expect(result.parts).toEqual([{ target: bottomOf(front).id }]);
  });

  it('says so when the input has no geometry', () => {
    expect(read({ pieces: [panel(BACK)] }).status).toBe('unknown');
    expect(hemEdgeOf({ pieces: [], inputKeys: [], seams: [] })).toEqual({
      status: 'unknown',
      reason: 'no-input',
      parts: [],
      runs: [],
    });
  });
});
