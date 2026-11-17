import {
  decodeModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
  type ModelMannequinPoseDocumentV2,
} from '../body/model-mannequin-pose-document-v2';
import type { MeasurementBodyFrameV2 } from '../body/measurement-body-frame-v2';
import { sha256Hex } from 'lib/features/sha256';

export const SAVED_MODEL_OBSERVED_PLACEMENT_TARGET_V1 =
  'saved-model-observed-direct-pose/v1' as const;
const MAX_BYTES = 128 * 1024;
const SHA = /^[0-9a-f]{64}$/u;
const encoder = new TextEncoder();
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const COORDINATES = Object.freeze({
  handedness: 'right',
  up: '+Y',
  front: '+Z',
  subjectLeft: '+X',
  origin: 'ground-projection-between-ankles',
} as const);

/** Proposed metadata for a future durable placement target. It is not a saved document or owner. */
export interface SavedModelObservedPlacementTargetV1 {
  readonly kind: typeof SAVED_MODEL_OBSERVED_PLACEMENT_TARGET_V1;
  readonly persistedModel: Readonly<{ id: number; updatedAt: string; revision: string }>;
  readonly displayedModel: Readonly<{
    modelId: string;
    modelContentRevision: string;
    basisKind: 'neutral' | 'female' | 'male';
    inputFingerprint: string;
    bodyBuildFingerprint: string;
    runtimeSourceRevision: string;
  }>;
  readonly canonicalMeasurementsSha256: string;
  readonly pose: Readonly<{ document: ModelMannequinPoseDocumentV2; canonicalSha256: string }>;
  readonly geometry: Readonly<{
    positionsFloat32LeSha256: string;
    trianglesUint32LeSha256: string;
    vertexCount: number;
    triangleCount: number;
    byteLength: number;
  }>;
  readonly frame: Readonly<{
    version: MeasurementBodyFrameV2['version'];
    id: MeasurementBodyFrameV2['id'];
    revision: MeasurementBodyFrameV2['revision'];
    sourceRevision: string;
    units: 'm';
    coordinateSystem: MeasurementBodyFrameV2['coordinateSystem'];
    /** Digest of the full accepted frame, not just this identity projection. */
    canonicalSha256: string;
  }>;
}
const CLAIMS = Object.freeze({
  metadataOnly: true,
  proposedFutureStorageContract: true,
  storageIntegrated: false,
  decodedMetadataAuthenticatesBody: false,
  omittedFrameAndGeometryReconstructed: false,
  bodyAdmission: false,
  runtimeAdmission: false,
} as const);
type Code = 'invalid-input' | 'body-unavailable' | 'body-changed' | 'cancelled' | 'digest-mismatch';
export type SavedModelObservedPlacementTargetResultV1 =
  | Readonly<{
      ok: true;
      target: SavedModelObservedPlacementTargetV1;
      canonicalSha256: string;
      claims: typeof CLAIMS;
    }>
  | Readonly<{ ok: false; target: null; code: Code; detail: string }>;
