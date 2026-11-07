import { describe, expect, it } from 'vitest';

import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type {
  PieceGeom,
  PieceMark,
  Pt2,
  SeamCandidate,
  SeamEvidence,
  SeamGraph,
  SkeletonFacts,
  SkeletonPieceInput,
} from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { seamFromCandidate } from 'lib/seams';

import {
  type DeclaredFastening,
  fasteningsFromOps,
  freeSideOf,
  inColumnOrder,
  inferredPlacketFolds,
  largestColumns,
  locateIn,
  pairFastenings,
  readAt,
  spreadPast,
  stencilPast,
} from './buttons';
import { solveDoll } from './doll';
import type { DollFold, DollOptions, DollReport } from './types';

const toMark = (key: string, i: number, [x, y]: Pt2, kind: PieceMark['kind'] = 'drill') =>
  ({
    id: `${key}@${i}`,
    kind,
    layer: '',
    closed: true,
    pts: [],
    bbox: { w: 3, h: 3, cx: x, cy: y },
    lenMm: 10,
  }) as PieceMark;

const column = (x: number, ys: readonly number[]): Pt2[] => ys.map((y): Pt2 => [x, y]);
const EVEN = [100, 200, 300, 400, 500, 600, 700];

describe('pairFastenings', () => {
  const geoms = (rows: Record<string, { name?: string; marks: Pt2[] }>) => {
    const by = new Map(
      Object.entries(rows).map(([pieceKey, r]): [string, PieceGeom] => [
        pieceKey,
        {
          pieceKey,
          name: r.name ?? pieceKey,
          marks: r.marks.map((m, i) => toMark(pieceKey, i, m)),
        } as unknown as PieceGeom,
      ]),
    );
    return (key: string) => by.get(key);
  };
  const holes = (step: number, count: number, ...pieces: string[]): DeclaredFastening => ({
    side: 'holes',
    step,
    count,
    pieces,
  });
  const buttons = (step: number, count: number, ...pieces: string[]): DeclaredFastening => ({
    side: 'buttons',
    step,
    count,
    pieces,
  });

  it('proposes a midline placket fold and turns the half without the button line under', () => {
    const strip = (pieceKey: string, name: string, width: number, x: number): PieceGeom =>
      ({
        pieceKey,
        name,
        rs: [
          [0, 0],
          [width, 0],
          [width, 700],
          [0, 700],
        ],
        marks: column(x, [100, 250, 400, 550]).map((mark, i) => toMark(pieceKey, i, mark)),
      }) as unknown as PieceGeom;
    const byKey = new Map([
      ['left', strip('left', 'PLCK_L', 100, 62)],
      ['right', strip('right', 'PLCK_R', 50, 12.5)],
    ]);
    const folds = inferredPlacketFolds([holes(1, 4, 'left'), buttons(2, 4, 'right')], (key) =>
      byKey.get(key),
    );
    expect(folds.map(({ piece, fold }) => [piece, fold.a, fold.b, fold.flipAt])).toEqual([
      ['left', [0.5, 0], [0.5, 1], [0.1, 0.5]],
      ['right', [0.5, 0], [0.5, 1], [0.9, 0.5]],
    ]);
    expect(
      inferredPlacketFolds(
        [holes(1, 4, 'left'), buttons(2, 4, 'right')],
        (key) => byKey.get(key),
        (key) => key === 'left',
      ).map((fold) => fold.piece),
    ).toEqual(['right']);
  });

  it('pairs by the steps and their marks: a name that says the opposite changes nothing', () => {
    const steps = [holes(120, 7, 'a'), buttons(200, 7, 'b')];
    const plain = pairFastenings(
      steps,
      geoms({ a: { marks: column(20, EVEN) }, b: { marks: column(50, EVEN) } }),
    );
    const misnamed = pairFastenings(
      steps,
      geoms({
        a: { name: 'BUTTON STAND', marks: column(20, EVEN) },
        b: { name: 'HOLE PLACKET LEFT', marks: column(50, EVEN) },
      }),
    );
    for (const read of [plain, misnamed]) {
      expect(read.refused).toEqual([]);
      expect(read.pairs).toHaveLength(1);
      expect(read.pairs[0].holes.piece).toBe('a');
      expect(read.pairs[0].buttons.piece).toBe('b');
      expect(read.pairs[0].count).toBe(7);
      expect(read.pairs[0].holes.marks).toEqual(column(20, EVEN));
    }
    expect(misnamed.pairs).toEqual(plain.pairs);
  });

  it('finds the piece with the marks inside a unit', () => {
    const read = pairFastenings(
      [holes(1, 7, 'x', 'a'), buttons(2, 7, 'b', 'y')],
      geoms({
        a: { marks: column(20, EVEN) },
        b: { marks: column(50, EVEN) },
        x: { marks: [] },
        y: { marks: [[1, 1]] },
      }),
    );
    expect(read.pairs.map((p) => [p.holes.piece, p.buttons.piece])).toEqual([['a', 'b']]);
  });

  it('a count spread over a placket and its pocket fastens the placket column and says the rest', () => {
    // «8 buttonholes» on the front with its pocket: 7 down the placket, the 8th on the pocket flap.
    const read = pairFastenings(
      [holes(750, 8, 'pl', 'pk', 'fl'), buttons(860, 8, 'pr', 'qk', 'fr')],
      geoms({
        pl: { name: 'PLCK_L', marks: column(20, EVEN) },
        pk: { name: 'PCK_L', marks: [[300, 250]] },
        fl: { marks: [] },
        pr: { name: 'PLCK_R', marks: column(50, EVEN) },
        qk: { name: 'PCK_R', marks: [[300, 250]] },
        fr: { marks: [] },
      }),
    );
    expect(read.refused).toEqual([]);
    expect(read.pairs).toHaveLength(1);
    const [pair] = read.pairs;
    expect([pair.holes.piece, pair.buttons.piece, pair.count]).toEqual(['pl', 'pr', 7]);
    expect(pair.holes.marks).toEqual(column(20, EVEN));
    expect(pair.holes.apart).toBe('the step says 8: 7 on PLCK_L, 1 on PCK_L');
    expect(pair.buttons.apart).toBe('the step says 8: 7 on PLCK_R, 1 on PCK_R');
  });

  it('a count spread evenly over two parts stays refused: no column holds most of it', () => {
    const read = pairFastenings(
      [holes(1, 8, 'a', 'c'), buttons(2, 8, 'b', 'd')],
      geoms({
        a: { marks: column(20, [100, 200, 300, 400]) },
        c: { marks: column(20, [500, 600, 700, 800]) },
        b: { marks: column(50, EVEN.concat(800)) },
        d: { marks: [] },
      }),
    );
    expect(read.pairs).toEqual([]);
    expect(read.refused[0]).toBe('step 1 (8 buttonholes on a, c): a has 4 marks, c has 4 marks');
  });

  it('refuses counts that differ, and says both', () => {
    const read = pairFastenings(
      [holes(120, 7, 'a'), buttons(200, 6, 'b')],
      geoms({ a: { marks: column(20, EVEN) }, b: { marks: column(50, EVEN.slice(0, 6)) } }),
    );
    expect(read.pairs).toEqual([]);
    expect(read.refused).toEqual(['step 120 says 7 buttonholes, step 200 says 6 buttons']);
  });

  it('refuses a step with no count, a step with no marks, a step with too few', () => {
    const noCount = pairFastenings([holes(1, 0, 'a')], geoms({ a: { marks: column(20, EVEN) } }));
    expect(noCount.refused).toEqual(['step 1 (buttonholes) does not say how many']);

    const none = pairFastenings(
      [holes(1, 7, 'a'), buttons(2, 7, 'b')],
      geoms({ a: { marks: [] }, b: { marks: column(50, EVEN) } }),
    );
    expect(none.pairs).toEqual([]);
    expect(none.refused).toEqual(['step 1 (7 buttonholes on a): no marks on the pattern']);

    const few = pairFastenings(
      [holes(1, 7, 'a'), buttons(2, 7, 'b')],
      geoms({ a: { marks: column(20, EVEN.slice(0, 5)) }, b: { marks: column(50, EVEN) } }),
    );
    expect(few.pairs).toEqual([]);
    expect(few.refused).toEqual(['step 1 (7 buttonholes on a): a has 5 marks']);
  });

  it('refuses the same part on both sides, by input and by marks', () => {
    const marks = geoms({ a: { marks: column(20, EVEN) }, b: { marks: [] }, c: { marks: [] } });
    const sameInput = pairFastenings([holes(1, 7, 'a'), buttons(2, 7, 'a')], marks);
    expect(sameInput.pairs).toEqual([]);
    expect(sameInput.refused).toEqual(['steps 1 and 2: holes and buttons on the same part (a)']);

    const sameMarks = pairFastenings([holes(1, 7, 'a', 'b'), buttons(2, 7, 'a', 'c')], marks);
    expect(sameMarks.pairs).toEqual([]);
    expect(sameMarks.refused).toEqual(['steps 1 and 2: holes and buttons on the same part (a)']);
  });

  it('refuses a step that does not say which of two parts carries them', () => {
    const read = pairFastenings(
      [holes(1, 7, 'a', 'a2'), buttons(2, 7, 'b')],
      geoms({
        a: { marks: column(20, EVEN) },
        a2: { marks: column(30, EVEN) },
        b: { marks: column(50, EVEN) },
      }),
    );
    expect(read.pairs).toEqual([]);
    expect(read.refused[0]).toContain('a and a2 both carry them');
  });

  it('refuses holes and buttons spaced differently', () => {
    const read = pairFastenings(
      [holes(1, 3, 'a'), buttons(2, 3, 'b')],
      geoms({ a: { marks: column(20, [0, 100, 200]) }, b: { marks: column(50, [0, 40, 80]) } }),
    );
    expect(read.pairs).toEqual([]);
    expect(read.refused[0]).toContain('spaced differently');
  });

  it('two sets of one count pair only when the marks leave one way', () => {
    const wide = [0, 100, 200, 300];
    const tight = [0, 60, 120, 180];
    const steps = [holes(1, 4, 'h1'), holes(2, 4, 'h2'), buttons(3, 4, 'b1'), buttons(4, 4, 'b2')];
    const one = pairFastenings(
      steps,
      geoms({
        h1: { marks: column(20, wide) },
        h2: { marks: column(20, tight) },
        b1: { marks: column(50, tight) },
        b2: { marks: column(50, wide) },
      }),
    );
    expect(one.refused).toEqual([]);
    expect(one.pairs.map((p) => [p.holes.piece, p.buttons.piece])).toEqual([
      ['h1', 'b2'],
      ['h2', 'b1'],
    ]);

    const both = pairFastenings(
      steps,
      geoms({
        h1: { marks: column(20, wide) },
        h2: { marks: column(20, wide) },
        b1: { marks: column(50, wide) },
        b2: { marks: column(50, wide) },
      }),
    );
    expect(both.pairs).toEqual([]);
    expect(both.refused).toEqual([
      'steps 1, 2, 3, 4: 2 sets of 4, and the marks do not say which holes go with which buttons',
    ]);
  });

  it('marks past the count: only the one run spaced as the other side', () => {
    const drawn = [37.8, 62.8, 87.8, 162.3, 241.8, 311.3, 385.7, 460.2, 534.7];
    const sewn = [88.4, 163, 243, 317, 390, 465, 539];
    const read = pairFastenings(
      [holes(1, 7, 'a'), buttons(2, 7, 'b')],
      geoms({ a: { marks: column(16, drawn) }, b: { marks: column(52, sewn) } }),
    );
    expect(read.refused).toEqual([]);
    expect(read.pairs[0].holes.marks).toEqual(column(16, drawn.slice(2)));
    expect(read.pairs[0].holes.unused).toBe(2);
    expect(read.pairs[0].buttons.unused).toBe(0);
  });

  it('marks past the count: refused when two runs fit, or when both sides have extra', () => {
    const two = pairFastenings(
      [holes(1, 3, 'a'), buttons(2, 3, 'b')],
      geoms({
        a: { marks: column(16, [100, 200, 300, 400]) },
        b: { marks: column(52, [100, 200, 300]) },
      }),
    );
    expect(two.pairs).toEqual([]);
    expect(two.refused[0]).toContain('no one run');

    const extra = pairFastenings(
      [holes(1, 3, 'a'), buttons(2, 3, 'b')],
      geoms({
        a: { marks: column(16, [100, 200, 300, 400]) },
        b: { marks: column(52, [100, 200, 300, 400]) },
      }),
    );
    expect(extra.pairs).toEqual([]);
    expect(extra.refused[0]).toContain('each step says 3');
  });

  it('a step alone says what it has no partner for', () => {
    const read = pairFastenings(
      [buttons(5, 1, 'b'), buttons(6, 1, 'c')],
      geoms({ b: { marks: [[1, 1]] }, c: { marks: [[1, 1]] } }),
    );
    expect(read.pairs).toEqual([]);
    expect(read.refused).toEqual([
      'step 5 (1 button): no buttonhole step says 1',
      'step 6 (1 button): no buttonhole step says 1',
    ]);
  });
});

