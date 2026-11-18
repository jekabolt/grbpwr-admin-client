import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { readDxf, readDxfWithPathProvenanceV1 } from 'lib/pattern-import/adapters/dxf/extract';
import { signedArea } from 'lib/pattern-import/adapters/dxf/geometry';
import { segmentDxf } from 'lib/pattern-import/adapters/dxf/segment';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { PtMm } from 'lib/pattern-import/types';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import type { CardContext } from '../client';
import { draftThroughWizardStages } from '../ordinary-dxf-wizard.test-fixture';
import {
  createPatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  selectPatternImportDxfPhaseECadTablePiecesInBoxV1,
} from './cad-table-piece-layout-session-v1';
import { PatternImportDxfPhaseECadTableZeroConnectCanvasV1 } from './cad-table-zero-connect-canvas-v1';
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

it('keeps the native L1 hole in the Workbench material without changing the L14 seam', async () => {
  const { job, card, size } = await holeFixture();
  size.cut = [
    { x: 0, y: 0 },
    { x: 160, y: 0 },
    { x: 160, y: 40 },
    { x: 105, y: 40 },
    { x: 105, y: 80 },
    { x: 160, y: 80 },
    { x: 160, y: 120 },
    { x: 0, y: 120 },
  ];
  size.seam = structuredClone(size.cut);
  const hole = [
    { x: 40, y: 44 },
    { x: 40, y: 72 },
    { x: 68, y: 72 },
    { x: 68, y: 44 },
  ];
  size.cutLoops = [hole];
  size.areaMm2 = signedArea(size.cut) + signedArea(hole);
  size.bbox = { minX: 0, minY: 0, maxX: 160, maxY: 120 };
  size.grain = { ...size.grain!, a: { x: 24, y: 12 }, b: { x: 24, y: 108 } };
  delete size.pointMarks;
  delete size.textMarks;
  const { dxfText } = writeDxfDetailed(job);
  const file = new File([dxfText], 'ac05-native-l1-hole-r12.dxf', { type: 'image/vnd.dxf' });
  const draft = await reviewWithGrain(file, card);
  const [selected, catalog] = await Promise.all([
    selectPatternImportDxfProductDraftPhaseDSizeV1(draft, 'main', 'M'),
    buildPatternImportDxfProductPhaseEAuthoringCatalogV1(draft, 'main', 'M'),
  ]);
  if (!selected.ok || !catalog.ok)
    throw Error(JSON.stringify([selected.blockers, catalog.blockers]));
  const result = projectPatternImportDxfProductPhaseEAssemblyV1(
    catalog.catalog,
    selected.selection,
  );
  if (!result.ok) throw Error(JSON.stringify(result.blockers));

  const [boundary, cutHole] = result.projection.pieces[0].contours;
  expect(boundary.role).toBe('cut-boundary');
  expect(cutHole.role).toBe('hole');
  expect(cutHole.contourId).toMatch(/\/g\/cut-loop\/0$/);
  expect(cutHole.vertices.map(({ pointMm }) => pointMm)).toEqual(hole);
  const original = await readDxfWithPathProvenanceV1(
    { id: 'source', name: file.name, bytes: await file.arrayBuffer() },
    { sagittaMm: 0.05, keepFills: true },
    { sourceFileId: result.projection.sourceFileId },
  );
  if (!original.ok) throw Error(JSON.stringify(original.blockers));
  const [nativePiece] = segmentDxf(original.value.read).pieces;
  const nativeHole = original.value.provenance.paths.find(
    ({ pathId }) => nativePiece.roles[pathId] === 'hole',
  );
  expect(cutHole.vertices.map(({ vertexId }) => vertexId)).toEqual(
    nativeHole?.provenance.samples.map(({ vertexId }) => vertexId),
  );
  const nativeSewing = draft.dxfNativeSewingReplay;
  if (!nativeSewing?.replayReady) throw Error(JSON.stringify(nativeSewing?.blockers));
  const [seam] = nativeSewing.pipeline.carrier!.pieces[0].contours;
  expect(nativeSewing.pipeline.carrier!.pieces[0].contours).toHaveLength(1);
  expect(seam.role).toBe('sewing-boundary');
  expect(seam.id).toMatch(/\/g\/seam$/);

  const layout = createPatternImportDxfPhaseECadTablePieceLayoutSessionV1(result.projection.pieces);
  expect(layout.pieces[0].sourceMaterialRings).toEqual([size.cut, hole]);
  const pick = (x: number, y: number) =>
    selectPatternImportDxfPhaseECadTablePiecesInBoxV1(
      layout,
      { minX: x, maxX: x, minY: y, maxY: y },
      'replace',
    ).selectedPieceKeys;
  expect(pick(75, 22)).toEqual([layout.pieces[0].identity.key]);
  expect(pick(54, 58)).toEqual([]);
  expect(pick(135, 60)).toEqual([]);
  expect(pick(172, 60)).toEqual([]);

  const html = renderToStaticMarkup(
    createElement(PatternImportDxfPhaseECadTableZeroConnectCanvasV1, {
      catalog: catalog.catalog,
      projection: result.projection,
    }),
  );
  const hitArea = html.match(/<path[^>]*data-cad-zero-connect-material=""[^>]*>/)?.[0];
  expect(hitArea).toContain('fill-rule="evenodd"');
  expect(hitArea).toContain('M 40,-44 40,-72 68,-72 68,-44 Z');
  expect(hitArea).toContain('pointer-events="fill"');
  expect(html).toContain(`data-cad-zero-connect-contour="${cutHole.contourId}"`);
});

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

