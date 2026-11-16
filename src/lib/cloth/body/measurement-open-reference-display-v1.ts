import makeHumanBaseBasisUrl from '../../../assets/cloth/makehuman-hm08-visible-v1.bin?url';
import makeHumanFemaleBasisUrl from '../../../assets/cloth/makehuman-hm08-female-visible-v1.bin?url';
import makeHumanMaleBasisUrl from '../../../assets/cloth/makehuman-hm08-male-visible-v1.bin?url';
import makeHumanNeutralBasisUrl from '../../../assets/cloth/makehuman-hm08-neutral-visible-v1.bin?url';
import { sha256Hex } from '../../features/sha256';

import type { CanonicalMeasurementKey } from './measurement-adapter';
import type { MeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import {
  evaluateMeasurementOpenReferenceDisplayQualityV1,
  type MeasurementOpenReferenceDisplayQualityGateResultV1,
} from './measurement-open-reference-display-quality-gate-v1';
import type { MeasurementSurfaceMeshV1 } from './measurement-watertight-surface-v1';

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_V1 =
  'measurement-open-reference-display/v1' as const;
export const MAKEHUMAN_OPEN_REFERENCE_BASIS_V1 = 'makehuman-open-reference-basis/v1' as const;

const MAGIC = 'GRBPMH01';
const FORMAT_VERSION = 1;
const HEADER_BYTE_LENGTH = 64;
const VERTEX_COUNT = 13_380;
const TRIANGLE_COUNT = 26_756;
const INDEX_COUNT = TRIANGLE_COUNT * 3;
const MAX_VERTEX_INDEX = VERTEX_COUNT - 1;
const SOURCE_UNIT_SCALE_TO_M = 0.1;
const BASE_SOURCE_MINIMUM_Y = -8.1676;
const BASE_SOURCE_MAXIMUM_Y = 8.4913;

export type MakeHumanOpenReferenceBasisKindV1 = 'base' | 'neutral' | 'male' | 'female';

export const MAKEHUMAN_OPEN_REFERENCE_BASIS_ASSET_REVISION_V1 =
  'makehuman-open-reference-basis-assets/repaired-v1' as const;
export const MAKEHUMAN_OPEN_REFERENCE_BASIS_POSTPROCESS_REVISION_V1 =
  'makehuman-baseline-local-repair/v1' as const;

export const MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1 = Object.freeze({
  base: Object.freeze({
    kind: 'base' as const,
    assetPath: 'src/assets/cloth/makehuman-hm08-visible-v1.bin',
    derivedBasisSha256: 'c76480790b8a64227b8ad73834ac60c3594019573adb535cb6fcc0c7aac36668',
    basisAssetRevision: MAKEHUMAN_OPEN_REFERENCE_BASIS_ASSET_REVISION_V1,
    postprocessRevision: null,
    sourceMinimumY: BASE_SOURCE_MINIMUM_Y,
    sourceMaximumY: BASE_SOURCE_MAXIMUM_Y,
    formula: 'pinned raw visible-body base positions' as const,
  }),
  neutral: Object.freeze({
    kind: 'neutral' as const,
    assetPath: 'src/assets/cloth/makehuman-hm08-neutral-visible-v1.bin',
    derivedBasisSha256: 'ec7f3d1ab0880210f8ff919ec160849b5415c9e03207c4936c200249a7dd24cc',
    basisAssetRevision: MAKEHUMAN_OPEN_REFERENCE_BASIS_ASSET_REVISION_V1,
    postprocessRevision: MAKEHUMAN_OPEN_REFERENCE_BASIS_POSTPROCESS_REVISION_V1,
    sourceMinimumY: -8.177633333333333,
    sourceMaximumY: 8.416133333333335,
    formula:
      'race-neutral young average: 0.5 male + 0.5 female; postprocessed by makehuman-baseline-local-repair/v1' as const,
  }),
  male: Object.freeze({
    kind: 'male' as const,
    assetPath: 'src/assets/cloth/makehuman-hm08-male-visible-v1.bin',
    derivedBasisSha256: '5535b0ceaae60932ff54d3d18aee1bd2412b6a13db4ad0503ef6118bdb23fb85',
    basisAssetRevision: MAKEHUMAN_OPEN_REFERENCE_BASIS_ASSET_REVISION_V1,
    postprocessRevision: MAKEHUMAN_OPEN_REFERENCE_BASIS_POSTPROCESS_REVISION_V1,
    sourceMinimumY: -8.1867,
    sourceMaximumY: 9.1173,
    formula:
      'race-neutral young male, average muscle and average weight; postprocessed by makehuman-baseline-local-repair/v1' as const,
  }),
  female: Object.freeze({
    kind: 'female' as const,
    assetPath: 'src/assets/cloth/makehuman-hm08-female-visible-v1.bin',
    derivedBasisSha256: '77d5d08438ca3dfdb7c8135457ddcccd0c8184b94a206b3183ca1f289895cc49',
    basisAssetRevision: MAKEHUMAN_OPEN_REFERENCE_BASIS_ASSET_REVISION_V1,
    postprocessRevision: MAKEHUMAN_OPEN_REFERENCE_BASIS_POSTPROCESS_REVISION_V1,
    sourceMinimumY: -8.1829,
    sourceMaximumY: 7.714966666666667,
    formula:
      'race-neutral young female, average muscle and average weight; postprocessed by makehuman-baseline-local-repair/v1' as const,
  }),
});

/** Binds product provenance/cache identity to the exact authenticated basis asset revision. */
export function basisHashBoundSourceRevision(
  sourceRevision: string,
  kind: MakeHumanOpenReferenceBasisKindV1,
): string {
  const metadata = MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind];
  return `${sourceRevision};basisAssetRevision=${metadata.basisAssetRevision};basisPostprocessRevision=${metadata.postprocessRevision ?? 'none'};basisKind=${kind};basisSha256=${metadata.derivedBasisSha256}`;
}

