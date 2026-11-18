import type {
  AdminService,
  GetTechCardSavedAssemblySnapshotResponse,
  TechCardPatternSemanticSidecar,
} from 'api/proto-http/admin';
import { readPatternImportDxfProductCompositeComponentBytesV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  createDxfProductSavedReprocessOwnerV1,
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { fromWire, toWire } from 'lib/seams/wire';
import { beforeAll, expect, it, vi } from 'vitest';
import { rowFromHand } from '../../assembly-seams/seam-actions';
import { buildPatternImportDxfPhaseEExactAnchorEdgeV1 } from './cad-table-zero-connect-exact-anchor-geometry-v1';
import { bytesOf, semanticDocument } from './composite-placement-read-v1.test-fixture';
import { createPatternImportDxfProductCompositeSidecarProductionTransactionV4 } from './composite-sidecar-production-transaction-v4';
import {
  decodePatternImportDxfProductCompositeSidecarV4,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
} from './composite-sidecar-v4';
import { resolvePatternImportDxfProductExactNSeamProductionMountV2 } from './exact-n-seam-production-mount-v2';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1 } from './saved-assembly-snapshot-production-rpc-v1';
import {
  isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1,
  resolveSavedAssemblyNativeDirectedIntervalsV1,
} from './saved-assembly-native-directed-intervals-v1';
import {
  canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonicalize,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1,
} from './saved-assembly-topology-hash-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelReprocessHostV1,
  digestFullAssemblyFixture,
  type SavedThreePanelFixtureV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import { createSavedNativeSewingAuthoringViewV1 } from './saved-native-sewing-authoring-view-v1';
import {
  createPatternImportDxfPhaseEZeroConnectProductionDurableBridgeV1,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_NATIVE_EXACT_N_CONFIRM_V1,
} from './zero-connect-durable-composite-v4';

const ports = vi.hoisted(() => ({
  GetTechCardSavedAssemblySnapshot: vi.fn<AdminService['GetTechCardSavedAssemblySnapshot']>(),
  GetTechCardPatternSemanticSidecar: vi.fn<AdminService['GetTechCardPatternSemanticSidecar']>(),
  PutTechCardPatternSemanticSidecar: vi.fn<AdminService['PutTechCardPatternSemanticSidecar']>(),
}));
vi.mock('api/api', () => ({
  abortableAdminService: () => ports,
  adminService: ports,
}));

const operationNumber = 10;
const sizeToken = 'M';
const signal = new AbortController().signal;
const serverAssemblyRevision = `asm:v1:${'9'.repeat(32)}:21`;
type WireSeam = ReturnType<typeof toWire>;

async function loadSaved(seed: SavedThreePanelFixtureV1) {
  const host = createSavedThreePanelReprocessHostV1(seed, true);
  const owner = createDxfProductSavedReprocessOwnerV1(host);
  try {
    const replay = await owner.run({
      schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
      row: seed.row,
    });
    if (!replay.ok || !replay.nativeSewingReplay?.replayReady) {
      throw new Error(JSON.stringify(replay.blockers));
    }
    return replay;
  } finally {
    owner.dispose();
    host.dispose();
  }
}

