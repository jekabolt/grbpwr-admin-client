import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { parseDxf } from 'lib/nesting/dxf/parse';
import { entityToChain } from 'lib/nesting/dxf/entities';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { applyAffine, signedArea } from 'lib/pattern-import/semantics/geom';
import { offsetContour } from 'lib/pattern-import/semantics/offset';
import { DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import type { CardDraft, PtMm } from 'lib/pattern-import/types';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { expect, it } from 'vitest';

import { createPatternImportDxfPhaseEBoundDraftCadSessionV1 } from './draft-cad-binding-v1';
import {
  buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1,
  buildPatternImportDxfPhaseEDraftCadExactVertexOptionsV1,
  recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1,
  recordPatternImportDxfPhaseEDraftCadCanvasPointV1,
  recordPatternImportDxfPhaseEDraftCadDeletePointV1,
  recordPatternImportDxfPhaseEDraftCadMovePointV1,
} from './draft-cad-canvas-v1';
import { createPatternImportDxfPhaseEDraftCadCompileSourceV1 } from './draft-cad-compile-source-v1';
import {
  prepareSavedDraftPairedAllowanceAuthorityV1,
  readSavedDraftPairedAllowanceAuthorityV1,
} from './draft-cad-paired-allowance-authority-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  digestFullAssemblyFixture,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import { compilePatternImportDxfPhaseEDraftCadGeometryV1 } from './draft-cad-geometry-compile-v1';
import {
  editDraftCadSelectedSizeVertexV1,
  resizeDraftCadSelectedSizeEdgeV1,
  resizeDraftStraightEdgeV1,
} from './draft-cad-edge-length-geometry-v1';
import {
  redoPatternImportDxfPhaseEDraftCadSessionV1,
  undoPatternImportDxfPhaseEDraftCadSessionV1,
} from './draft-cad-session-v1';

async function setup(savedDraft?: CardDraft) {
  const draft =
    savedDraft ?? (await createPatternImportDxfProductSavedRuntimeSeedV1Fixture()).draft;
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

async function savedAllowanceFixture() {
  const seed = await createSavedThreePanelFixtureV1(2);
  const piece = seed.job.pieces.find(({ identity }) => identity === 'FRONT')!;
  const size = piece.sizes[0]!;
  const width = 8;
  const offset = offsetContour(size.cut, -width);
  expect(offset.report.ok).toBe(true);
  size.seam = offset.pts;
  piece.allowance = { ...piece.allowance, meaning: 'both', allowanceMm: width };
  const written = writeDxfDetailed(seed.job, {
    now: () => new Date(seed.written.manifest.createdAt),
  });
  seed.bytes = new TextEncoder().encode(written.dxfText);
  seed.row = {
    ...seed.row,
    sizeBytes: seed.bytes.byteLength,
    sha256: await digestFullAssemblyFixture(seed.bytes),
  };
  seed.card.existingPatterns![0]!.manifest = written.manifest;
  return seed;
}

it.each(['start', 'end'] as const)(
  'roundtrips both authenticated saved native outlines with fixed %s',
  async (fixed) => {
    const seed = await savedAllowanceFixture();
    const source = await createSavedThreePanelSourceV1(seed, true);
    try {
      const { session, projection, selection, compileSource } = await setup(source.native.draft);
      const activePieceIndex = projection.pieces.findIndex(({ pieceId }) => pieceId === 'FRONT');
      const [edge] = buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1(
        session,
        projection,
        activePieceIndex,
      );
      const resized = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
        session,
        projection,
        activeTool: 'edge-length',
        activePieceIndex,
        baseKey: edge!.key,
        sequence: 0,
        resize: { fixed, lengthMm: 90 },
      });
      expect(resized.recorded).toBe(true);
      const current = {
        session: resized.session,
        row: seed.row,
        card: seed.card,
        generation: 0,
        sizeToken: 'M',
      };
      let active = true;
      const prepareInput: Parameters<typeof prepareSavedDraftPairedAllowanceAuthorityV1>[0] = {
        sourceOwner: source.native.sourceOwner,
        sourceRequest: {
          schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
          sourceFileId: source.native.sourceFileId,
          sourceSha256: seed.row.sha256,
          techCardId: seed.row.techCardId,
          scopeKey: seed.row.scopeKey,
          patternLineKey: seed.row.patternLineKey,
          cardLockVersion: seed.row.cardLockVersion,
          draft: source.native.draft,
        },
        savedBytes: seed.bytes.buffer as ArrayBuffer,
        readCurrent: () => (active ? current : null),
        verifyCurrentRow: async () => {},
      };
      const aliases = current.card.existingAliases!;
      await expect(
        prepareSavedDraftPairedAllowanceAuthorityV1({
          ...prepareInput,
          readCurrent: () => ({
            ...current,
            card: {
              ...current.card,
              existingAliases: [...aliases, ...aliases],
            },
          }),
        }),
      ).rejects.toThrow('saved row, piece line, or Draft changed');
      const proof = await prepareSavedDraftPairedAllowanceAuthorityV1(prepareInput);
      expect(readSavedDraftPairedAllowanceAuthorityV1(proof, resized.session)).toMatchObject({
        pieceId: 'FRONT',
        widthMm: 8,
      });
      expect(readSavedDraftPairedAllowanceAuthorityV1({ ...proof }, resized.session)).toBeNull();
      expect(readSavedDraftPairedAllowanceAuthorityV1(proof, session)).toBeNull();
      const compileInput = { session: resized.session, projection, selection, compileSource };
      expect(compilePatternImportDxfPhaseEDraftCadGeometryV1(compileInput)).toMatchObject({
        ok: false,
        blockers: [{ code: 'paired-allowance-authority-required' }],
      });
      expect(
        compilePatternImportDxfPhaseEDraftCadGeometryV1(compileInput, { ...proof }),
      ).toMatchObject({
        ok: false,
        blockers: [{ code: 'source-binding-mismatch' }],
      });
      const changedWidth = structuredClone(compileSource);
      const changedPiece = changedWidth.scopes[0]!.writerReplay!.job.pieces.find(
        ({ identity }) => identity === 'FRONT',
      )!;
      changedPiece.allowance.allowanceMm = 10;
      expect(
        compilePatternImportDxfPhaseEDraftCadGeometryV1(
          {
            ...compileInput,
            compileSource: changedWidth,
          },
          proof,
        ),
      ).toMatchObject({ ok: false, blockers: [{ code: 'edge-length-geometry-blocked' }] });
      const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1(compileInput, proof);
      if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
      const { artifact } = compiled;
      const written = writeDxfDetailed(artifact.compiledJob);
      const block = artifact.manifest.blocks.find(({ identity }) => identity === 'FRONT')!;
      const transform = written.transforms[block.block]!;
      const bytes = new TextEncoder().encode(artifact.dxfText);
      const parsed = parseDxf(bytes.buffer, 'mm');
      const outline = (name: string) =>
        parsed.dxf.blocks[block.block]!.entities.filter(
          ({ layer, type }) => layer === name && (type === 'POLYLINE' || type === 'LWPOLYLINE'),
        ).flatMap((entity) => {
          const line = entityToChain(entity, 1, 0.001);
          return line ? [line.pts] : [];
        });
      const cut = outline('1'),
        seam = outline('14');
      expect(cut).toHaveLength(1);
      expect(seam).toHaveLength(1);
      const expected = resizeDraftStraightEdgeV1(edge!.fromMm, edge!.toMm, fixed, 90)!;
      const [a, b] = expected.map((point) => applyAffine(transform, point));
      const dx = b!.x - a!.x,
        dy = b!.y - a!.y;
      const length = Math.hypot(dx, dy);
      const same = (lhs: PtMm, rhs: PtMm) => Math.hypot(lhs.x - rhs.x, lhs.y - rhs.y) <= 0.000002;
      expect(
        cut[0]!.some((from, i) => {
          const to = cut[0]![(i + 1) % cut[0]!.length]!;
          return (same(from, a!) && same(to, b!)) || (same(from, b!) && same(to, a!));
        }),
      ).toBe(true);
      expect(length).toBeCloseTo(90, 6);
      expect(expected[fixed === 'start' ? 0 : 1]).toBe(
        fixed === 'start' ? edge!.fromMm : edge!.toMm,
      );
      const distances = seam[0]!.map(
        ({ x, y }) => Math.abs(dx * (y - a!.y) - dy * (x - a!.x)) / length,
      );
      expect(distances.filter((distance) => Math.abs(distance - 8) <= 0.001)).toHaveLength(2);
      const row = {
        ...seed.row,
        revision: seed.row.revision + 1,
        cardLockVersion: seed.row.cardLockVersion + 1,
        sizeBytes: bytes.byteLength,
        sha256: await digestFullAssemblyFixture(bytes),
      };
      const card = structuredClone(seed.card);
      card.existingPatterns![0]!.manifest = artifact.manifest;
      const fresh = await createSavedThreePanelSourceV1({ ...seed, bytes, row, card }, true);
      try {
        expect(fresh.native.row).toEqual(row);
        expect(fresh.native.nativeSewingReplay?.replayReady).toBe(true);
        const reopened = fresh.native.draft.scopes[0]!.writerReplay!.job.pieces.find(
          ({ identity }) => identity === 'FRONT',
        )!;
        expect(reopened.allowance.allowanceMm).toBe(8);
      } finally {
        fresh.dispose();
      }
      active = false;
      expect(readSavedDraftPairedAllowanceAuthorityV1(proof, resized.session)).toBeNull();
      expect(compilePatternImportDxfPhaseEDraftCadGeometryV1(compileInput, proof)).toMatchObject({
        ok: false,
        blockers: [{ code: 'source-binding-mismatch' }],
      });
    } finally {
      source.dispose();
    }
  },
);

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

