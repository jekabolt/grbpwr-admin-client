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
import { seamFromCandidate, withSeamLayer, type StoredSeam } from 'lib/seams';
import {
  OWNER_FIT,
  stepResults,
} from 'components/managers/tech-card/components/step-seams/step-result';

import { solveDoll } from './doll';
import type { DollOptions, DollReport } from './types';

const evidence: SeamEvidence = {
  dLenMm: 0,
  relLen: 0,
  notchScore: null,
  curvature: 'flat',
  hand: 'neutral',
  twin: 'identical',
  self: false,
  aLenMm: 200,
  bLenMm: 200,
};

const seam = (a: string, b: string): SeamCandidate => ({
  a,
  b,
  score: 1,
  kind: 'edge',
  evidence,
});

function rectangle(key: string, name: string, index: number): SkeletonPieceInput {
  const poly = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 20 },
    { x: 0, y: 20 },
  ];
  const piece: PieceDTO = {
    id: index,
    name,
    blockName: key,
    source: 'owner-seams-test',
    poly,
    bboxW: 10,
    bboxH: 20,
    areaCm2: 200,
  };
  return {
    pieceKey: key,
    name,
    piece,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  };
}

function fixture(): {
  facts: SkeletonFacts;
  graph: SeamGraph;
  row: StoredSeam;
  owner: SeamCandidate;
} {
  const facts: SkeletonFacts = {
    pieces: [rectangle('A', 'front', 1), rectangle('B', 'front_1', 2), rectangle('C', 'side', 3)],
    category: 'shirt',
    bom: {
      zipper: 0,
      buttons: 0,
      snaps: 0,
      tape: 0,
      elastic: 0,
      drawcord: 0,
      interlining: 0,
    },
    defaultMachineType: null,
  };
  const read = readSeamGraph(facts);
  const owner = seam('A#1', 'B#3');
  const extra = seam('B#1', 'C#3');
  const graph: SeamGraph = {
    ...read,
    chosen: [owner, extra],
    rejected: [],
    components: [['A', 'B', 'C']],
  };
  const row = seamFromCandidate(owner, graph.pieces, {
    seamKey: 'owner-row',
    status: 'confirmed',
    source: 'manual',
    anchoredSize: 'M',
  });
  if (!row) throw new Error('owner row fixture did not resolve');
  return { facts, graph, row, owner };
}

const fast: DollOptions = {
  targetVertices: 120,
  maxPasses: 0,
  settlePasses: 0,
  proposeComposite: false,
};

const withoutTimes = (report: DollReport): DollReport => ({
  ...report,
  stats: { ...report.stats, ms: 0, msMesh: 0, msSolve: 0 },
});

