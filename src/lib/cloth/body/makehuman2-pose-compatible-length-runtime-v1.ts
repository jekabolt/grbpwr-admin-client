import {
  poseMakeHumanCoreRigPositionsWithRestHeadsResearchV1,
  type MakeHumanCoreRigBundleV1,
  type MakeHumanCoreRigPosePresetV1,
} from './makehuman-core-rig-pose-research-v1';
import { evaluateMeasurementOpenReferenceDisplayQualityV1 } from './measurement-open-reference-display-quality-gate-v1';
import type { MakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';
import {
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1,
  type MakeHuman2PoseCompatibleLengthModeIdV1,
  type MakeHuman2PoseCompatibleLengthPackV1,
} from './makehuman2-pose-compatible-length-pack-v1';

export const MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_RUNTIME_V1 =
  'makehuman2-pose-compatible-length-runtime/v1' as const;

type Vec3 = readonly [number, number, number];
type Side = 'L' | 'R';

export type MakeHuman2PoseCompatibleLengthCoefficientsV1 = Readonly<
  Partial<Record<MakeHuman2PoseCompatibleLengthModeIdV1, number>>
>;

export interface MakeHuman2PoseCompatibleLengthJointResultV1 {
  readonly key: string;
  readonly positionSourceUnits: Vec3;
}

const REPRESENTATION = Object.freeze({
  sourceLengthModes: Object.freeze({
    status: 'exact' as const,
    semantics:
      'Exact bounded [0,1] application of the eight pinned MakeHuman2 source target directions, including helper-vertex joint recomputation.',
  }),
  armLengthMm: Object.freeze({
    status: 'limited' as const,
    semantics:
      'Bilateral upperarm-head to lowerarm-head to wrist-head centerline proxy; not the canonical straight acromion-to-radial-styloid sleeve endpoint span.',
  }),
  inseamMm: Object.freeze({
    status: 'unrepresented' as const,
    semantics:
      'Upper/lower leg source modes and coherent joints are available, but no reviewed crotch landmark maps them to canonical barefoot crotch-to-floor inseam.',
  }),
});

const CLAIMS = Object.freeze({
  researchOnly: true as const,
  visibleAndHelperModesComposed: true as const,
  allPackedLimbJointsRecomputed: true as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  realBodyValidationClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  productionRuntimeApproved: false as const,
});

export interface MakeHuman2PoseCompatibleLengthRuntimeResultV1 {
  readonly version: typeof MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_RUNTIME_V1;
  readonly role: 'CC0_POSE_COMPATIBLE_LENGTH_RESEARCH_CANDIDATE';
  readonly basisKind: MakeHumanOpenReferenceBasisV1['kind'];
  readonly positionsSourceUnits: Float32Array;
  readonly joints: readonly MakeHuman2PoseCompatibleLengthJointResultV1[];
  readonly modeCoefficients: Readonly<Record<MakeHuman2PoseCompatibleLengthModeIdV1, number>>;
  readonly maximumRecomputedJointDeltaSourceUnits: number;
  readonly maximumVisibleOnlyStalePivotDriftSourceUnits: number;
  readonly qualityGate: ReturnType<typeof evaluateMeasurementOpenReferenceDisplayQualityV1>;
  readonly representation: typeof REPRESENTATION;
  readonly claims: typeof CLAIMS;
}

function coefficientRecord(
  input: MakeHuman2PoseCompatibleLengthCoefficientsV1,
): Record<MakeHuman2PoseCompatibleLengthModeIdV1, number> {
  const result = Object.fromEntries(
    MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1.map((id) => {
      const coefficient = input[id] ?? 0;
      if (!Number.isFinite(coefficient) || coefficient < 0 || coefficient > 1) {
        throw new RangeError(`${id} coefficient must be within 0..1.`);
      }
      return [id, coefficient];
    }),
  ) as Record<MakeHuman2PoseCompatibleLengthModeIdV1, number>;
  for (const segment of ['upperArmLength', 'lowerArmLength', 'upperLegLength', 'lowerLegLength']) {
    const decrease = result[`${segment}:decrease` as MakeHuman2PoseCompatibleLengthModeIdV1];
    const increase = result[`${segment}:increase` as MakeHuman2PoseCompatibleLengthModeIdV1];
    if (decrease > 0 && increase > 0) {
      throw new RangeError(`${segment} cannot apply decrease and increase simultaneously.`);
    }
  }
  return result;
}

function validateBindings(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly rigBundle: MakeHumanCoreRigBundleV1;
  readonly pack: MakeHuman2PoseCompatibleLengthPackV1;
}): void {
  const { basis, rigBundle, pack } = options;
  if (
    basis.positionsSourceUnits.length !== pack.visibleVertexCount * 3 ||
    basis.indices.length === 0 ||
    rigBundle.visibleVertexCount !== pack.visibleVertexCount ||
    rigBundle.fullSourceVertexCount !== pack.vertexCount ||
    Math.abs(basis.sourceUnitScaleToM - pack.sourceUnitScaleToM) > 1e-12 ||
    Math.abs(rigBundle.sourceUnitScaleToM - pack.sourceUnitScaleToM) > 1e-12
  ) {
    throw new Error('Length pack, repaired basis and core rig are not topology/scale compatible.');
  }
  if (!basis.positionsSourceUnits.every(Number.isFinite)) {
    throw new TypeError('Length runtime basis contains non-finite positions.');
  }
}

