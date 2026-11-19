import { Buffer } from 'node:buffer';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AdminService, TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_REQUEST_V1,
  restorePatternImportDxfProductPhaseEExactTopologySerializedPrefillV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  buildPatternImportDxfProductPhaseEMultiseamChoicesV2,
  createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
  proposePatternImportDxfProductPhaseEMultiseamAssemblyV2,
  type PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
} from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import { routePatternImportDxfPhaseEAssemblyOrderEntryV2 } from '../phase-e-workbench/assembly-order-entry';
import { persistPatternImportDxfPhaseEMultiseamExactChoicesV2 } from './assembly-order-entry';
import { bytesOf, semanticDocument } from './composite-placement-read-v1.test-fixture';
import { createPatternImportDxfProductCompositeSidecarProductionTransactionV4 } from './composite-sidecar-production-transaction-v4';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4 } from './composite-sidecar-persistence-v4';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_REQUEST_V4 } from './composite-sidecar-transaction-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
  buildPatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductExactNSeamComponentV4,
} from './composite-sidecar-v4';
import { buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2 } from './exact-n-seam-consistency-carrier-v2';
import { PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2 } from './exact-n-seam-authority-gap-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
  restorePatternImportDxfProductCompositeSidecarDurableV4,
  readPatternImportDxfProductExactNSeamRestorePatchV2,
} from './composite-sidecar-restore-authority-v4';
import {
  PATTERN_IMPORT_DXF_PHASE_E_LINKED_N1_DURABLE_REQUEST_V1,
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1,
  createPatternImportDxfPhaseEZeroConnectProductionDurableBridgeV1,
} from './zero-connect-durable-composite-v4';
import { createPatternImportDxfPhaseEExactCompositeProductionPersistenceV3 } from './exact-composite-persistence-v3';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  digestFullAssemblyFixture,
  fullAssemblyFixtureWireV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import { createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1 } from './saved-assembly-snapshot-production-rpc-v1';
import {
  canonicalizePatternImportDxfPhaseESavedAssemblyValueV1,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1,
} from './saved-assembly-topology-hash-v1';

const ports = vi.hoisted(() => ({
  getSnapshot: vi.fn<AdminService['GetTechCardSavedAssemblySnapshot']>(),
  getSidecar: vi.fn<AdminService['GetTechCardPatternSemanticSidecar']>(),
  putSidecar: vi.fn<AdminService['PutTechCardPatternSemanticSidecar']>(),
}));

vi.mock('api/api', () => ({
  abortableAdminService: () => ({
    GetTechCardSavedAssemblySnapshot: ports.getSnapshot,
    GetTechCardPatternSemanticSidecar: ports.getSidecar,
    PutTechCardPatternSemanticSidecar: ports.putSidecar,
  }),
  adminService: {},
}));

beforeEach(() => vi.clearAllMocks());

