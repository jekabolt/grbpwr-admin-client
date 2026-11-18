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
import {
  buildPatternImportDxfProductPhaseEAssemblyChoicesV1,
  createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1,
  projectPatternImportDxfProductPhaseEAssemblyV1,
  proposePatternImportDxfProductPhaseEAssemblyV1,
  type PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
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
import { DirectClient } from '../ordinary-dxf-wizard.test-fixture';
import { derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1 } from './cad-table-connect-edge-segments-v1';
import { finalizePatternImportDxfPhaseEExistingLinkedN1V1 } from './cad-table-existing-linked-n1-finalize-v1';
import type {
  PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1,
  PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1,
} from './cad-table-zero-connect-authoring-handoff-v1';
import {
  createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
  selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1,
  startPatternImportDxfPhaseECadTableZeroConnectControllerV1,
} from './cad-table-zero-connect-controller-v1';
import {
  capturePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
  preparePatternImportDxfPhaseEZeroConnectExistingLinkedN1RebindV1,
  resolvePatternImportDxfPhaseELinkedN1MetadataResumeDirectionV1,
  revalidatePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
  verifyPatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackV1,
} from './cad-table-zero-connect-existing-linked-operation-rebind-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_OWNER_V1,
  refreshPatternImportDxfPhaseEZeroConnectSeamLinkAuthorityV1,
} from './cad-table-zero-connect-post-save-owner-v1';
import { capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1 } from './cad-table-zero-operation-authority-rebind-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';
import {
  createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1,
  PatternImportDxfPhaseECadTableZeroOperationProductionMountV1,
} from './cad-table-zero-operation-production-mount-v1';
import { createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1 } from './zero-operation-saved-card-authority-v1';
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
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1,
} from './zero-connect-durable-composite-v4';

const ports = vi.hoisted(() => ({
  GetTechCard: vi.fn<AdminService['GetTechCard']>(),
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
  sizeNames: new Map([[7, 'M']]),
  orderSizeIds: (ids: number[]) => ids,
  renderWorkbench: vi.fn(),
  renderNativeN1: vi.fn(),
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

vi.mock('./cad-table-zero-operation-production-mount-v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cad-table-zero-operation-production-mount-v1')>()),
  PatternImportDxfPhaseECadTableZeroOperationProductionMountV1: (props: unknown) => {
    ui.renderNativeN1(props);
    return null;
  },
}));
vi.mock('./saved-dxf-reprocess-host-v1', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./saved-dxf-reprocess-host-v1')>();
  return {
    ...actual,
    createPatternImportDxfPhaseESavedDxfReprocessHostV1: (
      deps: Parameters<typeof actual.createPatternImportDxfPhaseESavedDxfReprocessHostV1>[0],
    ) =>
      actual.createPatternImportDxfPhaseESavedDxfReprocessHostV1({
        ...deps,
        createClient: deps.createClient ?? (() => new DirectClient()),
      }),
  };
});

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