function helperIndexByVertex(pack: MakeHuman2PoseCompatibleLengthPackV1): Map<number, number> {
  return new Map(Array.from(pack.helperVertexIndices, (vertex, index) => [vertex, index]));
}

function recomputePackedJoints(
  pack: MakeHuman2PoseCompatibleLengthPackV1,
  coefficients: Readonly<Record<MakeHuman2PoseCompatibleLengthModeIdV1, number>>,
  visibleBasePositionsSourceUnits: Float32Array,
  applyHelperDeltas = true,
): readonly MakeHuman2PoseCompatibleLengthJointResultV1[] {
  if (visibleBasePositionsSourceUnits.length !== pack.visibleVertexCount * 3) {
    throw new Error('Packed joint recomputation requires every visible basis position.');
  }
  const visiblePositions = visibleBasePositionsSourceUnits.slice();
  const helperPositions = pack.helperBasePositionsSourceUnits.slice();
  const helperOffsets = helperIndexByVertex(pack);
  pack.modes.forEach((mode) => {
    const coefficient = coefficients[mode.id];
    if (coefficient === 0) return;
    mode.vertexIndices.forEach((vertex, record) => {
      const helper = helperOffsets.get(vertex);
      const deltaOffset = record * 3;
      if (helper === undefined) {
        if (vertex >= pack.visibleVertexCount) {
          throw new Error(`${mode.id} references an unbased helper vertex.`);
        }
        const visibleOffset = vertex * 3;
        visiblePositions[visibleOffset] += mode.deltasSourceUnits[deltaOffset] * coefficient;
        visiblePositions[visibleOffset + 1] +=
          mode.deltasSourceUnits[deltaOffset + 1] * coefficient;
        visiblePositions[visibleOffset + 2] +=
          mode.deltasSourceUnits[deltaOffset + 2] * coefficient;
      } else {
        if (!applyHelperDeltas) return;
        const helperOffset = helper * 3;
        helperPositions[helperOffset] += mode.deltasSourceUnits[deltaOffset] * coefficient;
        helperPositions[helperOffset + 1] += mode.deltasSourceUnits[deltaOffset + 1] * coefficient;
        helperPositions[helperOffset + 2] += mode.deltasSourceUnits[deltaOffset + 2] * coefficient;
      }
    });
  });
  return Object.freeze(
    pack.joints.map((joint) => {
      const sum: [number, number, number] = [0, 0, 0];
      joint.vertexIndices.forEach((vertex) => {
        const helper = helperOffsets.get(vertex);
        if (helper === undefined && vertex >= pack.visibleVertexCount) {
          throw new Error(`Packed joint ${joint.key} references an unbased helper vertex.`);
        }
        const positions = helper === undefined ? visiblePositions : helperPositions;
        const offset = (helper ?? vertex) * 3;
        sum[0] += positions[offset];
        sum[1] += positions[offset + 1];
        sum[2] += positions[offset + 2];
      });
      const count = joint.vertexIndices.length;
      return Object.freeze({
        key: joint.key,
        positionSourceUnits: Object.freeze([
          sum[0] / count,
          sum[1] / count,
          sum[2] / count,
        ] as const),
      });
    }),
  );
}