async function nativeAuthoring(seed: SavedThreePanelFixtureV1) {
  const replay = await loadSaved(seed);
  const draft = createSavedNativeSewingAuthoringViewV1(
    replay.draft,
    replay.nativeSewingReplay,
    seed.row.sha256,
  );
  const catalogResult = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
    draft,
    seed.row.scopeKey,
    sizeToken,
  );
  const selection = await selectPatternImportDxfProductDraftPhaseDSizeV1(
    draft,
    seed.row.scopeKey,
    sizeToken,
  );
  if (!catalogResult.ok || !selection.ok) throw new Error('Native authoring fixture was blocked.');
  const { catalog } = catalogResult;
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(catalog, selection.selection);
  if (!projected.ok) throw new Error(JSON.stringify(projected.blockers));

  const edge = (key: string, ordinal: number, reversed: boolean) => {
    const piece = catalog.pieces.find(({ pieceLineKey }) => pieceLineKey === key)!;
    const contour = piece.contours.find(({ role }) => role === 'sewing-boundary')!;
    const from = contour.boundaryVertices[ordinal]!.vertexId;
    const to = contour.boundaryVertices[(ordinal + 1) % contour.boundaryVertices.length]!.vertexId;
    const boundaryVertexIds = [from, to] as const;
    const result = buildPatternImportDxfPhaseEExactAnchorEdgeV1(
      {
        pieceLineKey: key,
        pieceId: piece.pieceId,
        contourId: contour.contourId,
        boundaryVertexIds: reversed ? [to, from] : boundaryVertexIds,
      },
      catalog,
      projected.projection,
    );
    if (!result.ok) throw new Error(result.blocker.detail);
    return { ...result, boundaryVertexIds };
  };
  const writeRow = (
    seamKey: string,
    ordinal: number,
    reversed: boolean,
    secondOrdinal = ordinal,
    pairing: 'same' | 'reversed' = reversed ? 'reversed' : 'same',
  ) => {
    const a = edge('line-FRONT', ordinal, false);
    const b = edge('line-BACK', secondOrdinal, reversed);
    const pieces = [a.piece, b.piece];
    const row = rowFromHand(
      [a.target],
      [b.target],
      new Map(pieces.map((piece) => [piece.pieceKey, piece])),
      { pieces, grainDeg: null, nameOf: (key) => key, size: sizeToken },
      { seamKey, direction: pairing },
    );
    if (!row) throw new Error('Normal seam serializer rejected the native fixture.');
    return { wire: toWire(row), vertexIds: [a.boundaryVertexIds, b.boundaryVertexIds] };
  };
  return { replay, catalog, edge, writeRow };
}

async function completeSourceReply(
  seed: SavedThreePanelFixtureV1,
  ownedSeams: WireSeam[],
  seamKeys?: string[],
  settings?: { ratio?: string; sidecar?: TechCardPatternSemanticSidecar },
) {
  const { revision, ...row } = seed.row;
  const identity = { ...row, savedRowRevision: revision, patternVersion: 2 };
  const downloadable = { ...identity, downloadUrl: '/api/dxf/download' };
  const operations = [
    {
      ...seed.operations[0]!,
      operationNumber,
      seamKeys: seamKeys ?? ownedSeams.map(({ seamKey }) => seamKey!),
      ...(settings?.ratio === undefined
        ? {}
        : { stitching: { fullnessRatio: { value: settings.ratio } } }),
    },
  ];
  const aliases = seed.card.existingAliases;
  const encodedSeams: WireSeam[] = JSON.parse(JSON.stringify(ownedSeams));
  const canonicalJson = canonicalize({
    serverAssemblyRevision,
    rows: [identity],
    operations,
    ownedSeams: encodedSeams,
    aliases,
    garmentLabels: [],
  });
  const sourceSha256 = await digestFullAssemblyFixture(
    new TextEncoder().encode(`tech-card-saved-assembly-complete-source/1\0${canonicalJson}`),
  );
  return {
    row: downloadable,
    serverAssemblyRevision,
    operations,
    ...(settings?.sidecar ? { semanticSidecar: settings.sidecar } : {}),
    completeSourceV1: {
      rows: [downloadable],
      ownedSeams: encodedSeams,
      aliases,
      garmentLabels: [],
      sourceSha256,
      canonicalJson: Buffer.from(canonicalJson).toString('base64'),
    },
  } as unknown as GetTechCardSavedAssemblySnapshotResponse;
}

async function savedSource(
  seed: SavedThreePanelFixtureV1,
  ownedSeams: WireSeam[],
  seamKeys?: string[],
) {
  const reply = await completeSourceReply(seed, ownedSeams, seamKeys);
  const read = vi.fn<AdminService['GetTechCardSavedAssemblySnapshot']>().mockResolvedValue(reply);
  const source = await readCompleteSavedAssemblySourceV1(
    { GetTechCardSavedAssemblySnapshot: read },
    seed.row,
    {},
    signal,
  );
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedCardLockVersion: seed.row.cardLockVersion,
      expectedSavedRowRevision: seed.row.revision,
      expectedSha256: seed.row.sha256,
    }),
  );
  return source;
}

