import {
  compileMakeHumanCloLikePoseDisplayV3,
  MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3,
  type MakeHumanCloLikeArmControlsV3,
} from './makehuman-clo-like-pose-display-v3';
import type {
  MakeHumanCoreRigBasisKindV1,
  MakeHumanCoreRigBundleV1,
} from './makehuman-core-rig-pose-research-v1';
import {
  poseMakeHumanCoreRigDisplayOverlayLocalResearchV4,
  type MakeHumanLocalJointVec3V3,
  type MakeHumanPosedLocalBoneOverlayV4,
} from './makehuman-local-joint-frame-research-v3';

export const MAKEHUMAN_ARM_SIDE_SEAM_ASSIST_V1 = 'makehuman-arm-side-seam-assist/v1' as const;

export type MakeHumanArmSideSeamAssistSideV1 = 'left' | 'right';

export interface MakeHumanArmSideSeamMetricsV1 {
  readonly verticality: number;
  readonly straightness: number;
  readonly wristOuterHipClearanceRatio: number;
  readonly minimumOuterHipClearanceRatio: number;
  readonly wristHipDepthErrorRatio: number;
  readonly wristHipVerticalErrorRatio: number;
  readonly sideSeamEligible: boolean;
}

export interface MakeHumanArmSideSeamAssistResultV1 {
  readonly version: typeof MAKEHUMAN_ARM_SIDE_SEAM_ASSIST_V1;
  readonly side: MakeHumanArmSideSeamAssistSideV1;
  readonly arm: MakeHumanCloLikeArmControlsV3;
  readonly shoulderM: MakeHumanLocalJointVec3V3;
  readonly elbowM: MakeHumanLocalJointVec3V3;
  readonly wristM: MakeHumanLocalJointVec3V3;
  readonly outerHipM: MakeHumanLocalJointVec3V3;
  readonly activationRadiusM: number;
  readonly metrics: MakeHumanArmSideSeamMetricsV1;
  readonly claims: Readonly<{
    authenticatedRigGeometryEvaluated: true;
    straightArmSideSeamAssist: true;
    productInteractionEnvelopeApplied: true;
    meshBodyCollisionEvaluated: false;
    geometricTorsoCrossingGuardApplied: true;
    clinicalAnatomicalRangeAuthority: false;
    garmentPairEvaluated: false;
    fitClaimEligible: false;
    productionAuthority: false;
  }>;
}

const CLAIMS = Object.freeze({
  authenticatedRigGeometryEvaluated: true as const,
  straightArmSideSeamAssist: true as const,
  productInteractionEnvelopeApplied: true as const,
  meshBodyCollisionEvaluated: false as const,
  geometricTorsoCrossingGuardApplied: true as const,
  clinicalAnatomicalRangeAuthority: false as const,
  garmentPairEvaluated: false as const,
  fitClaimEligible: false as const,
  productionAuthority: false as const,
});
const TARGET_OUTER_HIP_CLEARANCE_RATIO = 0.36;
const MINIMUM_OUTER_HIP_CLEARANCE_RATIO = 0.12;
const MAXIMUM_DEPTH_ERROR_RATIO = 0.06;
const MAXIMUM_VERTICAL_ERROR_RATIO = 0.12;
const MINIMUM_VERTICALITY = 0.94;
const MINIMUM_STRAIGHTNESS = 0.9;

function vector(value: MakeHumanLocalJointVec3V3): MakeHumanLocalJointVec3V3 {
  return Object.freeze([value[0], value[1], value[2]] as const);
}

function distance(left: MakeHumanLocalJointVec3V3, right: MakeHumanLocalJointVec3V3) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function requiredBone(byName: ReadonlyMap<string, MakeHumanPosedLocalBoneOverlayV4>, name: string) {
  const bone = byName.get(name);
  if (!bone) throw new Error(`Side-seam assist requires authenticated rig bone ${name}.`);
  return bone;
}