function rigJointPositions(
  rigBundle: MakeHumanCoreRigBundleV1,
  basisKind: MakeHumanOpenReferenceBasisV1['kind'],
  keys: readonly string[],
): readonly MakeHuman2PoseCompatibleLengthJointResultV1[] {
  const basis = rigBundle.bases.find((candidate) => candidate.kind === basisKind);
  if (!basis) throw new Error(`Core rig is missing ${basisKind} basis anchors.`);
  const boneByName = new Map(rigBundle.bones.map((bone, index) => [bone.name, index]));
  return Object.freeze(
    keys.map((key) => {
      const match = /^(.*)____(head|tail)$/.exec(key);
      if (!match) throw new Error(`Packed joint key ${key} is invalid.`);
      const bone = boneByName.get(match[1]);
      if (bone === undefined) throw new Error(`Core rig is missing packed bone ${match[1]}.`);
      const source = match[2] === 'head' ? basis.headsSourceUnits : basis.tailsSourceUnits;
      const offset = bone * 3;
      return Object.freeze({
        key,
        positionSourceUnits: Object.freeze([
          source[offset],
          source[offset + 1],
          source[offset + 2],
        ] as const),
      });
    }),
  );
}

function addHelperDeltasToRigBasis(
  packBase: readonly MakeHuman2PoseCompatibleLengthJointResultV1[],
  packDeformed: readonly MakeHuman2PoseCompatibleLengthJointResultV1[],
  rigBase: readonly MakeHuman2PoseCompatibleLengthJointResultV1[],
): {
  readonly joints: readonly MakeHuman2PoseCompatibleLengthJointResultV1[];
  readonly maximumDelta: number;
} {
  let maximumDelta = 0;
  const joints = packBase.map((base, index) => {
    const deformed = packDeformed[index];
    const rig = rigBase[index];
    if (base.key !== deformed.key || base.key !== rig.key) {
      throw new Error('Length pack and rig joint ordering is incompatible.');
    }
    const delta: Vec3 = [
      deformed.positionSourceUnits[0] - base.positionSourceUnits[0],
      deformed.positionSourceUnits[1] - base.positionSourceUnits[1],
      deformed.positionSourceUnits[2] - base.positionSourceUnits[2],
    ];
    maximumDelta = Math.max(maximumDelta, Math.hypot(...delta));
    return Object.freeze({
      key: base.key,
      positionSourceUnits: Object.freeze([
        rig.positionSourceUnits[0] + delta[0],
        rig.positionSourceUnits[1] + delta[1],
        rig.positionSourceUnits[2] + delta[2],
      ] as const),
    });
  });
  return Object.freeze({ joints: Object.freeze(joints), maximumDelta });
}

function maximumJointDistance(
  left: readonly MakeHuman2PoseCompatibleLengthJointResultV1[],
  right: readonly MakeHuman2PoseCompatibleLengthJointResultV1[],
): number {
  if (left.length !== right.length) throw new Error('Joint sets are incompatible.');
  let maximum = 0;
  left.forEach((value, index) => {
    const other = right[index];
    if (value.key !== other.key) throw new Error('Joint sets are not key-aligned.');
    maximum = Math.max(
      maximum,
      Math.hypot(
        value.positionSourceUnits[0] - other.positionSourceUnits[0],
        value.positionSourceUnits[1] - other.positionSourceUnits[1],
        value.positionSourceUnits[2] - other.positionSourceUnits[2],
      ),
    );
  });
  return maximum;
}