const BASIS_URLS: Readonly<Record<MakeHumanOpenReferenceBasisKindV1, string>> = Object.freeze({
  base: makeHumanBaseBasisUrl,
  neutral: makeHumanNeutralBasisUrl,
  male: makeHumanMaleBasisUrl,
  female: makeHumanFemaleBasisUrl,
});

export const MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1 = Object.freeze({
  repository: 'makehumancommunity/makehuman',
  release: 'v1.3.0',
  commit: '1f508f6083b2f823dab15de924b3bde72e08d77c',
  licenseId: 'CC0-1.0',
  sourceAssetPath: 'makehuman/data/3dobjs/base.obj',
  sourceAssetSha256: '8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c',
  sourceTargets: Object.freeze({
    male: Object.freeze([
      '894abc1fbb3d28543a51fef16f89d5d4bdf9aa2e1534413339811a3d47818b7d',
      'ed2e8c191cb6b87b4a2d97c80486acb2604fa549316c7aa2a738a5d5a14334dc',
      '70e228ba7164737dae664454394536fc5935fa48d333c1a97d77e2dc6eacc5f5',
    ]),
    female: Object.freeze([
      '92d61eeb3c164b421fd5a7c3537ee45e7e1a51de4d49bf312e19c3df2be1d8fc',
      '095fe79694fa19e1fe98d93009ec116199bd524e081c640351a10eccf2cca1eb',
      '118379f6e8ba9266247fdb8788a20e1df40a239f97ced0b9905bcbcc74f6e820',
    ]),
    zeroDeltaUniversal: '4ba5396ddabda448ece15650a566fbebfbb10239256ccb201e8f883429e12249',
  }),
  basisVariants: MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  visibleBodyMaxVertexIndex: MAX_VERTEX_INDEX,
  generator: 'scripts/cloth/build-makehuman-open-reference-variants-v1.mjs',
});

