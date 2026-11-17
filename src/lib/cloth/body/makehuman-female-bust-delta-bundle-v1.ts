import femaleBustDeltaBundleUrl from '../../../assets/cloth/makehuman-hm08-female-bust-deltas-v1.bin?url';
import { sha256Hex } from '../../features/sha256';

export const MAKEHUMAN_FEMALE_BUST_DELTA_BUNDLE_V1 =
  'makehuman-female-bust-delta-bundle/v1' as const;

const FORMAT_MAGIC = 'GRBPFB01';
const FORMAT_VERSION = 1;
const HEADER_BYTE_LENGTH = 64;
const RECORD_BYTE_LENGTH = 16;
const VISIBLE_BODY_VERTEX_COUNT = 13_380;
const SOURCE_RECORD_COUNT = 540;
const PACKED_RECORD_COUNT = 402;
const MAXIMUM_VISIBLE_VERTEX_INDEX = 10_750;
const SOURCE_BYTE_LENGTH = 12_019;
const EXPECTED_BYTE_LENGTH = 6_496;
const SOURCE_UNIT_SCALE_TO_M = 0.1;

export const MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1 = Object.freeze({
  repository: 'makehumancommunity/makehuman',
  release: 'v1.3.0',
  commit: '1f508f6083b2f823dab15de924b3bde72e08d77c',
  sourcePath:
    'makehuman/data/targets/breast/female-young-averagemuscle-averageweight-mincup-averagefirmness.target',
  sourceByteLength: SOURCE_BYTE_LENGTH,
  sourceSha256: '65e4ca16353f6c0e23b420cf5d9b31d8993943b76e6cd3a6961943371dd6bc2f',
  sourceRecordCount: SOURCE_RECORD_COUNT,
  packedRecordCount: PACKED_RECORD_COUNT,
  maximumVisibleVertexIndex: MAXIMUM_VISIBLE_VERTEX_INDEX,
  licenseId: 'CC0-1.0',
  generator: 'scripts/cloth/build-makehuman-female-bust-deltas-v1.mjs',
  assetPath: 'src/assets/cloth/makehuman-hm08-female-bust-deltas-v1.bin',
  assetByteLength: EXPECTED_BYTE_LENGTH,
  assetSha256: '604999167aff3654575f87eece98b1c4645ee588abe7381001b0d30f4fc3c6af',
  use: 'signed; c < 0 is the MakeHuman min-cup field as authored; c > 0 reverses it (our extrapolation) and at runtime is faded to zero from the bust plane up to the armpit line and down to the under-bust station',
});

export interface MakeHumanFemaleBustDeltaBundleV1 {
  readonly schemaVersion: typeof MAKEHUMAN_FEMALE_BUST_DELTA_BUNDLE_V1;
  readonly visibleBodyVertexCount: number;
  readonly sourceUnitScaleToM: number;
  readonly vertexIndices: Uint16Array;
  readonly deltasSourceUnits: Float32Array;
  readonly provenance: typeof MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1;
  readonly claims: {
    readonly signedField: true;
    readonly positiveSideIsExtrapolation: true;
    readonly circumferenceRangeCalibrated: false;
    readonly anatomicalCalibrationClaimed: false;
    readonly populationRepresentativenessClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
  };
}

function exactInteger(view: DataView, offset: number, expected: number, label: string): void {
  if (view.getUint32(offset, true) !== expected) {
    throw new Error(`Female bust bundle ${label} is invalid.`);
  }
}

