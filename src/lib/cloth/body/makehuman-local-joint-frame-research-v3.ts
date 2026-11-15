import type {
  MakeHumanCoreRigBundleV1,
  MakeHumanCoreRigBasisKindV1,
} from './makehuman-core-rig-pose-research-v1';

export const MAKEHUMAN_LOCAL_JOINT_FRAME_RESEARCH_V3 =
  'makehuman-local-joint-frame-research/v3' as const;
export const MAKEHUMAN_LOCAL_JOINT_DISPLAY_OVERLAY_RESEARCH_V4 =
  'makehuman-local-joint-display-overlay-research/v4' as const;

export type MakeHumanLocalJointVec3V3 = readonly [number, number, number];
export type MakeHumanLocalJointMatrix3V3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export type MakeHumanLocalJointQuaternionV3 = readonly [x: number, y: number, z: number, w: number];

export interface MakeHumanLocalBoneFrameV3 {
  readonly version: typeof MAKEHUMAN_LOCAL_JOINT_FRAME_RESEARCH_V3;
  readonly bone: string;
  readonly head: MakeHumanLocalJointVec3V3;
  readonly tail: MakeHumanLocalJointVec3V3;
  /** Local +Y. The polar head-to-tail direction. */
  readonly longitudinalAxis: MakeHumanLocalJointVec3V3;
  /** Local +Z. The axial normal of the source rotation plane. */
  readonly rollAxis: MakeHumanLocalJointVec3V3;
  /** Local +X. Completes X cross Y = Z. */
  readonly transverseAxis: MakeHumanLocalJointVec3V3;
  /** Row-major matrix with local X, Y, Z stored as its columns. */
  readonly localToRestWorld: MakeHumanLocalJointMatrix3V3;
  readonly restWorldToLocal: MakeHumanLocalJointMatrix3V3;
}

export interface MakeHumanLocalAnatomicalRotationV3 {
  readonly bone: string;
  /** Rotation about local +X. */
  readonly transverseXBendDeg: number;
  /** Rotation about the local head-to-tail +Y axis. */
  readonly longitudinalTwistDeg: number;
  /** Rotation about the local rotation-plane normal +Z. */
  readonly transverseZBendDeg: number;
}

interface AffineV3 {
  readonly rotation: MakeHumanLocalJointMatrix3V3;
  readonly translation: MakeHumanLocalJointVec3V3;
}

export interface MakeHumanLocalRigPoseResultV3 {
  readonly version: typeof MAKEHUMAN_LOCAL_JOINT_FRAME_RESEARCH_V3;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly positions: Float32Array;
  readonly frames: readonly MakeHumanLocalBoneFrameV3[];
  readonly maximumJointPivotResidual: number;
  readonly claims: {
    readonly researchOnly: true;
    readonly localRestFrameOnly: true;
    readonly anatomicalJointLimitsApplied: false;
    readonly inverseKinematicsApplied: false;
    readonly displayPoseCandidateOnly: true;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly productionAuthority: false;
  };
}

export interface MakeHumanPosedLocalBoneOverlayV4 {
  readonly bone: string;
  readonly headM: MakeHumanLocalJointVec3V3;
  readonly tailM: MakeHumanLocalJointVec3V3;
  /** Row-major matrix whose columns are the posed local X, Y and Z axes in world space. */
  readonly localToWorld: MakeHumanLocalJointMatrix3V3;
}

export interface MakeHumanLocalRigDisplayOverlayResultV4 {
  readonly version: typeof MAKEHUMAN_LOCAL_JOINT_DISPLAY_OVERLAY_RESEARCH_V4;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly bones: readonly MakeHumanPosedLocalBoneOverlayV4[];
  readonly maximumJointPivotResidualM: number;
  readonly claims: {
    readonly researchOnly: true;
    readonly displayOverlayOnly: true;
    readonly inverseKinematicsApplied: false;
    readonly garmentPairEvaluated: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly productionAuthority: false;
  };
}

