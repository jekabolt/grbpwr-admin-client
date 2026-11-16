import type {
  OpenReferenceLimbCircumferenceModeV1,
  OpenReferenceSparseDeltaFieldV1,
} from './measurement-open-reference-limb-circumference-solver-v1';

export const MEASUREMENT_OPEN_REFERENCE_LOCALIZED_THIGH_RESEARCH_V1 =
  'measurement-open-reference-localized-thigh-research/v1' as const;

export interface LocalizedThighResearchModeV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_LOCALIZED_THIGH_RESEARCH_V1;
  readonly mode: OpenReferenceLimbCircumferenceModeV1;
  readonly hipStationYM: number;
  readonly fadeDepthM: number;
  readonly nonZeroDeltaVertexCount: number;
  readonly claims: {
    readonly researchOnly: true;
    readonly projectOwnedSpatialWindow: true;
    readonly anatomicalLandmarkEquivalent: false;
    readonly measurementProtocolEquivalent: false;
    readonly fitClaimEligible: false;
  };
}

const CLAIMS = Object.freeze({
  researchOnly: true as const,
  projectOwnedSpatialWindow: true as const,
  anatomicalLandmarkEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  fitClaimEligible: false as const,
});

function localizedField(options: {
  readonly field: OpenReferenceSparseDeltaFieldV1;
  readonly positionsM: Float32Array;
  readonly hipStationYM: number;
  readonly fadeDepthM: number;
}): Readonly<{ field: OpenReferenceSparseDeltaFieldV1; nonZeroDeltaVertexCount: number }> {
  const { field, positionsM, hipStationYM, fadeDepthM } = options;
  if (!(field.vertexIndices instanceof Uint16Array) || !(field.deltasM instanceof Float32Array)) {
    throw new TypeError('Localized thigh research requires typed sparse fields.');
  }
  if (field.deltasM.length !== field.vertexIndices.length * 3) {
    throw new TypeError('Localized thigh sparse field lengths are inconsistent.');
  }
  if (!(positionsM instanceof Float32Array) || positionsM.length === 0 || positionsM.length % 3) {
    throw new TypeError('Localized thigh positions must be an XYZ Float32Array.');
  }
  if (!Number.isFinite(hipStationYM) || !Number.isFinite(fadeDepthM) || fadeDepthM <= 0) {
    throw new RangeError('Localized thigh station and fade depth must be finite and positive.');
  }

  const lowerYM = hipStationYM - fadeDepthM;
  const deltasM = field.deltasM.slice();
  let nonZeroDeltaVertexCount = 0;
  field.vertexIndices.forEach((vertex, index) => {
    if (vertex * 3 + 2 >= positionsM.length) {
      throw new RangeError('Localized thigh field references a vertex outside the mesh.');
    }
    const yM = positionsM[vertex * 3 + 1];
    const linear = Math.max(0, Math.min(1, (hipStationYM - yM) / fadeDepthM));
    const weight = linear * linear * (3 - 2 * linear);
    const offset = index * 3;
    deltasM[offset] *= weight;
    deltasM[offset + 1] *= weight;
    deltasM[offset + 2] *= weight;
    if (
      yM <= lowerYM &&
      (deltasM[offset] !== 0 || deltasM[offset + 1] !== 0 || deltasM[offset + 2] !== 0)
    ) {
      nonZeroDeltaVertexCount += 1;
    }
  });
  return Object.freeze({
    field: Object.freeze({ vertexIndices: field.vertexIndices.slice(), deltasM }),
    nonZeroDeltaVertexCount,
  });
}

/**
 * Research-only spatial window. It preserves the source sparse support (and therefore the fixed
 * probe station) but smoothly suppresses pelvis/torso deltas at and above the hip section.
 */
export function createLocalizedThighResearchModeV1(options: {
  readonly mode: OpenReferenceLimbCircumferenceModeV1;
  readonly positionsM: Float32Array;
  readonly hipStationYM: number;
  readonly fadeDepthM: number;
}): LocalizedThighResearchModeV1 {
  if (options.mode.measurementKey !== 'thighCircumferenceMm') {
    throw new TypeError('Localized thigh research accepts only thighCircumferenceMm.');
  }
  const decrease = localizedField({ ...options, field: options.mode.decrease });
  const increase = localizedField({ ...options, field: options.mode.increase });
  const nonZeroDeltaVertexCount = Math.min(
    decrease.nonZeroDeltaVertexCount,
    increase.nonZeroDeltaVertexCount,
  );
  if (nonZeroDeltaVertexCount < 3) {
    throw new Error('Localized thigh research removed all usable thigh response.');
  }
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_LOCALIZED_THIGH_RESEARCH_V1,
    mode: Object.freeze({
      measurementKey: 'thighCircumferenceMm' as const,
      decrease: decrease.field,
      increase: increase.field,
    }),
    hipStationYM: options.hipStationYM,
    fadeDepthM: options.fadeDepthM,
    nonZeroDeltaVertexCount,
    claims: CLAIMS,
  });
}
