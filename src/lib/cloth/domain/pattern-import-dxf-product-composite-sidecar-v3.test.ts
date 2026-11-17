import { describe, expect, it } from 'vitest';

import type { DxfProductSavedRowIdentityV1 } from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3,
  preparePatternImportDxfProductCompositeSidecarPersistenceV3,
} from './pattern-import-dxf-product-composite-sidecar-persistence-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductExactTopologyComponentV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
} from './pattern-import-dxf-product-composite-sidecar-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2,
  buildPatternImportDxfProductMultiseamPlacementSidecarV2,
  encodePatternImportDxfProductMultiseamPlacementSidecarV2,
  type PatternImportDxfProductMultiseamPlacementSidecarRequestV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_REQUEST_V1,
  buildPatternImportDxfProductPhaseEExactTopologyBindingV1,
  isPatternImportDxfProductPhaseEExactTopologyBindingOwnerV1,
  restorePatternImportDxfProductPhaseEExactTopologySerializedPrefillV1,
} from './pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import { createPatternImportDxfProductPhaseEExactTopologyFixtureV1 } from './pattern-import-dxf-product-phase-e-exact-topology-binding-v1.test-fixture';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from './pattern-import-dxf-product-semantic-sidecar-v1';

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

const bytesOf = (value: unknown): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(canonical(value));

