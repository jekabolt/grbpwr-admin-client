import type {
  MakeHumanCoreRigBasisKindV1,
  MakeHumanCoreRigBundleV1,
} from './makehuman-core-rig-pose-research-v1';
import {
  createMakeHumanLocalBoneFrameResearchV3,
  type MakeHumanLocalAnatomicalRotationV3,
} from './makehuman-local-joint-frame-research-v3';

export const MAKEHUMAN_ELBOW_BIND_NEUTRALIZATION_V1 =
  'makehuman-elbow-bind-neutralization/v1' as const;

export interface MakeHumanElbowBindNeutralizationSideV1 {
  readonly xDeg: number;
  readonly zDeg: number;
}

export interface MakeHumanElbowBindNeutralizationV1 {
  readonly version: typeof MAKEHUMAN_ELBOW_BIND_NEUTRALIZATION_V1;
  readonly rigSha256: string;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly left: MakeHumanElbowBindNeutralizationSideV1;
  readonly right: MakeHumanElbowBindNeutralizationSideV1;
}

const DEG = 180 / Math.PI;

function normalize(value: readonly [number, number, number]) {
  const magnitude = Math.hypot(...value);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-9) {
    throw new Error('Elbow bind neutralization requires non-degenerate arm anchors.');
  }
  return value.map((component) => component / magnitude) as [number, number, number];
}

function solveSide(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  readonly rollDirections: Float32Array;
  readonly side: 'L' | 'R';
}): MakeHumanElbowBindNeutralizationSideV1 {
  const boneIndex = (name: string) => {
    const index = options.bundle.bones.findIndex((bone) => bone.name === name);
    if (index < 0) throw new Error(`Elbow bind neutralization is missing ${name}.`);
    return index;
  };
  const point = (values: Float32Array, index: number) => {
    const offset = index * 3;
    return values.subarray(offset, offset + 3);
  };
  const upperIndex = boneIndex(`upperarm01.${options.side}`);
  const lowerIndex = boneIndex(`lowerarm01.${options.side}`);
  const shoulder = point(options.heads, upperIndex);
  const elbow = point(options.heads, lowerIndex);
  const desiredWorld = normalize([
    elbow[0] - shoulder[0],
    elbow[1] - shoulder[1],
    elbow[2] - shoulder[2],
  ]);
  const lowerFrame = createMakeHumanLocalBoneFrameResearchV3({
    bone: `lowerarm01.${options.side}`,
    head: point(options.heads, lowerIndex),
    tail: point(options.tails, lowerIndex),
    rollDirection: point(options.rollDirections, lowerIndex),
  });
  const matrix = lowerFrame.restWorldToLocal;
  const desiredLocal = [
    matrix[0] * desiredWorld[0] + matrix[1] * desiredWorld[1] + matrix[2] * desiredWorld[2],
    matrix[3] * desiredWorld[0] + matrix[4] * desiredWorld[1] + matrix[5] * desiredWorld[2],
    matrix[6] * desiredWorld[0] + matrix[7] * desiredWorld[1] + matrix[8] * desiredWorld[2],
  ] as const;
  const xDeg = Math.asin(Math.max(-1, Math.min(1, desiredLocal[2]))) * DEG;
  const zDeg = Math.atan2(-desiredLocal[0], desiredLocal[1]) * DEG;
  return Object.freeze({ xDeg, zDeg });
}

/** Derives exact semantic elbow zero from the active authenticated local rig frames. */
export function deriveMakeHumanElbowBindNeutralizationV1(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  readonly rollDirections: Float32Array;
  readonly rigSha256: string;
}): MakeHumanElbowBindNeutralizationV1 {
  if (!/^[0-9a-f]{64}$/u.test(options.rigSha256)) {
    throw new Error('Elbow bind neutralization requires an authenticated rig SHA-256.');
  }
  return Object.freeze({
    version: MAKEHUMAN_ELBOW_BIND_NEUTRALIZATION_V1,
    rigSha256: options.rigSha256,
    basisKind: options.basisKind,
    left: solveSide({ ...options, side: 'L' }),
    right: solveSide({ ...options, side: 'R' }),
  });
}

/** Adds the bind correction without changing the persisted semantic elbow channel. */
export function applyMakeHumanElbowBindNeutralizationV1(
  rotations: readonly MakeHumanLocalAnatomicalRotationV3[],
  neutralization: MakeHumanElbowBindNeutralizationV1,
): readonly MakeHumanLocalAnatomicalRotationV3[] {
  const remaining = rotations.filter(
    ({ bone }) => bone !== 'lowerarm01.L' && bone !== 'lowerarm01.R',
  );
  const corrected = (side: 'L' | 'R', bind: MakeHumanElbowBindNeutralizationSideV1) => {
    const bone = `lowerarm01.${side}`;
    const current = rotations.find((rotation) => rotation.bone === bone);
    return Object.freeze({
      bone,
      transverseXBendDeg: (current?.transverseXBendDeg ?? 0) + bind.xDeg,
      longitudinalTwistDeg: current?.longitudinalTwistDeg ?? 0,
      transverseZBendDeg: (current?.transverseZBendDeg ?? 0) + bind.zDeg,
    });
  };
  return Object.freeze([
    ...remaining,
    corrected('L', neutralization.left),
    corrected('R', neutralization.right),
  ]);
}