export interface MakeHumanOpenReferenceBasisV1 {
  readonly schemaVersion: typeof MAKEHUMAN_OPEN_REFERENCE_BASIS_V1;
  readonly kind: MakeHumanOpenReferenceBasisKindV1;
  readonly sourceUnitScaleToM: number;
  readonly sourceMinimumY: number;
  readonly sourceMaximumY: number;
  readonly positionsSourceUnits: Float32Array;
  readonly indices: Uint16Array;
}

export interface MeasurementOpenReferenceDisplayArtifactV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_DISPLAY_V1;
  readonly sourceRevision: string;
  readonly pose: MeasurementBodyFrameV2['pose']['kind'];
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly provenance: {
    readonly source: typeof MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1;
    readonly basis: (typeof MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1)[MakeHumanOpenReferenceBasisKindV1];
    readonly role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY';
    readonly analyticalFrameRevision: MeasurementBodyFrameV2['revision'];
  };
  readonly deformation: {
    readonly status: 'personalized' | 'fallback-uniform' | 'uniform-height';
    readonly representedRequiredMeasurements: readonly CanonicalMeasurementKey[];
    readonly discardedPersonalizedCandidate: boolean;
    readonly personalizedCandidateEvaluated: boolean;
    readonly selectionReason:
      | 'research-candidate-quality-admitted'
      | 'research-candidate-quality-rejected'
      | 'production-uniform-policy';
    readonly qualityGateSubject: 'research-personalized-candidate' | 'uniform-basis-invariant';
    readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1;
  };
  readonly claims: {
    readonly visualReferenceOnly: true;
    readonly measurementClosureClaimed: false;
    readonly populationRepresentativenessClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
    readonly selfIntersection: 'not-evaluated-after-deformation';
  };
}

/**
 * Materializes an owner-isolated mesh snapshot. TypedArrays cannot be made deeply immutable in
 * JavaScript, so ownership is enforced by copying every writable view at each public boundary.
 */
export function snapshotMeasurementSurfaceMeshV1(
  mesh: MeasurementSurfaceMeshV1,
): MeasurementSurfaceMeshV1 {
  const positions = mesh.positions.slice();
  const indices = mesh.indices.slice();
  return Object.freeze({
    positions,
    indices,
    vertexCount: mesh.vertexCount,
    triangleCount: mesh.triangleCount,
    byteLength: positions.byteLength + indices.byteLength,
  });
}

/** Creates a deep owner-isolated display artifact snapshot without claiming TypedArray immutability. */
export function snapshotMeasurementOpenReferenceDisplayArtifactV1(
  artifact: MeasurementOpenReferenceDisplayArtifactV1,
): MeasurementOpenReferenceDisplayArtifactV1 {
  const qualityGate = artifact.deformation.qualityGate;
  return Object.freeze({
    version: artifact.version,
    sourceRevision: artifact.sourceRevision,
    pose: artifact.pose,
    mesh: snapshotMeasurementSurfaceMeshV1(artifact.mesh),
    provenance: Object.freeze({ ...artifact.provenance }),
    deformation: Object.freeze({
      ...artifact.deformation,
      representedRequiredMeasurements: Object.freeze([
        ...artifact.deformation.representedRequiredMeasurements,
      ]),
      qualityGate: Object.freeze({
        ...qualityGate,
        reasons: Object.freeze([...qualityGate.reasons]),
        metrics: Object.freeze({ ...qualityGate.metrics }),
        policy: Object.freeze({ ...qualityGate.policy }),
        claims: Object.freeze({ ...qualityGate.claims }),
      }),
    }),
    claims: Object.freeze({ ...artifact.claims }),
  });
}

const PERSONALIZED_REQUIRED_MEASUREMENTS = Object.freeze([
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'inseamMm',
] as const satisfies readonly CanonicalMeasurementKey[]);

const UNIFORM_REQUIRED_MEASUREMENTS = Object.freeze([
  'heightMm',
] as const satisfies readonly CanonicalMeasurementKey[]);

type Station = Readonly<{
  y: number;
  halfWidth: number;
  halfDepth: number;
  centerZ: number;
}>;