function composeLengthJoints(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly rigBundle: MakeHumanCoreRigBundleV1;
  readonly pack: MakeHuman2PoseCompatibleLengthPackV1;
  readonly coefficients: Readonly<Record<MakeHuman2PoseCompatibleLengthModeIdV1, number>>;
}): {
  readonly joints: readonly MakeHuman2PoseCompatibleLengthJointResultV1[];
  readonly maximumDelta: number;
  readonly maximumVisibleOnlyStalePivotDrift: number;
} {
  const packBaseJoints = recomputePackedJoints(
    options.pack,
    coefficientRecord({}),
    options.basis.positionsSourceUnits,
  );
  const packDeformedJoints = recomputePackedJoints(
    options.pack,
    options.coefficients,
    options.basis.positionsSourceUnits,
  );
  const packVisibleOnlyJoints = recomputePackedJoints(
    options.pack,
    options.coefficients,
    options.basis.positionsSourceUnits,
    false,
  );
  const rigBaseJoints = rigJointPositions(
    options.rigBundle,
    options.basis.kind,
    packBaseJoints.map(({ key }) => key),
  );
  const composed = addHelperDeltasToRigBasis(packBaseJoints, packDeformedJoints, rigBaseJoints);
  return Object.freeze({
    ...composed,
    maximumVisibleOnlyStalePivotDrift: maximumJointDistance(
      packDeformedJoints,
      packVisibleOnlyJoints,
    ),
  });
}

/**
 * Composes exact sparse visible deltas with any repaired basis and composes exact helper-derived
 * joint deltas with that basis' authenticated core-rig anchors. This avoids applying pose around
 * stale base-shape pivots without pretending helper vertices describe the repaired gender basis.
 */
export function applyMakeHuman2PoseCompatibleLengthModesResearchV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly rigBundle: MakeHumanCoreRigBundleV1;
  readonly pack: MakeHuman2PoseCompatibleLengthPackV1;
  readonly modeCoefficients?: MakeHuman2PoseCompatibleLengthCoefficientsV1;
}): MakeHuman2PoseCompatibleLengthRuntimeResultV1 {
  validateBindings(options);
  const coefficients = Object.freeze(coefficientRecord(options.modeCoefficients ?? {}));
  const positions = options.basis.positionsSourceUnits.slice();
  options.pack.modes.forEach((mode) => {
    const coefficient = coefficients[mode.id];
    if (coefficient === 0) return;
    mode.vertexIndices.forEach((vertex, record) => {
      if (vertex >= options.pack.visibleVertexCount) return;
      const positionOffset = vertex * 3;
      const deltaOffset = record * 3;
      positions[positionOffset] += mode.deltasSourceUnits[deltaOffset] * coefficient;
      positions[positionOffset + 1] += mode.deltasSourceUnits[deltaOffset + 1] * coefficient;
      positions[positionOffset + 2] += mode.deltasSourceUnits[deltaOffset + 2] * coefficient;
    });
  });
  if (!positions.every(Number.isFinite)) {
    throw new Error('Pose-compatible length modes produced non-finite visible positions.');
  }
  const composed = composeLengthJoints({ ...options, coefficients });
  const qualityGate = evaluateMeasurementOpenReferenceDisplayQualityV1({
    uniformPositionsM: options.basis.positionsSourceUnits,
    personalizedPositionsM: positions,
    triangleIndices: options.basis.indices,
  });
  return Object.freeze({
    version: MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_RUNTIME_V1,
    role: 'CC0_POSE_COMPATIBLE_LENGTH_RESEARCH_CANDIDATE' as const,
    basisKind: options.basis.kind,
    positionsSourceUnits: positions,
    joints: composed.joints,
    modeCoefficients: coefficients,
    maximumRecomputedJointDeltaSourceUnits: composed.maximumDelta,
    maximumVisibleOnlyStalePivotDriftSourceUnits: composed.maximumVisibleOnlyStalePivotDrift,
    qualityGate,
    representation: REPRESENTATION,
    claims: CLAIMS,
  });
}

function joint(joints: readonly MakeHuman2PoseCompatibleLengthJointResultV1[], key: string): Vec3 {
  const result = joints.find((candidate) => candidate.key === key);
  if (!result) throw new Error(`Length runtime is missing joint ${key}.`);
  return result.positionSourceUnits;
}

