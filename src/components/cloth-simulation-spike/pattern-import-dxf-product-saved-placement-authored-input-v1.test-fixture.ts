import { computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-assembly-topology-hash-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type {
  PatternImportDxfProductGarmentMeshComposerProjectionV2,
  PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-mapping-composition-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
  readPatternImportDxfProductMultiseamPlacementSidecarV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2,
  buildPatternImportDxfProductMultiseamPlacementSidecarV2,
  encodePatternImportDxfProductMultiseamPlacementSidecarV2,
  type PatternImportDxfProductMultiseamPlacementSidecarRequestV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';

import type { PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1 } from './pattern-import-dxf-product-saved-canonical-medium-authored-input-contract-v1';

/** Explicit test authoring only; production consumers must receive the verified persisted owner. */
export async function createPatternImportDxfProductSavedPlacementRequestV1Fixture(input: {
  composerSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
  composerProjection: PatternImportDxfProductGarmentMeshComposerProjectionV2;
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  savedRow: DxfProductSavedRowIdentityV1;
  authored: PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1;
}): Promise<PatternImportDxfProductMultiseamPlacementSidecarRequestV2> {
  const snapshot = input.composerSnapshot;
  const { semantics, frame } = input.authored;
  const composition = await buildPatternImportDxfProductMultiseamMappingCompositionV2(
    input.compositionRequest,
  );
  if (!composition.ok) throw new Error(JSON.stringify(composition.blockers));
  if (
    composition.compositionSeal.canonicalSha256 !== snapshot.seals.compositionCanonicalSha256 ||
    input.composerProjection.composerCanonicalSha256 !== snapshot.seal.canonicalSha256 ||
    input.savedRow.sha256 !== snapshot.row.dxfSha256
  )
    throw new Error('Placement fixture source differs from the genuine saved compilation.');
  const fixtureHash = (domain: string, value: unknown) =>
    computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1(
      `saved-placement-test-fixture:${domain}`,
      value,
    );
  const pieceLineKeys = snapshot.assembly.pieceIds.map((pieceId) => {
    const piece = input.compositionRequest.catalog.pieces.find(
      (entry) => entry.pieceId === pieceId,
    );
    if (!piece) throw new Error('Exact fixture piece has no catalog line identity.');
    return piece.pieceLineKey;
  }) as [string, string];
  const parameters: PatternImportDxfProductMultiseamPlacementSidecarRequestV2['placementAuthoring']['annular']['parameters'] =
    {
      id: semantics.policy.mapping.id,
      revision: semantics.policy.mapping.revision,
      units: { planar: 'mm', body: 'm', angle: 'rad' },
      waistReferenceColliderId: 'waist-collider',
      seamAnchor: { seamId: semantics.garment.leftSeamId, bodyAngleRad: frame.seamAnchorAngleRad },
      pieces: frame.pieces.map((piece) => ({
        pieceId: piece.pieceId,
        planarApexMm: [...piece.planarApexMm],
        planarStartRayUnit2: [
          piece.planarMirrorSign * Math.cos(frame.sectorSpanRadPerPiece),
          piece.planarMirrorSign * Math.sin(frame.sectorSpanRadPerPiece),
        ],
        planarAngularDirection: -1,
        planarStartSeamId: semantics.garment.leftSeamId,
        waistSlantRadiusMm: frame.waistSlantRadiusMm,
        hemSlantRadiusMm: frame.hemSlantRadiusMm,
        sectorSpanRad: frame.sectorSpanRadPerPiece,
      })) as unknown as PatternImportDxfProductMultiseamPlacementSidecarRequestV2['placementAuthoring']['annular']['parameters']['pieces'],
      acceptance: {
        id: 'canonical-acceptance',
        revision: 'canonical-acceptance-v1',
        parameterResidualMm: 0.01,
        parameterResidualRad: 0.000001,
        conicalIdentityResidualM: 0.00000001,
        maxAbsEdgeStretchDelta: 0.01,
        maxAbsAreaScaleDelta: 0.02,
        minNormalizedOrientationDot: 0.999,
        maxAbsWarpGreenStrain: 0.01,
        maxAbsWeftGreenStrain: 0.01,
        maxAbsShear: 0.01,
        selfIntersectionPolicyRevision: 'self-intersection-policy-v1',
      },
    };
  const [
    postSaveReceiptSha256,
    assemblyTopologySha256,
    originalSemantics,
    originalParameters,
    originalAcceptance,
  ] = await Promise.all([
    fixtureHash('post-save-receipt', input.savedRow),
    fixtureHash('assembly-topology', input.compositionRequest.proposal),
    fixtureHash('explicit-semantics', semantics),
    fixtureHash('explicit-parameters', parameters),
    fixtureHash('explicit-acceptance', parameters.acceptance),
  ]);
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2,
    bindings: {
      row: {
        techCardId: snapshot.row.techCardId,
        cardLockVersion: snapshot.row.cardLockVersion,
        scopeKey: snapshot.row.scopeKey,
        patternLineKey: snapshot.row.patternLineKey,
        patternUrl: input.savedRow.url,
        patternVersion: snapshot.row.patternVersion,
        revision: input.savedRow.revision,
        sizeId: 0,
        sizeToken: input.compositionRequest.catalog.sizeToken,
        dxfSha256: snapshot.row.dxfSha256,
        postSaveReceiptSha256,
      },
      source: {
        sourceFileSha256: snapshot.seals.sourceFileSha256,
        writerExportSha256: snapshot.seals.productExportSha256,
        handoffSourceAggregateSha256: snapshot.seals.handoffSourceAggregateSha256,
        selectedGeometrySha256: composition.aggregate.sourceBinding.baseFinalCoordinateSha256,
        sizeSelectionSha256: snapshot.seals.sizeSelectionSha256,
        catalogCanonicalSha256: snapshot.seals.catalogCanonicalSha256,
        proposalFingerprint: snapshot.seals.proposalFingerprint,
        phaseEPlanSha256: snapshot.seals.phaseEPlanSha256,
        mappingCompositionSha256: snapshot.seals.compositionCanonicalSha256,
        handoffCanonicalSha256: snapshot.seals.handoffCanonicalSha256,
        aggregateCanonicalSha256: snapshot.seals.aggregateCanonicalSha256,
        phase2ArtifactSha256: snapshot.seals.phase2ArtifactSha256,
      },
      topology: {
        assemblyTopologySha256,
        ...snapshot.assembly,
        pieceLineKeys,
        seamKeys: [...snapshot.assembly.seamIds],
      },
    },
    placementAuthoring: {
      authoredOrigin: 'verified-saved-row',
      authoredImportGeneration: snapshot.row.importGeneration,
      semantics: {
        schemaVersion: 'dxf-product-two-panel-skirt-placement-semantics-request/1',
        originalCanonicalSha256: originalSemantics,
        garment: semantics.garment,
        body: semantics.body,
        policy: semantics.policy,
      },
      annular: {
        schemaVersion: 'dxf-product-two-panel-skirt-annular-mapping-parameters-request/1',
        originalCanonicalSha256: originalParameters,
        originalMappingParametersSha256: originalParameters,
        originalAcceptancePolicySha256: originalAcceptance,
        parameters,
      },
    },
  };
}

/** Browser-safe fixture backend: stores encoded bytes, then invokes the real fresh-GET verifier. */
export async function readPatternImportDxfProductSavedPlacementV1Fixture(
  request: PatternImportDxfProductMultiseamPlacementSidecarRequestV2,
  dxfSizeBytes = 1_024,
) {
  const built = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(request);
  if (!built.ok) throw new Error(JSON.stringify(built.blockers));
  const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV2(built.owner);
  if (!encoded.ok) throw new Error(encoded.code);
  const row = built.document.bindings.row;
  const expectedRow = {
    techCardId: row.techCardId,
    scopeKey: row.scopeKey,
    patternLineKey: row.patternLineKey,
    revision: row.revision,
    cardLockVersion: row.cardLockVersion,
    url: row.patternUrl,
    sizeBytes: dxfSizeBytes,
    sha256: row.dxfSha256,
  };
  let binary = '';
  for (const byte of encoded.bytes) binary += String.fromCharCode(byte);
  const persistedBytes = btoa(binary);
  let getCount = 0;
  const result = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
      expectedRow,
      expectedBindings: built.document.bindings,
    },
    {
      getSidecar: async () => {
        getCount += 1;
        return {
          status: 'found',
          row: {
            techCardId: row.techCardId,
            patternLineKey: row.patternLineKey,
            dxfSha256: row.dxfSha256,
            patternVersion: row.patternVersion,
            sidecarSha256: encoded.canonicalSha256,
            mediaType: built.document.mediaType,
            byteLength: encoded.canonicalByteLength,
            sidecarBytes: persistedBytes,
            postSaveReceiptSha256: row.postSaveReceiptSha256,
            cardLockVersion: row.cardLockVersion,
            savedRowRevision: row.revision,
            createdAt: undefined,
            createdBy: 'explicit-test-authoring',
          },
        };
      },
      readCurrentEvidence: async () => ({
        row: expectedRow,
        topology: built.document.bindings.topology,
      }),
    },
  );
  if (!result.ok || result.compatibility !== 'placement-v2' || getCount !== 1)
    throw new Error(JSON.stringify(result.blockers));
  return result.owner;
}
