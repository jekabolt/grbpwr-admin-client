import { describe, expect, it } from 'vitest';

import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type {
  Pt2,
  SeamCandidate,
  SeamEvidence,
  SeamGraph,
  SkeletonFacts,
  SkeletonPieceInput,
} from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { seamFromCandidate } from 'lib/seams';
import { frameOf, toUV } from 'lib/seams/frame';

import { solveDoll } from './doll';
import {
  finishedAnchors,
  finishedArc,
  finishedRows,
  laidArc,
  openWalkAt,
  readFinishedNeck,
  type NeckPleat,
  type NeckPleatLine,
  type NeckRows,
  type NeckWalk,
} from './finished-neck';
import type { Path } from './solve';
import type { DollFold, DollOptions, DollReport } from './types';

// The run lengths of a shirt's neck: two fronts 154 mm with 35 turned at the centre, a back 271 mm
// whose pleat closes 70. Each run lies along its own piece's x, as cut; the walk goes front, back,
// front. A vertex every 5 mm, the crossings fall between them.
const FRONT = 154;
const BACK = 271;
const TURN = 35;
const CLOSES = 70;

const walkOf = (lens: readonly number[], step = 5): NeckWalk => {
  const w = { panel: [] as number[], cut: [] as Pt2[], s: [] as number[] };
  let at = 0;
  lens.forEach((len, panel) => {
    const n = Math.round(len / step);
    for (let k = 0; k <= n; k++) {
      w.panel.push(panel);
      w.cut.push([(len * k) / n, 0]);
      w.s.push(at + (len * k) / n);
    }
    at += len;
  });
  return w;
};

const vertical = (x: number) => ({ a: [x, -100] as Pt2, b: [x, 100] as Pt2 });

/** Three rows from one apex under the run; the flip point says which way the intake lies. */
const fan = (mid: number, closes: number, flip: number, kind = 'pleat_r'): NeckPleatLine[] => {
  const apex: Pt2 = [mid, -200];
  return [-closes / 2, 0, closes / 2].map((off) => ({
    a: apex,
    b: [mid + (off * 240) / 200, 40] as Pt2,
    kind,
    flipAt: [mid + flip, 0] as Pt2,
  }));
};

const rows =
  (turns: Record<number, number[]>, pleats: Record<number, NeckPleatLine[]> = {}) =>
  (panel: number): NeckRows => ({
    turns: (turns[panel] ?? []).map(vertical),
    pleatLines: pleats[panel] ?? [],
  });

const shirt = rows({ 0: [TURN], 2: [FRONT - TURN] }, { 1: fan(BACK / 2, CLOSES, -10) });

const pathOf = (len: number, step = 5, first = 0): Path => {
  const n = Math.round(len / step);
  const s = Array.from({ length: n + 1 }, (_, k) => (len * k) / n);
  return { v: s.map((_, k) => first + k), s, len } as unknown as Path;
};

describe('readFinishedNeck', () => {
  it('reads the stored folds and pleats, run by run', () => {
    const r = readFinishedNeck(walkOf([FRONT, BACK, FRONT]), shirt)!;
    expect(r.cutMm).toBeCloseTo(579, 6);
    expect(r.from).toBeCloseTo(35, 6);
    expect(r.to).toBeCloseTo(579 - 35, 6);
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0][0]).toBeCloseTo(FRONT + BACK / 2 - CLOSES / 2, 6);
    expect(r.closed[0][1]).toBeCloseTo(FRONT + BACK / 2 + CLOSES / 2, 6);
    // Back 271 − 70 = 201, each front 154 − 35 = 119.
    expect(r.finishedMm).toBeCloseTo(201 + 119 + 119, 6);
    expect(r.unread).toEqual([]);
  });

  it('is null without a row on the walk: the notches read it, as ever', () => {
    const w = walkOf([FRONT, BACK, FRONT]);
    expect(readFinishedNeck(w, rows({}))).toBeNull();
    // A fold on the piece that never crosses the neck is no row of the neck.
    expect(readFinishedNeck(w, rows({ 0: [FRONT + 50] }))).toBeNull();
    // Two rows are no fan.
    expect(readFinishedNeck(w, rows({}, { 1: fan(BACK / 2, CLOSES, -10).slice(0, 2) }))).toBeNull();
  });

  it('takes nothing off for a crease with no end of the neck beyond it', () => {
    const r = readFinishedNeck(walkOf([FRONT, BACK, FRONT]), rows({ 1: [BACK / 2] }))!;
    expect(r.unread).toHaveLength(1);
    expect(r.finishedMm).toBeCloseTo(579, 6);
  });

  it('does not care which piece carries what: panels are numbers', () => {
    const w = walkOf([FRONT, BACK, FRONT]);
    const a = readFinishedNeck(w, shirt)!;
    const swapped = { ...w, panel: w.panel.map((p) => p + 40) };
    const b = readFinishedNeck(swapped, (p) => shirt(p - 40))!;
    expect(b.finishedMm).toBe(a.finishedMm);
    expect(b.closed).toEqual(a.closed);
  });
});