it('moves one verified point in the selected size and writes its exact native coordinate', async () => {
  const { session, projection, selection, compileSource, draft } = await setup();
  const options = buildPatternImportDxfPhaseEDraftCadExactVertexOptionsV1(
    session,
    projection,
    0,
    true,
  );
  const vertex = options[0]!;
  const next = options[1]!;
  const pointMm = {
    x: vertex.pointMm.x + (next.pointMm.x - vertex.pointMm.x) / 5,
    y: vertex.pointMm.y + (next.pointMm.y - vertex.pointMm.y) / 5,
  };
  const input = {
    session,
    projection,
    activePieceIndex: 0,
    sequence: 0,
    vertexKey: vertex.key,
    pointMm,
  };
  for (const invalid of [
    { ...input, vertexKey: 'stale' },
    { ...input, pointMm: vertex.pointMm },
    { ...input, pointMm: { x: Number.NaN, y: pointMm.y } },
  ]) {
    expect(recordPatternImportDxfPhaseEDraftCadMovePointV1(invalid)).toMatchObject({
      recorded: false,
      session,
    });
  }

  const moved = recordPatternImportDxfPhaseEDraftCadMovePointV1(input);
  expect(moved.recorded).toBe(true);
  expect(moved.session.history[0]?.commands[0]).toMatchObject({
    tool: 'move-point',
    target: { pieceId: vertex.anchor.pieceId, pieceLineKey: vertex.anchor.pieceLineKey },
    payload: {
      vertexId: vertex.anchor.vertexId,
      contourId: vertex.anchor.contourId,
      pointMm,
      sizeToken: 'M',
    },
  });
  const undone = undoPatternImportDxfPhaseEDraftCadSessionV1(moved.session);
  if (!undone.ok) throw new Error(undone.blocker.detail);
  expect(undone.session.cursor).toBe(0);
  const redone = redoPatternImportDxfPhaseEDraftCadSessionV1(undone.session);
  if (!redone.ok) throw new Error(redone.blocker.detail);
  const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
    session: redone.session,
    projection,
    selection,
    compileSource,
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.blockers));
  const original = draft.scopes[0]!.writerReplay!.job.pieces;
  const changed = compiled.artifact.compiledJob.pieces;
  const pieceId = vertex.anchor.pieceId;
  expect(changed.filter(({ identity }) => identity !== pieceId)).toEqual(
    original.filter(({ identity }) => identity !== pieceId),
  );
  const before = original.find(({ identity }) => identity === pieceId)!.sizes;
  const after = changed.find(({ identity }) => identity === pieceId)!.sizes;
  expect(after.filter(({ sizeToken }) => sizeToken !== 'M')).toEqual(
    before.filter(({ sizeToken }) => sizeToken !== 'M'),
  );
  expect(after.find(({ sizeToken }) => sizeToken === 'M')!.cut).toEqual(
    before
      .find(({ sizeToken }) => sizeToken === 'M')!
      .cut.map((point) =>
        point.x === vertex.pointMm.x && point.y === vertex.pointMm.y ? pointMm : point,
      ),
  );
  const block = compiled.artifact.manifest.blocks.find(
    ({ identity, sizeToken }) => identity === pieceId && sizeToken === 'M',
  )!;
  const parsed = parseDxf(new TextEncoder().encode(compiled.artifact.dxfText).buffer, 'mm');
  const layout = writeDxfDetailed(compiled.artifact.compiledJob).transforms[block.block]!;
  const writtenPoint = applyAffine(layout, pointMm);
  for (const layer of ['1', '14']) {
    const outline = parsed.dxf.blocks[block.block]!.entities.find(
      (entity) =>
        entity.layer === layer && (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE'),
    );
    expect(outline).toBeDefined();
    expect(
      entityToChain(outline!, 1, 0.001)!.pts.some(
        ({ x, y }) => Math.hypot(x - writtenPoint.x, y - writtenPoint.y) < 0.000001,
      ),
    ).toBe(true);
  }

  const collapsed = recordPatternImportDxfPhaseEDraftCadMovePointV1({
    ...input,
    pointMm: next.pointMm,
  });
  expect(collapsed.recorded).toBe(true);
  const refused = compilePatternImportDxfPhaseEDraftCadGeometryV1({
    session: collapsed.session,
    projection,
    selection,
    compileSource,
  });
  expect(refused).toMatchObject({
    ok: false,
    blockers: [expect.objectContaining({ code: 'move-point-geometry-blocked' })],
  });
});

