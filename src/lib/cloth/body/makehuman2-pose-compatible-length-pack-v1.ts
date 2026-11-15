import poseCompatibleLengthPackUrl from '../../../assets/cloth/makehuman2-hm08-pose-compatible-length-v1.bin?url';
import { sha256Hex } from '../../features/sha256';

export const MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_V1 =
  'makehuman2-pose-compatible-length-pack/v1' as const;

const MAGIC = 'GRBPLN01';
const FORMAT_VERSION = 1;
const HEADER_BYTE_LENGTH = 96;
const MODE_ENTRY_BYTE_LENGTH = 32;
const DELTA_ENTRY_BYTE_LENGTH = 16;
const JOINT_ENTRY_BYTE_LENGTH = 24;
const HELPER_ENTRY_BYTE_LENGTH = 16;
const VERTEX_COUNT = 19_158;
const VISIBLE_VERTEX_COUNT = 13_380;
const SOURCE_UNIT_SCALE_TO_M = 0.1;

export const MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1 = Object.freeze([
  'upperArmLength:decrease',
  'upperArmLength:increase',
  'lowerArmLength:decrease',
  'lowerArmLength:increase',
  'upperLegLength:decrease',
  'upperLegLength:increase',
  'lowerLegLength:decrease',
  'lowerLegLength:increase',
] as const);

export type MakeHuman2PoseCompatibleLengthModeIdV1 =
  (typeof MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1)[number];

const EXPECTED_MODE_RECORD_COUNTS = Object.freeze([
  4_938, 4_944, 4_220, 4_086, 5_478, 5_329, 4_010, 3_915,
]);
const EXPECTED_VISIBLE_RECORD_COUNTS = Object.freeze([
  4_140, 4_146, 3_660, 3_568, 3_309, 3_162, 2_602, 2_554,
]);
const EXPECTED_HELPER_RECORD_COUNTS = Object.freeze([
  798, 798, 560, 518, 2_169, 2_167, 1_408, 1_361,
]);
const EXPECTED_MAXIMUM_VERTEX_INDICES = Object.freeze([
  17_260, 17_260, 17_259, 17_256, 19_157, 19_157, 19_157, 19_157,
]);

export const MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1 = Object.freeze({
  schemaVersion: MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_V1,
  role: 'CC0_POSE_COMPATIBLE_LENGTH_RESEARCH_SOURCE' as const,
  assetPath: 'src/assets/cloth/makehuman2-hm08-pose-compatible-length-v1.bin',
  byteLength: 643_468,
  sha256: '6b7ab1609ff411750db1625b7659d93ce3de485283a1444bf9d444e5dea70823',
  upstreamRepository: 'makehumancommunity/makehuman2',
  upstreamCommit: '13b7ff56b388826bee548bc18d78c8d492cf3512',
  assetLicense: 'CC0-1.0',
  generator: 'scripts/cloth/build-makehuman2-pose-compatible-length-pack-v1.mjs',
  vertexCount: VERTEX_COUNT,
  visibleVertexCount: VISIBLE_VERTEX_COUNT,
  modeCount: 8,
  jointCount: 28,
  helperBasePositionCount: 3_119,
  productionRuntimeApproved: false,
  canonicalSleeveOrInseamAdmitted: false,
  fitClaimEligible: false,
  runtimeCollisionEligible: false,
});

export interface MakeHuman2PoseCompatibleLengthModeV1 {
  readonly id: MakeHuman2PoseCompatibleLengthModeIdV1;
  readonly vertexIndices: Uint32Array;
  readonly deltasSourceUnits: Float32Array;
  readonly visibleRecordCount: number;
  readonly helperRecordCount: number;
}

export interface MakeHuman2PoseCompatibleLengthJointV1 {
  readonly key: string;
  readonly vertexIndices: Uint32Array;
}

export interface MakeHuman2PoseCompatibleLengthPackV1 {
  readonly schemaVersion: typeof MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_V1;
  readonly vertexCount: number;
  readonly visibleVertexCount: number;
  readonly sourceUnitScaleToM: number;
  readonly modes: readonly MakeHuman2PoseCompatibleLengthModeV1[];
  readonly joints: readonly MakeHuman2PoseCompatibleLengthJointV1[];
  readonly helperVertexIndices: Uint32Array;
  readonly helperBasePositionsSourceUnits: Float32Array;
  readonly provenance: typeof MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1;
}

