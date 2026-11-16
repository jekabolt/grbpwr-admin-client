import {
  MAKEHUMAN_TORSO_SHAPE_DELTA_BUNDLE_V1,
  type MakeHumanTorsoShapeDeltaBundleV1,
  type MakeHumanTorsoShapeDeltaModeV1,
} from './makehuman-torso-shape-delta-bundle-v1';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
  type MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';

export const MAKEHUMAN_UNIFORM_WAIST_HIP_MODES_V1 = 'makehuman-uniform-waist-hip-modes/v1' as const;

export const UNIFORM_WAIST_HIP_KEYS_V1 = Object.freeze([
  'waistCircumferenceMm',
  'hipCircumferenceMm',
] as const);

export type UniformWaistHipKeyV1 = (typeof UNIFORM_WAIST_HIP_KEYS_V1)[number];

export interface UniformWaistHipSparseFieldV1 {
  readonly vertexIndices: Uint16Array;
  readonly deltasM: Float32Array;
}

export interface UniformWaistHipModeV1 {
  readonly measurementKey: UniformWaistHipKeyV1;
  readonly sourceChannel: 'hipCircumferenceCandidate' | 'waistCircumferenceCandidate';
  readonly stationOriginM: readonly [number, number, number];
  readonly decrease: UniformWaistHipSparseFieldV1;
  readonly increase: UniformWaistHipSparseFieldV1;
}

export interface MakeHumanUniformWaistHipModesResultV1 {
  readonly version: typeof MAKEHUMAN_UNIFORM_WAIST_HIP_MODES_V1;
  readonly role: 'CC0_OPEN_REFERENCE_RESEARCH_CANDIDATE';
  readonly basisKind: MakeHumanOpenReferenceBasisV1['kind'];
  readonly heightMm: number;
  readonly uniformPositionsM: Float32Array;
  readonly modes: readonly UniformWaistHipModeV1[];
  readonly claims: {
    readonly uniformAffinePointDifferenceTransformUsed: true;
    readonly geometricPlaneLoopOnly: true;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly tapeMeasurementEquivalent: false;
    readonly measurementProtocolEquivalent: false;
    readonly populationRepresentativenessClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
  };
}

const CLAIMS = Object.freeze({
  uniformAffinePointDifferenceTransformUsed: true as const,
  geometricPlaneLoopOnly: true as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  tapeMeasurementEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
});

const CHANNEL_BY_KEY = Object.freeze({
  waistCircumferenceMm: 'waistCircumferenceCandidate',
  hipCircumferenceMm: 'hipCircumferenceCandidate',
} as const);

function sourceMode(
  bundle: MakeHumanTorsoShapeDeltaBundleV1,
  measurementKey: UniformWaistHipKeyV1,
  direction: 'decrease' | 'increase',
): MakeHumanTorsoShapeDeltaModeV1 {
  const channel = CHANNEL_BY_KEY[measurementKey];
  const matches = bundle.modes.filter((mode) => mode.id === `${channel}:${direction}`);
  if (matches.length !== 1) {
    throw new Error(`Torso bundle must contain exactly one ${channel}:${direction} mode.`);
  }
  return matches[0];
}

function transformField(
  source: MakeHumanTorsoShapeDeltaModeV1,
  scaleMPerSourceUnit: number,
): UniformWaistHipSparseFieldV1 {
  const vertexIndices = Uint16Array.from(source.vertexIndices);
  const deltasM = Float32Array.from(
    source.deltasSourceUnits,
    (value) => value * scaleMPerSourceUnit,
  );
  if (![...deltasM].every(Number.isFinite) || !deltasM.some((value) => value !== 0)) {
    throw new Error(`${source.id} produced an invalid uniform-space sparse field.`);
  }
  return Object.freeze({ vertexIndices, deltasM });
}

