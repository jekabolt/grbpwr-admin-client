/** Test-only external model/AO/storage transport. No body, pose, owner or runtime substitution. */
import type {
  common_Model,
  GetTechCardPatternSemanticSidecarRequest,
  GetTechCardSavedAssemblySnapshotRequest,
  PutTechCardPatternSemanticSidecarRequest,
  TechCardPatternSemanticSidecar,
} from 'api/proto-http/admin';
import type { PatternImportDxfProductSavedCanonicalMediumAnnularSeedV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import type { PatternImportDxfProductGarmentMeshComposerSnapshotV2 } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import type { PatternImportDxfProductSavedGarmentMeshIngressRequestV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
  buildPatternImportDxfProductPhaseEExactTopologyBindingV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductExactTopologyComponentV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-existing-assembly-multiseam-adapter-v2';
import {
  canonicalizePatternImportDxfPhaseESavedAssemblyValueV1,
  createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-assembly-topology-hash-v1';
import {
  bytesOf,
  semanticDocument,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1.test-fixture';

const base64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 4096)
    binary += String.fromCharCode(...bytes.subarray(index, index + 4096));
  return btoa(binary);
};
const unbase64 = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
type Fixture = Awaited<ReturnType<typeof createSavedObservedProductTransportV1>>;
let active: Fixture | null = null;
let modelListReads = 0;
let freshModelReads = 0;
const fixtureModel: common_Model = {
  id: 900731,
  createdAt: undefined,
  thumbnail: undefined,
  updatedAt: '2026-11-17T00:00:00.123456Z',
  media: [],
  model: {
    name: 'Fixture observed female · 1720 mm',
    comment: 'Synthetic measurement row; actual V11 Three geometry is built by the product.',
    gender: 'GENDER_ENUM_FEMALE',
    thumbnailId: undefined,
    mediaIds: [],
    defaultSizeIds: [],
    bodyMeasurementSchemaVersion: 1,
    measurements: [
      { name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: 1720, metadata: undefined },
      { name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', valueMm: 420, metadata: undefined },
      { name: 'BODY_MEASUREMENT_NAME_CHEST', valueMm: 920, metadata: undefined },
      { name: 'BODY_MEASUREMENT_NAME_WAIST', valueMm: 740, metadata: undefined },
      { name: 'BODY_MEASUREMENT_NAME_HIP', valueMm: 980, metadata: undefined },
      { name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', valueMm: 600, metadata: undefined },
      { name: 'BODY_MEASUREMENT_NAME_INSEAM', valueMm: 800, metadata: undefined },
    ],
  },
};
export const readFixtureObservedModelV1 = () => structuredClone(fixtureModel);
export const readFixtureModelTransportStatsV1 = () => ({ modelListReads, freshModelReads });

export async function createSavedObservedProductTransportV1(
  seed: PatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2,
  composition: PatternImportDxfProductSavedGarmentMeshIngressRequestV1['compositionRequest'],
) {
  const row = structuredClone(seed.row);
  const selectedOperationNumber = snapshot.assembly.sourceOperationNumber;
  const adapted = adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2(
    seed.assembly,
    selectedOperationNumber,
  );
  if (!adapted.ok) throw new Error(adapted.blockers[0].detail);
  const serverAssemblyRevision = 'fixture-assembly:observed:tx-000007';
  const assemblyTopologySha256 =
    await createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1().computeCanonicalSha256(
      adapted.existingAssembly,
      new AbortController().signal,
    );
  const exact = await buildPatternImportDxfProductPhaseEExactTopologyBindingV1(
    JSON.parse(
      JSON.stringify({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
        current: {
          row,
          serverAssemblyRevision,
          assemblyTopologySha256,
          selectedOperation: {
            sourceOperationNumber: composition.proposal.operation.sourceOperationNumber,
            authoringOperationId: composition.proposal.operation.authoringOperationId,
            seamIds: [...composition.proposal.operation.seamIds],
            localOperationOrder: 0,
          },
          catalogCanonicalSha256: snapshot.seals.catalogCanonicalSha256,
          proposalFingerprint: snapshot.seals.proposalFingerprint,
          phaseEAggregatePlanSha256: snapshot.seals.phaseEPlanSha256,
        },
        catalog: composition.catalog,
        proposal: composition.proposal,
        choices: composition.choices,
      }),
    ),
  );
  if (!exact.ok) throw new Error(exact.blockers[0].detail);
  const encodedExact = await encodePatternImportDxfProductExactTopologyComponentV3(exact.owner);
  if (!encodedExact.ok) throw new Error(encodedExact.blocker.detail);
  // Historical semantic storage metadata is a transport fixture, never DXF topology authority.
  // Exact topology comes from the genuine producer above and saved geometry from the real compiler.
  const semantic = semanticDocument(row, 4);
  semantic.persistence.pieceLineKeys = ['piece-front', 'piece-back'];
  semantic.persistence.pattern.sizeId = 7;
  semantic.persistence.card.observedLockVersion = row.cardLockVersion - 1;
  semantic.persistence.card.previousLockVersion = row.cardLockVersion - 2;
  const outer = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings: { row, serverAssemblyRevision, assemblyTopologySha256 },
    expectedPreviousSidecarSha256: null,
    semanticProductV1Bytes: bytesOf(semantic),
    exactTopologyBytes: encodedExact.bytes,
    placementV2Bytes: null,
  });
  if (!outer.ok) throw new Error(outer.blockers[0].detail);
  const encoded = encodePatternImportDxfProductCompositeSidecarV3(outer.owner);
  if (!encoded.ok) throw new Error('Fixture initial Composite encoding failed.');
  let stored: TechCardPatternSemanticSidecar = {
    techCardId: row.techCardId,
    patternLineKey: row.patternLineKey,
    dxfSha256: row.sha256,
    patternVersion: 4,
    postSaveReceiptSha256: semantic.persistence.receiptSealSha256,
    cardLockVersion: row.cardLockVersion,
    savedRowRevision: row.revision,
    sidecarSha256: encoded.canonicalSha256,
    mediaType: outer.document.mediaType,
    byteLength: encoded.bytes.length,
    sidecarBytes: base64(encoded.bytes),
    createdAt: undefined,
    createdBy: undefined,
  };
  let snapshotReads = 0;
  let sidecarReads = 0;
  let writes = 0;
  let observedPlacement: unknown = null;
  let placementSaved = false;
  const sourceIdentity = (request: GetTechCardPatternSemanticSidecarRequest) => {
    if (request.techCardId !== row.techCardId || request.patternLineKey !== row.patternLineKey)
      throw new Error('Fixture requested another saved row.');
  };
  const rpcSnapshot = () => ({
    row: { ...row, savedRowRevision: row.revision, patternVersion: 4, downloadUrl: row.url },
    selectedOperationNumber,
    serverAssemblyRevision,
    assemblyTopologySha256,
    topologyCanonicalJson: base64(
      new TextEncoder().encode(
        canonicalizePatternImportDxfPhaseESavedAssemblyValueV1(adapted.existingAssembly),
      ),
    ),
    operations: seed.assembly.ops.map((operation) => ({
      operationNumber: operation.number,
      work: operation.work,
      inputKeys: operation.inputKeys,
      outputUnitKey: operation.outputUnitKey,
      outputUnitName: operation.outputUnitName,
      seamKeys: operation.seamKeys ?? [],
    })),
    selectedSeams: seed.assembly.seams.map((seam) => {
      if (!('sideA' in seam)) throw new Error('Fixture requires the authored exact seam rows.');
      const side = (anchors: typeof seam.sideA) => ({
        parts: anchors.map((anchor) => ({
          pieceLineKey: anchor.pieceLineKey,
          edgeHint: anchor.edgeHint,
          rangeFrom: anchor.range[0],
          rangeTo: anchor.range[1],
          lenMm: anchor.lenMm,
          contourSig: anchor.contourSig,
          samples: anchor.samples.map(([u, v]) => ({ u, v })),
          ...(anchor.layer ? { layer: `TECH_CARD_SEAM_LAYER_${anchor.layer.toUpperCase()}` } : {}),
        })),
      });
      return {
        seamKey: seam.seamKey,
        status: 'TECH_CARD_SEAM_STATUS_CONFIRMED',
        stale: seam.stale,
        kind: `TECH_CARD_SEAM_KIND_${seam.kind.toUpperCase()}`,
        direction: `TECH_CARD_SEAM_DIRECTION_${seam.direction.toUpperCase()}`,
        source: `TECH_CARD_SEAM_SOURCE_${seam.source.toUpperCase()}`,
        anchoredSize: seam.anchoredSize,
        sideA: side(seam.sideA),
        sideB: side(seam.sideB),
      };
    }),
    semanticSidecar: stored,
  });
  return Object.freeze({
    async GetTechCardSavedAssemblySnapshot(request: GetTechCardSavedAssemblySnapshotRequest) {
      sourceIdentity(request);
      if (
        request.expectedScopeKey !== row.scopeKey ||
        request.expectedSavedRowRevision !== row.revision ||
        request.expectedCardLockVersion !== row.cardLockVersion ||
        request.expectedUrl !== row.url ||
        request.expectedSizeBytes !== row.sizeBytes ||
        request.expectedSha256 !== row.sha256 ||
        request.selectedOperationNumber !== selectedOperationNumber ||
        (request.expectedServerAssemblyRevision !== undefined &&
          request.expectedServerAssemblyRevision !== serverAssemblyRevision) ||
        (request.expectedAssemblyTopologySha256 !== undefined &&
          request.expectedAssemblyTopologySha256 !== assemblyTopologySha256)
      )
        throw new Error('Fixture transactional snapshot binding changed.');
      snapshotReads += 1;
      return structuredClone(rpcSnapshot());
    },
    async GetTechCardPatternSemanticSidecar(request: GetTechCardPatternSemanticSidecarRequest) {
      sourceIdentity(request);
      sidecarReads += 1;
      return { semanticSidecar: structuredClone(stored) };
    },
    async PutTechCardPatternSemanticSidecar(request: PutTechCardPatternSemanticSidecarRequest) {
      sourceIdentity(request);
      if (
        request.expectedPreviousSidecarSha256 !== stored.sidecarSha256 ||
        request.expectedDxfSha256 !== row.sha256 ||
        request.expectedPatternVersion !== 4 ||
        request.expectedPostSaveReceiptSha256 !== stored.postSaveReceiptSha256 ||
        request.expectedCardLockVersion !== row.cardLockVersion ||
        request.expectedSavedRowRevision !== row.revision ||
        request.expectedServerAssemblyRevision !== serverAssemblyRevision ||
        request.expectedAssemblyTopologySha256 !== assemblyTopologySha256 ||
        request.selectedOperationNumber !== selectedOperationNumber ||
        !request.sidecarBytes
      )
        throw new Error('Fixture Composite CAS refused changed bindings.');
      const bytes = unbase64(request.sidecarBytes);
      const decoded = await decodePatternImportDxfProductCompositeSidecarV3(bytes);
      if (
        !decoded.ok ||
        !decoded.observedPlacementDocument ||
        decoded.placementDocument !== null ||
        decoded.seal.canonicalSha256 !== request.sidecarSha256 ||
        request.mediaType !== outer.document.mediaType
      )
        throw new Error('Fixture refuses an invalid Composite placement write.');
      // Recheck after asynchronous decoding so two concurrent callers cannot both win one CAS.
      if (request.expectedPreviousSidecarSha256 !== stored.sidecarSha256)
        throw new Error('Fixture Composite CAS changed while bytes were verified.');
      stored = {
        ...stored,
        sidecarBytes: request.sidecarBytes,
        sidecarSha256: request.sidecarSha256,
        byteLength: bytes.length,
        mediaType: request.mediaType,
      };
      observedPlacement = structuredClone(decoded.observedPlacementDocument);
      writes += 1;
      placementSaved = true;
      return { semanticSidecar: structuredClone(stored) };
    },
    stats: () => ({
      fixtureStorageOnly: true as const,
      observedPlacement: structuredClone(observedPlacement),
      snapshotReads,
      sidecarReads,
      writes,
      placementSaved,
      initialOuterSha256: encoded.canonicalSha256,
      currentOuterSha256: stored.sidecarSha256,
    }),
  });
}

export function installSavedObservedProductTransportV1(fixture: Fixture) {
  active = fixture;
}

/** Every other service method fails closed; this harness can never reach a remote backend. */
export function abortableAdminService(signal: AbortSignal) {
  const gate = () => {
    if (signal.aborted) throw new DOMException('Fixture RPC cancelled.', 'AbortError');
    if (!active) throw new Error('Fixture storage is not installed.');
    return active;
  };
  return {
    GetTechCardSavedAssemblySnapshot: async (request: GetTechCardSavedAssemblySnapshotRequest) => {
      const result = await gate().GetTechCardSavedAssemblySnapshot(request);
      gate();
      return result;
    },
    GetTechCardPatternSemanticSidecar: async (
      request: GetTechCardPatternSemanticSidecarRequest,
    ) => {
      const result = await gate().GetTechCardPatternSemanticSidecar(request);
      gate();
      return result;
    },
    PutTechCardPatternSemanticSidecar: async (
      request: PutTechCardPatternSemanticSidecarRequest,
    ) => {
      const result = await gate().PutTechCardPatternSemanticSidecar(request);
      gate();
      return result;
    },
  };
}
const unavailable = new Proxy(
  {},
  {
    get: (_, name) => () => {
      throw new Error(`Unexpected fixture RPC: ${String(name)}`);
    },
  },
);
export const adminService = new Proxy(
  {
    async ListModels() {
      modelListReads += 1;
      return { models: [readFixtureObservedModelV1()], total: 1 };
    },
    async GetModel(request: { id?: number }) {
      if (request.id !== fixtureModel.id) throw new Error('Unexpected fixture model identity.');
      freshModelReads += 1;
      return { model: readFixtureObservedModelV1() };
    },
  },
  {
    get: (target, name) =>
      name in target ? Reflect.get(target, name) : Reflect.get(unavailable, name),
  },
);
export const authService = unavailable;
export const frontendService = unavailable;
export const requestHandler = () => {
  throw new Error('Remote requests are disabled in this fixture.');
};