class Failure extends Error {
  constructor(
    readonly code: Code,
    detail: string,
  ) {
    super(detail);
  }
}
function fail(code: Code, detail: string): never {
  throw new Failure(code, detail);
}
function failure(
  error: unknown,
): Extract<SavedModelObservedPlacementTargetResultV1, { ok: false }> {
  return Object.freeze({
    ok: false,
    target: null,
    code: error instanceof Failure ? error.code : 'invalid-input',
    detail: error instanceof Error ? error.message.slice(0, 1024) : 'Target metadata is invalid.',
  });
}
function checkSignal(signal?: AbortSignal) {
  if (signal !== undefined && aborted.call(signal))
    fail('cancelled', 'Target projection cancelled.');
}
/** Getter-free bounded ownership before strict existing codecs inspect nested values. */
function plain(value: unknown): unknown {
  let nodes = 0;
  const copy = (item: unknown, depth: number): unknown => {
    if (++nodes > 20_000 || depth > 32) fail('invalid-input', 'Metadata tree exceeds its bound.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string') {
      if (item.length > 16_384) fail('invalid-input', 'Metadata string exceeds its bound.');
      return item;
    }
    if (!item || typeof item !== 'object') fail('invalid-input', 'Expected finite plain metadata.');
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (
      prototype !== (array ? Array.prototype : Object.prototype) &&
      !(prototype === null && !array)
    )
      fail('invalid-input', 'Metadata prototype is invalid.');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors).filter((key) => !(array && key === 'length'));
    if (keys.some((key) => typeof key !== 'string'))
      fail('invalid-input', 'Metadata symbols are invalid.');
    if (
      array &&
      (keys.length !== descriptors.length?.value ||
        keys.some((key, index) => key !== String(index)))
    )
      fail('invalid-input', 'Metadata arrays must be dense and exact.');
    const entries = (array ? (keys as string[]) : (keys as string[]).sort()).map((key) => {
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !('value' in descriptor))
        fail('invalid-input', 'Metadata accessors and hidden fields are invalid.');
      return [key, copy(descriptor.value, depth + 1)] as const;
    });
    return array ? entries.map(([, value]) => value) : Object.fromEntries(entries);
  };
  const copied = copy(value, 0);
  if (encoder.encode(JSON.stringify(copied)).byteLength > MAX_BYTES)
    fail('invalid-input', 'Metadata exceeds its byte bound.');
  return copied;
}
function canonical(value: unknown): string {
  // Standard JSON normalizes metadata -0 to 0; raw Float32 geometry hashes remain bit-exact.
  return JSON.stringify(plain(value));
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-input', 'Expected an exact record.');
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)))
    fail('invalid-input', 'Metadata has unexpected or missing fields.');
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 16_384): string {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > maximum)
    fail('invalid-input', 'Expected bounded nonempty identity text.');
  return value;
}
function sha(value: unknown): string {
  if (typeof value !== 'string' || !SHA.test(value))
    fail('invalid-input', 'Expected lowercase SHA-256.');
  return value;
}
function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    fail('invalid-input', 'Metadata count or identity is out of bounds.');
  return value;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
async function hash(value: unknown): Promise<string> {
  return sha(await sha256Hex(encoder.encode(canonical(value))));
}
async function validate(value: unknown): Promise<SavedModelObservedPlacementTargetV1> {
  const target = exact(plain(value), [
    'kind',
    'persistedModel',
    'displayedModel',
    'canonicalMeasurementsSha256',
    'pose',
    'geometry',
    'frame',
  ]);
  if (target.kind !== SAVED_MODEL_OBSERVED_PLACEMENT_TARGET_V1)
    fail('invalid-input', 'Unsupported target kind.');
  const persisted = exact(target.persistedModel, ['id', 'updatedAt', 'revision']);
  const id = integer(persisted.id, 1, Number.MAX_SAFE_INTEGER);
  const updatedAt = text(persisted.updatedAt, 256);
  if (persisted.revision !== `common-model/v1;id=${id};updatedAt=${encodeURIComponent(updatedAt)}`)
    fail('invalid-input', 'Persisted model revision differs from its exact identity.');
  const displayed = exact(target.displayedModel, [
    'modelId',
    'modelContentRevision',
    'basisKind',
    'inputFingerprint',
    'bodyBuildFingerprint',
    'runtimeSourceRevision',
  ]);
  for (const field of Object.values(displayed)) text(field);
  if (
    displayed.modelId !== `tech-card-base-model:${id}` ||
    !['neutral', 'female', 'male'].includes(String(displayed.basisKind))
  )
    fail('invalid-input', 'Displayed model identity or basis differs.');
  sha(target.canonicalMeasurementsSha256);
  const pose = exact(target.pose, ['document', 'canonicalSha256']);
  const document = decodeModelMannequinPoseDocumentV2(pose.document);
  // Reuse strict codec, but refuse its legacy upgrade/normalization in a current exact target.
  if (canonical(document) !== canonical(pose.document))
    fail('invalid-input', 'Pose document must already be exact current V2.');
  if (
    `sha256:${sha(pose.canonicalSha256)}` !==
    (await fingerprintModelMannequinPoseDocumentV2(document))
  )
    fail('digest-mismatch', 'Canonical pose digest differs from the strict pose document.');
  const geometry = exact(target.geometry, [
    'positionsFloat32LeSha256',
    'trianglesUint32LeSha256',
    'vertexCount',
    'triangleCount',
    'byteLength',
  ]);
  sha(geometry.positionsFloat32LeSha256);
  sha(geometry.trianglesUint32LeSha256);
  const vertices = integer(geometry.vertexCount, 3, 20_000);
  const triangles = integer(geometry.triangleCount, 1, 30_000);
  if (geometry.byteLength !== (vertices + triangles) * 12)
    fail('invalid-input', 'Geometry counts and bytes differ.');
  const frame = exact(target.frame, [
    'version',
    'id',
    'revision',
    'sourceRevision',
    'units',
    'coordinateSystem',
    'canonicalSha256',
  ]);
  if (
    frame.version !== 'measurement-body-frame/v2' ||
    frame.id !== 'measurement-body-frame-v2' ||
    frame.revision !== 'measurement-body-frame-v2.0.1' ||
    frame.units !== 'm' ||
    frame.sourceRevision !== displayed.runtimeSourceRevision ||
    canonical(frame.coordinateSystem) !== canonical(COORDINATES)
  )
    fail('invalid-input', 'Coordinate-frame identity or runtime source differs.');
  sha(frame.canonicalSha256);
  return freeze(target as unknown as SavedModelObservedPlacementTargetV1);
}
async function result(target: SavedModelObservedPlacementTargetV1) {
  return Object.freeze({
    ok: true as const,
    target,
    canonicalSha256: await hash([SAVED_MODEL_OBSERVED_PLACEMENT_TARGET_V1, target]),
    claims: CLAIMS,
  });
}

