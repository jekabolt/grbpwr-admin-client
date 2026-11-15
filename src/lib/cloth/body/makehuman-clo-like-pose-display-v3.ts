import {
  mirrorMakeHumanLocalAnatomicalRotationAcrossSagittalXResearchV3,
  type MakeHumanLocalAnatomicalRotationV3,
} from './makehuman-local-joint-frame-research-v3';

export const MAKEHUMAN_CLO_LIKE_POSE_DISPLAY_V3 = 'makehuman-clo-like-pose-display/v3' as const;

export interface MakeHumanCloLikePoseChannelV3 {
  readonly label: string;
  readonly minimumDeg: number;
  readonly maximumDeg: number;
  readonly stepDeg: number;
}

export const MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3 = Object.freeze({
  torsoFlexionDeg: Object.freeze({
    label: 'body bend forward / back',
    minimumDeg: -20,
    maximumDeg: 20,
    stepDeg: 1,
  }),
  torsoSideBendDeg: Object.freeze({
    label: 'body bend left / right',
    minimumDeg: -12,
    maximumDeg: 12,
    stepDeg: 1,
  }),
  torsoTwistDeg: Object.freeze({
    label: 'body twist left / right',
    minimumDeg: -15,
    maximumDeg: 15,
    stepDeg: 1,
  }),
  shoulderRaiseDeg: Object.freeze({
    label: 'arm raise / lower',
    minimumDeg: -60,
    maximumDeg: 60,
    stepDeg: 1,
  }),
  shoulderForwardDeg: Object.freeze({
    label: 'arm forward / back',
    minimumDeg: -30,
    maximumDeg: 45,
    stepDeg: 1,
  }),
  elbowBendDeg: Object.freeze({
    label: 'elbow bend',
    minimumDeg: 0,
    maximumDeg: 100,
    stepDeg: 1,
  }),
  wristBendDeg: Object.freeze({
    label: 'wrist bend',
    minimumDeg: -20,
    maximumDeg: 20,
    stepDeg: 1,
  }),
} as const satisfies Readonly<Record<string, MakeHumanCloLikePoseChannelV3>>);

export interface MakeHumanCloLikeTorsoControlsV3 {
  readonly torsoFlexionDeg: number;
  readonly torsoSideBendDeg: number;
  readonly torsoTwistDeg: number;
}

export interface MakeHumanCloLikeArmControlsV3 {
  readonly shoulderRaiseDeg: number;
  readonly shoulderForwardDeg: number;
  readonly elbowBendDeg: number;
  readonly wristBendDeg: number;
}

export type MakeHumanCloLikePoseInputV3 = MakeHumanCloLikeTorsoControlsV3 &
  (
    | Readonly<{
        symmetry: 'bilateral';
        arm: MakeHumanCloLikeArmControlsV3;
      }>
    | Readonly<{
        symmetry: 'independent';
        leftArm: MakeHumanCloLikeArmControlsV3;
        rightArm: MakeHumanCloLikeArmControlsV3;
      }>
  );

export interface MakeHumanCloLikePoseDisplayResultV3 {
  readonly version: typeof MAKEHUMAN_CLO_LIKE_POSE_DISPLAY_V3;
  readonly role: 'DISPLAY_POSE_CANDIDATE_ONLY';
  readonly input: MakeHumanCloLikePoseInputV3;
  readonly rotations: readonly MakeHumanLocalAnatomicalRotationV3[];
  readonly claims: {
    readonly productInteractionEnvelopeOnly: true;
    readonly anatomicalRangeClaimed: false;
    readonly cloCompatibilityClaimed: false;
    readonly inverseKinematicsApplied: false;
    readonly selfIntersectionEvaluated: false;
    readonly garmentEvaluated: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly productionAuthority: false;
  };
}

const TORSO_KEYS = Object.freeze(['torsoFlexionDeg', 'torsoSideBendDeg', 'torsoTwistDeg'] as const);
const ARM_KEYS = Object.freeze([
  'shoulderRaiseDeg',
  'shoulderForwardDeg',
  'elbowBendDeg',
  'wristBendDeg',
] as const);
const SPINE_DISTRIBUTION = Object.freeze([
  Object.freeze({ bone: 'spine01', weight: 0.15 }),
  Object.freeze({ bone: 'spine02', weight: 0.2 }),
  Object.freeze({ bone: 'spine03', weight: 0.25 }),
  Object.freeze({ bone: 'spine04', weight: 0.25 }),
  Object.freeze({ bone: 'spine05', weight: 0.15 }),
] as const);
const CLAIMS = Object.freeze({
  productInteractionEnvelopeOnly: true as const,
  anatomicalRangeClaimed: false as const,
  cloCompatibilityClaimed: false as const,
  inverseKinematicsApplied: false as const,
  selfIntersectionEvaluated: false as const,
  garmentEvaluated: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  productionAuthority: false as const,
});

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (
    actual.length !== canonicalExpected.length ||
    actual.some((key, index) => key !== canonicalExpected[index])
  ) {
    throw new RangeError(`${label} must contain exactly: ${canonicalExpected.join(', ')}.`);
  }
}

