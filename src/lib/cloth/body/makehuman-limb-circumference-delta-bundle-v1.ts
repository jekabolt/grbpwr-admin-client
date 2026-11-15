import limbCircumferenceDeltaBundleUrl from '../../../assets/cloth/makehuman-hm08-limb-circumference-deltas-v1.bin?url';
import { sha256Hex } from '../../features/sha256';

import type { CanonicalMeasurementKey } from './measurement-adapter';

export const MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_BUNDLE_V1 =
  'makehuman-limb-circumference-delta-bundle/v1' as const;

const FORMAT_MAGIC = 'GRBPMD01';
const FORMAT_VERSION = 1;
const HEADER_BYTE_LENGTH = 64;
const MODE_ENTRY_BYTE_LENGTH = 16;
const DELTA_ENTRY_BYTE_LENGTH = 16;
const VISIBLE_BODY_VERTEX_COUNT = 13_380;
const VISIBLE_BODY_MAX_VERTEX_INDEX = VISIBLE_BODY_VERTEX_COUNT - 1;
const TOTAL_RECORD_COUNT = 4_758;
const EXPECTED_BYTE_LENGTH = 76_352;
const SOURCE_UNIT_SCALE_TO_M = 0.1;

export type MakeHumanLimbCircumferenceCanonicalKeyV1 = Extract<
  CanonicalMeasurementKey,
  | 'bicepCircumferenceMm'
  | 'wristCircumferenceMm'
  | 'thighCircumferenceMm'
  | 'calfCircumferenceMm'
  | 'ankleCircumferenceMm'
>;

export type MakeHumanLimbCircumferenceDeltaDirectionV1 = 'decrease' | 'increase';

export type MakeHumanLimbCircumferenceDeltaModeIdV1 =
  `${MakeHumanLimbCircumferenceCanonicalKeyV1}:${MakeHumanLimbCircumferenceDeltaDirectionV1}`;

interface MakeHumanLimbCircumferenceModeMetadataV1 {
  readonly id: MakeHumanLimbCircumferenceDeltaModeIdV1;
  readonly canonicalMeasurementKey: MakeHumanLimbCircumferenceCanonicalKeyV1;
  readonly direction: MakeHumanLimbCircumferenceDeltaDirectionV1;
  readonly sourcePath: string;
  readonly sourceByteSize: number;
  readonly sourceSha256: string;
  readonly sourceRecordCount: number;
  readonly visibleSourceRecordCount: number;
  readonly packedRecordCount: number;
  readonly maximumVisibleVertexIndex: number;
}

