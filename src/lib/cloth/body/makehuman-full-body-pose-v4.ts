import {
  compileMakeHumanCloLikePoseDisplayV3,
  type MakeHumanCloLikePoseInputV3,
} from './makehuman-clo-like-pose-display-v3';
import {
  MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1,
  type MakeHumanLegBodyPartIkControlsV1,
} from './makehuman-leg-body-part-ik-v1';
import {
  mirrorMakeHumanLocalAnatomicalRotationAcrossSagittalXResearchV3,
  type MakeHumanLocalAnatomicalRotationV3,
} from './makehuman-local-joint-frame-research-v3';

export const MAKEHUMAN_FULL_BODY_POSE_V4 = 'makehuman-full-body-pose/v4' as const;

export interface MakeHumanFullBodyHeadControlsV4 {
  readonly headPitchDeg: number;
  readonly headYawDeg: number;
  readonly headSideDeg: number;
}

export interface MakeHumanShoulderPostureControlsV4 {
  /** Positive values round both shoulders forward; negative values open the chest. */
  readonly shoulderProtractionDeg: number;
  /** Positive values lift both shoulder origins. */
  readonly shoulderElevationDeg: number;
  /** Positive values lift the left shoulder and lower the right shoulder. */
  readonly shoulderLevelDeg: number;
}

export const MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4 = Object.freeze({
  headPitchDeg: Object.freeze({ minimumDeg: -25, maximumDeg: 25, stepDeg: 1 }),
  headYawDeg: Object.freeze({ minimumDeg: -45, maximumDeg: 45, stepDeg: 1 }),
  headSideDeg: Object.freeze({ minimumDeg: -20, maximumDeg: 20, stepDeg: 1 }),
} as const);

/** Conservative product interaction limits, not clinical range-of-motion authority. */
export const MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4 = Object.freeze({
  shoulderProtractionDeg: Object.freeze({ minimumDeg: -10, maximumDeg: 10, stepDeg: 1 }),
  shoulderElevationDeg: Object.freeze({ minimumDeg: -6, maximumDeg: 6, stepDeg: 1 }),
  shoulderLevelDeg: Object.freeze({ minimumDeg: -4, maximumDeg: 4, stepDeg: 1 }),
} as const);

type MakeHumanFullBodyLegInputV4 =
  | Readonly<{
      legSymmetry: 'bilateral';
      leg: MakeHumanLegBodyPartIkControlsV1;
    }>
  | Readonly<{
      legSymmetry: 'independent';
      leftLeg: MakeHumanLegBodyPartIkControlsV1;
      rightLeg: MakeHumanLegBodyPartIkControlsV1;
    }>;

export type MakeHumanFullBodyPoseInputV4 = MakeHumanCloLikePoseInputV3 &
  MakeHumanFullBodyHeadControlsV4 &
  Partial<MakeHumanShoulderPostureControlsV4> &
  MakeHumanFullBodyLegInputV4;

export interface MakeHumanFullBodyPoseCompiledV4 {
  readonly version: typeof MAKEHUMAN_FULL_BODY_POSE_V4;
  readonly input: MakeHumanFullBodyPoseInputV4;
  readonly rotations: readonly MakeHumanLocalAnatomicalRotationV3[];
  readonly claims: Readonly<{
    productInteractionEnvelopeOnly: true;
    authenticatedRigBoneAllowlistApplied: true;
    clinicalAnatomicalRangeAuthority: false;
    inverseKinematicsApplied: false;
    garmentPairEvaluated: false;
    fitClaimEligible: false;
    runtimeCollisionEligible: false;
    productionAuthority: false;
  }>;
}