type LengthPackFetchV1 = (
  input: string | URL,
  init?: { readonly credentials?: 'same-origin' },
) => Promise<Response>;
type LengthPackDigestV1 = (input: Uint8Array) => Promise<string>;

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function uint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function exact(value: number, expected: number, label: string): void {
  if (value !== expected) throw new Error(`Pose-compatible length pack ${label} is invalid.`);
}

function tableBounds(
  offset: number,
  count: number,
  stride: number,
  byteLength: number,
  label: string,
): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(count) ||
    offset < HEADER_BYTE_LENGTH ||
    count < 0 ||
    offset + count * stride > byteLength
  ) {
    throw new Error(`Pose-compatible length pack ${label} bounds are invalid.`);
  }
}

function exactInput(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input.slice();
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0));
  throw new TypeError('Pose-compatible length pack input must be bytes.');
}

export function parseMakeHuman2PoseCompatibleLengthPackV1(
  input: ArrayBuffer | Uint8Array,
): MakeHuman2PoseCompatibleLengthPackV1 {
  const bytes = exactInput(input);
  if (bytes.byteLength < HEADER_BYTE_LENGTH) {
    throw new Error('Pose-compatible length pack is truncated.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes.subarray(0, 8)) !== MAGIC) {
    throw new Error('Pose-compatible length pack magic is invalid.');
  }
  exact(uint32(view, 8), FORMAT_VERSION, 'version');
  exact(uint32(view, 12), HEADER_BYTE_LENGTH, 'header length');
  exact(uint32(view, 16), VERTEX_COUNT, 'vertex count');
  exact(uint32(view, 20), VISIBLE_VERTEX_COUNT, 'visible vertex count');
  exact(uint32(view, 24), MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1.length, 'mode count');
  const totalDeltaCount = uint32(view, 28);
  exact(
    totalDeltaCount,
    EXPECTED_MODE_RECORD_COUNTS.reduce((sum, count) => sum + count, 0),
    'delta count',
  );
  exact(
    uint32(view, 32),
    MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.jointCount,
    'joint count',
  );
  const jointReferenceCount = uint32(view, 36);
  exact(
    uint32(view, 40),
    MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.helperBasePositionCount,
    'helper count',
  );
  const modeTableOffset = uint32(view, 44);
  const deltaTableOffset = uint32(view, 48);
  const jointTableOffset = uint32(view, 52);
  const jointReferenceTableOffset = uint32(view, 56);
  const helperTableOffset = uint32(view, 60);
  const stringTableOffset = uint32(view, 64);
  const stringTableLength = uint32(view, 68);
  exact(uint32(view, 72), bytes.byteLength, 'declared byte length');
  exact(uint32(view, 76), VERTEX_COUNT - 1, 'maximum vertex index');
  if (view.getFloat64(80, true) !== SOURCE_UNIT_SCALE_TO_M) {
    throw new Error('Pose-compatible length pack source scale is invalid.');
  }
  for (let offset = 88; offset < HEADER_BYTE_LENGTH; offset += 4) {
    exact(uint32(view, offset), 0, 'reserved header field');
  }

  tableBounds(modeTableOffset, 8, MODE_ENTRY_BYTE_LENGTH, bytes.byteLength, 'mode table');
  tableBounds(
    deltaTableOffset,
    totalDeltaCount,
    DELTA_ENTRY_BYTE_LENGTH,
    bytes.byteLength,
    'delta table',
  );
  tableBounds(jointTableOffset, 28, JOINT_ENTRY_BYTE_LENGTH, bytes.byteLength, 'joint table');
  tableBounds(
    jointReferenceTableOffset,
    jointReferenceCount,
    4,
    bytes.byteLength,
    'joint reference table',
  );
  tableBounds(helperTableOffset, 3_119, HELPER_ENTRY_BYTE_LENGTH, bytes.byteLength, 'helper table');
  if (
    modeTableOffset !== HEADER_BYTE_LENGTH ||
    deltaTableOffset !== modeTableOffset + 8 * MODE_ENTRY_BYTE_LENGTH ||
    jointTableOffset !== deltaTableOffset + totalDeltaCount * DELTA_ENTRY_BYTE_LENGTH ||
    jointReferenceTableOffset !== jointTableOffset + 28 * JOINT_ENTRY_BYTE_LENGTH ||
    helperTableOffset !== jointReferenceTableOffset + jointReferenceCount * 4 ||
    stringTableOffset !== helperTableOffset + 3_119 * HELPER_ENTRY_BYTE_LENGTH ||
    stringTableOffset + stringTableLength !== bytes.byteLength
  ) {
    throw new Error('Pose-compatible length pack byte layout is invalid.');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const readString = (offset: number, length: number): string => {
    if (offset + length > stringTableLength) {
      throw new Error('Pose-compatible length pack string reference is invalid.');
    }
    return decoder.decode(
      bytes.subarray(stringTableOffset + offset, stringTableOffset + offset + length),
    );
  };

  let expectedRecordStart = 0;
  const modes = MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1.map((expectedId, modeIndex) => {
    const offset = modeTableOffset + modeIndex * MODE_ENTRY_BYTE_LENGTH;
    const id = readString(uint32(view, offset), uint32(view, offset + 4));
    const recordStart = uint32(view, offset + 8);
    const recordCount = uint32(view, offset + 12);
    const visibleRecordCount = uint32(view, offset + 16);
    const helperRecordCount = uint32(view, offset + 20);
    if (
      id !== expectedId ||
      recordStart !== expectedRecordStart ||
      recordCount !== EXPECTED_MODE_RECORD_COUNTS[modeIndex] ||
      visibleRecordCount !== EXPECTED_VISIBLE_RECORD_COUNTS[modeIndex] ||
      helperRecordCount !== EXPECTED_HELPER_RECORD_COUNTS[modeIndex] ||
      uint32(view, offset + 24) !== recordCount ||
      uint32(view, offset + 28) !== EXPECTED_MAXIMUM_VERTEX_INDICES[modeIndex] ||
      visibleRecordCount + helperRecordCount !== recordCount
    ) {
      throw new Error(`Pose-compatible length pack mode ${expectedId} metadata is invalid.`);
    }
    const vertexIndices = new Uint32Array(recordCount);
    const deltasSourceUnits = new Float32Array(recordCount * 3);
    let previousVertex = -1;
    let observedVisibleCount = 0;
    for (let record = 0; record < recordCount; record += 1) {
      const recordOffset = deltaTableOffset + (recordStart + record) * DELTA_ENTRY_BYTE_LENGTH;
      const vertex = uint32(view, recordOffset);
      const dx = view.getFloat32(recordOffset + 4, true);
      const dy = view.getFloat32(recordOffset + 8, true);
      const dz = view.getFloat32(recordOffset + 12, true);
      if (
        vertex <= previousVertex ||
        vertex >= VERTEX_COUNT ||
        ![dx, dy, dz].every(Number.isFinite) ||
        (dx === 0 && dy === 0 && dz === 0)
      ) {
        throw new Error(`Pose-compatible length pack mode ${expectedId} has an invalid record.`);
      }
      if (vertex < VISIBLE_VERTEX_COUNT) observedVisibleCount += 1;
      vertexIndices[record] = vertex;
      deltasSourceUnits.set([dx, dy, dz], record * 3);
      previousVertex = vertex;
    }
    if (
      observedVisibleCount !== visibleRecordCount ||
      previousVertex !== EXPECTED_MAXIMUM_VERTEX_INDICES[modeIndex]
    ) {
      throw new Error(`Pose-compatible length pack mode ${expectedId} coverage is invalid.`);
    }
    expectedRecordStart += recordCount;
    return Object.freeze({
      id,
      vertexIndices,
      deltasSourceUnits,
      visibleRecordCount,
      helperRecordCount,
    }) as MakeHuman2PoseCompatibleLengthModeV1;
  });

  const joints: MakeHuman2PoseCompatibleLengthJointV1[] = [];
  let expectedReferenceStart = 0;
  let previousKey = '';
  for (let jointIndex = 0; jointIndex < 28; jointIndex += 1) {
    const offset = jointTableOffset + jointIndex * JOINT_ENTRY_BYTE_LENGTH;
    const key = readString(uint32(view, offset), uint32(view, offset + 4));
    const referenceStart = uint32(view, offset + 8);
    const referenceCount = uint32(view, offset + 12);
    const declaredMaximum = uint32(view, offset + 16);
    exact(uint32(view, offset + 20), 0, `joint ${key} reserved field`);
    if (
      !key ||
      key <= previousKey ||
      referenceStart !== expectedReferenceStart ||
      referenceCount === 0 ||
      referenceStart + referenceCount > jointReferenceCount
    ) {
      throw new Error(`Pose-compatible length pack joint ${key || jointIndex} is invalid.`);
    }
    const vertexIndices = new Uint32Array(referenceCount);
    let maximumVertex = -1;
    const seenVertices = new Set<number>();
    for (let reference = 0; reference < referenceCount; reference += 1) {
      const vertex = uint32(view, jointReferenceTableOffset + (referenceStart + reference) * 4);
      if (seenVertices.has(vertex) || vertex < 0 || vertex >= VERTEX_COUNT) {
        throw new Error(`Pose-compatible length pack joint ${key} reference is invalid.`);
      }
      vertexIndices[reference] = vertex;
      seenVertices.add(vertex);
      maximumVertex = Math.max(maximumVertex, vertex);
    }
    if (maximumVertex !== declaredMaximum) {
      throw new Error(`Pose-compatible length pack joint ${key} maximum is invalid.`);
    }
    joints.push(Object.freeze({ key, vertexIndices }));
    previousKey = key;
    expectedReferenceStart += referenceCount;
  }
  if (expectedReferenceStart !== jointReferenceCount) {
    throw new Error('Pose-compatible length pack joint reference coverage is invalid.');
  }

  const helperVertexIndices = new Uint32Array(3_119);
  const helperBasePositionsSourceUnits = new Float32Array(3_119 * 3);
  let previousHelper = -1;
  for (let helper = 0; helper < 3_119; helper += 1) {
    const offset = helperTableOffset + helper * HELPER_ENTRY_BYTE_LENGTH;
    const vertex = uint32(view, offset);
    const values = [
      view.getFloat32(offset + 4, true),
      view.getFloat32(offset + 8, true),
      view.getFloat32(offset + 12, true),
    ];
    if (
      vertex <= previousHelper ||
      vertex < VISIBLE_VERTEX_COUNT ||
      vertex >= VERTEX_COUNT ||
      !values.every(Number.isFinite)
    ) {
      throw new Error('Pose-compatible length pack helper base record is invalid.');
    }
    helperVertexIndices[helper] = vertex;
    helperBasePositionsSourceUnits.set(values, helper * 3);
    previousHelper = vertex;
  }

  return Object.freeze({
    schemaVersion: MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_V1,
    vertexCount: VERTEX_COUNT,
    visibleVertexCount: VISIBLE_VERTEX_COUNT,
    sourceUnitScaleToM: SOURCE_UNIT_SCALE_TO_M,
    modes: Object.freeze(modes),
    joints: Object.freeze(joints),
    helperVertexIndices,
    helperBasePositionsSourceUnits,
    provenance: MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  });
}

/**
 * Caches only authenticated private bytes. Every call reparses owned arrays, and a failed request,
 * digest or parse clears the cache so a later explicit rebuild may retry.
 */
export function createMakeHuman2PoseCompatibleLengthPackLoaderV1(options?: {
  readonly url?: string;
  readonly fetchImpl?: LengthPackFetchV1;
  readonly digest?: LengthPackDigestV1;
}): () => Promise<MakeHuman2PoseCompatibleLengthPackV1> {
  const fetchImpl: LengthPackFetchV1 =
    options?.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const digest = options?.digest ?? sha256Hex;
  let authenticatedBytesPromise: Promise<Uint8Array> | null = null;

  return async () => {
    authenticatedBytesPromise ??= fetchImpl(options?.url ?? poseCompatibleLengthPackUrl, {
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Pose-compatible length pack request failed (${response.status}).`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength !== MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.byteLength) {
          throw new Error('Pose-compatible length pack byte length authentication failed.');
        }
        if ((await digest(bytes)) !== MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.sha256) {
          throw new Error('Pose-compatible length pack SHA-256 authentication failed.');
        }
        return bytes;
      })
      .catch((reason: unknown) => {
        authenticatedBytesPromise = null;
        throw reason;
      });
    try {
      return parseMakeHuman2PoseCompatibleLengthPackV1(await authenticatedBytesPromise);
    } catch (reason: unknown) {
      authenticatedBytesPromise = null;
      throw reason;
    }
  };
}

export const loadMakeHuman2PoseCompatibleLengthPackV1 =
  createMakeHuman2PoseCompatibleLengthPackLoaderV1();
