import type { MakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import {
  createMakeHumanLocalizedChestShoulderModesResearchV2,
  type MakeHumanLocalizedChestShoulderModesResearchResultV2,
} from './makehuman-localized-chest-shoulder-modes-research-v2';
import type {
  UniformChestShoulderResearchModeV1,
  UniformChestShoulderResearchSparseFieldV1,
} from './makehuman-uniform-chest-shoulder-modes-research-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import { resolveMeasurementOpenReferenceChestPointYV1 } from './measurement-open-reference-chest-point-station-v1';
import type { MakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';
import {
  FEMALE_UNDERBUST_FOLD_DIAGNOSTIC_V1,
  resolveMeasurementOpenReferenceFemaleUnderBustFoldYV1,
} from './measurement-open-reference-female-underbust-fold-station-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

export const MAKEHUMAN_ANTERIOR_CHEST_SHOULDER_MODES_RESEARCH_V1 =
  'makehuman-anterior-chest-shoulder-modes-research/v1' as const;

export interface MakeHumanAnteriorChestShoulderModesResearchResultV1
  extends Omit<MakeHumanLocalizedChestShoulderModesResearchResultV2, 'version'> {
  readonly version: typeof MAKEHUMAN_ANTERIOR_CHEST_SHOULDER_MODES_RESEARCH_V1;
  readonly underBustStationOriginM: readonly [number, number, number];
  readonly diagnostics: readonly string[];
  readonly claims: MakeHumanLocalizedChestShoulderModesResearchResultV2['claims'] & {
    readonly posteriorChestHeldFixedByChestField: true;
    readonly underBustHeldFixedByChestField: true;
    readonly frontBackEvidenceCalibrated: false;
  };
}

const CLAIM_EXTENSION = Object.freeze({
  posteriorChestHeldFixedByChestField: true as const,
  underBustHeldFixedByChestField: true as const,
  frontBackEvidenceCalibrated: false as const,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep01(value: number): number {
  const bounded = clamp(value, 0, 1);
  return bounded * bounded * (3 - 2 * bounded);
}

function sparseField(
  positionsM: Float32Array,
  deltaAt: (x: number, y: number, z: number) => readonly [number, number, number],
): UniformChestShoulderResearchSparseFieldV1 {
  const vertices: number[] = [];
  const deltas: number[] = [];
  for (let vertex = 0; vertex < positionsM.length / 3; vertex += 1) {
    const offset = vertex * 3;
    const delta = deltaAt(positionsM[offset], positionsM[offset + 1], positionsM[offset + 2]);
    if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) continue;
    vertices.push(vertex);
    deltas.push(...delta);
  }
  if (vertices.length < 3) throw new Error('Anterior chest research support is incomplete.');
  return Object.freeze({
    vertexIndices: Uint16Array.from(vertices),
    deltasM: Float32Array.from(deltas),
  });
}

function resolvedFrontEvidence(
  measurements: CanonicalBodyMeasurementsMm,
  diagnostics: string[],
): number {
  const front = measurements.acrossFrontMm;
  const back = measurements.acrossBackMm;
  if (
    front != null &&
    back != null &&
    Number.isFinite(front) &&
    Number.isFinite(back) &&
    front > 0 &&
    back > 0
  ) {
    diagnostics.push('anterior-share:bounded-across-front-back-proxy');
    return clamp((front / back) ** 0.5, 0.8, 1.2);
  }
  diagnostics.push('anterior-share:bounded-neutral-fallback');
  return 1;
}

function underBustOffsetM(
  measurements: CanonicalBodyMeasurementsMm,
  diagnostics: string[],
): number {
  const hpsToWaistMm = measurements.hpsToWaistFrontMm;
  if (hpsToWaistMm != null && Number.isFinite(hpsToWaistMm) && hpsToWaistMm > 0) {
    diagnostics.push('underbust-station:bounded-hps-to-waist-front-proxy');
    return clamp((hpsToWaistMm / 1000) * 0.18, 0.045, 0.095);
  }
  diagnostics.push('underbust-station:bounded-height-fallback');
  return clamp((measurements.heightMm / 1000) * 0.04, 0.045, 0.085);
}

/**
 * Female bust path without a typed under-bust: the base's own inframammary fold, where the guide
 * draws the ring. A typed under-bust and the legacy chest path keep the bounded plane above it
 * (see the fold-station module).
 */
function femaleFoldY(
  options: {
    readonly basis: MakeHumanOpenReferenceBasisV1;
    readonly measurements: CanonicalBodyMeasurementsMm;
    readonly underBustAtFemaleFold?: boolean;
  },
  uniformPositionsM: Float32Array,
  diagnostics: string[],
): number | null {
  if (
    options.underBustAtFemaleFold !== true ||
    options.basis.kind !== 'female' ||
    options.measurements.underBustCircumferenceMm != null
  ) {
    return null;
  }
  const foldY = resolveMeasurementOpenReferenceFemaleUnderBustFoldYV1({
    positionsM: uniformPositionsM,
    triangleIndices: options.basis.indices,
  });
  if (foldY !== null) diagnostics.push(FEMALE_UNDERBUST_FOLD_DIAGNOSTIC_V1);
  return foldY;
}

function anteriorChestMode(options: {
  readonly source: UniformChestShoulderResearchModeV1;
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly shoulderStationY: number;
  readonly underBustStationY: number;
  readonly anteriorEvidenceGain: number;
}): UniformChestShoulderResearchModeV1 {
  const { source } = options;
  if (!source.chestStationOriginM) throw new Error('Chest station is missing.');
  const section = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.positionsM,
    triangleIndices: options.triangleIndices,
    planeOriginM: source.chestStationOriginM,
    planeNormal: [0, 1, 0],
    selection: { kind: 'nearest-seed', seedM: source.chestStationOriginM },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!section.ok || !section.selectedLoop) {
    throw new Error(section.ok ? 'Chest torso loop selection failed.' : section.errors.join('; '));
  }
  const loop = section.selectedLoop;
  const [centerX, chestStationY, centerZ] = loop.centroidM;
  const xRadius = Math.max(...loop.pointsM.map((point) => Math.abs(point[0] - centerX)), 0.001);
  const anteriorRadius = Math.max(...loop.pointsM.map((point) => point[2] - centerZ), 0.001);
  const upperRadius = Math.max(0.055, options.shoulderStationY - chestStationY);
  const lowerZeroY = options.underBustStationY + 0.018;
  const lowerRadius = Math.max(0.025, chestStationY - lowerZeroY);

  const build = (radialScale: number) =>
    sparseField(options.positionsM, (x, y, z) => {
      const lateralCoordinate = Math.abs(x - centerX) / xRadius;
      const torsoWeight = smoothstep01((1.32 - lateralCoordinate) / 0.34);
      if (torsoWeight <= 0) return [0, 0, 0];
      const verticalWeight =
        y < chestStationY
          ? smoothstep01((y - lowerZeroY) / lowerRadius)
          : smoothstep01(1 - (y - chestStationY) / upperRadius);
      if (verticalWeight <= 0) return [0, 0, 0];
      // The admitted body frame defines +Z as front. Posterior vertices are byte-for-byte fixed;
      // the transition starts at the sagittal side plane and stays entirely on the anterior side.
      const anteriorCoordinate = (z - centerZ) / anteriorRadius;
      if (anteriorCoordinate <= 0) return [0, 0, 0];
      const anteriorWeight = smoothstep01(anteriorCoordinate / 0.05);
      if (anteriorWeight <= 0) return [0, 0, 0];
      const weight = verticalWeight * anteriorWeight * torsoWeight;
      return [0, 0, (z - centerZ) * radialScale * options.anteriorEvidenceGain * weight];
    });

  return Object.freeze({
    ...source,
    sourceChannel: 'chestCircumferenceCandidate',
    decrease: build(-0.8),
    increase: build(1.7),
    coefficientCaps: Object.freeze({ decrease: 1, increase: 1 }),
  });
}

/**
 * Research-only replacement for the old whole-band chest expansion. Under-bust is only used to
 * locate the lower zero-weight plane; changing full chest therefore moves the anterior surface,
 * not the posterior back or ribcage section. Across-front/back and HPS evidence remain bounded
 * geometric proxies and do not establish anatomical or fit semantics.
 */
export function createMakeHumanAnteriorChestShoulderModesResearchV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly bundle: MakeHumanTorsoShapeDeltaBundleV1;
  /** Female bust path only: with no under-bust typed, put the under-bust plane on the fold. */
  readonly underBustAtFemaleFold?: boolean;
}): MakeHumanAnteriorChestShoulderModesResearchResultV1 {
  const source = createMakeHumanLocalizedChestShoulderModesResearchV2({
    basis: options.basis,
    heightMm: options.measurements.heightMm,
    bundle: options.bundle,
  });
  const sourceChest = source.modes.find(
    ({ measurementKey }) => measurementKey === 'chestCircumferenceMm',
  );
  const shoulder = source.modes.find(
    ({ measurementKey }) => measurementKey === 'shoulderBreadthMm',
  );
  if (!sourceChest?.chestStationOriginM || !shoulder?.shoulderVertices) {
    throw new Error('Chest/shoulder research landmarks are incomplete.');
  }
  const diagnostics: string[] = [];
  // The uniform chest support centres at armpit height. On male/neutral the chest girth grows
  // toward the armpit, so a plane there measures a different, larger ring than the chest point
  // the guide draws. Their chest is solved on the guide's chest-point plane instead; the
  // under-bust plane keeps its offset below it, so the anterior field keeps its designed shape.
  // Female keeps the armpit-line station: its bust stage finds the apex plane on its own.
  const chest =
    options.basis.kind === 'female'
      ? sourceChest
      : Object.freeze({
          ...sourceChest,
          chestStationOriginM: Object.freeze([
            sourceChest.chestStationOriginM[0],
            resolveMeasurementOpenReferenceChestPointYV1(source.uniformPositionsM),
            sourceChest.chestStationOriginM[2],
          ]) as readonly [number, number, number],
        });
  if (chest !== sourceChest) diagnostics.push('chest-station:chest-point-template');
  if (!chest.chestStationOriginM) throw new Error('Chest station is missing.');
  const underBustStationY =
    femaleFoldY(options, source.uniformPositionsM, diagnostics) ??
    chest.chestStationOriginM[1] - underBustOffsetM(options.measurements, diagnostics);
  const shoulderStationY = Math.min(
    source.uniformPositionsM[shoulder.shoulderVertices.negative * 3 + 1],
    source.uniformPositionsM[shoulder.shoulderVertices.positive * 3 + 1],
  );
  const anteriorEvidenceGain = resolvedFrontEvidence(options.measurements, diagnostics);
  const underBustStationOriginM = Object.freeze([
    chest.chestStationOriginM[0],
    underBustStationY,
    chest.chestStationOriginM[2],
  ]) as readonly [number, number, number];

  return Object.freeze({
    ...source,
    version: MAKEHUMAN_ANTERIOR_CHEST_SHOULDER_MODES_RESEARCH_V1,
    modes: Object.freeze(
      source.modes.map((mode) =>
        mode.measurementKey === 'chestCircumferenceMm'
          ? anteriorChestMode({
              source: chest,
              positionsM: source.uniformPositionsM,
              triangleIndices: options.basis.indices,
              shoulderStationY,
              underBustStationY,
              anteriorEvidenceGain,
            })
          : mode,
      ),
    ),
    underBustStationOriginM,
    diagnostics: Object.freeze(diagnostics),
    claims: Object.freeze({ ...source.claims, ...CLAIM_EXTENSION }),
  });
}
