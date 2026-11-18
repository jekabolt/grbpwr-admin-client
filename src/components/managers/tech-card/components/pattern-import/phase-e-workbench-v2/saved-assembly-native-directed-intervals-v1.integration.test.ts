import type {
  AdminService,
  common_TechCard,
  GetTechCardSavedAssemblySnapshotResponse,
  TechCardPatternSemanticSidecar,
} from 'api/proto-http/admin';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
} from 'components/managers/tech-card/components/schema';
import { updateTechCardDocument } from 'components/managers/tech-cards/components/useTechCardQuery';
import { readPatternImportDxfProductCompositeComponentBytesV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { capturePatternImportDxfProductCurrentSavedReplayV1 } from 'lib/cloth/domain/pattern-import-dxf-product-commit-replay-v1';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  createDxfProductSavedReprocessOwnerV1,
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { fromWire, toWire } from 'lib/seams/wire';
import { act, createElement, isValidElement, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, expect, it, vi } from 'vitest';
import { rowFromHand } from '../../assembly-seams/seam-actions';
import { useSeamsStore } from '../../assembly-seams/seams-store';
import {
  buildPatternImportDxfPhaseEAssemblyOrderSourceV1,
  PatternImportDxfPhaseEAssemblyOrderEntryMountV1,
} from '../phase-e-workbench/assembly-order-entry';
import { adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyV1 } from '../phase-e-workbench-existing-assembly-adapter-v1';
import { buildPatternImportDxfPhaseEExactAnchorEdgeV1 } from './cad-table-zero-connect-exact-anchor-geometry-v1';
import { bytesOf, semanticDocument } from './composite-placement-read-v1.test-fixture';
import { createPatternImportDxfProductCompositeSidecarProductionTransactionV4 } from './composite-sidecar-production-transaction-v4';
import { readPatternImportDxfProductExactNSeamRestorePatchV2 } from './composite-sidecar-restore-authority-v4';
import type { PatternImportDxfProductCompositeSidecarTransactionResultV4 } from './composite-sidecar-transaction-v4';
import {
  decodePatternImportDxfProductCompositeSidecarV4,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
} from './composite-sidecar-v4';
import { createPatternImportDxfPhaseEDraftCadCompileSourceV1 } from './draft-cad-compile-source-v1';
import { resolvePatternImportDxfProductExactNSeamProductionMountV2 } from './exact-n-seam-production-mount-v2';
import {
  clearPatternImportDxfProductExactNSeamProductionSessionV2,
  readPatternImportDxfProductExactNSeamProductionSessionV2,
  subscribePatternImportDxfProductExactNSeamProductionSessionV2,
} from './exact-n-seam-production-session-v2';
import {
  clearPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
  publishPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
  readPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
  subscribePatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
  type PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
} from './golden-card-production-v2-snapshot-feed-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_SNAPSHOT_V1,
  type PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
} from './golden-card-reconstruction-v1';
import { buildPatternImportDxfPhaseEStitchVisualV1 } from './stitch-visual-v1';
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
  UpdateTechCard: vi.fn<AdminService['UpdateTechCard']>(),
}));
vi.mock('api/api', () => ({
  abortableAdminService: () => ports,
  adminService: ports,
}));
const ui = vi.hoisted(() => ({
  card: null as common_TechCard | null,
  operations: [] as unknown[],
  sizeNames: new Map([[7, 'Medium']]),
  orderSizeIds: (ids: number[]) => ids,
  renderWorkbench: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock('components/managers/tech-cards/components/useTechCardQuery', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('components/managers/tech-cards/components/useTechCardQuery')
  >()),
  useTechCard: () => ({ data: ui.card }),
}));
vi.mock('components/managers/model/components/use-size-systems', () => ({
  useSizeNames: () => ui.sizeNames,
  useSizeOrdering: () => ui.orderSizeIds,
}));
vi.mock('react-hook-form', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-hook-form')>()),
  useWatch: ({ name }: { name: string }) =>
    name === 'operations'
      ? ui.operations
      : name === 'bomItems'
        ? ui.card?.techCard?.bomItems
        : undefined,
}));
vi.mock('./cad-table-zero-operation-saved-preparation-v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cad-table-zero-operation-saved-preparation-v1')>()),
  preparePatternImportDxfPhaseECadTableZeroOperationSavedV1: ui.prepare,
}));
vi.mock('./use-saved-cloth-physical-host-v1', () => ({
  useSavedClothPhysicalHostV1: () => ({ retry: () => undefined }),
}));
vi.mock('./assembly-order-entry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./assembly-order-entry')>()),
  PatternImportDxfPhaseEMultiseamAssemblyOrderEntryV2: (props: unknown) => {
    ui.renderWorkbench(props);
    return null;
  },
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
  return {
    replay,
    catalog,
    edge,
    writeRow,
    selection: selection.selection,
    projection: projected.projection,
    draft,
  };
}

