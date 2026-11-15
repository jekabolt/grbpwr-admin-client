import {
  MAKEHUMAN_TORSO_SHAPE_DELTA_BUNDLE_V1,
  type MakeHumanTorsoShapeDeltaBundleV1,
  type MakeHumanTorsoShapeDeltaModeV1,
} from './makehuman-torso-shape-delta-bundle-v1';
import { MAKEHUMAN_OPEN_REFERENCE_ARM_ANCHORS_SOURCE_UNITS_V1 } from './makehuman-open-reference-arm-length-warp-v1';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
  type MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';

export const MAKEHUMAN_UNIFORM_CHEST_SHOULDER_MODES_RESEARCH_V1 =
  'makehuman-uniform-chest-shoulder-modes-research/v1' as const;

export const UNIFORM_CHEST_SHOULDER_RESEARCH_KEYS_V1 = Object.freeze([
  'chestCircumferenceMm',
  'shoulderBreadthMm',
] as const);

export type UniformChestShoulderResearchKeyV1 =
  (typeof UNIFORM_CHEST_SHOULDER_RESEARCH_KEYS_V1)[number];

export interface UniformChestShoulderResearchSparseFieldV1 {
  readonly vertexIndices: Uint16Array;
  readonly deltasM: Float32Array;
}

export interface UniformChestShoulderResearchModeV1 {
  readonly measurementKey: UniformChestShoulderResearchKeyV1;
  readonly sourceChannel: 'chestCircumferenceCandidate' | 'shoulderDistanceCandidate';
  readonly decrease: UniformChestShoulderResearchSparseFieldV1;
  readonly increase: UniformChestShoulderResearchSparseFieldV1;
  readonly coefficientCaps: Readonly<{ decrease: number; increase: number }>;
  readonly chestStationOriginM: readonly [number, number, number] | null;
  readonly shoulderVertices: Readonly<{ negative: number; positive: number }> | null;
}

export interface MakeHumanUniformChestShoulderModesResearchResultV1 {
  readonly version: typeof MAKEHUMAN_UNIFORM_CHEST_SHOULDER_MODES_RESEARCH_V1;
  readonly role: 'CC0_OPEN_REFERENCE_RESEARCH_ONLY';
  readonly basisKind: MakeHumanOpenReferenceBasisV1['kind'];
  readonly heightMm: number;
  readonly uniformPositionsM: Float32Array;
  readonly modes: readonly UniformChestShoulderResearchModeV1[];
  readonly claims: {
    readonly geometricProxyOnly: true;
    readonly coupledSolveRequired: true;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly anatomicalTapePathEquivalent: false;
    readonly measurementProtocolEquivalent: false;
    readonly productionRuntimeEligible: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
  };
}

/**
 * Receipt-78 research caps. Chest increase stops before the neutral/male fixed-plane loop-selection
 * discontinuity first observed at coefficient 0.5. These are research bounds, not inferred slider
 * semantics or a production admission.
 */
export const UNIFORM_CHEST_SHOULDER_RESEARCH_CAPS_V1 = Object.freeze({
  chestCircumferenceMm: Object.freeze({ decrease: 0.5, increase: 0.25 }),
  shoulderBreadthMm: Object.freeze({ decrease: 1, increase: 1 }),
} satisfies Readonly<
  Record<UniformChestShoulderResearchKeyV1, Readonly<{ decrease: number; increase: number }>>
>);

const CHANNEL_BY_KEY = Object.freeze({
  chestCircumferenceMm: 'chestCircumferenceCandidate',
  shoulderBreadthMm: 'shoulderDistanceCandidate',
} as const);

const CLAIMS = Object.freeze({
  geometricProxyOnly: true as const,
  coupledSolveRequired: true as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  productionRuntimeEligible: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
});

function sourceMode(
  bundle: MakeHumanTorsoShapeDeltaBundleV1,
  measurementKey: UniformChestShoulderResearchKeyV1,
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
): UniformChestShoulderResearchSparseFieldV1 {
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
  decrease: UniformChestShoulderResearchSparseFieldV1,
  increase: UniformChestShoulderResearchSparseFieldV1,
): readonly number[] {
  return [...new Set([...decrease.vertexIndices, ...increase.vertexIndices])].sort(
    (left, right) => left - right,
  );
}

