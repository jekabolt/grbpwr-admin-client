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
        seams: {
          mode: 'owner',
          rows: [row],
          size: 'M',
          candidates: [{ seamKey: row.seamKey, candidate: owner }],
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
    expect(
      report.floating.some((piece) => piece.pieceKey === 'C' && piece.reason.includes('no seam')),
    ).toBe(true);
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
