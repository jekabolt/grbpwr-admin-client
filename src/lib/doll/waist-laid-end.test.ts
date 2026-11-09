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

import { solveDoll } from './doll';
import type { DollReport } from './types';

// B-179: a waist row that runs along a front's top and ends on the fly facing laid on that front.

const evidence: SeamEvidence = {
  dLenMm: 0,
  relLen: 0,
  notchScore: null,
  curvature: 'flat',
  hand: 'neutral',
  twin: 'none',
  self: false,
  aLenMm: 260,
  bLenMm: 260,
};

/** A w × h cm rectangle; edge #i runs from corner i to corner i + 1, so #0 is (0,0)→(w,0). */
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
    source: 'waist-laid-end-test',
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

/** A piece laid on `host`'s face, its own frame moved by (dx, 0) mm. */
const laid = (part: string, host: string, dx: number): SeamCandidate =>
  seam(`${part}#1`, `${host}#1`, {
    kind: 'surface',
    surface: { host, part, mark: '', T: [1, 0, 0, 1, dx, 0], fit: 1 },
  });

/** Every candidate as a confirmed owner row in a step. */
function solveRows(pieces: SkeletonPieceInput[], rows: [string, SeamCandidate][]): DollReport {
  const facts: SkeletonFacts = {
    pieces,
    category: 'trousers',
    bom: { zipper: 0, buttons: 0, snaps: 0, tape: 0, elastic: 0, drawcord: 0, interlining: 0 },
    defaultMachineType: null,
  };
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
  if (!stored) throw new Error('waist row did not resolve');
  // The doll sews owner candidates as given; a row only has to be confirmed under the same key.
  const stores = rows.map(([seamKey]) => ({ ...stored, seamKey }));
  return solveDoll({
    graph,
    facts,
    options: {
      // The toy shell closes a plain 260 = 260 mm edge at this mesh (a finer one reads 5 % on it).
      targetVertices: 400,
      proposeComposite: false,
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

const panelOf = (report: DollReport, key: string) => {
  const panel = report.panels.find((p) => p.pieceKey === key);
  if (!panel) throw new Error(`${key} is not drawn`);
  const vs = Array.from({ length: panel.count }, (_, i) => panel.offset + i);
  const uv = (v: number) => [
    panel.uv[2 * (v - panel.offset)],
    panel.uv[2 * (v - panel.offset) + 1],
  ];
  return { vs, uv };
};
const at = (report: DollReport, v: number) => [
  report.positions[3 * v],
  report.positions[3 * v + 1],
  report.positions[3 * v + 2],
];
const nearestUv = (P: ReturnType<typeof panelOf>, x: number, y: number) =>
  P.vs.reduce((best, v) =>
    Math.hypot(P.uv(v)[0] - x, P.uv(v)[1] - y) < Math.hypot(P.uv(best)[0] - x, P.uv(best)[1] - y)
      ? v
      : best,
  );

describe('a waist row ending on a fly facing laid on the front', () => {
  // The band's 260 mm onto the front's top up to the facing (220 mm), then the facing's top (40).
  const pieces = [
    piece('FRONT', 'front', 1, 26, 30),
    piece('BAND', 'WST_L_1', 2, 26, 4),
    piece('FACING', 'FLAP_1_L', 3, 4, 20),
  ];
  const waist = (sewnMm: number) =>
    seam('BAND#0', 'FRONT#0', {
      kind: 'composite',
      bParts: ['FRONT#0', 'FACING#0'],
      partRange: { 'FRONT#0': [0, sewnMm] },
    });
  const rowOf = (report: DollReport) => {
    const row = report.seams.find((s) => s.id === 'BAND#0~FRONT#0');
    if (!row) throw new Error('the waist row is not reported');
    return row;
  };

  it("sews the band's end over the front's top under the facing, flush with its corner", () => {
    const report = solveRows(pieces, [
      ['waist', waist(220)],
      ['facing', laid('FACING', 'FRONT', 220)],
    ]);
    const row = rowOf(report);
    expect(row.state).toBe('closed');
    expect(row.note).toContain('sewn over the shell edge under it, FRONT#0');
    expect(Math.abs(row.lenA - row.lenB)).toBeLessThan(2);
    // The row is still reported whole, the facing's stretch included.
    expect(row.b).toEqual(['FRONT#0', 'FACING#0']);
    const front = panelOf(report, 'FRONT');
    const band = panelOf(report, 'BAND');
    const corner = at(report, nearestUv(front, 260, 0));
    const gap = Math.min(
      ...[nearestUv(band, 0, 0), nearestUv(band, 260, 0)].map((v) =>
        Math.hypot(...at(report, v).map((x, k) => x - corner[k])),
      ),
    );
    expect(gap).toBeLessThan(3);
  });

  it('leaves the row to its drawn stretch when the facing is not laid on that front', () => {
    const report = solveRows(pieces, [['waist', waist(220)]]);
    const row = rowOf(report);
    expect(row.note).not.toContain('sewn over the shell edge');
    expect(row.note).toContain('not checked here');
  });

  it("leaves the row to its drawn stretch when the front's free top is not the facing's", () => {
    const report = solveRows(pieces, [
      ['waist', waist(180)],
      ['facing', laid('FACING', 'FRONT', 220)],
    ]);
    expect(rowOf(report).note).not.toContain('sewn over the shell edge');
  });

  it('keeps the other band outside the underlap sewn onto a laid fly shield', () => {
    // Two fronts in a tube, a band on each; the right band runs 80 mm on along a shield laid on
    // its front, past the front's end, under the left band.
    const report = solveRows(
      [
        piece('FL', 'FRONT_L', 1, 26, 30),
        piece('FR', 'FRONT_R', 2, 26, 30),
        piece('BL', 'WST_L_1', 3, 26, 4),
        piece('BR', 'WST_R', 4, 34, 4),
        piece('FAC', 'FLAP_1_L', 5, 4, 20),
        piece('SH', 'FLAP_R', 6, 8, 20),
      ],
      [
        [
          'wl',
          seam('BL#0', 'FL#0', {
            kind: 'composite',
            bParts: ['FL#0', 'FAC#0'],
            partRange: { 'FL#0': [0, 220] },
          }),
        ],
        ['wr', seam('BR#0', 'FR#0', { kind: 'composite', bParts: ['FR#0', 'SH#0'] })],
        ['side', seam('FL#1', 'FR#3')],
        ['back', seam('FL#3', 'FR#1')],
        ['bands', seam('BL#1', 'BR#3')],
        ['fac', laid('FAC', 'FL', 220)],
        ['sh', laid('SH', 'FR', -80)],
      ],
    );
    const shell = ['FL', 'FR', 'BL', 'BR'].flatMap((k) => panelOf(report, k).vs);
    const cx = shell.reduce((t, v) => t + at(report, v)[0], 0) / shell.length;
    const cz = shell.reduce((t, v) => t + at(report, v)[2], 0) / shell.length;
    const radius = (v: number) => Math.hypot(at(report, v)[0] - cx, at(report, v)[2] - cz);
    const left = panelOf(report, 'BL');
    const right = panelOf(report, 'BR');
    const underlap = right.vs.filter((v) => right.uv(v)[0] > 265);
    const d3 = (v: number, w: number) =>
      Math.hypot(...at(report, w).map((x, k) => x - at(report, v)[k]));
    // Underlap vertices with the left band over them (a left vertex within 6 mm): under it or level
    // with it, never through it.
    const covered = underlap
      .map((v) => ({ v, over: left.vs.reduce((best, w) => (d3(v, w) < d3(v, best) ? w : best)) }))
      .filter(({ v, over }) => d3(v, over) < 6);
    expect(covered.length).toBeGreaterThan(5);
    for (const { v, over } of covered) expect(radius(over) - radius(v)).toBeGreaterThan(-0.5);
  });
});
