import torsoShapeDeltaBundleUrl from '../../../assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin?url';
import { sha256Hex } from '../../features/sha256';

export const MAKEHUMAN_TORSO_SHAPE_DELTA_BUNDLE_V1 =
  'makehuman-torso-shape-delta-bundle/v1' as const;

const FORMAT_MAGIC = 'GRBPTS01';
const FORMAT_VERSION = 1;
const HEADER_BYTE_LENGTH = 64;
const MODE_ENTRY_BYTE_LENGTH = 16;
const DELTA_ENTRY_BYTE_LENGTH = 16;
const VISIBLE_BODY_VERTEX_COUNT = 13_380;
const VISIBLE_BODY_MAX_VERTEX_INDEX = VISIBLE_BODY_VERTEX_COUNT - 1;
const TOTAL_RECORD_COUNT = 14_580;
const EXPECTED_BYTE_LENGTH = 233_472;
const SOURCE_UNIT_SCALE_TO_M = 0.1;

export type MakeHumanTorsoShapeChannelV1 =
  | 'chestCircumferenceCandidate'
  | 'hipCircumferenceCandidate'
  | 'shoulderDistanceCandidate'
  | 'waistCircumferenceCandidate';
export type MakeHumanTorsoShapeDirectionV1 = 'decrease' | 'increase';
export type MakeHumanTorsoShapeModeIdV1 =
  `${MakeHumanTorsoShapeChannelV1}:${MakeHumanTorsoShapeDirectionV1}`;

interface ModeMetadata {
  readonly id: MakeHumanTorsoShapeModeIdV1;
  readonly channel: MakeHumanTorsoShapeChannelV1;
  readonly direction: MakeHumanTorsoShapeDirectionV1;
  readonly sourcePath: string;
  readonly sourceByteSize: number;
  readonly sourceSha256: string;
  readonly sourceRecordCount: number;
  readonly visibleSourceRecordCount: number;
  readonly packedRecordCount: number;
  readonly maximumVisibleVertexIndex: number;
  readonly upstreamMeasurementName: string;
  readonly candidateCanonicalKey: string;
  readonly semanticMatchClaimed: false;
}