const EPSILON = 1e-8;
const ORTHONORMAL_TOLERANCE = 1e-5;
const MAX_COMPONENT_DEGREES = 180;
const IDENTITY_MATRIX: MakeHumanLocalJointMatrix3V3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const IDENTITY_AFFINE: AffineV3 = Object.freeze({
  rotation: IDENTITY_MATRIX,
  translation: Object.freeze([0, 0, 0] as const),
});
const CLAIMS = Object.freeze({
  researchOnly: true as const,
  localRestFrameOnly: true as const,
  anatomicalJointLimitsApplied: false as const,
  inverseKinematicsApplied: false as const,
  displayPoseCandidateOnly: true as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  productionAuthority: false as const,
});
const OVERLAY_CLAIMS = Object.freeze({
  researchOnly: true as const,
  displayOverlayOnly: true as const,
  inverseKinematicsApplied: false as const,
  garmentPairEvaluated: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  productionAuthority: false as const,
});

function vector(value: ArrayLike<number>, label: string): MakeHumanLocalJointVec3V3 {
  if (value.length !== 3) throw new RangeError(`${label} must contain exactly three values.`);
  const result = [value[0], value[1], value[2]] as const;
  if (!result.every(Number.isFinite)) throw new RangeError(`${label} must be finite.`);
  return Object.freeze(result);
}

function subtract(
  left: MakeHumanLocalJointVec3V3,
  right: MakeHumanLocalJointVec3V3,
): MakeHumanLocalJointVec3V3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: MakeHumanLocalJointVec3V3, right: MakeHumanLocalJointVec3V3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(
  left: MakeHumanLocalJointVec3V3,
  right: MakeHumanLocalJointVec3V3,
): MakeHumanLocalJointVec3V3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(value: MakeHumanLocalJointVec3V3, label: string): MakeHumanLocalJointVec3V3 {
  const length = Math.hypot(...value);
  if (!Number.isFinite(length) || length <= EPSILON) {
    throw new RangeError(`${label} is degenerate.`);
  }
  return Object.freeze([value[0] / length, value[1] / length, value[2] / length] as const);
}

function matrixFromColumns(
  x: MakeHumanLocalJointVec3V3,
  y: MakeHumanLocalJointVec3V3,
  z: MakeHumanLocalJointVec3V3,
): MakeHumanLocalJointMatrix3V3 {
  return Object.freeze([x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]);
}

function transpose(matrix: MakeHumanLocalJointMatrix3V3): MakeHumanLocalJointMatrix3V3 {
  return Object.freeze([
    matrix[0],
    matrix[3],
    matrix[6],
    matrix[1],
    matrix[4],
    matrix[7],
    matrix[2],
    matrix[5],
    matrix[8],
  ]);
}

function multiplyMatrix(
  left: MakeHumanLocalJointMatrix3V3,
  right: MakeHumanLocalJointMatrix3V3,
): MakeHumanLocalJointMatrix3V3 {
  const output = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      for (let inner = 0; inner < 3; inner += 1) {
        output[row * 3 + column] += left[row * 3 + inner] * right[inner * 3 + column];
      }
    }
  }
  if (!output.every(Number.isFinite))
    throw new Error('Matrix composition produced non-finite data.');
  return Object.freeze(output as unknown as MakeHumanLocalJointMatrix3V3);
}

function determinant(matrix: MakeHumanLocalJointMatrix3V3): number {
  return (
    matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7]) -
    matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6]) +
    matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
  );
}

function rotate(
  matrix: MakeHumanLocalJointMatrix3V3,
  point: MakeHumanLocalJointVec3V3,
): MakeHumanLocalJointVec3V3 {
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2],
    matrix[3] * point[0] + matrix[4] * point[1] + matrix[5] * point[2],
    matrix[6] * point[0] + matrix[7] * point[1] + matrix[8] * point[2],
  ];
}

function quaternionMultiply(
  left: MakeHumanLocalJointQuaternionV3,
  right: MakeHumanLocalJointQuaternionV3,
): MakeHumanLocalJointQuaternionV3 {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ];
}

