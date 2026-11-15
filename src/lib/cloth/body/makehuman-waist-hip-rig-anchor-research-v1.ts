import type { UniformWaistHipSolverModeResultV1 } from './measurement-open-reference-uniform-waist-hip-solver-v1';
import {
  MAKEHUMAN_CORE_RIG_BUNDLE_METADATA_V1,
  MAKEHUMAN_CORE_RIG_POSE_RESEARCH_V1,
  poseMakeHumanCoreRigPositionsWithRestHeadsResearchV1,
  type MakeHumanCoreRigBasisKindV1,
  type MakeHumanCoreRigBundleV1,
  type MakeHumanCoreRigPosePresetV1,
} from './makehuman-core-rig-pose-research-v1';

export const MAKEHUMAN_WAIST_HIP_RIG_ANCHOR_DELTA_BUNDLE_V1 =
  'makehuman-waist-hip-rig-anchor-delta-bundle/v1' as const;
export const MAKEHUMAN_WAIST_HIP_POSE_RESEARCH_V1 = 'makehuman-waist-hip-pose-research/v1' as const;

const FORMAT_MAGIC = 'GRBPAD01';
const FORMAT_VERSION = 1;
const HEADER_BYTE_LENGTH = 128;
const BONE_COUNT = 163;
const BASIS_KINDS = Object.freeze(['base', 'neutral', 'male', 'female'] as const);
const MODE_IDS = Object.freeze([
  'waistCircumferenceCandidate:decrease',
  'waistCircumferenceCandidate:increase',
  'hipCircumferenceCandidate:decrease',
  'hipCircumferenceCandidate:increase',
] as const);
const PLANE_ENTRY_BYTE_LENGTH = 36;
const DELTA_ENTRY_BYTE_LENGTH = 60;

export type MakeHumanWaistHipRigAnchorModeIdV1 = (typeof MODE_IDS)[number];

export const MAKEHUMAN_WAIST_HIP_RIG_ANCHOR_DELTA_METADATA_V1 = Object.freeze({
  version: MAKEHUMAN_WAIST_HIP_RIG_ANCHOR_DELTA_BUNDLE_V1,
  role: 'RESEARCH_ONLY_SHAPE_MATCHED_RIG_ANCHOR_DIRECTIONS' as const,
  assetPath: 'src/assets/cloth/makehuman-hm08-waist-hip-rig-anchor-deltas-v1.bin',
  byteLength: 62_720,
  sha256: '26197a7077da504a53e312bfd1ed9582078e89c8be1fa4820aee4a647beaab62',
  sourceRigBundleSha256: MAKEHUMAN_CORE_RIG_BUNDLE_METADATA_V1.sha256,
  sourceTorsoBundleSha256: 'a59b351473ccb301dc06ec810ee8007c74e9568dfc86bbb60b7a707fd074b4e5',
  upstreamRepository: 'makehumancommunity/makehuman',
  upstreamCommit: '1f508f6083b2f823dab15de924b3bde72e08d77c',
  assetLicense: 'CC0-1.0',
  productionRuntimeApproved: false,
  productionUiApproved: false,
  fitClaimEligible: false,
  runtimeCollisionEligible: false,
});

export interface MakeHumanWaistHipRigAnchorModeV1 {
  readonly id: MakeHumanWaistHipRigAnchorModeIdV1;
  readonly headDeltasSourceUnits: Float32Array;
  readonly tailDeltasSourceUnits: Float32Array;
  readonly planePointDeltasSourceUnits: Float32Array;
}

export interface MakeHumanWaistHipRigAnchorDeltaBundleV1 {
  readonly version: typeof MAKEHUMAN_WAIST_HIP_RIG_ANCHOR_DELTA_BUNDLE_V1;
  readonly sourceUnitScaleToM: number;
  readonly fullSourceVertexCount: number;
  readonly basisPlanePointsSourceUnits: readonly {
    readonly kind: MakeHumanCoreRigBasisKindV1;
    readonly points: Float32Array;
  }[];
  readonly modes: readonly MakeHumanWaistHipRigAnchorModeV1[];
}

export interface MakeHumanWaistHipRigAnchorDeltaBundleBindingsV1 {
  readonly byteLength: number;
  readonly sourceRigBundleSha256: string;
  readonly sourceTorsoBundleSha256: string;
}

function uint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function finite(values: Float32Array, label: string): void {
  if (!values.every(Number.isFinite)) throw new Error(`${label} contains a non-finite value.`);
}