export const MAKEHUMAN_TORSO_SHAPE_MODE_METADATA_V1 = Object.freeze([
  Object.freeze({
    id: 'chestCircumferenceCandidate:decrease',
    channel: 'chestCircumferenceCandidate',
    direction: 'decrease',
    sourcePath: 'makehuman/data/targets/measure/measure-bust-circ-decr.target',
    sourceByteSize: 34_643,
    sourceSha256: '3d4c9f8c7d084e4d6c35ffc3a798bc35bdbe80fd56929d03e0c6f1b31ec5c736',
    sourceRecordCount: 1_876,
    visibleSourceRecordCount: 1_170,
    packedRecordCount: 1_170,
    maximumVisibleVertexIndex: 10_753,
    upstreamMeasurementName: 'bust circumference',
    candidateCanonicalKey: 'chestCircumferenceMm',
    semanticMatchClaimed: false,
  }),
  Object.freeze({
    id: 'chestCircumferenceCandidate:increase',
    channel: 'chestCircumferenceCandidate',
    direction: 'increase',
    sourcePath: 'makehuman/data/targets/measure/measure-bust-circ-incr.target',
    sourceByteSize: 40_556,
    sourceSha256: '46394c7f9cdfac31654f14950b57bbfb874c9a2fa68e48c9cc3e7bba619b75f4',
    sourceRecordCount: 1_972,
    visibleSourceRecordCount: 1_273,
    packedRecordCount: 1_169,
    maximumVisibleVertexIndex: 11_897,
    upstreamMeasurementName: 'bust circumference',
    candidateCanonicalKey: 'chestCircumferenceMm',
    semanticMatchClaimed: false,
  }),
  Object.freeze({
    id: 'waistCircumferenceCandidate:decrease',
    channel: 'waistCircumferenceCandidate',
    direction: 'decrease',
    sourcePath: 'makehuman/data/targets/measure/measure-waist-circ-decr.target',
    sourceByteSize: 27_663,
    sourceSha256: '6a976bd7819fa037a290b381bb3e04dfd04220dddeac194c476472295d2baba8',
    sourceRecordCount: 1_518,
    visibleSourceRecordCount: 862,
    packedRecordCount: 818,
    maximumVisibleVertexIndex: 11_018,
    upstreamMeasurementName: 'waist circumference',
    candidateCanonicalKey: 'waistCircumferenceMm',
    semanticMatchClaimed: false,
  }),
  Object.freeze({
    id: 'waistCircumferenceCandidate:increase',
    channel: 'waistCircumferenceCandidate',
    direction: 'increase',
    sourcePath: 'makehuman/data/targets/measure/measure-waist-circ-incr.target',
    sourceByteSize: 27_682,
    sourceSha256: '4949212ec9a5e227b177a029ee42b0be3fd3b273a211bc91c6f4d4dbf0334856',
    sourceRecordCount: 1_518,
    visibleSourceRecordCount: 862,
    packedRecordCount: 818,
    maximumVisibleVertexIndex: 11_018,
    upstreamMeasurementName: 'waist circumference',
    candidateCanonicalKey: 'waistCircumferenceMm',
    semanticMatchClaimed: false,
  }),
  Object.freeze({
    id: 'hipCircumferenceCandidate:decrease',
    channel: 'hipCircumferenceCandidate',
    direction: 'decrease',
    sourcePath: 'makehuman/data/targets/measure/measure-hips-circ-decr.target',
    sourceByteSize: 25_872,
    sourceSha256: '8a98e80047ab89148d60067aad3b452ce715eadcaf7a1e28402140dd1ac8fb11',
    sourceRecordCount: 1_387,
    visibleSourceRecordCount: 692,
    packedRecordCount: 692,
    maximumVisibleVertexIndex: 13_351,
    upstreamMeasurementName: 'hips circumference',
    candidateCanonicalKey: 'hipCircumferenceMm',
    semanticMatchClaimed: false,
  }),
  Object.freeze({
    id: 'hipCircumferenceCandidate:increase',
    channel: 'hipCircumferenceCandidate',
    direction: 'increase',
    sourcePath: 'makehuman/data/targets/measure/measure-hips-circ-incr.target',
    sourceByteSize: 26_447,
    sourceSha256: 'e4294db231dd3283680e6be4b9d3d8d81aa7c575a32f937f8d0751b1ec3d6512',
    sourceRecordCount: 1_418,
    visibleSourceRecordCount: 707,
    packedRecordCount: 707,
    maximumVisibleVertexIndex: 13_351,
    upstreamMeasurementName: 'hips circumference',
    candidateCanonicalKey: 'hipCircumferenceMm',
    semanticMatchClaimed: false,
  }),
  Object.freeze({
    id: 'shoulderDistanceCandidate:decrease',
    channel: 'shoulderDistanceCandidate',
    direction: 'decrease',
    sourcePath: 'makehuman/data/targets/measure/measure-shoulder-dist-decr.target',
    sourceByteSize: 88_046,
    sourceSha256: '15034d390da69ce7a3e46dfee0e248d0649bf6fc0bfec575b4cacf48b7a1ba5a',
    sourceRecordCount: 5_920,
    visibleSourceRecordCount: 4_718,
    packedRecordCount: 4_690,
    maximumVisibleVertexIndex: 10_720,
    upstreamMeasurementName: 'shoulder distance',
    candidateCanonicalKey: 'shoulderBreadthMm',
    semanticMatchClaimed: false,
  }),
  Object.freeze({
    id: 'shoulderDistanceCandidate:increase',
    channel: 'shoulderDistanceCandidate',
    direction: 'increase',
    sourcePath: 'makehuman/data/targets/measure/measure-shoulder-dist-incr.target',
    sourceByteSize: 82_836,
    sourceSha256: 'af7394300c91d64fb0b032377aae72e546c778d1d5c00daed88858c04ee9150b',
    sourceRecordCount: 5_568,
    visibleSourceRecordCount: 4_524,
    packedRecordCount: 4_516,
    maximumVisibleVertexIndex: 10_719,
    upstreamMeasurementName: 'shoulder distance',
    candidateCanonicalKey: 'shoulderBreadthMm',
    semanticMatchClaimed: false,
  }),
] as const satisfies readonly ModeMetadata[]);