function axisQuaternion(axis: 'x' | 'y' | 'z', degrees: number): MakeHumanLocalJointQuaternionV3 {
  if (!Number.isFinite(degrees) || Math.abs(degrees) > MAX_COMPONENT_DEGREES) {
    throw new RangeError(`Local ${axis} rotation must remain within ±180 degrees.`);
  }
  const half = (degrees * Math.PI) / 360;
  const sine = Math.sin(half);
  const cosine = Math.cos(half);
  if (axis === 'x') return [sine, 0, 0, cosine];
  if (axis === 'y') return [0, sine, 0, cosine];
  return [0, 0, sine, cosine];
}

function normalizeQuaternion(
  value: MakeHumanLocalJointQuaternionV3,
): MakeHumanLocalJointQuaternionV3 {
  const length = Math.hypot(...value);
  if (!Number.isFinite(length) || length <= EPSILON) throw new Error('Quaternion is degenerate.');
  return Object.freeze(
    value.map((component) => component / length) as unknown as MakeHumanLocalJointQuaternionV3,
  );
}

function matrixFromQuaternion(
  quaternion: MakeHumanLocalJointQuaternionV3,
): MakeHumanLocalJointMatrix3V3 {
  const [x, y, z, w] = normalizeQuaternion(quaternion);
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return Object.freeze([
    1 - 2 * (yy + zz),
    2 * (xy - wz),
    2 * (xz + wy),
    2 * (xy + wz),
    1 - 2 * (xx + zz),
    2 * (yz - wx),
    2 * (xz - wy),
    2 * (yz + wx),
    1 - 2 * (xx + yy),
  ]);
}

function validateRotation(
  input: MakeHumanLocalAnatomicalRotationV3,
): MakeHumanLocalAnatomicalRotationV3 {
  if (
    typeof input.bone !== 'string' ||
    input.bone.length === 0 ||
    input.bone.trim() !== input.bone
  ) {
    throw new RangeError('Local rotation bone must be a non-empty trimmed string.');
  }
  for (const [label, value] of [
    ['transverseXBendDeg', input.transverseXBendDeg],
    ['longitudinalTwistDeg', input.longitudinalTwistDeg],
    ['transverseZBendDeg', input.transverseZBendDeg],
  ] as const) {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_COMPONENT_DEGREES) {
      throw new RangeError(`${label} must remain within ±180 degrees.`);
    }
  }
  return Object.freeze({ ...input });
}

/** Builds a right-handed rest-space frame from a polar bone axis and axial roll normal. */
export function createMakeHumanLocalBoneFrameResearchV3(options: {
  readonly bone: string;
  readonly head: ArrayLike<number>;
  readonly tail: ArrayLike<number>;
  readonly rollDirection: ArrayLike<number>;
}): MakeHumanLocalBoneFrameV3 {
  if (
    typeof options.bone !== 'string' ||
    options.bone.length === 0 ||
    options.bone.trim() !== options.bone
  ) {
    throw new RangeError('Bone name must be a non-empty trimmed string.');
  }
  const head = vector(options.head, `${options.bone} head`);
  const tail = vector(options.tail, `${options.bone} tail`);
  const roll = vector(options.rollDirection, `${options.bone} roll`);
  const rollLength = Math.hypot(...roll);
  if (Math.abs(rollLength - 1) > ORTHONORMAL_TOLERANCE) {
    throw new RangeError(`${options.bone} roll must be unit length.`);
  }
  const longitudinalAxis = normalize(subtract(tail, head), `${options.bone} head-to-tail axis`);
  const suppliedRollAxis = normalize(roll, `${options.bone} roll`);
  if (Math.abs(dot(longitudinalAxis, suppliedRollAxis)) > ORTHONORMAL_TOLERANCE) {
    throw new RangeError(`${options.bone} roll is not orthogonal to its head-to-tail axis.`);
  }
  const transverseAxis = normalize(
    cross(longitudinalAxis, suppliedRollAxis),
    `${options.bone} transverse axis`,
  );
  const rollAxis = normalize(
    cross(transverseAxis, longitudinalAxis),
    `${options.bone} repaired roll axis`,
  );
  if (dot(rollAxis, suppliedRollAxis) < 1 - ORTHONORMAL_TOLERANCE) {
    throw new RangeError(`${options.bone} roll orientation is inconsistent.`);
  }
  const localToRestWorld = matrixFromColumns(transverseAxis, longitudinalAxis, rollAxis);
  if (Math.abs(determinant(localToRestWorld) - 1) > ORTHONORMAL_TOLERANCE) {
    throw new Error(`${options.bone} local frame is not right-handed orthonormal.`);
  }
  return Object.freeze({
    version: MAKEHUMAN_LOCAL_JOINT_FRAME_RESEARCH_V3,
    bone: options.bone,
    head,
    tail,
    longitudinalAxis,
    rollAxis,
    transverseAxis,
    localToRestWorld,
    restWorldToLocal: transpose(localToRestWorld),
  });
}

