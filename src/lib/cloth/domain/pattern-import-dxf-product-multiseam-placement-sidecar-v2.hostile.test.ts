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

function request(): MutableRequest {
  return structuredClone({
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
  } satisfies PatternImportDxfProductMultiseamPlacementSidecarRequestV2) as MutableRequest;
}

describe('pattern import DXF product multiseam placement sidecar V2 hostile boundaries', () => {
  it('checks the intrinsic byte length bound before allocating the detached copy', async () => {
    const NativeUint8Array = globalThis.Uint8Array;
    const oversized = new NativeUint8Array(4 * 1024 * 1024 + 1);
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Uint8Array');
    let allocationCalls = 0;
    const ObservedUint8Array = function (length: number) {
      allocationCalls += 1;
      return new NativeUint8Array(length);
    } as unknown as Uint8ArrayConstructor;
    Object.defineProperty(ObservedUint8Array, 'prototype', {
      value: NativeUint8Array.prototype,
    });
    Object.defineProperty(globalThis, 'Uint8Array', {
      ...originalDescriptor,
      value: ObservedUint8Array,
    });
    try {
      const result = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(oversized);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.blockers[0].code).toBe('bounds-exceeded');
      expect(allocationCalls).toBe(0);
    } finally {
      if (originalDescriptor) Object.defineProperty(globalThis, 'Uint8Array', originalDescriptor);
    }
  });

  it('preserves exact D0 source-curve strings and the 4096-byte storage URL envelope', async () => {
    const candidate = request();
    const sharedAcrossPieces = 'curve label łódź';
    candidate.placementAuthoring.semantics.garment.boundaries[0]!.waist.sourceCurveIds = [
      sharedAcrossPieces,
    ];
    candidate.placementAuthoring.semantics.garment.boundaries[1]!.waist.sourceCurveIds = [
      sharedAcrossPieces,
    ];
    candidate.placementAuthoring.semantics.garment.boundaries[0]!.hem.sourceCurveIds = [
      'é'.repeat(1024),
    ];
    candidate.bindings.row.patternUrl = `https://files.example/${'a'.repeat(3_000)}`;

    const built = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(candidate);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV2(built.owner);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(encoded.bytes);
    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.compatibility === 'placement-v2') {
      expect(
        decoded.placementAuthoring.semantics.garment.boundaries[0]!.waist.sourceCurveIds[0],
      ).toBe(sharedAcrossPieces);
      expect(decoded.document.bindings.row.patternUrl).toBe(candidate.bindings.row.patternUrl);
    }
  });

  it('mirrors D0 duplicate source-curve rejection within and across roles of one piece', async () => {
    const duplicateWithinRole = request();
    duplicateWithinRole.placementAuthoring.semantics.garment.boundaries[0]!.waist.sourceCurveIds = [
      'same curve',
      'same curve',
    ];
    const within =
      await buildPatternImportDxfProductMultiseamPlacementSidecarV2(duplicateWithinRole);
    expect(within.ok).toBe(false);

    const duplicateAcrossRoles = request();
    const front = duplicateAcrossRoles.placementAuthoring.semantics.garment.boundaries[0]!;
    front.hem.sourceCurveIds = [...front.waist.sourceCurveIds];
    const across =
      await buildPatternImportDxfProductMultiseamPlacementSidecarV2(duplicateAcrossRoles);
    expect(across.ok).toBe(false);
  });

  it('round-trips 64 exact source curves per role and rejects a 65th without truncation', async () => {
    const candidate = request();
    const curves = Array.from({ length: 64 }, (_, index) => `authored-waist-${index}`);
    candidate.placementAuthoring.semantics.garment.boundaries[0]!.waist.sourceCurveIds = curves;
    const built = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(candidate);
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error(JSON.stringify(built.blockers));
    const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV2(built.owner);
    if (!encoded.ok) throw new Error(encoded.code);
    const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(encoded.bytes);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || decoded.compatibility !== 'placement-v2')
      throw new Error('Expected verified placement V2 bytes.');
    expect(
      decoded.placementAuthoring.semantics.garment.boundaries[0]!.waist.sourceCurveIds,
    ).toEqual(curves);
    curves.push('authored-waist-64');
    expect(await buildPatternImportDxfProductMultiseamPlacementSidecarV2(candidate)).toMatchObject({
      ok: false,
      blockers: [
        {
          code: 'invalid-input',
          field: 'request.placementAuthoring.semantics.garment.boundaries[0].waist.sourceCurveIds',
        },
      ],
    });
  });

  it('keeps authored, saved-row and URL bounds tied to their genuine upstream contracts', async () => {
    const authoredTooLong = request();
    authoredTooLong.placementAuthoring.semantics.body.bodyId = `a${'b'.repeat(1_024)}`;
    expect(
      (await buildPatternImportDxfProductMultiseamPlacementSidecarV2(authoredTooLong)).ok,
    ).toBe(false);

    const savedRowIdTooLong = request();
    savedRowIdTooLong.bindings.row.scopeKey = `a${'b'.repeat(256)}`;
    expect(
      (await buildPatternImportDxfProductMultiseamPlacementSidecarV2(savedRowIdTooLong)).ok,
    ).toBe(false);

    for (const patternUrl of ['data:text/plain,hostile', 'https://files.example/a\n.dxf']) {
      const invalidUrl = request();
      invalidUrl.bindings.row.patternUrl = patternUrl;
      expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV2(invalidUrl)).ok).toBe(
        false,
      );
    }
  });

  it('does not narrow genuine safe-integer saved-row and topology identities to one billion', async () => {
    const candidate = request();
    candidate.bindings.row.techCardId = 1_000_000_001;
    candidate.bindings.row.cardLockVersion = 1_000_000_002;
    candidate.bindings.row.patternVersion = 1_000_000_003;
    candidate.bindings.row.revision = 1_000_000_004;
    candidate.bindings.row.sizeId = 1_000_000_005;
    candidate.bindings.topology.sourceOperationNumber = 1_000_000_006;

    const built = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(candidate);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.document.bindings.row.techCardId).toBe(candidate.bindings.row.techCardId);
    expect(built.document.bindings.topology.sourceOperationNumber).toBe(
      candidate.bindings.topology.sourceOperationNumber,
    );
  });

  it('derives symbol rejection from the one captured descriptor map without a second Proxy read', async () => {
    const target = request() as unknown as Record<PropertyKey, unknown>;
    const hidden = Symbol('hidden');
    Object.defineProperty(target, hidden, {
      configurable: true,
      enumerable: true,
      value: 'must-not-be-dropped',
    });
    let ownKeysCalls = 0;
    const proxy = new Proxy(target, {
      ownKeys: (current) => {
        ownKeysCalls += 1;
        const keys = Reflect.ownKeys(current);
        return ownKeysCalls === 1 ? keys : keys.filter((key) => key !== hidden);
      },
    });

    const result = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(proxy);
    expect(result.ok).toBe(false);
    expect(ownKeysCalls).toBe(1);
  });

  it('preserves D0 circumferential order independently of topology and boundary record order', async () => {
    const candidate = request();
    candidate.bindings.topology.pieceLineKeys.reverse();
    candidate.bindings.topology.pieceIds.reverse();
    candidate.bindings.topology.seamKeys.reverse();
    candidate.bindings.topology.seamIds.reverse();
    candidate.placementAuthoring.semantics.garment.circumferentialOrder.pieceIds.reverse();
    candidate.placementAuthoring.semantics.garment.boundaries.reverse();
    candidate.placementAuthoring.annular.parameters.pieces.reverse();

    const built = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(candidate);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(
      built.document.placementAuthoring.semantics.garment.circumferentialOrder.pieceIds,
    ).toEqual(['back', 'front']);
    expect(
      built.document.placementAuthoring.annular.parameters.pieces.map(({ pieceId }) => pieceId),
    ).toEqual(['back', 'front']);
  });
});
