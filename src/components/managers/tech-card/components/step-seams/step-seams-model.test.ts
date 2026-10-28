import { describe, expect, it } from 'vitest';

import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import type { EdgeAnchor, StoredSeam } from 'lib/seams';

import { CARD77_OPS, CARD77_PIECE_KEYS, card77Geoms, card77Step } from './card77.fixture';
import { CARD83_OPS, CARD83_PIECE_KEYS, card83Geoms, card83Step } from './card83.fixture';
import { CARD58_OPS, CARD58_PIECE_KEYS, card58Geoms, card58Step } from './card58.fixture';
import {
  deltaMm,
  dropKeys,
  easeOf,
  hasMultipleStepPieces,
  inputGroups,
  inputUnitsWithOuterEdges,
  innerAnchor,
  isJoinStep,
  longestEdge,
  proposalLabel,
  rowWords,
  sewnBeforeStep,
  sideOf,
  stepInputPieces,
  suggestPair,
  suggestStepPair,
  suggestStepPairs,
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

function storedSeam(
  key: string,
  a: string | readonly string[],
  b: string | readonly string[],
): StoredSeam {
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
    sideA: (typeof a === 'string' ? [a] : a).map(anchor),
    sideB: (typeof b === 'string' ? [b] : b).map(anchor),
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
  it('reads the step ratio as typed, comma included', () => {
    expect(easeOf({ fullnessRatio: '1,2' })).toBe(1.2);
    expect(easeOf({ fullnessRatio: 1.5 })).toBe(1.5);
    expect(easeOf({ fullnessRatio: '' })).toBeNull();
    expect(easeOf(undefined)).toBeNull();
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
    // The rows say what the earlier steps sewed: the armholes, alike in length, are no guess
    // beside a stored side seam.
    const suggestion = suggestStepPair(ops, 3, keys, geoms, used, null, rows)!;
    const pair = [...suggestion.a, ...suggestion.b];
    expect(pair.some((id) => id === 'FR#0' || id === 'BP#0')).toBe(true);
    expect(pair.some((id) => id === 'SLV_R#0' || id === 'SLV_L#0')).toBe(true);
  });

  it('400-like: prefers the shirt neckline to a collar stand edge', () => {
    const keys = new Set(['COLLAR', 'STAND', 'FRONT', 'BACK', 'SLEEVE']);
    const ops = [
      { inputKeys: ['COLLAR', 'STAND'], outputUnitKey: 'COLLAR_UNIT', seamKeys: ['collar'] },
      {
        inputKeys: ['FRONT', 'BACK', 'SLEEVE'],
        outputUnitKey: 'SHIRT',
        seamKeys: ['body', 'arm'],
      },
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
      ['BACK', shaped('BACK', 'Back', [{ len: 182, turn: -45 }, { len: 400 }, { len: 220 }])],
      [
        'SLEEVE',
        shaped('SLEEVE', 'Right sleeve', [{ len: 182, turn: 45 }, { len: 400 }, { len: 220 }], 'R'),
      ],
    ]);
    // The sleeve sits on the back's armhole by its row; the front's curve is the neckline.
    const rows = new Map([
      ['collar', storedSeam('collar', 'COLLAR#1', 'STAND#1')],
      ['body', storedSeam('body', 'FRONT#2', 'BACK#1')],
      ['arm', storedSeam('arm', 'SLEEVE#0', 'BACK#0')],
    ]);
    const suggestion = suggestStepPair(
      ops,
      2,
      keys,
      geoms,
      usedEdgesBeforeStep(ops, 2, rows),
      null,
      rows,
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

  // Card 83 lengths: the armhole is two edges (217 + 255) against a 492 cap, so no single
  // edge fits; a 449 side seam (18°) is near the cap's length but is not an armhole. These
  // shapes carry no corners, so no chain forms either (the real outlines below do).
  it('body + sleeve with no curve pair in the gate: no suggestion, not a side seam', () => {
    const keys = new Set(['FR', 'BP', 'SLV_R']);
    const ops = [
      { inputKeys: ['FR', 'BP'], outputUnitKey: 'BODY' },
      { inputKeys: ['BODY', 'SLV_R'], outputUnitKey: 'SHELL' },
    ];
    const geoms = new Map([
      [
        'FR',
        shaped('FR', 'FR', [
          { len: 217, turn: -321 },
          { len: 449, turn: -18 },
        ]),
      ],
      [
        'BP',
        shaped('BP', 'BP', [
          { len: 255, turn: -310 },
          { len: 449, turn: -14 },
        ]),
      ],
      [
        'SLV_R',
        shaped('SLV_R', 'SLV_R', [{ len: 492, turn: 113 }, { len: 436 }, { len: 342 }], 'R'),
      ],
    ]);
    expect(suggestStepPair(ops, 1, keys, geoms, new Set(), null)).toBeNull();
  });

  it('FL reads as a pocket flap by name, but as FR’s mirror twin it is a front', () => {
    const keys = new Set(['FR', 'FL', 'SLV_L']);
    const ops = [
      { inputKeys: ['FR', 'FL'], outputUnitKey: 'BODY' },
      { inputKeys: ['BODY', 'SLV_L'], outputUnitKey: 'SHELL' },
    ];
    const fl = shaped('FL', 'FL', [{ len: 470, turn: -320 }, { len: 449 }]);
    const geoms = new Map([
      ['FR', shaped('FR', 'FR', [{ len: 300, turn: -320 }, { len: 449 }])],
      ['FL', { ...fl, twinOf: [{ key: 'FR', kind: 'mirror' }] } as PieceGeom],
      ['SLV_L', shaped('SLV_L', 'SLV_L', [{ len: 472, turn: 115 }, { len: 436 }], 'L')],
    ]);
    const suggestion = suggestStepPair(ops, 1, keys, geoms, new Set(), null)!;
    expect([...suggestion.a, ...suggestion.b].sort()).toEqual(['FL#0', 'SLV_L#0']);
  });
});

/**
 * Card 83, the owner's shirt as beta holds it (card83.fixture): real outlines, notches, every
 * step. The seams below are the ones a sewer would name.
 */
describe('card 58: the panels of one front', () => {
  const geoms = card58Geoms();
  const keys = CARD58_PIECE_KEYS;
  const ops = CARD58_OPS;
  const at = card58Step;

  it('80: three panels of the left front — fronts of ONE hand — meet edge to edge', () => {
    const props = suggestStepPairs(ops, at(80), keys, geoms, new Set(), null);
    expect(props.length).toBeGreaterThanOrEqual(1);
    for (const p of props) {
      for (const id of [...p.a, ...p.b]) expect(id).toMatch(/^FP(_[12])?_L#\d+$/);
      expect(p.a[0].split('#')[0]).not.toBe(p.b[0].split('#')[0]);
    }
  });

  it('80: the panels meet side by side — never hem to hem by an equal width', () => {
    // All three panels end in a 39.5 mm hem: equal lengths, no seam. FP_L's long side meets
    // FP_1_L's free long side, which reads as straight against a hooked end and scores worse.
    const props = suggestStepPairs(ops, at(80), keys, geoms, new Set(), null);
    expect(props.map((p) => [...p.a, ...p.b])).toEqual([
      ['FP_1_L#0', 'FP_2_L#2'],
      ['FP_L#0', 'FP_1_L#2'],
    ]);
    expect(props[1].aLen).toBeCloseTo(481.7, 0);
    expect(props[1].bLen).toBeCloseTo(454.8, 0);
  });

  it('140: the sewn left front panel meets the left front', () => {
    const s = suggestStepPair(ops, at(140), keys, geoms, new Set(), null);
    expect(s).not.toBeNull();
    const ids = [...s!.a, ...s!.b];
    expect(ids.some((id) => id.startsWith('FRONT_L#'))).toBe(true);
    expect(ids.some((id) => /^FP(_[12])?_L#/.test(id))).toBe(true);
  });
});

describe('card 83: chains across the seams earlier steps made', () => {
  const geoms = card83Geoms();
  const keys = CARD83_PIECE_KEYS;
  const ops = CARD83_OPS;
  const at = card83Step;
  const suggest = (op: number, used: Iterable<string> = []) =>
    suggestStepPair(ops, at(op), keys, geoms, new Set(used), null);
  const sorted = (xs: readonly string[]) => [...xs].sort();

  it('370: the whole armhole, front + back across side and shoulder seams, meets the sleeve cap', () => {
    // The back armhole alone fits half the cap (its notches align there): the whole armhole,
    // aligned end to end — the cap's shoulder notch at the junction — must win.
    const s = suggest(370)!;
    expect(sorted(s.a)).toEqual(['BP#4', 'FL#1']);
    expect(s.b).toEqual(['SLV_L#0']);
    expect(s.aLen).toBeCloseTo(466.5, 0);
    expect(s.bLen).toBeCloseTo(469, 0);
    // The picker, once that pair is taken: the other armhole and the other sleeve — a closed run
    // (shoulder and side seam both sewn) opened at the underarm, where the cap's notches read.
    const next = suggest(370, [...s.a, ...s.b])!;
    expect(sorted(next.a)).toEqual(['BP#0', 'FR#3']);
    expect(next.b).toEqual(['SLV_R#1']);
    expect(next.aLen).toBeCloseTo(466.5, 0);
    expect(next.bLen).toBeCloseTo(469, 0);
    expect(suggestionWords(next, (p) => p)).toMatch(/^(BP-0 \+ FR-3|FR-3 \+ BP-0) ↔ SLV_R-1$/);
  });

  it('370: the step sews both armholes, so a later step sees both sleeves on the body', () => {
    const sewn = sewnBeforeStep(ops, at(400), keys, geoms);
    const arms = sewn.filter((p) => /^SLV_[LR]#/.test(p.b[0] ?? '') && !/^SLV_/.test(p.a[0] ?? ''));
    expect(arms.map((p) => [sorted(p.a), p.b, p.own])).toEqual([
      [['BP#4', 'FL#1'], ['SLV_L#0'], true],
      [['BP#0', 'FR#3'], ['SLV_R#1'], true],
    ]);
  });

  it('400: the collar stand meets the neckline by its notches; the front folds and the back pleat stay out', () => {
    const s = suggest(400)!;
    expect(s.a).toEqual(['CLR_1#6']);
    expect(s.b).toEqual(['FR#1', 'BP#2', 'FL#3']);
    // Edge to edge the neckline is 579 mm against 439 — a quarter of it is two 35 mm fold-backs
    // and a 70 mm box pleat between notches; sewn, the two sides are the same length.
    expect(s.aLen).toBeCloseTo(439.2, 0);
    expect(s.bLen).toBeCloseTo(439.3, 0);
    expect(targetsLen(s.b, geoms, () => 0)).toBeCloseTo(579.3, 0);
  });

  it('50: identical collar layers are sewn along their outer edge, the neck edge left for the body', () => {
    expect(suggest(50)).toMatchObject({ a: ['CLR_1#2'], b: ['CLR#2'] });
    expect(sewnBeforeStep(ops, at(130), keys, geoms)).toMatchObject([
      { a: ['CLR_1#2'], b: ['CLR#2'], layer: true },
    ]);
  });

  it('single-edge steps keep their answers; a three-input step offers one seam per side, left first', () => {
    expect(suggest(130)).toMatchObject({ a: ['PLCK#0'], b: ['FL#4'] });
    const sides = suggestStepPairs(ops, at(200), keys, geoms, new Set(), null);
    expect(sides.map((p) => [p.hand, ...p.a, ...p.b])).toEqual([
      ['L', 'FL#0', 'BP#5'],
      ['R', 'FR#4', 'BP#7'],
    ]);
  });

  it('a cuff: its layers sewn along one long edge, the sleeve onto the other', () => {
    // A 272.5 × 140 rectangle: which long edge the layer seam takes is a tie (the beta DXF
    // reads #0, the rounded fixture #2); the sleeve must get the one left free.
    const cuffR = suggest(230)!;
    expect(cuffR.a[0]).toMatch(/^SLV_M_R#[02]$/);
    expect(cuffR.b).toEqual([cuffR.a[0].replace('SLV_M_R#', 'SLV_M_R_1#')]);
    expect(cuffR.aLen).toBeCloseTo(272.5, 0);
    const sleeveR = suggest(280)!;
    expect(sleeveR.a).toEqual(['SLV_R#3']);
    expect(sleeveR.b[0]).toMatch(/^SLV_M_R#[02]$/);
    expect(sleeveR.b[0]).not.toBe(cuffR.a[0]);
    expect(sleeveR.aLen).toBeCloseTo(325, 0);
    expect(sleeveR.bLen).toBeCloseTo(272.5, 0);
    const cuffL = suggest(310)!;
    expect(cuffL.a[0]).toMatch(/^SLV_M_L#[13]$/);
    expect(cuffL.b[0]).toMatch(/^SLV_M_L_1#[02]$/);
    const sleeveL = suggest(360)!;
    expect(sleeveL.a).toEqual(['SLV_L#2']);
    expect(sleeveL.b[0]).toMatch(/^SLV_M_L#[13]$/);
    expect(sleeveL.b[0]).not.toBe(cuffL.a[0]);
  });

  it('260 / 340: a sleeve closed on itself is a join of one input — its underarm seam', () => {
    expect(isJoinStep(ops, at(260), keys, geoms)).toBe(true);
    expect(suggest(260)).toMatchObject({ a: ['SLV_R#0'], b: ['SLV_R#2'] });
    expect(suggest(260)!.aLen).toBeCloseTo(418.5, 0);
    expect(suggest(340)).toMatchObject({ a: ['SLV_L#1'], b: ['SLV_L#3'] });
    // A back on its own has no such seam.
    expect(isJoinStep(ops, at(180), keys, geoms)).toBe(false);
    expect(suggest(180)).toBeNull();
  });

  it('press, fuse, button and topstitch steps sew no seam', () => {
    for (const op of [20, 60, 70, 120, 190, 270, 380, 390, 430, 440, 450]) {
      expect(isJoinStep(ops, at(op), keys, geoms)).toBe(false);
      expect(suggest(op)).toBeNull();
    }
  });

  it('stored seams are junctions too; the neck run stops at the fronts, not on the placket', () => {
    const rows = new Map([
      ['placket', storedSeam('placket', 'PLCK#0', 'FL#4')],
      ['side', storedSeam('side', 'FR#4', 'BP#7')],
    ]);
    const stored = ops.map((op) =>
      op.operationNumber === 130
        ? { ...op, seamKeys: ['placket'] }
        : op.operationNumber === 200
          ? { ...op, seamKeys: ['side'] }
          : op,
    );
    const arm = suggestStepPair(
      stored,
      at(370),
      keys,
      geoms,
      usedEdgesBeforeStep(stored, at(370), rows),
      null,
      rows,
    )!;
    expect([arm.a.length, arm.b.length]).toEqual([2, 1]);
    const neck = suggestStepPair(
      stored,
      at(400),
      keys,
      geoms,
      usedEdgesBeforeStep(stored, at(400), rows),
      null,
      rows,
    )!;
    expect(neck.a).toEqual(['CLR_1#6']);
    expect(neck.b).toEqual(['FR#1', 'BP#2', 'FL#3']);
  });

  it('without the step list a chain crosses no seam: the back armhole alone takes half the cap', () => {
    const s = suggestPair(
      [{ pieces: ['FR', 'BP'] }, { pieces: ['SLV_R'] }],
      geoms,
      new Set(),
      null,
    )!;
    expect(s.a).toEqual(['BP#0']);
    expect(s.b).toEqual(['SLV_R#1']);
    // Read by the notches: the cap's back half, not its 469 mm.
    expect(s.aLen).toBeGreaterThan(240);
    expect(s.aLen).toBeLessThan(260);
    expect(s.bLen).toBeGreaterThan(240);
    expect(s.bLen).toBeLessThan(260);
  });
});

/**
 * Card 77, the owner's «starvation» shirt as beta holds it (card77.fixture; card 85 is its copy):
 * a yoke of two identical layers, fronts of an upper and a lower panel, pocket bags, sleeves with
 * plackets. The armhole is a chain of four edges across three units' seams, none of them stored.
 */
describe('card 77: both sleeves on their armholes, one proposal per side', () => {
  const geoms = card77Geoms();
  const keys = CARD77_PIECE_KEYS;
  const ops = CARD77_OPS;
  const at = card77Step;
  const sorted = (xs: readonly string[]) => [...xs].sort();
  const proposals = (op: number) => suggestStepPairs(ops, at(op), keys, geoms, new Set(), null);

  it('270: the yoke goes on the back along its straight edge, not the side seam of a nearer length', () => {
    // 484.9 straight against a 484.8 gentle curve (68°), not 512.5 against 512.5 — a yoke seam is
    // a straight edge on a shaped one; only the lengths that agree closely enough are a seam.
    const s = suggestStepPair(ops, at(270), keys, geoms, new Set(), null)!;
    expect(sorted([...s.a, ...s.b])).toEqual(['BP_MAIN#1', 'BP_U#5']);
  });

  it('1020: each sleeve cap meets the whole armhole of its side — back, yoke, upper and lower front', () => {
    const all = proposals(1020);
    expect(all.map((p, i) => proposalLabel(p, i)).sort()).toEqual(['left', 'right']);
    const left = all.find((p) => p.hand === 'L')!;
    const right = all.find((p) => p.hand === 'R')!;
    const sides = (p: { a: string[]; b: string[] }) =>
      [p.a, p.b].sort((x, y) => x.length - y.length).map(sorted);
    expect(sides(left)).toEqual([['SLV_L#1'], ['BP_MAIN#2', 'BP_U_1#4', 'P_L_MAIN#0', 'P_L_U#4']]);
    expect(sides(right)).toEqual([['SLV_R#0'], ['BP_MAIN#0', 'BP_U_1#0', 'P_R_MAIN#2', 'P_R_U#3']]);
    for (const p of [left, right]) {
      expect(p.aLen).toBeCloseTo(541, 0);
      expect(p.bLen).toBeCloseTo(541, 0);
    }
  });

  it('1020: no proposal joins the two sleeves to each other', () => {
    for (const p of proposals(1020)) {
      const sleeves = [...p.a, ...p.b].filter((id) => /^SLV_/.test(id));
      expect(sleeves).toHaveLength(1);
    }
  });
});

describe('join steps by type and work', () => {
  const pieces = new Set(['FP', 'BP']);
  const two = (extra: object) => [{ inputKeys: ['FP', 'BP'], ...extra }];

  it('a press, a fuse or a button step over two inputs is no join', () => {
    expect(isJoinStep(two({ operationType: 'TECH_CARD_OPERATION_TYPE_PRESS' }), 0, pieces)).toBe(
      false,
    );
    expect(isJoinStep(two({ operationType: 'TECH_CARD_OPERATION_TYPE_FUSING' }), 0, pieces)).toBe(
      false,
    );
    expect(
      isJoinStep(
        two({ operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE', work: 'fuse' }),
        0,
        pieces,
      ),
    ).toBe(false);
    expect(
      isJoinStep(
        two({ operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE', work: 'button_attach' }),
        0,
        pieces,
      ),
    ).toBe(false);
    expect(hasMultipleStepPieces(two({ operationType: 'press' }), 0, pieces)).toBe(false);
  });

  it('a machine step, a step with no type, or any step with a seam row stays a join', () => {
    expect(isJoinStep(two({ operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE' }), 0, pieces)).toBe(
      true,
    );
    expect(isJoinStep(two({}), 0, pieces)).toBe(true);
    expect(
      isJoinStep(
        two({ operationType: 'TECH_CARD_OPERATION_TYPE_PRESS', seamKeys: ['s'] }),
        0,
        pieces,
      ),
    ).toBe(true);
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