describe('fasteningsFromOps', () => {
  it('reads a unit down to its leaf pieces, in step order, and skips the other steps', () => {
    const op = (step: number, work: string, inputs: string[], output: string, count = 0) => ({
      inputs,
      output,
      type: 'seam',
      work,
      count,
      step,
    });
    const steps = fasteningsFromOps(
      [
        op(10, '', ['p1', 'p2'], 'u1'),
        op(20, 'buttonhole', ['u1'], 'u2', 7),
        op(30, 'hem', ['p3'], 'u3'),
        op(40, ' button_attach ', ['u3', 'nobody'], 'u4', 7),
      ],
      (key) => (key.startsWith('p') ? key : null),
    );
    expect(steps).toEqual([
      { side: 'holes', step: 20, pieces: ['p1', 'p2'], count: 7 },
      { side: 'buttons', step: 40, pieces: ['p3'], count: 7 },
    ]);
  });
});

describe('where a mark is', () => {
  const square: Pt2[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const tris = [0, 1, 2, 0, 2, 3];

  it('a column reads in order along its line, and the longest line wins', () => {
    const ys = inColumnOrder([
      [0, 30],
      [0, 0],
      [0, 20],
    ]).map((p) => p[1]);
    expect([ys, [...ys].reverse()]).toContainEqual([0, 20, 30]);
    const lines = largestColumns([...column(50, [0, 100, 200, 300]), [120, 40]]);
    expect(lines).toEqual([column(50, [0, 100, 200, 300])]);
  });

  it('a located point reads the same in another position set of one mesh', () => {
    const L = locateIn(square, tris, [20, 10])!;
    expect(L.out).toBe(0);
    const moved = square.map(([x, y]): Pt2 => [x + 5, y - 7]);
    const [x, y] = readAt(moved, L);
    expect(x).toBeCloseTo(25, 9);
    expect(y).toBeCloseTo(3, 9);
  });

  it('a point past the footprint is carried straight on, not clamped', () => {
    const on = new Uint8Array(square.length).fill(1);
    const q: Pt2 = [112, 60];
    const inside = locateIn(square, tris, q)!;
    expect(inside.out).toBeGreaterThan(0);
    const S = stencilPast(square, on, q)!;
    const [x, y] = readAt(square, S);
    expect(x).toBeCloseTo(112, 6);
    expect(y).toBeCloseTo(60, 6);
    expect(Math.min(...S.w)).toBeLessThan(0);
  });

  it('a point past the footprint rides one plane fitted round it, linear in the vertices', () => {
    const on = new Uint8Array(square.length).fill(1);
    const q: Pt2 = [112, 60];
    const S = spreadPast(square, on, q)!;
    const [x, y] = readAt(square, S);
    expect(x).toBeCloseTo(112, 6);
    expect(y).toBeCloseTo(60, 6);
    // The same weights carry any affine move of the footprint, so the solver holds what is drawn.
    const moved = square.map(([a, b]): Pt2 => [2 * a - b + 5, a + 3 * b - 7]);
    const [mx, my] = readAt(moved, S);
    expect(mx).toBeCloseTo(2 * 112 - 60 + 5, 6);
    expect(my).toBeCloseTo(112 + 3 * 60 - 7, 6);
    expect(spreadPast(square, new Uint8Array(square.length), q)).toBeNull();
  });

  it('the free side of a column is where the cloth ends sooner', () => {
    const side = freeSideOf(square, column(80, [20, 70]))!;
    expect(side.off).toBeCloseTo(20, 9);
    expect(side.n[0]).toBeCloseTo(1, 9);
    expect(freeSideOf(square, column(80, [20]))).toBeNull();
  });
});

// ── on the doll ───────────────────────────────────────────────────────────────────────────────

const evidence: SeamEvidence = {
  dLenMm: 0,
  relLen: 0,
  notchScore: null,
  curvature: 'flat',
  hand: 'neutral',
  twin: 'none',
  self: false,
  aLenMm: 700,
  bLenMm: 700,
};

/** Sizes in cm as a pattern file has them; `drills` in mm, drawn as small closed loops. */
function rectangle(
  key: string,
  name: string,
  index: number,
  w: number,
  h: number,
  drills: readonly Pt2[] = [],
) {
  const poly = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const piece: PieceDTO = {
    id: index,
    name,
    blockName: key,
    source: 'buttons-test',
    poly,
    inner: drills.map(([x, y]) => ({
      layer: '13',
      closed: true,
      pts: [
        { x: x / 10 - 0.15, y: y / 10 - 0.15 },
        { x: x / 10 + 0.15, y: y / 10 - 0.15 },
        { x: x / 10 + 0.15, y: y / 10 + 0.15 },
        { x: x / 10 - 0.15, y: y / 10 + 0.15 },
      ],
    })),
    bboxW: w,
    bboxH: h,
    areaCm2: w * h,
  };
  return {
    pieceKey: key,
    name,
    piece,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  } as SkeletonPieceInput;
}

const YS = [100, 250, 400, 550];
/** 30 mm in from the free edge of each front: L's is at x = 300, R's at x = 0. */
const HOLES_L = column(270, YS);
const BUTTONS_R = column(30, YS);

/**
 * A back and two fronts (300 × 700 mm) sewn side to side, the fronts' other long edges free. Nothing
 * says they meet: no row, no seam, no closure candidate. Edges of a rectangle: 0 bottom, 1 right,
 * 2 top, 3 left.
 */
function shirt(
  marks: { L?: Pt2[]; R?: Pt2[]; S?: Pt2[] },
  names: { L?: string; R?: string; K?: string; S?: string } = {},
  surface?: { x: number; y?: number },
) {
  const facts: SkeletonFacts = {
    pieces: [
      rectangle('L', names.L ?? 'front left', 1, 30, 70, marks.L),
      rectangle('R', names.R ?? 'front right', 2, 30, 70, marks.R),
      rectangle('K', names.K ?? 'back', 3, 56, 70),
      ...(surface ? [rectangle('S', names.S ?? 'PLACKET', 4, 4, 70, marks.S)] : []),
    ],
    category: 'shirt',
    bom: { zipper: 0, buttons: 0, snaps: 0, tape: 0, elastic: 0, drawcord: 0, interlining: 0 },
    defaultMachineType: null,
  };
  const read = readSeamGraph(facts);
  const seam = (a: string, b: string): SeamCandidate => ({
    a,
    b,
    score: 1,
    kind: 'edge',
    evidence,
  });
  const owners = [seam('K#1', 'L#3'), seam('K#3', 'R#1')];
  const on: SeamCandidate[] = surface
    ? [
        {
          a: 'S#0',
          b: 'L#0',
          score: 1,
          kind: 'surface',
          evidence,
          surface: {
            host: 'L',
            part: 'S',
            mark: '',
            T: [1, 0, 0, 1, surface.x, surface.y ?? 0],
            fit: 1,
          },
        },
      ]
    : [];
  const graph: SeamGraph = {
    ...read,
    chosen: [...owners, ...on],
    rejected: [],
    components: [[...(surface ? ['S'] : []), 'L', 'R', 'K']],
  };
  const rows = [...owners, ...on].map((owner, i) => {
    const row = seamFromCandidate(owner, graph.pieces, {
      seamKey: `row-${i}`,
      status: 'confirmed',
      source: 'manual',
      anchoredSize: 'M',
    });
    if (!row) throw new Error('fixture row did not resolve');
    return { row, owner };
  });
  const options: DollOptions = {
    targetVertices: 1500,
    maxPasses: 600,
    settlePasses: 0,
    proposeComposite: false,
    seams: {
      mode: 'owner',
      rows: rows.map((r) => r.row),
      size: 'M',
      candidates: rows.map((r) => ({ seamKey: r.row.seamKey, candidate: r.owner, inStep: true })),
    },
  };
  return { facts, graph, options };
}

const FASTEN: DeclaredFastening[] = [
  { side: 'holes', step: 120, pieces: ['L'], count: 4 },
  { side: 'buttons', step: 200, pieces: ['R'], count: 4 },
];

const fastened = (report: DollReport) =>
  report.closures?.find((c) => c.id === 'buttons: steps 120 and 200');

/** A mark as cut → where the solved doll has it. */
function placed(report: DollReport, key: string, q: Pt2): [number, number, number] {
  const panel = report.panels.find((p) => p.pieceKey === key);
  if (!panel) throw new Error(`no panel ${key}`);
  const flat: Pt2[] = [];
  for (let i = 0; i < panel.count; i++) flat.push([panel.uv[2 * i], panel.uv[2 * i + 1]]);
  const local = Array.from(panel.tris, (v) => v);
  const L = locateIn(flat, local, q);
  if (!L || L.out > 1e-6) throw new Error(`mark ${q} is off ${key}`);
  const X: [number, number, number] = [0, 0, 0];
  for (let j = 0; j < 3; j++)
    for (let d = 0; d < 3; d++) X[d] += L.w[j] * report.positions[3 * (panel.offset + L.i[j]) + d];
  return X;
}
const apart = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('solveDoll fastens a hole step to a button step', () => {
  it('without the steps nothing changes: no closure, no words', () => {
    const { facts, graph, options } = shirt({ L: HOLES_L, R: BUTTONS_R });
    const report = solveDoll({ graph, facts, options });
    expect(report.closures ?? []).toEqual([]);
    expect(report.notFastened).toBeUndefined();
  }, 60_000);

  it('button k lands on hole k, no row asked; the overlap comes out of the marks', () => {
    const { facts, graph, options } = shirt({ L: HOLES_L, R: BUTTONS_R });
    const report = solveDoll({ graph, facts, options: { ...options, fastenings: FASTEN } });
    expect(report.stats.nan).toBe(0);
    expect(report.notFastened).toBeUndefined();
    const c = fastened(report);
    if (!c) throw new Error('no closure');
    expect(c.top).toBe('L');
    expect(c.under).toBe('R');
    expect(c.offTopMm).toBeCloseTo(30, 3);
    expect(c.offUnderMm).toBeCloseTo(30, 3);
    expect(c.overlapMm).toBeGreaterThan(40);
    expect(c.overlapMm).toBeLessThan(80);
    expect(c.buttons?.map((b) => b.k)).toEqual([1, 2, 3, 4]);

    // Read off the solved cloth, not off the report: k on k, and nowhere near the other holes.
    const hole = HOLES_L.map((q) => placed(report, 'L', q));
    const button = BUTTONS_R.map((q) => placed(report, 'R', q));
    hole.forEach((h, k) => {
      expect(apart(h, button[k])).toBeLessThan(8);
      for (let m = 0; m < button.length; m++)
        if (m !== k) expect(apart(h, button[m])).toBeGreaterThan(100);
    });
  }, 60_000);

  it('holds whatever the fronts are called, with hole side and button side swapped', () => {
    const { facts, graph, options } = shirt(
      { L: BUTTONS_R.map(([, y]): Pt2 => [270, y]), R: HOLES_L.map(([, y]): Pt2 => [30, y]) },
      { L: 'zz one', R: 'qq two' },
    );
    const report = solveDoll({
      graph,
      facts,
      options: {
        ...options,
        fastenings: [
          { side: 'buttons', step: 200, pieces: ['L'], count: 4 },
          { side: 'holes', step: 120, pieces: ['R'], count: 4 },
        ],
      },
    });
    const c = fastened(report);
    if (!c) throw new Error(`no closure: ${report.notFastened?.join(' · ')}`);
    expect(c.top).toBe('R');
    expect(c.under).toBe('L');
  }, 60_000);

  it('a mark on the turned strip of a folded piece is where the finished piece has it', () => {
    // R folded 35 mm in from its free edge: a mark 20 mm in as cut lies on the turned strip, 15 mm
    // past the crease, so 50 mm in on the finished piece and 15 mm from its new, folded edge.
    const turn: DollFold = {
      seq: 1,
      a: [35 / 300, 0],
      b: [35 / 300, 1],
      flipAt: [17 / 300, 0.5],
      kind: 'inward',
    };
    const onStrip = column(20, YS);
    const { facts, graph, options } = shirt({ L: HOLES_L, R: onStrip });
    const report = solveDoll({
      graph,
      facts,
      options: { ...options, fastenings: FASTEN, folds: { R: [turn] } },
    });
    expect(report.folds?.[0].applied).toBe(true);
    const c = fastened(report);
    if (!c) throw new Error(`no closure: ${report.notFastened?.join(' · ')}`);
    expect(c.offUnderMm).toBeCloseTo(15, 3);
    expect(c.overlapMm).toBeGreaterThan(20);
    expect(c.overlapMm).toBeLessThan(70);
    HOLES_L.forEach((q, k) => {
      expect(apart(placed(report, 'L', q), placed(report, 'R', onStrip[k]))).toBeLessThan(12);
    });
  }, 60_000);

  it('a mark on the base ply of a folded piece keeps its place, the edge moves', () => {
    const turn: DollFold = {
      seq: 1,
      a: [35 / 300, 0],
      b: [35 / 300, 1],
      flipAt: [17 / 300, 0.5],
      kind: 'inward',
    };
    const onBase = column(52, YS);
    const { facts, graph, options } = shirt({ L: HOLES_L, R: onBase });
    const report = solveDoll({
      graph,
      facts,
      options: { ...options, fastenings: FASTEN, folds: { R: [turn] } },
    });
    const c = fastened(report);
    if (!c) throw new Error(`no closure: ${report.notFastened?.join(' · ')}`);
    expect(c.offUnderMm).toBeCloseTo(17, 3);
    HOLES_L.forEach((q, k) => {
      expect(apart(placed(report, 'L', q), placed(report, 'R', onBase[k]))).toBeLessThan(8);
    });
  }, 60_000);

  it('marks through a surface part follow its placement on its host, overhang included', () => {
    // The strip (40 mm wide, holes 16 in) lies on L from x = 290 to 330: its holes, at x = 306, are
    // 6 mm past L's free edge. They stay where the strip is, not clamped onto the edge.
    const { facts, graph, options } = shirt({ S: column(16, YS), R: BUTTONS_R }, {}, { x: 290 });
    const report = solveDoll({
      graph,
      facts,
      options: {
        ...options,
        fastenings: [
          { side: 'holes', step: 120, pieces: ['S', 'L'], count: 4 },
          { side: 'buttons', step: 200, pieces: ['R'], count: 4 },
        ],
      },
    });
    const c = fastened(report);
    if (!c) throw new Error(`no closure: ${report.notFastened?.join(' · ')}`);
    expect(c.top).toBe('S');
    expect(c.under).toBe('R');
    expect(c.offTopMm).toBeCloseTo(24, 3);
    expect(c.overlapMm).toBeGreaterThan(45);
    expect(c.buttons).toHaveLength(4);
    for (const b of c.buttons ?? []) expect(b.distMm).toBeLessThan(4);
  }, 60_000);

  it('a surface part running past its host end stays on that end: only the overhang across is carried', () => {
    // As a hem turned under leaves it: the strip runs 30 mm past L's end, its holes are on L.
    const { facts, graph, options } = shirt(
      {
        S: column(
          16,
          YS.map((y) => y + 30),
        ),
        R: BUTTONS_R,
      },
      {},
      { x: 290, y: -30 },
    );
    const report = solveDoll({
      graph,
      facts,
      options: {
        ...options,
        fastenings: [
          { side: 'holes', step: 120, pieces: ['S', 'L'], count: 4 },
          { side: 'buttons', step: 200, pieces: ['R'], count: 4 },
        ],
      },
    });
    const c = fastened(report);
    if (!c) throw new Error(`no closure: ${report.notFastened?.join(' · ')}`);
    for (const b of c.buttons ?? []) expect(b.distMm).toBeLessThan(4);
    const heights = (key: string) => {
      const p = report.panels.find((x) => x.pieceKey === key);
      if (!p) throw new Error(`no panel ${key}`);
      const y: number[] = [];
      for (let i = 0; i < p.count; i++) y.push(report.positions[3 * (p.offset + i) + 1]);
      return [Math.min(...y), Math.max(...y)];
    };
    const [low, high] = heights('S');
    const [hostLow, hostHigh] = heights('L');
    expect(low).toBeGreaterThan(hostLow - 4);
    expect(high).toBeLessThan(hostHigh + 4);
  }, 60_000);

  it("the hole side lies over the button side unless a step's layer order says otherwise", () => {
    const { facts, graph, options } = shirt({ L: HOLES_L, R: BUTTONS_R });
    const report = solveDoll({
      graph,
      facts,
      options: {
        ...options,
        fastenings: FASTEN,
        seams: { ...options.seams!, layers: [['L', 'R']] },
      },
    });
    const c = fastened(report);
    if (!c) throw new Error('no closure');
    expect(c.top).toBe('R');
    expect(c.under).toBe('L');
    expect(c.how).toContain('layer order');
  }, 60_000);

  it('refuses in the report, and draws the same doll as without the steps', () => {
    const { facts, graph, options } = shirt({ L: HOLES_L, R: BUTTONS_R });
    const base = solveDoll({ graph, facts, options });
    const report = solveDoll({
      graph,
      facts,
      options: {
        ...options,
        fastenings: [
          { side: 'holes', step: 120, pieces: ['L'], count: 4 },
          { side: 'buttons', step: 200, pieces: ['R'], count: 3 },
        ],
      },
    });
    expect(report.closures ?? []).toEqual([]);
    expect(report.notFastened).toEqual(['step 120 says 4 buttonholes, step 200 says 3 buttons']);
    expect(report.warnings).toContain(
      'not fastened: step 120 says 4 buttonholes, step 200 says 3 buttons',
    );
    expect(Array.from(report.positions)).toEqual(Array.from(base.positions));
  }, 120_000);

  it('the body is the buttoned girth: the strip less the lap past both columns', () => {
    const { facts, graph, options } = shirt({ L: HOLES_L, R: BUTTONS_R });
    const torsoA = (report: DollReport) => {
      const t = report.proxies.find((p) => p.group === 'BODY' && p.kind === 'torso');
      if (!t) throw new Error('no torso');
      return t.profile[Math.floor(t.profile.length / 2)][1];
    };
    const open = torsoA(solveDoll({ graph, facts, options }));
    const report = solveDoll({ graph, facts, options: { ...options, fastenings: FASTEN } });
    // 1160 mm of strip, 30 mm past the holes to L's free edge and 30 past the buttons to R's.
    expect(1 - torsoA(report) / open).toBeCloseTo(60 / 1160, 2);
    const c = fastened(report);
    if (!c) throw new Error('no closure');
    const hole = HOLES_L.map((q) => placed(report, 'L', q));
    const button = BUTTONS_R.map((q) => placed(report, 'R', q));
    hole.forEach((h, k) => expect(apart(h, button[k])).toBeLessThan(8));
  }, 120_000);
});