function semanticDocument(row: DxfProductSavedRowIdentityV1, patternVersion = 4) {
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

function placementRequest(): PatternImportDxfProductMultiseamPlacementSidecarRequestV2 {
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

const baseRow: DxfProductSavedRowIdentityV1 = {
  techCardId: 7,
  scopeKey: 'scope:main',
  patternLineKey: 'pattern:main',
  revision: 7,
  cardLockVersion: 12,
  url: 'https://files.example/skirt.dxf',
  sizeBytes: 100,
  sha256: hash('a'),
};

const baseBindings = {
  row: baseRow,
  serverAssemblyRevision: 'assembly-revision:card-7:tx-12',
  assemblyTopologySha256: hash('7'),
} as const;

describe('pattern import DXF product composite sidecar V3', () => {
  it('preserves a historical save receipt under a newer exact outer CAS lock', async () => {
    const bytes = bytesOf(semanticDocument(baseRow));
    const build = (row: DxfProductSavedRowIdentityV1, semanticBytes = bytes) =>
      buildPatternImportDxfProductCompositeSidecarV3({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
        bindings: { ...baseBindings, row },
        expectedPreviousSidecarSha256: hash('9'),
        semanticProductV1Bytes: semanticBytes,
        placementV2Bytes: null,
        exactTopologyBytes: null,
      });
    const current = { ...baseRow, cardLockVersion: baseRow.cardLockVersion + 1 };
    const result = await build(current);
    expect(result.ok ? null : result.blockers).toBeNull();
    if (!result.ok) throw new Error('Historical receipt was rejected.');
    expect(result.document.bindings.row.cardLockVersion).toBe(current.cardLockVersion);
    expect(result.document.writeCas.expectedPreviousSidecarSha256).toBe(hash('9'));
    expect(
      readPatternImportDxfProductCompositeComponentBytesV3(result.owner, 'semantic-product-v1'),
    ).toEqual(bytes);
    const encoded = encodePatternImportDxfProductCompositeSidecarV3(result.owner);
    if (!encoded.ok) throw new Error('Composite encoding failed.');
    expect(await decodePatternImportDxfProductCompositeSidecarV3(encoded.bytes)).toMatchObject({
      ok: true,
    });
    expect(await build({ ...baseRow, cardLockVersion: baseRow.cardLockVersion - 1 })).toMatchObject(
      { ok: false },
    );
    expect(await build({ ...current, sha256: hash('f') })).toMatchObject({ ok: false });
    const malformed = semanticDocument(baseRow);
    malformed.persistence.card.previousLockVersion = malformed.persistence.card.observedLockVersion;
    expect(await build(current, bytesOf(malformed))).toMatchObject({ ok: false });
  });

  it('rejects saved-row revision zero as outside the persisted server contract', async () => {
    const row = { ...baseRow, revision: 0 };
    const result = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: { ...baseBindings, row },
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: bytesOf(semanticDocument(row)),
      placementV2Bytes: null,
      exactTopologyBytes: null,
    });

    expect(result).toMatchObject({
      ok: false,
      document: null,
      blockers: [{ code: 'invalid-input', field: 'request.bindings.row.revision' }],
    });
  });

  it('preserves required V1 bytes, keeps saved-row revision distinct, and never infers placement', async () => {
    const semanticBytes = bytesOf(semanticDocument(baseRow, 4));
    const result = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: baseBindings,
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: semanticBytes,
      placementV2Bytes: null,
      exactTopologyBytes: null,
    });
    expect(result.ok ? null : result.blockers[0]).toBeNull();
    if (!result.ok) return;
    expect(result.document.bindings.row.revision).toBe(7);
    expect(semanticDocument(baseRow, 4).persistence.pattern.version).toBe(4);
    expect(result.placementDocument).toBeNull();
    expect(result.exactTopology).toBeNull();
    expect(result.claims.legacyV1PlacementInferred).toBe(false);
    expect(
      readPatternImportDxfProductCompositeComponentBytesV3(result.owner, 'semantic-product-v1'),
    ).toEqual(semanticBytes);

    const encoded = encodePatternImportDxfProductCompositeSidecarV3(result.owner);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodePatternImportDxfProductCompositeSidecarV3(encoded.bytes);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.seal.canonicalSha256).toBe(result.seal.canonicalSha256);
    expect(decoded.placementDocument).toBeNull();
    expect(
      readPatternImportDxfProductCompositeComponentBytesV3(decoded.owner, 'semantic-product-v1'),
    ).toEqual(semanticBytes);
  });

  it('verifies and exposes optional placement V2 without accepting TechCardSeamPlacement authority', async () => {
    const placement =
      await buildPatternImportDxfProductMultiseamPlacementSidecarV2(placementRequest());
    expect(placement.ok).toBe(true);
    if (!placement.ok) return;
    const encodedPlacement = encodePatternImportDxfProductMultiseamPlacementSidecarV2(
      placement.owner,
    );
    expect(encodedPlacement.ok).toBe(true);
    if (!encodedPlacement.ok) return;
    const result = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: baseBindings,
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: bytesOf(semanticDocument(baseRow)),
      placementV2Bytes: encodedPlacement.bytes,
      exactTopologyBytes: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placementDocument?.bindings.row.revision).toBe(baseRow.revision);
    expect(result.claims.techCardSeamPlacementAcceptedAsPlacementAuthority).toBe(false);
  });

  it('verifies the full exact-topology carrier+seal while refusing to mint a restore owner', async () => {
    const fixture = await createPatternImportDxfProductPhaseEExactTopologyFixtureV1();
    const binding = await buildPatternImportDxfProductPhaseEExactTopologyBindingV1(
      fixture.buildRequest,
    );
    expect(binding.ok).toBe(true);
    if (!binding.ok) return;
    const exact = await encodePatternImportDxfProductExactTopologyComponentV3(binding.owner);
    expect(exact.ok).toBe(true);
    if (!exact.ok) return;
    const result = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: {
        row: fixture.row,
        serverAssemblyRevision: fixture.current.serverAssemblyRevision,
        assemblyTopologySha256: fixture.current.assemblyTopologySha256,
      },
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: bytesOf(semanticDocument(fixture.row)),
      placementV2Bytes: null,
      exactTopologyBytes: exact.bytes,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exactTopology?.carrier).toEqual(binding.carrier);
    expect(result.exactTopology?.seal).toEqual(binding.seal);
    expect(result.exactTopology?.restoreOwner).toBeNull();
    expect(isPatternImportDxfProductPhaseEExactTopologyBindingOwnerV1(result.exactTopology)).toBe(
      false,
    );

    const encodedComposite = encodePatternImportDxfProductCompositeSidecarV3(result.owner);
    expect(encodedComposite.ok).toBe(true);
    if (!encodedComposite.ok) return;
    const decodedComposite = await decodePatternImportDxfProductCompositeSidecarV3(
      encodedComposite.bytes,
    );
    expect(decodedComposite.ok).toBe(true);
    if (!decodedComposite.ok || !decodedComposite.exactTopology) return;
    const restored = await restorePatternImportDxfProductPhaseEExactTopologySerializedPrefillV1({
      schemaVersion:
        PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_REQUEST_V1,
      carrier: decodedComposite.exactTopology.carrier,
      seal: decodedComposite.exactTopology.seal,
      current: fixture.current,
      catalog: fixture.catalog,
      proposal: fixture.proposal,
    });
    expect(restored).toMatchObject({
      ok: true,
      patch: { seams: [{ seamId: 'side-open' }, { seamId: 'side-close' }] },
    });

    const tamperedExact = JSON.parse(new TextDecoder().decode(exact.bytes)) as {
      seal: { canonicalSha256: string };
    };
    tamperedExact.seal.canonicalSha256 = hash('f');
    const rejectedSeal = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: {
        row: fixture.row,
        serverAssemblyRevision: fixture.current.serverAssemblyRevision,
        assemblyTopologySha256: fixture.current.assemblyTopologySha256,
      },
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: bytesOf(semanticDocument(fixture.row)),
      placementV2Bytes: null,
      exactTopologyBytes: bytesOf(tamperedExact),
    });
    expect(rejectedSeal.ok).toBe(false);
    expect(!rejectedSeal.ok && rejectedSeal.blockers[0].code).toBe('exact-topology-seal-mismatch');
  });

  it('fails closed for component binding drift and noncanonical/tampered outer bytes', async () => {
    const wrongRow = { ...baseRow, cardLockVersion: baseRow.cardLockVersion + 1 };
    const drift = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: baseBindings,
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: bytesOf(semanticDocument(wrongRow)),
      placementV2Bytes: null,
      exactTopologyBytes: null,
    });
    expect(drift.ok).toBe(false);
    expect(!drift.ok && drift.blockers[0].code).toBe('component-binding-mismatch');

    const built = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: baseBindings,
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: bytesOf(semanticDocument(baseRow)),
      placementV2Bytes: null,
      exactTopologyBytes: null,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const encoded = encodePatternImportDxfProductCompositeSidecarV3(built.owner);
    if (!encoded.ok) return;
    const document = JSON.parse(new TextDecoder().decode(encoded.bytes)) as Record<string, unknown>;
    (document.components as Array<Record<string, unknown>>)[0]!.sha256 = hash('f');
    const tampered = await decodePatternImportDxfProductCompositeSidecarV3(bytesOf(document));
    expect(tampered.ok).toBe(false);
    expect(!tampered.ok && tampered.blockers[0].code).toBe('component-digest-mismatch');

    const noncanonical = new TextEncoder().encode(` ${new TextDecoder().decode(encoded.bytes)}`);
    const rejected = await decodePatternImportDxfProductCompositeSidecarV3(noncanonical);
    expect(rejected.ok).toBe(false);
    expect(!rejected.ok && rejected.blockers[0].code).toBe('noncanonical-bytes');
  });

  it('prepares only conditional CAS requests for absence and exact byte-preserving V1 upgrade', async () => {
    const semanticBytes = bytesOf(semanticDocument(baseRow));
    const absentBuild = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: baseBindings,
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: semanticBytes,
      placementV2Bytes: null,
      exactTopologyBytes: null,
    });
    expect(absentBuild.ok).toBe(true);
    if (!absentBuild.ok) return;
    const absent = await preparePatternImportDxfProductCompositeSidecarPersistenceV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3,
      currentAuthority: baseBindings,
      current: { status: 'absent', source: 'verified-get-absence' },
      nextOwner: absentBuild.owner,
    });
    expect(absent.ok).toBe(true);
    if (absent.ok) {
      expect(absent.plan.conditionalPut.expectedPreviousSidecarSha256).toBeNull();
      expect(absent.plan.conditionalPut.performed).toBe(false);
      expect(absent.claims.getPerformedByAdapter).toBe(false);
      expect(absent.claims.putPerformedByAdapter).toBe(false);
    }

    const legacyDigest = await crypto.subtle.digest('SHA-256', semanticBytes);
    const legacySha = [...new Uint8Array(legacyDigest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const upgradeBuild = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: baseBindings,
      expectedPreviousSidecarSha256: legacySha,
      semanticProductV1Bytes: semanticBytes,
      placementV2Bytes: null,
      exactTopologyBytes: null,
    });
    expect(upgradeBuild.ok).toBe(true);
    if (!upgradeBuild.ok) return;
    const upgrade = await preparePatternImportDxfProductCompositeSidecarPersistenceV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3,
      currentAuthority: baseBindings,
      current: {
        status: 'present',
        source: 'verified-get',
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
        sha256: legacySha,
        byteLength: semanticBytes.byteLength,
        bytes: semanticBytes,
      },
      nextOwner: upgradeBuild.owner,
    });
    expect(upgrade.ok).toBe(true);
    expect(upgrade.ok && upgrade.plan.verification.observed).toBe('legacy-product-v1');
    expect(upgrade.ok && upgrade.plan.verification.requiredV1BytesPreserved).toBe(true);

    const previousV3 = encodePatternImportDxfProductCompositeSidecarV3(absentBuild.owner);
    expect(previousV3.ok).toBe(true);
    if (!previousV3.ok) return;
    const replacement = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: baseBindings,
      expectedPreviousSidecarSha256: previousV3.canonicalSha256,
      semanticProductV1Bytes: semanticBytes,
      placementV2Bytes: null,
      exactTopologyBytes: null,
    });
    expect(replacement.ok).toBe(true);
    if (!replacement.ok) return;
    const replacePlan = await preparePatternImportDxfProductCompositeSidecarPersistenceV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3,
      currentAuthority: baseBindings,
      current: {
        status: 'present',
        source: 'verified-get',
        mediaType: absentBuild.document.mediaType,
        sha256: previousV3.canonicalSha256,
        byteLength: previousV3.canonicalByteLength,
        bytes: previousV3.bytes,
      },
      nextOwner: replacement.owner,
    });
    expect(replacePlan.ok).toBe(true);
    expect(replacePlan.ok && replacePlan.plan.verification.observed).toBe('composite-v3');
  });

  it('rejects forged owner, stale authority, wrong CAS, changed legacy bytes, and hostile crypto', async () => {
    const semanticBytes = bytesOf(semanticDocument(baseRow));
    const legacyDigest = await crypto.subtle.digest('SHA-256', semanticBytes);
    const legacySha = [...new Uint8Array(legacyDigest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const built = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: baseBindings,
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: semanticBytes,
      placementV2Bytes: null,
      exactTopologyBytes: null,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(encodePatternImportDxfProductCompositeSidecarV3({ ...built.owner }).ok).toBe(false);

    const stale = await preparePatternImportDxfProductCompositeSidecarPersistenceV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3,
      currentAuthority: { ...baseBindings, serverAssemblyRevision: 'assembly-revision:stale' },
      current: { status: 'absent', source: 'verified-get-absence' },
      nextOwner: built.owner,
    });
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.blockers[0].code).toBe('authority-binding-mismatch');

    const wrongCas = await preparePatternImportDxfProductCompositeSidecarPersistenceV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3,
      currentAuthority: baseBindings,
      current: {
        status: 'present',
        source: 'verified-get',
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
        sha256: legacySha,
        byteLength: semanticBytes.byteLength,
        bytes: semanticBytes,
      },
      nextOwner: built.owner,
    });
    expect(wrongCas.ok).toBe(false);
    expect(!wrongCas.ok && wrongCas.blockers[0].code).toBe('cas-expectation-mismatch');

    const changedDocument = semanticDocument(baseRow);
    changedDocument.product.phaseEPlanSha256 = hash('4');
    const changedBuild = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: baseBindings,
      expectedPreviousSidecarSha256: legacySha,
      semanticProductV1Bytes: bytesOf(changedDocument),
      placementV2Bytes: null,
      exactTopologyBytes: null,
    });
    expect(changedBuild.ok).toBe(true);
    if (!changedBuild.ok) return;
    const changedUpgrade = await preparePatternImportDxfProductCompositeSidecarPersistenceV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3,
      currentAuthority: baseBindings,
      current: {
        status: 'present',
        source: 'verified-get',
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
        sha256: legacySha,
        byteLength: semanticBytes.byteLength,
        bytes: semanticBytes,
      },
      nextOwner: changedBuild.owner,
    });
    expect(changedUpgrade.ok).toBe(false);
    expect(!changedUpgrade.ok && changedUpgrade.blockers[0].code).toBe(
      'required-v1-bytes-not-preserved',
    );

    const hostileCrypto = {
      subtle: {
        digest: async () => new Uint8Array(32).buffer,
      },
    } as unknown as Pick<Crypto, 'subtle'>;
    const hostile = await buildPatternImportDxfProductCompositeSidecarV3(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
        bindings: baseBindings,
        expectedPreviousSidecarSha256: null,
        semanticProductV1Bytes: semanticBytes,
        placementV2Bytes: null,
        exactTopologyBytes: null,
      },
      hostileCrypto,
    );
    expect(hostile.ok).toBe(false);
    expect(!hostile.ok && hostile.blockers[0].code).toBe('sha256-unavailable');

    let getterReads = 0;
    const accessorRequest = {
      bindings: baseBindings,
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: semanticBytes,
      placementV2Bytes: null,
      exactTopologyBytes: null,
    } as Record<string, unknown>;
    Object.defineProperty(accessorRequest, 'schemaVersion', {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3;
      },
    });
    const accessor = await buildPatternImportDxfProductCompositeSidecarV3(accessorRequest);
    expect(accessor.ok).toBe(false);
    expect(getterReads).toBe(0);
  });
});
