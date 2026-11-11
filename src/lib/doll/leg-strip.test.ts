import { describe, expect, it } from 'vitest';

import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type {
  SeamCandidate,
  SeamEvidence,
  SeamGraph,
  SkeletonFacts,
  SkeletonPieceInput,
} from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { seamFromCandidate } from 'lib/seams';

import { buildChart, toChart } from './chart';
import { solveDoll } from './doll';
import type { DollReport } from './types';

// B-181: a leg's back strip with a yoke on top that no side seam reaches, a confirmed row that
// sews two yoke bottoms lying apart in the strip, and a band piece no row names.

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

/** A w × h cm rectangle; edge #i runs from corner i to corner i + 1: #0 bottom, #1 right, #2 top, #3 left. */
const piece = (key: string, name: string, id: number, w: number, h: number): SkeletonPieceInput => {
  const poly = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const dto: PieceDTO = {
    id,
    name,
    blockName: key,
    source: 'leg-strip-test',
    poly,
    bboxW: w,
    bboxH: h,
    areaCm2: w * h,
  };
  return {
    pieceKey: key,
    name,
    piece: dto,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  };
};

const seam = (a: string, b: string, more: Partial<SeamCandidate> = {}): SeamCandidate => ({
  a,
  b,
  kind: 'edge',
  score: 1,
  evidence,
  ...more,
});

const factsOf = (pieces: SkeletonPieceInput[]): SkeletonFacts => ({
  pieces,
  category: 'trousers',
  bom: { zipper: 0, buttons: 0, snaps: 0, tape: 0, elastic: 0, drawcord: 0, interlining: 0 },
  defaultMachineType: null,
});

/** Every candidate as a confirmed owner row in a step. */
function solveRows(pieces: SkeletonPieceInput[], rows: [string, SeamCandidate][]): DollReport {
  const facts = factsOf(pieces);
  const graph: SeamGraph = {
    ...readSeamGraph(facts),
    chosen: rows.map(([, candidate]) => candidate),
    rejected: [],
    components: [pieces.map((p) => p.pieceKey)],
  };
  const stored = seamFromCandidate(rows[0][1], graph.pieces, {
    seamKey: rows[0][0],
    status: 'confirmed',
    source: 'manual',
    anchoredSize: 'M',
  });
  if (!stored) throw new Error('first row did not resolve');
  const stores = rows.map(([seamKey]) => ({ ...stored, seamKey }));
  return solveDoll({
    graph,
    facts,
    options: {
      targetVertices: 400,
      proposeComposite: false,
      debug: true,
      seams: {
        mode: 'owner',
        rows: stores,
        size: 'M',
        candidates: rows.map(([seamKey, candidate]) => ({ seamKey, candidate, inStep: true })),
        inStepKeys: stores.map((row) => row.seamKey),
      },
    },
  });
}

describe('chart joints: a yoke no side seam reaches', () => {
  const graph = readSeamGraph(
    factsOf([piece('BACK', 'BACK_L', 1, 26, 60), piece('YOKE', 'YOKE_L', 2, 26, 10)]),
  );
  const geom = (key: string) => graph.pieces.find((g) => g.pieceKey === key)!;
  const edge = (id: string) => graph.pieces.flatMap((g) => g.edges).find((e) => e.id === id)!;
  // The back rise run goes down the yoke's left side (#3, top → bottom) and on down the back's.
  const yokeLeft = edge('YOKE#3');
  const backLeft = edge('BACK#3');
  const joint = {
    id: 'rise',
    readings: [
      [
        [
          { key: 'YOKE', pt: yokeLeft.pts[yokeLeft.pts.length - 1] },
          { key: 'BACK', pt: backLeft.pts[0] },
        ],
      ],
      [
        [
          { key: 'YOKE', pt: yokeLeft.pts[0] },
          { key: 'BACK', pt: backLeft.pts[backLeft.pts.length - 1] },
        ],
      ],
    ] as [{ key: string; pt: [number, number] }, { key: string; pt: [number, number] }][][],
  };

  it('stands apart without a joint', () => {
    const chart = buildChart([geom('BACK'), geom('YOKE')], [], 'BACK');
    expect(chart.components).toHaveLength(2);
  });

  it('is laid where the composite run goes on from it onto the strip, and wrapped with it', () => {
    const chart = buildChart([geom('BACK'), geom('YOKE')], [], 'BACK', false, undefined, [joint]);
    expect(chart.components).toHaveLength(1);
    expect(chart.components[0].keys.sort()).toEqual(['BACK', 'YOKE']);
    const yokeFoot = toChart(chart.place.get('YOKE')!, yokeLeft.pts[yokeLeft.pts.length - 1]);
    const backTop = toChart(chart.place.get('BACK')!, backLeft.pts[0]);
    expect(Math.hypot(yokeFoot[0] - backTop[0], yokeFoot[1] - backTop[1])).toBeLessThan(1);
  });
});