function distance(left: Vec3, right: Vec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function segmentLength(
  joints: readonly MakeHuman2PoseCompatibleLengthJointResultV1[],
  side: Side,
  segment: 'upper' | 'lower',
): number {
  const first =
    segment === 'upper'
      ? joint(joints, `upperarm01.${side}____head`)
      : joint(joints, `lowerarm01.${side}____head`);
  const second =
    segment === 'upper'
      ? joint(joints, `lowerarm01.${side}____head`)
      : joint(joints, `wrist.${side}____head`);
  return distance(first, second);
}

function averageSegmentLength(
  result: MakeHuman2PoseCompatibleLengthRuntimeResultV1,
  segment: 'upper' | 'lower',
): number {
  return averageSegmentLengthForJoints(result.joints, segment);
}

function averageSegmentLengthForJoints(
  joints: readonly MakeHuman2PoseCompatibleLengthJointResultV1[],
  segment: 'upper' | 'lower',
): number {
  return (segmentLength(joints, 'L', segment) + segmentLength(joints, 'R', segment)) / 2;
}

function solveSegmentCoefficient(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly rigBundle: MakeHumanCoreRigBundleV1;
  readonly pack: MakeHuman2PoseCompatibleLengthPackV1;
  readonly modeId: MakeHuman2PoseCompatibleLengthModeIdV1;
  readonly segment: 'upper' | 'lower';
  readonly targetSourceUnits: number;
  readonly baseline: number;
}): Readonly<{ coefficient: number; achievedSourceUnits: number; bounded: boolean }> {
  const atOne = averageSegmentLengthForJoints(
    composeLengthJoints({
      ...options,
      coefficients: coefficientRecord({ [options.modeId]: 1 }),
    }).joints,
    options.segment,
  );
  const minimum = Math.min(options.baseline, atOne);
  const maximum = Math.max(options.baseline, atOne);
  const boundedTarget = Math.min(maximum, Math.max(minimum, options.targetSourceUnits));
  const bounded = Math.abs(boundedTarget - options.targetSourceUnits) > 1e-8;
  if (Math.abs(boundedTarget - options.baseline) <= 1e-8) {
    return Object.freeze({
      coefficient: 0,
      achievedSourceUnits: options.baseline,
      bounded,
    });
  }
  const increasing = atOne > options.baseline;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (low + high) / 2;
    const current = averageSegmentLengthForJoints(
      composeLengthJoints({
        ...options,
        coefficients: coefficientRecord({ [options.modeId]: middle }),
      }).joints,
      options.segment,
    );
    if (current < boundedTarget === increasing) low = middle;
    else high = middle;
  }
  const coefficient = (low + high) / 2;
  const achievedSourceUnits = averageSegmentLengthForJoints(
    composeLengthJoints({
      ...options,
      coefficients: coefficientRecord({ [options.modeId]: coefficient }),
    }).joints,
    options.segment,
  );
  return Object.freeze({ coefficient, achievedSourceUnits, bounded });
}

export type MakeHuman2ArmLengthProxyRuntimeResultV1 =
  | {
      readonly ok: true;
      readonly runtime: MakeHuman2PoseCompatibleLengthRuntimeResultV1;
      readonly requestedCanonicalFieldMm: number;
      readonly achievedCenterlineProxyMm: number;
      readonly targetStatus: 'matched-proxy' | 'bounded-endpoint';
      readonly metricScaleMPerSourceUnit: number;
      readonly representation: typeof REPRESENTATION;
      readonly diagnostics: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: 'input-invalid' | 'proxy-target-out-of-bounds' | 'quality-gate-rejected';
      readonly errors: readonly string[];
      readonly representation: typeof REPRESENTATION;
      readonly diagnostics: readonly string[];
    };

const ARM_DIAGNOSTICS = Object.freeze([
  'armLengthMm remains a limited skeleton-centerline visual proxy, not canonical sleeve endpoint geometry.',
  'The upper/lower split preserves the selected repaired basis segment ratio and is not population calibration.',
]);

