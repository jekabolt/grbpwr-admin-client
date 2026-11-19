import { DirectClient } from '../ordinary-dxf-wizard.test-fixture';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';
import { createDxfProductSavedNativeReprocessOwnerV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { expect, it, vi } from 'vitest';
import { abortableAdminService } from 'api/api';
import { buildAst } from 'lib/pattern-import/adapters/dxf/ast';
import { tokenize } from 'lib/pattern-import/adapters/dxf/tags';
import { readDxf } from 'lib/pattern-import/adapters/dxf/extract';
import { segmentDxf } from 'lib/pattern-import/adapters/dxf/segment';
import { unfold } from 'lib/pattern-import/semantics/fold';
import type { RawEntity } from 'lib/pattern-import/adapters/dxf/ast';
import { readManifest } from 'lib/pattern-import/manifest';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { measurementSurfacePatternPieceLaneOffsetV1 } from 'components/shared/measurement-watertight-surface-v1-stage';
import { buildPatternImportDxfPhaseECadMannequinPatternPieceOverlayV1 as overlay } from './cad-mannequin-pattern-piece-overlay-v1';
import {
  createCadMannequinArrangementDocumentV1 as arrange,
  encodeCadMannequinArrangementDocumentV1 as encode,
  parseCadMannequinArrangementDocumentV1 as parse,
} from './cad-mannequin-arrangement-document-v1';
import { createSavedFullAssemblyCompileSessionV1 } from './saved-full-assembly-compile-session-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  digestFullAssemblyFixture,
  fullAssemblyFixtureWireV1,
  savedThreePanelCompileRequestV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
async function cutQuantityFixture() {
  const f = await createSavedThreePanelFixtureV1(2);
  f.job.pieces[0]!.piecesPerGarment = 2;
  f.card.existingPieces[0]!.piecesPerGarment = 2;
  await storeJob(f);
  return f;
}
async function storeJob(f: Awaited<ReturnType<typeof createSavedThreePanelFixtureV1>>) {
  f.written = writeDxfDetailed(f.job, { now: () => new Date(f.written.manifest.createdAt) });
  f.bytes = new TextEncoder().encode(f.written.dxfText);
  f.row = { ...f.row, sizeBytes: f.bytes.length, sha256: await digestFullAssemblyFixture(f.bytes) };
  f.card.existingPatterns![0]!.manifest = f.written.manifest;
}
it('keeps the cut quantity on native readback but refuses using one authored graph piece as its two panels', async () => {
  const f = await cutQuantityFixture();
  const read = await readDxf(
    { id: 'quantity-source', name: 'quantity.dxf', bytes: f.bytes.buffer },
    { sagittaMm: 0.05, keepFills: true },
  );
  const seg = segmentDxf(read);
  expect(read.meta.groups.filter((g) => g.kind === 'insert' && g.block === 'FRONT_M')).toHaveLength(
    1,
  );
  expect(seg.pieces.find((p) => p.identity === 'FRONT')).toMatchObject({ instances: 2 });
  const source = await createSavedThreePanelSourceV1(f),
    session = createSavedFullAssemblyCompileSessionV1();
  try {
    expect(
      source.native.draft.scopes[0]!.manifest.pieces.find((p) => p.identity === 'FRONT')
        ?.piecesPerGarment,
    ).toBe(2);
    vi.mocked(abortableAdminService).mockImplementation(
      () =>
        ({
          GetTechCardSavedAssemblySnapshot: async (req: { selectedOperationNumber: number }) =>
            fullAssemblyFixtureWireV1(f, req.selectedOperationNumber),
        }) as unknown as ReturnType<typeof abortableAdminService>,
    );
    const request = await savedThreePanelCompileRequestV1(f, source);
    expect(request.intent.pieces.find((p) => p.pieceId === 'FRONT')?.cutCount).toBe(1);
    const compiled = await session.consume(request);
    expect(compiled.compiled).toBe(false);
    expect(compiled.blockers).toContainEqual({
      code: 'invalid-input',
      detail: 'Exact source piece instance/grain differs.',
    });
    expect(compiled.evidence).toBeNull();
  } finally {
    session.dispose();
    source.dispose();
  }
});
it('keeps legacy V6 offsets on their exact single-catalog lanes even if the view reorders them', async () => {
  const f = await cutQuantityFixture(),
    owner = await createSavedThreePanelSourceV1(f);
  try {
    const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
      owner.native.draft,
      'main',
      'M',
    );
    const selected = await selectPatternImportDxfProductDraftPhaseDSizeV1(
      owner.native.draft,
      'main',
      'M',
    );
    if (!selected.ok || !catalog.ok) throw Error('Missing real saved product catalog');
    const projection = projectPatternImportDxfProductPhaseEAssemblyV1(
      catalog.catalog,
      selected.selection,
    );
    if (!projection.ok) throw Error('Missing real saved projection');
    const source = { scopeKey: f.row.scopeKey, label: 'Main', projection: projection.projection };
    const first = overlay({ sources: [source], activeScopeKey: f.row.scopeKey });
    if (!first.ok) throw Error(first.blocker.detail);
    const front = first.overlay.pieces.filter((p) => p.pieceId === 'FRONT');
    expect(front).toHaveLength(1);
    const transform = { offsetM: [0.02, 0.03, 0.04] as const, rotationRad: 0.5 };
    const rows = first.overlay.pieces.map(({ pieceKey, pieceId, pieceLineKey, scopeKey }) => ({
      pieceKey,
      pieceId,
      pieceLineKey,
      scopeKey,
      transform,
    }));
    const bindings = {
      card: { techCardId: f.row.techCardId, cardLockVersion: f.row.cardLockVersion },
      scope: { scopeKey: f.row.scopeKey, patternLineKey: f.row.patternLineKey, sizeToken: 'M' },
      savedRow: { revision: f.row.revision, dxfSha256: f.row.sha256 },
      source: {
        catalogCanonicalSha256: catalog.catalog.canonicalSha256,
        sizeSelectionCanonicalSha256: catalog.catalog.sizeSelectionCanonicalSha256,
      },
      mannequin: {
        baseModelId: 42,
        modelFormRevisionKeyV1: 'fixture-body',
        poseBinding: { canonicalKey: 'fixture-rest' },
      },
    };
    const doc = arrange({ bindings, pieces: rows }),
      restored = parse(encode(doc));
    expect(restored).toEqual(doc);
    expect(() => arrange({ bindings, pieces: [rows[0]!, rows[0]!] })).toThrow('Duplicate pieceKey');
    expect(() =>
      arrange({ bindings, pieces: [rows[0]!, { ...rows[0]!, pieceKey: rows[1]!.pieceKey }] }),
    ).toThrow('Duplicate piece source identity');
    const reversed = { ...source.projection, pieces: [...source.projection.pieces].reverse() };
    const transformsByPieceKey = Object.fromEntries(
      restored.pieces.map((p) => [p.pieceKey, p.transform]),
    );
    const reorder = overlay({
      sources: [{ ...source, projection: reversed }],
      transformsByPieceKey,
    });
    if (!reorder.ok) throw Error(reorder.blocker.detail);
    expect(reorder.overlay.pieces.map((p) => p.pieceId)).toEqual(
      reversed.pieces.map((p) => p.pieceId),
    );
    const after = reorder.overlay.pieces.find((p) => p.pieceKey === front[0]!.pieceKey)!;
    expect(after.transform).toEqual(transform);
    const laneOffset = (p: typeof after) =>
      measurementSurfacePatternPieceLaneOffsetV1({ ...p, bodyRadiusM: 0.4 });
    expect(laneOffset(after)).toEqual(laneOffset(front[0]!));

    const copiedCatalog = projectPatternImportDxfProductPhaseEAssemblyV1(
      { ...catalog.catalog },
      selected.selection,
    );
    if (!copiedCatalog.ok) throw Error(copiedCatalog.blockers[0].detail);
    const withoutPreparedOrder = [
      [{ ...source, projection: structuredClone(reversed) }],
      [{ ...source, projection: { ...reversed, sourceFileId: 'foreign' } }],
      [{ ...source, projection: { ...reversed, pieces: reversed.pieces.map((p) => ({ ...p })) } }],
      [
        {
          ...source,
          projection: {
            ...copiedCatalog.projection,
            pieces: [...copiedCatalog.projection.pieces].reverse(),
          },
        },
      ],
      [
        { ...source, projection: reversed },
        { ...source, scopeKey: 'lining' },
      ],
    ];
    for (const sources of withoutPreparedOrder) {
      const historical = overlay({ sources, transformsByPieceKey });
      if (!historical.ok) throw Error(historical.blocker.detail);
      expect(historical.overlay.pieces[0]?.lane).toBe('left');
      const historicalFront = historical.overlay.pieces.find((p) => p.pieceKey === after.pieceKey)!;
      expect(historicalFront.transform).toEqual(transform);
      expect(laneOffset(historicalFront)).not.toEqual(laneOffset(front[0]!));
    }
  } finally {
    owner.dispose();
  }
});
it.each(['r12', 'r2000'] as const)(
  'retains distinct native handed blocks and identifies the emitted fold role in %s',
  async (dialect) => {
    const f = await createSavedThreePanelFixtureV1(2);
    f.job.dialect = dialect;
    const [left, half] = f.job.pieces;
    left!.identity = 'FRONT_L';
    left!.mods = ['L'];
    left!.displayName = 'FRONT_L';
    left!.pairOf = 'FRONT_R';
    left!.pairHand = 'L';
    half!.halfFold = { evidence: ['confirmed half on fold'] };
    const s = half!.sizes[0]!;
    s.fold = {
      kind: 'fold',
      origin: 'operator',
      confidence: 1,
      ranges: [],
      a: s.cut[0]!,
      b: s.cut[1]!,
    };
    const written = writeDxfDetailed(f.job),
      m = readManifest(written.dxfText)!;
    expect(m.pieces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identity: 'FRONT_L',
          pairHand: 'L',
          pairOf: 'FRONT_R',
          piecesPerGarment: 1,
        }),
        expect.objectContaining({
          identity: 'FRONT_R',
          pairHand: 'R',
          pairOf: 'FRONT_L',
          piecesPerGarment: 1,
        }),
        expect.objectContaining({ identity: 'BACK', halfFold: true, unfoldedFold: false }),
      ]),
    );
    const raw = buildAst(tokenize(written.dxfText).tags),
      inserts = raw.entities.filter((e) => e.type === 'INSERT');
    expect(inserts.map((e) => e.tags.find((t) => t.code === 2)?.value).sort()).toEqual([
      'BACK_M',
      'FRONT_L_M',
      'FRONT_R_M',
    ]);
    const read = await readDxf(
      {
        id: 'pair-fold',
        name: 'pair-fold.dxf',
        bytes: new TextEncoder().encode(written.dxfText).buffer,
      },
      { sagittaMm: 0.05, keepFills: true },
    );
    const back = segmentDxf(read).pieces.find((p) => p.identity === 'BACK')!;
    expect(Object.values(back.roles).filter((r) => r === 'fold')).toHaveLength(1);
    expect(read.meta.groups.filter((g) => g.block === 'BACK_M')).toHaveLength(1);
  },
);