it('deletes one original outline vertex and joins only its exact native neighbours', async () => {
  const { session, projection, selection, compileSource, draft } = await setup();
  const options = buildPatternImportDxfPhaseEDraftCadExactVertexOptionsV1(
    session,
    projection,
    0,
    true,
  );
  const [point] = options;
  if (!point) throw Error('No selected native outline.');
  const input = { session, projection, sequence: 0, activePieceIndex: 0 };
  expect(
    recordPatternImportDxfPhaseEDraftCadDeletePointV1({ ...input, vertexKey: 'stale' }),
  ).toMatchObject({ session, recorded: false });
  const edit = recordPatternImportDxfPhaseEDraftCadDeletePointV1({
    ...input,
    vertexKey: point.key,
  });
  expect(edit.recorded, edit.blocker ?? '').toBe(true);
  const [command] = edit.session.history[0]!.commands;
  if (command?.tool !== 'delete-point') throw Error('Invalid outline deletion.');
  expect(command.payload).toMatchObject({
    vertexId: point.anchor.vertexId,
    contourId: point.anchor.contourId,
    sizeToken: 'M',
  });

  const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
    session: edit.session,
    projection,
    selection,
    compileSource,
  });
  if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
  const { artifact } = compiled;
  expect(artifact.compiledFeatures).toMatchObject([{ output: 'deleted-vertex' }]);
  const original = draft.scopes[0]!.writerReplay!.job.pieces;
  const output = artifact.compiledJob.pieces;
  const pieceId = point.anchor.pieceId;
  expect(output.filter(({ identity }) => identity !== pieceId)).toEqual(
    original.filter(({ identity }) => identity !== pieceId),
  );
  const source = original
    .find(({ identity }) => identity === pieceId)!
    .sizes.find(({ sizeToken }) => sizeToken === 'M')!;
  const updated = output
    .find(({ identity }) => identity === pieceId)!
    .sizes.find(({ sizeToken }) => sizeToken === 'M')!;
  const expected = source.cut.filter(({ x, y }) => x !== point.pointMm.x || y !== point.pointMm.y);
  expect(updated.cut).toEqual(expected);
  expect(updated.seam).toEqual(expected);
  expect(updated.areaMm2).toBe(Math.abs(signedArea(expected)));

  const block = artifact.manifest.blocks.find(
    ({ identity, sizeToken }) => identity === pieceId && sizeToken === 'M',
  )!;
  const layout = writeDxfDetailed(artifact.compiledJob).transforms[block.block]!;
  const raw = parseDxf(new TextEncoder().encode(artifact.dxfText).buffer, 'mm');
  for (const layer of ['1', '14']) {
    const native = raw.dxf.blocks[block.block]!.entities.find(
      (entity) =>
        entity.layer === layer && (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE'),
    );
    expect(native).toBeDefined();
    expect(entityToChain(native!, 1, 0.001)!.pts).toEqual(
      expected.map((vertex) => applyAffine(layout, vertex)),
    );
  }
  const removedCorner = point.pointMm;
  const cutCenter = {
    x: source.cut.reduce((sum, vertex) => sum + vertex.x, 0) / source.cut.length,
    y: source.cut.reduce((sum, vertex) => sum + vertex.y, 0) / source.cut.length,
  };
  const drill = {
    kind: 'drill',
    origin: 'operator',
    confidence: 1,
    ranges: [],
    at: { x: (3 * removedCorner.x + cutCenter.x) / 4, y: (3 * removedCorner.y + cutCenter.y) / 4 },
  } as const;
  const refused = editDraftCadSelectedSizeVertexV1(
    { ...source, drills: [{ ...drill, ranges: [] }] },
    command,
    projection,
    selection.phaseD,
  );
  expect(refused).toEqual({
    ok: false,
    detail: 'The joined edge would cut through a retained drill or internal line.',
  });
});

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

