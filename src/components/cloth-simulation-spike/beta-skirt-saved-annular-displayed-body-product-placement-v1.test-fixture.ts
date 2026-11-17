import { beforeEach, vi } from 'vitest';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from '../managers/model/components/model-open-reference-direct-pose-v9';
import { createModelMannequinPoseDocumentV2 } from '../managers/model/components/model-mannequin-pose-document-v2';
import type { SavedModelDisplayedTriangleBodySnapshotV2 } from '../managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import type { BetaSkirtCanonicalMediumProductPlacementProjectionV1 } from './beta-skirt-canonical-medium-product-placement-v1';
import { BETA_SKIRT_PERSONALIZED_DISPLAYED_BODY_PRODUCT_PLACEMENT_V2 } from './beta-skirt-personalized-displayed-body-product-placement-v2';

// Synthetic owner/diagnostic ports exercise cancellation, exact-byte translation and result
// preservation. These tests are not genuine garment/body physical qualification or GPU evidence.
const ports = vi.hoisted(() => ({
  canonical: new Map<object, unknown>(),
  bodies: new Map<object, { snapshot: unknown; lifetime: AbortController }>(),
  bodyReads: 0,
  realDiagnostics: false,
  sectionCalls: 0,
  collisionCalls: 0,
  signedCalls: 0,
  hashCalls: 0,
  hashHook: null as null | ((ordinal: number) => void),
  bodyHook: null as null | (() => void),
  collisionHook: null as null | (() => Promise<void>),
  sectionStatus: 'compatible-with-authored-clearance',
  sectionInvalid: false,
  bodyHits: 0,
  selfHits: 0,
  signedError: false,
  collisionError: false,
  signedContacts: 0,
  inputs: [] as unknown[],
}));
vi.mock('lib/features/sha256', async (original) => {
  const actual = await original<typeof import('lib/features/sha256')>();
  return {
    ...actual,
    sha256Hex: async (value: Parameters<typeof actual.sha256Hex>[0]) => {
      const digest = await actual.sha256Hex(value);
      ports.hashCalls += 1;
      ports.hashHook?.(ports.hashCalls);
      return digest;
    },
  };
});
vi.mock('./beta-skirt-canonical-medium-product-placement-v1', async (original) => {
  const actual =
    await original<typeof import('./beta-skirt-canonical-medium-product-placement-v1')>();
  return {
    ...actual,
    projectBetaSkirtCanonicalMediumProductPlacementV1: (owner: object) =>
      ports.canonical.has(owner)
        ? structuredClone(ports.canonical.get(owner))
        : actual.projectBetaSkirtCanonicalMediumProductPlacementV1(owner),
  };
});
vi.mock(
  '../managers/models/components/saved-model-displayed-triangle-body-owner-v2',
  async (original) => {
    const actual =
      await original<
        typeof import('../managers/models/components/saved-model-displayed-triangle-body-owner-v2')
      >();
    return {
      ...actual,
      getSavedModelDisplayedTriangleBodyLifetimeV2: (owner: object, binding: unknown) => {
        const body = ports.bodies.get(owner);
        return body
          ? body.lifetime.signal.aborted
            ? null
            : body.lifetime.signal
          : actual.getSavedModelDisplayedTriangleBodyLifetimeV2(owner as never, binding as never);
      },
      projectSavedModelDisplayedTriangleBodyV2: async (
        owner: object,
        binding: unknown,
        signal?: AbortSignal,
      ) => {
        const body = ports.bodies.get(owner);
        if (!body)
          return actual.projectSavedModelDisplayedTriangleBodyV2(
            owner as never,
            binding as never,
            signal,
          );
        ports.bodyReads++;
        ports.bodyHook?.();
        if (body.lifetime.signal.aborted || signal?.aborted)
          return { status: 'blocked', code: 'binding-stale', detail: 'Synthetic source revoked.' };
        return { status: 'projected', snapshot: structuredClone(body.snapshot) };
      },
    };
  },
);
vi.mock('lib/cloth/body/measurement-open-reference-display-v1', async (original) => ({
  ...(await original<typeof import('lib/cloth/body/measurement-open-reference-display-v1')>()),
  loadMakeHumanOpenReferenceBasisV1: async () => ({ kind: 'female' }),
}));
vi.mock('lib/cloth/body/makehuman-torso-shape-delta-bundle-v1', () => ({
  loadMakeHumanTorsoShapeDeltaBundleV1: async () => ({}),
}));
vi.mock('lib/cloth/body/makehuman-uniform-waist-hip-modes-v1', () => ({
  createMakeHumanUniformWaistHipModesV1: () => ({
    basisKind: 'female',
    modes: [
      { measurementKey: 'waistCircumferenceMm', stationOriginM: [0, 1.2, 0] },
      { measurementKey: 'hipCircumferenceMm', stationOriginM: [0, 1, 0] },
    ],
  }),
}));
vi.mock('lib/cloth/domain/garment-body-section-compatibility-preflight-v1', async (original) => {
  const actual =
    await original<
      typeof import('lib/cloth/domain/garment-body-section-compatibility-preflight-v1')
    >();
  return {
    ...actual,
    evaluateGarmentBodySectionCompatibilityPreflightV1: (
      input: Parameters<typeof actual.evaluateGarmentBodySectionCompatibilityPreflightV1>[0],
    ) => {
      ports.sectionCalls++;
      if (ports.realDiagnostics)
        return actual.evaluateGarmentBodySectionCompatibilityPreflightV1(input);
      return ports.sectionInvalid
        ? {
            ok: false,
            code: 'section-loop-unavailable',
            detail: 'Synthetic bounded section failure.',
          }
        : {
            ok: true,
            status: ports.sectionStatus,
            sections: [{ ordinal: 0 }],
            summary: {
              minimumRadialMarginM: 0.02,
              initialClearanceFailureCount: 0,
              sizeCompatibilityFailureCount: 0,
            },
          };
    },
  };
});
vi.mock('./beta-skirt-rendered-body-collision-diagnostic-v2', async (original) => {
  const actual =
    await original<typeof import('./beta-skirt-rendered-body-collision-diagnostic-v2')>();
  return {
    ...actual,
    evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2: async (input: unknown) => {
      ports.collisionCalls++;
      ports.inputs.push(structuredClone(input));
      await ports.collisionHook?.();
      if (ports.realDiagnostics)
        return actual.evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2(
          input as Parameters<typeof actual.evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2>[0],
        );
      if (ports.collisionError)
        throw Object.assign(new Error('Synthetic budget exhausted.'), { code: 'budget-exhausted' });
      return {
        version: 'synthetic-test-port',
        status: 'diagnostic-complete',
        contentFingerprintSha256: 'a'.repeat(64),
        intersections: {
          bodySelfIntersectionCount: 0,
          bodyGarmentTriangleIntersectionCount: ports.bodyHits,
          garmentSelfIntersectionCount: ports.selfHits,
        },
        clearance: {
          penetratingVertexCount: ports.bodyHits,
          unsafeVertexCount: 0,
          ambiguousSignVertexCount: 0,
          minimumSignedClearanceM: 0.02,
        },
        retainedDiagnosticWitness: { pair: [3, 8] },
      };
    },
  };
});
vi.mock('./beta-skirt-rendered-body-signed-vertex-contact-refresh-v42', async (original) => {
  const actual =
    await original<typeof import('./beta-skirt-rendered-body-signed-vertex-contact-refresh-v42')>();
  return {
    ...actual,
    computeBetaSkirtRenderedBodyTerminalCollisionReportSha256V42: async (
      report: Parameters<
        typeof actual.computeBetaSkirtRenderedBodyTerminalCollisionReportSha256V42
      >[0],
    ) =>
      ports.realDiagnostics
        ? actual.computeBetaSkirtRenderedBodyTerminalCollisionReportSha256V42(report)
        : 'b'.repeat(64),
    refreshBetaSkirtRenderedBodySignedVertexContactsV42: async (
      input: Parameters<typeof actual.refreshBetaSkirtRenderedBodySignedVertexContactsV42>[0],
    ) => {
      ports.signedCalls++;
      if (ports.realDiagnostics)
        return actual.refreshBetaSkirtRenderedBodySignedVertexContactsV42(input);
      if (ports.signedError)
        throw Object.assign(new Error('Synthetic terminal report blocked.'), {
          code: 'terminal-report-blocked',
        });
      return {
        receiptSha256: 'c'.repeat(64),
        contacts: Array.from({ length: ports.signedContacts }, () => ({
          vertexId: 1,
          signedDistanceM: -0.002,
        })),
      };
    },
  };
});