function channelValue(
  value: unknown,
  channel: keyof typeof MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3,
): number {
  const definition = MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3[channel];
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

function armControls(value: unknown, label: string): MakeHumanCloLikeArmControlsV3 {
  const candidate = record(value, label);
  exactKeys(candidate, ARM_KEYS, label);
  return Object.freeze({
    shoulderRaiseDeg: channelValue(candidate.shoulderRaiseDeg, 'shoulderRaiseDeg'),
    shoulderForwardDeg: channelValue(candidate.shoulderForwardDeg, 'shoulderForwardDeg'),
    elbowBendDeg: channelValue(candidate.elbowBendDeg, 'elbowBendDeg'),
    wristBendDeg: channelValue(candidate.wristBendDeg, 'wristBendDeg'),
  });
}

function validateInput(value: unknown): MakeHumanCloLikePoseInputV3 {
  const candidate = record(value, 'pose input');
  const symmetry = candidate.symmetry;
  const torso = {
    torsoFlexionDeg: channelValue(candidate.torsoFlexionDeg, 'torsoFlexionDeg'),
    torsoSideBendDeg: channelValue(candidate.torsoSideBendDeg, 'torsoSideBendDeg'),
    torsoTwistDeg: channelValue(candidate.torsoTwistDeg, 'torsoTwistDeg'),
  } as const;

  if (symmetry === 'bilateral') {
    exactKeys(candidate, [...TORSO_KEYS, 'symmetry', 'arm'], 'bilateral pose input');
    return Object.freeze({ ...torso, symmetry, arm: armControls(candidate.arm, 'arm') });
  }
  if (symmetry === 'independent') {
    exactKeys(
      candidate,
      [...TORSO_KEYS, 'symmetry', 'leftArm', 'rightArm'],
      'independent pose input',
    );
    return Object.freeze({
      ...torso,
      symmetry,
      leftArm: armControls(candidate.leftArm, 'leftArm'),
      rightArm: armControls(candidate.rightArm, 'rightArm'),
    });
  }
  throw new RangeError('symmetry must be bilateral or independent.');
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

function nonZero(rotationValue: MakeHumanLocalAnatomicalRotationV3): boolean {
  return (
    rotationValue.transverseXBendDeg !== 0 ||
    rotationValue.longitudinalTwistDeg !== 0 ||
    rotationValue.transverseZBendDeg !== 0
  );
}

function leftArmRotations(arm: MakeHumanCloLikeArmControlsV3) {
  return [
    rotation('shoulder01.L', arm.shoulderRaiseDeg * 0.2, 0, 0),
    rotation('upperarm01.L', arm.shoulderRaiseDeg * 0.8, 0, arm.shoulderForwardDeg),
    rotation('lowerarm01.L', 0, 0, -arm.elbowBendDeg),
    rotation('wrist.L', 0, 0, arm.wristBendDeg),
  ].filter(nonZero);
}

function rightArmRotations(arm: MakeHumanCloLikeArmControlsV3) {
  return leftArmRotations(arm).map((left) => {
    const mirrored = mirrorMakeHumanLocalAnatomicalRotationAcrossSagittalXResearchV3(
      left,
      left.bone.replace(/\.L$/, '.R'),
    );
    return rotation(
      mirrored.bone,
      mirrored.transverseXBendDeg,
      mirrored.longitudinalTwistDeg,
      mirrored.transverseZBendDeg,
    );
  });
}

/**
 * Compiles a strict, bounded editor state into local-rest-frame rotations. These limits are a
 * product interaction envelope, not anatomical evidence or a garment/collision safety envelope.
 */
export function compileMakeHumanCloLikePoseDisplayV3(
  value: unknown,
): MakeHumanCloLikePoseDisplayResultV3 {
  const input = validateInput(value);
  const rotations: MakeHumanLocalAnatomicalRotationV3[] = [];

  for (const { bone, weight } of SPINE_DISTRIBUTION) {
    const spineRotation = rotation(
      bone,
      input.torsoFlexionDeg * weight,
      input.torsoTwistDeg * weight,
      input.torsoSideBendDeg * weight,
    );
    if (nonZero(spineRotation)) rotations.push(spineRotation);
  }

  if (input.symmetry === 'bilateral') {
    rotations.push(...leftArmRotations(input.arm), ...rightArmRotations(input.arm));
  } else {
    rotations.push(...leftArmRotations(input.leftArm), ...rightArmRotations(input.rightArm));
  }

  return Object.freeze({
    version: MAKEHUMAN_CLO_LIKE_POSE_DISPLAY_V3,
    role: 'DISPLAY_POSE_CANDIDATE_ONLY' as const,
    input,
    rotations: Object.freeze(rotations),
    claims: CLAIMS,
  });
}