const TORSO_KEYS = Object.freeze(['torsoFlexionDeg', 'torsoSideBendDeg', 'torsoTwistDeg']);
const HEAD_KEYS = Object.freeze(['headPitchDeg', 'headYawDeg', 'headSideDeg']);
const SHOULDER_POSTURE_KEYS = Object.freeze([
  'shoulderProtractionDeg',
  'shoulderElevationDeg',
  'shoulderLevelDeg',
] as const);
const LEG_KEYS = Object.freeze(['hipForwardDeg', 'hipSideDeg', 'kneeBendDeg', 'ankleBendDeg']);
const NECK_DISTRIBUTION = Object.freeze([
  Object.freeze({ bone: 'neck01', weight: 0.35 }),
  Object.freeze({ bone: 'neck02', weight: 0.4 }),
  Object.freeze({ bone: 'neck03', weight: 0.25 }),
] as const);
const CLAIMS = Object.freeze({
  productInteractionEnvelopeOnly: true as const,
  authenticatedRigBoneAllowlistApplied: true as const,
  clinicalAnatomicalRangeAuthority: false as const,
  inverseKinematicsApplied: false as const,
  garmentPairEvaluated: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  productionAuthority: false as const,
});
// The three authenticated bases use slightly different upper-arm rest frames. These coefficients
// express the inverse girdle rotation in each basis' upperarm01 anatomical components; the runtime
// integration gate holds the resulting neutral arm-direction drift below 0.1 degrees.
const SHOULDER_PROTRACTION_COMPENSATION = Object.freeze({
  neutral: Object.freeze({ transverseXFactor: -0.0739, transverseZFactor: 0.6398 }),
  male: Object.freeze({ transverseXFactor: -0.0898, transverseZFactor: 0.6331 }),
  female: Object.freeze({ transverseXFactor: -0.0533, transverseZFactor: 0.6361 }),
} as const);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new RangeError(`${label} must contain exactly: ${canonical.join(', ')}.`);
  }
}