describe('a leg strip in owner mode', () => {
  // One leg: front | back side by side (side seam), two yokes over the back sewn to each other.
  const pieces = [
    piece('FL', 'FRONT_L', 1, 26, 70),
    piece('BL', 'BACK_L', 2, 26, 60),
    piece('YA', 'YOKE_L', 3, 14, 10),
    piece('YB', 'YOKE_1_L', 4, 12, 10),
    piece('WB', 'WST_L', 5, 52, 4),
    piece('LP', 'BLT', 6, 40, 2),
  ];
  const side = seam('FL#1', 'BL#3');
  const yokes = seam('YA#1', 'YB#3');
  // The waist runs right to left along the tops: the yokes, then on over the side seam onto the front.
  const waist = seam('WB#0', 'YB#2', { kind: 'composite', bParts: ['YB#2', 'YA#2', 'FL#2'] });
  const row = (report: DollReport, id: string) => {
    const r = report.seams.find((s) => s.id === id);
    if (!r) throw new Error(`${id} is not reported`);
    return r;
  };
  const chartLine = (report: DollReport) =>
    report.warnings.find((w) => w.startsWith('debug: chart LEG_L: [')) ?? '';

  it('releases a confirmed row that sews two yoke bottoms lying apart in the strip', () => {
    const report = solveRows(pieces, [
      ['side', side],
      ['yokes', yokes],
      ['seat', seam('BL#2', 'YA#0', { kind: 'composite', bParts: ['YA#0', 'YB#0'] })],
      ['waist', waist],
      // Sews the far ends of the two yoke bottoms together: closed, it folds the strip onto itself.
      ['fold', seam('YA#0', 'YB#0')],
    ]);
    const fold = row(report, 'YA#0~YB#0');
    expect(fold.state).toBe('open');
    expect(fold.note).toContain('confirmed by a person but it does not close');
    // The yokes stay flat on the back: the seat row closes.
    expect(row(report, 'BL#2~YA#0').state).toBe('closed');
  });

  it('lays a yoke the waist run goes on from onto the front, and sizes the waist by the free top', () => {
    const report = solveRows(pieces, [
      ['side', side],
      ['yokes', yokes],
      ['waist', waist],
    ]);
    // One strip: the yokes are wrapped with the front and back, not drawn apart.
    expect(chartLine(report)).toMatch(/^debug: chart LEG_L: \[[^\]]*\bYA@[^\]]*\]( ·|$)/);
    expect(chartLine(report)).toMatch(/^debug: chart LEG_L: \[[^\]]*\bYB@[^\]]*\]( ·|$)/);
    // The back's top under the yokes is inside the trousers: the waist is the front's and the yokes'.
    const pelvis = report.warnings.find((w) => w.startsWith('debug: LEG_L pelvis')) ?? '';
    expect(pelvis).toContain('Wtop 520');
  });

  it('leaves a band piece no row names off the doll, drawn apart', () => {
    const report = solveRows(pieces, [
      ['side', side],
      ['yokes', yokes],
      ['waist', waist],
    ]);
    expect(report.floating).toContainEqual({
      pieceKey: 'LP',
      reason: 'no seam found for any of its edges — drawn apart',
    });
    expect(report.panels.find((p) => p.pieceKey === 'WB')?.group).toBe('WAISTBAND');
  });
});