const BASE_SOURCE_TORSO_STATIONS = Object.freeze([
  Object.freeze({ y: -1.4659445, halfWidth: 1.9393, halfDepth: 0.8214, centerZ: 0.306 }),
  Object.freeze({
    y: 0.283244,
    halfWidth: 1.7450395335554498,
    // eslint-disable-next-line no-loss-of-precision -- Pinned source-station observation.
    halfDepth: 1.1370912449542813,
    centerZ: 0.1533309948479436,
  }),
  Object.freeze({
    y: 2.166824,
    halfWidth: 1.3253270749802684,
    halfDepth: 0.8792076302089464,
    centerZ: 0.570672977490896,
  }),
  Object.freeze({
    y: 4.00252,
    // eslint-disable-next-line no-loss-of-precision -- Pinned source-station observation.
    halfWidth: 1.3982320020222446,
    halfDepth: 0.975406199318147,
    centerZ: 0.55817027698805,
  }),
  Object.freeze({ y: 5, halfWidth: 2.1009, halfDepth: 0.85525, centerZ: 0.24755 }),
] as const satisfies readonly Station[]);

const BASE_SOURCE_HEIGHT = BASE_SOURCE_MAXIMUM_Y - BASE_SOURCE_MINIMUM_Y;
const SOURCE_TORSO_STATION_FRACTIONS = Object.freeze(
  BASE_SOURCE_TORSO_STATIONS.map(({ y }) => (y - BASE_SOURCE_MINIMUM_Y) / BASE_SOURCE_HEIGHT),
);

function sourceTorsoStations(basis: MakeHumanOpenReferenceBasisV1): readonly Station[] {
  const sourceHeight = basis.sourceMaximumY - basis.sourceMinimumY;
  return Object.freeze(
    BASE_SOURCE_TORSO_STATIONS.map((value, index) =>
      Object.freeze({
        ...value,
        y: basis.sourceMinimumY + SOURCE_TORSO_STATION_FRACTIONS[index] * sourceHeight,
      }),
    ),
  );
}

function decodeAscii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function finiteClose(value: number, expected: number, label: string): void {
  if (!Number.isFinite(value) || Math.abs(value - expected) > 1e-6) {
    throw new Error(`${label} does not match the pinned open-reference basis.`);
  }
}

export function parseMakeHumanOpenReferenceBasisV1(
  input: ArrayBuffer | Uint8Array,
  kind: MakeHumanOpenReferenceBasisKindV1,
): MakeHumanOpenReferenceBasisV1 {
  const metadata = MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind];
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < HEADER_BYTE_LENGTH) throw new Error('Open-reference basis is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (decodeAscii(bytes.subarray(0, 8)) !== MAGIC) {
    throw new Error('Open-reference basis magic is invalid.');
  }
  if (view.getUint32(8, true) !== FORMAT_VERSION) {
    throw new Error('Open-reference basis version is unsupported.');
  }
  if (view.getUint32(12, true) !== HEADER_BYTE_LENGTH) {
    throw new Error('Open-reference basis header length is invalid.');
  }
  if (
    view.getUint32(16, true) !== VERTEX_COUNT ||
    view.getUint32(20, true) !== TRIANGLE_COUNT ||
    view.getUint32(24, true) !== INDEX_COUNT ||
    view.getUint32(28, true) !== MAX_VERTEX_INDEX
  ) {
    throw new Error('Open-reference basis counts do not match the pinned topology.');
  }
  const sourceUnitScaleToM = view.getFloat64(32, true);
  const sourceMinimumY = view.getFloat64(40, true);
  const sourceMaximumY = view.getFloat64(48, true);
  finiteClose(sourceUnitScaleToM, SOURCE_UNIT_SCALE_TO_M, 'sourceUnitScaleToM');
  finiteClose(sourceMinimumY, metadata.sourceMinimumY, 'sourceMinimumY');
  finiteClose(sourceMaximumY, metadata.sourceMaximumY, 'sourceMaximumY');
  const positionsByteOffset = view.getUint32(56, true);
  const indicesByteOffset = view.getUint32(60, true);
  const positionsByteLength = VERTEX_COUNT * 3 * Float32Array.BYTES_PER_ELEMENT;
  const indicesByteLength = INDEX_COUNT * Uint16Array.BYTES_PER_ELEMENT;
  if (
    positionsByteOffset !== HEADER_BYTE_LENGTH ||
    indicesByteOffset !== positionsByteOffset + positionsByteLength ||
    bytes.byteLength !== indicesByteOffset + indicesByteLength
  ) {
    throw new Error('Open-reference basis byte layout is invalid.');
  }

  const positionsSourceUnits = new Float32Array(VERTEX_COUNT * 3);
  const indices = new Uint16Array(INDEX_COUNT);
  for (let index = 0; index < positionsSourceUnits.length; index += 1) {
    const value = view.getFloat32(positionsByteOffset + index * 4, true);
    if (!Number.isFinite(value))
      throw new Error('Open-reference basis contains a non-finite vertex.');
    positionsSourceUnits[index] = value;
  }
  for (let index = 0; index < indices.length; index += 1) {
    const value = view.getUint16(indicesByteOffset + index * 2, true);
    if (value > MAX_VERTEX_INDEX) throw new Error('Open-reference basis index is out of range.');
    indices[index] = value;
  }
  return Object.freeze({
    schemaVersion: MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
    kind,
    sourceUnitScaleToM,
    sourceMinimumY,
    sourceMaximumY,
    positionsSourceUnits,
    indices,
  });
}