let seed: SavedThreePanelFixtureV1;
let authored: Awaited<ReturnType<typeof nativeAuthoring>>;
let wires: WireSeam[];
let expected: (readonly string[])[][];

beforeAll(async () => {
  seed = await createSavedThreePanelFixtureV1(2);
  authored = await nativeAuthoring(seed);
  const rows = ['upper', 'middle', 'lower'].map((key, index) =>
    authored.writeRow(key, index, index === 1),
  );
  wires = rows.map(({ wire }) => wire);
  expected = rows.map(({ vertexIds }) => vertexIds);
});

async function resolve(
  wire: WireSeam[] = wires,
  overrides: Partial<Parameters<typeof resolveSavedAssemblyNativeDirectedIntervalsV1>[0]> = {},
) {
  return resolveSavedAssemblyNativeDirectedIntervalsV1(
    {
      source: await savedSource(seed, wire),
      expectedRow: seed.row,
      replay: authored.replay,
      operationNumber,
      sizeToken,
      ...overrides,
    },
    signal,
  );
}

it('rehydrates all six directed native intervals from three saved exact wire rows', async () => {
  // Reopen the identical saved DXF to derive a new trusted native replay before reading saved AO.
  const replay = await loadSaved(seed);
  const result = await resolve(wires, {
    replay,
    expectedCatalogCanonicalSha256: authored.catalog.canonicalSha256,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.blocker));
  expect(isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1(result.receipt)).toBe(true);
  expect(
    isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1(structuredClone(result.receipt)),
  ).toBe(false);
  expect(
    result.receipt.orderedSeams.map(({ seamKey, seamDirection, sides }) => ({
      seamKey,
      seamDirection,
      directions: sides.map(({ direction }) => direction),
    })),
  ).toEqual([
    { seamKey: 'upper', seamDirection: 'same', directions: ['forward', 'forward'] },
    { seamKey: 'middle', seamDirection: 'reversed', directions: ['forward', 'reverse'] },
    { seamKey: 'lower', seamDirection: 'same', directions: ['forward', 'forward'] },
  ]);
  expect(
    result.receipt.orderedSeams.map(({ sides }) =>
      sides.map(({ boundaryVertexIds }) => boundaryVertexIds),
    ),
  ).toEqual(expected);
  const wireAnchors = result.receipt.orderedSeams.flatMap(({ sides }) =>
    sides.map(({ canonicalAnchorWire }) => JSON.parse(canonicalAnchorWire)),
  );
  expect(wireAnchors).toEqual(
    wires.flatMap(({ sideA, sideB }) => [sideA!.parts![0], sideB!.parts![0]]),
  );
  const { canonicalSha256, ...unsigned } = result.receipt;
  expect(canonicalSha256).toBe(
    await digestFullAssemblyFixture(
      new TextEncoder().encode(`${unsigned.schemaVersion}\0${canonicalize(unsigned)}`),
    ),
  );
});

it('rejects other row identities, seam ownership and stale catalog at the current geometry', async () => {
  const anotherRow = { ...seed, row: { ...seed.row, patternLineKey: 'another-row' } };
  expect(
    await resolve(wires, {
      source: await savedSource(anotherRow, wires),
      expectedRow: anotherRow.row,
    }),
  ).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-source-stale' },
  });
  expect(
    await resolve(wires, { expectedRow: { ...seed.row, revision: seed.row.revision + 1 } }),
  ).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-source-stale' },
  });
  expect(
    await resolve(wires, {
      source: await savedSource(seed, wires, ['wrong-seam-key', 'middle', 'lower']),
    }),
  ).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-operation-invalid' },
  });
  expect(await resolve(wires, { expectedCatalogCanonicalSha256: 'c'.repeat(64) })).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-catalog-stale' },
  });
  expect(await resolve(wires, { sizeToken: 'L' })).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-catalog-stale' },
  });
});