it('preserves both grades and refuses the whole cut when one grade has an ambiguous hole', async () => {
  const { job, card, size, cut } = await holeFixture();
  const largerRank = { rank: 1, token: 'L', sizeId: 8, name: 'L', sourceLabel: 'L' };
  job.sizes.push(largerRank);
  card.sizes.push({ ...largerRank, spellings: ['L'] });
  const larger = structuredClone(size);
  larger.rank = largerRank.rank;
  larger.sizeId = largerRank.sizeId;
  larger.sizeToken = largerRank.token;
  larger.cut = size.cut.map(({ x, y }) => ({ x: x * (130 / 120), y: y * 1.1 }));
  larger.seam = structuredClone(larger.cut);
  larger.bbox = { minX: 0, minY: 0, maxX: 130, maxY: 110 };
  larger.cutLoops = [squareHole(14, 34), squareHole(84, 48)];
  larger.areaMm2 = 14_100;
  job.pieces[0]!.sizes.push(larger);
  const original = structuredClone(job);
  const result = executePatternImportDxfPhaseEDraftCadCutGeometryV1(job, cut);
  if (!result.ok) throw Error(JSON.stringify(result.blockers));
  expect(job).toEqual(original);
  expect(
    result.job.pieces.map(({ sizes }) =>
      sizes.map(({ sizeToken, cutLoops }) => [sizeToken, cutLoops?.length]),
    ),
  ).toEqual([
    [
      ['M', 1],
      ['L', 1],
    ],
    [
      ['M', 1],
      ['L', 1],
    ],
  ]);
  const file = new File([writeDxfDetailed(result.job).dxfText], 'graded-cut.dxf', {
    type: 'image/vnd.dxf',
  });
  const scope = (await reviewWithGrain(file, card)).scopes[0]!;
  expect(scope.manifest.gate?.passed).toBe(true);
  expect(
    scope.writerReplay?.job.pieces.map(({ sizes }) =>
      sizes.map(({ sizeToken, cutLoops }) => [sizeToken, cutLoops?.map(signedArea)]),
    ),
  ).toEqual([
    [
      ['M', [-100]],
      ['L', [-100]],
    ],
    [
      ['M', [-100]],
      ['L', [-100]],
    ],
  ]);

  larger.cutLoops[1] = squareHole(56, 48);
  const changed = structuredClone(job);
  expect(executePatternImportDxfPhaseEDraftCadCutGeometryV1(job, cut)).toMatchObject({
    ok: false,
    job: null,
    blockers: [{ code: 'feature-partition-ambiguous', detail: expect.stringContaining('size L') }],
  });
  expect(job).toEqual(changed);
});

it('refuses to split an authored notch group into two different pieces', async () => {
  const { job, size, cut } = await holeFixture();
  size.notches = [58.5, 61.5].map((x, index) => ({
    kind: 'notch',
    at: { x, y: 0 },
    seg: [
      { x, y: 0 },
      { x, y: 3 },
    ],
    depthMm: 3,
    ranges: [],
    origin: 'operator',
    confidence: 1,
    authoredGroup: { groupId: 'double-one', shape: 'double', index },
  }));
  expect(executePatternImportDxfPhaseEDraftCadCutGeometryV1(job, cut)).toMatchObject({
    ok: false,
    job: null,
    blockers: [
      { code: 'feature-partition-ambiguous', detail: expect.stringContaining('notch group') },
    ],
  });
});