export function parseMakeHumanWaistHipRigAnchorDeltaBundleV1(
  input: ArrayBuffer | Uint8Array,
  bindings: MakeHumanWaistHipRigAnchorDeltaBundleBindingsV1 = MAKEHUMAN_WAIST_HIP_RIG_ANCHOR_DELTA_METADATA_V1,
): MakeHumanWaistHipRigAnchorDeltaBundleV1 {
  const bytes = input instanceof Uint8Array ? input.slice() : new Uint8Array(input.slice(0));
  if (bytes.byteLength !== bindings.byteLength) {
    throw new RangeError('Waist/hip rig-anchor bundle byte length is invalid.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== FORMAT_MAGIC) {
    throw new Error('Waist/hip rig-anchor bundle magic is invalid.');
  }
  const planeTableOffset = uint32(view, 36);
  const deltaTableOffset = uint32(view, 40);
  if (
    uint32(view, 8) !== FORMAT_VERSION ||
    uint32(view, 12) !== HEADER_BYTE_LENGTH ||
    uint32(view, 16) !== BONE_COUNT ||
    uint32(view, 20) !== BASIS_KINDS.length ||
    uint32(view, 24) !== MODE_IDS.length ||
    uint32(view, 28) !== PLANE_ENTRY_BYTE_LENGTH ||
    uint32(view, 32) !== DELTA_ENTRY_BYTE_LENGTH ||
    planeTableOffset !== HEADER_BYTE_LENGTH ||
    deltaTableOffset !==
      planeTableOffset + BASIS_KINDS.length * BONE_COUNT * PLANE_ENTRY_BYTE_LENGTH ||
    uint32(view, 44) !== bytes.byteLength ||
    uint32(view, 56) !== 19_158 ||
    uint32(view, 60) !== 0 ||
    deltaTableOffset + MODE_IDS.length * BONE_COUNT * DELTA_ENTRY_BYTE_LENGTH !== bytes.byteLength
  ) {
    throw new Error('Waist/hip rig-anchor bundle layout is invalid.');
  }
  const sourceUnitScaleToM = view.getFloat64(48, true);
  if (!Number.isFinite(sourceUnitScaleToM) || sourceUnitScaleToM !== 0.1) {
    throw new Error('Waist/hip rig-anchor source scale is invalid.');
  }
  if (
    hex(bytes.subarray(64, 96)) !== bindings.sourceRigBundleSha256 ||
    hex(bytes.subarray(96, 128)) !== bindings.sourceTorsoBundleSha256
  ) {
    throw new Error('Waist/hip rig-anchor source binding is invalid.');
  }

  const basisPlanePointsSourceUnits = BASIS_KINDS.map((kind, basisIndex) => {
    const points = new Float32Array(BONE_COUNT * 9);
    for (let bone = 0; bone < BONE_COUNT; bone += 1) {
      const record = planeTableOffset + (basisIndex * BONE_COUNT + bone) * PLANE_ENTRY_BYTE_LENGTH;
      for (let component = 0; component < 9; component += 1) {
        points[bone * 9 + component] = view.getFloat32(record + component * 4, true);
      }
    }
    finite(points, `${kind} plane points`);
    return Object.freeze({ kind, points });
  });
  const modes = MODE_IDS.map((id, modeIndex) => {
    const headDeltasSourceUnits = new Float32Array(BONE_COUNT * 3);
    const tailDeltasSourceUnits = new Float32Array(BONE_COUNT * 3);
    const planePointDeltasSourceUnits = new Float32Array(BONE_COUNT * 9);
    for (let bone = 0; bone < BONE_COUNT; bone += 1) {
      const record = deltaTableOffset + (modeIndex * BONE_COUNT + bone) * DELTA_ENTRY_BYTE_LENGTH;
      for (let component = 0; component < 3; component += 1) {
        headDeltasSourceUnits[bone * 3 + component] = view.getFloat32(record + component * 4, true);
        tailDeltasSourceUnits[bone * 3 + component] = view.getFloat32(
          record + 12 + component * 4,
          true,
        );
      }
      for (let component = 0; component < 9; component += 1) {
        planePointDeltasSourceUnits[bone * 9 + component] = view.getFloat32(
          record + 24 + component * 4,
          true,
        );
      }
    }
    finite(headDeltasSourceUnits, `${id} head deltas`);
    finite(tailDeltasSourceUnits, `${id} tail deltas`);
    finite(planePointDeltasSourceUnits, `${id} plane-point deltas`);
    return Object.freeze({
      id,
      headDeltasSourceUnits,
      tailDeltasSourceUnits,
      planePointDeltasSourceUnits,
    });
  });
  return Object.freeze({
    version: MAKEHUMAN_WAIST_HIP_RIG_ANCHOR_DELTA_BUNDLE_V1,
    sourceUnitScaleToM,
    fullSourceVertexCount: 19_158,
    basisPlanePointsSourceUnits: Object.freeze(basisPlanePointsSourceUnits),
    modes: Object.freeze(modes),
  });
}

type Point = readonly [number, number, number];

function subtract(left: Point, right: Point): Point {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Point, right: Point): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Point, right: Point): Point {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(value: Point, label: string): Point {
  const length = Math.hypot(...value);
  if (!Number.isFinite(length) || length < 1e-9) throw new Error(`${label} is degenerate.`);
  return [value[0] / length, value[1] / length, value[2] / length];
}

function modeId(
  result: UniformWaistHipSolverModeResultV1,
): MakeHumanWaistHipRigAnchorModeIdV1 | null {
  if (result.direction === 'none') return null;
  const channel =
    result.measurementKey === 'waistCircumferenceMm'
      ? 'waistCircumferenceCandidate'
      : 'hipCircumferenceCandidate';
  return `${channel}:${result.direction}`;
}

export interface MakeHumanShapeMatchedRigAnchorsMResultV1 {
  readonly headsM: Float32Array;
  readonly tailsM: Float32Array;
  readonly rollDirections: Float32Array;
  readonly maximumHeadDeltaM: number;
  readonly maximumTailDeltaM: number;
  readonly appliedModeIds: readonly MakeHumanWaistHipRigAnchorModeIdV1[];
  readonly claims: {
    readonly researchOnly: true;
    readonly helperVerticesIncludedAtRuntime: false;
    readonly uniformScaleAppliedAfterSourceSpaceAnchorDeltas: true;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
  };
}

const ANCHOR_CLAIMS = Object.freeze({
  researchOnly: true as const,
  helperVerticesIncludedAtRuntime: false as const,
  uniformScaleAppliedAfterSourceSpaceAnchorDeltas: true as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
});

/**
 * The exact order is `scale(baseAnchor + Σ sourceDelta * coefficient)`. Translation by the source
 * floor affects points, never deltas. Because the production height transform is affine, this is
 * identical to `scale(baseAnchor) + Σ scale(sourceDelta) * coefficient` within Float32 storage.
 */
export function deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1(options: {
  readonly rigBundle: MakeHumanCoreRigBundleV1;
  readonly anchorDeltaBundle: MakeHumanWaistHipRigAnchorDeltaBundleV1;
  readonly basisKind: MakeHumanCoreRigBasisKindV1;
  readonly sourceMinimumY: number;
  readonly sourceMaximumY: number;
  readonly heightMm: number;
  readonly modeResults: readonly UniformWaistHipSolverModeResultV1[];
}): MakeHumanShapeMatchedRigAnchorsMResultV1 {
  const {
    rigBundle,
    anchorDeltaBundle,
    basisKind,
    sourceMinimumY,
    sourceMaximumY,
    heightMm,
    modeResults,
  } = options;
  if (rigBundle.bones.length !== BONE_COUNT || anchorDeltaBundle.modes.length !== MODE_IDS.length) {
    throw new Error('Rig and waist/hip anchor bundles are incompatible.');
  }
  const basis = rigBundle.bases.find((candidate) => candidate.kind === basisKind);
  const planeBasis = anchorDeltaBundle.basisPlanePointsSourceUnits.find(
    (candidate) => candidate.kind === basisKind,
  );
  if (!basis || !planeBasis) throw new Error(`Missing ${basisKind} rig-anchor basis.`);
  const sourceHeight = sourceMaximumY - sourceMinimumY;
  const scaleMPerSourceUnit = heightMm / 1000 / sourceHeight;
  if (
    !Number.isFinite(sourceMinimumY) ||
    !Number.isFinite(sourceMaximumY) ||
    !Number.isFinite(heightMm) ||
    sourceHeight <= 0 ||
    scaleMPerSourceUnit <= 0
  ) {
    throw new RangeError('Rig-anchor height transform is invalid.');
  }
  const applied = modeResults
    .filter((result) => result.direction !== 'none')
    .map((result) => {
      if (
        !Number.isFinite(result.coefficient) ||
        result.coefficient < 0 ||
        result.coefficient > 1
      ) {
        throw new RangeError('Waist/hip rig-anchor coefficient must be within 0..1.');
      }
      const id = modeId(result)!;
      const mode = anchorDeltaBundle.modes.find((candidate) => candidate.id === id);
      if (!mode) throw new Error(`Missing rig-anchor mode ${id}.`);
      return Object.freeze({ id, coefficient: result.coefficient, mode });
    });
  if (new Set(applied.map(({ id }) => id.split(':', 1)[0])).size !== applied.length) {
    throw new Error('Waist/hip rig-anchor results contain duplicate channels.');
  }

  const headsM = new Float32Array(BONE_COUNT * 3);
  const tailsM = new Float32Array(BONE_COUNT * 3);
  const rollDirections = new Float32Array(BONE_COUNT * 3);
  let maximumHeadDeltaM = 0;
  let maximumTailDeltaM = 0;
  for (let bone = 0; bone < BONE_COUNT; bone += 1) {
    const headSource: number[] = [];
    const tailSource: number[] = [];
    const planesSource = [0, 1, 2].map(() => [] as number[]);
    for (let axis = 0; axis < 3; axis += 1) {
      const anchorOffset = bone * 3 + axis;
      let head = basis.headsSourceUnits[anchorOffset];
      let tail = basis.tailsSourceUnits[anchorOffset];
      const plane = [0, 1, 2].map((point) => planeBasis.points[bone * 9 + point * 3 + axis]);
      let headDelta = 0;
      let tailDelta = 0;
      applied.forEach(({ coefficient, mode }) => {
        headDelta += mode.headDeltasSourceUnits[anchorOffset] * coefficient;
        tailDelta += mode.tailDeltasSourceUnits[anchorOffset] * coefficient;
        for (let point = 0; point < 3; point += 1) {
          plane[point] +=
            mode.planePointDeltasSourceUnits[bone * 9 + point * 3 + axis] * coefficient;
        }
      });
      head += headDelta;
      tail += tailDelta;
      headSource.push(head);
      tailSource.push(tail);
      for (let point = 0; point < 3; point += 1) planesSource[point].push(plane[point]);
      headsM[anchorOffset] = (head - (axis === 1 ? sourceMinimumY : 0)) * scaleMPerSourceUnit;
      tailsM[anchorOffset] = (tail - (axis === 1 ? sourceMinimumY : 0)) * scaleMPerSourceUnit;
      maximumHeadDeltaM = Math.max(maximumHeadDeltaM, Math.abs(headDelta * scaleMPerSourceUnit));
      maximumTailDeltaM = Math.max(maximumTailDeltaM, Math.abs(tailDelta * scaleMPerSourceUnit));
    }
    const axis = normalize(
      subtract(tailSource as unknown as Point, headSource as unknown as Point),
      `bone ${bone} axis`,
    );
    const first = planesSource[0] as unknown as Point;
    const normal = normalize(
      cross(
        subtract(planesSource[1] as unknown as Point, first),
        subtract(planesSource[2] as unknown as Point, first),
      ),
      `bone ${bone} plane`,
    );
    const projection = normal.map(
      (value, index) => value - axis[index] * dot(normal, axis),
    ) as unknown as Point;
    const roll = normalize(projection, `bone ${bone} roll`);
    rollDirections.set(roll, bone * 3);
  }
  return Object.freeze({
    headsM,
    tailsM,
    rollDirections,
    maximumHeadDeltaM,
    maximumTailDeltaM,
    appliedModeIds: Object.freeze(applied.map(({ id }) => id)),
    claims: ANCHOR_CLAIMS,
  });
}

export interface MakeHumanUniformWaistHipPoseResearchResultV1 {
  readonly version: typeof MAKEHUMAN_WAIST_HIP_POSE_RESEARCH_V1;
  readonly evaluatorVersion: typeof MAKEHUMAN_CORE_RIG_POSE_RESEARCH_V1;
  readonly positionsM: Float32Array;
  readonly maximumJointPivotResidualM: number;
  readonly claims: {
    readonly researchOnly: true;
    readonly displayPoseCandidateOnly: true;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
  };
}

const POSE_CLAIMS = Object.freeze({
  researchOnly: true as const,
  displayPoseCandidateOnly: true as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
});

export function poseMakeHumanUniformWaistHipDisplayResearchV1(options: {
  readonly rigBundle: MakeHumanCoreRigBundleV1;
  readonly positionsM: Float32Array;
  readonly anchorsM: MakeHumanShapeMatchedRigAnchorsMResultV1;
  readonly preset: MakeHumanCoreRigPosePresetV1;
}): MakeHumanUniformWaistHipPoseResearchResultV1 {
  const result = poseMakeHumanCoreRigPositionsWithRestHeadsResearchV1({
    bundle: options.rigBundle,
    positions: options.positionsM,
    restHeads: options.anchorsM.headsM,
    preset: options.preset,
  });
  return Object.freeze({
    version: MAKEHUMAN_WAIST_HIP_POSE_RESEARCH_V1,
    evaluatorVersion: MAKEHUMAN_CORE_RIG_POSE_RESEARCH_V1,
    positionsM: result.positions,
    maximumJointPivotResidualM: result.maximumJointPivotResidual,
    claims: POSE_CLAIMS,
  });
}