export const MAKEHUMAN_LIMB_CIRCUMFERENCE_MODE_METADATA_V1 = Object.freeze([
  Object.freeze({
    id: 'bicepCircumferenceMm:decrease',
    canonicalMeasurementKey: 'bicepCircumferenceMm',
    direction: 'decrease',
    sourcePath: 'makehuman/data/targets/measure/measure-upperarm-circ-decr.target',
    sourceByteSize: 16_653,
    sourceSha256: '42e5780765402bfedf65c59cf8f846ffe6fe06b120e11762376a4ab9ec57f383',
    sourceRecordCount: 786,
    visibleSourceRecordCount: 540,
    packedRecordCount: 522,
    maximumVisibleVertexIndex: 10_547,
  }),
  Object.freeze({
    id: 'bicepCircumferenceMm:increase',
    canonicalMeasurementKey: 'bicepCircumferenceMm',
    direction: 'increase',
    sourcePath: 'makehuman/data/targets/measure/measure-upperarm-circ-incr.target',
    sourceByteSize: 16_797,
    sourceSha256: '37f960203ae6c006399d3d26ab81e6d1de81523e86f845549aa94ca345c5d980',
    sourceRecordCount: 786,
    visibleSourceRecordCount: 540,
    packedRecordCount: 522,
    maximumVisibleVertexIndex: 10_547,
  }),
  Object.freeze({
    id: 'wristCircumferenceMm:decrease',
    canonicalMeasurementKey: 'wristCircumferenceMm',
    direction: 'decrease',
    sourcePath: 'makehuman/data/targets/measure/measure-wrist-circ-decr.target',
    sourceByteSize: 11_983,
    sourceSha256: '6bc9862a042361c8afdf0ca427f304b8a40c872c53eb7b324a00302ef48ab9b1',
    sourceRecordCount: 548,
    visibleSourceRecordCount: 468,
    packedRecordCount: 444,
    maximumVisibleVertexIndex: 10_587,
  }),
  Object.freeze({
    id: 'wristCircumferenceMm:increase',
    canonicalMeasurementKey: 'wristCircumferenceMm',
    direction: 'increase',
    sourcePath: 'makehuman/data/targets/measure/measure-wrist-circ-incr.target',
    sourceByteSize: 12_282,
    sourceSha256: '31fab1eac883e06be0146c2c1f2819638db6e983a125b9f4dcb071420720d9e1',
    sourceRecordCount: 556,
    visibleSourceRecordCount: 474,
    packedRecordCount: 446,
    maximumVisibleVertexIndex: 10_587,
  }),
  Object.freeze({
    id: 'thighCircumferenceMm:decrease',
    canonicalMeasurementKey: 'thighCircumferenceMm',
    direction: 'decrease',
    sourcePath: 'makehuman/data/targets/measure/measure-thigh-circ-decr.target',
    sourceByteSize: 18_564,
    sourceSha256: 'fe5303874b0ffe26a69cefd3e213b6478eec4648f60b0b110a1e176ccf24eaa9',
    sourceRecordCount: 890,
    visibleSourceRecordCount: 548,
    packedRecordCount: 512,
    maximumVisibleVertexIndex: 13_351,
  }),
  Object.freeze({
    id: 'thighCircumferenceMm:increase',
    canonicalMeasurementKey: 'thighCircumferenceMm',
    direction: 'increase',
    sourcePath: 'makehuman/data/targets/measure/measure-thigh-circ-incr.target',
    sourceByteSize: 23_303,
    sourceSha256: '5dca89b139df6f9b7c7641485dee18e9f0da10087359b9df5ca6a1e752ea0bcc',
    sourceRecordCount: 1_096,
    visibleSourceRecordCount: 551,
    packedRecordCount: 520,
    maximumVisibleVertexIndex: 13_351,
  }),
  Object.freeze({
    id: 'calfCircumferenceMm:decrease',
    canonicalMeasurementKey: 'calfCircumferenceMm',
    direction: 'decrease',
    sourcePath: 'makehuman/data/targets/measure/measure-calf-circ-decr.target',
    sourceByteSize: 14_968,
    sourceSha256: '2914fc47781e23987607c6546f4535ae5d8b04e2e2bec908ab588ee94e74aa15',
    sourceRecordCount: 776,
    visibleSourceRecordCount: 404,
    packedRecordCount: 400,
    maximumVisibleVertexIndex: 13_011,
  }),
  Object.freeze({
    id: 'calfCircumferenceMm:increase',
    canonicalMeasurementKey: 'calfCircumferenceMm',
    direction: 'increase',
    sourcePath: 'makehuman/data/targets/measure/measure-calf-circ-incr.target',
    sourceByteSize: 14_846,
    sourceSha256: 'c6106ec484a875a8763a7e9b12a4891da8efcd5152efbc1c7061f40bdc4353a6',
    sourceRecordCount: 776,
    visibleSourceRecordCount: 404,
    packedRecordCount: 400,
    maximumVisibleVertexIndex: 13_011,
  }),
  Object.freeze({
    id: 'ankleCircumferenceMm:decrease',
    canonicalMeasurementKey: 'ankleCircumferenceMm',
    direction: 'decrease',
    sourcePath: 'makehuman/data/targets/measure/measure-ankle-circ-decr.target',
    sourceByteSize: 16_524,
    sourceSha256: '0abb3c55b334b8508addf583a626f775ac45fa95eff773131dbd7ff48bf6d95d',
    sourceRecordCount: 874,
    visibleSourceRecordCount: 506,
    packedRecordCount: 496,
    maximumVisibleVertexIndex: 13_056,
  }),
  Object.freeze({
    id: 'ankleCircumferenceMm:increase',
    canonicalMeasurementKey: 'ankleCircumferenceMm',
    direction: 'increase',
    sourcePath: 'makehuman/data/targets/measure/measure-ankle-circ-incr.target',
    sourceByteSize: 16_414,
    sourceSha256: '01bbc7823b71199826e987227e22fc97ac88247467368414fd11309062d0fdcf',
    sourceRecordCount: 874,
    visibleSourceRecordCount: 506,
    packedRecordCount: 496,
    maximumVisibleVertexIndex: 13_056,
  }),
] as const satisfies readonly MakeHumanLimbCircumferenceModeMetadataV1[]);

