import { describe, expect, it } from 'vitest';

import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import type { EdgeAnchor, StoredSeam } from 'lib/seams';

import {
  deltaMm,
  dropKeys,
  hasMultipleStepPieces,
  inputGroups,
  inputUnitsWithOuterEdges,
  innerAnchor,
  isJoinStep,
  longestEdge,
  rowWords,
  sideOf,
  stepInputPieces,
  suggestPair,
  suggestStepPair,
  suggestionWords,
  surfaceRow,
  targetsLen,
  usedEdgesBeforeStep,
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
    twinOf: [],
  } as unknown as PieceGeom;
}

function shaped(
  key: string,
  name: string,
  edges: readonly { len: number; turn?: number; notches?: number[] }[],
  hand: PieceGeom['hand'] = null,
): PieceGeom {
  const base = rect(key, 100, 100);
  const shapedEdges = edges.map(
    ({ len, turn = 0, notches = [] }, k): Edge => ({
      ...base.edges[k % base.edges.length],
      id: `${key}#${k}`,
      pieceKey: key,
      k,
      s: k,
      e: k + 1,
      pts: [
        [0, k * 10],
        [len, k * 10],
      ],
      lenMm: len,
      chordMm: turn ? len * 0.9 : len,
      turnDeg: turn,
      notchesMm: notches,
    }),
  );
  return {
    ...base,
    name,
    hand,
    edges: shapedEdges,
    perimMm: shapedEdges.reduce((sum, edge) => sum + edge.lenMm, 0),
  };
}