function metrics(options: {
  side: MakeHumanArmSideSeamAssistSideV1;
  shoulderM: MakeHumanLocalJointVec3V3;
  elbowM: MakeHumanLocalJointVec3V3;
  wristM: MakeHumanLocalJointVec3V3;
  outerHipM: MakeHumanLocalJointVec3V3;
  minimumOuterHipClearanceRatio: number;
  maximumVerticalErrorRatio: number;
}): MakeHumanArmSideSeamMetricsV1 {
  const armLength =
    distance(options.shoulderM, options.elbowM) + distance(options.elbowM, options.wristM);
  const directLength = distance(options.shoulderM, options.wristM);
  if (!Number.isFinite(armLength) || armLength <= 1e-6) {
    throw new Error('Side-seam assist requires a non-degenerate arm chain.');
  }
  const outwardSign = options.side === 'left' ? 1 : -1;
  const outwardHipX = outwardSign * options.outerHipM[0];
  const elbowClearance = outwardSign * options.elbowM[0] - outwardHipX;
  const wristClearance = outwardSign * options.wristM[0] - outwardHipX;
  const verticality = Math.abs(options.wristM[1] - options.shoulderM[1]) / directLength;
  const straightness = directLength / armLength;
  const wristOuterHipClearanceRatio = wristClearance / armLength;
  const minimumOuterHipClearanceRatio = Math.min(elbowClearance, wristClearance) / armLength;
  const wristHipDepthErrorRatio = Math.abs(options.wristM[2] - options.outerHipM[2]) / armLength;
  const wristHipVerticalErrorRatio = Math.abs(options.wristM[1] - options.outerHipM[1]) / armLength;
  return Object.freeze({
    verticality,
    straightness,
    wristOuterHipClearanceRatio,
    minimumOuterHipClearanceRatio,
    wristHipDepthErrorRatio,
    wristHipVerticalErrorRatio,
    sideSeamEligible:
      verticality >= MINIMUM_VERTICALITY &&
      straightness >= MINIMUM_STRAIGHTNESS &&
      minimumOuterHipClearanceRatio >= options.minimumOuterHipClearanceRatio &&
      wristHipDepthErrorRatio <= MAXIMUM_DEPTH_ERROR_RATIO &&
      wristHipVerticalErrorRatio <= options.maximumVerticalErrorRatio,
  });
}

function score(value: MakeHumanArmSideSeamMetricsV1): number {
  return (
    (1 - value.verticality) * 10 +
    (1 - value.straightness) * 2 +
    Math.abs(value.wristOuterHipClearanceRatio - TARGET_OUTER_HIP_CLEARANCE_RATIO) +
    value.wristHipDepthErrorRatio * 4 +
    value.wristHipVerticalErrorRatio +
    Math.max(0, MINIMUM_OUTER_HIP_CLEARANCE_RATIO - value.minimumOuterHipClearanceRatio) * 20
  );
}

interface Candidate {
  readonly arm: MakeHumanCloLikeArmControlsV3;
  readonly shoulderM: MakeHumanLocalJointVec3V3;
  readonly elbowM: MakeHumanLocalJointVec3V3;
  readonly wristM: MakeHumanLocalJointVec3V3;
  readonly outerHipM: MakeHumanLocalJointVec3V3;
  readonly metrics: MakeHumanArmSideSeamMetricsV1;
  readonly score: number;
}

/**
 * Calibrates a straight-arm side-seam snap against the exact authenticated rig anchors. A coarse
 * search followed by a one-degree refinement avoids assuming that semantic shoulder channels map
 * to world axes identically across the female, male, and neutral bases.
 */
