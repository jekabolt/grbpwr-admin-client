import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { parseDxf } from 'lib/nesting/dxf/parse';
import { entityToChain } from 'lib/nesting/dxf/entities';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { signedArea } from 'lib/pattern-import/semantics/geom';
import type { PtMm } from 'lib/pattern-import/types';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { expect, it } from 'vitest';

import { createPatternImportDxfPhaseEBoundDraftCadSessionV1 } from './draft-cad-binding-v1';
import {
  buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1,
  recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1,
  recordPatternImportDxfPhaseEDraftCadCanvasPointV1,
} from './draft-cad-canvas-v1';
import { createPatternImportDxfPhaseEDraftCadCompileSourceV1 } from './draft-cad-compile-source-v1';
import { compilePatternImportDxfPhaseEDraftCadGeometryV1 } from './draft-cad-geometry-compile-v1';
import { resizeDraftCadSelectedSizeEdgeV1 } from './draft-cad-edge-length-geometry-v1';
import {
  redoPatternImportDxfPhaseEDraftCadSessionV1,
  undoPatternImportDxfPhaseEDraftCadSessionV1,
} from './draft-cad-session-v1';

async function setup() {
  const { draft } = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
  const selected = await selectPatternImportDxfProductDraftPhaseDSizeV1(draft, 'main', 'M');
  const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(draft, 'main', 'M');
  if (!selected.ok || !catalog.ok) throw new Error('The saved pattern fixture is unavailable.');
  const { selection } = selected;
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(catalog.catalog, selection);
  if (!projected.ok) throw new Error('The pattern projection is unavailable.');
  const { projection } = projected;
  const bound = createPatternImportDxfPhaseEBoundDraftCadSessionV1({
    source: {
      phaseD: {
        sourceFileId: selection.phaseD.source.sourceFileId,
        sourceSha256: selection.phaseD.sourceSha256,
        selectedGeometrySha256: selection.selection.selectedGeometrySha256,
      },
      catalog: catalog.catalog,
      revision: 1,
    },
    projection,
  });
  const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(draft);
  if (!bound.ok || !compileSource) throw new Error('The Draft session is unavailable.');
  const [edge] = buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1(bound.session, projection, 0);
  if (!edge) throw new Error('The fixture has no exact editable edge.');
  return { session: bound.session, projection, selection, compileSource, draft, edge };
}

it.each(['start', 'end'] as const)(
  'sets the exact native edge length with its %s endpoint fixed and retains the other pieces',
  async (fixed) => {
    const { session, projection, selection, compileSource, draft, edge } = await setup();
    const [first] = projection.pieces;
    const dx = edge.toMm.x - edge.fromMm.x;
    const dy = edge.toMm.y - edge.fromMm.y;
    const lengthMm = Math.hypot(dx, dy) * 0.8;
    const edit = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
      session,
      projection,
      activeTool: 'edge-length',
      activePieceIndex: 0,
      baseKey: edge.key,
      sequence: 0,
      resize: { fixed, lengthMm },
    });
    expect(edit.recorded).toBe(true);
    expect(edit.session.history[0]?.commands[0]).toMatchObject({
      tool: 'edge-length',
      payload: { sizeToken: 'M', lengthMm, fixed },
    });
    const previous = undoPatternImportDxfPhaseEDraftCadSessionV1(edit.session);
    if (!previous.ok) throw new Error(previous.blocker.detail);
    expect(previous.session.cursor).toBe(0);
    const next = redoPatternImportDxfPhaseEDraftCadSessionV1(previous.session);
    if (!next.ok) throw new Error(next.blocker.detail);
    const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
      session: next.session,
      projection,
      selection,
      compileSource,
    });
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.blockers));
    const { artifact } = compiled;
    const original = draft.scopes[0]!.writerReplay!.job.pieces;
    const output = artifact.compiledJob.pieces;
    const source = original.find(({ identity }) => identity === first?.pieceId)!;
    const resized = output.find(({ identity }) => identity === first?.pieceId)!;
    const sourceSize = source.sizes.find(({ sizeToken }) => sizeToken === 'M')!;
    const editedSize = resized.sizes.find(({ sizeToken }) => sizeToken === 'M')!;
    const stablePoint = fixed === 'start' ? edge.fromMm : edge.toMm;
    const movedPoint = fixed === 'start' ? edge.toMm : edge.fromMm;
    const replacedIndex = sourceSize.cut.findIndex(
      ({ x, y }) => x === movedPoint.x && y === movedPoint.y,
    );
    expect(replacedIndex).toBeGreaterThanOrEqual(0);
    expect(editedSize.cut.map((point, index) => index !== replacedIndex && point)).toEqual(
      sourceSize.cut.map((point, index) => index !== replacedIndex && point),
    );
    const after = editedSize.cut[replacedIndex]!;
    expect(Math.hypot(after.x - stablePoint.x, after.y - stablePoint.y)).toBeCloseTo(lengthMm);
    expect(output.filter(({ identity }) => identity !== first?.pieceId)).toEqual(
      original.filter(({ identity }) => identity !== first?.pieceId),
    );
    const written = artifact.manifest.blocks.find(
      ({ identity, sizeToken }) => identity === first?.pieceId && sizeToken === 'M',
    )!;
    const decoded = parseDxf(new TextEncoder().encode(artifact.dxfText).buffer, 'mm');
    const cuts = decoded.dxf.blocks[written.block]!.entities.filter(
      ({ layer, type }) => layer === '1' && (type === 'POLYLINE' || type === 'LWPOLYLINE'),
    ).map((entity) => entityToChain(entity, 1, 0.001));
    expect(cuts).toHaveLength(1);
    const points = cuts[0]!.pts;
    expect(
      points.some(({ x, y }, i) => {
        const b = points[(i + 1) % points.length]!;
        return Math.abs(Math.hypot(x - b.x, y - b.y) - lengthMm) < 0.001;
      }),
    ).toBe(true);
  },
);