async function selectedTopologyReply(
  reply: GetTechCardSavedAssemblySnapshotResponse,
  selectedSeams: WireSeam[],
) {
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

it('refuses casting a real saved native partial seam into whole-edge semantic choices', async () => {
  const a = authored.edge('line-FRONT', 0, false);
  const b = authored.edge('line-BACK', 0, true);
  const runLengthMm = b.piece.edges[0]!.lenMm;
  const declaredRange = [0.175, 0.68] as const;
  const pieces = [a.piece, b.piece];
  const partial = rowFromHand(
    [{ target: a.target }],
    [{ target: b.target, range: [declaredRange[0] * runLengthMm, declaredRange[1] * runLengthMm] }],
    new Map(pieces.map((piece) => [piece.pieceKey, piece])),
    { pieces, grainDeg: null, nameOf: (key) => key, size: sizeToken },
    { seamKey: 'contained', direction: 'reversed' },
  );
  if (!partial) throw new Error('The ordinary AO writer refused the contained interval.');
  const wire = toWire(partial);
  expect(wire).toMatchObject({
    kind: 'TECH_CARD_SEAM_KIND_PARTIAL',
    direction: 'TECH_CARD_SEAM_DIRECTION_REVERSED',
    anchoredSize: sizeToken,
    sideA: { parts: [{ edgeHint: a.target, rangeFrom: 0, rangeTo: 0 }] },
    sideB: {
      parts: [{ edgeHint: b.target, rangeFrom: declaredRange[0], rangeTo: declaredRange[1] }],
    },
  });
  const current = await savedSource(seed, [wire]);
  const source = buildPatternImportDxfPhaseEAssemblyOrderSourceV1(
    current.operations,
    [fromWire(wire)!],
    0,
  );
  if (!source) throw new Error('The ordinary Assembly Order cannot select the partial seam.');
  const adapted = adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyV1(
    source.assembly,
    source.selectedOperationNumber,
    source.selectedSeamKey,
  );
  if (!adapted.ok) throw new Error(JSON.stringify(adapted.blockers));
  const proposed = proposePatternImportDxfProductPhaseEAssemblyV1(
    authored.catalog,
    adapted.existingAssembly,
  );
  if (!proposed.ok) throw new Error(JSON.stringify(proposed.blockers));
  const { proposal } = proposed;
  expect(proposal.sides[1].evidence.range).toEqual(declaredRange);
  // Even fully confirmed whole endpoint choices cannot authorize erasing the saved sub-range.
  const wholeChoice = (index: 0 | 1, boundaryVertexIds: readonly [string, string]) => {
    const { pieceId } = proposal.sides[index];
    const contourId = authored.catalog.pieces
      .find((piece) => piece.pieceId === pieceId)!
      .contours.find((contour) => contour.role === 'sewing-boundary')!.contourId;
    return {
      pieceId,
      contourId,
      startBoundaryVertexId: boundaryVertexIds[0],
      endBoundaryVertexId: boundaryVertexIds[1],
      direction: index === 0 ? ('forward' as const) : ('reverse' as const),
      confirmed: true,
    };
  };
  const sides = [wholeChoice(0, a.boundaryVertexIds), wholeChoice(1, b.boundaryVertexIds)] as const;
  const material = { id: 'diagnostic', label: 'Diagnostic', materialRevision: '1' };
  const state: PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1 = {
    ...createPatternImportDxfProductPhaseEAssemblyWorkbenchStateV1(
      authored.catalog,
      proposal,
      { documentId: 'current-native-pattern', revision: 'current-saved-row' },
      1,
    ),
    documentRevisionConfirmed: true,
    physicalSurface: { mode: 'sewing-surface', seamAllowancePhysical: false },
    physicalSurfaceConfirmed: true,
    operationStage: 0,
    operationConfirmed: true,
    sides,
    materialSelections: [
      { pieceId: sides[0].pieceId, optionId: material.id, confirmed: true },
      { pieceId: sides[1].pieceId, optionId: material.id, confirmed: true },
    ],
    tolerance: { endpointMm: 1, fullLengthMm: 1, fullLengthRelative: 0, confirmed: true },
  };
  expect(
    buildPatternImportDxfProductPhaseEAssemblyChoicesV1(authored.catalog, proposal, state, [
      material,
    ]),
  ).toMatchObject({
    ok: false,
    choices: null,
    blockers: [{ code: 'native-contained-range-not-supported' }],
  });
});

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
    return selectedTopologyReply(reply, selectedSeams);
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

function cardForSavedNativeFixture(
  seed: SavedThreePanelFixtureV1,
  seams: WireSeam[],
  operations: NonNullable<GetTechCardSavedAssemblySnapshotResponse['operations']>,
): common_TechCard {
  const { row } = seed;
  return {
    id: row.techCardId,
    lockVersion: row.cardLockVersion,
    seams,
    techCard: {
      sizeIds: [7],
      operations,
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
          downloadUrl: row.url,
          sizeId: 7,
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
}

function installWorkbenchCpuRoot() {
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  const view = {
    document: { activeElement: null },
    HTMLIFrameElement: class {},
    location: { origin: 'https://saved-full-assembly.invalid' },
    ...listeners,
  };
  vi.stubGlobal('window', view);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  return () =>
    createRoot({
      nodeType: 1,
      nodeName: 'DIV',
      tagName: 'DIV',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      ownerDocument: { nodeType: 9, defaultView: view, ...listeners },
      ...listeners,
    } as unknown as HTMLElement);
}

async function verifyNativeWorkbenchMount(
  seams: WireSeam[],
  commitThread: (threadLineKey: string) => SavedThreePanelFixtureV1,
) {
  const { row } = seed;
  const response = await completeSourceReply(seed, seams, undefined, {
    threadKey: 'thread-before',
  });
  ui.card = cardForSavedNativeFixture(seed, seams, response.operations ?? []);
  ui.operations = ui.card.techCard!.operations!;
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
  const createCpuRoot = installWorkbenchCpuRoot();
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

it('rebinds one already-saved native seam after an ordinary thread edit and reloads the fresh V4', async () => {
  const n1Seed = await createSavedThreePanelFixtureV1(2, {
    techCardId: 157,
    patternLineKey: '01M6ERWDX90SM4KQB2QZGAFYAX',
  });
  const { row } = n1Seed;
  const seamKey = 'native-n1';
  const native = await nativeAuthoring(n1Seed);
  const { wire, vertexIds } = native.writeRow(seamKey, 0, false);
  const seams = [wire];
  const original = await completeSourceReply(n1Seed, seams, undefined, {
    threadKey: 'thread-before',
  });
  let card = cardForSavedNativeFixture(n1Seed, seams, original.operations!);
  let currentSeed = n1Seed;
  let currentRevision = serverAssemblyRevision;
  let threadKey = 'thread-before';
  let stored: TechCardPatternSemanticSidecar | undefined;
  const readStored = () => stored;
  let sidecarReadOverride: TechCardPatternSemanticSidecar | undefined;
  let guardedSnapshotReads = 0;
  const puts = ports.PutTechCardPatternSemanticSidecar;
  ports.UpdateTechCard.mockReset();
  puts.mockReset();
  ports.GetTechCard.mockImplementation(async () => ({
    techCard: structuredClone(card),
    patternViewerToken: '',
  }));
  ports.GetTechCardSavedAssemblySnapshot.mockImplementation(async (request) => {
    const current = currentSeed.row;
    expect(request).toMatchObject({
      techCardId: current.techCardId,
      patternLineKey: current.patternLineKey,
      expectedCardLockVersion: current.cardLockVersion,
      expectedSavedRowRevision: current.revision,
      expectedSha256: current.sha256,
    });
    guardedSnapshotReads += 1;
    const reply = await completeSourceReply(currentSeed, seams, undefined, {
      threadKey,
      revision: currentRevision,
      sidecar: stored,
    });
    return request.profile === 'TECH_CARD_SAVED_ASSEMBLY_SNAPSHOT_PROFILE_COMPLETE_SOURCE_V1'
      ? reply
      : selectedTopologyReply(reply, seams);
  });
  ports.GetTechCardPatternSemanticSidecar.mockImplementation(async () => ({
    semanticSidecar: structuredClone(sidecarReadOverride ?? stored),
  }));
  const capturedV1: TechCardPatternSemanticSidecar[] = [];
  puts.mockImplementation(async (request) => {
    const current = currentSeed.row;
    expect(request).toMatchObject({
      techCardId: current.techCardId,
      patternLineKey: current.patternLineKey,
      expectedCardLockVersion: current.cardLockVersion,
      expectedSavedRowRevision: current.revision,
      expectedPatternVersion: 2,
      expectedDxfSha256: current.sha256,
      expectedPreviousSidecarSha256: stored?.sidecarSha256 ?? '',
    });
    const bytes = Uint8Array.from(Buffer.from(request.sidecarBytes!, 'base64'));
    expect(await digestFullAssemblyFixture(bytes)).toBe(request.sidecarSha256);
    const saved: TechCardPatternSemanticSidecar = {
      techCardId: request.techCardId,
      patternLineKey: request.patternLineKey,
      cardLockVersion: request.expectedCardLockVersion,
      savedRowRevision: request.expectedSavedRowRevision,
      patternVersion: request.expectedPatternVersion,
      dxfSha256: request.expectedDxfSha256,
      postSaveReceiptSha256: request.expectedPostSaveReceiptSha256,
      mediaType: request.mediaType,
      byteLength: bytes.byteLength,
      sidecarBytes: request.sidecarBytes,
      sidecarSha256: request.sidecarSha256,
      createdAt: undefined,
      createdBy: undefined,
    };
    stored = saved;
    if (request.mediaType === PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1) {
      expect(request.expectedPreviousSidecarSha256).toBe('');
      capturedV1.push(saved);
    } else {
      expect(request).toMatchObject({
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
        expectedPreviousSidecarSha256: capturedV1.at(-1)!.sidecarSha256,
        selectedOperationNumber: operationNumber,
        expectedServerAssemblyRevision: currentRevision,
      });
      const envelope = await decodePatternImportDxfProductCompositeSidecarV4(bytes);
      if (!envelope.ok) throw new Error(JSON.stringify(envelope.blockers));
      expect(
        readPatternImportDxfProductCompositeComponentBytesV3(
          envelope.nestedCompositeV3.owner,
          'semantic-product-v1',
        ),
      ).toEqual(Uint8Array.from(Buffer.from(capturedV1.at(-1)!.sidecarBytes!, 'base64')));
    }
    return { semanticSidecar: structuredClone(stored) };
  });

  const { preparePatternImportDxfPhaseECadTableZeroOperationSavedV1: prepare } =
    await vi.importActual<typeof import('./cad-table-zero-operation-saved-preparation-v1')>(
      './cad-table-zero-operation-saved-preparation-v1',
    );
  ui.prepare.mockImplementation(prepare);
  const priorSeamState = useSeamsStore.getState();
  const displayCurrentCard = () => {
    ui.card = structuredClone(card);
    ui.operations = mapTechCardToForm(ui.card).operations ?? [];
    useSeamsStore.setState({
      cardId: row.techCardId,
      serverVersion: card.lockVersion,
      server: seams.map((seam) => fromWire(seam)!),
    });
  };
  displayCurrentCard();
  const rootFactory = installWorkbenchCpuRoot();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      expect(String(url)).toBe(row.url);
      return new Response(Uint8Array.from(n1Seed.bytes), { status: 200 });
    }),
  );
  const settings = {
    orderSizeIds: ui.orderSizeIds,
    sizeNameById: ui.sizeNames,
  };
  const nativeSurface = 'explicit-native-drawn-sewing';
  const authority = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1(settings);
  const generation = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
  const application = createPatternImportDxfProductCompositeSidecarProductionTransactionV4();
  const bridge = createPatternImportDxfPhaseEZeroConnectProductionDurableBridgeV1(
    operationNumber,
    application,
    createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(operationNumber)
      .authorityAdapter,
  );
  const currentInputs = () => {
    const seamState = useSeamsStore.getState();
    return {
      techCardId: row.techCardId,
      selectedIndex: 0,
      liveOperations: ui.operations as NonNullable<
        ReturnType<typeof mapTechCardToForm>['operations']
      >,
      savedCard: ui.card,
      currentRows: seamState.server,
      seamWriterCardId: seamState.cardId ?? undefined,
      seamWriterLockVersion: seamState.serverVersion,
    };
  };
  let requested: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1 | undefined;
  const handoff: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1 = {
    status: 'available',
    ingest(request) {
      requested = request;
      return {
        ok: true,
        inserted: 0,
        historyKey: 'mounted-existing-n1',
        sessionRevision: request.session.revision,
        blocker: null,
      };
    },
  };
  const subscribe = (listener: () => void) =>
    subscribePatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId, listener);
  const readSession = () =>
    readPatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId);
  function Harness() {
    const exactNSession = useSyncExternalStore(subscribe, readSession, readSession);
    return createElement(PatternImportDxfPhaseEAssemblyOrderEntryMountV1, {
      techCardId: row.techCardId,
      selectedIndex: 0,
      autoOpen: true,
      exactNSession,
      exactNApplicationOwner: application,
      zeroConnectAuthoringHandoff: handoff,
    });
  }
  const waitForUnboundMount = () =>
    waitForWorkbench(() => {
      expect(ui.renderNativeN1.mock.lastCall?.[0]).toMatchObject({
        techCardId: row.techCardId,
        sourceSurface: nativeSurface,
        selection: { operationNumber },
        zeroConnectAuthoringHandoff: handoff,
      });
      expect(readSession()).toBeNull();
    });
  async function pickNativeEdges(key: string) {
    const start = () =>
      prepare(
        {
          ...settings,
          techCard: ui.card,
          scopeKey: row.scopeKey,
          sizeToken,
          sourceSurface: nativeSurface,
          authority,
          generation: generation.beginSaved(key),
        },
        signal,
      );
    let prepared!: Awaited<ReturnType<typeof start>>;
    await act(async () => {
      prepared = await start();
    });
    if (!prepared.ok) throw new Error(JSON.stringify(prepared.blocker));
    const authoringAuthorityRefresh =
      createPatternImportDxfPhaseECadTableZeroOperationAuthoringRefreshV1({
        ...settings,
        prepared,
        expectation:
          capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(prepared),
        savedAuthority: authority,
        preparationKey: key,
        sourceSurface: nativeSurface,
        prepareSaved: prepare,
      });
    expect(authoringAuthorityRefresh).not.toBeNull();
    const binding = {
      catalog: prepared.catalog,
      projection: prepared.projection,
      authoringAuthority: prepared.authoringAuthority,
      authoringAuthorityRefresh,
    };
    const segments = derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1(prepared.projection);
    let controller = startPatternImportDxfPhaseECadTableZeroConnectControllerV1(
      createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1(),
      binding,
    );
    requested = undefined;
    const mounted = ui.renderNativeN1.mock.lastCall?.[0] as Parameters<
      typeof PatternImportDxfPhaseECadTableZeroOperationProductionMountV1
    >[0];
    for (const [index, piece] of ['line-FRONT', 'line-BACK'].entries()) {
      const segment = segments.find(
        ({ contourRole, pieceLineKey, boundaryVertexIds }) =>
          contourRole === 'sewing-boundary' &&
          pieceLineKey === piece &&
          boundaryVertexIds[0] === vertexIds[index]![0] &&
          boundaryVertexIds[1] === vertexIds[index]![1],
      );
      if (!segment) throw new Error('The exact saved native interval no longer exists.');
      controller = selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
        controller,
        binding,
        segment,
        'forward',
        mounted.zeroConnectAuthoringHandoff,
      );
    }
    expect(controller.handoffResult, JSON.stringify(controller)).toMatchObject({ ok: true });
    if (!requested) throw new Error('The mounted Workbench did not hand off the exact gesture.');
    return requested as PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1;
  }
  const geometryContext = { nameOf: (pieceLineKey: string) => pieceLineKey, grainDeg: null };
  async function confirmCurrentSeam(
    request: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1,
  ) {
    const captured = capturePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1({
      ...currentInputs(),
      request,
    });
    if (!captured.ok) throw new Error(JSON.stringify(captured.blocker));
    const direction = resolvePatternImportDxfPhaseELinkedN1MetadataResumeDirectionV1(
      captured.pending,
      ui.card,
      geometryContext,
    );
    expect(direction).toBe('same');
    if (!direction) throw new Error('The exact current saved seam does not admit metadata resume.');
    const pending = Object.freeze({ ...captured.pending, metadataResumeDirection: direction });
    const refreshed = await refreshPatternImportDxfPhaseEZeroConnectSeamLinkAuthorityV1(
      {
        ...request,
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_OWNER_V1,
        direction,
      },
      signal,
      'current',
    );
    if (!refreshed.ok) throw new Error(JSON.stringify(refreshed.blocker));
    const prepared = preparePatternImportDxfPhaseEZeroConnectExistingLinkedN1RebindV1(
      pending,
      direction,
      geometryContext,
    );
    if (!prepared.ok) throw new Error(JSON.stringify(prepared.blocker));
    const { techCard: freshCard } = await ports.GetTechCard({
      id: row.techCardId,
      vatCountryCode: undefined,
    });
    const readback = verifyPatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackV1({
      mode: 'resume-metadata',
      pending,
      expectedSeam: prepared.receipt.storedSeam,
      freshCard,
    });
    if (!readback.ok) throw new Error(JSON.stringify(readback.blocker));
    const result = await finalizePatternImportDxfPhaseEExistingLinkedN1V1({
      pending,
      profile: { id: 'browser-medium-isotropic-diagnostic', revision: '1' },
      direction,
      readback,
      freshCard: freshCard!,
      metadataResumeAuthority: refreshed.authority,
      isCurrent: () =>
        revalidatePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1(
          pending,
          currentInputs(),
        ).ok,
      signal,
      persist: bridge.persist,
    });
    expect(result, JSON.stringify(result)).toEqual({ ok: true });
  }

  let root = rootFactory();
  const clearSession = () =>
    clearPatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId);
  type WorkbenchProps = Parameters<
    typeof import('./assembly-order-entry').PatternImportDxfPhaseEMultiseamAssemblyOrderEntryV2
  >[0];
  const restoreMounted = (thread: string) =>
    waitForWorkbench(() => {
      const session = readSession();
      const mounted = ui.renderWorkbench.mock.lastCall?.[0] as WorkbenchProps | undefined;
      expect(session?.current.row).toEqual(currentSeed.row);
      expect(session?.current.selectedOperation.seamIds).toEqual([seamKey]);
      expect(mounted?.exactNSession).toBe(session);
      expect(mounted?.stitchVisual?.thread.bomLineKey).toBe(thread);
      const resolved = resolvePatternImportDxfProductExactNSeamProductionMountV2(session!, 0);
      if (!resolved.ok) throw new Error(JSON.stringify(resolved.blockers));
      expect(
        resolved.model.state.seams.map(({ seamId, sides }) => ({
          seamId,
          vertices: sides.map(({ boundaryVertexIds }) => boundaryVertexIds),
        })),
      ).toEqual([{ seamId: seamKey, vertices: vertexIds }]);
    });
  const remount = async () => {
    await act(async () => root.unmount());
    clearSession();
    ui.renderNativeN1.mockClear();
    ui.renderWorkbench.mockClear();
    root = rootFactory();
    await act(async () => root.render(createElement(Harness)));
  };

  clearSession();
  try {
    await act(async () => root.render(createElement(Harness)));
    await waitForUnboundMount();
    const oldRequest = await pickNativeEdges('native-n1-before-edit');
    expect(puts).not.toHaveBeenCalled();
    await act(async () => confirmCurrentSeam(oldRequest));
    await remount();
    await restoreMounted('thread-before');
    const oldCarrier = readStored();
    if (!oldCarrier) throw new Error('The original current V4 was not persisted.');
    expect(oldCarrier.mediaType).toBe(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4);
    expect(puts).toHaveBeenCalledTimes(2);

    const form = mapTechCardToForm(card);
    form.operations![0]!.bomLineKeys = ['thread-after'];
    const changed = mapFormToTechCardInsert(form, card.techCard);
    ports.UpdateTechCard.mockImplementationOnce(async (request) => {
      expect(request).toMatchObject({
        expectedLockVersion: row.cardLockVersion,
        techCard: {
          operations: [{ operationNumber, seamKeys: [seamKey], bomLineKeys: ['thread-after'] }],
        },
      });
      threadKey = 'thread-after';
      currentRevision = `asm:v1:${'9'.repeat(32)}:22`;
      currentSeed = {
        ...n1Seed,
        row: { ...row, cardLockVersion: row.cardLockVersion + 1, revision: row.revision + 1 },
      };
      const reply = await completeSourceReply(currentSeed, seams, undefined, { threadKey });
      card = cardForSavedNativeFixture(currentSeed, seams, reply.operations!);
      stored = undefined;
      return { lockVersion: currentSeed.row.cardLockVersion };
    });
    await act(async () => {
      await updateTechCardDocument({
        id: row.techCardId,
        techCard: changed,
        expectedLockVersion: row.cardLockVersion,
        snapshotReason: '',
        saveSessionId: undefined,
        guardedPieceRename: undefined,
      });
      expect(readSession()).toBeNull();
      displayCurrentCard();
      root.render(createElement(Harness));
    });

    const complete = await readCompleteSavedAssemblySourceV1(
      ports,
      currentSeed.row,
      { expectedServerAssemblyRevision: currentRevision },
      signal,
    );
    expect(complete.operations).toMatchObject([
      { operationNumber, bomLineKeys: ['thread-after'], seamKeys: [seamKey] },
    ]);
    expect(complete.ownedSeams.map((seam) => seam.seamKey)).toEqual([seamKey]);
    expect(complete.priorCarrier).toBeNull();
    expect(currentSeed.row.sha256).toBe(row.sha256);
    expect(
      capturePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1({
        ...currentInputs(),
        request: oldRequest,
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'existing-linked-n1-source-size-invalid' } });
    expect(puts).toHaveBeenCalledTimes(2);

    await remount();
    await waitForUnboundMount();
    const freshRequest = await pickNativeEdges('native-n1-after-edit');
    expect(freshRequest.authoringAuthority.row).toEqual(currentSeed.row);
    expect(freshRequest.catalog.sourceFileId).toBe(oldRequest.catalog.sourceFileId);
    // Even authentic old V1/V4 bytes are invalid under the new card lock and row revision.
    for (const stale of [capturedV1[0]!, oldCarrier]) {
      sidecarReadOverride = stale;
      expect(
        await bridge.restore(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1,
            row: currentSeed.row,
            selectedOperationNumber: operationNumber,
            catalog: freshRequest.catalog,
          },
          signal,
        ),
      ).toMatchObject({
        ok: false,
        blocker: {
          code: 'durable-restore-failed',
          detail: 'Current semantic sidecar does not match the fresh saved-DXF row.',
        },
      });
    }
    sidecarReadOverride = undefined;
    expect(readSession()).toBeNull();
    expect(puts).toHaveBeenCalledTimes(2);
    await act(async () => confirmCurrentSeam(freshRequest));
    expect(puts).toHaveBeenCalledTimes(4);
    expect(capturedV1).toHaveLength(2);
    expect(capturedV1[1]!.sidecarSha256).not.toBe(capturedV1[0]!.sidecarSha256);
    const nextV1 = JSON.parse(Buffer.from(capturedV1[1]!.sidecarBytes!, 'base64').toString());
    expect(nextV1.persistence.card).toEqual({
      techCardId: row.techCardId,
      lockBasis: 'current-saved-row',
      capturedLockVersion: currentSeed.row.cardLockVersion,
      observedLockVersion: currentSeed.row.cardLockVersion,
    });
    expect(nextV1.product.exportSha256).toBe(row.sha256);
    expect(readStored()?.sidecarSha256).not.toBe(oldCarrier.sidecarSha256);
    expect(ports.UpdateTechCard).toHaveBeenCalledTimes(1);
    const readsBeforeReload = guardedSnapshotReads;
    await remount();
    await restoreMounted('thread-after');
    expect(guardedSnapshotReads).toBeGreaterThan(readsBeforeReload);
    expect(puts).toHaveBeenCalledTimes(4);
    expect(card.seams).toEqual(seams);
  } finally {
    await act(async () => root.unmount());
    generation.dispose();
    clearSession();
    useSeamsStore.setState(priorSeamState);
    vi.unstubAllGlobals();
  }
}, 20_000);