const authenticatedBasisBytePromises: Record<
  MakeHumanOpenReferenceBasisKindV1,
  Promise<Uint8Array> | null
> = {
  base: null,
  neutral: null,
  male: null,
  female: null,
};

function loadAuthenticatedMakeHumanOpenReferenceBasisBytesV1(
  kind: MakeHumanOpenReferenceBasisKindV1,
): Promise<Uint8Array> {
  const existing = authenticatedBasisBytePromises[kind];
  if (existing) return existing;
  const request = fetch(BASIS_URLS[kind], {
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok)
        throw new Error(`Open-reference ${kind} basis request failed (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await sha256Hex(bytes);
      if (digest !== MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].derivedBasisSha256) {
        throw new Error(`Open-reference ${kind} basis SHA-256 authentication failed.`);
      }
      return bytes;
    })
    .catch((reason: unknown) => {
      authenticatedBasisBytePromises[kind] = null;
      throw reason;
    });
  authenticatedBasisBytePromises[kind] = request;
  return request;
}

export async function loadMakeHumanOpenReferenceBasisV1(
  kind: MakeHumanOpenReferenceBasisKindV1 = 'neutral',
): Promise<MakeHumanOpenReferenceBasisV1> {
  try {
    const privateAuthenticatedBytes =
      await loadAuthenticatedMakeHumanOpenReferenceBasisBytesV1(kind);
    // Parsing materializes new owned TypedArrays for every build; the private authenticated bytes
    // never leave this module and cannot be changed through a returned basis view.
    return parseMakeHumanOpenReferenceBasisV1(privateAuthenticatedBytes, kind);
  } catch (reason: unknown) {
    authenticatedBasisBytePromises[kind] = null;
    throw reason;
  }
}

function station(frame: MeasurementBodyFrameV2, id: StationId) {
  const result = frame.torsoStations.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Measurement frame is missing ${id}.`);
  return result;
}

type StationId = MeasurementBodyFrameV2['torsoStations'][number]['id'];

function targetTorsoStations(frame: MeasurementBodyFrameV2): readonly Station[] {
  const pelvisBottom = station(frame, 'pelvis-bottom');
  const hip = station(frame, 'hip');
  const waist = station(frame, 'waist');
  const chest = station(frame, 'chest');
  const shoulder = station(frame, 'shoulder');
  return Object.freeze(
    [pelvisBottom, hip, waist, chest, shoulder].map((value) =>
      Object.freeze({
        y: value.yM,
        halfWidth:
          value.id === 'shoulder' ? frame.measurements.shoulderBreadthMm / 2000 : value.halfWidthM,
        halfDepth: value.halfDepthM,
        centerZ: 0,
      }),
    ),
  );
}

function interpolateStation(stations: readonly Station[], y: number): Station {
  if (y <= stations[0].y) return stations[0];
  if (y >= stations[stations.length - 1].y) return stations[stations.length - 1];
  for (let index = 0; index < stations.length - 1; index += 1) {
    const lower = stations[index];
    const upper = stations[index + 1];
    if (y > upper.y) continue;
    const t = (y - lower.y) / (upper.y - lower.y);
    return {
      y,
      halfWidth: lower.halfWidth + (upper.halfWidth - lower.halfWidth) * t,
      halfDepth: lower.halfDepth + (upper.halfDepth - lower.halfDepth) * t,
      centerZ: lower.centerZ + (upper.centerZ - lower.centerZ) * t,
    };
  }
  throw new Error('Torso station interpolation failed.');
}

function mapSourceYToTargetY(
  sourceY: number,
  frame: MeasurementBodyFrameV2,
  basis: MakeHumanOpenReferenceBasisV1,
  sourceStations: readonly Station[],
): number {
  const targets = targetTorsoStations(frame);
  const sourceKnots = [
    basis.sourceMinimumY,
    ...sourceStations.map(({ y }) => y),
    basis.sourceMaximumY,
  ];
  const targetKnots = [0, ...targets.map(({ y }) => y), frame.measurements.heightMm / 1000];
  for (let index = 0; index < sourceKnots.length - 1; index += 1) {
    if (sourceY > sourceKnots[index + 1]) continue;
    const span = sourceKnots[index + 1] - sourceKnots[index];
    const t = span === 0 ? 0 : (sourceY - sourceKnots[index]) / span;
    return targetKnots[index] + (targetKnots[index + 1] - targetKnots[index]) * t;
  }
  return targetKnots[targetKnots.length - 1];
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  return t * t * (3 - 2 * t);
}

export interface MeasurementOpenReferenceDisplayPointTransformV1 {
  readonly sourceToTargetM: (
    sourceX: number,
    sourceY: number,
    sourceZ: number,
  ) => readonly [targetX: number, targetY: number, targetZ: number];
}

/**
 * Creates the exact source-point mapping used by the display mesh. Keeping this mapping explicit
 * lets sparse CC0 direction deltas be transformed as point differences instead of applying one
 * guessed global scale after the piecewise height and torso deformation.
 */
export function createMeasurementOpenReferenceDisplayPointTransformV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly frame: MeasurementBodyFrameV2;
}): MeasurementOpenReferenceDisplayPointTransformV1 {
  if (options.basis.schemaVersion !== MAKEHUMAN_OPEN_REFERENCE_BASIS_V1) {
    throw new TypeError('A parsed MakeHuman open-reference basis is required.');
  }
  const { basis, frame } = options;
  const targetHeightM = frame.measurements.heightMm / 1000;
  const sourceHeightM = (basis.sourceMaximumY - basis.sourceMinimumY) * basis.sourceUnitScaleToM;
  const globalScale = targetHeightM / sourceHeightM;
  const sourceStations = sourceTorsoStations(basis);
  const targetStations = targetTorsoStations(frame);

  return Object.freeze({
    sourceToTargetM: (sourceX: number, sourceY: number, sourceZ: number) => {
      if (![sourceX, sourceY, sourceZ].every(Number.isFinite)) {
        throw new TypeError('Open-reference source point must contain finite coordinates.');
      }
      const targetY = mapSourceYToTargetY(sourceY, frame, basis, sourceStations);
      const globalX = sourceX * basis.sourceUnitScaleToM * globalScale;
      const globalZ = sourceZ * basis.sourceUnitScaleToM * globalScale;
      let targetX = globalX;
      let targetZ = globalZ;

      if (
        sourceY >= sourceStations[0].y &&
        sourceY <= sourceStations[sourceStations.length - 1].y
      ) {
        const sourceStation = interpolateStation(sourceStations, sourceY);
        const targetStation = interpolateStation(targetStations, targetY);
        const normalizedX = sourceX / sourceStation.halfWidth;
        const normalizedZ = (sourceZ - sourceStation.centerZ) / sourceStation.halfDepth;
        const radial = Math.hypot(normalizedX, normalizedZ);
        const torsoBlend = 1 - smoothstep(1, 1.45, radial);
        const torsoX = normalizedX * targetStation.halfWidth;
        const torsoZ = normalizedZ * targetStation.halfDepth + targetStation.centerZ;
        targetX += (torsoX - targetX) * torsoBlend;
        targetZ += (torsoZ - targetZ) * torsoBlend;
      }

      if (![targetX, targetY, targetZ].every(Number.isFinite)) {
        throw new Error('Open-reference deformation produced a non-finite point.');
      }
      return [targetX, targetY, targetZ] as const;
    },
  });
}