async function fixture(seamKeys: string[], mediaType: string) {
  const seed = await createSavedThreePanelFixtureV1(2);
  const { row } = seed;
  const selectedOperationNumber = 10;
  const wire = await fullAssemblyFixtureWireV1(seed, selectedOperationNumber);
  Object.assign(wire.operations[0], {
    seamKeys: [...seamKeys],
    outputUnitKey: 'joined-shell',
    outputUnitName: 'Joined shell',
  });
  wire.selectedSeams = seamKeys.map((seamKey) => ({
    ...structuredClone(wire.selectedSeams[0]),
    seamKey,
  }));
  // The stored protobuf uses 0/0 for an EDGE whole run, including in the signed topology.
  for (const seam of wire.selectedSeams)
    for (const anchor of [...seam.sideA.parts, ...seam.sideB.parts])
      Object.assign(anchor, { rangeFrom: 0, rangeTo: 0 });
  const topology = JSON.parse(Buffer.from(wire.topologyCanonicalJson, 'base64').toString());
  Object.assign(topology.operations[0], {
    seamKeys: [...seamKeys],
    outputUnitKey: 'joined-shell',
    outputUnitName: 'Joined shell',
  });
  topology.seams = seamKeys.map((seamKey) => ({
    ...structuredClone(topology.seams[0]),
    seamKey,
  }));
  for (const seam of topology.seams)
    for (const anchor of [...seam.sideA, ...seam.sideB]) anchor.range = [0, 0];
  const canonical = canonicalizePatternImportDxfPhaseESavedAssemblyValueV1(topology);
  wire.topologyCanonicalJson = Buffer.from(canonical).toString('base64');
  wire.assemblyTopologySha256 = await digestFullAssemblyFixture(
    new TextEncoder().encode(
      `${PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1}\0${canonical}`,
    ),
  );

  const semanticBytes = bytesOf(semanticDocument(row));
  let stored = {
    techCardId: row.techCardId,
    patternLineKey: row.patternLineKey,
    cardLockVersion: row.cardLockVersion,
    savedRowRevision: row.revision,
    patternVersion: 4,
    dxfSha256: row.sha256,
    byteLength: semanticBytes.length,
    sidecarBytes: Buffer.from(semanticBytes).toString('base64'),
    sidecarSha256: await digestFullAssemblyFixture(semanticBytes),
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
    postSaveReceiptSha256: '3'.repeat(64),
  } as TechCardPatternSemanticSidecar;
  const { revision, ...wireRow } = {
    ...wire.row,
    patternVersion: stored.patternVersion,
  };
  const { downloadUrl, ...canonicalRow } = wireRow;
  expect(revision).toBe(row.revision);
  expect(downloadUrl).toBe(row.url);
  const completeSource = {
    ownedSeams: wire.selectedSeams,
    aliases: [],
    garmentLabels: [],
  };
  const completeCanonical = canonicalizePatternImportDxfPhaseESavedAssemblyValueV1({
    ...completeSource,
    rows: [canonicalRow],
    operations: wire.operations,
    serverAssemblyRevision: wire.serverAssemblyRevision,
  });
  const completeSha = await digestFullAssemblyFixture(
    new TextEncoder().encode(`tech-card-saved-assembly-complete-source/1\0${completeCanonical}`),
  );
  ports.getSnapshot.mockImplementation(async (request) => {
    expect(request).toMatchObject({
      expectedSavedRowRevision: row.revision,
      expectedCardLockVersion: row.cardLockVersion,
      expectedSha256: row.sha256,
    });
    const complete =
      request.profile === 'TECH_CARD_SAVED_ASSEMBLY_SNAPSHOT_PROFILE_COMPLETE_SOURCE_V1';
    if (complete) expect(request.expectedServerAssemblyRevision).toBe(wire.serverAssemblyRevision);
    else expect(request.selectedOperationNumber).toBe(selectedOperationNumber);
    return {
      ...wire,
      row: complete ? wireRow : { ...wire.row, patternVersion: stored.patternVersion },
      ...(complete && {
        completeSourceV1: {
          ...completeSource,
          rows: [wireRow],
          sourceSha256: completeSha,
          canonicalJson: Buffer.from(completeCanonical).toString('base64'),
        },
      }),
      semanticSidecar: structuredClone(stored),
    } as unknown as Awaited<ReturnType<AdminService['GetTechCardSavedAssemblySnapshot']>>;
  });
  ports.getSidecar.mockImplementation(async () => ({ semanticSidecar: structuredClone(stored) }));
  ports.putSidecar.mockImplementation(async (request) => {
    expect(request).toMatchObject({
      techCardId: row.techCardId,
      patternLineKey: row.patternLineKey,
      expectedPreviousSidecarSha256: stored.sidecarSha256,
      expectedSavedRowRevision: row.revision,
      expectedCardLockVersion: row.cardLockVersion,
      expectedServerAssemblyRevision: wire.serverAssemblyRevision,
      expectedAssemblyTopologySha256: wire.assemblyTopologySha256,
      selectedOperationNumber,
      mediaType,
    });
    stored = {
      ...stored,
      mediaType: request.mediaType,
      sidecarSha256: request.sidecarSha256,
      sidecarBytes: request.sidecarBytes,
      byteLength: Buffer.from(request.sidecarBytes!, 'base64').length,
    };
    return { semanticSidecar: structuredClone(stored) };
  });

  const readCatalog = async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    try {
      const built = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
        source.native.draft,
        'main',
        'M',
      );
      if (!built.ok) throw new Error(JSON.stringify(built.blockers));
      return built.catalog;
    } finally {
      source.dispose();
    }
  };
  const catalog = await readCatalog();
  const signal = new AbortController().signal;
  const newSnapshotOwner = () =>
    createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(selectedOperationNumber);
  const { authorityAdapter } = newSnapshotOwner();
  const current = await authorityAdapter.readCurrentAssemblyTopology(
    { row, selectedOperationNumber },
    signal,
  );
  return {
    row,
    catalog,
    readCatalog,
    signal,
    newSnapshotOwner,
    authorityAdapter,
    current,
    semanticBytes,
    getStored: () => stored,
  };
}