export const MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_PROVENANCE_V1 = Object.freeze({
  repository: 'makehumancommunity/makehuman',
  release: 'v1.3.0',
  commit: '1f508f6083b2f823dab15de924b3bde72e08d77c',
  licenseId: 'CC0-1.0',
  generator: 'scripts/cloth/build-makehuman-limb-circumference-deltas-v1.mjs',
  assetPath: 'src/assets/cloth/makehuman-hm08-limb-circumference-deltas-v1.bin',
  assetByteLength: EXPECTED_BYTE_LENGTH,
  assetSha256: '7a852519ce230ac82aa6b8beea404b49f04305532a9ea26cdd30151015464a2c',
  role: 'CC0_DIRECT_DELTA_DIRECTIONS_ONLY' as const,
  rawSourceAssetsBundled: false as const,
  modes: MAKEHUMAN_LIMB_CIRCUMFERENCE_MODE_METADATA_V1,
});

export interface MakeHumanLimbCircumferenceDeltaModeV1 {
  readonly id: MakeHumanLimbCircumferenceDeltaModeIdV1;
  readonly canonicalMeasurementKey: MakeHumanLimbCircumferenceCanonicalKeyV1;
  readonly direction: MakeHumanLimbCircumferenceDeltaDirectionV1;
  readonly vertexIndices: Uint16Array;
  readonly deltasSourceUnits: Float32Array;
}

export interface MakeHumanLimbCircumferenceDeltaBundleV1 {
  readonly schemaVersion: typeof MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_BUNDLE_V1;
  readonly visibleBodyVertexCount: number;
  readonly sourceUnitScaleToM: number;
  readonly modes: readonly MakeHumanLimbCircumferenceDeltaModeV1[];
  readonly provenance: typeof MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_PROVENANCE_V1;
  readonly claims: {
    readonly directSliderSemanticsClaimed: false;
    readonly millimetreCalibrationClaimed: false;
    readonly populationRepresentativenessClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
  };
}

function decodeAscii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function exactInteger(view: DataView, byteOffset: number, expected: number, label: string): void {
  if (view.getUint32(byteOffset, true) !== expected) {
    throw new Error(`Limb delta bundle ${label} is invalid.`);
  }
}

