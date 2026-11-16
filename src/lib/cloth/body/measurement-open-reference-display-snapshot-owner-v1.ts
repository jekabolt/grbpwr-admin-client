import {
  CANONICAL_BODY_MEASUREMENTS_VERSION,
  type CanonicalBodyMeasurementsMm,
} from './measurement-adapter';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import {
  displayPoseHashBoundSourceRevisionV1,
  measurementOpenReferenceDisplayPosePresetV1,
  type MeasurementOpenReferenceDisplayPosePresetIdV1,
} from './measurement-open-reference-display-pose-v1';
import type { MeasurementOpenReferenceDisplayPoseRuntimeResultV1 } from './measurement-open-reference-display-pose-runtime-v1';
import type { MeasurementOpenReferenceLimbSubsetRuntimeResultV1 } from './measurement-open-reference-limb-subset-runtime-v1';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import {
  basisHashBoundSourceRevision,
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  loadMakeHumanOpenReferenceBasisV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
  snapshotMeasurementOpenReferenceDisplayArtifactV1,
  snapshotMeasurementSurfaceMeshV1,
  type MakeHumanOpenReferenceBasisKindV1,
  type MakeHumanOpenReferenceBasisV1,
  type MeasurementOpenReferenceDisplayArtifactV1,
} from './measurement-open-reference-display-v1';
import type { MeasurementOpenReferenceDisplayQualityGateResultV1 } from './measurement-open-reference-display-quality-gate-v1';
import type { MeasurementSurfaceMeshV1 } from './measurement-watertight-surface-v1';

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_V1 =
  'measurement-open-reference-display-snapshot-owner/v1' as const;

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_SOURCE_V1 =
  'model-form-open-reference-preview-v1' as const;
export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_LIMB_REVISION_V1 =
  'measurement-open-reference-limb-subset-runtime/v1' as const;
export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_LIMB_BUNDLE_SHA256_V1 =
  '7a852519ce230ac82aa6b8beea404b49f04305532a9ea26cdd30151015464a2c' as const;

const LIMB_KEYS = Object.freeze([
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'calfCircumferenceMm',
  'ankleCircumferenceMm',
] as const);

type LimbKey = (typeof LIMB_KEYS)[number];
type DisplayBasisKind = Exclude<MakeHumanOpenReferenceBasisKindV1, 'base'>;

const CLAIMS = Object.freeze({
  displayOnly: true as const,
  researchOwnerOnly: true as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  realBodyValidationClaimed: false as const,
  garmentFitClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  productionRuntimeEligible: false as const,
});

export interface MeasurementOpenReferenceDisplaySnapshotRequestV1 {
  readonly modelId: string;
  readonly modelContentRevision: string;
  readonly inputFingerprint: string;
  readonly basisKind: DisplayBasisKind;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly posePresetId: MeasurementOpenReferenceDisplayPosePresetIdV1;
}

export interface MeasurementOpenReferenceDisplaySnapshotBindingV1 {
  readonly generation: number;
  readonly modelId: string;
  readonly modelContentRevision: string;
  readonly inputFingerprint: string;
  readonly canonicalContentFingerprint: string;
  readonly basisKind: DisplayBasisKind;
  readonly posePresetId: MeasurementOpenReferenceDisplayPosePresetIdV1;
  readonly sourceRevision: string;
}

export interface MeasurementOpenReferenceDisplaySnapshotV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_V1;
  readonly role: 'PER_MODEL_DISPLAY_RESEARCH_SNAPSHOT';
  readonly binding: MeasurementOpenReferenceDisplaySnapshotBindingV1;
  readonly displayMesh: MeasurementSurfaceMeshV1;
  readonly waistHip: {
    readonly status: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1['status'];
    readonly representedGeometricProxies: readonly (
      | 'waistCircumferenceMm'
      | 'hipCircumferenceMm'
    )[];
  };
  readonly limbs: {
    readonly status:
      | MeasurementOpenReferenceLimbSubsetRuntimeResultV1['status']
      | 'not-requested'
      | 'omitted-non-a'
      | 'runtime-fallback';
    readonly requestedGeometricProxies: readonly LimbKey[];
    readonly representedGeometricProxies: readonly LimbKey[];
  };
  readonly pose: {
    readonly requestedPresetId: MeasurementOpenReferenceDisplayPosePresetIdV1;
    readonly resolvedPresetId: MeasurementOpenReferenceDisplayPosePresetIdV1;
    readonly status: 'a-rest' | 'fallback' | 'posed';
    readonly maximumJointPivotResidualM: number | null;
  };
  readonly claims: typeof CLAIMS;
}