function storedSeam(key: string, a: string, b: string): StoredSeam {
  const anchor = (hint: string): EdgeAnchor => ({
    piece: hint.slice(0, hint.lastIndexOf('#')),
    samples: [
      [0, 0],
      [0.25, 0],
      [0.5, 0],
      [0.75, 0],
      [1, 0],
    ],
    perimShare: 0.25,
    lenMm: 100,
    notches: 0,
    turnDeg: 0,
    range: [0, 1],
    edgeHint: hint,
    contourSig: 'same',
  });
  return {
    seamKey: key,
    status: 'confirmed',
    kind: 'edge',
    direction: 'reversed',
    source: 'manual',
    sideA: [anchor(a)],
    sideB: [anchor(b)],
    anchoredSize: '',
    note: '',
  };
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

describe('step seam eligibility', () => {
  const pieces = new Set(['FP', 'BP']);

  it('does not show a seam row when WITH is one already assembled unit', () => {
    const ops = [{ inputKeys: ['FP', 'BP'], outputUnitKey: 'BODY' }, { inputKeys: ['FP', 'BP'] }];
    expect(stepInputPieces(ops, 1, pieces)).toEqual(['FP', 'BP']);
    expect(inputGroups(ops, 1, pieces)).toEqual([{ key: 'BODY', pieces: ['FP', 'BP'] }]);
    expect(isJoinStep(ops, 1, pieces)).toBe(false);
    expect(hasMultipleStepPieces(ops, 1, pieces)).toBe(false);
  });

  it('recognises two separate live inputs as a join', () => {
    expect(isJoinStep([{ inputKeys: ['FP', 'BP'] }], 0, pieces)).toBe(true);
  });

  it('does not count materials, photos, duplicates, or unresolved keys as pieces', () => {
    const ops = [
      {
        inputKeys: ['FP', 'FP', 'GHOST'],
        bomLineKeys: ['THREAD'],
        media: [{ mediaId: 4 }],
      },
    ];
    expect(stepInputPieces(ops, 0, pieces)).toEqual(['FP']);
    expect(hasMultipleStepPieces(ops, 0, pieces)).toBe(false);
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

describe('suggestStepPair', () => {
  it('uses the shared WITH gate and produces the compact row words', () => {
    const pieces = new Set(['BP_U', 'BP_MAIN']);
    const geoms = new Map([
      ['BP_U', rect('BP_U', 300, 500)],
      ['BP_MAIN', rect('BP_MAIN', 310, 502)],
    ]);
    const suggestion = suggestStepPair(
      [{ inputKeys: ['BP_U', 'BP_MAIN'] }],
      0,
      pieces,
      geoms,
      new Set(),
      null,
    )!;
    expect(suggestionWords(suggestion, (piece) => piece)).toMatch(/^BP_U-\d+ ↔ BP_MAIN-\d+$/);
    expect(
      suggestStepPair([{ inputKeys: ['BP_U'] }], 0, pieces, geoms, new Set(), null),
    ).toBeNull();
  });

  it('370-like: picks a body armhole and sleeve cap across three input units', () => {
    const keys = new Set(['FR', 'BP', 'SLV_R', 'R_PANEL', 'SLV_L', 'L_PANEL']);
    const ops = [
      { inputKeys: ['FR', 'BP'], outputUnitKey: 'BODY', seamKeys: ['body'] },
      { inputKeys: ['SLV_R', 'R_PANEL'], outputUnitKey: 'RIGHT_SLEEVE', seamKeys: ['right'] },
      { inputKeys: ['SLV_L', 'L_PANEL'], outputUnitKey: 'LEFT_SLEEVE', seamKeys: ['left'] },
      { inputKeys: ['BODY', 'RIGHT_SLEEVE', 'LEFT_SLEEVE'], outputUnitKey: 'SHELL' },
    ];
    const geoms = new Map([
      ['FR', shaped('FR', 'Right front', [{ len: 160, turn: -70 }, { len: 410 }, { len: 230 }])],
      ['BP', shaped('BP', 'Back', [{ len: 164, turn: -55 }, { len: 405 }, { len: 235 }])],
      [
        'SLV_R',
        shaped('SLV_R', 'Right sleeve', [{ len: 162, turn: 75 }, { len: 410 }, { len: 225 }], 'R'),
      ],
      [
        'R_PANEL',
        shaped('R_PANEL', 'Right sleeve panel', [{ len: 90 }, { len: 410 }, { len: 230 }], 'R'),
      ],
      [
        'SLV_L',
        shaped('SLV_L', 'Left sleeve', [{ len: 161, turn: 75 }, { len: 408 }, { len: 226 }], 'L'),
      ],
      [
        'L_PANEL',
        shaped('L_PANEL', 'Left sleeve panel', [{ len: 92 }, { len: 408 }, { len: 232 }], 'L'),
      ],
    ]);
    const rows = new Map([
      ['body', storedSeam('body', 'FR#1', 'BP#1')],
      ['right', storedSeam('right', 'SLV_R#1', 'R_PANEL#1')],
      ['left', storedSeam('left', 'SLV_L#1', 'L_PANEL#1')],
    ]);
    const used = usedEdgesBeforeStep(ops, 3, rows);
    expect(inputUnitsWithOuterEdges(ops, 3, keys, geoms, used)).toHaveLength(3);
    expect(
      inputUnitsWithOuterEdges(ops, 3, keys, geoms, used)[0].edges.map((edge) => edge.id),
    ).not.toContain('FR#1');
    const suggestion = suggestStepPair(ops, 3, keys, geoms, used, null)!;
    const pair = [...suggestion.a, ...suggestion.b];
    expect(pair.some((id) => id === 'FR#0' || id === 'BP#0')).toBe(true);
    expect(pair.some((id) => id === 'SLV_R#0' || id === 'SLV_L#0')).toBe(true);
  });

  it('400-like: prefers the shirt neckline to a collar stand edge', () => {
    const keys = new Set(['COLLAR', 'STAND', 'FRONT', 'BACK', 'SLEEVE']);
    const ops = [
      { inputKeys: ['COLLAR', 'STAND'], outputUnitKey: 'COLLAR_UNIT', seamKeys: ['collar'] },
      { inputKeys: ['FRONT', 'BACK', 'SLEEVE'], outputUnitKey: 'SHIRT', seamKeys: ['body'] },
      { inputKeys: ['COLLAR_UNIT', 'SHIRT'], outputUnitKey: 'GARMENT' },
    ];
    const geoms = new Map([
      ['COLLAR', shaped('COLLAR', 'Collar', [{ len: 250 }, { len: 210 }, { len: 100 }])],
      [
        'STAND',
        shaped('STAND', 'Collar stand', [{ len: 182, turn: 45 }, { len: 210 }, { len: 95 }]),
      ],
      [
        'FRONT',
        shaped('FRONT', 'Right front', [{ len: 180, turn: -45 }, { len: 182 }, { len: 390 }]),
      ],
      ['BACK', shaped('BACK', 'Back', [{ len: 280 }, { len: 400 }, { len: 220 }])],
      [
        'SLEEVE',
        shaped('SLEEVE', 'Right sleeve', [{ len: 182, turn: 45 }, { len: 400 }, { len: 220 }], 'R'),
      ],
    ]);
    const rows = new Map([
      ['collar', storedSeam('collar', 'COLLAR#1', 'STAND#1')],
      ['body', storedSeam('body', 'FRONT#2', 'BACK#1')],
    ]);
    const suggestion = suggestStepPair(
      ops,
      2,
      keys,
      geoms,
      usedEdgesBeforeStep(ops, 2, rows),
      null,
    )!;
    expect(suggestion.a).toEqual(['STAND#0']);
    expect(suggestion.b).toEqual(['FRONT#0']);
  });

  it('280-like: proposes a sleeve-to-cuff seam beyond the old three-percent gate', () => {
    const keys = new Set(['SLV_R', 'CUFF_OUT', 'CUFF_IN']);
    const ops = [
      { inputKeys: ['CUFF_OUT', 'CUFF_IN'], outputUnitKey: 'CUFF_UNIT', seamKeys: ['cuff'] },
      { inputKeys: ['SLV_R', 'CUFF_UNIT'], outputUnitKey: 'SLEEVE_UNIT' },
    ];
    const geoms = new Map([
      ['SLV_R', shaped('SLV_R', 'Right sleeve', [{ len: 120 }, { len: 400 }, { len: 220 }], 'R')],
      [
        'CUFF_OUT',
        shaped('CUFF_OUT', 'Cuff outer', [{ len: 100 }, { len: 132 }, { len: 70 }], 'R'),
      ],
      ['CUFF_IN', shaped('CUFF_IN', 'Cuff inner', [{ len: 100 }, { len: 145 }, { len: 80 }], 'R')],
    ]);
    const rows = new Map([['cuff', storedSeam('cuff', 'CUFF_OUT#0', 'CUFF_IN#0')]]);
    const suggestion = suggestStepPair(
      ops,
      1,
      keys,
      geoms,
      usedEdgesBeforeStep(ops, 1, rows),
      null,
    );
    expect(suggestion).not.toBeNull();
    expect([...suggestion!.a, ...suggestion!.b]).toContain('SLV_R#0');
  });

  it('200-like: never pairs the right front to the left front', () => {
    const keys = new Set(['FR', 'FL', 'PLCK', 'BP']);
    const ops = [
      { inputKeys: ['PLCK', 'FL'], outputUnitKey: 'LEFT_FRONT', seamKeys: ['placket'] },
      { inputKeys: ['FR', 'PLCK', 'FL', 'BP'], outputUnitKey: 'BODY' },
    ];
    const geoms = new Map([
      ['FR', shaped('FR', 'Right front', [{ len: 200 }, { len: 410 }, { len: 510 }], 'R')],
      ['FL', shaped('FL', 'Left front', [{ len: 150 }, { len: 200 }, { len: 490 }], 'L')],
      ['PLCK', shaped('PLCK', 'Placket', [{ len: 150 }, { len: 70 }, { len: 80 }], 'L')],
      ['BP', shaped('BP', 'Back', [{ len: 206 }, { len: 430 }, { len: 530 }])],
    ]);
    const rows = new Map([['placket', storedSeam('placket', 'PLCK#0', 'FL#0')]]);
    const suggestion = suggestStepPair(
      ops,
      1,
      keys,
      geoms,
      usedEdgesBeforeStep(ops, 1, rows),
      null,
    )!;
    const pieces = [...suggestion.a, ...suggestion.b].map((id) => id.slice(0, id.lastIndexOf('#')));
    expect(pieces).toContain('BP');
    expect(new Set(pieces)).not.toEqual(new Set(['FR', 'FL']));
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