function armFailure(
  code: Extract<MakeHuman2ArmLengthProxyRuntimeResultV1, { ok: false }>['code'],
  errors: readonly string[],
): MakeHuman2ArmLengthProxyRuntimeResultV1 {
  return Object.freeze({
    ok: false as const,
    code,
    errors: Object.freeze([...new Set(errors)]),
    representation: REPRESENTATION,
    diagnostics: ARM_DIAGNOSTICS,
  });
}

/**
 * Research candidate for the existing armLengthMm field. Success means the bounded bilateral
 * skeleton-centerline proxy applied either the requested proxy value or its nearest source endpoint
 * and passed local geometry quality; it never upgrades the field to canonical sleeve semantics.
 */
export function createMakeHuman2ArmLengthProxyRuntimeResearchV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly rigBundle: MakeHumanCoreRigBundleV1;
  readonly pack: MakeHuman2PoseCompatibleLengthPackV1;
  readonly armLengthMm: number;
  readonly heightMm: number;
}): MakeHuman2ArmLengthProxyRuntimeResultV1 {
  try {
    if (!Number.isFinite(options.armLengthMm) || options.armLengthMm <= 0) {
      throw new RangeError('armLengthMm must be finite and positive.');
    }
    if (!Number.isFinite(options.heightMm) || options.heightMm <= 0) {
      throw new RangeError('heightMm must be finite and positive.');
    }
    const sourceHeight = options.basis.sourceMaximumY - options.basis.sourceMinimumY;
    const metricScaleMPerSourceUnit = options.heightMm / 1000 / sourceHeight;
    const baseline = applyMakeHuman2PoseCompatibleLengthModesResearchV1(options);
    const baselineUpper = averageSegmentLength(baseline, 'upper');
    const baselineLower = averageSegmentLength(baseline, 'lower');
    const requestedSourceUnits = options.armLengthMm / 1000 / metricScaleMPerSourceUnit;
    const targetUpper = requestedSourceUnits * (baselineUpper / (baselineUpper + baselineLower));
    const targetLower = requestedSourceUnits - targetUpper;
    const upperModeId =
      `${targetUpper < baselineUpper ? 'upperArmLength:decrease' : 'upperArmLength:increase'}` as MakeHuman2PoseCompatibleLengthModeIdV1;
    const lowerModeId =
      `${targetLower < baselineLower ? 'lowerArmLength:decrease' : 'lowerArmLength:increase'}` as MakeHuman2PoseCompatibleLengthModeIdV1;
    const upperSolve = solveSegmentCoefficient({
      ...options,
      modeId: upperModeId,
      segment: 'upper',
      targetSourceUnits: targetUpper,
      baseline: baselineUpper,
    });
    const lowerSolve = solveSegmentCoefficient({
      ...options,
      modeId: lowerModeId,
      segment: 'lower',
      targetSourceUnits: targetLower,
      baseline: baselineLower,
    });
    const runtime = applyMakeHuman2PoseCompatibleLengthModesResearchV1({
      ...options,
      modeCoefficients: {
        [upperModeId]: upperSolve.coefficient,
        [lowerModeId]: lowerSolve.coefficient,
      },
    });
    if (!runtime.qualityGate.safe) {
      return armFailure('quality-gate-rejected', [
        `Local geometry quality rejected the candidate: ${runtime.qualityGate.reasons.join(', ')}.`,
      ]);
    }
    const achievedCenterlineProxyMm =
      (averageSegmentLength(runtime, 'upper') + averageSegmentLength(runtime, 'lower')) *
      metricScaleMPerSourceUnit *
      1000;
    const targetStatus =
      upperSolve.bounded || lowerSolve.bounded
        ? ('bounded-endpoint' as const)
        : ('matched-proxy' as const);
    if (
      targetStatus === 'matched-proxy' &&
      Math.abs(achievedCenterlineProxyMm - options.armLengthMm) > 0.01
    ) {
      throw new Error('Arm centerline coefficient solve did not converge.');
    }
    return Object.freeze({
      ok: true as const,
      runtime,
      requestedCanonicalFieldMm: options.armLengthMm,
      achievedCenterlineProxyMm,
      targetStatus,
      metricScaleMPerSourceUnit,
      representation: REPRESENTATION,
      diagnostics: ARM_DIAGNOSTICS,
    });
  } catch (reason: unknown) {
    return armFailure('input-invalid', [reason instanceof Error ? reason.message : String(reason)]);
  }
}