export type MeasurementOpenReferenceDisplaySnapshotBuildResultV1 =
  | Readonly<{
      status: 'committed';
      snapshot: MeasurementOpenReferenceDisplaySnapshotV1;
    }>
  | Readonly<{
      status: 'stale';
      binding: MeasurementOpenReferenceDisplaySnapshotBindingV1;
      reason: 'superseded';
    }>
  | Readonly<{
      status: 'blocked';
      code: 'build-failed' | 'invalid-request';
      message: string;
    }>;

export interface MeasurementOpenReferenceDisplaySnapshotDependenciesV1 {
  readonly loadBasis: (kind: DisplayBasisKind) => Promise<MakeHumanOpenReferenceBasisV1>;
  readonly createUniformHeightDisplay: typeof createMeasurementOpenReferenceUniformHeightDisplayV1;
  readonly createWaistHipRuntime: (options: {
    readonly basis: MakeHumanOpenReferenceBasisV1;
    readonly measurements: CanonicalBodyMeasurementsMm;
    readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  }) => Promise<MeasurementOpenReferenceUniformWaistHipRuntimeResultV1>;
  readonly createLimbRuntime: (options: {
    readonly basis: MakeHumanOpenReferenceBasisV1;
    readonly measurements: CanonicalBodyMeasurementsMm;
    readonly waistHipRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  }) => Promise<MeasurementOpenReferenceLimbSubsetRuntimeResultV1>;
  readonly createPoseRuntime: (options: {
    readonly basis: MakeHumanOpenReferenceBasisV1;
    readonly measurements: CanonicalBodyMeasurementsMm;
    readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
    readonly presetId: Exclude<MeasurementOpenReferenceDisplayPosePresetIdV1, 'a-rest'>;
  }) => Promise<MeasurementOpenReferenceDisplayPoseRuntimeResultV1>;
}

