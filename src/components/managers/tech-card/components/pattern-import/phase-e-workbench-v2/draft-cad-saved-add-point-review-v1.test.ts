import { expect, it } from 'vitest';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  digestFullAssemblyFixture,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { readProtectedLineSplit } from 'lib/pattern-import/write/read-protected-line-split';
import { readManifest, embedManifest } from 'lib/pattern-import/manifest';
import { DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  createPatternImportDxfPhaseEDraftCadSessionV1,
  recordPatternImportDxfPhaseEDraftCadTransactionV1,
  undoPatternImportDxfPhaseEDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadCommandV1,
} from './draft-cad-session-v1';
import {
  prepareSavedAddPointReviewV1,
  takeSavedAddPointReviewV1,
  claimSavedAddPointReviewFileV1,
  isCurrentSavedAddPointReviewClaimV1,
} from './draft-cad-saved-add-point-review-v1';

async function fixture() {
  const seed = await createSavedThreePanelFixtureV1(2);
  for (const piece of seed.job.pieces) {
    const size = piece.sizes[0]!,
      sx = size.cut.reduce((n, p) => n + p.x, 0) / size.cut.length,
      sy = size.cut.reduce((n, p) => n + p.y, 0) / size.cut.length;
    size.seam = size.cut.map((p) => ({ x: sx + (p.x - sx) * 0.8, y: sy + (p.y - sy) * 0.8 }));
    piece.allowance = { ...piece.allowance, meaning: 'both', allowanceMm: 10 };
  }
  seed.written = writeDxfDetailed(seed.job, { now: () => new Date('2026-11-17T00:00:00.000Z') });
  seed.bytes = new TextEncoder().encode(seed.written.dxfText);
  seed.row = {
    ...seed.row,
    sha256: await digestFullAssemblyFixture(seed.bytes),
    sizeBytes: seed.bytes.byteLength,
  };
  seed.card.existingPatterns![0]!.manifest = seed.written.manifest;
  const source = await createSavedThreePanelSourceV1(seed);
  const n = source.native;
  const draft = structuredClone(n.draft);
  if (n.nativeSewingReplay?.replayReady) {
    draft.dxfProvenance = n.nativeSewingReplay.pipeline;
    draft.dxfPhaseDReplay = n.nativeSewingReplay.replay;
  }
  const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(draft, 'main', 'M'),
    selection = await selectPatternImportDxfProductDraftPhaseDSizeV1(draft, 'main', 'M');
  if (!catalog.ok || !selection.ok) throw Error('fixture selection');
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(
    catalog.catalog,
    selection.selection,
  );
  if (!projected.ok) throw Error('fixture projection');
  const piece = projected.projection.pieces[0]!,
    ring = piece.contours[0]!,
    a = ring.vertices[0]!,
    b = ring.vertices[1]!;
  const session = createPatternImportDxfPhaseEDraftCadSessionV1({
    revision: 43,
    phaseD: {
      sourceFileId: n.sourceFileId,
      sourceSha256: seed.row.sha256,
      selectedGeometrySha256: selection.selection.selection.selectedGeometrySha256,
    },
    catalog: catalog.catalog,
  });
  if (!session.ok) throw Error('fixture Draft');
  const cmd: PatternImportDxfPhaseEDraftCadCommandV1 = {
    commandId: 'add-42',
    tool: 'add-point',
    target: { pieceId: piece.pieceId, pieceLineKey: piece.pieceLineKey },
    payload: {
      entityId: 'split-42',
      contourId: ring.contourId,
      afterVertexId: a.vertexId,
      pointMm: { x: (a.pointMm.x + b.pointMm.x) / 2, y: (a.pointMm.y + b.pointMm.y) / 2 },
      edge: {
        contourId: ring.contourId,
        boundaryVertexIds: [a.vertexId, b.vertexId],
        progress: 0.5,
      },
    },
  };
  const tx = { transactionId: 'tx-42', label: 'Add point', commands: [cmd] };
  const recorded = recordPatternImportDxfPhaseEDraftCadTransactionV1(session.session, tx);
  if (!recorded.ok) throw Error(JSON.stringify(recorded.blocker));
  const current = {
    session: recorded.session,
    row: seed.row,
    card: seed.card,
    generation: 0,
    sizeToken: 'M',
  };
  const request = {
    sourceOwner: n.sourceOwner,
    sourceRequest: {
      schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
      sourceFileId: n.sourceFileId,
      sourceSha256: seed.row.sha256,
      techCardId: seed.row.techCardId,
      scopeKey: 'main',
      patternLineKey: seed.row.patternLineKey,
      cardLockVersion: seed.row.cardLockVersion,
      draft: n.draft,
    },
    savedBytes: seed.bytes.buffer,
    readCurrent: () => current,
  };
  return { current, request, tx, source, initial: session.session };
}

