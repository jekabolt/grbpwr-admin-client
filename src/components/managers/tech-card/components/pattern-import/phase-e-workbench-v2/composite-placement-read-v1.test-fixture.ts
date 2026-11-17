// Synthetic storage-envelope fixtures only; these do not establish garment or body readiness.
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2,
  type PatternImportDxfProductMultiseamPlacementSidecarRequestV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2,
  type PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2,
} from './exact-n-seam-authority-gap-v2';

const hash = (character: string): string => character.repeat(64);

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`;
}

export const bytesOf = (value: unknown): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(canonical(value));

export function semanticDocument(row: DxfProductSavedRowIdentityV1, patternVersion = 4) {
  const sample = (ordinal: number, progress: number) => ({
    ordinal,
    vertexId: `vertex-${ordinal}`,
    sourceCurveId: 'curve-1',
    parameterSpace: 'unit',
    sourceCurveT: progress,
    contourNormalizedArc: progress,
    normalizedProgress: progress,
  });
  const side = (sideIndex: 0 | 1, pieceId: string) => ({
    sideIndex,
    pieceId,
    contourId: `${pieceId}-contour`,
    sourcePathId: sideIndex + 1,
    authoredAnchors: [`${pieceId}-start`, `${pieceId}-end`],
    direction: sideIndex === 0 ? 'forward' : 'reverse',
    reversed: sideIndex === 1,
    contourTraversal: 'increasing-index',
    orderedSamples: [sample(0, 0), sample(1, 1)],
    lengthMm: 100,
    endpointResidualMm: 0,
  });
  return {
    schemaVersion: 'pattern-import-dxf-product-semantic-sidecar-document/1',
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
    encoding: 'canonical-json-utf8',
    product: {
      writerReceiptVersion: 'pattern-import-dxf-product-writer-replay-receipt/1',
      writerId: 'grbpwr.pattern-import.writeDxfDetailed',
      writerDialect: 'r12',
      format: 'AAMA-DXF-AC1009',
      scopeKey: row.scopeKey,
      exportSha256: row.sha256,
      byteLength: row.sizeBytes,
      phaseEPlanSha256: hash('b'),
      sizeSelectionSha256: hash('c'),
      mappingCompositionSealSha256: hash('d'),
    },
    mapping: {
      version: 'pattern-import-dxf-two-sided-seam-mapping/2',
      sealSha256: hash('e'),
      artifact: {
        schemaVersion: 'pattern-import-dxf-two-sided-seam-mapping/2',
        baseWitnessVersion: 'pattern-import-dxf-two-sided-seam-mapping/1',
        sourceBinding: {
          sourceFileId: 'source-file',
          documentId: 'document',
          revision: 'r1',
          baseFinalCoordinateSha256: hash('f'),
          sourcePathCoordinateSha256: hash('1'),
          handoffCanonicalSha256: hash('2'),
        },
        scope: { scopeId: row.scopeKey, pieceIds: ['front', 'back'] },
        seam: {
          id: 'left',
          operationId: 'operation-1',
          mapping: 'equal',
          lengthRatio: 1,
          sides: [side(0, 'front'), side(1, 'back')],
        },
        compatibility: {
          endpointToleranceMm: 0.1,
          maximumEndpointResidualMm: 0,
          fullLengthToleranceMm: 0.1,
          fullLengthToleranceRelative: 0.01,
          effectiveFullLengthToleranceMm: 1,
          fullLengthResidualMm: 0,
          fullLengthResidualRelative: 0,
          endpointsCompatible: true,
          fullLengthsCompatible: true,
        },
      },
    },
    persistence: {
      receiptVersion: 'pattern-import-dxf-product-post-save-readback-receipt/1',
      receiptSealVersion: 'pattern-import-dxf-product-post-save-readback-seal/1',
      receiptSealSha256: hash('3'),
      card: {
        techCardId: row.techCardId,
        previousLockVersion: Math.max(0, row.cardLockVersion - 1),
        observedLockVersion: row.cardLockVersion,
      },
      pattern: {
        lineKey: row.patternLineKey,
        url: row.url,
        scopeKey: row.scopeKey,
        sizeId: 0,
        version: patternVersion,
        sha256: row.sha256,
      },
      pieceLineKeys: ['line:front', 'line:back'],
      aliases: [],
    },
  };
}

function selection(id: string) {
  return {
    contourId: `${id}-contour`,
    sourceCurveIds: [`${id}-curve`] as [string],
    boundaryVertexIndices: [0, 1] as [number, number],
  };
}

export function placementRequest(): PatternImportDxfProductMultiseamPlacementSidecarRequestV2 {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2,
    bindings: {
      row: {
        techCardId: 7,
        cardLockVersion: 12,
        scopeKey: 'scope:main',
        patternLineKey: 'pattern:main',
        patternUrl: 'https://files.example/skirt.dxf',
        patternVersion: 4,
        revision: 7,
        sizeId: 0,
        sizeToken: 'M',
        dxfSha256: hash('a'),
        postSaveReceiptSha256: hash('b'),
      },
      source: {
        sourceFileSha256: hash('c'),
        writerExportSha256: hash('a'),
        handoffSourceAggregateSha256: hash('d'),
        selectedGeometrySha256: hash('e'),
        sizeSelectionSha256: hash('f'),
        catalogCanonicalSha256: hash('1'),
        proposalFingerprint: 'pidpemsv2-fnv1a64:0123456789abcdef',
        phaseEPlanSha256: hash('2'),
        mappingCompositionSha256: hash('3'),
        handoffCanonicalSha256: hash('4'),
        aggregateCanonicalSha256: hash('5'),
        phase2ArtifactSha256: hash('6'),
      },
      topology: {
        assemblyTopologySha256: hash('7'),
        documentId: 'assembly:skirt',
        revision: 'assembly-r3',
        sourceOperationNumber: 120,
        localOperationOrder: 0,
        pieceLineKeys: ['line:front', 'line:back'],
        pieceIds: ['front', 'back'],
        seamKeys: ['seam-key:left', 'seam-key:right'],
        seamIds: ['left', 'right'],
      },
    },
    placementAuthoring: {
      authoredOrigin: 'verified-saved-row',
      authoredImportGeneration: 8,
      semantics: {
        schemaVersion: 'dxf-product-two-panel-skirt-placement-semantics-request/1',
        originalCanonicalSha256: hash('8'),
        garment: {
          kind: 'two-panel-skirt',
          frontPieceId: 'front',
          backPieceId: 'back',
          leftSeamId: 'left',
          rightSeamId: 'right',
          circumferentialOrder: {
            direction: 'clockwise-seen-from-above',
            pieceIds: ['front', 'back'],
          },
          boundaries: [
            {
              pieceId: 'front',
              waist: selection('front-waist'),
              hem: selection('front-hem'),
              leftSeam: selection('front-left'),
              rightSeam: selection('front-right'),
            },
            {
              pieceId: 'back',
              waist: selection('back-waist'),
              hem: selection('back-hem'),
              leftSeam: selection('back-left'),
              rightSeam: selection('back-right'),
            },
          ],
        },
        body: {
          providerId: 'provider',
          providerRevision: 'provider-r1',
          bodyId: 'body',
          bodyRevision: 'body-r1',
          poseKind: 'A',
          poseRevision: 'pose-r1',
          collisionLodId: 'collision-lod',
          landmarks: {
            revision: 'landmarks-r1',
            waistCenterId: 'waist-center',
            hipLeftId: 'hip-left',
            hipRightId: 'hip-right',
          },
        },
        policy: {
          id: 'placement-policy',
          revision: 'placement-r1',
          mapping: {
            kind: 'authored-annular-sector-conical',
            id: 'annular-map',
            revision: 'annular-r1',
          },
          authoredClearanceM: 0.01,
          clothThicknessM: 0.001,
          retention: {
            id: 'waist-support',
            revision: 'support-r1',
            kind: 'waist-boundary-support',
          },
        },
      },
      annular: {
        schemaVersion: 'dxf-product-two-panel-skirt-annular-mapping-parameters-request/1',
        originalCanonicalSha256: hash('9'),
        originalMappingParametersSha256: hash('0'),
        originalAcceptancePolicySha256: hash('a'),
        parameters: {
          id: 'annular-map',
          revision: 'annular-r1',
          units: { planar: 'mm', body: 'm', angle: 'rad' },
          waistReferenceColliderId: 'waist-collider',
          seamAnchor: { seamId: 'left', bodyAngleRad: 0 },
          pieces: [
            {
              pieceId: 'front',
              planarApexMm: [0, 0],
              planarStartRayUnit2: [1, 0],
              planarAngularDirection: 1,
              planarStartSeamId: 'left',
              waistSlantRadiusMm: 200,
              hemSlantRadiusMm: 500,
              sectorSpanRad: 1.5,
            },
            {
              pieceId: 'back',
              planarApexMm: [10, 20],
              planarStartRayUnit2: [0, 1],
              planarAngularDirection: -1,
              planarStartSeamId: 'left',
              waistSlantRadiusMm: 210,
              hemSlantRadiusMm: 510,
              sectorSpanRad: 1.5,
            },
          ],
          acceptance: {
            id: 'acceptance',
            revision: 'acceptance-r1',
            parameterResidualMm: 0.1,
            parameterResidualRad: 0.001,
            conicalIdentityResidualM: 0.001,
            maxAbsEdgeStretchDelta: 0.1,
            maxAbsAreaScaleDelta: 0.1,
            minNormalizedOrientationDot: 0.5,
            maxAbsWarpGreenStrain: 0.1,
            maxAbsWeftGreenStrain: 0.1,
            maxAbsShear: 0.1,
            selfIntersectionPolicyRevision: 'self-intersection-r1',
          },
        },
      },
    },
  };
}

export const baseRow: DxfProductSavedRowIdentityV1 = {
  techCardId: 7,
  scopeKey: 'scope:main',
  patternLineKey: 'pattern:main',
  revision: 7,
  cardLockVersion: 12,
  url: 'https://files.example/skirt.dxf',
  sizeBytes: 100,
  sha256: hash('a'),
};

export const baseBindings = {
  row: baseRow,
  serverAssemblyRevision: 'assembly-revision:card-7:tx-12',
  assemblyTopologySha256: hash('7'),
} as const;

export function candidate(seamCount: number): PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2 {
  const seamIds = Array.from({ length: seamCount }, (_, index) => `seam:${index + 1}`);
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2,
    status: 'untrusted-authority-candidate',
    row: baseBindings.row,
    serverAssemblyRevision: baseBindings.serverAssemblyRevision,
    assemblyTopologySha256: baseBindings.assemblyTopologySha256,
    selectedOperation: {
      sourceOperationNumber: 120,
      authoringOperationId: 'operation:side-seams',
      localOperationOrder: 0,
      seamIds,
    },
    catalogCanonicalSha256: hash('5'),
    phaseEAggregatePlanSha256: hash('6'),
    sides: seamIds.flatMap((seamId, index) => [
      {
        seamId,
        sideIndex: 0 as const,
        pieceLineKey: `line:${index}:front`,
        pieceId: `piece:${index}:front`,
        contourId: `contour:${index}:front`,
        boundaryVertexIds: [`vertex:${index}:front:0`, `vertex:${index}:front:1`] as const,
        direction: 'forward' as const,
      },
      {
        seamId,
        sideIndex: 1 as const,
        pieceLineKey: `line:${index}:back`,
        pieceId: `piece:${index}:back`,
        contourId: `contour:${index}:back`,
        boundaryVertexIds: [`vertex:${index}:back:0`, `vertex:${index}:back:1`] as const,
        direction: 'reverse' as const,
      },
    ]),
  };
}