describe('finished arcs', () => {
  const r = readFinishedNeck(walkOf([FRONT, BACK, FRONT]), shirt)!;
  const [f0, f1] = r.closed[0];

  it('collapse a closed pleat to one point and start at the crease', () => {
    expect(finishedArc(r, 0)).toBe(0);
    expect(finishedArc(r, r.from)).toBe(0);
    expect(finishedArc(r, f0)).toBeCloseTo(f0 - r.from, 6);
    expect(finishedArc(r, (f0 + f1) / 2)).toBeCloseTo(f0 - r.from, 6);
    expect(finishedArc(r, f1)).toBeCloseTo(f0 - r.from, 6);
    expect(finishedArc(r, r.to)).toBeCloseTo(r.finishedMm, 6);
    expect(finishedArc(r, r.cutMm)).toBeCloseTo(r.finishedMm, 6);
  });

  it('anchor the unit end to end with one step over the pleat, at slope 1', () => {
    const len = r.finishedMm;
    const an = finishedAnchors(r, { len, cb: len / 2 }, FRONT + BACK / 2);
    expect(an[0]).toEqual([0, r.from]);
    expect(an[an.length - 1][0]).toBe(len);
    expect(an[an.length - 1][1]).toBeCloseTo(r.to, 6);
    const step = an.findIndex(([, s]) => s === f0);
    expect(an[step + 1][1]).toBe(f1);
    expect(an[step + 1][0] - an[step][0]).toBeCloseTo(0.6, 6);
    expect(an[step][0] - an[0][0]).toBeCloseTo(f0 - r.from - 0.3, 6);
  });
});

describe('finishedRows', () => {
  const r = readFinishedNeck(walkOf([FRONT, BACK, FRONT]), shirt)!;
  const [f0, f1] = r.closed[0];
  const A = pathOf(r.finishedMm, 5, 1000);
  const B = pathOf(r.cutMm, 5, 0);
  const anchors = finishedAnchors(r, { len: A.len, cb: A.len / 2 }, FRONT + BACK / 2);
  const out = finishedRows(A, B, r, anchors);
  const of = (v: number) => {
    const k = out.v.indexOf(v);
    return k < 0 ? null : [out.b0[k], out.b1[k], out.w[k]];
  };

  it('stitches the turned stretch through its crease, onto the stretch it covers', () => {
    // A vertex of the neck 15 mm or so past the crease lies as far inside it, on the unit's arc.
    const k = B.s.findIndex((s) => s > r.from - 16);
    const on = of(B.v[k])!;
    const unitS = A.s[on[0] - 1000] + (A.s[on[1] - 1000] - A.s[on[0] - 1000]) * on[2];
    expect(unitS).toBeCloseTo(r.from - B.s[k], 1);
  });

  it('never sews a unit vertex inside the closed range', () => {
    for (let k = 0; k < A.v.length; k++) {
      const on = of(A.v[k]);
      if (!on) continue;
      const s = B.s[on[0]] + (B.s[on[1]] - B.s[on[0]]) * on[2];
      expect(s > f0 + 1e-6 && s < f1 - 1e-6).toBe(false);
    }
  });

  it('lays the intake over the side its flip point names, an even pleat over nothing', () => {
    const p = r.pleats[0];
    expect(p.lay).not.toBe(0);
    const before: NeckPleat = { ...p, lay: -1 };
    const after: NeckPleat = { ...p, lay: 1 };
    expect(laidArc(before, f0 + 1)).toBeCloseTo(f0 - 1, 6);
    expect(laidArc(before, f1 - 1)).toBeCloseTo(f0 - 1, 6);
    expect(laidArc(after, f0 + 1)).toBeCloseTo(f1 + 1, 6);
    expect(laidArc(after, f1 - 1)).toBeCloseTo(f1 + 1, 6);
    const even = readFinishedNeck(
      walkOf([FRONT, BACK, FRONT]),
      rows({}, { 1: fan(BACK / 2, CLOSES, -10, 'pleat') }),
    )!;
    expect(even.pleats[0].lay).toBe(0);
    const evenRows = finishedRows(A, B, even, [
      [0, 0],
      [A.len, B.len],
    ]);
    const inside = B.v.filter(
      (_, k) => B.s[k] > even.closed[0][0] + 1 && B.s[k] < even.closed[0][1] - 1,
    );
    for (const v of inside) expect(evenRows.v.includes(v)).toBe(false);
  });
});