function channelValue(
  value: unknown,
  channel:
    | keyof typeof MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4
    | keyof typeof MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4
    | keyof typeof MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1,
): number {
  const definition =
    channel in MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4
      ? MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4[
          channel as keyof typeof MAKEHUMAN_FULL_BODY_HEAD_ENVELOPE_V4
        ]
      : channel in MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4
        ? MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4[
            channel as keyof typeof MAKEHUMAN_SHOULDER_POSTURE_ENVELOPE_V4
          ]
        : MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1[
            channel as keyof typeof MAKEHUMAN_LEG_BODY_PART_IK_ENVELOPE_V1
          ];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${channel} must be finite.`);
  }
  if (value < definition.minimumDeg || value > definition.maximumDeg) {
    throw new RangeError(
      `${channel} must remain within ${definition.minimumDeg}..${definition.maximumDeg} degrees.`,
    );
  }
  const stepIndex = (value - definition.minimumDeg) / definition.stepDeg;
  if (Math.abs(stepIndex - Math.round(stepIndex)) > 1e-9) {
    throw new RangeError(`${channel} must use ${definition.stepDeg}-degree steps.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function legControls(value: unknown, label: string): MakeHumanLegBodyPartIkControlsV1 {
  const candidate = record(value, label);
  exactKeys(candidate, LEG_KEYS, label);
  return Object.freeze({
    hipForwardDeg: channelValue(candidate.hipForwardDeg, 'hipForwardDeg'),
    hipSideDeg: channelValue(candidate.hipSideDeg, 'hipSideDeg'),
    kneeBendDeg: channelValue(candidate.kneeBendDeg, 'kneeBendDeg'),
    ankleBendDeg: channelValue(candidate.ankleBendDeg, 'ankleBendDeg'),
  });
}

function rotation(
  bone: string,
  transverseXBendDeg: number,
  longitudinalTwistDeg: number,
  transverseZBendDeg: number,
): MakeHumanLocalAnatomicalRotationV3 {
  return Object.freeze({
    bone,
    transverseXBendDeg: Object.is(transverseXBendDeg, -0) ? 0 : transverseXBendDeg,
    longitudinalTwistDeg: Object.is(longitudinalTwistDeg, -0) ? 0 : longitudinalTwistDeg,
    transverseZBendDeg: Object.is(transverseZBendDeg, -0) ? 0 : transverseZBendDeg,
  });
}

function nonZero(value: MakeHumanLocalAnatomicalRotationV3): boolean {
  return (
    value.transverseXBendDeg !== 0 ||
    value.longitudinalTwistDeg !== 0 ||
    value.transverseZBendDeg !== 0
  );
}

function mergeRotation(
  rotations: MakeHumanLocalAnatomicalRotationV3[],
  bone: string,
  transverseXBendDeg: number,
  transverseZBendDeg: number,
) {
  const index = rotations.findIndex((candidate) => candidate.bone === bone);
  const current = index < 0 ? rotation(bone, 0, 0, 0) : rotations[index];
  const next = rotation(
    bone,
    current.transverseXBendDeg + transverseXBendDeg,
    current.longitudinalTwistDeg,
    current.transverseZBendDeg + transverseZBendDeg,
  );
  if (index < 0) {
    if (nonZero(next)) rotations.push(next);
    return;
  }
  if (nonZero(next)) rotations[index] = next;
  else rotations.splice(index, 1);
}

function applyShoulderPostureRotations(
  rotations: MakeHumanLocalAnatomicalRotationV3[],
  posture: MakeHumanShoulderPostureControlsV4,
  basisKind: keyof typeof SHOULDER_PROTRACTION_COMPENSATION,
) {
  const leftElevationDeg = posture.shoulderElevationDeg + posture.shoulderLevelDeg;
  const rightElevationDeg = posture.shoulderElevationDeg - posture.shoulderLevelDeg;
  const protractionDeg = posture.shoulderProtractionDeg;
  const compensation = SHOULDER_PROTRACTION_COMPENSATION[basisKind];

  // Authenticated shoulder-girdle chain: clavicle carries the origin, shoulder01 finishes the
  // translation arc, and upperarm01 receives the inverse accumulated rotation so an otherwise
  // neutral arm keeps its direction while the shoulder origin moves.
  mergeRotation(rotations, 'clavicle.L', leftElevationDeg * 0.65, -protractionDeg * 0.65);
  mergeRotation(rotations, 'shoulder01.L', leftElevationDeg * 0.35, -protractionDeg * 0.35);
  mergeRotation(
    rotations,
    'upperarm01.L',
    -leftElevationDeg + protractionDeg * compensation.transverseXFactor,
    protractionDeg * compensation.transverseZFactor,
  );
  mergeRotation(rotations, 'clavicle.R', -rightElevationDeg * 0.65, -protractionDeg * 0.65);
  mergeRotation(rotations, 'shoulder01.R', -rightElevationDeg * 0.35, -protractionDeg * 0.35);
  mergeRotation(
    rotations,
    'upperarm01.R',
    rightElevationDeg - protractionDeg * compensation.transverseXFactor,
    protractionDeg * compensation.transverseZFactor,
  );
}

function leftLegRotations(
  leg: MakeHumanLegBodyPartIkControlsV1,
): readonly MakeHumanLocalAnatomicalRotationV3[] {
  return [
    rotation('upperleg01.L', -leg.hipSideDeg, 0, -leg.hipForwardDeg),
    rotation('lowerleg01.L', 0, 0, leg.kneeBendDeg),
    rotation('foot.L', 0, 0, leg.ankleBendDeg),
  ].filter(nonZero);
}

function rightLegRotations(
  leg: MakeHumanLegBodyPartIkControlsV1,
): readonly MakeHumanLocalAnatomicalRotationV3[] {
  return leftLegRotations(leg).map((left) =>
    mirrorMakeHumanLocalAnatomicalRotationAcrossSagittalXResearchV3(
      left,
      left.bone.replace(/\.L$/, '.R'),
    ),
  );
}

/** Strict compiler for arms, torso, lower body, and authenticated neck bones. */
export function compileMakeHumanFullBodyPoseV4(
  value: unknown,
  options: Readonly<{
    basisKind?: keyof typeof SHOULDER_PROTRACTION_COMPENSATION;
  }> = {},
): MakeHumanFullBodyPoseCompiledV4 {
  const candidate = record(value, 'full-body pose');
  const symmetry = candidate.symmetry;
  const legSymmetry = candidate.legSymmetry;
  const armKeys =
    symmetry === 'bilateral'
      ? (['symmetry', 'arm'] as const)
      : symmetry === 'independent'
        ? (['symmetry', 'leftArm', 'rightArm'] as const)
        : null;
  const legKeys =
    legSymmetry === 'bilateral'
      ? (['legSymmetry', 'leg'] as const)
      : legSymmetry === 'independent'
        ? (['legSymmetry', 'leftLeg', 'rightLeg'] as const)
        : null;
  if (!armKeys) throw new RangeError('symmetry must be bilateral or independent.');
  if (!legKeys) throw new RangeError('legSymmetry must be bilateral or independent.');
  const shoulderPostureKeyCount = SHOULDER_POSTURE_KEYS.filter((key) => key in candidate).length;
  if (shoulderPostureKeyCount !== 0 && shoulderPostureKeyCount !== SHOULDER_POSTURE_KEYS.length) {
    throw new RangeError(
      `full-body pose shoulder posture must contain all of: ${SHOULDER_POSTURE_KEYS.join(', ')}.`,
    );
  }
  exactKeys(
    candidate,
    [
      ...TORSO_KEYS,
      ...HEAD_KEYS,
      ...(shoulderPostureKeyCount === 0 ? [] : SHOULDER_POSTURE_KEYS),
      ...armKeys,
      ...legKeys,
    ],
    'full-body pose',
  );

  const armPose = compileMakeHumanCloLikePoseDisplayV3(
    symmetry === 'bilateral'
      ? {
          torsoFlexionDeg: candidate.torsoFlexionDeg,
          torsoSideBendDeg: candidate.torsoSideBendDeg,
          torsoTwistDeg: candidate.torsoTwistDeg,
          symmetry,
          arm: candidate.arm,
        }
      : {
          torsoFlexionDeg: candidate.torsoFlexionDeg,
          torsoSideBendDeg: candidate.torsoSideBendDeg,
          torsoTwistDeg: candidate.torsoTwistDeg,
          symmetry,
          leftArm: candidate.leftArm,
          rightArm: candidate.rightArm,
        },
  );
  const head = Object.freeze({
    headPitchDeg: channelValue(candidate.headPitchDeg, 'headPitchDeg'),
    headYawDeg: channelValue(candidate.headYawDeg, 'headYawDeg'),
    headSideDeg: channelValue(candidate.headSideDeg, 'headSideDeg'),
  });
  const shoulderPosture = Object.freeze({
    shoulderProtractionDeg:
      shoulderPostureKeyCount === 0
        ? 0
        : channelValue(candidate.shoulderProtractionDeg, 'shoulderProtractionDeg'),
    shoulderElevationDeg:
      shoulderPostureKeyCount === 0
        ? 0
        : channelValue(candidate.shoulderElevationDeg, 'shoulderElevationDeg'),
    shoulderLevelDeg:
      shoulderPostureKeyCount === 0
        ? 0
        : channelValue(candidate.shoulderLevelDeg, 'shoulderLevelDeg'),
  });
  const legs =
    legSymmetry === 'bilateral'
      ? Object.freeze({ legSymmetry, leg: legControls(candidate.leg, 'leg') })
      : Object.freeze({
          legSymmetry,
          leftLeg: legControls(candidate.leftLeg, 'leftLeg'),
          rightLeg: legControls(candidate.rightLeg, 'rightLeg'),
        });
  const input = Object.freeze({
    ...armPose.input,
    ...head,
    ...shoulderPosture,
    ...legs,
  }) as MakeHumanFullBodyPoseInputV4;
  const rotations: MakeHumanLocalAnatomicalRotationV3[] = [...armPose.rotations];
  applyShoulderPostureRotations(rotations, shoulderPosture, options.basisKind ?? 'female');
  for (const { bone, weight } of NECK_DISTRIBUTION) {
    const neck = rotation(
      bone,
      input.headPitchDeg * weight,
      input.headYawDeg * weight,
      input.headSideDeg * weight,
    );
    if (nonZero(neck)) rotations.push(neck);
  }
  if (input.legSymmetry === 'bilateral') {
    rotations.push(...leftLegRotations(input.leg), ...rightLegRotations(input.leg));
  } else {
    rotations.push(...leftLegRotations(input.leftLeg), ...rightLegRotations(input.rightLeg));
  }

  return Object.freeze({
    version: MAKEHUMAN_FULL_BODY_POSE_V4,
    input,
    rotations: Object.freeze(rotations),
    claims: CLAIMS,
  });
}

export function createNeutralMakeHumanFullBodyPoseV4(): MakeHumanFullBodyPoseInputV4 {
  return compileMakeHumanFullBodyPoseV4({
    torsoFlexionDeg: 0,
    torsoSideBendDeg: 0,
    torsoTwistDeg: 0,
    symmetry: 'bilateral',
    arm: { shoulderRaiseDeg: 0, shoulderForwardDeg: 0, elbowBendDeg: 0, wristBendDeg: 0 },
    headPitchDeg: 0,
    headYawDeg: 0,
    headSideDeg: 0,
    shoulderProtractionDeg: 0,
    shoulderElevationDeg: 0,
    shoulderLevelDeg: 0,
    legSymmetry: 'bilateral',
    leg: { hipForwardDeg: 0, hipSideDeg: 0, kneeBendDeg: 0, ankleBendDeg: 0 },
  }).input;
}

/** Explicit migration helper; V3 callers receive neutral head and lower-body channels. */
export function upgradeMakeHumanFullBodyPoseV3ToV4(
  value: MakeHumanCloLikePoseInputV3,
): MakeHumanFullBodyPoseInputV4 {
  return compileMakeHumanFullBodyPoseV4({
    ...value,
    headPitchDeg: 0,
    headYawDeg: 0,
    headSideDeg: 0,
    shoulderProtractionDeg: 0,
    shoulderElevationDeg: 0,
    shoulderLevelDeg: 0,
    legSymmetry: 'bilateral',
    leg: { hipForwardDeg: 0, hipSideDeg: 0, kneeBendDeg: 0, ankleBendDeg: 0 },
  }).input;
}