function support(
  decrease: UniformWaistHipSparseFieldV1,
  increase: UniformWaistHipSparseFieldV1,
): readonly number[] {
  return [...new Set([...decrease.vertexIndices, ...increase.vertexIndices])].sort(
    (left, right) => left - right,
  );
}

function stationOrigin(
  positionsM: Float32Array,
  decrease: UniformWaistHipSparseFieldV1,
  increase: UniformWaistHipSparseFieldV1,
): readonly [number, number, number] {
  const vertices = support(decrease, increase);
  if (vertices.length < 3) throw new Error('Torso direction support is incomplete.');
  let y = 0;
  let z = 0;
  vertices.forEach((vertex) => {
    y += positionsM[vertex * 3 + 1];
    z += positionsM[vertex * 3 + 2];
  });
  return Object.freeze([0, y / vertices.length, z / vertices.length]);
}

/**
 * Converts the pinned CC0 waist/hips directions into a uniformly height-scaled basis. The affine
 * transform makes `T(p + d) - T(p) === d * scale` exactly; no piecewise torso warp is involved.
 */
export function createMakeHumanUniformWaistHipModesV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly heightMm: number;
  readonly bundle: MakeHumanTorsoShapeDeltaBundleV1;
}): MakeHumanUniformWaistHipModesResultV1 {
  const { basis, bundle, heightMm } = options;
  if (basis.schemaVersion !== MAKEHUMAN_OPEN_REFERENCE_BASIS_V1) {
    throw new TypeError('A parsed MakeHuman open-reference basis is required.');
  }
  if (bundle.schemaVersion !== MAKEHUMAN_TORSO_SHAPE_DELTA_BUNDLE_V1) {
    throw new TypeError('A parsed MakeHuman torso-shape bundle is required.');
  }
  if (!Number.isFinite(heightMm) || heightMm <= 0) {
    throw new RangeError('heightMm must be finite and positive.');
  }
  if (
    bundle.visibleBodyVertexCount * 3 !== basis.positionsSourceUnits.length ||
    bundle.sourceUnitScaleToM !== basis.sourceUnitScaleToM
  ) {
    throw new Error('Torso bundle and open-reference basis geometry do not match.');
  }

  const sourceHeight = basis.sourceMaximumY - basis.sourceMinimumY;
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new Error('Open-reference basis height is invalid.');
  }
  const scaleMPerSourceUnit = heightMm / 1000 / sourceHeight;
  const uniformPositionsM = new Float32Array(basis.positionsSourceUnits.length);
  for (let vertex = 0; vertex < uniformPositionsM.length / 3; vertex += 1) {
    const offset = vertex * 3;
    uniformPositionsM.set(
      [
        basis.positionsSourceUnits[offset] * scaleMPerSourceUnit,
        (basis.positionsSourceUnits[offset + 1] - basis.sourceMinimumY) * scaleMPerSourceUnit,
        basis.positionsSourceUnits[offset + 2] * scaleMPerSourceUnit,
      ],
      offset,
    );
  }

  const modes = UNIFORM_WAIST_HIP_KEYS_V1.map((measurementKey) => {
    const decrease = transformField(
      sourceMode(bundle, measurementKey, 'decrease'),
      scaleMPerSourceUnit,
    );
    const increase = transformField(
      sourceMode(bundle, measurementKey, 'increase'),
      scaleMPerSourceUnit,
    );
    return Object.freeze({
      measurementKey,
      sourceChannel: CHANNEL_BY_KEY[measurementKey],
      stationOriginM: stationOrigin(uniformPositionsM, decrease, increase),
      decrease,
      increase,
    });
  });

  return Object.freeze({
    version: MAKEHUMAN_UNIFORM_WAIST_HIP_MODES_V1,
    role: 'CC0_OPEN_REFERENCE_RESEARCH_CANDIDATE' as const,
    basisKind: basis.kind,
    heightMm,
    uniformPositionsM,
    modes: Object.freeze(modes),
    claims: CLAIMS,
  });
}
