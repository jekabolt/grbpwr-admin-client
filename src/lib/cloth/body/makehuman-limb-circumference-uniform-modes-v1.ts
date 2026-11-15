import {
  MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_BUNDLE_V1,
  type MakeHumanLimbCircumferenceDeltaBundleV1,
  type MakeHumanLimbCircumferenceDeltaModeV1,
} from './makehuman-limb-circumference-delta-bundle-v1';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
  type MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import {
  OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1,
  type OpenReferenceLimbCircumferenceKeyV1,
  type OpenReferenceLimbCircumferenceModeV1,
  type OpenReferenceSparseDeltaFieldV1,
} from './measurement-open-reference-limb-circumference-solver-v1';

export const MAKEHUMAN_LIMB_CIRCUMFERENCE_UNIFORM_MODES_V1 =
  'makehuman-limb-circumference-uniform-modes/v1' as const;

export interface MakeHumanLimbCircumferenceUniformModesResultV1 {
  readonly version: typeof MAKEHUMAN_LIMB_CIRCUMFERENCE_UNIFORM_MODES_V1;
  readonly role: 'CC0_OPEN_REFERENCE_RESEARCH_ONLY';
  readonly basisKind: MakeHumanOpenReferenceBasisV1['kind'];
  readonly heightMm: number;
  readonly scaleMPerSourceUnit: number;
  readonly positionsM: Float32Array;
  readonly modes: readonly OpenReferenceLimbCircumferenceModeV1[];
  readonly claims: {
    readonly exactUniformPointDifferenceTransformUsed: true;
    readonly directSliderSemanticsClaimed: false;
    readonly millimetreCalibrationClaimed: false;
    readonly tapeMeasurementEquivalent: false;
    readonly measurementProtocolEquivalent: false;
    readonly populationRepresentativenessClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
  };
}

const CLAIMS = Object.freeze({
  exactUniformPointDifferenceTransformUsed: true as const,
  directSliderSemanticsClaimed: false as const,
  millimetreCalibrationClaimed: false as const,
  tapeMeasurementEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
});

function sourceMode(
  bundle: MakeHumanLimbCircumferenceDeltaBundleV1,
  measurementKey: OpenReferenceLimbCircumferenceKeyV1,
  direction: 'decrease' | 'increase',
): MakeHumanLimbCircumferenceDeltaModeV1 {
  const id = `${measurementKey}:${direction}` as const;
  const matches = bundle.modes.filter((mode) => mode.id === id);
  if (matches.length !== 1) throw new Error(`Limb delta bundle must contain exactly one ${id}.`);
  return matches[0];
}

function uniformField(
  source: MakeHumanLimbCircumferenceDeltaModeV1,
  scaleMPerSourceUnit: number,
): OpenReferenceSparseDeltaFieldV1 {
  const deltasM = Float32Array.from(
    source.deltasSourceUnits,
    (value) => value * scaleMPerSourceUnit,
  );
  if (![...deltasM].every(Number.isFinite) || !deltasM.some((value) => value !== 0)) {
    throw new Error(`Uniform limb delta ${source.id} is invalid.`);
  }
  return Object.freeze({
    vertexIndices: Uint16Array.from(source.vertexIndices),
    deltasM,
  });
}

/**
 * Research-only adapter for the safe uniform display space. For
 * `T(p) = scale * (p.x, p.y - minimumY, p.z)`, the exact point difference is
 * `T(p + delta) - T(p) = scale * delta`.
 */
export function createMakeHumanLimbCircumferenceUniformModesV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly heightMm: number;
  readonly bundle: MakeHumanLimbCircumferenceDeltaBundleV1;
}): MakeHumanLimbCircumferenceUniformModesResultV1 {
  const { basis, heightMm, bundle } = options;
  if (basis.schemaVersion !== MAKEHUMAN_OPEN_REFERENCE_BASIS_V1) {
    throw new TypeError('A parsed MakeHuman open-reference basis is required.');
  }
  if (bundle.schemaVersion !== MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_BUNDLE_V1) {
    throw new TypeError('A parsed MakeHuman limb circumference bundle is required.');
  }
  if (
    bundle.visibleBodyVertexCount * 3 !== basis.positionsSourceUnits.length ||
    bundle.sourceUnitScaleToM !== basis.sourceUnitScaleToM
  ) {
    throw new Error('Limb delta bundle and open-reference basis geometry do not match.');
  }
  if (bundle.modes.length !== OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1.length * 2) {
    throw new Error('Limb delta bundle must contain exactly ten required direction modes.');
  }
  if (!Number.isFinite(heightMm) || heightMm <= 0) {
    throw new RangeError('heightMm must be finite and positive.');
  }
  if (
    bundle.visibleBodyVertexCount * 3 !== basis.positionsSourceUnits.length ||
    bundle.sourceUnitScaleToM !== basis.sourceUnitScaleToM ||
    bundle.modes.length !== OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1.length * 2
  ) {
    throw new Error('Limb delta bundle and open-reference basis geometry do not match.');
  }
  const sourceHeight = basis.sourceMaximumY - basis.sourceMinimumY;
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new Error('Open-reference basis height is invalid.');
  }
  const scaleMPerSourceUnit = heightMm / 1000 / sourceHeight;
  const positionsM = new Float32Array(basis.positionsSourceUnits.length);
  for (let vertex = 0; vertex < positionsM.length / 3; vertex += 1) {
    const offset = vertex * 3;
    positionsM.set(
      [
        basis.positionsSourceUnits[offset] * scaleMPerSourceUnit,
        (basis.positionsSourceUnits[offset + 1] - basis.sourceMinimumY) * scaleMPerSourceUnit,
        basis.positionsSourceUnits[offset + 2] * scaleMPerSourceUnit,
      ],
      offset,
    );
  }
  const modes = OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1.map((measurementKey) =>
    Object.freeze({
      measurementKey,
      decrease: uniformField(sourceMode(bundle, measurementKey, 'decrease'), scaleMPerSourceUnit),
      increase: uniformField(sourceMode(bundle, measurementKey, 'increase'), scaleMPerSourceUnit),
    }),
  );
  return Object.freeze({
    version: MAKEHUMAN_LIMB_CIRCUMFERENCE_UNIFORM_MODES_V1,
    role: 'CC0_OPEN_REFERENCE_RESEARCH_ONLY' as const,
    basisKind: basis.kind,
    heightMm,
    scaleMPerSourceUnit,
    positionsM,
    modes: Object.freeze(modes),
    claims: CLAIMS,
  });
}