async function savedPairFixture() {
  const f = await createSavedThreePanelFixtureV1(2);
  f.job.pieces.pop();
  const left = f.job.pieces[0]!;
  left.identity = 'FRONT_L';
  left.mods = ['L'];
  left.displayName = 'FRONT_L';
  left.pairOf = 'FRONT_R';
  left.pairHand = 'L';
  for (const [i, identity] of [left.identity, left.pairOf].entries()) {
    f.card.existingPieces[i]!.name = identity;
    f.card.existingAliases![i]!.blockName = identity;
  }
  await storeJob(f);
  return f;
}
it('refuses an ordinary saved pair when semantic identities differ and both native hand labels coincide', async () => {
  const f = await savedPairFixture();
  expect(f.written.manifest.pieces.map((p) => [p.identity, p.displayName])).toEqual([
    ['FRONT_L', 'FRONT_L'],
    ['FRONT_R', 'FRONT_L'],
  ]);
  const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
    resolveCard: async () => ({ card: f.card, cardLockVersion: f.row.cardLockVersion }),
    readAuthoritativeRow: async () => ({ row: f.row, downloadUrl: f.row.url }),
    fetch: async () => new Response(f.bytes.slice()),
    createClient: () => new DirectClient(),
  });
  let cause: unknown;
  const nativeOwner = createDxfProductSavedNativeReprocessOwnerV1({
    ...host,
    reprocess: async (...args) => {
      try {
        return await host.reprocess(...args);
      } catch (e) {
        cause = e;
        throw e;
      }
    },
  });
  try {
    const result = await nativeOwner.run({
      schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
      row: f.row,
    });
    expect(result.ok).toBe(false);
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).message).toEqual('Saved manifest piece FP_L / FRONT_L is ambiguous.');
    expect(result.blockers[0]?.code).toBe('saved-dxf-reprocess-failed');
  } finally {
    nativeOwner.dispose();
    host.dispose();
  }
});