export const MAKEHUMAN_TORSO_SHAPE_DELTA_PROVENANCE_V1 = Object.freeze({
  repository: 'makehumancommunity/makehuman',
  release: 'v1.3.0',
  commit: '1f508f6083b2f823dab15de924b3bde72e08d77c',
  licenseId: 'CC0-1.0',
  generator: 'scripts/cloth/build-makehuman-torso-shape-deltas-v1.mjs',
  assetPath: 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin',
  assetByteLength: EXPECTED_BYTE_LENGTH,
  assetSha256: 'a59b351473ccb301dc06ec810ee8007c74e9568dfc86bbb60b7a707fd074b4e5',
  role: 'CC0_DIRECT_TORSO_SHAPE_DIRECTIONS_ONLY' as const,
  rawSourceAssetsBundled: false as const,
  semanticMatchClaimed: false as const,
  modes: MAKEHUMAN_TORSO_SHAPE_MODE_METADATA_V1,
});

export interface MakeHumanTorsoShapeDeltaModeV1 {
  readonly id: MakeHumanTorsoShapeModeIdV1;
  readonly channel: MakeHumanTorsoShapeChannelV1;
  readonly direction: MakeHumanTorsoShapeDirectionV1;
  readonly vertexIndices: Uint16Array;
  readonly deltasSourceUnits: Float32Array;
}

export interface MakeHumanTorsoShapeDeltaBundleV1 {
  readonly schemaVersion: typeof MAKEHUMAN_TORSO_SHAPE_DELTA_BUNDLE_V1;
  readonly visibleBodyVertexCount: number;
  readonly sourceUnitScaleToM: number;
  readonly modes: readonly MakeHumanTorsoShapeDeltaModeV1[];
  readonly provenance: typeof MAKEHUMAN_TORSO_SHAPE_DELTA_PROVENANCE_V1;
  readonly claims: {
    readonly directSliderSemanticsClaimed: false;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly millimetreCalibrationClaimed: false;
    readonly tapeMeasurementEquivalent: false;
    readonly populationRepresentativenessClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
  };
}

function exactInteger(view: DataView, offset: number, expected: number, label: string): void {
  if (view.getUint32(offset, true) !== expected)
    throw new Error(`Torso bundle ${label} is invalid.`);
}