it.each(['bulge', 'owner', 'width'] as const)(
  'refuses an own R2000 signed cut hole with altered %s',
  async (change) => {
    const { job } = await holeFixture();
    const { dxfFastPath } = await import('lib/pattern-import/adapters/dxf/stages');
    const { dxfText } = writeDxfDetailed({ ...job, dialect: 'r2000' });
    // Edit the native entity with the exact first hole vertex. Retain every manifest byte.
    const lines = dxfText.split(/\r?\n/);
    const start = lines.findIndex(
      (v, i) =>
        v.trim() === '10' &&
        lines[i + 1] === '12.000000' &&
        lines[i + 2]?.trim() === '20' &&
        lines[i + 3] === '30.000000',
    );
    expect(start).toBeGreaterThan(0);
    let begin = start;
    while (begin > 0 && lines[begin] !== 'LWPOLYLINE') begin--;
    expect(lines[begin]).toBe('LWPOLYLINE');
    if (change === 'bulge') lines.splice(start + 4, 0, ' 42', '0.015625');
    else {
      const tag = change === 'owner' ? '330' : '43';
      const offset = lines.slice(begin + 1, start).findIndex((value) => value.trim() === tag);
      expect(offset).toBeGreaterThanOrEqual(0);
      lines[begin + 2 + offset] = change === 'owner' ? 'FFFF' : '1.000000';
    }
    const read = await readDxf(
      {
        id: 'altered-hole',
        name: 'altered-hole.dxf',
        bytes: new TextEncoder().encode(lines.join(dxfText.includes('\r\n') ? '\r\n' : '\n'))
          .buffer,
      },
      { sagittaMm: 0.05, keepFills: true },
    );
    expect(() => dxfFastPath(read, segmentDxf(read))).toThrow(/native DXF cut hole/i);
  },
);

it('opens the lower half by a signed parallel displacement and rejects a foreign guide and one bad rank atomically', async () => {
  const { applyDraftParallelSpreadV1 } = await import('./draft-cad-parallel-spread-v1');
  const { job, size, cut } = await holeFixture();
  const guide = {
    ...cut,
    payload: {
      ...cut.payload,
      pointsMm: [
        { x: -10, y: 50 },
        { x: 130, y: 50 },
      ],
    },
  };
  size.grain = { ...size.grain!, a: { x: 5, y: 20 }, b: { x: 100, y: 20 } };
  // Both original holes and the complete grain lie away from the registered horizontal chord.
  size.cutLoops![1] = squareHole(80, 65);
  const spread = {
    tool: 'spread',
    commandId: 'opening',
    target: cut.target,
    payload: {
      mode: 'parallel',
      entityId: 'open',
      cutLineEntityId: cut.payload.entityId,
      amountMm: 8,
      movingSide: 'negative',
    },
  } as const;
  const before = structuredClone(job);
  const result = applyDraftParallelSpreadV1(job, guide, spread);
  if (!result.ok) throw Error(result.detail);
  const after = result.job.pieces[0]!.sizes[0]!;
  expect(after.bbox).toEqual({ minX: 0, minY: -8, maxX: 120, maxY: 100 });
  expect(after.areaMm2 - size.areaMm2).toBeCloseTo(960);
  expect(after.cutLoops).toEqual([squareHole(12, 22), squareHole(80, 65)]);
  expect(after.grain?.a).toEqual({ x: 5, y: 12 });
  const wrong = [
    { ...spread, target: { ...spread.target, pieceLineKey: 'wrong-line' } },
    { ...spread, payload: { ...spread.payload, cutLineEntityId: 'unknown' } },
  ];
  for (const command of wrong)
    expect(applyDraftParallelSpreadV1(job, guide, command).ok).toBe(false);
  expect(job).toEqual(before);
  const other = { ...structuredClone(size), sizeToken: 'L', sizeId: 8, rank: 1 };
  other.cutLoops![1] = squareHole(80, 45);
  job.pieces[0]!.sizes.push(other);
  const snapshot = structuredClone(job);
  expect(applyDraftParallelSpreadV1(job, guide, spread)).toMatchObject({ ok: false });
  expect(job).toEqual(snapshot);
});
