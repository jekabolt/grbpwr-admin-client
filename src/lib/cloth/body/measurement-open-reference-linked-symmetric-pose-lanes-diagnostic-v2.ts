import {
  type MakeHumanCoreRigBundleV1,
  type MakeHumanCoreRigPosePresetV1,
  type MakeHumanPoseRotationV1,
} from './makehuman-core-rig-pose-research-v1';
import {
  deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1,
  poseMakeHumanUniformWaistHipDisplayResearchV1,
  type MakeHumanWaistHipRigAnchorDeltaBundleV1,
} from './makehuman-waist-hip-rig-anchor-research-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import {
  snapshotMeasurementSurfaceMeshV1,
  type MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import type { MeasurementSurfaceMeshV1 } from './measurement-watertight-surface-v1';

export const MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2 =
  'measurement-open-reference-linked-symmetric-pose-lanes-diagnostic/v2' as const;

export const MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2 = Object.freeze({
  revision: 'linked-symmetric-arm-pose-lanes/v2' as const,
  relaxDegrees: Object.freeze([0, 1, 2, 3, 4] as const),
  raiseDegrees: Object.freeze([5, 10, 15, 20, 25] as const),
  axis: 'z' as const,
  symmetry: 'linked-left-right-mirrored' as const,
  composition: 'one-lane-at-a-time' as const,
});

export type MeasurementOpenReferenceRelaxPoseLaneDegreesV2 =
  (typeof MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.relaxDegrees)[number];
export type MeasurementOpenReferenceRaisePoseLaneDegreesV2 =
  (typeof MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.raiseDegrees)[number];

export type MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2 =
  | Readonly<{
      lane: 'relax';
      degrees: MeasurementOpenReferenceRelaxPoseLaneDegreesV2;
    }>
  | Readonly<{
      lane: 'raise';
      degrees: MeasurementOpenReferenceRaisePoseLaneDegreesV2;
    }>;

export interface MeasurementOpenReferenceLinkedSymmetricPoseLaneResourcesV2 {
  readonly rig: MakeHumanCoreRigBundleV1;
  readonly anchors: MakeHumanWaistHipRigAnchorDeltaBundleV1;
}

export interface MeasurementOpenReferenceLinkedSymmetricPoseLaneResultV2 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2;
  readonly parameterRevision: typeof MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.revision;
  readonly configurationId:
    | `relax-${MeasurementOpenReferenceRelaxPoseLaneDegreesV2}`
    | `raise-${MeasurementOpenReferenceRaisePoseLaneDegreesV2}`;
  readonly input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
  readonly rotations: readonly MakeHumanPoseRotationV1[];
  readonly displayMesh: MeasurementSurfaceMeshV1;
  readonly maximumJointPivotResidualM: number;
  readonly claims: {
    readonly diagnosticOnly: true;
    readonly displayOnly: true;
    readonly linkedSymmetryOnly: true;
    readonly oneLaneAtATimeOnly: true;
    readonly combinedLaneSafetyClaimed: false;
    readonly continuousIntervalSafetyClaimed: false;
    readonly integratedInSnapshotOwner: false;
    readonly integratedInModelForm: false;
    readonly initializationAdmitted: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
    readonly productionAuthority: false;
  };
}

const CLAIMS = Object.freeze({
  diagnosticOnly: true as const,
  displayOnly: true as const,
  linkedSymmetryOnly: true as const,
  oneLaneAtATimeOnly: true as const,
  combinedLaneSafetyClaimed: false as const,
  continuousIntervalSafetyClaimed: false as const,
  integratedInSnapshotOwner: false as const,
  integratedInModelForm: false as const,
  initializationAdmitted: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  productionAuthority: false as const,
});

const INPUT_KEYS = Object.freeze(['lane', 'degrees'] as const);

function validateInput(
  input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
): MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2 {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('pose input must be a plain record.');
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('pose input must use a plain prototype.');
  }
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== INPUT_KEYS.length ||
    keys.some((key) => typeof key !== 'string' || !INPUT_KEYS.includes(key as 'lane' | 'degrees'))
  ) {
    throw new RangeError('pose input contains missing, mixed, asymmetric, or unknown controls.');
  }
  const laneDescriptor = Reflect.getOwnPropertyDescriptor(input, 'lane');
  const degreesDescriptor = Reflect.getOwnPropertyDescriptor(input, 'degrees');
  if (
    laneDescriptor == null ||
    degreesDescriptor == null ||
    !Object.hasOwn(laneDescriptor, 'value') ||
    !Object.hasOwn(degreesDescriptor, 'value')
  ) {
    throw new TypeError('pose input lane and degrees must use plain data descriptors.');
  }
  const lane: unknown = laneDescriptor.value;
  const degrees: unknown = degreesDescriptor.value;
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) {
    throw new RangeError('pose degrees must be finite.');
  }
  if (lane === 'relax') {
    const admitted =
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.relaxDegrees.find(
        (candidate) => candidate === degrees,
      );
    if (admitted == null) {
      throw new RangeError('relax degrees must be one of 0, 1, 2, 3, or 4.');
    }
    return Object.freeze({ lane: 'relax' as const, degrees: admitted });
  }
  if (lane === 'raise') {
    const admitted =
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.raiseDegrees.find(
        (candidate) => candidate === degrees,
      );
    if (admitted == null) {
      throw new RangeError('raise degrees must be one of 5, 10, 15, 20, or 25.');
    }
    return Object.freeze({ lane: 'raise' as const, degrees: admitted });
  }
  throw new RangeError('pose lane must be relax or raise.');
}