export function parseMakeHumanFemaleBustDeltaBundleV1(
  input: ArrayBuffer | Uint8Array,
): MakeHumanFemaleBustDeltaBundleV1 {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < HEADER_BYTE_LENGTH) throw new Error('Female bust bundle is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 8)) !== FORMAT_MAGIC) {
    throw new Error('Female bust bundle magic is invalid.');
  }
  exactInteger(view, 8, FORMAT_VERSION, 'version');
  exactInteger(view, 12, HEADER_BYTE_LENGTH, 'header length');
  exactInteger(view, 16, VISIBLE_BODY_VERTEX_COUNT, 'vertex count');
  exactInteger(view, 20, PACKED_RECORD_COUNT, 'record count');
  exactInteger(view, 24, MAXIMUM_VISIBLE_VERTEX_INDEX, 'maximum vertex');
  exactInteger(view, 28, SOURCE_RECORD_COUNT, 'source record count');
  exactInteger(view, 32, SOURCE_BYTE_LENGTH, 'source byte length');
  exactInteger(view, 36, RECORD_BYTE_LENGTH, 'record length');
  if (Math.abs(view.getFloat64(40, true) - SOURCE_UNIT_SCALE_TO_M) > 1e-12) {
    throw new Error('Female bust bundle unit scale is invalid.');
  }
  exactInteger(view, 48, HEADER_BYTE_LENGTH, 'record table offset');
  exactInteger(view, 52, EXPECTED_BYTE_LENGTH, 'declared byte length');
  exactInteger(view, 56, 0, 'reserved field 0');
  exactInteger(view, 60, 0, 'reserved field 1');
  if (
    bytes.byteLength !== EXPECTED_BYTE_LENGTH ||
    HEADER_BYTE_LENGTH + PACKED_RECORD_COUNT * RECORD_BYTE_LENGTH !== bytes.byteLength
  ) {
    throw new Error('Female bust bundle byte layout is invalid.');
  }

  const vertexIndices = new Uint16Array(PACKED_RECORD_COUNT);
  const deltasSourceUnits = new Float32Array(PACKED_RECORD_COUNT * 3);
  let previous = -1;
  for (let record = 0; record < PACKED_RECORD_COUNT; record += 1) {
    const offset = HEADER_BYTE_LENGTH + record * RECORD_BYTE_LENGTH;
    const vertex = view.getUint32(offset, true);
    const delta = [
      view.getFloat32(offset + 4, true),
      view.getFloat32(offset + 8, true),
      view.getFloat32(offset + 12, true),
    ];
    if (
      vertex >= VISIBLE_BODY_VERTEX_COUNT ||
      vertex <= previous ||
      delta.some((value) => !Number.isFinite(value)) ||
      delta.every((value) => value === 0)
    ) {
      throw new Error('Female bust bundle has an invalid record.');
    }
    vertexIndices[record] = vertex;
    deltasSourceUnits.set(delta, record * 3);
    previous = vertex;
  }
  if (previous !== MAXIMUM_VISIBLE_VERTEX_INDEX) {
    throw new Error('Female bust bundle maximum vertex is invalid.');
  }
  return Object.freeze({
    schemaVersion: MAKEHUMAN_FEMALE_BUST_DELTA_BUNDLE_V1,
    visibleBodyVertexCount: VISIBLE_BODY_VERTEX_COUNT,
    sourceUnitScaleToM: SOURCE_UNIT_SCALE_TO_M,
    vertexIndices,
    deltasSourceUnits,
    provenance: MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1,
    claims: Object.freeze({
      signedField: true as const,
      positiveSideIsExtrapolation: true as const,
      circumferenceRangeCalibrated: false as const,
      anatomicalCalibrationClaimed: false as const,
      populationRepresentativenessClaimed: false as const,
      fitClaimEligible: false as const,
      runtimeCollisionEligible: false as const,
    }),
  });
}

let authenticatedBundleBytePromise: Promise<Uint8Array> | null = null;

function loadAuthenticatedMakeHumanFemaleBustDeltaBundleBytesV1(): Promise<Uint8Array> {
  authenticatedBundleBytePromise ??= fetch(femaleBustDeltaBundleUrl, {
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Female bust bundle request failed (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await sha256Hex(bytes);
      if (digest !== MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.assetSha256) {
        throw new Error('Female bust bundle SHA-256 authentication failed.');
      }
      return bytes;
    })
    .catch((reason: unknown) => {
      authenticatedBundleBytePromise = null;
      throw reason;
    });
  return authenticatedBundleBytePromise;
}

export async function loadMakeHumanFemaleBustDeltaBundleV1(): Promise<MakeHumanFemaleBustDeltaBundleV1> {
  try {
    return parseMakeHumanFemaleBustDeltaBundleV1(
      await loadAuthenticatedMakeHumanFemaleBustDeltaBundleBytesV1(),
    );
  } catch (reason: unknown) {
    authenticatedBundleBytePromise = null;
    throw reason;
  }
}