export function parseMakeHumanLimbCircumferenceDeltaBundleV1(
  input: ArrayBuffer | Uint8Array,
): MakeHumanLimbCircumferenceDeltaBundleV1 {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < HEADER_BYTE_LENGTH) throw new Error('Limb delta bundle is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (decodeAscii(bytes.subarray(0, 8)) !== FORMAT_MAGIC) {
    throw new Error('Limb delta bundle magic is invalid.');
  }
  exactInteger(view, 8, FORMAT_VERSION, 'version');
  exactInteger(view, 12, HEADER_BYTE_LENGTH, 'header length');
  exactInteger(view, 16, VISIBLE_BODY_VERTEX_COUNT, 'visible vertex count');
  exactInteger(view, 20, MAKEHUMAN_LIMB_CIRCUMFERENCE_MODE_METADATA_V1.length, 'mode count');
  exactInteger(view, 24, TOTAL_RECORD_COUNT, 'record count');
  exactInteger(view, 28, VISIBLE_BODY_MAX_VERTEX_INDEX, 'maximum vertex index');
  if (Math.abs(view.getFloat64(32, true) - SOURCE_UNIT_SCALE_TO_M) > 1e-12) {
    throw new Error('Limb delta bundle source unit scale is invalid.');
  }
  const modeTableByteOffset = view.getUint32(40, true);
  const deltaTableByteOffset = view.getUint32(44, true);
  exactInteger(view, 48, MODE_ENTRY_BYTE_LENGTH, 'mode entry length');
  exactInteger(view, 52, DELTA_ENTRY_BYTE_LENGTH, 'delta entry length');
  exactInteger(view, 56, EXPECTED_BYTE_LENGTH, 'declared byte length');
  exactInteger(view, 60, 0, 'reserved header field');
  if (
    bytes.byteLength !== EXPECTED_BYTE_LENGTH ||
    modeTableByteOffset !== HEADER_BYTE_LENGTH ||
    deltaTableByteOffset !==
      HEADER_BYTE_LENGTH +
        MAKEHUMAN_LIMB_CIRCUMFERENCE_MODE_METADATA_V1.length * MODE_ENTRY_BYTE_LENGTH ||
    deltaTableByteOffset + TOTAL_RECORD_COUNT * DELTA_ENTRY_BYTE_LENGTH !== bytes.byteLength
  ) {
    throw new Error('Limb delta bundle byte layout is invalid.');
  }

  let expectedRecordStart = 0;
  const modes = MAKEHUMAN_LIMB_CIRCUMFERENCE_MODE_METADATA_V1.map((metadata, modeIndex) => {
    const modeOffset = modeTableByteOffset + modeIndex * MODE_ENTRY_BYTE_LENGTH;
    exactInteger(view, modeOffset, modeIndex, `mode ${modeIndex} id`);
    exactInteger(view, modeOffset + 4, expectedRecordStart, `mode ${modeIndex} record start`);
    exactInteger(view, modeOffset + 8, metadata.packedRecordCount, `mode ${modeIndex} count`);
    exactInteger(
      view,
      modeOffset + 12,
      metadata.maximumVisibleVertexIndex,
      `mode ${modeIndex} maximum vertex`,
    );

    const vertexIndices = new Uint16Array(metadata.packedRecordCount);
    const deltasSourceUnits = new Float32Array(metadata.packedRecordCount * 3);
    let previousVertexIndex = -1;
    for (let recordIndex = 0; recordIndex < metadata.packedRecordCount; recordIndex += 1) {
      const recordOffset =
        deltaTableByteOffset + (expectedRecordStart + recordIndex) * DELTA_ENTRY_BYTE_LENGTH;
      const vertexIndex = view.getUint32(recordOffset, true);
      const delta = [
        view.getFloat32(recordOffset + 4, true),
        view.getFloat32(recordOffset + 8, true),
        view.getFloat32(recordOffset + 12, true),
      ];
      if (
        vertexIndex > VISIBLE_BODY_MAX_VERTEX_INDEX ||
        vertexIndex <= previousVertexIndex ||
        delta.some((value) => !Number.isFinite(value)) ||
        delta.every((value) => value === 0)
      ) {
        throw new Error(`Limb delta bundle mode ${metadata.id} has an invalid record.`);
      }
      vertexIndices[recordIndex] = vertexIndex;
      deltasSourceUnits.set(delta, recordIndex * 3);
      previousVertexIndex = vertexIndex;
    }
    if (previousVertexIndex !== metadata.maximumVisibleVertexIndex) {
      throw new Error(`Limb delta bundle mode ${metadata.id} maximum vertex is invalid.`);
    }
    expectedRecordStart += metadata.packedRecordCount;
    return Object.freeze({
      id: metadata.id,
      canonicalMeasurementKey: metadata.canonicalMeasurementKey,
      direction: metadata.direction,
      vertexIndices,
      deltasSourceUnits,
    });
  });
  if (expectedRecordStart !== TOTAL_RECORD_COUNT) {
    throw new Error('Limb delta bundle record coverage is invalid.');
  }

  return Object.freeze({
    schemaVersion: MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_BUNDLE_V1,
    visibleBodyVertexCount: VISIBLE_BODY_VERTEX_COUNT,
    sourceUnitScaleToM: SOURCE_UNIT_SCALE_TO_M,
    modes: Object.freeze(modes),
    provenance: MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_PROVENANCE_V1,
    claims: Object.freeze({
      directSliderSemanticsClaimed: false as const,
      millimetreCalibrationClaimed: false as const,
      populationRepresentativenessClaimed: false as const,
      fitClaimEligible: false as const,
      runtimeCollisionEligible: false as const,
      collisionCandidateEligible: false as const,
    }),
  });
}

let authenticatedBundleBytePromise: Promise<Uint8Array> | null = null;

function loadAuthenticatedMakeHumanLimbCircumferenceDeltaBundleBytesV1(): Promise<Uint8Array> {
  authenticatedBundleBytePromise ??= fetch(limbCircumferenceDeltaBundleUrl, {
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Open-reference limb delta bundle request failed (${response.status}).`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await sha256Hex(bytes);
      if (digest !== MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_PROVENANCE_V1.assetSha256) {
        throw new Error('Open-reference limb delta bundle SHA-256 authentication failed.');
      }
      return bytes;
    })
    .catch((reason: unknown) => {
      authenticatedBundleBytePromise = null;
      throw reason;
    });
  return authenticatedBundleBytePromise;
}

export async function loadMakeHumanLimbCircumferenceDeltaBundleV1(): Promise<MakeHumanLimbCircumferenceDeltaBundleV1> {
  try {
    const privateAuthenticatedBytes =
      await loadAuthenticatedMakeHumanLimbCircumferenceDeltaBundleBytesV1();
    // Each caller owns fresh parsed views; only authenticated source bytes remain cached privately.
    return parseMakeHumanLimbCircumferenceDeltaBundleV1(privateAuthenticatedBytes);
  } catch (reason: unknown) {
    authenticatedBundleBytePromise = null;
    throw reason;
  }
}
