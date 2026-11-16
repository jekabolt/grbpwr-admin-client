export const MAKEHUMAN_CORE_RIG_BUNDLE_V1 = 'makehuman-core-rig-bundle/v1' as const;
export const MAKEHUMAN_CORE_RIG_POSE_RESEARCH_V1 = 'makehuman-core-rig-pose-research/v1' as const;

const FORMAT_MAGIC = 'GRBPRG01';
const FORMAT_VERSION = 1;
const HEADER_BYTE_LENGTH = 128;
const BONE_ENTRY_BYTE_LENGTH = 16;
const ANCHOR_ENTRY_BYTE_LENGTH = 36;
const WEIGHT_ENTRY_BYTE_LENGTH = 8;
const BASIS_KINDS = Object.freeze(['base', 'neutral', 'male', 'female'] as const);

export type MakeHumanCoreRigBasisKindV1 = (typeof BASIS_KINDS)[number];

export const MAKEHUMAN_CORE_RIG_BUNDLE_METADATA_V1 = Object.freeze({
  version: MAKEHUMAN_CORE_RIG_BUNDLE_V1,
  role: 'RESEARCH_ONLY_OPEN_REFERENCE_POSE_BASIS' as const,
  assetPath: 'src/assets/cloth/makehuman-hm08-core-rig-v1.bin',
  byteLength: 402_738,
  sha256: '4fd4364c07ac7cfd5efe0d81a53c007ef3f1941358583307632d427a3012e4ed',
  upstreamRepository: 'makehumancommunity/makehuman',
  upstreamCommit: '1f508f6083b2f823dab15de924b3bde72e08d77c',
  assetLicense: 'CC0-1.0',
  applicationCodeUsedAtRuntime: false,
  productionRuntimeApproved: false,
  productionUiApproved: false,
  fitClaimEligible: false,
  runtimeCollisionEligible: false,
});

export interface MakeHumanCoreRigBoneV1 {
  readonly name: string;
  readonly parentIndex: number;
}

export interface MakeHumanCoreRigBasisAnchorsV1 {
  readonly kind: MakeHumanCoreRigBasisKindV1;
  readonly headsSourceUnits: Float32Array;
  readonly tailsSourceUnits: Float32Array;
  readonly rollDirections: Float32Array;
}

export interface MakeHumanCoreRigBundleV1 {
  readonly version: typeof MAKEHUMAN_CORE_RIG_BUNDLE_V1;
  readonly sourceUnitScaleToM: number;
  readonly visibleVertexCount: number;
  readonly fullSourceVertexCount: number;
  readonly bones: readonly MakeHumanCoreRigBoneV1[];
  readonly bases: readonly MakeHumanCoreRigBasisAnchorsV1[];
  readonly vertexWeightOffsets: Uint32Array;
  readonly weightBoneIndices: Uint16Array;
  readonly normalizedWeights: Float32Array;
  readonly maximumInfluencesPerVertex: number;
}

export interface MakeHumanPoseRotationV1 {
  readonly bone: string;
  readonly axis: 'x' | 'y' | 'z';
  readonly degrees: number;
}

export interface MakeHumanCoreRigPosePresetV1 {
  readonly id: 'a-rest' | 'near-t' | 'relaxed-symmetric';
  readonly label: string;
  readonly rotations: readonly MakeHumanPoseRotationV1[];
  readonly symmetric: true;
  readonly researchOnly: true;
}