function setup() {
  const garmentOwner = Object.freeze({ syntheticGarment: 1 });
  const bodyOwner = Object.freeze({ syntheticBody: 1 });
  const bodyLifetime = new AbortController();
  const poseDocument = createModelMannequinPoseDocumentV2(
    MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  );
  // Closed cube: real section kernel intersects the exact synthetic adopted bytes at y=1/1.2.
  const bodyPositionsM = new Float32Array([
    -0.1, 0, -0.1, 0.1, 0, -0.1, 0.1, 2, -0.1, -0.1, 2, -0.1, -0.1, 0, 0.1, 0.1, 0, 0.1, 0.1, 2,
    0.1, -0.1, 2, 0.1,
  ]);
  const bodyTriangles = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2,
    6, 1, 6, 5,
  ]);
  const binding = {
    version: 'saved-model-displayed-triangle-body-owner/v2',
    generation: 7,
    displayedIdentity: {
      observationId: 'observation:9',
      modelId: 'tech-card-base-model:731',
      modelContentRevision: 'form-key',
      basisKind: 'female',
      inputFingerprint: 'input',
      bodyBuildFingerprint: 'body-build',
      runtimeSourceRevision: 'live-base',
      frameRevision: 'measurement-body-frame-v2.0.1',
      poseDocumentCanonicalKey: JSON.stringify(poseDocument),
      displayPositionSource: 'live-pose',
    },
    persistedModel: {
      id: 731,
      updatedAt: '2026-11-17T00:00:00.000000001Z',
      revision: 'persisted-revision',
    },
    modelFormRevision: 'form-key',
    canonicalContentFingerprint: 'canonical-measurements',
    canonicalMeasurementsSha256: '1'.repeat(64),
    rawBodyPositionsFloat32LeSha256: '2'.repeat(64),
    rawBodyTrianglesUint32LeSha256: '3'.repeat(64),
    framedBodyPositionsSha256: '4'.repeat(64),
    framedBodyTopologySha256: '5'.repeat(64),
    poseDocumentSha256: '6'.repeat(64),
    observedBodyContentSha256: '7'.repeat(64),
  };
  const body = {
    binding,
    poseDocument,
    displayedPose: poseDocument.pose,
    canonicalMeasurements: { heightMm: 1700 },
    bodyPositionsM,
    bodyTriangles,
  } as unknown as SavedModelDisplayedTriangleBodySnapshotV2;
  const positions = Float32Array.from({ length: 580 * 3 }, (_, index) => (index % 17) / 100);
  const triangles = Uint32Array.from({ length: 912 * 3 }, (_, index) => index % 3);
  const canonical = {
    snapshot: {
      seal: { canonicalSha256: '8'.repeat(64) },
      bindings: {
        garmentMappedPositionsSha256:
          '33772a6d189b1ffd598ac45ed2f76d89ccd08a40145d8516371656e9d1950e3a',
        garmentTopologySha256: '740687d630d43550c78bf33724a854b38479894ccaa52c633beb4dba6eee2c0f',
        garmentRestPositionsSha256: '9'.repeat(64),
        garmentMaterialFramesSha256: 'd'.repeat(64),
        garmentSeamsSha256: 'e'.repeat(64),
        garmentPinsSha256: 'f'.repeat(64),
      },
      authoredFrame: { waistCenterM: [0, 1, 0], authoredAxialLengthM: 0.5 },
    },
    collisionInput: {
      binding: { compositionGeneration: 23 },
      bodyPositionsM: bodyPositionsM.slice(),
      bodyTriangles: bodyTriangles.slice(),
      garmentPositionsM: positions,
      garmentTriangles: triangles,
      garmentUniformScale: 1,
      garmentTranslationM: [0, 0, 0],
    },
    positionsInvMass: new Float32Array(580 * 4),
    seamPairs: Uint32Array.from({ length: 68 }, (_, index) => index),
    pinnedWaistVertexIndices: Uint32Array.from({ length: 82 }, (_, index) => index),
  } as unknown as BetaSkirtCanonicalMediumProductPlacementProjectionV1;
  ports.canonical.set(garmentOwner, canonical);
  ports.bodies.set(bodyOwner, { snapshot: body, lifetime: bodyLifetime });
  const request = {
    schemaVersion: BETA_SKIRT_PERSONALIZED_DISPLAYED_BODY_PRODUCT_PLACEMENT_V2,
    canonicalPlacementOwner: garmentOwner,
    displayedBodyOwner: bodyOwner,
    displayedBodyBinding: binding,
    compositionGeneration: 23,
  };
  return { request, garmentOwner, bodyOwner, bodyLifetime, body, canonical };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  ports.canonical.clear();
  ports.bodies.clear();
  ports.bodyReads = 0;
  ports.realDiagnostics = false;
  ports.sectionCalls = 0;
  ports.collisionCalls = 0;
  ports.signedCalls = 0;
  ports.hashCalls = 0;
  ports.hashHook = null;
  ports.bodyHook = null;
  ports.collisionHook = null;
  ports.sectionStatus = 'compatible-with-authored-clearance';
  ports.sectionInvalid = false;
  ports.bodyHits = 0;
  ports.selfHits = 0;
  ports.signedError = false;
  ports.collisionError = false;
  ports.signedContacts = 0;
  ports.inputs = [];
});

export { ports, setup, deferred };