it('saves two confirmed exact seams with production V3 and restores their exact V1 topology through a new authority', async () => {
  const seamKeys = ['left-side-seam', 'right-side-seam'];
  const {
    row,
    catalog,
    signal,
    newSnapshotOwner,
    authorityAdapter,
    current,
    semanticBytes,
    getStored,
  } = await fixture(seamKeys, PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3);
  const { selectedOperationNumber } = current;
  const opening = newSnapshotOwner();
  await expect(
    opening.authorityAdapter.readAuthoritativeAssembly({ row, selectedOperationNumber }, signal),
  ).rejects.toMatchObject({ code: 'exact-carrier-unavailable' });
  const initialEvidence = await opening.readInitialAssembly(
    { row, selectedOperationNumber },
    signal,
  );
  expect(initialEvidence).toMatchObject({
    exactTopology: null,
    semanticV1Sha256: getStored().sidecarSha256,
    serverAssemblyRevision: current.serverAssemblyRevision,
    serverTopologySha256: current.assemblyTopologySha256,
  });
  expect(routePatternImportDxfPhaseEAssemblyOrderEntryV2(seamKeys)).toBe('v2');
  const proposed = proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(
    catalog,
    current.topology,
  );
  if (!proposed.ok) throw new Error(JSON.stringify(proposed.blockers));
  const { proposal } = proposed;
  expect(current.topology.seams.map(({ sideA }) => sideA[0]?.range)).toEqual([
    [0, 0],
    [0, 0],
  ]);
  expect(
    proposal.seams.flatMap(({ sides }) => sides.map(({ evidence }) => evidence.range)),
  ).toEqual([
    [0, 1],
    [0, 1],
    [0, 1],
    [0, 1],
  ]);
  const zeroPartial = proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(catalog, {
    ...current.topology,
    seams: current.topology.seams.map((seam, index) =>
      index === 0 ? { ...seam, kind: 'partial' } : seam,
    ),
  });
  expect(zeroPartial).toMatchObject({ ok: false, blockers: [{ code: 'seam-shape-unsupported' }] });
  const initial = createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2(
    catalog,
    proposal,
    { documentId: row.patternLineKey, revision: String(row.revision) },
    1,
  );
  const state: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2 = {
    ...initial,
    documentRevisionConfirmed: true,
    physicalSurface: { mode: 'cut-surface', seamAllowancePhysical: true },
    physicalSurfaceConfirmed: true,
    operationStage: 4,
    operationConfirmed: true,
    seams: initial.seams.map((seam, index) => {
      const sides = proposal.seams[index]!.sides.map((side) => {
        const piece = catalog.pieces.find(({ pieceId }) => pieceId === side.pieceId)!;
        const contour = piece.contours.find(({ role }) => role === 'cut-boundary')!;
        const start = index * 2;
        const pair = contour.boundaryVertices
          .slice(start, start + 2)
          .map(({ vertexId }) => vertexId);
        return {
          pieceId: side.pieceId,
          contourId: contour.contourId,
          boundaryVertexIds: side.requiredDirection === 'reverse' ? pair.reverse() : pair,
          direction: side.requiredDirection,
          confirmed: true,
        };
      }) as unknown as typeof seam.sides;
      return {
        ...seam,
        confirmed: true,
        mapping: 'equal' as const,
        lengthRatio: 1,
        sides,
      };
    }) as unknown as typeof initial.seams,
    materialSelections: [
      { ...initial.materialSelections[0], optionId: 'main-fabric', confirmed: true },
      { ...initial.materialSelections[1], optionId: 'main-fabric', confirmed: true },
    ],
    tolerance: { endpointMm: 0, fullLengthMm: 0.001, fullLengthRelative: 0, confirmed: true },
  };
  const choices = await buildPatternImportDxfProductPhaseEMultiseamChoicesV2(
    catalog,
    proposal,
    state,
    [{ id: 'main-fabric', label: 'Main fabric', materialRevision: 'fabric:main:r1' }],
    crypto,
  );
  if (!choices.ok) throw new Error(JSON.stringify(choices.blockers));
  const persistence = {
    authorityAdapter,
    exactComposite: createPatternImportDxfPhaseEExactCompositeProductionPersistenceV3(),
  };
  const request = {
    row,
    selectedOperationNumber,
    catalog,
    proposal,
    choices,
    initialAuthority: {
      serverAssemblyRevision: initialEvidence.serverAssemblyRevision,
      assemblyTopologySha256: initialEvidence.serverTopologySha256,
      semanticV1Sha256: initialEvidence.semanticV1Sha256,
    },
  };
  const changedV1 = semanticDocument(row);
  changedV1.product.phaseEPlanSha256 = '8'.repeat(64);
  const changedBytes = bytesOf(changedV1);
  ports.getSidecar.mockResolvedValueOnce({
    semanticSidecar: {
      ...getStored(),
      byteLength: changedBytes.length,
      sidecarBytes: Buffer.from(changedBytes).toString('base64'),
      sidecarSha256: await digestFullAssemblyFixture(changedBytes),
    },
  });
  const stale = await persistPatternImportDxfPhaseEMultiseamExactChoicesV2(
    persistence,
    request,
    signal,
  );
  expect(stale).toMatchObject({
    persistence: 'not-attempted',
    blockers: [{ code: 'exact-composite-current-sidecar-invalid' }],
  });
  expect(ports.putSidecar).not.toHaveBeenCalled();
  const saved = await persistPatternImportDxfPhaseEMultiseamExactChoicesV2(
    persistence,
    request,
    signal,
  );
  expect(saved, JSON.stringify(saved)).toMatchObject({
    status: 'verified-exact-topology-persisted',
    persistence: 'verified',
  });
  expect(ports.putSidecar).toHaveBeenCalledTimes(1);

  const fresh = newSnapshotOwner();
  await expect(fresh.readInitialAssembly({ row, selectedOperationNumber }, signal)).rejects.toThrow(
    'current standalone Product Semantic V1',
  );
  const read = await fresh.authorityAdapter.readAuthoritativeAssembly(
    { row, selectedOperationNumber },
    new AbortController().signal,
  );
  expect(read.exactTopology?.carrier.bindings.selectedOperation.seamIds).toEqual(seamKeys);
  expect(read.exactTopology?.carrier.bindings.row).toEqual(row);
  expect(read.exactTopology?.carrier.bindings.phaseEAggregatePlanSha256).toBe(
    choices.choices.aggregatePlanSeal.canonicalSha256,
  );
  if (!read.exactTopology) throw new Error('V1 exact topology did not reload.');
  const freshTopology = await fresh.authorityAdapter.readCurrentAssemblyTopology(
    { row, selectedOperationNumber },
    signal,
  );
  const freshProposal = proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(
    catalog,
    freshTopology.topology,
  );
  if (!freshProposal.ok) throw new Error(JSON.stringify(freshProposal.blockers));
  const restored = await restorePatternImportDxfProductPhaseEExactTopologySerializedPrefillV1({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_REQUEST_V1,
    carrier: read.exactTopology.carrier,
    seal: read.exactTopology.seal,
    catalog,
    proposal: freshProposal.proposal,
    current: {
      row: freshTopology.row,
      serverAssemblyRevision: freshTopology.serverAssemblyRevision,
      assemblyTopologySha256: freshTopology.assemblyTopologySha256,
      selectedOperation: {
        sourceOperationNumber: freshProposal.proposal.operation.sourceOperationNumber,
        authoringOperationId: freshProposal.proposal.operation.authoringOperationId,
        localOperationOrder: freshProposal.proposal.operation.order,
        seamIds: [...freshProposal.proposal.operation.seamIds],
      },
      catalogCanonicalSha256: catalog.canonicalSha256,
      proposalFingerprint: freshProposal.proposal.deterministicFingerprint,
      phaseEAggregatePlanSha256: choices.choices.aggregatePlanSeal.canonicalSha256,
    },
  });
  expect(restored, JSON.stringify(restored.blockers)).toMatchObject({
    ok: true,
    patch: {
      seams: choices.choices.seams.map(({ id, sides }) => ({
        seamId: id,
        sides: sides.map(({ contourId, boundaryVertexIds, direction }) => ({
          contourId,
          boundaryVertexIds,
          direction,
        })),
      })),
    },
  });
  const decoded = await decodePatternImportDxfProductCompositeSidecarV3(
    Uint8Array.from(Buffer.from(getStored().sidecarBytes!, 'base64')),
  );
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.blockers));
  expect(
    readPatternImportDxfProductCompositeComponentBytesV3(decoded.owner, 'semantic-product-v1'),
  ).toEqual(semanticBytes);
  expect(ports.putSidecar).toHaveBeenCalledTimes(1);
});

