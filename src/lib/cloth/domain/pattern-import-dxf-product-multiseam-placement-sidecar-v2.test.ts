import { describe, expect, it } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2,
  buildPatternImportDxfProductMultiseamPlacementSidecarV2,
  decodePatternImportDxfProductMultiseamPlacementSidecarV2,
  encodePatternImportDxfProductMultiseamPlacementSidecarV2,
  type PatternImportDxfProductMultiseamPlacementSidecarRequestV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v2';

const hash = (character: string): string => character.repeat(64);

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;
type MutableRequest = DeepMutable<PatternImportDxfProductMultiseamPlacementSidecarRequestV2>;

function selection(id: string) {
  return {
    contourId: `${id}-contour`,
    sourceCurveIds: [`${id}-curve`] as [string],
    boundaryVertexIndices: [0, 1] as [number, number],
  };
}

function request(): PatternImportDxfProductMultiseamPlacementSidecarRequestV2 {
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

function mutableRequest(): MutableRequest {
  return structuredClone(request()) as unknown as MutableRequest;
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

const bytesOf = (value: unknown): Uint8Array => new TextEncoder().encode(canonical(value));

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
    mediaType: 'application/vnd.grbpwr.pattern-dxf-product-semantics.v1+json',
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

describe('pattern import DXF product multiseam placement sidecar V2', () => {
  it('builds deterministic concurrent owners, preserves three distinct provenance hashes, and round-trips V2', async () => {
    const firstRequest = request();
    const secondRequest = request();
    const [first, second] = await Promise.all([
      buildPatternImportDxfProductMultiseamPlacementSidecarV2(firstRequest),
      buildPatternImportDxfProductMultiseamPlacementSidecarV2(secondRequest),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.seal.canonicalSha256).toBe(second.seal.canonicalSha256);
    expect(first.document.bindings.source.sourceFileSha256).not.toBe(
      first.document.bindings.source.writerExportSha256,
    );
    expect(first.document.bindings.source.handoffSourceAggregateSha256).not.toBe(
      first.document.bindings.source.writerExportSha256,
    );
    expect('origin' in first.document.placementAuthoring.semantics).toBe(false);
    expect(first.claims.sidecarPersisted).toBe(false);
    expect(first.claims.placementRestoreIntegrated).toBe(false);

    const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV2(first.owner);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(encoded.bytes);
    expect(decoded.ok).toBe(true);
    expect(decoded.ok && decoded.compatibility).toBe('placement-v2');
    if (!decoded.ok || decoded.compatibility !== 'placement-v2') return;
    expect(decoded.seal.canonicalSha256).toBe(first.seal.canonicalSha256);
    expect(decoded.placementAuthoring.authoredImportGeneration).toBe(8);
    expect(decoded.claims.authoredImportGenerationIsAuditOnly).toBe(true);

    encoded.bytes[0] = 0;
    const encodedAgain = encodePatternImportDxfProductMultiseamPlacementSidecarV2(first.owner);
    expect(encodedAgain.ok && encodedAgain.bytes[0]).not.toBe(0);
    expect(encodePatternImportDxfProductMultiseamPlacementSidecarV2({ ...first.owner })).toEqual({
      ok: false,
      code: 'invalid-owner',
      bytes: null,
    });
  });

  it.each([
    [
      'writer export',
      (value: MutableRequest) => (value.bindings.source.writerExportSha256 = hash('b')),
    ],
    [
      'mapping id',
      (value: MutableRequest) => (value.placementAuthoring.annular.parameters.id = 'wrong'),
    ],
    [
      'piece order',
      (value: MutableRequest) => value.placementAuthoring.annular.parameters.pieces.reverse(),
    ],
    [
      'seam reference',
      (value: MutableRequest) =>
        (value.placementAuthoring.annular.parameters.seamAnchor.seamId = 'unknown'),
    ],
    [
      'piece start seam differs from anchor',
      (value: MutableRequest) =>
        (value.placementAuthoring.annular.parameters.pieces[1]!.planarStartSeamId = 'right'),
    ],
    [
      'duplicate seam key',
      (value: MutableRequest) =>
        (value.bindings.topology.seamKeys[1] = value.bindings.topology.seamKeys[0]!),
    ],
    [
      'proposal fingerprint',
      (value: MutableRequest) => (value.bindings.source.proposalFingerprint = hash('a')),
    ],
    [
      'D0 clearance above authority bound',
      (value: MutableRequest) =>
        (value.placementAuthoring.semantics.policy.authoredClearanceM = 0.100_001),
    ],
    [
      'D0 cloth thickness above authority bound',
      (value: MutableRequest) =>
        (value.placementAuthoring.semantics.policy.clothThicknessM = 0.020_001),
    ],
    [
      'D0 duplicate body landmark',
      (value: MutableRequest) =>
        (value.placementAuthoring.semantics.body.landmarks.hipLeftId =
          value.placementAuthoring.semantics.body.landmarks.waistCenterId),
    ],
  ])('rejects %s cross-binding or authentic-shape mismatch', async (_name, mutate) => {
    const value = mutableRequest();
    mutate(value);
    const result = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(value);
    expect(result.ok).toBe(false);
  });

  it('preserves genuine D0 boundary record order independently from circumferential order', async () => {
    const value = mutableRequest();
    value.placementAuthoring.semantics.garment.boundaries.reverse();
    const result = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.document.placementAuthoring.semantics.garment.boundaries.map(({ pieceId }) => pieceId),
    ).toEqual(['back', 'front']);
  });

  it('losslessly admits genuine D2a positive radii and spans below 1e-6', async () => {
    const value = mutableRequest();
    const piece = value.placementAuthoring.annular.parameters.pieces[0]!;
    piece.waistSlantRadiusMm = 0.000_000_5;
    piece.hemSlantRadiusMm = 0.000_000_7;
    piece.sectorSpanRad = 0.000_000_5;
    const result = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.placementAuthoring.annular.parameters.pieces[0].waistSlantRadiusMm).toBe(
      0.000_000_5,
    );
  });

  it('rejects signed zero, exact 2π, non-unit rays, binary aliases, cycles, accessors, and __proto__', async () => {
    const signedZero = mutableRequest();
    signedZero.placementAuthoring.annular.parameters.pieces[0].planarApexMm[0] = -0;
    expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV2(signedZero)).ok).toBe(
      false,
    );

    const twoPi = mutableRequest();
    twoPi.placementAuthoring.annular.parameters.seamAnchor.bodyAngleRad = Math.PI * 2;
    expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV2(twoPi)).ok).toBe(false);

    const nonUnit = mutableRequest();
    nonUnit.placementAuthoring.annular.parameters.pieces[0].planarStartRayUnit2 = [1, 1];
    expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV2(nonUnit)).ok).toBe(false);

    const binary = structuredClone(request()) as unknown as {
      placementAuthoring: { annular: { parameters: { pieces: [{ planarApexMm: unknown }] } } };
    };
    binary.placementAuthoring.annular.parameters.pieces[0].planarApexMm = new Float64Array([0, 0]);
    expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV2(binary)).ok).toBe(false);

    const alias = structuredClone(request()) as unknown as {
      bindings: { row: object; source: object };
    };
    alias.bindings.source = alias.bindings.row;
    expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV2(alias)).ok).toBe(false);

    const cycle = structuredClone(request()) as unknown as Record<string, unknown>;
    cycle.cycle = cycle;
    expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV2(cycle)).ok).toBe(false);

    let getterInvoked = false;
    const accessor = request() as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, 'evil', {
      enumerable: true,
      get: () => {
        getterInvoked = true;
        return 1;
      },
    });
    expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV2(accessor)).ok).toBe(
      false,
    );
    expect(getterInvoked).toBe(false);

    const proto = request() as unknown as Record<string, unknown>;
    Object.defineProperty(proto, '__proto__', { enumerable: true, value: { polluted: true } });
    expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV2(proto)).ok).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('detaches before async hashing and rejects unavailable or dishonest crypto', async () => {
    const value = mutableRequest();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const delayed = {
      subtle: {
        digest: async (...args: Parameters<SubtleCrypto['digest']>) => {
          await gate;
          return globalThis.crypto.subtle.digest(...args);
        },
      } as unknown as SubtleCrypto,
    };
    const pending = buildPatternImportDxfProductMultiseamPlacementSidecarV2(value, delayed);
    value.bindings.row.scopeKey = 'scope:mutated';
    release();
    const result = await pending;
    expect(result.ok && result.document.bindings.row.scopeKey).toBe('scope:main');

    expect(
      (
        await buildPatternImportDxfProductMultiseamPlacementSidecarV2(request(), {
          subtle: {
            digest: async () => new ArrayBuffer(32),
          } as unknown as SubtleCrypto,
        })
      ).ok,
    ).toBe(false);

    let digestCalls = 0;
    const shortPayloadDigest = {
      subtle: {
        digest: async (...args: Parameters<SubtleCrypto['digest']>) => {
          digestCalls += 1;
          if (digestCalls === 1) return globalThis.crypto.subtle.digest(...args);
          return new ArrayBuffer(31);
        },
      } as unknown as SubtleCrypto,
    };
    expect(
      (await buildPatternImportDxfProductMultiseamPlacementSidecarV2(request(), shortPayloadDigest))
        .ok,
    ).toBe(false);
  });

  it('strictly decodes canonical V2 bytes and rejects aliases, whitespace, unknown fields, signed zero, and invalid UTF-8', async () => {
    const built = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(request());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV2(built.owner);
    if (!encoded.ok) return;
    const json = new TextDecoder().decode(encoded.bytes);
    let maliciousSliceCalled = false;
    Object.defineProperty(encoded.bytes, 'slice', {
      value: () => {
        maliciousSliceCalled = true;
        return new Uint8Array();
      },
    });
    expect((await decodePatternImportDxfProductMultiseamPlacementSidecarV2(encoded.bytes)).ok).toBe(
      true,
    );
    expect(maliciousSliceCalled).toBe(false);
    expect(
      (
        await decodePatternImportDxfProductMultiseamPlacementSidecarV2(
          new TextEncoder().encode(` ${json}`),
        )
      ).ok,
    ).toBe(false);
    const unknown = JSON.parse(json) as Record<string, unknown>;
    unknown.extra = true;
    expect(
      (await decodePatternImportDxfProductMultiseamPlacementSidecarV2(bytesOf(unknown))).ok,
    ).toBe(false);
    expect(
      (
        await decodePatternImportDxfProductMultiseamPlacementSidecarV2(
          new TextEncoder().encode(json.replace('"bodyAngleRad":0', '"bodyAngleRad":-0')),
        )
      ).ok,
    ).toBe(false);
    expect(
      (await decodePatternImportDxfProductMultiseamPlacementSidecarV2(new Uint8Array([0xc3, 0x28])))
        .ok,
    ).toBe(false);
  });

  it('decodes canonical legacy V1 only as explicit null placement compatibility', async () => {
    const legacy = legacyDocument();
    const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(bytesOf(legacy));
    expect(decoded.ok).toBe(true);
    expect(decoded.ok && decoded.compatibility).toBe('legacy-v1-no-placement');
    if (!decoded.ok || decoded.compatibility !== 'legacy-v1-no-placement') return;
    expect(decoded.owner).toBeNull();
    expect(decoded.document).toBeNull();
    expect(decoded.placementAuthoring).toBeNull();
    expect(decoded.claims.legacyPlacementInferred).toBe(false);

    (legacy.product as Record<string, unknown>).extra = true;
    expect(
      (await decodePatternImportDxfProductMultiseamPlacementSidecarV2(bytesOf(legacy))).ok,
    ).toBe(false);
  });
});