async function completeSourceReply(
  seed: SavedThreePanelFixtureV1,
  ownedSeams: WireSeam[],
  seamKeys?: string[],
  settings?: {
    ratio?: string;
    sidecar?: TechCardPatternSemanticSidecar;
    threadKey?: string;
    revision?: string;
  },
) {
  const { revision, ...row } = seed.row;
  const identity = { ...row, savedRowRevision: revision, patternVersion: 2 };
  const downloadable = { ...identity, downloadUrl: '/api/dxf/download' };
  const operations = [
    {
      ...seed.operations[0]!,
      operationNumber,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      seamKeys: seamKeys ?? ownedSeams.map(({ seamKey }) => seamKey!),
      ...(settings?.ratio === undefined
        ? {}
        : { stitching: { fullnessRatio: { value: settings.ratio } } }),
      ...(settings?.threadKey ? { bomLineKeys: [settings.threadKey] } : {}),
    },
  ];
  const aliases = seed.card.existingAliases;
  const encodedSeams: WireSeam[] = JSON.parse(JSON.stringify(ownedSeams));
  const canonicalJson = canonicalize({
    serverAssemblyRevision: settings?.revision ?? serverAssemblyRevision,
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
    serverAssemblyRevision: settings?.revision ?? serverAssemblyRevision,
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
  let ratio: string | undefined;
  let currentThreadKey = 'thread-before';
  let currentSeed = seed;
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
    const reply = await completeSourceReply(currentSeed, selectedSeams, undefined, {
      ratio,
      sidecar: attachment,
      threadKey: currentThreadKey,
      ...(currentSeed.row.cardLockVersion === row.cardLockVersion
        ? {}
        : { revision: `asm:v1:${'9'.repeat(32)}:22` }),
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
  const bridge = newBridge();
  const preview = await bridge.prepareSavedNativeExactN(
    {
      row,
      selectedOperationNumber: operationNumber,
      sizeToken,
      replay: authored.replay,
    },
    signal,
  );
  if (!preview.ok) throw new Error(JSON.stringify(preview.blocker));
  const { confirmation: request } = preview;
  expect(request).toMatchObject({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_NATIVE_EXACT_N_CONFIRM_V1,
    mapping: 'equal',
    lengthRatio: 1,
    verifiedSemanticSha256,
  });
  ratio = '1.00';
  expect(await bridge.prepareSavedNativeExactN(request, signal)).toMatchObject({ ok: true });
  for (const unavailable of ['', '1.00001', '1.35']) {
    ratio = unavailable;
    expect(await bridge.persistSavedNativeExactN(request, signal)).toMatchObject({
      ok: false,
      blocker: { code: 'durable-native-equal-ratio-unavailable' },
    });
  }
  ratio = undefined;
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

  selectedSeams = originalSeams;
  attachment = priorSemantic;
  ports.PutTechCardPatternSemanticSidecar.mockClear();
  await verifyNativeWorkbenchMount(originalSeams, (threadKey) => {
    currentThreadKey = threadKey;
    currentSeed = {
      ...seed,
      row: {
        ...seed.row,
        revision: seed.row.revision + 1,
        cardLockVersion: seed.row.cardLockVersion + 1,
      },
    };
    attachment = undefined;
    return currentSeed;
  });
});

function savedExactAction(node: ReactNode): (() => void) | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const action = savedExactAction(child);
      if (action) return action;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return null;
  if (node.props.children === 'Save equal seams') return node.props.onClick ?? null;
  return savedExactAction(node.props.children);
}

function actionText(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(actionText).join(' ');
  if (isValidElement<{ children?: ReactNode }>(node)) return actionText(node.props.children);
  return typeof node === 'string' ? node : '';
}

async function waitForWorkbench(assert: () => void) {
  let failure: unknown;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    try {
      assert();
      return;
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

function feedFromNativeTransaction(
  transaction: Extract<PatternImportDxfProductCompositeSidecarTransactionResultV4, { ok: true }>,
  card: common_TechCard,
): PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1 {
  const patch = readPatternImportDxfProductExactNSeamRestorePatchV2(transaction.owner)!;
  const form = mapTechCardToForm(card);
  const operation = form.operations![0]!;
  const operationRef = patch.bindings.selectedOperation.authoringOperationId;
  const seamKeys = patch.bindings.selectedOperation.seamIds;
  const cardRef = 'fixture:three-native-seams';
  const snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_SNAPSHOT_V1,
    cardRef,
    catalog: authored.catalog,
    connections: patch.seams.map(({ seamId, sides }) => ({
      connectionRef: seamId,
      operationRef,
      mapping: 'equal',
      lengthRatio: 1,
      sides,
    })),
    operations: [
      {
        operationRef,
        assembly: { id: operationRef, stage: 0, order: 0, kind: 'stitch', seamIds: [...seamKeys] },
        card: {
          authoringOperationId: operationRef,
          number: operationNumber,
          work: operation.work!,
          phaseEKind: 'stitch',
          inputKeys: [...operation.inputKeys!],
          outputUnitKey: operation.outputUnitKey ?? '',
          outputUnitName: operation.outputUnitName ?? '',
          seamKeys: [...seamKeys],
        },
        stitch: buildPatternImportDxfPhaseEStitchVisualV1({
          operation,
          bomItems: form.bomItems ?? [],
        }),
      },
    ],
    materials: [],
    bomRefs: [
      {
        lineKey: 'thread-before',
        section: 'TECH_CARD_BOM_SECTION_THREAD',
        kind: 'TECH_CARD_BOM_KIND_TOPSTITCH_THREAD',
        materialAssignmentRef: null,
      },
    ],
    colorways: [],
  };
  expect(snapshot.operations[0]?.stitch?.thread.bomLineKey).toBe('thread-before');
  return {
    techCardId: patch.bindings.row.techCardId,
    cardRef,
    exactOperationProjections: [{ operationNumber, snapshot }],
    authoritativeBaseline: snapshot,
    observedOperationFamilies: ['stitch'],
    tableReconstruction: snapshot,
    postSaveReload: snapshot,
  };
}

async function verifyNativeWorkbenchMount(
  seams: WireSeam[],
  commitThread: (threadLineKey: string) => SavedThreePanelFixtureV1,
) {
  const { row } = seed;
  const response = await completeSourceReply(seed, seams, undefined, {
    threadKey: 'thread-before',
  });
  ui.operations = response.operations ?? [];
  ui.card = {
    id: row.techCardId,
    lockVersion: row.cardLockVersion,
    seams,
    techCard: {
      sizeIds: [7],
      operations: ui.operations,
      pieces: seed.card.existingPieces,
      bomItems: [
        {
          lineKey: 'bom-main',
          name: 'main',
          purpose: 'main',
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
        },
        {
          lineKey: 'thread-before',
          name: 'Thread A',
          section: 'TECH_CARD_BOM_SECTION_THREAD',
          kind: 'TECH_CARD_BOM_KIND_TOPSTITCH_THREAD',
          unit: 'm',
        },
        {
          lineKey: 'thread-after',
          name: 'Thread B',
          section: 'TECH_CARD_BOM_SECTION_THREAD',
          kind: 'TECH_CARD_BOM_KIND_TOPSTITCH_THREAD',
          unit: 'm',
        },
      ],
      patterns: [
        {
          lineKey: row.patternLineKey,
          fabricPurpose: 'main',
          name: 'main',
          filename: 'three.dxf',
          url: row.url,
          sizeBytes: row.sizeBytes,
          sha256: row.sha256,
          version: 2,
          savedRowRevision: row.revision,
        },
      ],
      pieceDxfAliases: {
        items: seed.card.existingAliases!.map(({ blockName, pieceLineKey }) => ({
          fabricPurpose: 'main',
          blockName,
          pieceLineKey,
        })),
      },
    },
  } as unknown as common_TechCard;
  let activeSeed = seed;
  ui.prepare.mockImplementation(async () => {
    const preparation = await nativeAuthoring(activeSeed);
    return {
      ok: true,
      scopeKey: row.scopeKey,
      choices: [{ scopeKey: row.scopeKey, label: 'Main' }],
      catalog: preparation.catalog,
      selection: preparation.selection,
      projection: preparation.projection,
      draftCadCompileSource: createPatternImportDxfPhaseEDraftCadCompileSourceV1(preparation.draft),
      verifiedNativeReplay: preparation.replay,
    };
  });
  const initial = useSeamsStore.getState();
  useSeamsStore.setState({
    cardId: row.techCardId,
    serverVersion: row.cardLockVersion,
    server: seams.map((wire) => fromWire(wire)!),
  });
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  const view = {
    document: { activeElement: null },
    HTMLIFrameElement: class {},
    location: { origin: 'https://saved-full-assembly.invalid' },
    ...listeners,
  };
  vi.stubGlobal('window', view);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const createCpuRoot = () =>
    createRoot({
      nodeType: 1,
      nodeName: 'DIV',
      tagName: 'DIV',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      ownerDocument: { nodeType: 9, defaultView: view, ...listeners },
      ...listeners,
    } as unknown as HTMLElement);
  const subscribe = (listener: () => void) =>
    subscribePatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId, listener);
  const read = () => readPatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId);
  const applicationOwner = createPatternImportDxfProductCompositeSidecarProductionTransactionV4();
  const executions: PatternImportDxfProductCompositeSidecarTransactionResultV4[] = [];
  const application: typeof applicationOwner = {
    ...applicationOwner,
    transaction: {
      ...applicationOwner.transaction,
      execute: async (request, signal) => {
        const result = await applicationOwner.transaction.execute(request, signal);
        executions.push(result);
        return result;
      },
    },
  };
  function Harness() {
    const exactNSession = useSyncExternalStore(subscribe, read, read);
    return createElement(PatternImportDxfPhaseEAssemblyOrderEntryMountV1, {
      techCardId: row.techCardId,
      selectedIndex: 0,
      autoOpen: true,
      exactNSession,
      exactNApplicationOwner: application,
    });
  }
  type Props = Parameters<
    typeof import('./assembly-order-entry').PatternImportDxfPhaseEMultiseamAssemblyOrderEntryV2
  >[0];
  const current = () => ui.renderWorkbench.mock.lastCall?.[0] as Props | undefined;
  const waitForMountedExactN = () =>
    waitForWorkbench(() => {
      const mounted = current();
      expect(mounted?.exactNSession?.current.selectedOperation.seamIds).toEqual([
        'upper',
        'middle',
        'lower',
      ]);
      expect(mounted?.exactNDesktop?.projection.sizeToken).toBe(sizeToken);
      expect(mounted?.savedNativeExactNActions).toBeNull();
      const exact = resolvePatternImportDxfProductExactNSeamProductionMountV2(
        mounted!.exactNSession!,
        0,
      );
      if (!exact.ok) throw new Error(JSON.stringify(exact.blockers));
      expect(
        exact.model.state.seams.map(({ sides }) =>
          sides.map(({ boundaryVertexIds }) => boundaryVertexIds),
        ),
      ).toEqual(expected);
    });
  let root = createCpuRoot();
  clearPatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId);
  try {
    await act(async () => root.render(createElement(Harness)));
    await waitForWorkbench(() => {
      const view = current();
      const actionNode = view?.savedNativeExactNActions;
      expect(
        savedExactAction(actionNode),
        JSON.stringify({
          route: view?.operationRouteBlocker,
          saved: view?.savedBlocker,
          actionText: actionText(actionNode),
          prepared: ui.prepare.mock.calls.length,
        }),
      ).toBeTypeOf('function');
    });
    expect(ports.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    await act(async () => {
      const confirm = savedExactAction(current()?.savedNativeExactNActions)!;
      confirm();
      confirm();
    });
    await waitForMountedExactN();
    expect(ports.PutTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    clearPatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId);
    ui.renderWorkbench.mockClear();
    root = createCpuRoot();
    await act(async () => root.render(createElement(Harness)));
    await waitForMountedExactN();
    expect(ports.PutTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(1);

    const beforeEdit = current()!.exactNSession!;
    const transaction = executions[0];
    if (!transaction?.ok) throw new Error('The mounted save must return a genuine V4 transaction.');
    const beforeCard = ui.card;
    const feed = feedFromNativeTransaction(transaction, beforeCard);
    expect(
      publishPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(transaction, feed),
    ).toBe(true);
    const feedState = () =>
      readPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(row.techCardId);
    expect(feedState()).toMatchObject({ techCardId: row.techCardId });
    const observed = vi.fn(feedState);
    const stop = subscribePatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(
      row.techCardId,
      observed,
    );
    const delayed = Promise.withResolvers<void>();
    const oldPublication = delayed.promise.then(() =>
      publishPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(transaction, feed),
    );
    try {
      const edited = mapTechCardToForm(beforeCard);
      edited.operations![0]!.bomLineKeys = ['thread-after'];
      const body = mapFormToTechCardInsert(edited, beforeCard.techCard);
      const operation = body.operations![0]!;
      expect(body.operations).toHaveLength(1);
      expect(operation.operationNumber).toBe(operationNumber);
      expect(operation.seamKeys).toEqual(['upper', 'middle', 'lower']);
      expect(operation.bomLineKeys).toEqual(['thread-after']);
      const save = () =>
        updateTechCardDocument({
          id: row.techCardId,
          techCard: body,
          expectedLockVersion: row.cardLockVersion,
          snapshotReason: '',
          saveSessionId: undefined,
          guardedPieceRename: undefined,
        });
      ports.UpdateTechCard.mockRejectedValueOnce(
        Object.assign(new Error('Stale edit.'), { status: 409 }),
      );
      await expect(save()).rejects.toMatchObject({ status: 409 });
      expect(feedState()).not.toBeNull();
      expect(observed).not.toHaveBeenCalled();
      expect(read()).toBe(beforeEdit);

      ports.UpdateTechCard.mockImplementationOnce(async (request) => {
        expect(request.techCard!.operations).toEqual([operation]);
        activeSeed = commitThread(operation.bomLineKeys![0]!);
        return { lockVersion: activeSeed.row.cardLockVersion };
      });
      await act(async () => {
        await save();
        // The query cache still holds the previous DTO until the ordinary readback arrives.
        expect(ui.card).toBe(beforeCard);
        expect(read()).toBeNull();
        expect(feedState()).toBeNull();
        delayed.resolve();
        expect(await oldPublication).toBe(false);
      });
      expect(observed).toHaveBeenCalledTimes(1);
      expect(observed.mock.results[0]?.value).toBeNull();
      const reads = ports.GetTechCardPatternSemanticSidecar.mock.calls.length;
      expect(await application.confirmRestoredSelection(beforeEdit, feed, signal)).toMatchObject({
        ok: false,
        blocker: { code: 'exact-n-document-retired' },
      });
      expect(ports.GetTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(reads);

      ui.card = {
        ...beforeCard,
        lockVersion: activeSeed.row.cardLockVersion,
        techCard: {
          ...beforeCard.techCard!,
          operations: [operation],
          patterns: beforeCard.techCard!.patterns!.map((pattern) => ({
            ...pattern,
            savedRowRevision: activeSeed.row.revision,
          })),
        },
      };
      ui.operations = mapTechCardToForm(ui.card).operations ?? [];
      expect(activeSeed.row).toEqual({
        ...row,
        cardLockVersion: row.cardLockVersion + 1,
        revision: row.revision + 1,
      });
      const freshSource = await readCompleteSavedAssemblySourceV1(
        ports,
        activeSeed.row,
        { expectedServerAssemblyRevision: `asm:v1:${'9'.repeat(32)}:22` },
        signal,
      );
      expect(freshSource.operations).toMatchObject([
        {
          operationNumber,
          seamKeys: ['upper', 'middle', 'lower'],
          bomLineKeys: ['thread-after'],
        },
      ]);
      expect(freshSource.ownedSeams.map(({ seamKey }) => seamKey)).toEqual([
        'upper',
        'middle',
        'lower',
      ]);
      expect(freshSource.priorCarrier).toBeNull();
      const freshReplay = await loadSaved(activeSeed);
      expect(capturePatternImportDxfProductCurrentSavedReplayV1(freshReplay, 7)).toMatchObject({
        savedRowRevision: activeSeed.row.revision,
        evidence: {
          techCardId: row.techCardId,
          patternLineKey: row.patternLineKey,
          previousLockVersion: activeSeed.row.cardLockVersion,
          productExportSha256: row.sha256,
        },
      });
      const v1Source = buildPatternImportDxfPhaseEAssemblyOrderSourceV1(
        freshSource.operations,
        freshSource.ownedSeams.map((wire) => fromWire(wire)!),
        0,
      );
      expect(v1Source?.selectedSeamKey).toBe('');
      expect(
        adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyV1(
          v1Source!.assembly,
          operationNumber,
          'upper',
        ),
      ).toMatchObject({
        ok: false,
        blockers: [{ code: 'selected-operation-seam-unsupported' }],
      });
      await act(async () => root.render(createElement(Harness)));
      await waitForWorkbench(() => {
        const view = current();
        expect(view?.exactNSession).toBeNull();
        expect(view?.stitchVisual?.thread.bomLineKey).toBe('thread-after');
        expect(actionText(view?.savedNativeExactNActions)).toContain('Attach verified semantic V1');
        expect(savedExactAction(view?.savedNativeExactNActions)).toBeNull();
      });
      expect(feedState()).toBeNull();
      expect(ports.PutTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(1);
    } finally {
      delayed.resolve();
      await oldPublication;
      stop();
      clearPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(row.techCardId);
    }
  } finally {
    await act(async () => root.unmount());
    clearPatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId);
    useSeamsStore.setState(initial);
    vi.unstubAllGlobals();
  }
}