export function parseMakeHumanTorsoShapeDeltaBundleV1(
  input: ArrayBuffer | Uint8Array,
): MakeHumanTorsoShapeDeltaBundleV1 {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < HEADER_BYTE_LENGTH) throw new Error('Torso bundle is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 8)) !== FORMAT_MAGIC) {
    throw new Error('Torso bundle magic is invalid.');
  }
  exactInteger(view, 8, FORMAT_VERSION, 'version');
  exactInteger(view, 12, HEADER_BYTE_LENGTH, 'header length');
  exactInteger(view, 16, VISIBLE_BODY_VERTEX_COUNT, 'vertex count');
  exactInteger(view, 20, MAKEHUMAN_TORSO_SHAPE_MODE_METADATA_V1.length, 'mode count');
  exactInteger(view, 24, TOTAL_RECORD_COUNT, 'record count');
  exactInteger(view, 28, VISIBLE_BODY_MAX_VERTEX_INDEX, 'maximum vertex');
  if (Math.abs(view.getFloat64(32, true) - SOURCE_UNIT_SCALE_TO_M) > 1e-12) {
    throw new Error('Torso bundle unit scale is invalid.');
  }
  const modeTableOffset = view.getUint32(40, true);
  const deltaTableOffset = view.getUint32(44, true);
  exactInteger(view, 48, MODE_ENTRY_BYTE_LENGTH, 'mode entry length');
  exactInteger(view, 52, DELTA_ENTRY_BYTE_LENGTH, 'delta entry length');
  exactInteger(view, 56, EXPECTED_BYTE_LENGTH, 'declared byte length');
  exactInteger(view, 60, 0, 'reserved field');
  if (
    bytes.byteLength !== EXPECTED_BYTE_LENGTH ||
    modeTableOffset !== HEADER_BYTE_LENGTH ||
    deltaTableOffset !==
      HEADER_BYTE_LENGTH + MAKEHUMAN_TORSO_SHAPE_MODE_METADATA_V1.length * MODE_ENTRY_BYTE_LENGTH ||
    deltaTableOffset + TOTAL_RECORD_COUNT * DELTA_ENTRY_BYTE_LENGTH !== bytes.byteLength
  ) {
    throw new Error('Torso bundle byte layout is invalid.');
  }

  let recordStart = 0;
  const modes = MAKEHUMAN_TORSO_SHAPE_MODE_METADATA_V1.map((metadata, modeIndex) => {
    const modeOffset = modeTableOffset + modeIndex * MODE_ENTRY_BYTE_LENGTH;
    exactInteger(view, modeOffset, modeIndex, `mode ${modeIndex} id`);
    exactInteger(view, modeOffset + 4, recordStart, `mode ${modeIndex} start`);
    exactInteger(view, modeOffset + 8, metadata.packedRecordCount, `mode ${modeIndex} count`);
    exactInteger(
      view,
      modeOffset + 12,
      metadata.maximumVisibleVertexIndex,
      `mode ${modeIndex} maximum vertex`,
    );
    const vertexIndices = new Uint16Array(metadata.packedRecordCount);
    const deltasSourceUnits = new Float32Array(metadata.packedRecordCount * 3);
    let previous = -1;
    for (let local = 0; local < metadata.packedRecordCount; local += 1) {
      const offset = deltaTableOffset + (recordStart + local) * DELTA_ENTRY_BYTE_LENGTH;
      const vertex = view.getUint32(offset, true);
      const delta = [
        view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true),
        view.getFloat32(offset + 12, true),
      ];
      if (
        vertex > VISIBLE_BODY_MAX_VERTEX_INDEX ||
        vertex <= previous ||
        delta.some((value) => !Number.isFinite(value)) ||
        delta.every((value) => value === 0)
      ) {
        throw new Error(`Torso bundle mode ${metadata.id} has an invalid record.`);
      }
      vertexIndices[local] = vertex;
      deltasSourceUnits.set(delta, local * 3);
      previous = vertex;
    }
    if (previous !== metadata.maximumVisibleVertexIndex) {
      throw new Error(`Torso bundle mode ${metadata.id} maximum vertex is invalid.`);
    }
    recordStart += metadata.packedRecordCount;
    return Object.freeze({
      id: metadata.id,
      channel: metadata.channel,
      direction: metadata.direction,
      vertexIndices,
      deltasSourceUnits,
    });
  });
  if (recordStart !== TOTAL_RECORD_COUNT) throw new Error('Torso bundle record total is invalid.');
  return Object.freeze({
    schemaVersion: MAKEHUMAN_TORSO_SHAPE_DELTA_BUNDLE_V1,
    visibleBodyVertexCount: VISIBLE_BODY_VERTEX_COUNT,
    sourceUnitScaleToM: SOURCE_UNIT_SCALE_TO_M,
    modes: Object.freeze(modes),
    provenance: MAKEHUMAN_TORSO_SHAPE_DELTA_PROVENANCE_V1,
    claims: Object.freeze({
      directSliderSemanticsClaimed: false as const,
      canonicalMeasurementSemanticMatchClaimed: false as const,
      millimetreCalibrationClaimed: false as const,
      tapeMeasurementEquivalent: false as const,
      populationRepresentativenessClaimed: false as const,
      fitClaimEligible: false as const,
      runtimeCollisionEligible: false as const,
      collisionCandidateEligible: false as const,
    }),
  });
}

let authenticatedBundleBytePromise: Promise<Uint8Array> | null = null;

function loadAuthenticatedMakeHumanTorsoShapeDeltaBundleBytesV1(): Promise<Uint8Array> {
  authenticatedBundleBytePromise ??= fetch(torsoShapeDeltaBundleUrl, {
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Torso bundle request failed (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await sha256Hex(bytes);
      if (digest !== MAKEHUMAN_TORSO_SHAPE_DELTA_PROVENANCE_V1.assetSha256) {
        throw new Error('Torso bundle SHA-256 authentication failed.');
      }
      return bytes;
    })
    .catch((reason: unknown) => {
      authenticatedBundleBytePromise = null;
      throw reason;
    });
  return authenticatedBundleBytePromise;
}

export async function loadMakeHumanTorsoShapeDeltaBundleV1(): Promise<MakeHumanTorsoShapeDeltaBundleV1> {
  try {
    const privateAuthenticatedBytes =
      await loadAuthenticatedMakeHumanTorsoShapeDeltaBundleBytesV1();
    // Each consumer owns the parsed views; only authenticated source bytes remain in the closure.
    return parseMakeHumanTorsoShapeDeltaBundleV1(privateAuthenticatedBytes);
  } catch (reason: unknown) {
    authenticatedBundleBytePromise = null;
    throw reason;
  }
}