function chestStationOrigin(
  positionsM: Float32Array,
  decrease: UniformChestShoulderResearchSparseFieldV1,
  increase: UniformChestShoulderResearchSparseFieldV1,
): readonly [number, number, number] {
  const vertices = support(decrease, increase);
  if (vertices.length < 3) throw new Error('Chest direction support is incomplete.');
  let y = 0;
  let z = 0;
  vertices.forEach((vertex) => {
    y += positionsM[vertex * 3 + 1];
    z += positionsM[vertex * 3 + 2];
  });
  return Object.freeze([0, y / vertices.length, z / vertices.length]);
}

function nearestShoulderVertex(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly vertices: readonly number[];
  readonly target: readonly [number, number, number];
  readonly side: 'negative' | 'positive';
}): number {
  const candidates = options.vertices.filter((vertex) => {
    const x = options.basis.positionsSourceUnits[vertex * 3];
    return options.side === 'positive' ? x > 0 : x < 0;
  });
  if (candidates.length === 0) throw new Error(`${options.side} shoulder support is empty.`);
  const squaredDistance = (vertex: number) => {
    const offset = vertex * 3;
    const x = options.basis.positionsSourceUnits[offset] - options.target[0];
    const y = options.basis.positionsSourceUnits[offset + 1] - options.target[1];
    const z = options.basis.positionsSourceUnits[offset + 2] - options.target[2];
    return x * x + y * y + z * z;
  };
  return candidates.reduce((best, vertex) =>
    squaredDistance(vertex) < squaredDistance(best) ? vertex : best,
  );
}

/** Research-only conversion of the already pinned receipt-52 chest and shoulder directions. */
export function createMakeHumanUniformChestShoulderModesResearchV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly heightMm: number;
  readonly bundle: MakeHumanTorsoShapeDeltaBundleV1;
}): MakeHumanUniformChestShoulderModesResearchResultV1 {
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

  const modes = UNIFORM_CHEST_SHOULDER_RESEARCH_KEYS_V1.map((measurementKey) => {
    const decrease = transformField(
      sourceMode(bundle, measurementKey, 'decrease'),
      scaleMPerSourceUnit,
    );
    const increase = transformField(
      sourceMode(bundle, measurementKey, 'increase'),
      scaleMPerSourceUnit,
    );
    const vertices = support(decrease, increase);
    if (measurementKey === 'chestCircumferenceMm') {
      return Object.freeze({
        measurementKey,
        sourceChannel: CHANNEL_BY_KEY[measurementKey],
        decrease,
        increase,
        coefficientCaps: UNIFORM_CHEST_SHOULDER_RESEARCH_CAPS_V1[measurementKey],
        chestStationOriginM: chestStationOrigin(uniformPositionsM, decrease, increase),
        shoulderVertices: null,
      });
    }
    const anchors = MAKEHUMAN_OPEN_REFERENCE_ARM_ANCHORS_SOURCE_UNITS_V1[basis.kind];
    return Object.freeze({
      measurementKey,
      sourceChannel: CHANNEL_BY_KEY[measurementKey],
      decrease,
      increase,
      coefficientCaps: UNIFORM_CHEST_SHOULDER_RESEARCH_CAPS_V1[measurementKey],
      chestStationOriginM: null,
      shoulderVertices: Object.freeze({
        positive: nearestShoulderVertex({
          basis,
          vertices,
          target: anchors.left.shoulder,
          side: 'positive',
        }),
        negative: nearestShoulderVertex({
          basis,
          vertices,
          target: anchors.right.shoulder,
          side: 'negative',
        }),
      }),
    });
  });

  return Object.freeze({
    version: MAKEHUMAN_UNIFORM_CHEST_SHOULDER_MODES_RESEARCH_V1,
    role: 'CC0_OPEN_REFERENCE_RESEARCH_ONLY' as const,
    basisKind: basis.kind,
    heightMm,
    uniformPositionsM,
    modes: Object.freeze(modes),
    claims: CLAIMS,
  });
}