it('V4 verifies three independently bound exact joins and the linked N1 entry refuses the same operation', async () => {
  const seamIds = ['first-join', 'second-join', 'third-join'];
  const {
    row,
    catalog,
    readCatalog,
    signal,
    newSnapshotOwner,
    authorityAdapter,
    current,
    semanticBytes,
    getStored,
  } = await fixture(seamIds, PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4);
  const { selectedOperationNumber, serverAssemblyRevision, assemblyTopologySha256 } = current;
  expect(routePatternImportDxfPhaseEAssemblyOrderEntryV2(seamIds)).toBe('v2');
  expect(
    proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(catalog, current.topology).ok,
  ).toBe(false);

  const readExactPair = (source: typeof catalog, seamId: string, index: number) => {
    const makeSide = (pieceLineKey: string, sideIndex: 0 | 1) => {
      const piece = source.pieces.find((entry) => entry.pieceLineKey === pieceLineKey)!;
      const contour = piece.contours.find(({ role }) => role === 'cut-boundary')!;
      const from = contour.boundaryVertices[index]!.vertexId;
      const to = contour.boundaryVertices[index + 1]!.vertexId;
      return {
        seamId,
        pieceLineKey,
        pieceId: piece.pieceId,
        contourId: contour.contourId,
        sideIndex,
        boundaryVertexIds: sideIndex === 0 ? ([from, to] as const) : ([to, from] as const),
        direction: sideIndex === 0 ? ('forward' as const) : ('reverse' as const),
      };
    };
    return [makeSide('line-FRONT', 0), makeSide('line-BACK', 1)] as const;
  };
  const sides = seamIds.flatMap((seamId, index) => readExactPair(catalog, seamId, index));
  const planDigest = async (orderedSeamIds: readonly string[], exactSides: typeof sides) =>
    digestFullAssemblyFixture(
      new TextEncoder().encode(
        canonicalizePatternImportDxfPhaseESavedAssemblyValueV1({
          seamIds: orderedSeamIds,
          sides: exactSides,
        }),
      ),
    );
  const currentAuthority = { row, serverAssemblyRevision, assemblyTopologySha256 };
  // The fixture supplies the plan independently of the V4 carrier. The product entry has no
  // N>2 equivalent of this plan handoff, so this exercises the CAS + restore owners only.
  const authored = {
    selectedOperation: {
      sourceOperationNumber: selectedOperationNumber,
      authoringOperationId: 'fixture:three-exact-joins',
      localOperationOrder: 0 as const,
      seamIds,
    },
    catalogCanonicalSha256: catalog.canonicalSha256,
    phaseEAggregatePlanSha256: await planDigest(seamIds, sides),
  };
  const plan = { ...currentAuthority, ...authored };
  const application = createPatternImportDxfProductCompositeSidecarProductionTransactionV4();
  const bridge = createPatternImportDxfPhaseEZeroConnectProductionDurableBridgeV1(
    selectedOperationNumber,
    application,
    authorityAdapter,
  );
  const snapshotReads = ports.getSnapshot.mock.calls.length;
  expect(
    await bridge.persist(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_LINKED_N1_DURABLE_REQUEST_V1,
        row,
        selectedOperationNumber,
        seamKey: seamIds[0]!,
        catalog,
        sides: readExactPair(catalog, seamIds[0]!, 0),
        verifiedSemanticSha256: getStored().sidecarSha256!,
      },
      signal,
    ),
  ).toMatchObject({ ok: false, blocker: { code: 'durable-operation-binding-mismatch' } });
  expect(ports.getSnapshot).toHaveBeenCalledTimes(snapshotReads + 1);
  expect(ports.getSidecar).not.toHaveBeenCalled();
  expect(ports.putSidecar).not.toHaveBeenCalled();

  const exact = await buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2,
    status: 'untrusted-authority-candidate',
    ...plan,
    sides,
  });
  if (!exact.ok) throw new Error(JSON.stringify(exact.blockers));
  const exactBytes = await encodePatternImportDxfProductExactNSeamComponentV4({
    carrier: exact.carrier,
    seal: exact.seal,
  });
  if (!exactBytes.ok) throw new Error(exactBytes.blocker.detail);
  const nested = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings: currentAuthority,
    expectedPreviousSidecarSha256: getStored().sidecarSha256!,
    semanticProductV1Bytes: semanticBytes,
    placementV2Bytes: null,
    exactTopologyBytes: null,
  });
  if (!nested.ok) throw new Error(JSON.stringify(nested.blockers));
  const nestedBytes = encodePatternImportDxfProductCompositeSidecarV3(nested.owner);
  if (!nestedBytes.ok) throw new Error(nestedBytes.code);
  const composite = await buildPatternImportDxfProductCompositeSidecarV4({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
    bindings: currentAuthority,
    expectedPreviousSidecarSha256: getStored().sidecarSha256!,
    compositeV3Bytes: nestedBytes.bytes!,
    exactNSeamConsistencyBytes: exactBytes.bytes,
  });
  if (!composite.ok) throw new Error(JSON.stringify(composite.blockers));
  const saved = await application.transaction.execute(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_REQUEST_V4,
      current: plan,
      storage: {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4,
        currentAuthority,
        nextOwner: composite.owner,
      },
    },
    signal,
  );
  expect(saved, JSON.stringify(saved.blockers)).toMatchObject({
    ok: true,
    writeOutcome: 'verified',
  });
  expect(ports.putSidecar).toHaveBeenCalledTimes(1);

  const fresh = await newSnapshotOwner().authorityAdapter.readCurrentAssemblyTopology(
    { row, selectedOperationNumber },
    new AbortController().signal,
  );
  const freshCatalog = await readCatalog();
  const freshOperation = fresh.topology.operations.find(
    ({ number }) => number === fresh.selectedOperationNumber,
  );
  if (!freshOperation) throw new Error('Fresh three-join Assembly Order operation is missing.');
  const freshSeamIds = freshOperation.seamKeys;
  const freshSides = freshSeamIds.flatMap((seamId, index) =>
    readExactPair(freshCatalog, seamId, index),
  );
  const { semanticSidecar: readback } = await ports.getSidecar({
    techCardId: row.techCardId,
    patternLineKey: row.patternLineKey,
  });
  if (!readback) throw new Error('Three-seam fixture CAS did not provide fresh bytes.');
  const restoreWithPlan = (phaseEAggregatePlanSha256: string) =>
    restorePatternImportDxfProductCompositeSidecarDurableV4({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
      current: {
        row: fresh.row,
        serverAssemblyRevision: fresh.serverAssemblyRevision,
        assemblyTopologySha256: fresh.assemblyTopologySha256,
        selectedOperation: {
          ...authored.selectedOperation,
          sourceOperationNumber: fresh.selectedOperationNumber,
          seamIds: freshSeamIds,
        },
        catalogCanonicalSha256: freshCatalog.canonicalSha256,
        phaseEAggregatePlanSha256,
      },
      readback: {
        status: 'present',
        source: 'fresh-current-sidecar-get',
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
        bytes: Uint8Array.from(Buffer.from(readback.sidecarBytes!, 'base64')),
        sha256: readback.sidecarSha256!,
        byteLength: readback.byteLength!,
      },
    });
  const restored = await restoreWithPlan(await planDigest(freshSeamIds, freshSides));
  expect(restored, JSON.stringify(restored.blockers)).toMatchObject({
    ok: true,
    owner: { seamCount: 3, sidecarSha256: readback.sidecarSha256 },
  });
  if (!restored.ok) throw new Error(restored.blockers[0].detail);
  const patch = readPatternImportDxfProductExactNSeamRestorePatchV2(restored.owner);
  expect(patch?.seams.map(({ seamId }) => seamId)).toEqual(seamIds);
  expect(patch?.seams.flatMap(({ sides }) => sides)).toEqual(sides);
  const changedSides = [
    ...freshSides.slice(0, 4),
    ...readExactPair(freshCatalog, freshSeamIds[2]!, 0),
  ];
  expect(await restoreWithPlan(await planDigest(freshSeamIds, changedSides))).toMatchObject({
    ok: false,
    blockers: [{ code: 'catalog-plan-binding-mismatch' }],
  });
  expect(
    await bridge.restore(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1,
        row,
        selectedOperationNumber,
        catalog,
      },
      signal,
    ),
  ).toMatchObject({ ok: false, blocker: { code: 'durable-restore-operation-mismatch' } });
  expect(ports.putSidecar).toHaveBeenCalledTimes(1);
});