export type MakeHuman2ArmLengthProxyAppliedV1 = Extract<
  MakeHuman2ArmLengthProxyRuntimeResultV1,
  { readonly ok: true }
>;

/**
 * Adds the authenticated length target's visible displacement to an already-shaped metric mesh.
 * This preserves preceding torso and circumference stages and does not reinterpret the skeleton
 * centerline as a canonical sleeve surface path.
 */
export function applyMakeHuman2ArmLengthProxyToDisplayPositionsMResearchV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly sourcePositionsM: Float32Array;
  readonly armProxy: MakeHuman2ArmLengthProxyAppliedV1;
}): Float32Array {
  const { basis, sourcePositionsM, armProxy } = options;
  if (
    armProxy.runtime.basisKind !== basis.kind ||
    sourcePositionsM.length !== basis.positionsSourceUnits.length ||
    armProxy.runtime.positionsSourceUnits.length !== basis.positionsSourceUnits.length
  ) {
    throw new Error('Arm-length proxy mesh binding is incompatible with the shaped basis.');
  }
  const positions = sourcePositionsM.slice();
  for (let index = 0; index < positions.length; index += 1) {
    positions[index] +=
      (armProxy.runtime.positionsSourceUnits[index] - basis.positionsSourceUnits[index]) *
      armProxy.metricScaleMPerSourceUnit;
  }
  if (!positions.every(Number.isFinite)) {
    throw new Error('Arm-length proxy composition produced non-finite metric positions.');
  }
  return positions;
}

/**
 * Adds the matching helper-backed source-joint displacements to already-derived metric anchors.
 * Waist/hip anchor adjustments remain intact because only the authenticated length delta is added.
 */
export function applyMakeHuman2ArmLengthProxyToRigAnchorsMResearchV1(options: {
  readonly armProxy?: MakeHuman2ArmLengthProxyAppliedV1;
  readonly rigBundle: MakeHumanCoreRigBundleV1;
  readonly basisKind: MakeHumanOpenReferenceBasisV1['kind'];
  readonly headsM: Float32Array;
  readonly tailsM: Float32Array;
  readonly rollDirections: Float32Array;
}): Readonly<{
  headsM: Float32Array;
  tailsM: Float32Array;
  rollDirections: Float32Array;
  lengthPackSha256: string | null;
}> {
  const { armProxy, rigBundle, basisKind } = options;
  const headsM = options.headsM.slice();
  const tailsM = options.tailsM.slice();
  const rollDirections = options.rollDirections.slice();
  if (!armProxy) {
    return Object.freeze({ headsM, tailsM, rollDirections, lengthPackSha256: null });
  }
  if (
    armProxy.runtime.basisKind !== basisKind ||
    headsM.length !== rigBundle.bones.length * 3 ||
    tailsM.length !== rigBundle.bones.length * 3 ||
    rollDirections.length !== rigBundle.bones.length * 3
  ) {
    throw new Error('Arm-length proxy anchor binding is incompatible with the authenticated rig.');
  }
  const rigBasis = rigBundle.bases.find((candidate) => candidate.kind === basisKind);
  if (!rigBasis) throw new Error(`Core rig is missing ${basisKind} arm-length anchors.`);
  const boneByName = new Map(rigBundle.bones.map((bone, index) => [bone.name, index]));
  armProxy.runtime.joints.forEach(({ key, positionSourceUnits }) => {
    const match = /^(.*)____(head|tail)$/.exec(key);
    if (!match) throw new Error(`Arm-length proxy joint key ${key} is invalid.`);
    const bone = boneByName.get(match[1]);
    if (bone === undefined) throw new Error(`Core rig is missing arm-length bone ${match[1]}.`);
    const source = match[2] === 'head' ? rigBasis.headsSourceUnits : rigBasis.tailsSourceUnits;
    const target = match[2] === 'head' ? headsM : tailsM;
    const offset = bone * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      target[offset + axis] +=
        (positionSourceUnits[axis] - source[offset + axis]) * armProxy.metricScaleMPerSourceUnit;
    }
  });
  for (let bone = 0; bone < rigBundle.bones.length; bone += 1) {
    const offset = bone * 3;
    const longitudinal = [
      tailsM[offset] - headsM[offset],
      tailsM[offset + 1] - headsM[offset + 1],
      tailsM[offset + 2] - headsM[offset + 2],
    ];
    const longitudinalLength = Math.hypot(...longitudinal);
    if (!(longitudinalLength > 1e-12)) {
      throw new Error(`Arm-length proxy collapsed rig bone ${rigBundle.bones[bone].name}.`);
    }
    const unitLongitudinal = longitudinal.map((value) => value / longitudinalLength);
    const roll = [rollDirections[offset], rollDirections[offset + 1], rollDirections[offset + 2]];
    const projection =
      roll[0] * unitLongitudinal[0] + roll[1] * unitLongitudinal[1] + roll[2] * unitLongitudinal[2];
    const orthogonal = roll.map(
      (value, component) => value - projection * unitLongitudinal[component],
    );
    const orthogonalLength = Math.hypot(...orthogonal);
    if (!(orthogonalLength > 1e-12)) {
      throw new Error(
        `Arm-length proxy cannot preserve rig roll for ${rigBundle.bones[bone].name}.`,
      );
    }
    for (let axis = 0; axis < 3; axis += 1) {
      rollDirections[offset + axis] = orthogonal[axis] / orthogonalLength;
    }
  }
  if (![headsM, tailsM, rollDirections].every((values) => values.every(Number.isFinite))) {
    throw new Error('Arm-length proxy anchor composition produced non-finite values.');
  }
  return Object.freeze({
    headsM,
    tailsM,
    rollDirections,
    lengthPackSha256: MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.sha256,
  });
}