it('checks current aliases and normalizes omitted proto defaults for the same measured wire', async () => {
  const omitted = structuredClone(wires);
  const anchor = omitted[0]!.sideA!.parts![0]!;
  anchor.rangeFrom = undefined;
  anchor.rangeTo = undefined;
  anchor.notches = undefined;
  anchor.turnDeg = undefined;
  for (const sample of anchor.samples ?? []) {
    if (sample.u === 0) sample.u = undefined;
    if (sample.v === 0) sample.v = undefined;
  }
  expect(await resolve(omitted)).toMatchObject({ ok: true });

  const relinked = structuredClone(seed);
  relinked.card.existingAliases![0]!.blockName = 'another-block';
  expect(await resolve(wires, { source: await savedSource(relinked, wires) })).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-piece-unbound', seamKey: 'upper', sideIndex: 0 },
  });
});

it('refuses publication and revokes earlier receipts when their read generation ends', async () => {
  const controller = new AbortController();
  const input = {
    source: await savedSource(seed, wires),
    expectedRow: seed.row,
    replay: authored.replay,
    operationNumber,
    sizeToken,
  };
  const issued = await resolveSavedAssemblyNativeDirectedIntervalsV1(input, controller.signal);
  if (!issued.ok) throw new Error(JSON.stringify(issued.blocker));
  expect(isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1(issued.receipt)).toBe(true);
  const pending = resolveSavedAssemblyNativeDirectedIntervalsV1(input, controller.signal);
  controller.abort();
  expect(isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1(issued.receipt)).toBe(false);
  expect(await pending).toEqual({
    ok: false,
    blocker: { code: 'saved-interval-cancelled', seamKey: undefined, sideIndex: undefined },
  });
});

it.each(['contourSig', 'sample', 'measured range', 'piece locator'] as const)(
  'refuses a changed %s on the same saved row',
  async (field) => {
    const changed = structuredClone(wires);
    const side = changed[1]!.sideB!.parts![0]!;
    switch (field) {
      case 'contourSig':
        side.contourSig = 'c'.repeat(16);
        break;
      case 'sample':
        side.samples![2]!.u! += 0.001;
        break;
      case 'measured range':
        side.rangeFrom = 0.1;
        side.rangeTo = 0.9;
        break;
      case 'piece locator':
        side.edgeHint = side.edgeHint!.replace('line-BACK', 'line-FRONT');
        break;
    }
    expect(await resolve(changed)).toMatchObject({
      ok: false,
      blocker: {
        code:
          field === 'measured range'
            ? 'saved-interval-seam-unsupported'
            : field === 'piece locator'
              ? 'saved-interval-locator-invalid'
              : 'saved-interval-wire-mismatch',
        seamKey: 'middle',
        sideIndex: 1,
      },
    });
  },
);

it('rejects a positive native edge when both directed fingerprints quantize to the same wire', async () => {
  const short = await createSavedThreePanelFixtureV1(2, { ambiguousShortEdge: true });
  const authoring = await nativeAuthoring(short);
  const front = authoring.catalog.pieces.find(({ pieceLineKey }) => pieceLineKey === 'line-FRONT')!;
  const contour = front.contours.find(({ role }) => role === 'sewing-boundary')!;
  const shortest = contour.boundaryVertices
    .map((_, index) => ({
      index,
      length: authoring.edge('line-FRONT', index, false).piece.edges[0]!.lenMm,
    }))
    .sort((a, b) => a.length - b.length)[0]!;
  expect(shortest.length).toBeGreaterThan(0.05);
  expect(shortest.length).toBeLessThan(1);
  const { wire } = authoring.writeRow('ambiguous', shortest.index, false, 0);
  const result = await resolveSavedAssemblyNativeDirectedIntervalsV1(
    {
      source: await savedSource(short, [wire]),
      expectedRow: short.row,
      replay: authoring.replay,
      operationNumber,
      sizeToken,
    },
    signal,
  );
  expect(result).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-wire-ambiguous', seamKey: 'ambiguous', sideIndex: 0 },
  });
});

