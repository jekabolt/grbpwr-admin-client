import { describe, expect, it } from 'vitest';

import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

import {
  deltaMm,
  dropKeys,
  inputGroups,
  innerAnchor,
  longestEdge,
  rowWords,
  sideOf,
  suggestPair,
  surfaceRow,
  targetsLen,
} from './step-seams-model';

/** A w × h rectangle, CCW from the origin, one plain edge per side (`KEY#0..3`). */
function rect(key: string, w: number, h: number, notches: number[][] = []): PieceGeom {
  const c: Pt2[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const edges: Edge[] = c.map((p, k) => {
    const q = c[(k + 1) % 4];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return {
      id: `${key}#${k}`,
      pieceKey: key,
      k,
      s: k,
      e: k + 1,
      pts: [p, q],
      lenMm: len,
      chordMm: len,
      turnDeg: 0,
      notchesMm: notches[k] ?? [],
      kind: 'edge',
    } as Edge;
  });
  return {
    pieceKey: key,
    name: key,
    hand: 'none',
    cloth: null,
    rs: c,
    corners: [0, 1, 2, 3],
    notchIdx: [],
    edges,
    rect: true,
    areaMm2: w * h,
    perimMm: 2 * (w + h),
  } as unknown as PieceGeom;
}

describe('inputGroups', () => {
  const pieces = new Set(['FP', 'BP', 'SLV', 'CUFF']);
  const ops = [
    { inputKeys: ['FP', 'BP'], outputUnitKey: 'BODY' },
    { inputKeys: ['SLV', 'CUFF'], outputUnitKey: 'ARM' },
    { inputKeys: ['BODY', 'ARM'] },
  ];
  it('expands a unit into the pieces of the earlier step that made it', () => {
    expect(inputGroups(ops, 2, pieces)).toEqual([
      { key: 'BODY', pieces: ['FP', 'BP'] },
      { key: 'ARM', pieces: ['SLV', 'CUFF'] },
    ]);
  });
  it('drops an input it cannot resolve', () => {
    expect(inputGroups([{ inputKeys: ['GHOST', 'FP'] }], 0, pieces)).toEqual([
      { key: 'FP', pieces: ['FP'] },
    ]);
  });
  it('sides follow the input when there are two, the chosen side otherwise', () => {
    const groups = inputGroups(ops, 2, pieces);
    expect(sideOf('FP', groups, 'b')).toBe('a');
    expect(sideOf('CUFF', groups, 'a')).toBe('b');
    expect(sideOf('FP', [groups[0]], 'b')).toBe('b');
  });
});

describe('lengths', () => {
  it('Δ is the plain difference without ease, the gathered difference with it', () => {
    expect(deltaMm(500, 480, null)).toBe(20);
    expect(deltaMm(600, 500, 1.2)).toBeCloseTo(0, 6);
    expect(deltaMm(0, 500, null)).toBe(0);
  });
  it('sums edges and inner lines of a side', () => {
    const geoms = new Map([['FP', rect('FP', 100, 200)]]);
    expect(targetsLen(['FP#0', 'FP#1', 'FP:i0'], geoms, () => 50)).toBe(350);
  });
});

describe('suggestPair', () => {
  it('offers the closest pair across the two inputs', () => {
    const geoms = new Map([
      ['FP', rect('FP', 300, 500)],
      ['BP', rect('BP', 310, 502)],
    ]);
    const s = suggestPair([{ pieces: ['FP'] }, { pieces: ['BP'] }], geoms, new Set(), null);
    expect(s).not.toBeNull();
    expect(s!.a[0].startsWith('FP#')).toBe(true);
    expect(s!.b[0].startsWith('BP#')).toBe(true);
    expect(Math.abs(s!.aLen - s!.bLen)).toBe(2);
  });
  it('offers nothing beyond 3 %, and skips edges this step already sews', () => {
    const geoms = new Map([
      ['FP', rect('FP', 100, 100)],
      ['BP', rect('BP', 200, 200)],
    ]);
    expect(
      suggestPair([{ pieces: ['FP'] }, { pieces: ['BP'] }], geoms, new Set(), null),
    ).toBeNull();
    const same = new Map([
      ['FP', rect('FP', 300, 500)],
      ['BP', rect('BP', 300, 500)],
    ]);
    const used = new Set(['FP#0', 'FP#1', 'FP#2', 'FP#3']);
    expect(suggestPair([{ pieces: ['FP'] }, { pieces: ['BP'] }], same, used, null)).toBeNull();
  });
  it('prefers a pair whose notch counts agree', () => {
    const geoms = new Map([
      ['FP', rect('FP', 300, 300, [[100], [], [], []])],
      ['BP', rect('BP', 300, 300, [[], [], [], [150]])],
    ]);
    const s = suggestPair([{ pieces: ['FP'] }, { pieces: ['BP'] }], geoms, new Set(), null)!;
    expect(s.a).toEqual(['FP#0']);
    expect(s.b).toEqual(['BP#3']);
  });
});

describe('surface seam rows', () => {
  const host = rect('SLV', 200, 400);
  it('anchors the inner line by edge hint i<k>, inside the host frame', () => {
    const a = innerAnchor(
      host,
      2,
      [
        [50, -100],
        [150, -100],
      ],
      0,
    )!;
    expect(a.edgeHint).toBe('i2');
    expect(a.lenMm).toBe(100);
    expect(a.piece).toBe('SLV');
    for (const [u, v] of a.samples) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(innerAnchor(host, 0, [[1, 1]], 0)).toBeNull();
  });
  it('writes one confirmed manual surface row with the placement on both sides', () => {
    const part = rect('FLP', 120, 60);
    const partAnchor = innerAnchor(
      part,
      0,
      [
        [0, 0],
        [120, 0],
      ],
      0,
    )!;
    const placement = { xMm: 40, yMm: 80, rotDeg: 90, flip: false };
    const row = surfaceRow(
      {
        geom: host,
        k: 0,
        line: [
          [20, -50],
          [180, -50],
        ],
        grainDeg: 0,
      },
      [{ ...partAnchor, edgeHint: '' }],
      placement,
      'seam-1',
    )!;
    expect(row).toMatchObject({
      seamKey: 'seam-1',
      kind: 'surface',
      status: 'confirmed',
      source: 'manual',
    });
    expect(row.sideA[0].edgeHint).toBe('i0');
    expect(row.sideA[0].placement).toEqual(placement);
    expect(row.sideB[0].placement).toEqual(placement);
    expect(rowWords(row, (p) => p.toLowerCase())).toBe('slv ↔ flp');
    expect(
      surfaceRow(
        {
          geom: host,
          k: 0,
          line: [
            [0, 0],
            [10, 0],
          ],
          grainDeg: 0,
        },
        [],
        undefined,
      ),
    ).toBeNull();
  });
  it('a part with no picked edge anchors on its longest edge', () => {
    expect(longestEdge(rect('FLP', 120, 60))).toBe('FLP#0');
    expect(longestEdge(undefined)).toBeNull();
  });
});

describe('dropKeys', () => {
  it('takes a deleted seam off every step and leaves the rest untouched', () => {
    const ops = [{ seamKeys: ['a', 'b'] }, { seamKeys: ['c'] }, {}];
    const next = dropKeys(ops, new Set(['a', 'c']))!;
    expect(next.map((o) => o.seamKeys ?? [])).toEqual([['b'], [], []]);
    expect(next[2]).toBe(ops[2]);
    expect(dropKeys(ops, new Set(['zzz']))).toBeNull();
  });
});