export function createMakeHumanLocalBoneFramesResearchV3(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  readonly rollDirections: Float32Array;
}): readonly MakeHumanLocalBoneFrameV3[] {
  const expected = options.bundle.bones.length * 3;
  for (const [label, value] of [
    ['heads', options.heads],
    ['tails', options.tails],
    ['rollDirections', options.rollDirections],
  ] as const) {
    if (
      !(value instanceof Float32Array) ||
      value.length !== expected ||
      !value.every(Number.isFinite)
    ) {
      throw new TypeError(`${label} must contain one finite XYZ value per rig bone.`);
    }
  }
  return Object.freeze(
    options.bundle.bones.map((bone, boneIndex) => {
      const offset = boneIndex * 3;
      return createMakeHumanLocalBoneFrameResearchV3({
        bone: bone.name,
        head: options.heads.subarray(offset, offset + 3),
        tail: options.tails.subarray(offset, offset + 3),
        rollDirection: options.rollDirections.subarray(offset, offset + 3),
      });
    }),
  );
}

/** Applies local X, then local Y, then local Z using a normalized Hamilton quaternion. */
export function makeHumanLocalAnatomicalRotationQuaternionResearchV3(
  input: MakeHumanLocalAnatomicalRotationV3,
): MakeHumanLocalJointQuaternionV3 {
  const rotation = validateRotation(input);
  const x = axisQuaternion('x', rotation.transverseXBendDeg);
  const y = axisQuaternion('y', rotation.longitudinalTwistDeg);
  const z = axisQuaternion('z', rotation.transverseZBendDeg);
  return normalizeQuaternion(quaternionMultiply(z, quaternionMultiply(y, x)));
}

export function makeHumanLocalAnatomicalRotationMatrixResearchV3(
  input: MakeHumanLocalAnatomicalRotationV3,
): MakeHumanLocalJointMatrix3V3 {
  return matrixFromQuaternion(makeHumanLocalAnatomicalRotationQuaternionResearchV3(input));
}

export function makeHumanLocalRotationRestWorldMatrixResearchV3(
  frame: MakeHumanLocalBoneFrameV3,
  input: MakeHumanLocalAnatomicalRotationV3,
): MakeHumanLocalJointMatrix3V3 {
  if (frame.bone !== input.bone) throw new Error('Local frame and rotation bone do not match.');
  return multiplyMatrix(
    multiplyMatrix(frame.localToRestWorld, makeHumanLocalAnatomicalRotationMatrixResearchV3(input)),
    frame.restWorldToLocal,
  );
}

/**
 * Mirrors a frame across the sagittal X=0 plane. Head/tail are polar vectors. The roll normal is
 * an axial vector, so its mirror is det(M) * M * roll for M=diag(-1, 1, 1).
 */
export function mirrorMakeHumanLocalBoneFrameAcrossSagittalXResearchV3(
  frame: MakeHumanLocalBoneFrameV3,
  mirroredBone: string,
): MakeHumanLocalBoneFrameV3 {
  return createMakeHumanLocalBoneFrameResearchV3({
    bone: mirroredBone,
    head: [-frame.head[0], frame.head[1], frame.head[2]],
    tail: [-frame.tail[0], frame.tail[1], frame.tail[2]],
    rollDirection: [frame.rollAxis[0], -frame.rollAxis[1], -frame.rollAxis[2]],
  });
}