export function createMakeHumanArmSideSeamAssistV1(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  readonly rollDirections: Float32Array;
  readonly side: MakeHumanArmSideSeamAssistSideV1;
  readonly wristBendDeg?: number;
  /** Bounded product envelope override for length-scaled visual proxies. */
  readonly minimumOuterHipClearanceRatio?: number;
  /** Bounded product envelope override for length-scaled visual proxies. */
  readonly maximumVerticalErrorRatio?: number;
}): MakeHumanArmSideSeamAssistResultV1 {
  const { bundle } = options;
  if (options.side !== 'left' && options.side !== 'right') {
    throw new RangeError('Side-seam assist side must be left or right.');
  }
  if (!bundle.bases.some(({ kind }) => kind === options.basisKind)) {
    throw new Error(`Side-seam assist is missing authenticated basis ${options.basisKind}.`);
  }
  const sideSuffix = options.side === 'left' ? '.L' : '.R';
  const raise = MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderRaiseDeg;
  const forward = MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderForwardDeg;
  const wristBendDeg = options.wristBendDeg ?? 0;
  const minimumOuterHipClearanceRatio =
    options.minimumOuterHipClearanceRatio ?? MINIMUM_OUTER_HIP_CLEARANCE_RATIO;
  const maximumVerticalErrorRatio =
    options.maximumVerticalErrorRatio ?? MAXIMUM_VERTICAL_ERROR_RATIO;
  if (
    !Number.isFinite(minimumOuterHipClearanceRatio) ||
    minimumOuterHipClearanceRatio < 0.1 ||
    minimumOuterHipClearanceRatio > MINIMUM_OUTER_HIP_CLEARANCE_RATIO
  ) {
    throw new RangeError('Side-seam assist outer-hip clearance ratio must be within 0.10..0.12.');
  }
  if (
    !Number.isFinite(maximumVerticalErrorRatio) ||
    maximumVerticalErrorRatio < MAXIMUM_VERTICAL_ERROR_RATIO ||
    maximumVerticalErrorRatio > 0.25
  ) {
    throw new RangeError('Side-seam assist vertical-error ratio must be within 0.12..0.25.');
  }

  const evaluate = (shoulderRaiseDeg: number, shoulderForwardDeg: number): Candidate => {
    const arm = Object.freeze({
      shoulderRaiseDeg,
      shoulderForwardDeg,
      elbowBendDeg: 0,
      wristBendDeg,
    });
    const pose =
      options.side === 'left'
        ? {
            torsoFlexionDeg: 0,
            torsoSideBendDeg: 0,
            torsoTwistDeg: 0,
            symmetry: 'independent' as const,
            leftArm: arm,
            rightArm: {
              shoulderRaiseDeg: 0,
              shoulderForwardDeg: 0,
              elbowBendDeg: 0,
              wristBendDeg: 0,
            },
          }
        : {
            torsoFlexionDeg: 0,
            torsoSideBendDeg: 0,
            torsoTwistDeg: 0,
            symmetry: 'independent' as const,
            leftArm: {
              shoulderRaiseDeg: 0,
              shoulderForwardDeg: 0,
              elbowBendDeg: 0,
              wristBendDeg: 0,
            },
            rightArm: arm,
          };
    const overlay = poseMakeHumanCoreRigDisplayOverlayLocalResearchV4({
      bundle,
      basisKind: options.basisKind,
      heads: options.heads,
      tails: options.tails,
      rollDirections: options.rollDirections,
      rotations: compileMakeHumanCloLikePoseDisplayV3(pose).rotations,
    });
    const byName = new Map(overlay.bones.map((bone) => [bone.bone, bone]));
    const shoulderM = requiredBone(byName, `upperarm01${sideSuffix}`).headM;
    const elbowM = requiredBone(byName, `lowerarm01${sideSuffix}`).headM;
    const wristM = requiredBone(byName, `wrist${sideSuffix}`).headM;
    const outerHipM = requiredBone(byName, `upperleg01${sideSuffix}`).headM;
    const candidateMetrics = metrics({
      side: options.side,
      shoulderM,
      elbowM,
      wristM,
      outerHipM,
      minimumOuterHipClearanceRatio,
      maximumVerticalErrorRatio,
    });
    return Object.freeze({
      arm,
      shoulderM: vector(shoulderM),
      elbowM: vector(elbowM),
      wristM: vector(wristM),
      outerHipM: vector(outerHipM),
      metrics: candidateMetrics,
      score: score(candidateMetrics),
    });
  };

  let best: Candidate | null = null;
  const consider = (candidate: Candidate) => {
    if (!best || candidate.score < best.score) best = candidate;
  };
  for (
    let shoulderRaiseDeg = raise.minimumDeg;
    shoulderRaiseDeg <= raise.maximumDeg;
    shoulderRaiseDeg += 4
  ) {
    for (
      let shoulderForwardDeg = forward.minimumDeg;
      shoulderForwardDeg <= forward.maximumDeg;
      shoulderForwardDeg += 4
    ) {
      consider(evaluate(shoulderRaiseDeg, shoulderForwardDeg));
    }
  }
  if (!best) throw new Error('Side-seam assist could not evaluate its authenticated pose grid.');
  const coarse = best as Candidate;
  for (
    let shoulderRaiseDeg = Math.max(raise.minimumDeg, coarse.arm.shoulderRaiseDeg - 4);
    shoulderRaiseDeg <= Math.min(raise.maximumDeg, coarse.arm.shoulderRaiseDeg + 4);
    shoulderRaiseDeg += 1
  ) {
    for (
      let shoulderForwardDeg = Math.max(forward.minimumDeg, coarse.arm.shoulderForwardDeg - 4);
      shoulderForwardDeg <= Math.min(forward.maximumDeg, coarse.arm.shoulderForwardDeg + 4);
      shoulderForwardDeg += 1
    ) {
      consider(evaluate(shoulderRaiseDeg, shoulderForwardDeg));
    }
  }
  const selected = best as Candidate;
  if (!selected.metrics.sideSeamEligible) {
    throw new Error(
      `Authenticated arm rig could not satisfy the side-seam geometry gate: ${JSON.stringify(selected.metrics)}.`,
    );
  }
  const armLength =
    distance(selected.shoulderM, selected.elbowM) + distance(selected.elbowM, selected.wristM);
  return Object.freeze({
    version: MAKEHUMAN_ARM_SIDE_SEAM_ASSIST_V1,
    side: options.side,
    arm: selected.arm,
    shoulderM: selected.shoulderM,
    elbowM: selected.elbowM,
    wristM: selected.wristM,
    outerHipM: selected.outerHipM,
    activationRadiusM: Math.max(0.02, armLength * 0.08),
    metrics: selected.metrics,
    claims: CLAIMS,
  });
}