export const MAKEHUMAN_CORE_RIG_POSE_PRESETS_V1 = Object.freeze([
  Object.freeze({
    id: 'a-rest' as const,
    label: 'A-pose / rest',
    rotations: Object.freeze([]),
    symmetric: true as const,
    researchOnly: true as const,
  }),
  Object.freeze({
    id: 'near-t' as const,
    label: 'Bounded near-T direction',
    rotations: Object.freeze([
      Object.freeze({ bone: 'upperarm01.L', axis: 'z' as const, degrees: 25 }),
      Object.freeze({ bone: 'upperarm01.R', axis: 'z' as const, degrees: -25 }),
    ]),
    symmetric: true as const,
    researchOnly: true as const,
  }),
  Object.freeze({
    id: 'relaxed-symmetric' as const,
    label: 'Relaxed symmetric stance',
    rotations: Object.freeze([
      Object.freeze({ bone: 'shoulder01.L', axis: 'z' as const, degrees: -4 }),
      Object.freeze({ bone: 'shoulder01.R', axis: 'z' as const, degrees: 4 }),
      Object.freeze({ bone: 'lowerarm01.L', axis: 'z' as const, degrees: -5 }),
      Object.freeze({ bone: 'lowerarm01.R', axis: 'z' as const, degrees: 5 }),
    ]),
    symmetric: true as const,
    researchOnly: true as const,
  }),
] satisfies readonly MakeHumanCoreRigPosePresetV1[]);

type Point = readonly [number, number, number];

interface Affine {
  readonly rotation: readonly [
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
  readonly translation: Point;
}

const IDENTITY: Affine = Object.freeze({
  rotation: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1] as const),
  translation: Object.freeze([0, 0, 0] as const),
});

function exactBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input.slice();
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0));
  throw new TypeError('Rig bundle input must be an ArrayBuffer or Uint8Array.');
}