it('refuses a missing exact edge or a collapsed length before recording anything', async () => {
  const { session, projection, edge } = await setup();
  const input = {
    session,
    projection,
    activeTool: 'edge-length',
    activePieceIndex: 0,
    sequence: 0,
  } as const;
  for (const [baseKey, lengthMm] of [
    ['removed', 100],
    [edge.key, 0],
  ] as const) {
    const result = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
      ...input,
      baseKey,
      resize: { fixed: 'end', lengthMm },
    });
    expect(result.recorded).toBe(false);
    expect(result.session).toBe(session);
  }
});

it('keeps a native clockwise hole at its exact coordinates and refuses clipping it', async () => {
  const { session, projection, selection, draft, edge } = await setup();
  const edit = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
    session,
    projection,
    activeTool: 'edge-length',
    activePieceIndex: 0,
    baseKey: edge.key,
    sequence: 0,
    resize: {
      fixed: 'start',
      lengthMm: 0.8 * Math.hypot(edge.toMm.x - edge.fromMm.x, edge.toMm.y - edge.fromMm.y),
    },
  });
  const command = edit.session.history[0]!.commands[0]!;
  if (command.tool !== 'edge-length') throw Error('The exact edge edit was not recorded.');
  const job = structuredClone(draft.scopes[0]!.writerReplay!.job);
  const piece = job.pieces.find(({ identity }) => identity === command.target.pieceId)!;
  const size = piece.sizes.find(({ sizeToken }) => sizeToken === 'M')!;
  const center = {
    x: size.cut.reduce((sum, point) => sum + point.x, 0) / size.cut.length,
    y: size.cut.reduce((sum, point) => sum + point.y, 0) / size.cut.length,
  };
  const holeAt = ({ x, y }: PtMm) => [
    { x: x - 1, y: y - 1 },
    { x: x - 1, y: y + 1 },
    { x: x + 1, y: y + 1 },
    { x: x + 1, y: y - 1 },
  ];
  const safeHole = holeAt(center);
  const safe = resizeDraftCadSelectedSizeEdgeV1(
    { ...size, cutLoops: [safeHole] },
    command,
    projection,
    selection.phaseD,
  );
  if (!safe.ok) throw Error(safe.detail);
  expect(safe.size.cutLoops).toEqual([safeHole]);
  expect(safe.size.areaMm2).toBe(Math.abs(signedArea(safe.size.cut)) - 4);
  piece.sizes.splice(piece.sizes.indexOf(size), 1, safe.size);
  const output = writeDxfDetailed(job);
  const raw = parseDxf(new TextEncoder().encode(output.dxfText).buffer, 'mm');
  const block = output.manifest.blocks.find(
    ({ identity, sizeToken }) => identity === piece.identity && sizeToken === 'M',
  )!;
  const paths = raw.dxf.blocks[block.block]!.entities.filter(
    ({ layer, type }) => layer === '1' && type === 'POLYLINE',
  );
  expect(paths.map((path) => signedArea(entityToChain(path, 1, 0.001)!.pts))).toContain(-4);

  const nearMovingCorner = {
    x: 0.95 * edge.toMm.x + 0.05 * center.x,
    y: 0.95 * edge.toMm.y + 0.05 * center.y,
  };
  const clipped = resizeDraftCadSelectedSizeEdgeV1(
    { ...size, cutLoops: [holeAt(nearMovingCorner)] },
    command,
    projection,
    selection.phaseD,
  );
  expect(clipped).toEqual({
    ok: false,
    detail: 'The resized outline would cross or touch a retained cut hole.',
  });
});