export function measurementOpenReferenceLinkedSymmetricPoseRotationsV2(
  input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
): readonly MakeHumanPoseRotationV1[] {
  const validated = validateInput(input);
  if (validated.lane === 'relax') {
    if (validated.degrees === 0) return Object.freeze([]);
    return Object.freeze([
      Object.freeze({ bone: 'shoulder01.L', axis: 'z' as const, degrees: -validated.degrees }),
      Object.freeze({ bone: 'shoulder01.R', axis: 'z' as const, degrees: validated.degrees }),
      Object.freeze({
        bone: 'lowerarm01.L',
        axis: 'z' as const,
        degrees: -2 * validated.degrees,
      }),
      Object.freeze({
        bone: 'lowerarm01.R',
        axis: 'z' as const,
        degrees: 2 * validated.degrees,
      }),
    ]);
  }
  return Object.freeze([
    Object.freeze({ bone: 'upperarm01.L', axis: 'z' as const, degrees: validated.degrees }),
    Object.freeze({ bone: 'upperarm01.R', axis: 'z' as const, degrees: -validated.degrees }),
  ]);
}

export function linkedSymmetricPoseLaneDiagnosticSourceRevisionV2(sourceRevision: string): string {
  if (sourceRevision.length === 0 || sourceRevision !== sourceRevision.trim()) {
    throw new RangeError('sourceRevision must be a non-empty trimmed string.');
  }
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return `${sourceRevision};linkedPoseDiagnosticRevision=${MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2};linkedPoseParameterRevision=${MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.revision};displayPoseRigSha256=${metadata.rigSha256};displayPoseAnchorSha256=${metadata.anchorSha256}`;
}

/**
 * Pure caller-supplied-resource diagnostic. It is intentionally absent from the V1 snapshot owner,
 * ModelForm, initialization, collision, fit, persistence, and deployment paths.
 */
export function createMeasurementOpenReferenceLinkedSymmetricPoseLaneDiagnosticV2(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly resources: MeasurementOpenReferenceLinkedSymmetricPoseLaneResourcesV2;
  readonly input: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
}): MeasurementOpenReferenceLinkedSymmetricPoseLaneResultV2 {
  const input = validateInput(options.input);
  const rotations = measurementOpenReferenceLinkedSymmetricPoseRotationsV2(input);
  if (
    options.proxyRuntime.openReference.provenance.basis.kind !== options.basis.kind ||
    options.proxyRuntime.displayMesh.positions.length !==
      options.basis.positionsSourceUnits.length ||
    options.proxyRuntime.displayMesh.indices.length !== options.basis.indices.length
  ) {
    throw new Error('Linked pose diagnostic basis and shaped display mesh do not match.');
  }

  let displayMesh: MeasurementSurfaceMeshV1;
  let maximumJointPivotResidualM = 0;
  if (input.lane === 'relax' && input.degrees === 0) {
    displayMesh = snapshotMeasurementSurfaceMeshV1(options.proxyRuntime.displayMesh);
  } else {
    const anchorsM = deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1({
      rigBundle: options.resources.rig,
      anchorDeltaBundle: options.resources.anchors,
      basisKind: options.basis.kind,
      sourceMinimumY: options.basis.sourceMinimumY,
      sourceMaximumY: options.basis.sourceMaximumY,
      heightMm: options.measurements.heightMm,
      modeResults: options.proxyRuntime.modeResults,
    });
    const preset = Object.freeze({
      id: input.lane === 'relax' ? ('relaxed-symmetric' as const) : ('near-t' as const),
      label: `${input.lane} ${input.degrees} linked diagnostic`,
      rotations,
      symmetric: true as const,
      researchOnly: true as const,
    }) satisfies MakeHumanCoreRigPosePresetV1;
    const posed = poseMakeHumanUniformWaistHipDisplayResearchV1({
      rigBundle: options.resources.rig,
      positionsM: options.proxyRuntime.displayMesh.positions,
      anchorsM,
      preset,
    });
    maximumJointPivotResidualM = posed.maximumJointPivotResidualM;
    if (maximumJointPivotResidualM > 1e-7) {
      throw new Error('Linked pose diagnostic joint-pivot continuity gate failed.');
    }
    displayMesh = snapshotMeasurementSurfaceMeshV1({
      ...options.proxyRuntime.displayMesh,
      positions: posed.positionsM,
    });
  }

  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2,
    parameterRevision:
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.revision,
    configurationId:
      input.lane === 'relax'
        ? (`relax-${input.degrees}` as const)
        : (`raise-${input.degrees}` as const),
    input,
    rotations,
    displayMesh,
    maximumJointPivotResidualM,
    claims: CLAIMS,
  });
}