function polylinePoints(entity: RawEntity) {
  if (entity.type === 'POLYLINE')
    return entity.children.map((vertex) => ({
      x: Number(vertex.tags.find((t) => t.code === 10)!.value),
      y: Number(vertex.tags.find((t) => t.code === 20)!.value),
    }));
  expect(entity.type).toBe('LWPOLYLINE');
  const xs = entity.tags.filter((t) => t.code === 10),
    ys = entity.tags.filter((t) => t.code === 20);
  return xs.map((x, i) => ({ x: Number(x.value), y: Number(ys[i]!.value) }));
}
it.each(['r12', 'r2000'] as const)(
  'uses the exact written half axis and keeps the unfolded axis and unrelated lines internal in %s',
  async (dialect) => {
    const f = await createSavedThreePanelFixtureV1(2);
    f.job.dialect = dialect;
    for (const [i, piece] of f.job.pieces.entries()) {
      const size = piece.sizes[0]!;
      const fold = {
        kind: 'fold' as const,
        origin: 'operator' as const,
        confidence: 1,
        ranges: [],
        a: size.cut[0]!,
        b: size.cut[1]!,
      };
      size.fold = fold;
      size.internal.push({
        kind: 'internal',
        origin: 'operator',
        confidence: 1,
        ranges: [],
        pts: [
          { x: fold.a.x + 10, y: 20 },
          { x: fold.a.x + 25, y: 35 },
          { x: fold.a.x + 28, y: 40 },
        ],
        closed: false,
      });
      if (i === 0) piece.halfFold = { evidence: ['confirmed half on fold'] };
      else {
        const full = unfold(size.cut, fold)!;
        expect(full).toBeTruthy();
        size.cut = full.pts;
        size.seam = structuredClone(full.pts);
        piece.unfoldedFold = true;
      }
    }
    const written = writeDxfDetailed(f.job);
    const text = written.dxfText,
      raw = buildAst(tokenize(text).tags),
      manifest = readManifest(text)!;
    const parsed = await readDxf(
      { id: 'fold-roles', name: 'fold-roles.dxf', bytes: new TextEncoder().encode(text).buffer },
      { sagittaMm: 0.05, keepFills: true },
    );
    const seg = segmentDxf(parsed);
    expect(raw.layers.filter((layer) => layer.name === '6')).toHaveLength(1);
    for (const [i, piece] of f.job.pieces.entries()) {
      const block = written.plan.blocks.find((b) => b.identity === piece.identity)!;
      const axis = block.size.fold!;
      const entities = raw.blocks.get(block.name)!.entities;
      const featureLines = entities.filter((e) => e.layer === '6' || e.layer === '8');
      expect(featureLines.map((e) => [e.layer, polylinePoints(e)])).toEqual([
        ['8', block.internal[0]!.pts],
        [
          i === 0 ? '6' : '8',
          [axis.a, { x: (axis.a.x + axis.b.x) / 2, y: (axis.a.y + axis.b.y) / 2 }, axis.b],
        ],
      ]);
      expect(manifest.pieces[i]!.halfFold).toBe(i === 0 ? true : undefined);
      expect(manifest.pieces[i]!.unfoldedFold).toBe(i !== 0);
      const roles = Object.values(seg.pieces.find((p) => p.identity === piece.identity)!.roles);
      expect(roles.filter((r) => r === 'fold')).toHaveLength(i === 0 ? 1 : 0);
      expect(roles.filter((r) => r === 'internal')).toHaveLength(i === 0 ? 1 : 2);
    }
  },
);
it.each(['absent', 'reference', 'unconfirmed'] as const)(
  'preserves existing R2000 bytes for a piece whose confirmed half-fold is %s',
  async (variant) => {
    const f = await createSavedThreePanelFixtureV1(2);
    f.job.dialect = 'r2000';
    if (variant !== 'absent') {
      const piece = f.job.pieces[0]!,
        size = piece.sizes[0]!;
      size.fold = {
        kind: 'fold',
        origin: 'operator',
        confidence: 1,
        ranges: [],
        a: size.cut[0]!,
        b: size.cut[1]!,
      };
      if (variant === 'reference') {
        const full = unfold(size.cut, size.fold)!;
        size.cut = full.pts;
        size.seam = structuredClone(full.pts);
        piece.unfoldedFold = true;
      }
    }
    const written = writeDxfDetailed(f.job, { now: () => new Date(f.written.manifest.createdAt) });
    const raw = buildAst(tokenize(written.dxfText).tags);
    expect(raw.layers.some((l) => l.name === '6')).toBe(false);
    const hash = await digestFullAssemblyFixture(new TextEncoder().encode(written.dxfText));
    // Complete file hashes from the pre-fix writer at f2f8b6d78 with the same pinned clock.
    expect(hash).toBe(
      {
        absent: '9f6feee307f193e8c938bbb83a901abd8843195cbc730279e262afdde152582c',
        reference: '6191c279a41faa81e6080b6393d87c8c8ced969b4084fed16ade7d24e8a716ae',
        unconfirmed: '4ac0d6888f5600eb970d66d87a1168a85fab4ae207ab61554b8be4b1a0cbc478',
      }[variant],
    );
  },
);
