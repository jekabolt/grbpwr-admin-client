import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { TechCardPatternSemanticSidecar } from 'api/proto-http/admin';

import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
  isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2,
  readPatternImportDxfProductMultiseamPlacementSidecarV2,
  type PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2,
  type PatternImportDxfProductMultiseamPlacementSidecarReadHostV2,
  type PatternImportDxfProductMultiseamPlacementSidecarReadRequestV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2,
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2,
  buildPatternImportDxfProductMultiseamPlacementSidecarV2,
  encodePatternImportDxfProductMultiseamPlacementSidecarV2,
  type PatternImportDxfProductMultiseamPlacementSidecarRequestV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from './pattern-import-dxf-product-semantic-sidecar-v1';

const hash = (character: string): string => character.repeat(64);

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
        revision: 0,
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

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function legacyDocument(): Record<string, unknown> {
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
      scopeKey: 'scope:main',
      exportSha256: hash('a'),
      byteLength: 100,
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
        scope: { scopeId: 'scope:main', pieceIds: ['front', 'back'] },
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
      card: { techCardId: 7, previousLockVersion: 10, observedLockVersion: 11 },
      pattern: {
        lineKey: 'pattern:main',
        url: 'https://files.example/skirt.dxf',
        scopeKey: 'scope:main',
        sizeId: 0,
        version: 4,
        sha256: hash('a'),
      },
      pieceLineKeys: ['line:front', 'line:back'],
      aliases: [],
    },
  };
}

type Fixture = Readonly<{
  request: PatternImportDxfProductMultiseamPlacementSidecarReadRequestV2;
  evidence: PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2;
  envelope: TechCardPatternSemanticSidecar;
}>;

let fixture: Fixture;

beforeAll(async () => {
  const built = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(placementRequest());
  if (!built.ok) throw new Error(`fixture build failed: ${built.blockers[0].code}`);
  const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV2(built.owner);
  if (!encoded.ok) throw new Error('fixture encode failed');
  const expectedRow = {
    techCardId: built.document.bindings.row.techCardId,
    scopeKey: built.document.bindings.row.scopeKey,
    patternLineKey: built.document.bindings.row.patternLineKey,
    revision: built.document.bindings.row.revision,
    cardLockVersion: built.document.bindings.row.cardLockVersion,
    url: built.document.bindings.row.patternUrl,
    sizeBytes: 1_024,
    sha256: built.document.bindings.row.dxfSha256,
  };
  const request = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
    expectedRow,
    expectedBindings: built.document.bindings,
  };
  fixture = {
    request,
    evidence: { row: expectedRow, topology: built.document.bindings.topology },
    envelope: {
      techCardId: built.document.bindings.row.techCardId,
      patternLineKey: built.document.bindings.row.patternLineKey,
      dxfSha256: built.document.bindings.row.dxfSha256,
      patternVersion: built.document.bindings.row.patternVersion,
      savedRowRevision: built.document.bindings.row.revision,
      sidecarSha256: encoded.canonicalSha256,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2,
      byteLength: encoded.canonicalByteLength,
      sidecarBytes: toBase64(encoded.bytes),
      postSaveReceiptSha256: built.document.bindings.row.postSaveReceiptSha256,
      createdAt: undefined,
      createdBy: 'fixture',
      cardLockVersion: built.document.bindings.row.cardLockVersion,
    },
  };
});

function host(
  options: Readonly<{
    envelope?: TechCardPatternSemanticSidecar;
    status?: 'found' | 'absent';
    evidence?: (
      call: number,
    ) => PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2;
    onGet?: () => void;
  }> = {},
): PatternImportDxfProductMultiseamPlacementSidecarReadHostV2 & {
  getSidecar: ReturnType<typeof vi.fn>;
  readCurrentEvidence: ReturnType<typeof vi.fn>;
} {
  let evidenceCall = 0;
  const getSidecar = vi.fn(async () => {
    options.onGet?.();
    return options.status === 'absent'
      ? ({ status: 'absent' } as const)
      : ({ status: 'found', row: options.envelope ?? structuredClone(fixture.envelope) } as const);
  });
  const readCurrentEvidence = vi.fn(async () => {
    evidenceCall += 1;
    return structuredClone(options.evidence?.(evidenceCall) ?? fixture.evidence);
  });
  return { getSidecar, readCurrentEvidence };
}