describe('openWalkAt', () => {
  // Cut at a shoulder: the back, then a front, the opening, the other front.
  const ring = walkOf([BACK, FRONT, FRONT]);
  const ringRows = rows({ 1: [FRONT - TURN], 2: [TURN] });

  it('opens a ring where the two turned edges meet, across from the centre back', () => {
    const at = openWalkAt(ring, ringRows, BACK / 2);
    expect(ring.s[at]).toBeCloseTo(BACK + FRONT, 6);
  });

  it('leaves a walk that already ends at both creases', () => {
    expect(openWalkAt(walkOf([FRONT, BACK, FRONT]), shirt, FRONT + BACK / 2)).toBe(0);
  });

  it('never opens a walk at a shoulder, whatever folds stand by it', () => {
    const open = walkOf([FRONT, BACK, FRONT]);
    expect(openWalkAt(open, rows({ 0: [FRONT - 20] }), FRONT + BACK / 2)).toBe(0);
    expect(openWalkAt(open, rows({ 2: [20] }), FRONT + BACK / 2)).toBe(0);
  });

  it('stays shut when the centre back is unknown', () => {
    expect(openWalkAt(ring, ringRows, NaN)).toBe(0);
  });
});

// ── the whole doll: a body and a collar sewn on its top edges ──────────────────────────────────

const evidence: SeamEvidence = {
  dLenMm: 0,
  relLen: 0,
  notchScore: null,
  curvature: 'flat',
  hand: 'neutral',
  twin: 'none',
  self: false,
  aLenMm: 200,
  bLenMm: 200,
};