it('confirms already-saved exact three-seam AO through the existing V4 CAS and reloads all six spans', async () => {
  const { row } = seed;
  const originalSeams = [
    wires[0]!,
    wires[1]!,
    authored.writeRow('lower', 2, false, 2, 'reversed').wire,
  ];
  let selectedSeams = originalSeams;
  let ratio: string | undefined = '1.00';
  const semantic = bytesOf(semanticDocument(row, 2));
  const verifiedSemanticSha256 = await digestFullAssemblyFixture(semantic);
  let attachment: TechCardPatternSemanticSidecar | undefined = {
    techCardId: row.techCardId,
    patternLineKey: row.patternLineKey,
    cardLockVersion: row.cardLockVersion,
    savedRowRevision: row.revision,
    patternVersion: 2,
    dxfSha256: row.sha256,
    byteLength: semantic.byteLength,
    sidecarBytes: Buffer.from(semantic).toString('base64'),
    sidecarSha256: verifiedSemanticSha256,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
    postSaveReceiptSha256: '3'.repeat(64),
  } as TechCardPatternSemanticSidecar;
  const priorSemantic = attachment;
  ports.GetTechCardSavedAssemblySnapshot.mockImplementation(async (request) => {
    const reply = await completeSourceReply(seed, selectedSeams, undefined, {
      ratio,
      sidecar: attachment,
    });
    if (request.profile === 'TECH_CARD_SAVED_ASSEMBLY_SNAPSHOT_PROFILE_COMPLETE_SOURCE_V1') {
      expect(request.expectedServerAssemblyRevision).toBe(reply.serverAssemblyRevision);
      return reply;
    }
    const operation = reply.operations![0]!;
    const canonical = canonicalize({
      selectedOperationNumber: operationNumber,
      operations: [
        {
          authoringOperationId: null,
          number: operationNumber,
          work: operation.work,
          phaseEKind: 'stitch',
          inputKeys: operation.inputKeys,
          outputUnitKey: operation.outputUnitKey,
          outputUnitName: operation.outputUnitName,
          seamKeys: operation.seamKeys,
        },
      ],
      seams: selectedSeams.map((wire) => {
        const row = fromWire(wire)!;
        const project = (anchor: NonNullable<WireSeam['sideA']>['parts']) =>
          anchor!.map((part) => ({
            pieceLineKey: part.pieceLineKey,
            edgeHint: part.edgeHint,
            range: [part.rangeFrom, part.rangeTo],
            lenMm: part.lenMm,
            contourSig: part.contourSig,
            samples: part.samples!.map(({ u, v }) => [u, v]),
          }));
        return {
          seamKey: row.seamKey,
          confirmed: true,
          stale: false,
          kind: row.kind,
          direction: row.direction,
          source: row.source,
          anchoredSize: row.anchoredSize,
          sideA: project(wire.sideA!.parts),
          sideB: project(wire.sideB!.parts),
        };
      }),
    });
    return {
      ...reply,
      selectedOperationNumber: operationNumber,
      selectedSeams,
      topologyCanonicalJson: Buffer.from(canonical).toString('base64'),
      assemblyTopologySha256: await digestFullAssemblyFixture(
        new TextEncoder().encode(
          `${PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1}\0${canonical}`,
        ),
      ),
    } as unknown as GetTechCardSavedAssemblySnapshotResponse;
  });
  ports.GetTechCardPatternSemanticSidecar.mockImplementation(async () => ({
    semanticSidecar: structuredClone(attachment),
  }));
  ports.PutTechCardPatternSemanticSidecar.mockImplementation(async (request) => {
    expect(request).toMatchObject({
      expectedPreviousSidecarSha256: verifiedSemanticSha256,
      expectedSavedRowRevision: row.revision,
      expectedCardLockVersion: row.cardLockVersion,
      selectedOperationNumber: operationNumber,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
    });
    attachment = {
      ...priorSemantic,
      sidecarSha256: request.sidecarSha256,
      sidecarBytes: request.sidecarBytes,
      byteLength: Buffer.from(request.sidecarBytes!, 'base64').byteLength,
      mediaType: request.mediaType,
    };
    return { semanticSidecar: structuredClone(attachment) };
  });

  const newBridge = () =>
    createPatternImportDxfPhaseEZeroConnectProductionDurableBridgeV1(
      operationNumber,
      createPatternImportDxfProductCompositeSidecarProductionTransactionV4(),
      createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(operationNumber)
        .authorityAdapter,
    );
  const previewSource = await readCompleteSavedAssemblySourceV1(
    ports,
    row,
    { expectedServerAssemblyRevision: serverAssemblyRevision },
    signal,
  );
  const preview = await resolveSavedAssemblyNativeDirectedIntervalsV1(
    {
      source: previewSource,
      expectedRow: row,
      replay: authored.replay,
      operationNumber,
      sizeToken,
    },
    signal,
  );
  if (!preview.ok) throw new Error(JSON.stringify(preview.blocker));
  const request = {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_NATIVE_EXACT_N_CONFIRM_V1,
    row,
    selectedOperationNumber: operationNumber,
    sizeToken,
    replay: authored.replay,
    mapping: 'equal' as const,
    lengthRatio: 1 as const,
    expectedCatalogCanonicalSha256: authored.catalog.canonicalSha256,
    expectedIntervalReceiptSha256: preview.receipt.canonicalSha256,
    verifiedSemanticSha256,
  };
  const bridge = newBridge();
  for (const unavailable of [undefined, '1.00001', '1.35']) {
    ratio = unavailable;
    expect(await bridge.persistSavedNativeExactN(request, signal)).toMatchObject({
      ok: false,
      blocker: { code: 'durable-native-equal-ratio-unavailable' },
    });
  }
  ratio = '1.00';
  attachment = undefined;
  expect(await bridge.persistSavedNativeExactN(request, signal)).toMatchObject({
    ok: false,
    blocker: { code: 'durable-native-semantic-missing' },
  });
  attachment = priorSemantic;
  expect(ports.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();

  const committed = await bridge.persistSavedNativeExactN(request, signal);
  if (!committed.ok) throw new Error(JSON.stringify(committed.blocker));
  expect(ports.PutTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(1);
  const bytes = Uint8Array.from(Buffer.from(attachment.sidecarBytes!, 'base64'));
  const decoded = await decodePatternImportDxfProductCompositeSidecarV4(bytes);
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.blockers));
  expect(
    readPatternImportDxfProductCompositeComponentBytesV3(
      decoded.nestedCompositeV3.owner,
      'semantic-product-v1',
    ),
  ).toEqual(semantic);

  const freshReplay = await loadSaved(seed);
  const restoreRequest = {
    row,
    selectedOperationNumber: operationNumber,
    sizeToken,
    replay: freshReplay,
  };
  const reset = newBridge();
  const restored = await reset.restoreSavedNativeExactN(
    restoreRequest,
    new AbortController().signal,
  );
  if (!restored.ok) throw new Error(JSON.stringify(restored.blocker));
  const mounted = resolvePatternImportDxfProductExactNSeamProductionMountV2(restored.session, 2);
  if (!mounted.ok) throw new Error(JSON.stringify(mounted.blockers));
  expect(
    mounted.model.state.seams.map(({ seamId, sides }) => ({
      id: seamId,
      vertices: sides.map(({ boundaryVertexIds }) => boundaryVertexIds),
      directions: sides.map(({ direction }) => direction),
    })),
  ).toEqual([
    { id: 'upper', vertices: expected[0], directions: ['forward', 'forward'] },
    { id: 'middle', vertices: expected[1], directions: ['forward', 'forward'] },
    { id: 'lower', vertices: expected[2], directions: ['forward', 'reverse'] },
  ]);

  selectedSeams = structuredClone(originalSeams);
  selectedSeams[2]!.direction = 'TECH_CARD_SEAM_DIRECTION_SAME';
  expect(await bridge.persistSavedNativeExactN(request, signal)).toMatchObject({
    ok: false,
    blocker: { code: 'durable-native-confirm-source-moved' },
  });

  selectedSeams = structuredClone(originalSeams);
  selectedSeams[2]!.sideB!.parts![0]!.samples![2]!.u = 0.123;
  expect(await reset.restoreSavedNativeExactN(restoreRequest, signal)).toMatchObject({
    ok: false,
    blocker: { code: 'saved-interval-wire-mismatch' },
  });
  expect(ports.PutTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(1);
});