/** Mirrors the local rotation so its world transform equals M * R * M across X=0. */
export function mirrorMakeHumanLocalAnatomicalRotationAcrossSagittalXResearchV3(
  input: MakeHumanLocalAnatomicalRotationV3,
  mirroredBone: string,
): MakeHumanLocalAnatomicalRotationV3 {
  const rotation = validateRotation(input);
  return Object.freeze({
    bone: mirroredBone,
    transverseXBendDeg: -rotation.transverseXBendDeg,
    longitudinalTwistDeg: -rotation.longitudinalTwistDeg,
    transverseZBendDeg: rotation.transverseZBendDeg,
  });
}

function compose(parent: AffineV3, child: AffineV3): AffineV3 {
  const rotatedTranslation = rotate(parent.rotation, child.translation);
  return {
    rotation: multiplyMatrix(parent.rotation, child.rotation),
    translation: [
      rotatedTranslation[0] + parent.translation[0],
      rotatedTranslation[1] + parent.translation[1],
      rotatedTranslation[2] + parent.translation[2],
    ],
  };
}

function pivoted(
  rotation: MakeHumanLocalJointMatrix3V3,
  pivot: MakeHumanLocalJointVec3V3,
): AffineV3 {
  const rotatedPivot = rotate(rotation, pivot);
  return {
    rotation,
    translation: [
      pivot[0] - rotatedPivot[0],
      pivot[1] - rotatedPivot[1],
      pivot[2] - rotatedPivot[2],
    ],
  };
}

function transform(value: AffineV3, point: MakeHumanLocalJointVec3V3): MakeHumanLocalJointVec3V3 {
  const rotated = rotate(value.rotation, point);
  return [
    rotated[0] + value.translation[0],
    rotated[1] + value.translation[1],
    rotated[2] + value.translation[2],
  ];
}

interface MakeHumanLocalRigBonePoseEvaluationV4 {
  readonly frames: readonly MakeHumanLocalBoneFrameV3[];
  readonly boneTransforms: readonly AffineV3[];
  readonly bones: readonly MakeHumanPosedLocalBoneOverlayV4[];
  readonly rotationCount: number;
  readonly maximumJointPivotResidualM: number;
}

function evaluateMakeHumanLocalRigBonePoseV4(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  readonly rollDirections: Float32Array;
  readonly rotations: readonly MakeHumanLocalAnatomicalRotationV3[];
}): MakeHumanLocalRigBonePoseEvaluationV4 {
  const { bundle } = options;
  if (!bundle.bases.some(({ kind }) => kind === options.basisKind)) {
    throw new Error(`Missing rig basis ${options.basisKind}.`);
  }
  const frames = createMakeHumanLocalBoneFramesResearchV3(options);
  const boneIndexByName = new Map(bundle.bones.map((bone, index) => [bone.name, index]));
  const rotationsByBone = new Map<number, MakeHumanLocalAnatomicalRotationV3>();
  for (const candidate of options.rotations) {
    const rotation = validateRotation(candidate);
    const boneIndex = boneIndexByName.get(rotation.bone);
    if (boneIndex === undefined) {
      throw new Error(`Local pose references unknown bone ${rotation.bone}.`);
    }
    if (rotationsByBone.has(boneIndex)) {
      throw new Error(`Local pose contains duplicate rotation for bone ${rotation.bone}.`);
    }
    rotationsByBone.set(boneIndex, rotation);
  }

  const boneTransforms: AffineV3[] = [];
  const bones: MakeHumanPosedLocalBoneOverlayV4[] = [];
  let maximumJointPivotResidualM = 0;
  bundle.bones.forEach((bone, boneIndex) => {
    const parent = bone.parentIndex < 0 ? IDENTITY_AFFINE : boneTransforms[bone.parentIndex];
    const frame = frames[boneIndex];
    const rotation = rotationsByBone.get(boneIndex);
    const local = rotation
      ? pivoted(makeHumanLocalRotationRestWorldMatrixResearchV3(frame, rotation), frame.head)
      : IDENTITY_AFFINE;
    const child = compose(parent, local);
    const parentPivot = transform(parent, frame.head);
    const childPivot = transform(child, frame.head);
    maximumJointPivotResidualM = Math.max(
      maximumJointPivotResidualM,
      Math.hypot(
        parentPivot[0] - childPivot[0],
        parentPivot[1] - childPivot[1],
        parentPivot[2] - childPivot[2],
      ),
    );
    boneTransforms.push(child);
    bones.push(
      Object.freeze({
        bone: bone.name,
        headM: vector(childPivot, `${bone.name} posed head`),
        tailM: vector(transform(child, frame.tail), `${bone.name} posed tail`),
        localToWorld: multiplyMatrix(child.rotation, frame.localToRestWorld),
      }),
    );
  });

  return Object.freeze({
    frames,
    boneTransforms: Object.freeze(boneTransforms),
    bones: Object.freeze(bones),
    rotationCount: rotationsByBone.size,
    maximumJointPivotResidualM,
  });
}