it('closes a concave Pen outline into its own exact native cut and sewing block', async () => {
  const { session, projection, selection, compileSource, draft } = await setup();
  const pointsMm = [
    { x: 15, y: 30 },
    { x: 115, y: 30 },
    { x: 115, y: 90 },
    { x: 75, y: 68 },
    { x: 15, y: 90 },
  ];
  const input = {
    session,
    projection,
    activePieceIndex: 0,
    activeTool: 'pen',
    sequence: 0,
  } as const;
  let pendingPoints: readonly (typeof pointsMm)[number][] = [];
  for (const pointMm of pointsMm) {
    const point = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
      ...input,
      pendingPoints,
      pointMm,
    });
    expect(point.recorded).toBe(false);
    expect(point.blocker).toBeNull();
    pendingPoints = point.pendingPoints;
  }
  const edit = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
    ...input,
    pendingPoints,
    pointMm: pointsMm[pointsMm.length - 1]!,
    closePen: true,
  });
  expect(edit.recorded).toBe(true);
  expect(edit.pendingPoints).toEqual([]);
  const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
    session: edit.session,
    projection,
    selection,
    compileSource,
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.blockers));
  const { artifact } = compiled;
  expect(artifact.compiledFeatures).toEqual([
    expect.objectContaining({
      tool: 'pen',
      pieceId: 'DRAFTPEN1',
      sizeToken: 'M',
      output: 'piece-create',
    }),
  ]);
  const nativeSpec = artifact.compiledJob.pieces.find(({ identity }) => identity === 'DRAFTPEN1')!;
  expect(nativeSpec.sizes).toEqual([expect.objectContaining({ cut: pointsMm, seam: pointsMm })]);
  expect(artifact.compiledJob.pieces.slice(0, -1)).toEqual(
    draft.scopes[0]!.writerReplay!.job.pieces,
  );
  const written = artifact.manifest.blocks.find(({ identity }) => identity === 'DRAFTPEN1')!;
  const decoded = parseDxf(new TextEncoder().encode(artifact.dxfText).buffer, 'mm');
  const expected = pointsMm.map(({ x, y }) => ({ x: x - pointsMm[0]!.x, y: y - pointsMm[0]!.y }));
  for (const layer of ['1', '14']) {
    const entities = decoded.dxf.blocks[written.block]!.entities.filter(
      (entity) =>
        entity.layer === layer && (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE'),
    );
    expect(entities).toHaveLength(1);
    const contour = entityToChain(entities[0]!, 1, 0.001);
    expect(contour?.closed).toBe(true);
    const points = contour!.pts;
    expect(points.map(({ x, y }) => ({ x: x - points[0]!.x, y: y - points[0]!.y }))).toEqual(
      expected,
    );
  }
});

it('refuses a crossing Pen outline before deterministic DXF export', async () => {
  const { session, projection, selection, compileSource } = await setup();
  const pendingPoints = [
    { x: 0, y: 0 },
    { x: 120, y: 100 },
    { x: 10, y: 100 },
    { x: 80, y: 0 },
  ];
  const edit = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
    session,
    projection,
    activePieceIndex: 0,
    activeTool: 'pen',
    sequence: 0,
    pendingPoints,
    pointMm: pendingPoints[3]!,
    closePen: true,
  });
  expect(edit.recorded).toBe(true);
  expect(
    compilePatternImportDxfPhaseEDraftCadGeometryV1({
      session: edit.session,
      projection,
      selection,
      compileSource,
    }),
  ).toMatchObject({ ok: false, blockers: [{ code: 'pen-geometry-blocked' }] });
});