describe('paper doll owner seams', () => {
  it("does not add the engine's unowned seam or any proposed seam", () => {
    const { facts, graph, row, owner } = fixture();
    expect(
      graph.chosen.some(
        (candidate) => candidate.a.startsWith('C#') || candidate.b.startsWith('C#'),
      ),
    ).toBe(true);

    const report = solveDoll({
      graph,
      facts,
      options: {
        ...fast,
        joins: [{ label: 'unowned order join', parts: [['B'], ['C']] }],
        seams: {
          mode: 'owner',
          rows: [row],
          size: 'M',
          candidates: [{ seamKey: row.seamKey, candidate: owner }],
          selection: { used: 1, ignored: 2 },
        },
      },
    });

    expect(report.seams).toHaveLength(1);
    expect(
      report.seams.some((candidate) =>
        [...candidate.a, ...candidate.b].some((id) => id.startsWith('C#')),
      ),
    ).toBe(false);
    expect(report.seams.some((candidate) => candidate.state === 'proposed')).toBe(false);
    expect(report.seams.some((candidate) => candidate.origin === 'doll-proposed')).toBe(false);
    expect(report.seams.every((candidate) => candidate.decidedBy === 'person')).toBe(true);
    expect(report.orderJoins).toEqual([]);
    expect(
      report.floating.some((piece) => piece.pieceKey === 'C' && piece.reason.includes('no seam')),
    ).toBe(true);
    expect(report.rows?.words).toContain(
      'owner rows: 1 used (bound to steps) · 2 ignored (unbound)',
    );
    expect(report.rows?.words).toContain('no seam: side');
  });

  it('keeps an impossible owner seam confirmed and reports the contradiction', () => {
    const facts: SkeletonFacts = {
      ...fixture().facts,
      pieces: [rectangle('A', 'front', 1), rectangle('B', 'back', 2)].map((piece, index) =>
        index === 0
          ? piece
          : {
              ...piece,
              piece: {
                ...piece.piece,
                poly: [
                  { x: 0, y: 0 },
                  { x: 15, y: 0 },
                  { x: 15, y: 30 },
                  { x: 0, y: 30 },
                ],
                bboxW: 15,
                bboxH: 30,
                areaCm2: 450,
              },
            },
      ),
    };
    const read = readSeamGraph(facts);
    const edgeA = [...(read.pieces.find((piece) => piece.pieceKey === 'A')?.edges ?? [])].sort(
      (left, right) => left.lenMm - right.lenMm,
    )[0];
    const edgeB = [...(read.pieces.find((piece) => piece.pieceKey === 'B')?.edges ?? [])].sort(
      (left, right) => right.lenMm - left.lenMm,
    )[0];
    if (!edgeA || !edgeB) throw new Error('impossible seam fixture has no edges');
    const impossible = {
      ...seam(edgeA.id, edgeB.id),
      evidence: { ...evidence, twin: 'none' as const },
    };
    const graph: SeamGraph = {
      ...read,
      chosen: [impossible],
      rejected: [],
      components: [['A', 'B']],
    };
    const row = seamFromCandidate(impossible, graph.pieces, {
      seamKey: 'impossible-owner-row',
      status: 'confirmed',
      source: 'manual',
      anchoredSize: 'M',
    });
    if (!row) throw new Error('impossible owner row fixture did not resolve');

    const report = solveDoll({
      graph,
      facts,
      options: {
        ...fast,
        seams: {
          mode: 'owner',
          rows: [row],
          size: 'M',
          candidates: [{ seamKey: row.seamKey, candidate: impossible }],
        },
      },
    });

    expect(report.seams).toHaveLength(1);
    expect(report.seams[0].decidedBy).toBe('person');
    expect(report.seams[0].released).not.toBe(true);
    expect(report.contradictions).toEqual(
      expect.arrayContaining([expect.stringContaining('confirmed by a person')]),
    );
  });

  it('uses the same under/over claim as step-result', () => {
    const { facts, graph, row, owner } = fixture();
    const layered: StoredSeam = {
      ...row,
      sideA: row.sideA.map((anchor) => withSeamLayer(anchor, 'under')),
      sideB: row.sideB.map((anchor) => withSeamLayer(anchor, 'over')),
    };
    const byKey = new Map([[layered.seamKey, layered]]);
    const geoms = new Map(graph.pieces.map((piece) => [piece.pieceKey, piece]));
    const result = stepResults(
      {
        ops: [{ inputKeys: ['A', 'B'], outputUnitKey: 'AB', seamKeys: [layered.seamKey] }],
        byKey,
        geoms,
        innerLines: new Map(),
        pieceKeys: new Set(['A', 'B', 'C']),
      },
      OWNER_FIT,
    )[0];
    expect(result.stacked).toEqual([['A', 'B']]);

    const report = solveDoll({
      graph,
      facts,
      options: {
        ...fast,
        seams: {
          mode: 'owner',
          rows: [layered],
          size: 'M',
          candidates: [{ seamKey: layered.seamKey, candidate: owner }],
          layers: result.stacked,
        },
      },
    });
    const visible = report.panels.find((panel) => panel.layers.includes('A'));
    expect(visible?.pieceKey).toBe('B');
  });

  it('keeps the historical report when no owner rows are supplied', () => {
    const { facts, graph } = fixture();
    const legacy = solveDoll({ graph, facts, options: fast });
    const emptyRows = solveDoll({
      graph,
      facts,
      options: { ...fast, seams: { rows: [], size: 'M' } },
    });

    expect(withoutTimes(emptyRows)).toEqual(withoutTimes(legacy));
  });
});