function rectangle(key: string, name: string, index: number, w: number, h: number) {
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
    source: 'finished-neck-test',
    poly,
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

const NAMES = { fl: 'FRONT LEFT', fr: 'FRONT RIGHT', back: 'BACK', collar: 'COLLAR' };
const RENAMED = { fl: 'FL', fr: 'FR', back: 'BP', collar: 'CLR' };

/** Fronts 250 mm and a back 500 mm wide across their top edges, a collar of `collarMm`; the
 *  collar row lists the neck's parts in `neck` order. */
function body(collarMm: number, names = NAMES, neck = ['L#2', 'B#2', 'R#2']) {
  const facts: SkeletonFacts = {
    pieces: [
      rectangle('L', names.fl, 1, 25, 70),
      rectangle('R', names.fr, 2, 25, 70),
      rectangle('B', names.back, 3, 50, 70),
      rectangle('C', names.collar, 4, collarMm / 10, 8),
    ],
    category: 'shirt',
    bom: { zipper: 0, buttons: 0, snaps: 0, tape: 0, elastic: 0, drawcord: 0, interlining: 0 },
    defaultMachineType: null,
  };
  const read = readSeamGraph(facts);
  const seam = (a: string, b: string, len: number): SeamCandidate => ({
    a,
    b,
    score: 1,
    kind: 'edge',
    evidence: { ...evidence, aLenMm: len, bLenMm: len },
  });
  const collar: SeamCandidate = {
    a: 'C#0',
    b: neck.join('+'),
    aParts: ['C#0'],
    bParts: neck,
    score: 1,
    kind: 'composite',
    evidence: { ...evidence, aLenMm: collarMm, bLenMm: 1000 },
  };
  // Edges of a rectangle: 0 bottom, 1 right, 2 top, 3 left.
  const owners = [seam('L#3', 'B#1', 700), seam('R#1', 'B#3', 700), collar];
  const graph: SeamGraph = {
    ...read,
    chosen: owners,
    rejected: [],
    components: [['L', 'R', 'B', 'C']],
  };
  const resolved = owners.map((owner, i) => {
    const row = seamFromCandidate(owner, graph.pieces, {
      seamKey: `owner-row-${i}`,
      status: 'confirmed',
      source: 'manual',
      anchoredSize: 'M',
    });
    if (!row) throw new Error(`row ${owner.a} did not resolve`);
    return { row, owner };
  });
  const options: DollOptions = {
    targetVertices: 1500,
    maxPasses: 80,
    settlePasses: 0,
    proposeComposite: false,
    seams: {
      mode: 'owner',
      rows: resolved.map((r) => r.row),
      size: 'M',
      candidates: resolved.map((r) => ({
        seamKey: r.row.seamKey,
        candidate: r.owner,
        inStep: true,
      })),
    },
  };
  const uv = (key: string, p: Pt2) =>
    toUV(frameOf(graph.pieces.find((g) => g.pieceKey === key)!), p);
  return { facts, graph, options, uv };
}

/** Stored rows as a card carries them: both front edges turned 35 mm, a fan on the back closing 70. */
function storedRows(uv: ReturnType<typeof body>['uv']): Record<string, DollFold[]> {
  const line = (key: string, x: number, flipX: number): DollFold => ({
    seq: 1,
    a: uv(key, [x, 0]),
    b: uv(key, [x, 700]),
    flipAt: uv(key, [flipX, 350]),
    kind: 'inward',
  });
  const leg = (x: number, kind: DollFold['kind'] = 'pleat_r'): DollFold => ({
    seq: 2,
    a: uv('B', [250, 400]),
    b: uv('B', [x, 700]),
    flipAt: uv('B', [240, 650]),
    kind,
  });
  return {
    L: [line('L', 215, 240)],
    R: [line('R', 35, 10)],
    B: [leg(215), leg(250), leg(285)],
  };
}

const neckContradiction = (r: DollReport) =>
  (r.contradictions ?? []).find((c) => c.includes('does not fit its neck path'));

describe('the collar on the finished neck', () => {
  it('sews on the neck the stored rows finish: 1000 − 140 folded = 860', () => {
    const { facts, graph, options, uv } = body(860);
    const report = solveDoll({ graph, facts, options: { ...options, folds: storedRows(uv) } });
    expect(report.stats.nan).toBe(0);
    expect(neckContradiction(report)).toBeUndefined();
    const unit = report.collar?.units?.[0];
    expect(unit?.anchors ?? '').toContain('stored folds and pleats 1000 − 140 folded = 860');
    // The collar sewn whole, as cut: nothing scaled to fit.
    expect(unit?.sewnMm).toBeCloseTo(860, 0);
    expect(unit?.folds).toEqual([35, 70, 35]);
  }, 120_000);

  it('without stored rows reads the notches, as today: the same collar stays a contradiction', () => {
    const { facts, graph, options } = body(860);
    const report = solveDoll({ graph, facts, options });
    const line = neckContradiction(report) ?? '';
    expect(line).toContain('whole 1000 − 0 folded = 1000');
    expect(line).not.toContain('stored folds');
  }, 120_000);

  it('without stored rows a collar as long as the neck sews as ever', () => {
    const { facts, graph, options } = body(1000);
    const report = solveDoll({ graph, facts, options });
    expect(neckContradiction(report)).toBeUndefined();
    expect(report.collar?.units?.[0]?.anchors ?? '').not.toContain('stored folds');
  }, 120_000);

  it('keeps the contradiction with the real numbers when the finished neck does not match', () => {
    const { facts, graph, options, uv } = body(1000);
    const report = solveDoll({ graph, facts, options: { ...options, folds: storedRows(uv) } });
    expect(neckContradiction(report)).toContain('stored folds and pleats 1000 − 140 folded = 860');
    expect(neckContradiction(report)).toContain('the unit (1000 mm)');
  }, 120_000);

  it('centres a collar on the centre back whatever order its row lists the neck in', () => {
    // Front, front, back: chained in that order the parts run from a shoulder round to the same
    // shoulder. The collar, too short for the neck, goes on at its own length from the CB.
    const centreX = (r: DollReport) => {
      const P = r.panels.find((p) => p.pieceKey === 'C')!;
      let x = 0;
      for (let v = P.offset; v < P.offset + P.count; v++) x += r.positions[3 * v];
      return x / P.count;
    };
    const a = body(700);
    const b = body(700, NAMES, ['R#2', 'L#2', 'B#2']);
    const ra = solveDoll({ ...a });
    const rb = solveDoll({ ...b });
    expect(rb.stats.nan).toBe(0);
    const words = (r: DollReport) => neckContradiction(r)?.replace(/^\S+: /, '');
    expect(words(rb)).toEqual(words(ra));
    expect(Math.abs(centreX(ra))).toBeLessThan(15);
    expect(Math.abs(centreX(rb))).toBeLessThan(15);
  }, 120_000);

  it('behaves the same under other names for the same pieces', () => {
    const a = body(860);
    const b = body(860, RENAMED);
    const ra = solveDoll({ ...a, options: { ...a.options, folds: storedRows(a.uv) } });
    const rb = solveDoll({ ...b, options: { ...b.options, folds: storedRows(b.uv) } });
    expect(rb.contradictions).toEqual(ra.contradictions);
    expect(rb.collar?.units?.[0]?.anchors).toEqual(ra.collar?.units?.[0]?.anchors);
    expect(ra.collar?.units?.[0]?.anchors ?? '').toContain('stored folds');
    expect(Array.from(rb.positions)).toEqual(Array.from(ra.positions));
  }, 120_000);
});