function exactString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new RangeError(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function canonicalContentFingerprint(measurements: CanonicalBodyMeasurementsMm): string {
  return JSON.stringify(
    Object.entries(measurements).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function requestedLimbKeys(measurements: CanonicalBodyMeasurementsMm): readonly LimbKey[] {
  return Object.freeze(LIMB_KEYS.filter((key) => measurements[key] != null));
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Exact compatibility binding used by the current ModelForm display pipeline. */
export function measurementOpenReferenceDisplaySnapshotSourceRevisionV1(options: {
  readonly inputFingerprint: string;
  readonly basisKind: DisplayBasisKind;
  readonly posePresetId: MeasurementOpenReferenceDisplayPosePresetIdV1;
  readonly limbSubsetRequested: boolean;
}): string {
  const inputFingerprint = exactString(options.inputFingerprint, 'inputFingerprint');
  measurementOpenReferenceDisplayPosePresetV1(options.posePresetId);
  const poseBound = displayPoseHashBoundSourceRevisionV1(
    basisHashBoundSourceRevision(
      `${MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_SOURCE_V1};inputHash=${fnv1a32(inputFingerprint)}`,
      options.basisKind,
    ),
    options.posePresetId,
  );
  return options.limbSubsetRequested
    ? `${poseBound};limbSubsetRequestedRevision=${MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_LIMB_REVISION_V1};limbBundleSha256=${MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_LIMB_BUNDLE_SHA256_V1}`
    : poseBound;
}

function qualitySnapshot(
  value: MeasurementOpenReferenceDisplayQualityGateResultV1 | null,
): MeasurementOpenReferenceDisplayQualityGateResultV1 | null {
  if (!value) return null;
  return Object.freeze({
    ...value,
    reasons: Object.freeze([...value.reasons]),
    metrics: Object.freeze({ ...value.metrics }),
    policy: Object.freeze({ ...value.policy }),
    claims: Object.freeze({ ...value.claims }),
  });
}

function snapshotWaistHipRuntime(
  runtime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1,
): MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 {
  return Object.freeze({
    ...runtime,
    openReference: snapshotMeasurementOpenReferenceDisplayArtifactV1(runtime.openReference),
    displayMesh: snapshotMeasurementSurfaceMeshV1(runtime.displayMesh),
    requestedGeometricProxies: Object.freeze([...runtime.requestedGeometricProxies]),
    representedGeometricProxies: Object.freeze([...runtime.representedGeometricProxies]),
    modeResults: Object.freeze(runtime.modeResults.map((value) => Object.freeze({ ...value }))),
    diagnostics: Object.freeze(runtime.diagnostics.map((value) => Object.freeze({ ...value }))),
    qualityGate: qualitySnapshot(runtime.qualityGate),
    claims: Object.freeze({ ...runtime.claims }),
  });
}

function failedWaistHipRuntime(
  openReference: MeasurementOpenReferenceDisplayArtifactV1,
  reason: unknown,
): MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 {
  const owned = snapshotMeasurementOpenReferenceDisplayArtifactV1(openReference);
  return Object.freeze({
    version: 'measurement-open-reference-uniform-waist-hip-runtime/v1' as const,
    role: 'CC0_OPEN_REFERENCE_DISPLAY_GEOMETRIC_PROXIES' as const,
    status: 'error' as const,
    openReference: owned,
    displayMesh: snapshotMeasurementSurfaceMeshV1(owned.mesh),
    requestedGeometricProxies: Object.freeze([
      'waistCircumferenceMm' as const,
      'hipCircumferenceMm' as const,
    ]),
    representedGeometricProxies: Object.freeze([]),
    modeResults: Object.freeze([]),
    diagnostics: Object.freeze([
      Object.freeze({
        code: 'runtime-unavailable' as const,
        measurementKey: null,
        message: reason instanceof Error ? reason.message : 'Waist/hip proxy runtime unavailable.',
      }),
    ]),
    qualityGate: null,
    claims: Object.freeze({
      visualReferenceOnly: true as const,
      geometricPlaneLoopOnly: true as const,
      canonicalMeasurementSemanticMatchClaimed: false as const,
      anatomicalTapePathEquivalent: false as const,
      measurementProtocolEquivalent: false as const,
      populationRepresentativenessClaimed: false as const,
      fitClaimEligible: false as const,
      runtimeCollisionEligible: false as const,
      collisionCandidateEligible: false as const,
      selfIntersection: 'not-evaluated-after-deformation' as const,
    }),
  });
}

function snapshotBasis(
  value: MakeHumanOpenReferenceBasisV1,
  expectedKind: DisplayBasisKind,
): MakeHumanOpenReferenceBasisV1 {
  if (value.schemaVersion !== MAKEHUMAN_OPEN_REFERENCE_BASIS_V1 || value.kind !== expectedKind) {
    throw new Error('Loaded display basis does not match the requested basis binding.');
  }
  return Object.freeze({
    ...value,
    positionsSourceUnits: value.positionsSourceUnits.slice(),
    indices: value.indices.slice(),
  });
}

function cloneBinding(
  value: MeasurementOpenReferenceDisplaySnapshotBindingV1,
): MeasurementOpenReferenceDisplaySnapshotBindingV1 {
  return Object.freeze({ ...value });
}

function cloneSnapshot(
  value: MeasurementOpenReferenceDisplaySnapshotV1,
): MeasurementOpenReferenceDisplaySnapshotV1 {
  return Object.freeze({
    ...value,
    binding: cloneBinding(value.binding),
    displayMesh: snapshotMeasurementSurfaceMeshV1(value.displayMesh),
    waistHip: Object.freeze({
      ...value.waistHip,
      representedGeometricProxies: Object.freeze([...value.waistHip.representedGeometricProxies]),
    }),
    limbs: Object.freeze({
      ...value.limbs,
      requestedGeometricProxies: Object.freeze([...value.limbs.requestedGeometricProxies]),
      representedGeometricProxies: Object.freeze([...value.limbs.representedGeometricProxies]),
    }),
    pose: Object.freeze({ ...value.pose }),
    claims: CLAIMS,
  });
}

function bindingKey(value: MeasurementOpenReferenceDisplaySnapshotBindingV1): string {
  return JSON.stringify([
    value.generation,
    value.modelId,
    value.modelContentRevision,
    value.inputFingerprint,
    value.canonicalContentFingerprint,
    value.basisKind,
    value.posePresetId,
    value.sourceRevision,
  ]);
}

const DEFAULT_DEPENDENCIES = Object.freeze({
  loadBasis: loadMakeHumanOpenReferenceBasisV1,
  createUniformHeightDisplay: createMeasurementOpenReferenceUniformHeightDisplayV1,
  createWaistHipRuntime: async (options) => {
    const runtime = await import('./measurement-open-reference-uniform-waist-hip-runtime-v1');
    return runtime.createMeasurementOpenReferenceUniformWaistHipRuntimeV1(options);
  },
  createLimbRuntime: async (options) => {
    const runtime = await import('./measurement-open-reference-limb-subset-runtime-v1');
    return runtime.createMeasurementOpenReferenceLimbSubsetRuntimeV1(options);
  },
  createPoseRuntime: async (options) => {
    const runtime = await import('./measurement-open-reference-display-pose-runtime-v1');
    return runtime.createMeasurementOpenReferenceDisplayPoseRuntimeV1(options);
  },
} satisfies MeasurementOpenReferenceDisplaySnapshotDependenciesV1);

export function createMeasurementOpenReferenceDisplaySnapshotOwnerV1(
  dependencies: Partial<MeasurementOpenReferenceDisplaySnapshotDependenciesV1> = {},
): {
  readonly build: (
    request: MeasurementOpenReferenceDisplaySnapshotRequestV1,
  ) => Promise<MeasurementOpenReferenceDisplaySnapshotBuildResultV1>;
  readonly invalidate: () => void;
  readonly current: () => MeasurementOpenReferenceDisplaySnapshotV1 | null;
  readonly isCurrent: (binding: MeasurementOpenReferenceDisplaySnapshotBindingV1) => boolean;
} {
  const deps = Object.freeze({ ...DEFAULT_DEPENDENCIES, ...dependencies });
  let generation = 0;
  let current: MeasurementOpenReferenceDisplaySnapshotV1 | null = null;

  const invalidate = () => {
    generation += 1;
    current = null;
  };

  const build = async (
    request: MeasurementOpenReferenceDisplaySnapshotRequestV1,
  ): Promise<MeasurementOpenReferenceDisplaySnapshotBuildResultV1> => {
    invalidate();
    const reservedGeneration = generation;
    let frame: ReturnType<typeof createMeasurementBodyFrameV2>;
    let binding: MeasurementOpenReferenceDisplaySnapshotBindingV1;
    let measurements: CanonicalBodyMeasurementsMm;
    let requestedLimbs: readonly LimbKey[];
    try {
      const modelId = exactString(request.modelId, 'modelId');
      const modelContentRevision = exactString(
        request.modelContentRevision,
        'modelContentRevision',
      );
      const inputFingerprint = exactString(request.inputFingerprint, 'inputFingerprint');
      if (!['neutral', 'male', 'female'].includes(request.basisKind)) {
        throw new RangeError('basisKind must be neutral, male or female.');
      }
      measurementOpenReferenceDisplayPosePresetV1(request.posePresetId);
      if (request.measurements.schemaVersion !== CANONICAL_BODY_MEASUREMENTS_VERSION) {
        throw new RangeError('Unsupported canonical measurement schema.');
      }
      requestedLimbs = requestedLimbKeys(request.measurements);
      const sourceRevision = measurementOpenReferenceDisplaySnapshotSourceRevisionV1({
        inputFingerprint,
        basisKind: request.basisKind,
        posePresetId: request.posePresetId,
        limbSubsetRequested: request.posePresetId === 'a-rest' && requestedLimbs.length > 0,
      });
      frame = createMeasurementBodyFrameV2({
        measurements: request.measurements,
        sourceRevision,
        pose: 'A',
      });
      measurements = frame.measurements;
      requestedLimbs = requestedLimbKeys(measurements);
      binding = Object.freeze({
        generation: reservedGeneration,
        modelId,
        modelContentRevision,
        inputFingerprint,
        canonicalContentFingerprint: canonicalContentFingerprint(measurements),
        basisKind: request.basisKind,
        posePresetId: request.posePresetId,
        sourceRevision,
      });
    } catch (reason: unknown) {
      return Object.freeze({
        status: 'blocked' as const,
        code: 'invalid-request' as const,
        message: reason instanceof Error ? reason.message : 'Display snapshot request is invalid.',
      });
    }

    const stale = (): MeasurementOpenReferenceDisplaySnapshotBuildResultV1 | null =>
      generation === reservedGeneration
        ? null
        : Object.freeze({
            status: 'stale' as const,
            binding: cloneBinding(binding),
            reason: 'superseded' as const,
          });

    try {
      const basis = snapshotBasis(await deps.loadBasis(binding.basisKind), binding.basisKind);
      let staleResult = stale();
      if (staleResult) return staleResult;
      const openReference = snapshotMeasurementOpenReferenceDisplayArtifactV1(
        deps.createUniformHeightDisplay({ basis, frame }),
      );
      let waistHipRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
      try {
        waistHipRuntime = snapshotWaistHipRuntime(
          await deps.createWaistHipRuntime({ basis, measurements, openReference }),
        );
      } catch (reason: unknown) {
        waistHipRuntime = failedWaistHipRuntime(openReference, reason);
      }
      staleResult = stale();
      if (staleResult) return staleResult;

      let displayMesh = snapshotMeasurementSurfaceMeshV1(waistHipRuntime.displayMesh);
      let limbStatus: MeasurementOpenReferenceDisplaySnapshotV1['limbs']['status'] =
        requestedLimbs.length === 0 ? 'not-requested' : 'omitted-non-a';
      let representedLimbs: readonly LimbKey[] = Object.freeze([]);
      if (binding.posePresetId === 'a-rest' && requestedLimbs.length > 0) {
        try {
          const limbRuntime = await deps.createLimbRuntime({
            basis,
            measurements,
            waistHipRuntime,
          });
          staleResult = stale();
          if (staleResult) return staleResult;
          displayMesh = snapshotMeasurementSurfaceMeshV1(limbRuntime.displayMesh);
          limbStatus = limbRuntime.status;
          representedLimbs = Object.freeze(
            limbRuntime.representedGeometricProxies.filter((key): key is LimbKey =>
              LIMB_KEYS.includes(key as LimbKey),
            ),
          );
        } catch {
          staleResult = stale();
          if (staleResult) return staleResult;
          limbStatus = 'runtime-fallback';
          displayMesh = snapshotMeasurementSurfaceMeshV1(waistHipRuntime.displayMesh);
        }
      }

      let pose: MeasurementOpenReferenceDisplaySnapshotV1['pose'] = Object.freeze({
        requestedPresetId: binding.posePresetId,
        resolvedPresetId: 'a-rest' as const,
        status: 'a-rest' as const,
        maximumJointPivotResidualM: null,
      });
      if (binding.posePresetId !== 'a-rest') {
        try {
          const posed = await deps.createPoseRuntime({
            basis,
            measurements,
            proxyRuntime: waistHipRuntime,
            presetId: binding.posePresetId,
          });
          staleResult = stale();
          if (staleResult) return staleResult;
          displayMesh = snapshotMeasurementSurfaceMeshV1(posed.displayMesh);
          pose = Object.freeze({
            requestedPresetId: binding.posePresetId,
            resolvedPresetId: posed.presetId,
            status: 'posed' as const,
            maximumJointPivotResidualM: posed.maximumJointPivotResidualM,
          });
        } catch {
          staleResult = stale();
          if (staleResult) return staleResult;
          displayMesh = snapshotMeasurementSurfaceMeshV1(waistHipRuntime.displayMesh);
          pose = Object.freeze({
            requestedPresetId: binding.posePresetId,
            resolvedPresetId: 'a-rest' as const,
            status: 'fallback' as const,
            maximumJointPivotResidualM: null,
          });
        }
      }

      staleResult = stale();
      if (staleResult) return staleResult;
      const owned: MeasurementOpenReferenceDisplaySnapshotV1 = Object.freeze({
        version: MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_V1,
        role: 'PER_MODEL_DISPLAY_RESEARCH_SNAPSHOT' as const,
        binding: cloneBinding(binding),
        displayMesh: snapshotMeasurementSurfaceMeshV1(displayMesh),
        waistHip: Object.freeze({
          status: waistHipRuntime.status,
          representedGeometricProxies: Object.freeze([
            ...waistHipRuntime.representedGeometricProxies,
          ]),
        }),
        limbs: Object.freeze({
          status: limbStatus,
          requestedGeometricProxies: Object.freeze([...requestedLimbs]),
          representedGeometricProxies: Object.freeze([...representedLimbs]),
        }),
        pose,
        claims: CLAIMS,
      });
      current = owned;
      return Object.freeze({ status: 'committed' as const, snapshot: cloneSnapshot(owned) });
    } catch (reason: unknown) {
      if (generation !== reservedGeneration) {
        return Object.freeze({
          status: 'stale' as const,
          binding: cloneBinding(binding),
          reason: 'superseded' as const,
        });
      }
      return Object.freeze({
        status: 'blocked' as const,
        code: 'build-failed' as const,
        message: reason instanceof Error ? reason.message : 'Display snapshot build failed.',
      });
    }
  };

  return Object.freeze({
    build,
    invalidate,
    current: () => (current ? cloneSnapshot(current) : null),
    isCurrent: (binding: MeasurementOpenReferenceDisplaySnapshotBindingV1) =>
      current !== null && bindingKey(current.binding) === bindingKey(binding),
  });
}