export function createMeasurementOpenReferenceDisplayV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly frame: MeasurementBodyFrameV2;
}): MeasurementOpenReferenceDisplayArtifactV1 {
  if (options.basis.schemaVersion !== MAKEHUMAN_OPEN_REFERENCE_BASIS_V1) {
    throw new TypeError('A parsed MakeHuman open-reference basis is required.');
  }
  const { basis, frame } = options;
  const transform = createMeasurementOpenReferenceDisplayPointTransformV1(options);
  const personalizedPositions = new Float32Array(basis.positionsSourceUnits.length);
  const uniformPositions = new Float32Array(basis.positionsSourceUnits.length);
  const sourceHeightM = (basis.sourceMaximumY - basis.sourceMinimumY) * basis.sourceUnitScaleToM;
  const uniformScaleMPerSourceUnit =
    (frame.measurements.heightMm / 1000 / sourceHeightM) * basis.sourceUnitScaleToM;

  for (let vertex = 0; vertex < VERTEX_COUNT; vertex += 1) {
    const offset = vertex * 3;
    const sourceX = basis.positionsSourceUnits[offset];
    const sourceY = basis.positionsSourceUnits[offset + 1];
    const sourceZ = basis.positionsSourceUnits[offset + 2];
    const [targetX, targetY, targetZ] = transform.sourceToTargetM(sourceX, sourceY, sourceZ);
    personalizedPositions.set([targetX, targetY, targetZ], offset);
    uniformPositions.set(
      [
        sourceX * uniformScaleMPerSourceUnit,
        (sourceY - basis.sourceMinimumY) * uniformScaleMPerSourceUnit,
        sourceZ * uniformScaleMPerSourceUnit,
      ],
      offset,
    );
  }

  const qualityGate = evaluateMeasurementOpenReferenceDisplayQualityV1({
    uniformPositionsM: uniformPositions,
    personalizedPositionsM: personalizedPositions,
    triangleIndices: basis.indices,
  });
  const personalized = qualityGate.safe;
  const positions = personalized ? personalizedPositions : uniformPositions;

  const indices = Uint32Array.from(basis.indices);
  const mesh: MeasurementSurfaceMeshV1 = Object.freeze({
    positions,
    indices,
    vertexCount: VERTEX_COUNT,
    triangleCount: TRIANGLE_COUNT,
    byteLength: positions.byteLength + indices.byteLength,
  });
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_DISPLAY_V1,
    sourceRevision: frame.sourceRevision,
    pose: frame.pose.kind,
    mesh,
    provenance: Object.freeze({
      source: MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1,
      basis: MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[basis.kind],
      role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY' as const,
      analyticalFrameRevision: frame.revision,
    }),
    deformation: Object.freeze({
      status: personalized ? ('personalized' as const) : ('fallback-uniform' as const),
      representedRequiredMeasurements: personalized
        ? PERSONALIZED_REQUIRED_MEASUREMENTS
        : UNIFORM_REQUIRED_MEASUREMENTS,
      discardedPersonalizedCandidate: !personalized,
      personalizedCandidateEvaluated: true,
      selectionReason: personalized
        ? ('research-candidate-quality-admitted' as const)
        : ('research-candidate-quality-rejected' as const),
      qualityGateSubject: 'research-personalized-candidate' as const,
      qualityGate,
    }),
    claims: Object.freeze({
      visualReferenceOnly: true as const,
      measurementClosureClaimed: false as const,
      populationRepresentativenessClaimed: false as const,
      fitClaimEligible: false as const,
      runtimeCollisionEligible: false as const,
      collisionCandidateEligible: false as const,
      selfIntersection: 'not-evaluated-after-deformation' as const,
    }),
  });
}