it('drags one point, cancels pending movement, and requires a separate Delete point confirmation', async () => {
  const [{ chromium }, { createServer }, { mkdtemp, rm }, { tmpdir }, { join }] = await Promise.all(
    [
      import('playwright'),
      import('vite'),
      import('node:fs/promises'),
      import('node:os'),
      import('node:path'),
    ],
  );
  const { session, projection, selection, compileSource } = await setup();
  const [original] = buildPatternImportDxfPhaseEDraftCadExactVertexOptionsV1(
    session,
    projection,
    0,
    true,
  );
  if (!original) throw Error('The selected piece has no exact native corner.');
  const cacheDir = await mkdtemp(join(tmpdir(), 'draft-move-point-'));
  const server = await createServer({
    logLevel: 'error',
    appType: 'custom',
    cacheDir,
    server: { host: '127.0.0.1', port: 0, hmr: false },
    plugins: [
      {
        name: 'isolated-draft-point',
        configureServer(active) {
          active.middlewares.use((req, res, next) => {
            if (req.url !== '/__draft-point') return next();
            res.setHeader('Content-Type', 'text/html');
            res.end(
              '<html><head><link rel="stylesheet" href="/src/global.css"></head><body><main style="height:620px;width:850px" id="root"></main></body></html>',
            );
          });
        },
      },
    ],
  });
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  try {
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw Error('Missing local browser fixture.');
    const origin = `http://127.0.0.1:${address.port}`;
    const page = await browser.newPage();
    await page.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(origin + '/')
        ? route.continue()
        : route.abort(),
    );
    await page.goto(origin + '/__draft-point');
    type Mount = typeof import('./draft-cad-move-point.browser-fixture').mountDraftPoint;
    const fixtureUrl =
      '/src/components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/draft-cad-move-point.browser-fixture.tsx';
    await page.addScriptTag({
      type: 'module',
      content: `import { mountDraftPoint } from '${fixtureUrl}'; window.mountDraftPoint = mountDraftPoint;`,
    });
    type BrowserFixtureWindow = Window & { mountDraftPoint?: Mount };
    await page.waitForFunction(() => Boolean((window as BrowserFixtureWindow).mountDraftPoint));
    const fixture = await page.evaluateHandle(
      (input) => (window as BrowserFixtureWindow).mountDraftPoint!(input),
      { session, projection },
    );
    const point = page.locator('[data-draft-cad-exact-vertex]').first();
    const ink = page.locator('[data-draft-cad-exact-vertex-ink]').first();
    await point.click();
    expect(await page.getByRole('spinbutton', { name: 'X (mm)' }).inputValue()).toBe(
      String(original.pointMm.x),
    );
    await page.getByRole('spinbutton', { name: 'X (mm)' }).press('Escape');
    expect(await page.getByRole('spinbutton').count()).toBe(0);

    const cursor = page.locator('[data-draft-cad-history-cursor]');
    const readHistory = () => fixture.evaluate((mounted) => mounted.read());
    const offset = { x: 29, y: -13 };
    const drag = async () => {
      await point.hover();
      const frame = await point.evaluate((element, offset) => {
        const circle = element as SVGCircleElement;
        const transform = circle.getScreenCTM()!;
        const center = new DOMPoint(
          circle.cx.baseVal.value,
          circle.cy.baseVal.value,
        ).matrixTransform(transform);
        const delta = new DOMPoint(offset.x, offset.y, 0, 0).matrixTransform(transform.inverse());
        return { x: Math.round(center.x), y: Math.round(center.y), dx: delta.x, dy: delta.y };
      }, offset);
      await page.mouse.move(frame.x, frame.y);
      await page.mouse.down();
      await page.mouse.move(frame.x + offset.x, frame.y + offset.y, { steps: 3 });
      await expect
        .poll(async () => Number(await ink.getAttribute('cx')))
        .toBeCloseTo(original.pointMm.x + frame.dx, 6);
      expect(await cursor.getAttribute('data-draft-cad-history-cursor')).toBe('0');
      return frame;
    };

    await drag();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await readHistory()).toHaveLength(0);
    await expect.poll(async () => Number(await ink.getAttribute('cx'))).toBe(original.pointMm.x);

    await drag();
    await point.dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
    await page.mouse.up();
    expect(await readHistory()).toHaveLength(0);
    await expect.poll(async () => Number(await ink.getAttribute('cx'))).toBe(original.pointMm.x);

    const frame = await drag();
    await page.mouse.up();
    await expect.poll(readHistory).toHaveLength(1);
    const [transaction] = await readHistory();
    expect(await cursor.getAttribute('data-draft-cad-history-cursor')).toBe('1');
    const [command] = transaction!.commands;
    if (command?.tool !== 'move-point')
      throw Error('The mounted canvas did not issue the typed move.');
    expect(command.payload.vertexId).toBe(original.anchor.vertexId);
    expect(command.payload.sizeToken).toBe(projection.sizeToken);
    expect(command.payload.pointMm.x).toBeCloseTo(original.pointMm.x + frame.dx, 6);
    expect(command.payload.pointMm.y).toBeCloseTo(original.pointMm.y - frame.dy, 6);
    const compiled = compilePatternImportDxfPhaseEDraftCadGeometryV1({
      session: { ...session, history: [transaction!], cursor: 1 },
      projection,
      selection,
      compileSource,
    });
    if (!compiled.ok) throw Error(JSON.stringify(compiled.blockers));
    expect(compiled.artifact.compiledFeatures).toMatchObject([
      { output: 'moved-vertex', commandId: command.commandId },
    ]);
    await fixture.evaluate((mounted) => mounted.unmount());

    const deletion = await page.evaluateHandle(
      (input) => (window as BrowserFixtureWindow).mountDraftPoint!(input),
      { session, projection, activeTool: 'delete-point' as const },
    );
    await point.click();
    expect(await deletion.evaluate((mounted) => mounted.read())).toHaveLength(0);
    await page.getByRole('button', { name: 'Delete point', exact: true }).click();
    const [removal] = await deletion.evaluate((mounted) => mounted.read());
    expect(removal?.commands).toMatchObject([
      { tool: 'delete-point', payload: { vertexId: original.anchor.vertexId } },
    ]);
    await deletion.evaluate((mounted) => mounted.unmount());
  } finally {
    await browser.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}, 60_000);