export interface MakeHuman2PoseCompatibleLengthPosedResultV1 {
  readonly positionsSourceUnits: Float32Array;
  readonly presetId: MakeHumanCoreRigPosePresetV1['id'];
  readonly maximumJointPivotResidualSourceUnits: number;
  readonly restJoints: readonly MakeHuman2PoseCompatibleLengthJointResultV1[];
  readonly claims: typeof CLAIMS;
}

/** Poses only after replacing the affected core-rig rest heads with the 28 recomputed joints. */
export function poseMakeHuman2PoseCompatibleLengthResultResearchV1(options: {
  readonly runtime: MakeHuman2PoseCompatibleLengthRuntimeResultV1;
  readonly rigBundle: MakeHumanCoreRigBundleV1;
  readonly preset: MakeHumanCoreRigPosePresetV1;
}): MakeHuman2PoseCompatibleLengthPosedResultV1 {
  const basis = options.rigBundle.bases.find(
    (candidate) => candidate.kind === options.runtime.basisKind,
  );
  if (!basis) throw new Error(`Core rig is missing ${options.runtime.basisKind} basis anchors.`);
  const restHeads = basis.headsSourceUnits.slice();
  const boneByName = new Map(options.rigBundle.bones.map((bone, index) => [bone.name, index]));
  options.runtime.joints.forEach(({ key, positionSourceUnits }) => {
    const match = /^(.*)____head$/.exec(key);
    if (!match) return;
    const bone = boneByName.get(match[1]);
    if (bone === undefined) throw new Error(`Core rig is missing recomputed bone ${match[1]}.`);
    restHeads.set(positionSourceUnits, bone * 3);
  });
  const posed = poseMakeHumanCoreRigPositionsWithRestHeadsResearchV1({
    bundle: options.rigBundle,
    positions: options.runtime.positionsSourceUnits,
    restHeads,
    preset: options.preset,
  });
  return Object.freeze({
    positionsSourceUnits: posed.positions,
    presetId: options.preset.id,
    maximumJointPivotResidualSourceUnits: posed.maximumJointPivotResidual,
    restJoints: options.runtime.joints,
    claims: CLAIMS,
  });
}