it('seals one selected native interval to the exact Draft session, current saved row and compiled File', async () => {
  const f = await fixture();
  try {
    const owner = await prepareSavedAddPointReviewV1(f.request);
    expect(() => takeSavedAddPointReviewV1({ ...owner })).toThrow();
    const taken = takeSavedAddPointReviewV1(owner);
    expect(await digestFullAssemblyFixture(new Uint8Array(await taken.file.arrayBuffer()))).toBe(
      taken.sha256,
    );
    expect(
      readManifest(await taken.file.text())!.blocks.flatMap((b) =>
        b.protectedLineSplit ? [b.protectedLineSplit.entityId] : [],
      ),
    ).toEqual(['split-42']);
    const copy = new File([await taken.file.arrayBuffer()], taken.file.name);
    await expect(claimSavedAddPointReviewFileV1(copy)).rejects.toThrow('unrecognized');
    const proof = await claimSavedAddPointReviewFileV1(taken.file);
    expect(proof.fileSha256).toBe(taken.sha256);
    expect(isCurrentSavedAddPointReviewClaimV1({ ...proof })).toBe(false);
    expect(isCurrentSavedAddPointReviewClaimV1(proof)).toBe(true);
    f.current.generation++;
    expect(isCurrentSavedAddPointReviewClaimV1(proof)).toBe(false);

    expect(proof.left.path.endPointIndex).toBe(proof.right.path.startPointIndex);
    expect(proof.left.endMm).toEqual(proof.right.startMm);
    expect(proof.left.endVertexId).toBe(proof.right.startVertexId);

    await expect(claimSavedAddPointReviewFileV1(taken.file)).rejects.toThrow();
    expect(() => takeSavedAddPointReviewV1(owner)).toThrow();
  } finally {
    f.source.dispose();
  }
});

it('refuses a replacement history at the same cursor and invalidates the stale review', async () => {
  const f = await fixture();
  try {
    const owner = await prepareSavedAddPointReviewV1(f.request);
    const undone = undoPatternImportDxfPhaseEDraftCadSessionV1(f.current.session);
    if (!undone.ok) throw Error('undo');
    const next = recordPatternImportDxfPhaseEDraftCadTransactionV1(undone.session, {
      ...f.tx,
      transactionId: 'tx-new',
    });
    if (!next.ok) throw Error('record');
    expect(next.session.cursor).toBe(f.current.session.cursor);
    f.current.session = next.session;
    expect(() => takeSavedAddPointReviewV1(owner)).toThrow('changed');
    expect(() => takeSavedAddPointReviewV1(owner)).toThrow('consumed');
  } finally {
    f.source.dispose();
  }
});
it('rejects a cloned or forged session before consuming the saved-row owner', async () => {
  const f = await fixture();
  try {
    const real = f.current.session;
    f.current.session = structuredClone(real);
    await expect(prepareSavedAddPointReviewV1(f.request)).rejects.toThrow('genuine');
    const forged = recordPatternImportDxfPhaseEDraftCadTransactionV1(
      structuredClone(f.initial),
      f.tx,
    );
    if (!forged.ok) throw Error('record');
    f.current.session = forged.session;
    await expect(prepareSavedAddPointReviewV1(f.request)).rejects.toThrow('genuine');
    f.current.session = real;
    await expect(
      prepareSavedAddPointReviewV1({ ...f.request, sourceOwner: { ...f.request.sourceOwner } }),
    ).rejects.toThrow('capability');
    const taken = takeSavedAddPointReviewV1(await prepareSavedAddPointReviewV1(f.request));
    f.current.row = { ...f.current.row, revision: f.current.row.revision + 1 };
    await expect(claimSavedAddPointReviewFileV1(taken.file)).rejects.toThrow('changed');
  } finally {
    f.source.dispose();
  }
});

it('rejects missing or copied occurrence metadata and forged unsplit native bytes', async () => {
  const f = await fixture();
  try {
    const opened = takeSavedAddPointReviewV1(await prepareSavedAddPointReviewV1(f.request));
    const compiled = await opened.file.text(),
      original = new TextDecoder().decode(f.request.savedBytes);
    const manifest = readManifest(compiled)!;
    const block = manifest.blocks.find((b) => b.protectedLineSplit)!,
      expected = structuredClone(block.protectedLineSplit!);
    const read = async (text: string, expectedBlock = block.block) => {
      const bytes = new TextEncoder().encode(text);
      return readProtectedLineSplit(bytes.buffer, 'hostile-read', {
        fileSha256: await digestFullAssemblyFixture(bytes),
        block: expectedBlock,
        record: expected,
      });
    };
    await expect(read(embedManifest(original, manifest))).rejects.toThrow('native directed ring');
    const missing = structuredClone(manifest);
    delete missing.blocks.find((b) => b.block === block.block)!.protectedLineSplit;
    await expect(read(embedManifest(compiled, missing))).rejects.toThrow('manifest occurrence');
    const other = structuredClone(missing),
      foreign = other.blocks.find((b) => b.block !== block.block)!;
    foreign.protectedLineSplit = expected;
    await expect(read(embedManifest(compiled, other))).rejects.toThrow('manifest occurrence');
    await expect(read(embedManifest(compiled, other), foreign.block)).rejects.toThrow(
      'native directed ring',
    );
  } finally {
    f.source.dispose();
  }
});

it('rejects a saved-row change while rediscovering the reviewed native intervals', async () => {
  const f = await fixture();
  try {
    const { file } = takeSavedAddPointReviewV1(await prepareSavedAddPointReviewV1(f.request));
    const pending = claimSavedAddPointReviewFileV1(file);
    f.current.row = { ...f.current.row, cardLockVersion: f.current.row.cardLockVersion + 1 };
    await expect(pending).rejects.toThrow('changed during review');
    await expect(claimSavedAddPointReviewFileV1(file)).rejects.toThrow('previously claimed');
  } finally {
    f.source.dispose();
  }
});

it('rejects an ambiguous current card alias even when the saved row and catalog hashes remain equal', async () => {
  const f = await fixture();
  try {
    const owner = await prepareSavedAddPointReviewV1(f.request);
    const selected = f.tx.commands[0]!.target;
    f.current.card.existingAliases!.push({
      scopeKey: f.current.row.scopeKey,
      blockName: selected.pieceId,
      pieceLineKey: 'other-card-piece',
    });
    expect(() => takeSavedAddPointReviewV1(owner)).toThrow('changed');
  } finally {
    f.source.dispose();
  }
});
