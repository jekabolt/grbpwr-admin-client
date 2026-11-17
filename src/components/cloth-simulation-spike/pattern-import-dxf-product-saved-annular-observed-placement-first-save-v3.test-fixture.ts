import { Buffer } from 'node:buffer';
import { vi } from 'vitest';
import type { TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import type { PatternImportDxfProductCompositeSidecarStorageServiceV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';
import { withLegacySavedAnnularGarmentSourceV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-garment-port.test-fixture';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
  type PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import {
  bytesOf,
  semanticDocument,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1.test-fixture';
import { decodePatternImportDxfProductMultiseamPlacementSidecarV2 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import type { PatternImportDxfProductConfirmedAnnularEvidenceV1 } from 'lib/cloth/domain/pattern-import-dxf-product-confirmed-annular-intent-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
  buildPatternImportDxfProductPhaseEExactTopologyBindingV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductExactTopologyComponentV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { createPatternImportDxfProductCompositeObservedPlacementSaverV3 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-save-v1';
import { readPatternImportDxfProductCompositeObservedPlacementV3 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1';
import { PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v3';
import { createObservedPlacementPairCubeBodyFixtureV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import { projectSavedModelObservedPlacementTargetV1 } from './saved-model-observed-placement-target-v1';
import {
  projectObservedPlacementSidecarIssuedV3,
  type ObservedPlacementSidecarIssuedOwnerV3,
} from './observed-placement-sidecar-issuer-v3';
import {
  createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementIssueRequestV3,
} from './pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';

export async function withFirstSaveSourceV3<T>(
  consume: (request: PatternImportDxfProductSavedGarmentMeshIngressRequestV1) => Promise<T>,
) {
  const seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
  return withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2(
    seed,
    ({ sourceOwner, compositionRequest, targetEdgeMm }) =>
      consume({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
        sourceOwner,
        compositionRequest,
        targetEdgeMm,
      }),
  );
}

async function prepare() {
  // Independent explicit fixture roles only. No existing Placement component/read owner enters
  // the new session; its D0 and issuance use the genuine private compiler context below.
  return withLegacySavedAnnularGarmentSourceV1(async ({ placementRequest, inputs }) => {
    const seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
    const semantic = semanticDocument(seed.row, 4);
    semantic.persistence.pieceLineKeys = [...placementRequest.bindings.topology.pieceLineKeys];
    semantic.persistence.card.observedLockVersion = seed.row.cardLockVersion - 1;
    semantic.persistence.card.previousLockVersion = seed.row.cardLockVersion - 2;
    const semanticBytes = bytesOf(semantic);
    const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(semanticBytes);
    if (!decoded.ok || decoded.compatibility !== 'legacy-v1-no-placement')
      throw new Error('Fixture semantic envelope invalid.');
    const {
      assemblyTopologySha256,
      localOperationOrder: _localOrder,
      ...placementOperation
    } = placementRequest.bindings.topology;
    void _localOrder;
    const evidence: PatternImportDxfProductConfirmedAnnularEvidenceV1 = {
      row: seed.row,
      semanticBytes,
      semanticSha256: decoded.legacy.canonicalSha256,
      assemblyTopologySha256,
      serverAssemblyRevision: 'saved-ao-r1',
      placementOperation,
      outerTopology: { kind: 'composite-v3-two-seam' },
    };
    const authority = {
      row: seed.row,
      serverAssemblyRevision: evidence.serverAssemblyRevision,
      assemblyTopologySha256,
    };
    const { catalog, proposal, choices } = inputs.compositionRequest;
    const exact = await buildPatternImportDxfProductPhaseEExactTopologyBindingV1({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
      current: {
        ...authority,
        selectedOperation: {
          sourceOperationNumber: proposal.operation.sourceOperationNumber,
          authoringOperationId: proposal.operation.authoringOperationId,
          localOperationOrder: 0,
          seamIds: [...proposal.operation.seamIds],
        },
        catalogCanonicalSha256: catalog.canonicalSha256,
        proposalFingerprint: proposal.deterministicFingerprint,
        phaseEAggregatePlanSha256: choices.aggregatePlanSeal.canonicalSha256,
      },
      catalog: structuredClone(catalog),
      proposal: structuredClone(proposal),
      choices: structuredClone(choices),
    });
    if (!exact.ok) throw new Error(JSON.stringify(exact));
    const exactBytes = await encodePatternImportDxfProductExactTopologyComponentV3(exact.owner);
    if (!exactBytes.ok) throw new Error('Exact fixture encode failed.');
    const composite = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: authority,
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: semanticBytes,
      placementV2Bytes: null,
      exactTopologyBytes: exactBytes.bytes,
    });
    if (!composite.ok) throw new Error(JSON.stringify(composite));
    const encoded = encodePatternImportDxfProductCompositeSidecarV3(composite.owner);
    if (!encoded.ok) throw new Error('Initial envelope encode failed.');
    const initialComponentKinds = composite.document.components.map((c) => c.kind);
    const stored = {
      techCardId: seed.row.techCardId,
      patternLineKey: seed.row.patternLineKey,
      dxfSha256: seed.row.sha256,
      patternVersion: semantic.persistence.pattern.version,
      postSaveReceiptSha256: semantic.persistence.receiptSealSha256,
      cardLockVersion: seed.row.cardLockVersion,
      savedRowRevision: seed.row.revision,
      mediaType: String(composite.document.mediaType),
      sidecarSha256: encoded.canonicalSha256,
      byteLength: encoded.bytes.length,
      sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
      createdAt: undefined,
      createdBy: undefined,
    } satisfies TechCardPatternSemanticSidecar;
    return {
      seed,
      evidence,
      authority,
      initialComponentKinds,
      initialSha: encoded.canonicalSha256,
      semanticBytes,
      exactBytes: exactBytes.bytes,
      stored,
      garment: structuredClone(placementRequest.placementAuthoring.semantics.garment),
      policy: structuredClone(placementRequest.placementAuthoring.semantics.policy),
      annularParameters: structuredClone(placementRequest.placementAuthoring.annular.parameters),
    };
  });
}
async function openFixture() {
  const a = await prepare();
  const body = await createObservedPlacementPairCubeBodyFixtureV1();
  const target = await projectSavedModelObservedPlacementTargetV1(body.bodyOwner, body.binding);
  if (!target.ok) {
    body.dispose();
    throw new Error(target.detail);
  }
  const evidenceState = { current: a.evidence };
  const reader = vi.fn(async () => structuredClone(evidenceState.current));
  const storage = { stored: a.stored };
  const get = vi.fn(async () => ({ semanticSidecar: structuredClone(storage.stored) }));
  const put = vi.fn(
    async (
      request: Parameters<
        PatternImportDxfProductCompositeSidecarStorageServiceV3['PutTechCardPatternSemanticSidecar']
      >[0],
    ) => {
      if (request.expectedPreviousSidecarSha256 !== storage.stored.sidecarSha256)
        throw Object.assign(new Error('CAS conflict'), { status: 409 });
      storage.stored = {
        ...storage.stored,
        sidecarSha256: request.sidecarSha256!,
        sidecarBytes: request.sidecarBytes!,
        byteLength: atob(request.sidecarBytes!).length,
        mediaType: request.mediaType!,
      };
      return { semanticSidecar: structuredClone(storage.stored) };
    },
  );
  const bindSaver = async (owner: ObservedPlacementSidecarIssuedOwnerV3) => {
    const projected = await projectObservedPlacementSidecarIssuedV3(owner);
    if (!projected) throw new Error('Unissued fixture save owner.');
    const current = {
      authority: a.authority,
      placementBindings: projected.document.bindings,
      exactNCurrent: null,
    };
    let transportSignal: AbortSignal | undefined;
    const host = {
      createClient: (signal?: AbortSignal) => {
        transportSignal = signal;
        return { GetTechCardPatternSemanticSidecar: get, PutTechCardPatternSemanticSidecar: put };
      },
      readCurrentEvidence: vi.fn(async () => structuredClone(current)),
    };
    const saveRequest = {
      confirmed: true as const,
      placementOwner: owner,
      expectedPreviousOuterSha256: storage.stored.sidecarSha256,
      current,
    };
    const freshRead = async (signal?: AbortSignal) => {
      const result = await readPatternImportDxfProductCompositeObservedPlacementV3(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
          expectedRow: a.seed.row,
          expectedBindings: current.placementBindings,
        },
        a.authority.serverAssemblyRevision,
        {
          getSidecar: async () => ({ status: 'found', row: (await get()).semanticSidecar }),
          readCurrentEvidence: async () => ({
            row: a.seed.row,
            topology: current.placementBindings.topology,
            serverAssemblyRevision: a.authority.serverAssemblyRevision,
          }),
        },
        signal,
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      return result.owner;
    };
    return {
      projected,
      current,
      host,
      saveRequest,
      saver: createPatternImportDxfProductCompositeObservedPlacementSaverV3(host),
      freshRead,
      transportSignal: () => transportSignal,
    };
  };
  return { ...a, body, target, evidenceState, reader, storage, get, put, bindSaver };
}
type Fixture = Awaited<ReturnType<typeof openFixture>>;
type Session = ReturnType<
  typeof createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1
>;
export async function withObservedFirstSaveFixtureV3<T>(
  consume: (
    f: Fixture & {
      session: Session;
      generation: number;
      intent: Omit<
        PatternImportDxfProductSavedAnnularObservedPlacementIssueRequestV3,
        'displayedBodyOwner' | 'displayedBodyBinding'
      >;
    },
  ) => Promise<T>,
): Promise<T> {
  const f = await openFixture();
  const session = createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1();
  try {
    return await withFirstSaveSourceV3(async (source) => {
      const compiled = await session.consume(source);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled));
      const intent = {
        expectedGeneration: compiled.generation,
        confirmed: true as const,
        garment: f.garment,
        policy: f.policy,
        annularParameters: f.annularParameters,
        confirmedTargetSha256: f.target.canonicalSha256,
        readCurrentEvidence: f.reader,
      };
      return consume({ ...f, session, generation: compiled.generation, intent });
    });
  } finally {
    session.dispose();
    f.body.dispose();
  }
}