/**
 * Additive posed-rig overlay API. It exposes no skinning weights or arbitrary editor authority;
 * callers must apply their own schema-closed joint allowlist before rendering controls.
 */
export function poseMakeHumanCoreRigDisplayOverlayLocalResearchV4(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  readonly rollDirections: Float32Array;
  readonly rotations: readonly MakeHumanLocalAnatomicalRotationV3[];
}): MakeHumanLocalRigDisplayOverlayResultV4 {
  const evaluated = evaluateMakeHumanLocalRigBonePoseV4(options);
  return Object.freeze({
    version: MAKEHUMAN_LOCAL_JOINT_DISPLAY_OVERLAY_RESEARCH_V4,
    basisKind: options.basisKind,
    bones: evaluated.bones,
    maximumJointPivotResidualM: evaluated.maximumJointPivotResidualM,
    claims: OVERLAY_CLAIMS,
  });
}

/** Additive research evaluator. It is intentionally not imported by a production runtime or UI. */
export function poseMakeHumanCoreRigPositionsLocalResearchV3(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly positions: Float32Array;
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  readonly rollDirections: Float32Array;
  readonly rotations: readonly MakeHumanLocalAnatomicalRotationV3[];
}): MakeHumanLocalRigPoseResultV3 {
  const { bundle, positions } = options;
  if (
    !(positions instanceof Float32Array) ||
    positions.length !== bundle.visibleVertexCount * 3 ||
    !positions.every(Number.isFinite)
  ) {
    throw new TypeError('Pose input must contain the complete finite visible positions.');
  }
  const evaluated = evaluateMakeHumanLocalRigBonePoseV4(options);

  if (evaluated.rotationCount === 0) {
    return Object.freeze({
      version: MAKEHUMAN_LOCAL_JOINT_FRAME_RESEARCH_V3,
      basisKind: options.basisKind,
      positions: positions.slice(),
      frames: evaluated.frames,
      maximumJointPivotResidual: 0,
      claims: CLAIMS,
    });
  }

  const output = new Float32Array(positions.length);
  for (let vertex = 0; vertex < bundle.visibleVertexCount; vertex += 1) {
    const positionOffset = vertex * 3;
    const point: MakeHumanLocalJointVec3V3 = [
      positions[positionOffset],
      positions[positionOffset + 1],
      positions[positionOffset + 2],
    ];
    const start = bundle.vertexWeightOffsets[vertex];
    const end = bundle.vertexWeightOffsets[vertex + 1];
    let x = 0;
    let y = 0;
    let z = 0;
    for (let pair = start; pair < end; pair += 1) {
      const posed = transform(evaluated.boneTransforms[bundle.weightBoneIndices[pair]], point);
      const weight = bundle.normalizedWeights[pair];
      x += posed[0] * weight;
      y += posed[1] * weight;
      z += posed[2] * weight;
    }
    output[positionOffset] = x;
    output[positionOffset + 1] = y;
    output[positionOffset + 2] = z;
  }
  if (!output.every(Number.isFinite))
    throw new Error('Local pose evaluator produced non-finite output.');
  return Object.freeze({
    version: MAKEHUMAN_LOCAL_JOINT_FRAME_RESEARCH_V3,
    basisKind: options.basisKind,
    positions: output,
    frames: evaluated.frames,
    maximumJointPivotResidual: evaluated.maximumJointPivotResidualM,
    claims: CLAIMS,
  });
}