describe('multiseam placement sidecar verified GET V2', () => {
  it('returns a genuine raw-free V2 read owner after exact pre/post row and topology checks', async () => {
    const readHost = host();
    const result = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      fixture.request,
      readHost,
    );

    expect(result.ok).toBe(true);
    expect(result.compatibility).toBe('placement-v2');
    if (!result.ok || result.compatibility !== 'placement-v2') return;
    expect(
      isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2(result.owner),
    ).toBe(true);
    expect(readHost.getSidecar).toHaveBeenCalledTimes(1);
    expect(readHost.readCurrentEvidence).toHaveBeenCalledTimes(2);
    expect(readHost.getSidecar).toHaveBeenCalledWith(
      { techCardId: 7, patternLineKey: 'pattern:main' },
      expect.any(AbortSignal),
    );
    expect(result.report.row.revision).toBe(0);
    expect(result.owner.document.bindings.row.patternVersion).toBe(4);
    expect(result.claims.savedRevisionUsedAsPatternVersion).toBe(false);
    expect(result.claims.putPerformed).toBe(false);
    expect(result.claims.sidecarPersistedByThisRead).toBe(false);
    expect(result.claims.restoreAuthorityMinted).toBe(false);
    expect(result.claims.previewReady).toBe(false);
    expect(result.claims.runtimeReady).toBe(false);
    expect(result.claims.productionReady).toBe(false);
    expect(result.placementAuthoring.authoredImportGeneration).toBe(8);
    expect(result.claims.authoredImportGenerationIsAuditOnly).toBe(true);
    expect(JSON.stringify(result)).not.toContain(fixture.envelope.sidecarBytes);
    expect(
      isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2({
        ...result.owner,
      }),
    ).toBe(false);
  });

  it('is deterministic and does not let saved revision stand in for patternVersion', async () => {
    const first = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      fixture.request,
      host(),
    );
    const second = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      structuredClone(fixture.request),
      host(),
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.ok && second.ok && first.report).toEqual(second.ok && second.report);
  });

  it('recognizes canonical legacy media but never returns placement authoring or an owner', async () => {
    const bytes = new TextEncoder().encode(canonical(legacyDocument()));
    const digest = Array.from(
      new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    const envelope = structuredClone(fixture.envelope);
    envelope.mediaType = PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1;
    envelope.sidecarSha256 = digest;
    envelope.byteLength = bytes.byteLength;
    envelope.sidecarBytes = toBase64(bytes);

    const result = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      fixture.request,
      host({ envelope }),
    );
    expect(result.ok).toBe(true);
    expect(result.compatibility).toBe('legacy-v1-no-placement');
    expect(result.owner).toBeNull();
    expect(result.placementAuthoring).toBeNull();
    expect(result.claims.legacyPlacementInferred).toBe(false);
    expect(result.claims.restoreAuthorityMinted).toBe(false);
  });

  it('returns an explicit no-authority result for an absent attachment', async () => {
    const readHost = host({ status: 'absent' });
    const result = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      fixture.request,
      readHost,
    );
    expect(result.ok).toBe(true);
    expect(result.compatibility).toBe('absent');
    expect(result.owner).toBeNull();
    expect(result.placementAuthoring).toBeNull();
    expect(readHost.readCurrentEvidence).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'card lock',
      (row: TechCardPatternSemanticSidecar) => (row.cardLockVersion = 99),
      'envelope-invalid',
    ],
    [
      'pattern version',
      (row: TechCardPatternSemanticSidecar) => (row.patternVersion = 0),
      'envelope-invalid',
    ],
    [
      'media',
      (row: TechCardPatternSemanticSidecar) => (row.mediaType = 'application/json'),
      'unsupported-media-type',
    ],
    [
      'length',
      (row: TechCardPatternSemanticSidecar) => (row.byteLength = 1),
      'sidecar-size-invalid',
    ],
    [
      'sha',
      (row: TechCardPatternSemanticSidecar) => (row.sidecarSha256 = hash('f')),
      'sidecar-sha256-mismatch',
    ],
    [
      'base64',
      (row: TechCardPatternSemanticSidecar) => (row.sidecarBytes = '***='),
      'base64-invalid',
    ],
  ])('fails closed on invalid GET %s evidence', async (_name, mutate, code) => {
    const envelope = structuredClone(fixture.envelope);
    mutate(envelope);
    const result = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      fixture.request,
      host({ envelope }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe(code);
    expect(result.owner).toBeNull();
  });

  it('rejects valid V2 bytes whose decoded bindings do not equal current bindings', async () => {
    const original = placementRequest();
    const changed = {
      ...original,
      bindings: {
        ...original.bindings,
        topology: { ...original.bindings.topology, revision: 'assembly-r4' },
      },
    };
    const built = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(changed);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV2(built.owner);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const envelope = structuredClone(fixture.envelope);
    envelope.sidecarSha256 = encoded.canonicalSha256;
    envelope.byteLength = encoded.canonicalByteLength;
    envelope.sidecarBytes = toBase64(encoded.bytes);
    const result = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      fixture.request,
      host({ envelope }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('decoded-binding-mismatch');
  });

  it.each([
    [
      'row before GET',
      1,
      (value: PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2) => ({
        ...value,
        row: { ...value.row, revision: 1 },
      }),
      'row-stale-before-get',
    ],
    [
      'topology before GET',
      1,
      (value: PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2) => ({
        ...value,
        topology: { ...value.topology, revision: 'assembly-r4' },
      }),
      'topology-stale-before-get',
    ],
    [
      'row after decode',
      2,
      (value: PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2) => ({
        ...value,
        row: { ...value.row, url: 'https://files.example/new.dxf' },
      }),
      'row-stale-after-decode',
    ],
    [
      'topology after decode',
      2,
      (value: PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2) => ({
        ...value,
        topology: { ...value.topology, seamIds: ['right', 'left'] as [string, string] },
      }),
      'topology-stale-after-decode',
    ],
  ])('fails closed when %s is stale', async (_name, staleCall, mutate, code) => {
    const result = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      fixture.request,
      host({
        evidence: (call) => {
          const value = structuredClone(fixture.evidence);
          return call === staleCall ? mutate(value) : value;
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe(code);
  });

  it('gates cancellation and never invokes hostile request accessors', async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelledHost = host();
    const cancelled = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      fixture.request,
      cancelledHost,
      controller.signal,
    );
    expect(cancelled.ok).toBe(false);
    expect(!cancelled.ok && cancelled.blockers[0].code).toBe('cancelled');
    expect(cancelledHost.getSidecar).not.toHaveBeenCalled();

    let invoked = false;
    const hostile = structuredClone(fixture.request) as unknown as Record<string, unknown>;
    Object.defineProperty(hostile, 'evil', {
      enumerable: true,
      get: () => {
        invoked = true;
        return 'no';
      },
    });
    const rejected = await readPatternImportDxfProductMultiseamPlacementSidecarV2(hostile, host());
    expect(rejected.ok).toBe(false);
    expect(invoked).toBe(false);

    const proto = structuredClone(fixture.request) as unknown as Record<string, unknown>;
    Object.defineProperty(proto, '__proto__', {
      enumerable: true,
      value: { polluted: true },
    });
    const protoRejected = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      proto,
      host(),
    );
    expect(protoRejected.ok).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('does not publish when cancellation arrives from an unabortable GET', async () => {
    const controller = new AbortController();
    const result = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      fixture.request,
      host({ onGet: () => controller.abort() }),
      controller.signal,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers[0].code).toBe('cancelled');
    expect(result.owner).toBeNull();
  });

  it('rejects dishonest SHA implementations and invalid 32-byte digest shapes', async () => {
    const dishonestKat = {
      subtle: {
        digest: vi.fn(async () => new ArrayBuffer(32)),
      } as unknown as SubtleCrypto,
    };
    const katResult = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      fixture.request,
      { ...host(), crypto: dishonestKat },
    );
    expect(katResult.ok).toBe(false);
    expect(!katResult.ok && katResult.blockers[0].code).toBe('sha256-unavailable');

    let call = 0;
    const shortPayloadDigest = {
      subtle: {
        digest: vi.fn(async (...args: Parameters<SubtleCrypto['digest']>) => {
          call += 1;
          if (call === 1) return globalThis.crypto.subtle.digest(...args);
          return new ArrayBuffer(31);
        }),
      } as unknown as SubtleCrypto,
    };
    const payloadResult = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      fixture.request,
      { ...host(), crypto: shortPayloadDigest },
    );
    expect(payloadResult.ok).toBe(false);
    expect(!payloadResult.ok && payloadResult.blockers[0].code).toBe('sha256-unavailable');
  });

  it('rejects contradictory row/source bindings and duplicate topology tuples before GET', async () => {
    const contradictory = {
      ...fixture.request,
      expectedBindings: {
        ...fixture.request.expectedBindings,
        source: {
          ...fixture.request.expectedBindings.source,
          writerExportSha256: hash('f'),
        },
      },
    };
    const contradictoryHost = host({ status: 'absent' });
    const contradiction = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      contradictory,
      contradictoryHost,
    );
    expect(contradiction.ok).toBe(false);
    expect(!contradiction.ok && contradiction.blockers[0].code).toBe('invalid-request');
    expect(contradictoryHost.getSidecar).not.toHaveBeenCalled();

    const duplicate = {
      ...fixture.request,
      expectedBindings: {
        ...fixture.request.expectedBindings,
        topology: {
          ...fixture.request.expectedBindings.topology,
          seamKeys: ['seam-key:left', 'seam-key:left'],
        },
      },
    };
    const duplicateHost = host();
    const duplicateResult = await readPatternImportDxfProductMultiseamPlacementSidecarV2(
      duplicate,
      duplicateHost,
    );
    expect(duplicateResult.ok).toBe(false);
    expect(duplicateHost.getSidecar).not.toHaveBeenCalled();
  });

  it('uses the captured array length descriptor without reading a live proxy length', async () => {
    let lengthReads = 0;
    const pieceLineKeys = new Proxy(['line:front', 'line:back'], {
      get: (target, property, receiver) => {
        if (property === 'length') lengthReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const request = {
      ...fixture.request,
      expectedBindings: {
        ...fixture.request.expectedBindings,
        topology: { ...fixture.request.expectedBindings.topology, pieceLineKeys },
      },
    };
    const result = await readPatternImportDxfProductMultiseamPlacementSidecarV2(request, host());
    expect(result.ok).toBe(true);
    expect(lengthReads).toBe(0);
  });
});