/**
 * Production-safe open-reference entry point. It constructs the visible mesh directly from the
 * selected gender basis and height, without evaluating or admitting the research-only piecewise
 * torso warp used by createMeasurementOpenReferenceDisplayV1.
 */
export function createMeasurementOpenReferenceUniformHeightDisplayV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly frame: MeasurementBodyFrameV2;
}): MeasurementOpenReferenceDisplayArtifactV1 {
  if (options.basis.schemaVersion !== MAKEHUMAN_OPEN_REFERENCE_BASIS_V1) {
    throw new TypeError('A parsed MakeHuman open-reference basis is required.');
  }
  const { basis, frame } = options;
  const sourceHeightM = (basis.sourceMaximumY - basis.sourceMinimumY) * basis.sourceUnitScaleToM;
  const uniformScaleMPerSourceUnit =
    (frame.measurements.heightMm / 1000 / sourceHeightM) * basis.sourceUnitScaleToM;
  if (!Number.isFinite(uniformScaleMPerSourceUnit) || uniformScaleMPerSourceUnit <= 0) {
    throw new RangeError('Open-reference uniform height scale must be finite and positive.');
  }

  const positions = new Float32Array(basis.positionsSourceUnits.length);
  for (let vertex = 0; vertex < VERTEX_COUNT; vertex += 1) {
    const offset = vertex * 3;
    positions.set(
      [
        basis.positionsSourceUnits[offset] * uniformScaleMPerSourceUnit,
        (basis.positionsSourceUnits[offset + 1] - basis.sourceMinimumY) *
          uniformScaleMPerSourceUnit,
        basis.positionsSourceUnits[offset + 2] * uniformScaleMPerSourceUnit,
      ],
      offset,
    );
  }

  const qualityGate = evaluateMeasurementOpenReferenceDisplayQualityV1({
    uniformPositionsM: positions,
    personalizedPositionsM: positions,
    triangleIndices: basis.indices,
  });
  if (!qualityGate.safe) {
    throw new Error('Open-reference uniform height basis failed its invariant quality gate.');
  }
  const indices = Uint32Array.from(basis.indices);
  const mesh: MeasurementSurfaceMeshV1 = Object.freeze({
    positions,
    indices,
    vertexCount: VERTEX_COUNT,
    triangleCount: TRIANGLE_COUNT,
    byteLength: positions.byteLength + indices.byteLength,
  });
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_DISPLAY_V1,
    sourceRevision: frame.sourceRevision,
    pose: frame.pose.kind,
    mesh,
    provenance: Object.freeze({
      source: MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1,
      basis: MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[basis.kind],
      role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY' as const,
      analyticalFrameRevision: frame.revision,
    }),
    deformation: Object.freeze({
      status: 'uniform-height' as const,
      representedRequiredMeasurements: UNIFORM_REQUIRED_MEASUREMENTS,
      discardedPersonalizedCandidate: false,
      personalizedCandidateEvaluated: false,
      selectionReason: 'production-uniform-policy' as const,
      qualityGateSubject: 'uniform-basis-invariant' as const,
      qualityGate,
    }),
    claims: Object.freeze({
      visualReferenceOnly: true as const,
      measurementClosureClaimed: false as const,
      populationRepresentativenessClaimed: false as const,
      fitClaimEligible: false as const,
      runtimeCollisionEligible: false as const,
      collisionCandidateEligible: false as const,
      selfIntersection: 'not-evaluated-after-deformation' as const,
    }),
  });
}