function uint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function finitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive.`);
}

export function parseMakeHumanCoreRigBundleV1(
  input: ArrayBuffer | Uint8Array,
): MakeHumanCoreRigBundleV1 {
  const bytes = exactBytes(input);
  if (bytes.byteLength < HEADER_BYTE_LENGTH) throw new RangeError('Rig bundle is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = new TextDecoder().decode(bytes.subarray(0, 8));
  if (magic !== FORMAT_MAGIC || uint32(view, 8) !== FORMAT_VERSION) {
    throw new Error('Unsupported MakeHuman core rig bundle.');
  }
  if (uint32(view, 12) !== HEADER_BYTE_LENGTH) throw new Error('Rig header length mismatch.');
  const visibleVertexCount = uint32(view, 16);
  const boneCount = uint32(view, 20);
  const basisCount = uint32(view, 24);
  const pairCount = uint32(view, 28);
  const maximumInfluencesPerVertex = uint32(view, 32);
  if (
    visibleVertexCount !== 13_380 ||
    boneCount !== 163 ||
    basisCount !== BASIS_KINDS.length ||
    pairCount !== 40_156 ||
    maximumInfluencesPerVertex !== 9 ||
    uint32(view, 36) !== BONE_ENTRY_BYTE_LENGTH ||
    uint32(view, 40) !== ANCHOR_ENTRY_BYTE_LENGTH ||
    uint32(view, 44) !== WEIGHT_ENTRY_BYTE_LENGTH
  ) {
    throw new Error('Rig bundle topology or record layout mismatch.');
  }
  const sourceUnitScaleToM = view.getFloat64(48, true);
  finitePositive(sourceUnitScaleToM, 'sourceUnitScaleToM');
  const boneTableOffset = uint32(view, 56);
  const anchorTableOffset = uint32(view, 60);
  const vertexOffsetTableOffset = uint32(view, 64);
  const weightTableOffset = uint32(view, 68);
  const stringTableOffset = uint32(view, 72);
  const stringTableLength = uint32(view, 76);
  const declaredByteLength = uint32(view, 80);
  const fullSourceVertexCount = uint32(view, 84);
  if (
    boneTableOffset !== HEADER_BYTE_LENGTH ||
    anchorTableOffset !== boneTableOffset + boneCount * BONE_ENTRY_BYTE_LENGTH ||
    vertexOffsetTableOffset !==
      anchorTableOffset + basisCount * boneCount * ANCHOR_ENTRY_BYTE_LENGTH ||
    weightTableOffset !== vertexOffsetTableOffset + (visibleVertexCount + 1) * 4 ||
    stringTableOffset !== weightTableOffset + pairCount * WEIGHT_ENTRY_BYTE_LENGTH ||
    stringTableOffset + stringTableLength !== bytes.byteLength ||
    declaredByteLength !== bytes.byteLength ||
    fullSourceVertexCount !== 19_158
  ) {
    throw new Error('Rig bundle offset or byte-length mismatch.');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const stringTable = bytes.subarray(stringTableOffset, stringTableOffset + stringTableLength);
  const bones: MakeHumanCoreRigBoneV1[] = [];
  const names = new Set<string>();
  for (let bone = 0; bone < boneCount; bone += 1) {
    const offset = boneTableOffset + bone * BONE_ENTRY_BYTE_LENGTH;
    const nameOffset = uint32(view, offset);
    const end = stringTable.indexOf(0, nameOffset);
    if (nameOffset >= stringTable.byteLength || end < 0) throw new Error('Invalid bone name.');
    const name = decoder.decode(stringTable.subarray(nameOffset, end));
    const parentIndex = view.getInt32(offset + 4, true);
    if (!name || names.has(name) || parentIndex >= bone || parentIndex < -1) {
      throw new Error(`Invalid bone record ${bone}.`);
    }
    names.add(name);
    bones.push(Object.freeze({ name, parentIndex }));
  }

  const bases = BASIS_KINDS.map((kind, basisIndex) => {
    const headsSourceUnits = new Float32Array(boneCount * 3);
    const tailsSourceUnits = new Float32Array(boneCount * 3);
    const rollDirections = new Float32Array(boneCount * 3);
    for (let bone = 0; bone < boneCount; bone += 1) {
      const record = anchorTableOffset + (basisIndex * boneCount + bone) * ANCHOR_ENTRY_BYTE_LENGTH;
      for (let axis = 0; axis < 3; axis += 1) {
        headsSourceUnits[bone * 3 + axis] = view.getFloat32(record + axis * 4, true);
        tailsSourceUnits[bone * 3 + axis] = view.getFloat32(record + 12 + axis * 4, true);
        rollDirections[bone * 3 + axis] = view.getFloat32(record + 24 + axis * 4, true);
      }
    }
    if (
      !headsSourceUnits.every(Number.isFinite) ||
      !tailsSourceUnits.every(Number.isFinite) ||
      !rollDirections.every(Number.isFinite)
    ) {
      throw new Error(`Non-finite ${kind} rig anchors.`);
    }
    return Object.freeze({ kind, headsSourceUnits, tailsSourceUnits, rollDirections });
  });

  const vertexWeightOffsets = new Uint32Array(visibleVertexCount + 1);
  for (let vertex = 0; vertex <= visibleVertexCount; vertex += 1) {
    vertexWeightOffsets[vertex] = uint32(view, vertexOffsetTableOffset + vertex * 4);
    if (
      vertexWeightOffsets[vertex] > pairCount ||
      (vertex > 0 && vertexWeightOffsets[vertex] < vertexWeightOffsets[vertex - 1])
    ) {
      throw new Error(`Invalid weight offset for vertex ${vertex}.`);
    }
  }
  if (vertexWeightOffsets[visibleVertexCount] !== pairCount) {
    throw new Error('Final weight offset mismatch.');
  }
  const weightBoneIndices = new Uint16Array(pairCount);
  const normalizedWeights = new Float32Array(pairCount);
  for (let pair = 0; pair < pairCount; pair += 1) {
    const offset = weightTableOffset + pair * WEIGHT_ENTRY_BYTE_LENGTH;
    weightBoneIndices[pair] = view.getUint16(offset, true);
    normalizedWeights[pair] = view.getFloat32(offset + 4, true);
    if (weightBoneIndices[pair] >= boneCount || !(normalizedWeights[pair] > 0)) {
      throw new Error(`Invalid weight pair ${pair}.`);
    }
  }
  for (let vertex = 0; vertex < visibleVertexCount; vertex += 1) {
    const start = vertexWeightOffsets[vertex];
    const end = vertexWeightOffsets[vertex + 1];
    if (end <= start || end - start > maximumInfluencesPerVertex) {
      throw new Error(`Invalid influence count for vertex ${vertex}.`);
    }
    let sum = 0;
    let previousBone = -1;
    for (let pair = start; pair < end; pair += 1) {
      if (weightBoneIndices[pair] <= previousBone) {
        throw new Error(`Weights are not bone-sorted for vertex ${vertex}.`);
      }
      previousBone = weightBoneIndices[pair];
      sum += normalizedWeights[pair];
    }
    if (Math.abs(sum - 1) > 2e-7)
      throw new Error(`Weights are not normalized at vertex ${vertex}.`);
  }

  return Object.freeze({
    version: MAKEHUMAN_CORE_RIG_BUNDLE_V1,
    sourceUnitScaleToM,
    visibleVertexCount,
    fullSourceVertexCount,
    bones: Object.freeze(bones),
    bases: Object.freeze(bases),
    vertexWeightOffsets,
    weightBoneIndices,
    normalizedWeights,
    maximumInfluencesPerVertex,
  });
}

function rotation(axis: MakeHumanPoseRotationV1['axis'], degrees: number): Affine['rotation'] {
  if (!Number.isFinite(degrees) || Math.abs(degrees) > 90) {
    throw new RangeError('Research pose rotations must remain within ±90 degrees.');
  }
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  if (axis === 'x') return [1, 0, 0, 0, cosine, -sine, 0, sine, cosine];
  if (axis === 'y') return [cosine, 0, sine, 0, 1, 0, -sine, 0, cosine];
  return [cosine, -sine, 0, sine, cosine, 0, 0, 0, 1];
}

function rotate(matrix: Affine['rotation'], point: Point): Point {
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2],
    matrix[3] * point[0] + matrix[4] * point[1] + matrix[5] * point[2],
    matrix[6] * point[0] + matrix[7] * point[1] + matrix[8] * point[2],
  ];
}

function multiplyRotation(left: Affine['rotation'], right: Affine['rotation']): Affine['rotation'] {
  const output = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      for (let inner = 0; inner < 3; inner += 1) {
        output[row * 3 + column] += left[row * 3 + inner] * right[inner * 3 + column];
      }
    }
  }
  return output as unknown as Affine['rotation'];
}

function compose(parent: Affine, child: Affine): Affine {
  const rotatedTranslation = rotate(parent.rotation, child.translation);
  return {
    rotation: multiplyRotation(parent.rotation, child.rotation),
    translation: [
      rotatedTranslation[0] + parent.translation[0],
      rotatedTranslation[1] + parent.translation[1],
      rotatedTranslation[2] + parent.translation[2],
    ],
  };
}

function pivoted(rotationMatrix: Affine['rotation'], pivot: Point): Affine {
  const rotatedPivot = rotate(rotationMatrix, pivot);
  return {
    rotation: rotationMatrix,
    translation: [
      pivot[0] - rotatedPivot[0],
      pivot[1] - rotatedPivot[1],
      pivot[2] - rotatedPivot[2],
    ],
  };
}

function transform(value: Affine, point: Point): Point {
  const rotated = rotate(value.rotation, point);
  return [
    rotated[0] + value.translation[0],
    rotated[1] + value.translation[1],
    rotated[2] + value.translation[2],
  ];
}

export interface MakeHumanCoreRigPoseResultV1 {
  readonly version: typeof MAKEHUMAN_CORE_RIG_POSE_RESEARCH_V1;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly presetId: MakeHumanCoreRigPosePresetV1['id'];
  readonly positionsSourceUnits: Float32Array;
  readonly claims: {
    readonly researchOnly: true;
    readonly displayPoseCandidateOnly: true;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
  };
}

const CLAIMS = Object.freeze({
  researchOnly: true as const,
  displayPoseCandidateOnly: true as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
});

export interface MakeHumanCoreRigRestHeadPoseResultV1 {
  readonly positions: Float32Array;
  readonly maximumJointPivotResidual: number;
}

/**
 * Unit-agnostic research kernel. Positions and rest heads must use the same affine coordinate
 * space. This narrow export lets later research evaluate a final proxy-deformed display mesh
 * without making the rig or presets reachable from the production runtime graph.
 */
export function poseMakeHumanCoreRigPositionsWithRestHeadsResearchV1(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly positions: Float32Array;
  readonly restHeads: Float32Array;
  readonly preset: MakeHumanCoreRigPosePresetV1;
}): MakeHumanCoreRigRestHeadPoseResultV1 {
  const { bundle, positions, restHeads, preset } = options;
  if (
    !(positions instanceof Float32Array) ||
    positions.length !== bundle.visibleVertexCount * 3 ||
    !positions.every(Number.isFinite)
  ) {
    throw new TypeError('Pose input must contain the complete finite visible positions.');
  }
  if (
    !(restHeads instanceof Float32Array) ||
    restHeads.length !== bundle.bones.length * 3 ||
    !restHeads.every(Number.isFinite)
  ) {
    throw new TypeError('Pose rest heads must contain one finite XYZ point per bone.');
  }
  if (preset.id === 'a-rest') {
    return Object.freeze({ positions: positions.slice(), maximumJointPivotResidual: 0 });
  }
  const boneIndexByName = new Map(bundle.bones.map((bone, index) => [bone.name, index]));
  const rotationsByBone = new Map<number, MakeHumanPoseRotationV1[]>();
  preset.rotations.forEach((value) => {
    const bone = boneIndexByName.get(value.bone);
    if (bone === undefined) throw new Error(`Pose references unknown bone ${value.bone}.`);
    const current = rotationsByBone.get(bone) ?? [];
    current.push(value);
    rotationsByBone.set(bone, current);
  });
  const boneTransforms: Affine[] = [];
  let maximumJointPivotResidual = 0;
  bundle.bones.forEach((bone, boneIndex) => {
    const parent = bone.parentIndex < 0 ? IDENTITY : boneTransforms[bone.parentIndex];
    const pivotOffset = boneIndex * 3;
    const pivot: Point = [
      restHeads[pivotOffset],
      restHeads[pivotOffset + 1],
      restHeads[pivotOffset + 2],
    ];
    let local = IDENTITY;
    (rotationsByBone.get(boneIndex) ?? []).forEach((value) => {
      local = compose(local, pivoted(rotation(value.axis, value.degrees), pivot));
    });
    const child = compose(parent, local);
    const parentPivot = transform(parent, pivot);
    const childPivot = transform(child, pivot);
    maximumJointPivotResidual = Math.max(
      maximumJointPivotResidual,
      Math.hypot(
        parentPivot[0] - childPivot[0],
        parentPivot[1] - childPivot[1],
        parentPivot[2] - childPivot[2],
      ),
    );
    boneTransforms.push(child);
  });

  const output = new Float32Array(positions.length);
  for (let vertex = 0; vertex < bundle.visibleVertexCount; vertex += 1) {
    const positionOffset = vertex * 3;
    const point: Point = [
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
      const posed = transform(boneTransforms[bundle.weightBoneIndices[pair]], point);
      const weight = bundle.normalizedWeights[pair];
      x += posed[0] * weight;
      y += posed[1] * weight;
      z += posed[2] * weight;
    }
    output[positionOffset] = x;
    output[positionOffset + 1] = y;
    output[positionOffset + 2] = z;
  }
  if (!output.every(Number.isFinite)) throw new Error('Pose evaluator produced non-finite output.');
  return Object.freeze({ positions: output, maximumJointPivotResidual });
}

export function poseMakeHumanCoreRigSourcePositionsV1(options: {
  readonly bundle: MakeHumanCoreRigBundleV1;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly positionsSourceUnits: Float32Array;
  readonly preset: MakeHumanCoreRigPosePresetV1;
}): MakeHumanCoreRigPoseResultV1 {
  const { bundle, basisKind, positionsSourceUnits, preset } = options;
  const basis = bundle.bases.find((candidate) => candidate.kind === basisKind);
  if (!basis) throw new Error(`Missing rig basis ${basisKind}.`);
  const posed = poseMakeHumanCoreRigPositionsWithRestHeadsResearchV1({
    bundle,
    positions: positionsSourceUnits,
    restHeads: basis.headsSourceUnits,
    preset,
  });
  return Object.freeze({
    version: MAKEHUMAN_CORE_RIG_POSE_RESEARCH_V1,
    basisKind,
    presetId: preset.id,
    positionsSourceUnits: posed.positions,
    claims: CLAIMS,
  });
}
