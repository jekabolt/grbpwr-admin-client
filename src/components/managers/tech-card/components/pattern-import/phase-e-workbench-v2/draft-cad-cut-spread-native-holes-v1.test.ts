import { expect, it } from 'vitest';
import { readDxf } from 'lib/pattern-import/adapters/dxf/extract';
import { signedArea } from 'lib/pattern-import/adapters/dxf/geometry';
import { segmentDxf } from 'lib/pattern-import/adapters/dxf/segment';
import type { PtMm } from 'lib/pattern-import/types';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import type { CardContext } from '../client';
import { draftThroughWizardStages } from '../ordinary-dxf-wizard.test-fixture';
import { executePatternImportDxfPhaseEDraftCadCutGeometryV1 } from './draft-cad-cut-geometry-executor-v1';
import { executePatternImportDxfPhaseEDraftCadSpreadGeometryV1 } from './draft-cad-spread-geometry-executor-v1';
import { createSavedThreePanelFixtureV1 } from './saved-full-assembly-compile-session-v1.test-fixture';

const squareHole = (x: number, y: number): PtMm[] => [
  { x, y },
  { x, y: y + 10 },
  { x: x + 10, y: y + 10 },
  { x: x + 10, y },
];

async function holeFixture() {
  const { job, card } = await createSavedThreePanelFixtureV1(2);
  const piece = job.pieces[0]!;
  const size = piece.sizes[0]!;
  job.pieces = [piece];
  piece.allowance = { ...piece.allowance, meaning: 'both', allowanceMm: 0 };
  size.cut = [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 100 },
    { x: 0, y: 100 },
  ];
  size.seam = structuredClone(size.cut);
  size.cutLoops = [squareHole(12, 30), squareHole(80, 40)];
  size.areaMm2 = 11_800;
  size.bbox = { minX: 0, minY: 0, maxX: 120, maxY: 100 };
  size.grain = { ...size.grain!, a: { x: 25, y: 20 }, b: { x: 25, y: 80 } };
  size.pointMarks = [{ kind: 'draft-point', at: { x: 26, y: 30 } }];
  size.textMarks = [{ at: { x: 96, y: 20 }, text: 'Retain' }];
  const cut = {
    tool: 'cut',
    commandId: 'hole-cut',
    target: { pieceId: piece.identity, pieceLineKey: card.existingPieces[0]!.lineKey },
    payload: {
      entityId: 'hole-cut',
      keepSide: 'both',
      pointsMm: [
        { x: 60, y: -10 },
        { x: 60, y: 110 },
      ],
    },
  } as const;
  return { job, card, size, cut };
}

function reviewWithGrain(file: File, card: CardContext) {
  return draftThroughWizardStages(file, card, undefined, undefined, (initial) => {
    const operatorGrain = Object.fromEntries(
      (initial.grainProposals ?? []).map(({ seed, a, b, evidence }) => [
        seed,
        { a, b, accepted: evidence },
      ]),
    );
    return { operatorGrain };
  });
}

it('keeps one native L1 hole, exact marks and signed material area on each cut descendant', async () => {
  const { job, card, size, cut } = await holeFixture();
  const original = structuredClone(job);
  const result = executePatternImportDxfPhaseEDraftCadCutGeometryV1(job, cut);
  if (!result.ok) throw Error(JSON.stringify(result.blockers));
  expect(job).toEqual(original);
  expect(result.derivedPieceIdentities).toHaveLength(2);
  expect(new Set(result.derivedPieceIdentities).size).toBe(2);
  const descendants = result.job.pieces.map((piece) => piece.sizes[0]!);
  expect(descendants.map(({ areaMm2 }) => areaMm2)).toEqual([5_900, 5_900]);
  expect(descendants.map(({ cutLoops }) => cutLoops)).toEqual([
    [size.cutLoops![1]],
    [size.cutLoops![0]],
  ]);
  expect(
    descendants.map(({ pointMarks, textMarks }) => [pointMarks?.length, textMarks?.length]),
  ).toEqual([
    [0, 1],
    [1, 0],
  ]);
  const written = writeDxfDetailed(result.job);
  const bytes = new TextEncoder().encode(written.dxfText).buffer;
  const native = await readDxf(
    { id: 'cut-hole-test', name: 'cut-hole-test.dxf', bytes },
    { sagittaMm: 0.05, keepFills: true },
  );
  const seg = segmentDxf(native);
  const file = new File([written.dxfText], 'cut-hole-test.dxf', { type: 'image/vnd.dxf' });
  expect(seg.pieces).toHaveLength(2);
  for (const block of seg.pieces) {
    const holes = native.doc.pages[0]!.paths.filter(({ id }) => block.roles[id] === 'hole');
    expect(holes).toHaveLength(1);
    expect(signedArea(holes[0]!.pts)).toBe(-100);
  }
  const draft = await reviewWithGrain(file, card);
  const scope = draft.scopes[0]!;
  expect(scope.manifest.gate?.passed).toBe(true);
  const reopened = scope.writerReplay!.job.pieces;
  expect(reopened).toHaveLength(2);
  expect(reopened.map(({ sizes }) => sizes[0]?.cutLoops?.map(signedArea))).toEqual([
    [-100],
    [-100],
  ]);
});

it('moves the hole rigidly with the spread panel and refuses a chord through or tangent to a hole', async () => {
  const { job, card, size, cut } = await holeFixture();
  const result = executePatternImportDxfPhaseEDraftCadSpreadGeometryV1(job, cut, {
    commandId: 'hole-spread',
    tool: 'spread',
    target: cut.target,
    payload: {
      entityId: 'hole-spread',
      cutLineEntityId: cut.payload.entityId,
      pivotMm: { x: 60, y: 0 },
      amountMm: 10,
    },
  });
  if (!result.ok) throw Error(JSON.stringify(result.blockers));
  const [stationary, moving] = result.job.pieces.map(({ sizes }) => sizes[0]!);
  expect(stationary!.cutLoops).toEqual([size.cutLoops![1]]);
  const hole = moving!.cutLoops![0]!;
  expect(hole).not.toEqual(size.cutLoops![0]);
  expect(signedArea(hole)).toBeCloseTo(-100, 8);
  const point = moving!.pointMarks![0]!.at;
  expect(Math.hypot(point.x - hole[0]!.x, point.y - hole[0]!.y)).toBeCloseTo(14, 8);
  const written = writeDxfDetailed(result.job);
  const file = new File([written.dxfText], 'spread-hole-test.dxf', { type: 'image/vnd.dxf' });
  const draft = await reviewWithGrain(file, card);
  const scope = draft.scopes[0]!;
  expect(scope.manifest.gate?.passed).toBe(true);
  const reopened = scope.writerReplay!.job.pieces;
  expect(reopened.map(({ identity }) => identity).sort()).toEqual(
    [...result.derivedPieceIdentities].sort(),
  );
  for (const piece of reopened) {
    const holes = piece.sizes[0]!.cutLoops;
    expect(holes).toHaveLength(1);
    expect(signedArea(holes![0]!)).toBeCloseTo(-100, 3);
  }
  for (const x of [12, 17]) {
    expect(
      executePatternImportDxfPhaseEDraftCadCutGeometryV1(job, {
        ...cut,
        payload: {
          ...cut.payload,
          pointsMm: [
            { x, y: -10 },
            { x, y: 110 },
          ],
        },
      }),
    ).toMatchObject({
      ok: false,
      job: null,
      blockers: [
        { code: 'feature-partition-ambiguous', detail: expect.stringContaining('A hole') },
      ],
    });
  }
});