/** Metadata validation only: omitted body bytes and full frame must be reprojected before use. */
export async function validateSavedModelObservedPlacementTargetV1(
  value: unknown,
  expectedCanonicalSha256: string,
  signal?: AbortSignal,
): Promise<SavedModelObservedPlacementTargetResultV1> {
  try {
    checkSignal(signal);
    const expected = sha(expectedCanonicalSha256);
    const target = await validate(value);
    checkSignal(signal);
    const checked = await result(target);
    checkSignal(signal);
    if (checked.canonicalSha256 !== expected)
      fail('digest-mismatch', 'Target canonical digest differs.');
    return checked;
  } catch (error) {
    return failure(error);
  }
}

export async function encodeSavedModelObservedPlacementTargetV1(
  value: unknown,
  expectedCanonicalSha256: string,
  signal?: AbortSignal,
): Promise<
  | Readonly<{ ok: true; bytes: Uint8Array }>
  | Extract<SavedModelObservedPlacementTargetResultV1, { ok: false }>
> {
  const checked = await validateSavedModelObservedPlacementTargetV1(
    value,
    expectedCanonicalSha256,
    signal,
  );
  if (!checked.ok) return checked;
  try {
    checkSignal(signal);
    const bytes = encoder.encode(
      canonical({ target: checked.target, canonicalSha256: checked.canonicalSha256 }),
    );
    if (bytes.byteLength > MAX_BYTES)
      fail('invalid-input', 'Target envelope exceeds its byte bound.');
    return Object.freeze({ ok: true, bytes });
  } catch (error) {
    return failure(error);
  }
}
export async function decodeSavedModelObservedPlacementTargetV1(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<SavedModelObservedPlacementTargetResultV1> {
  try {
    checkSignal(signal);
    if (
      !(bytes instanceof Uint8Array) ||
      Object.getPrototypeOf(bytes) !== Uint8Array.prototype ||
      bytes.byteLength > MAX_BYTES ||
      !(bytes.buffer instanceof ArrayBuffer)
    )
      fail('invalid-input', 'Expected bounded owned UTF-8 bytes.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice());
    const envelope = exact(plain(JSON.parse(text)), ['target', 'canonicalSha256']);
    if (canonical(envelope) !== text)
      fail('invalid-input', 'Target envelope is not canonical JSON.');
    const checked = await validateSavedModelObservedPlacementTargetV1(
      envelope.target,
      sha(envelope.canonicalSha256),
      signal,
    );
    checkSignal(signal);
    return checked;
  } catch (error) {
    return failure(error);
  }
}

/** Pure implementation helpers shared only with the genuine owner projector; none grants authority. */
export const savedModelObservedPlacementTargetCodecInternalsV1 = Object.freeze({
  Failure,
  fail,
  failure,
  checkSignal,
  plain,
  canonical,
  hash,
  validate,
  result,
  aborted,
});
