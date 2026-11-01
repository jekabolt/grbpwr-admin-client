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
import { dollOwnerSeamsOf } from 'components/managers/tech-card/components/assembly-doll/use-doll-card';
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
  extra: SeamCandidate;
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
  return { facts, graph, row, owner, extra };
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
  const pieceKeys = new Set(['A', 'B', 'C']);
  const geomsOf = (graph: SeamGraph) =>
    new Map(graph.pieces.map((piece) => [piece.pieceKey, piece]));
  const stepAB = (seamKeys: string[]) => ({
    inputKeys: ['A', 'B'],
    outputUnitKey: 'AB',
    seamKeys,
  });

  it('sews a confirmed row through the step that names it, never a rejected row, no proposals', () => {
    const { facts, graph, row, extra } = fixture();
    const rejected = seamFromCandidate(extra, graph.pieces, {
      seamKey: 'rejected-row',
      status: 'rejected',
      source: 'manual',
      anchoredSize: 'M',
    });
    if (!rejected) throw new Error('rejected row fixture did not resolve');
    expect(
      graph.chosen.some(
        (candidate) => candidate.a.startsWith('C#') || candidate.b.startsWith('C#'),
      ),
    ).toBe(true);
    const selected = dollOwnerSeamsOf({
      rows: [row, rejected],
      poses: new Map(),
      operations: [stepAB([row.seamKey])],
      geoms: geomsOf(graph),
      innerLines: new Map(),
      stepResults: [],
      graph,
      pieceKeys,
    });
    if (!selected) throw new Error('owner rows were not selected');
    expect(selected.rows).toEqual([row, rejected]);
    expect(selected.candidates).toHaveLength(1);
    expect(selected.candidates[0].seamKey).toBe(row.seamKey);
    expect(selected.candidates[0].inStep).toBe(true);
    expect(selected.candidates[0].guess).toBeUndefined();
    expect(selected.inStepKeys).toEqual([row.seamKey]);
    expect(selected.guessed).toBe(0);

    const report = solveDoll({
      graph,
      facts,
      options: {
        ...fast,
        joins: [{ label: 'unowned order join', parts: [['B'], ['C']] }],
        seams: {
          mode: 'owner',
          rows: selected.rows,
          size: 'M',
          candidates: selected.candidates,
          inStepKeys: selected.inStepKeys,
          selection: {
            confirmed: selected.confirmed,
            inSteps: selected.inSteps,
            rejected: selected.rejected,
            guessed: selected.guessed,
          },
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
    expect(report.seams[0].inStep).toBe(true);
    expect(report.seams[0].guessed).toBeUndefined();
    expect(report.orderJoins).toEqual([]);
    expect(
      report.floating.some((piece) => piece.pieceKey === 'C' && piece.reason.includes('no seam')),
    ).toBe(true);
    expect(report.rows?.words).toContain(
      'rows: confirmed 1 · sewn by steps 1 · no step 0 (not sewn) · rejected 1 (not sewn) · guessed 0 (steps without a row, dashed)',
    );
    expect(report.rows?.words).toContain('no seam: side');
  });

  it('leaves a confirmed row no step names unsewn and lists it by its pieces', () => {
    const { facts, graph, row } = fixture();
    const selected = dollOwnerSeamsOf({
      rows: [row],
      poses: new Map(),
      operations: [],
      geoms: geomsOf(graph),
      innerLines: new Map(),
      stepResults: [],
      graph,
      pieceKeys,
    });
    if (!selected) throw new Error('owner rows were not selected');
    expect(selected.candidates).toEqual([]);
    expect(selected.inStepKeys).toEqual([]);
    expect(selected.confirmed).toBe(1);
    expect(selected.inSteps).toBe(0);

    const report = solveDoll({
      graph,
      facts,
      options: {
        ...fast,
        seams: {
          mode: 'owner',
          rows: selected.rows,
          size: 'M',
          candidates: selected.candidates,
          inStepKeys: selected.inStepKeys,
          selection: {
            confirmed: selected.confirmed,
            inSteps: selected.inSteps,
            rejected: selected.rejected,
            guessed: selected.guessed,
          },
        },
      },
    });
    expect(report.seams).toHaveLength(0);
    expect(report.contradictions).toEqual([]);
    expect(report.floating.map((piece) => piece.pieceKey).sort()).toEqual(['A', 'B', 'C']);
    expect(report.rows?.words).toContain(
      'rows: confirmed 1 · sewn by steps 0 · no step 1 (not sewn) · rejected 0 (not sewn) · guessed 0 (steps without a row, dashed)',
    );
    expect(report.rows?.words).toContain('not sewn, no step names it: front #1 ↔ front_1 #3');
    expect(report.rows?.words.join('\n')).not.toContain(row.seamKey);
  });

  it('sews a rowless sewing step by the guess its step picture draws, as a dashed doll guess', () => {
    const { facts, graph, row, extra } = fixture();
    const selected = dollOwnerSeamsOf({
      rows: [row],
      poses: new Map(),
      operations: [stepAB([row.seamKey]), { inputKeys: ['AB', 'C'], outputUnitKey: 'ABC' }],
      geoms: geomsOf(graph),
      innerLines: new Map(),
      stepResults: [],
      graph,
      pieceKeys,
    });
    if (!selected) throw new Error('owner rows were not selected');
    expect(selected.candidates.map((candidate) => candidate.seamKey)).toEqual([
      row.seamKey,
      'guess:1:0',
    ]);
    expect(selected.candidates[1].guess).toEqual({ step: 2 });
    expect(selected.candidates[1].candidate.a).toBe(extra.a);
    expect(selected.candidates[1].candidate.b).toBe(extra.b);
    expect(selected.guessed).toBe(1);
    expect(selected.inSteps).toBe(1);

    const report = solveDoll({
      graph,
      facts,
      options: {
        ...fast,
        seams: {
          mode: 'owner',
          rows: selected.rows,
          size: 'M',
          candidates: selected.candidates,
          inStepKeys: selected.inStepKeys,
          selection: {
            confirmed: selected.confirmed,
            inSteps: selected.inSteps,
            rejected: selected.rejected,
            guessed: selected.guessed,
          },
        },
      },
    });
    expect(report.seams).toHaveLength(2);
    const guess = report.seams.find((seam) => seam.guessed);
    expect(guess?.decidedBy).toBe('doll');
    expect(guess?.note).toContain('step 2 names no row');
    expect([...(guess?.a ?? []), ...(guess?.b ?? [])].some((id) => id.startsWith('C#'))).toBe(true);
    expect(report.seams.filter((seam) => seam.decidedBy === 'person')).toHaveLength(1);
    expect(report.contradictions).toEqual([]);
    expect(report.floating.some((piece) => piece.pieceKey === 'C')).toBe(false);
    expect(report.rows?.words).toContain(
      'rows: confirmed 1 · sewn by steps 1 · no step 0 (not sewn) · rejected 0 (not sewn) · guessed 1 (steps without a row, dashed)',
    );
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
          candidates: [{ seamKey: row.seamKey, candidate: impossible, inStep: true }],
          inStepKeys: [row.seamKey],
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
          candidates: [{ seamKey: layered.seamKey, candidate: owner, inStep: true }],
          inStepKeys: [layered.seamKey],
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
