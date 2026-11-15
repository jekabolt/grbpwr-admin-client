import type { BodyPoseKind } from './contracts';
import {
  CANONICAL_BODY_MEASUREMENTS_VERSION,
  CANONICAL_MEASUREMENT_PLAUSIBILITY_MM,
  validateCanonicalMeasurementCorrelations,
  type CanonicalBodyMeasurementsMm,
  type CanonicalMeasurementKey,
} from './measurement-adapter';
import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
  type MeasurementSurfaceSelfIntersectionPolicyV1,
  type MeasurementSurfaceSelfIntersectionReportV1,
} from './measurement-surface-self-intersection-v1';
import {
  createMeasurementWatertightSurfaceV1,
  MEASUREMENT_WATERTIGHT_SURFACE_V1,
  type MeasurementWatertightSurfaceArtifactV1,
} from './measurement-watertight-surface-v1';

export const MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_V1 =
  'measurement-watertight-surface-evidence/v1' as const;
export const MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_SEAL_V2 =
  'measurement-watertight-surface-evidence-seal/v2' as const;
export const MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_ENCODING_V2 =
  'measurement-watertight-surface-exact-binary/v2' as const;
export const MEASUREMENT_WATERTIGHT_SURFACE_IMMUTABLE_SNAPSHOT_V2 =
  'measurement-watertight-surface-immutable-snapshot/v2' as const;
export const MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_HASH_ALGORITHM_V1 = 'SHA-256' as const;
export const MEASUREMENT_SURFACE_SELF_INTERSECTION_SOURCE_SHA256_V1 =
  '1f53c082e5e5b6b9340359a11323d17d0f116c9bc8aad907f9a853671bee9e98' as const;
export const MEASUREMENT_SURFACE_CLEAN_CORPUS_AUDIT_V1 =
  'measurement-surface-clean-corpus/2026-11-12' as const;

export const MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_DOMAINS_V2 = Object.freeze({
  input: 'grbpwr.measurement-watertight-surface-evidence/v1/exact-binary-v2/input',
  surface: 'grbpwr.measurement-watertight-surface-evidence/v1/exact-binary-v2/surface',
  displayReport: 'grbpwr.measurement-watertight-surface-evidence/v1/exact-binary-v2/display-report',
  collisionCandidateReport:
    'grbpwr.measurement-watertight-surface-evidence/v1/exact-binary-v2/collision-candidate-report',
  binding: 'grbpwr.measurement-watertight-surface-evidence/v1/exact-binary-v2/binding',
  aggregate: 'grbpwr.measurement-watertight-surface-evidence/v1/exact-binary-v2/aggregate',
} as const);

export interface MeasurementWatertightSurfaceEvidenceInputV1 {
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly sourceRevision: string;
  readonly pose: BodyPoseKind;
}

export interface MeasurementWatertightSurfaceEvidenceClaimsV1 {
  readonly surfaceTechnicalEvidenceComplete: true;
  readonly technicalCollisionCandidateEligible: true;
  readonly admission: false;
  readonly collisionReady: false;
  readonly runtimeCollisionEligible: false;
  readonly runtimeIntegrated: false;
  readonly fitClaimEligible: false;
  readonly surfaceIsCollisionAuthority: false;
  readonly collisionAuthority: 'body-artifact-collision-lods';
}

export interface MeasurementWatertightSurfaceEvidenceDependencyV1 {
  readonly surfaceVersion: typeof MEASUREMENT_WATERTIGHT_SURFACE_V1;
  readonly surfaceRevision: 'measurement-watertight-surface-v1.0.1';
  readonly validatorVersion: typeof MEASUREMENT_SURFACE_SELF_INTERSECTION_V1;
  readonly validatorSourceSha256: typeof MEASUREMENT_SURFACE_SELF_INTERSECTION_SOURCE_SHA256_V1;
  readonly validatorPolicy: MeasurementSurfaceSelfIntersectionPolicyV1;
  readonly corpusAudit: typeof MEASUREMENT_SURFACE_CLEAN_CORPUS_AUDIT_V1;
  readonly corpusReportCount: 64;
  readonly corpusIntersectionCount: 0;
}

export interface MeasurementWatertightSurfaceEvidenceReportsV1 {
  readonly display: MeasurementSurfaceSelfIntersectionReportV1;
  readonly collisionCandidate: MeasurementSurfaceSelfIntersectionReportV1;
}

export interface MeasurementWatertightSurfaceCanonicalBytesV2 {
  readonly encoding: 'base64';
  readonly scalar: 'float32' | 'uint32';
  readonly byteOrder: 'big-endian';
  readonly elementCount: number;
  readonly byteLength: number;
  readonly base64: string;
}

export interface MeasurementWatertightSurfaceImmutableMeshV2 {
  readonly positions: MeasurementWatertightSurfaceCanonicalBytesV2;
  readonly indices: MeasurementWatertightSurfaceCanonicalBytesV2;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly byteLength: number;
}

export interface MeasurementWatertightSurfaceImmutableLodV2 {
  readonly id: 'display' | 'collision-candidate';
  readonly mesh: MeasurementWatertightSurfaceImmutableMeshV2;
  readonly grid: MeasurementWatertightSurfaceArtifactV1['lods']['display']['grid'];
  readonly topology: MeasurementWatertightSurfaceArtifactV1['lods']['display']['topology'];
}

export interface MeasurementWatertightSurfaceImmutableSnapshotV2 {
  readonly format: typeof MEASUREMENT_WATERTIGHT_SURFACE_IMMUTABLE_SNAPSHOT_V2;
  readonly version: typeof MEASUREMENT_WATERTIGHT_SURFACE_V1;
  readonly id: MeasurementWatertightSurfaceArtifactV1['id'];
  readonly revision: MeasurementWatertightSurfaceArtifactV1['revision'];
  readonly units: MeasurementWatertightSurfaceArtifactV1['units'];
  readonly pose: BodyPoseKind;
  readonly sourceRevision: string;
  readonly frameRevision: string;
  readonly policy: MeasurementWatertightSurfaceArtifactV1['policy'];
  readonly lods: {
    readonly display: MeasurementWatertightSurfaceImmutableLodV2;
    readonly collisionCandidate: MeasurementWatertightSurfaceImmutableLodV2;
  };
  readonly closure: MeasurementWatertightSurfaceArtifactV1['closure'];
  readonly provenance: MeasurementWatertightSurfaceArtifactV1['provenance'];
  readonly claims: MeasurementWatertightSurfaceArtifactV1['claims'];
  readonly identity: MeasurementWatertightSurfaceArtifactV1['identity'];
}

export interface MeasurementWatertightSurfaceEvidenceBindingV1 {
  readonly canonicalSchemaVersion: typeof CANONICAL_BODY_MEASUREMENTS_VERSION;
  readonly sourceRevision: string;
  readonly pose: BodyPoseKind;
  readonly surfaceId: 'measurement-watertight-surface-v1';
  readonly surfaceRevision: 'measurement-watertight-surface-v1.0.1';
  readonly frameRevision: string;
  readonly validatorVersion: typeof MEASUREMENT_SURFACE_SELF_INTERSECTION_V1;
  readonly validatorSourceSha256: typeof MEASUREMENT_SURFACE_SELF_INTERSECTION_SOURCE_SHA256_V1;
  readonly lodOrder: readonly ['display', 'collision-candidate'];
  readonly displayRole: 'display';
  readonly collisionCandidateRole: 'collision-candidate';
}

export interface MeasurementWatertightSurfaceEvidenceDigestsV1 {
  readonly inputSha256: string;
  readonly surfaceSha256: string;
  readonly displayReportSha256: string;
  readonly collisionCandidateReportSha256: string;
  readonly bindingSha256: string;
}

export interface MeasurementWatertightSurfaceEvidenceSealV1 {
  readonly version: typeof MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_SEAL_V2;
  readonly algorithm: typeof MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_HASH_ALGORITHM_V1;
  readonly encoding: typeof MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_ENCODING_V2;
  readonly digests: MeasurementWatertightSurfaceEvidenceDigestsV1;
  readonly aggregateSha256: string;
}

export interface MeasurementWatertightSurfaceEvidenceV1 {
  readonly version: typeof MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_V1;
  readonly encoding: typeof MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_ENCODING_V2;
  readonly input: MeasurementWatertightSurfaceEvidenceInputV1;
  readonly surface: MeasurementWatertightSurfaceImmutableSnapshotV2;
  readonly reports: MeasurementWatertightSurfaceEvidenceReportsV1;
  readonly dependency: MeasurementWatertightSurfaceEvidenceDependencyV1;
  readonly binding: MeasurementWatertightSurfaceEvidenceBindingV1;
  readonly claims: MeasurementWatertightSurfaceEvidenceClaimsV1;
  readonly seal: MeasurementWatertightSurfaceEvidenceSealV1;
}

export type MeasurementWatertightSurfaceEvidenceFailureCodeV1 =
  | 'input-invalid'
  | 'sha256-unavailable'
  | 'construction-failed'
  | 'self-intersection-failed'
  | 'evidence-invalid'
  | 'expected-rebuild-failed';

export interface MeasurementWatertightSurfaceEvidenceFailureV1 {
  readonly ok: false;
  readonly code: MeasurementWatertightSurfaceEvidenceFailureCodeV1;
  readonly errors: readonly string[];
}

export type BuildMeasurementWatertightSurfaceEvidenceResultV1 =
  | { readonly ok: true; readonly evidence: MeasurementWatertightSurfaceEvidenceV1 }
  | MeasurementWatertightSurfaceEvidenceFailureV1;

export type ValidateMeasurementWatertightSurfaceEvidenceResultV1 =
  | { readonly ok: true; readonly rebuilt: MeasurementWatertightSurfaceEvidenceV1 }
  | MeasurementWatertightSurfaceEvidenceFailureV1;

export interface MeasurementWatertightSurfaceEvidenceCryptoOptionsV1 {
  readonly crypto?: Crypto | null;
}

const REQUIRED_MEASUREMENT_KEYS = Object.freeze([
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'armLengthMm',
  'inseamMm',
] as const satisfies readonly CanonicalMeasurementKey[]);
const CANONICAL_MEASUREMENT_KEYS = new Set([
  'schemaVersion',
  ...Object.keys(CANONICAL_MEASUREMENT_PLAUSIBILITY_MM),
]);
const INPUT_KEYS = new Set(['measurements', 'sourceRevision', 'pose']);
const EVIDENCE_KEYS = new Set([
  'version',
  'encoding',
  'input',
  'surface',
  'reports',
  'dependency',
  'binding',
  'claims',
  'seal',
]);
const REPORTS_KEYS = new Set(['display', 'collisionCandidate']);
const SURFACE_KEYS = new Set([
  'format',
  'version',
  'id',
  'revision',
  'units',
  'pose',
  'sourceRevision',
  'frameRevision',
  'policy',
  'lods',
  'closure',
  'provenance',
  'claims',
  'identity',
]);
const LODS_KEYS = new Set(['display', 'collisionCandidate']);
const LOD_KEYS = new Set(['id', 'mesh', 'grid', 'topology']);
const MESH_KEYS = new Set(['positions', 'indices', 'vertexCount', 'triangleCount', 'byteLength']);
const CANONICAL_BYTES_KEYS = new Set([
  'encoding',
  'scalar',
  'byteOrder',
  'elementCount',
  'byteLength',
  'base64',
]);
const DEPENDENCY_KEYS = new Set([
  'surfaceVersion',
  'surfaceRevision',
  'validatorVersion',
  'validatorSourceSha256',
  'validatorPolicy',
  'corpusAudit',
  'corpusReportCount',
  'corpusIntersectionCount',
]);
const BINDING_KEYS = new Set([
  'canonicalSchemaVersion',
  'sourceRevision',
  'pose',
  'surfaceId',
  'surfaceRevision',
  'frameRevision',
  'validatorVersion',
  'validatorSourceSha256',
  'lodOrder',
  'displayRole',
  'collisionCandidateRole',
]);
const CLAIM_KEYS = new Set([
  'surfaceTechnicalEvidenceComplete',
  'technicalCollisionCandidateEligible',
  'admission',
  'collisionReady',
  'runtimeCollisionEligible',
  'runtimeIntegrated',
  'fitClaimEligible',
  'surfaceIsCollisionAuthority',
  'collisionAuthority',
]);
const SEAL_KEYS = new Set(['version', 'algorithm', 'encoding', 'digests', 'aggregateSha256']);
const DIGEST_KEYS: ReadonlySet<keyof MeasurementWatertightSurfaceEvidenceDigestsV1> = new Set([
  'inputSha256',
  'surfaceSha256',
  'displayReportSha256',
  'collisionCandidateReportSha256',
  'bindingSha256',
]);
const SHA256_HEX = /^[0-9a-f]{64}$/;
const MAX_DEPTH = 48;
const MAX_NODES = 500_000;
const MAX_ARRAY_LENGTH = 2_000_000;
const MAX_OBJECT_KEYS = 256;
const MAX_STRING_BYTES = 32 * 1024 * 1024;
const MAX_TYPED_ARRAY_ELEMENTS = 2_000_000;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const textEncoder = new TextEncoder();
const textEncoderEncode = TextEncoder.prototype.encode;
const stringCharCodeAt = String.prototype.charCodeAt;
const stringTrim = String.prototype.trim;
const arrayBufferSlice = ArrayBuffer.prototype.slice;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
)?.get;
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteOffset',
)?.get;
const typedArrayLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get;

interface SnapshotBudget {
  nodes: number;
  bytes: number;
  readonly seen: Set<object>;
}

type Sha256DigestMethod = (
  algorithm: string,
  data: Uint8Array<ArrayBuffer>,
) => Promise<ArrayBuffer>;

interface TrustedSha256Provider {
  readonly crypto: Crypto;
  readonly subtle: SubtleCrypto;
  readonly digest: Sha256DigestMethod;
}

class Sha256UnavailableError extends Error {
  constructor(message = 'Web Crypto SHA-256 is unavailable.') {
    super(message);
    this.name = 'Sha256UnavailableError';
  }
}

const capturedGlobalCrypto = globalThis.crypto;
const capturedGlobalSubtle = capturedGlobalCrypto?.subtle;
const capturedGlobalDigest = capturedGlobalSubtle?.digest as Sha256DigestMethod | undefined;
const capturedSha256Provider: TrustedSha256Provider | undefined =
  capturedGlobalCrypto && capturedGlobalSubtle && capturedGlobalDigest
    ? Object.freeze({
        crypto: capturedGlobalCrypto,
        subtle: capturedGlobalSubtle,
        digest: capturedGlobalDigest,
      })
    : undefined;
const SHA256_KNOWN_ANSWER_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
let sha256KnownAnswerPromise: Promise<boolean> | undefined;

function failure(
  code: MeasurementWatertightSurfaceEvidenceFailureCodeV1,
  errors: readonly string[],
): MeasurementWatertightSurfaceEvidenceFailureV1 {
  return Object.freeze({ ok: false, code, errors: Object.freeze([...new Set(errors)]) });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown watertight-surface evidence failure.';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataObject(
  value: unknown,
  label: string,
  allowedKeys?: ReadonlySet<string>,
): Record<string, unknown> {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain data object.`);
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_OBJECT_KEYS) throw new RangeError(`${label} has too many keys.`);
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== 'string') throw new TypeError(`${label} must not contain symbol keys.`);
    if (allowedKeys && !allowedKeys.has(key)) {
      throw new TypeError(`${label} contains an unsupported key.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${label}.${key} must be enumerable plain data.`);
    }
    Object.defineProperty(result, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function assertExactKeys(value: unknown, label: string, expected: ReadonlySet<string>): void {
  const data = ownDataObject(value, label, expected);
  if ([...expected].some((key) => !(key in data))) {
    throw new TypeError(`${label} is missing required keys.`);
  }
}

function utf8Bytes(value: string, label: string, maximumCodeUnits = MAX_STRING_BYTES): Uint8Array {
  if (value.length > maximumCodeUnits) throw new RangeError(`${label} is too long.`);
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = Reflect.apply(stringCharCodeAt, value, [index]) as number;
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) {
        throw new TypeError(`${label} must contain well-formed Unicode.`);
      }
      const next = Reflect.apply(stringCharCodeAt, value, [index + 1]) as number;
      if (next < 0xdc00 || next > 0xdfff) {
        throw new TypeError(`${label} must contain well-formed Unicode.`);
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError(`${label} must contain well-formed Unicode.`);
    }
  }
  const bytes = Reflect.apply(textEncoderEncode, textEncoder, [value]) as Uint8Array;
  if (bytes.byteLength > MAX_STRING_BYTES) throw new RangeError(`${label} is too long.`);
  return bytes;
}

function safeArrayValues(value: readonly unknown[], label: string): readonly unknown[] {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor?.value;
  if (!lengthDescriptor || !('value' in lengthDescriptor) || !Number.isSafeInteger(length)) {
    throw new TypeError(`${label}.length is invalid.`);
  }
  if (length > MAX_ARRAY_LENGTH) throw new RangeError(`${label} is too long.`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) throw new TypeError(`${label} must be a dense plain array.`);
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${label} must contain enumerable data elements.`);
    }
    result.push(descriptor.value);
  }
  if (keys.some((key) => typeof key !== 'string' || (key !== 'length' && !/^\d+$/.test(key)))) {
    throw new TypeError(`${label} has unsupported array properties.`);
  }
  return result;
}

function addBudget(budget: SnapshotBudget, bytes: number, label: string): void {
  budget.bytes += bytes;
  if (budget.bytes > MAX_TOTAL_BYTES) throw new RangeError(`${label} exceeds the byte budget.`);
}

function snapshotData(
  value: unknown,
  label = 'value',
  budget: SnapshotBudget = { nodes: 0, bytes: 0, seen: new Set<object>() },
  depth = 0,
): unknown {
  if (depth > MAX_DEPTH) throw new RangeError(`${label} exceeds the maximum depth.`);
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES) throw new RangeError(`${label} exceeds the node budget.`);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
    addBudget(budget, 8, label);
    return value;
  }
  if (typeof value === 'string') {
    const bytes = utf8Bytes(value, label);
    addBudget(budget, bytes.byteLength, label);
    return value;
  }
  if (value === undefined) throw new TypeError(`${label} must not be undefined.`);
  if (!value || typeof value !== 'object') throw new TypeError(`${label} is unsupported.`);
  if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) {
    throw new TypeError(`${label} must not use SharedArrayBuffer.`);
  }
  if (value instanceof ArrayBuffer) throw new TypeError(`${label} must not contain raw buffers.`);
  if (ArrayBuffer.isView(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Float32Array.prototype && prototype !== Uint32Array.prototype) {
      throw new TypeError(`${label} has an unsupported binary view.`);
    }
    if (
      !typedArrayBufferGetter ||
      !typedArrayByteLengthGetter ||
      !typedArrayByteOffsetGetter ||
      !typedArrayLengthGetter
    ) {
      throw new Error('Typed-array intrinsic getters are unavailable.');
    }
    const buffer = Reflect.apply(typedArrayBufferGetter, value, []) as
      ArrayBuffer | SharedArrayBuffer;
    const byteLength = Reflect.apply(typedArrayByteLengthGetter, value, []) as number;
    const byteOffset = Reflect.apply(typedArrayByteOffsetGetter, value, []) as number;
    const length = Reflect.apply(typedArrayLengthGetter, value, []) as number;
    if (!(buffer instanceof ArrayBuffer) || Reflect.ownKeys(buffer).length !== 0) {
      throw new TypeError(`${label} must use an undecorated ArrayBuffer.`);
    }
    if (length > MAX_TYPED_ARRAY_ELEMENTS) throw new RangeError(`${label} has too many lanes.`);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length || keys.some((key, index) => key !== String(index))) {
      throw new TypeError(`${label} must be an undecorated typed array.`);
    }
    addBudget(budget, byteLength, label);
    const owned = Reflect.apply(arrayBufferSlice, buffer, [
      byteOffset,
      byteOffset + byteLength,
    ]) as ArrayBuffer;
    if (prototype === Float32Array.prototype) {
      const result = new Float32Array(owned);
      for (let index = 0; index < result.length; index += 1) {
        if (!Number.isFinite(result[index])) throw new RangeError(`${label} must be finite.`);
      }
      return result;
    }
    return new Uint32Array(owned);
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new TypeError(`${label} must contain only plain data.`);
  }
  if (budget.seen.has(value)) throw new TypeError(`${label} must not contain cycles.`);
  budget.seen.add(value);
  let result: unknown;
  if (Array.isArray(value)) {
    result = safeArrayValues(value, label).map((item, index) =>
      snapshotData(item, `${label}[${index}]`, budget, depth + 1),
    );
  } else {
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_OBJECT_KEYS) throw new RangeError(`${label} has too many keys.`);
    const object = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== 'string') throw new TypeError(`${label} must not contain symbol keys.`);
      addBudget(budget, utf8Bytes(key, `${label} key`).byteLength, label);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw new TypeError(`${label}.${key} must be enumerable plain data.`);
      }
      Object.defineProperty(object, key, {
        value: snapshotData(descriptor.value, `${label}.${key}`, budget, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    result = object;
  }
  budget.seen.delete(value);
  return result;
}

function deepFreezeOwned<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  if (ArrayBuffer.isView(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreezeOwned(child, seen);
  return Object.freeze(value);
}

function snapshotInput(
  input: MeasurementWatertightSurfaceEvidenceInputV1,
): MeasurementWatertightSurfaceEvidenceInputV1 {
  const data = ownDataObject(input, 'input', INPUT_KEYS);
  if ([...INPUT_KEYS].some((key) => !(key in data))) {
    throw new TypeError('input is missing required keys.');
  }
  if (
    typeof data.sourceRevision !== 'string' ||
    !data.sourceRevision ||
    data.sourceRevision.length > 4_096 ||
    Reflect.apply(stringTrim, data.sourceRevision, []) !== data.sourceRevision
  ) {
    throw new TypeError('sourceRevision must be a non-empty bounded trimmed string.');
  }
  utf8Bytes(data.sourceRevision, 'sourceRevision', 4_096);
  if (data.pose !== 'A' && data.pose !== 'T') throw new TypeError('pose must be A or T.');
  const raw = ownDataObject(data.measurements, 'input.measurements', CANONICAL_MEASUREMENT_KEYS);
  if (raw.schemaVersion !== CANONICAL_BODY_MEASUREMENTS_VERSION) {
    throw new TypeError('canonical measurement schemaVersion is unsupported.');
  }
  for (const key of REQUIRED_MEASUREMENT_KEYS) {
    if (!(key in raw)) throw new TypeError('canonical measurements are incomplete.');
  }
  const measurements: Record<string, unknown> = {
    schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
  };
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'schemaVersion') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('canonical measurements must contain finite numbers.');
    }
    const range = CANONICAL_MEASUREMENT_PLAUSIBILITY_MM[key as CanonicalMeasurementKey];
    if (!range || value < range[0] || value > range[1]) {
      throw new RangeError('canonical measurements are outside analytical bounds.');
    }
    measurements[key] = value;
  }
  if (
    validateCanonicalMeasurementCorrelations(
      measurements as Readonly<Partial<Record<CanonicalMeasurementKey, number>>>,
    ).length > 0
  ) {
    throw new RangeError('canonical measurements fail correlation guards.');
  }
  return deepFreezeOwned({
    measurements: measurements as unknown as CanonicalBodyMeasurementsMm,
    sourceRevision: data.sourceRevision,
    pose: data.pose,
  });
}

class BinaryWriter {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;

  push(bytes: Uint8Array): void {
    this.length += bytes.byteLength;
    if (this.length > MAX_TOTAL_BYTES)
      throw new RangeError('Exact evidence encoding is too large.');
    const owned = new Uint8Array(bytes.byteLength);
    owned.set(bytes);
    this.chunks.push(owned);
  }

  byte(value: number): void {
    this.push(Uint8Array.of(value));
  }

  uint32(value: number): void {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, false);
    this.push(bytes);
  }

  float64(value: number): void {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, false);
    this.push(bytes);
  }

  finish(): Uint8Array {
    const output = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }
}

function writeString(writer: BinaryWriter, value: string): void {
  const bytes = utf8Bytes(value, 'exact string');
  writer.uint32(bytes.byteLength);
  writer.push(bytes);
}

function canonicalTypedArrayBytes(value: Float32Array | Uint32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length * 4);
  const view = new DataView(bytes.buffer);
  if (value instanceof Float32Array) {
    for (let index = 0; index < value.length; index += 1) {
      const lane = value[index];
      if (!Number.isFinite(lane)) throw new RangeError('Float32 lanes must be finite.');
      view.setFloat32(index * 4, lane, false);
    }
  } else {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint32(index * 4, value[index], false);
    }
  }
  return bytes;
}

function writeExact(writer: BinaryWriter, value: unknown): void {
  if (value === null) {
    writer.byte(0);
  } else if (value === false) {
    writer.byte(1);
  } else if (value === true) {
    writer.byte(2);
  } else if (typeof value === 'number') {
    writer.byte(3);
    writer.float64(value);
  } else if (typeof value === 'string') {
    writer.byte(4);
    writeString(writer, value);
  } else if (value instanceof Float32Array || value instanceof Uint32Array) {
    writer.byte(value instanceof Float32Array ? 7 : 8);
    writer.byte(0); // Canonical multi-byte lane order: big-endian.
    writer.uint32(value.length);
    writer.push(canonicalTypedArrayBytes(value));
  } else if (Array.isArray(value)) {
    writer.byte(5);
    writer.uint32(value.length);
    for (const item of value) writeExact(writer, item);
  } else if (isPlainObject(value)) {
    writer.byte(6);
    const keys = Object.keys(value).sort();
    writer.uint32(keys.length);
    for (const key of keys) {
      writeString(writer, key);
      writeExact(writer, value[key]);
    }
  } else {
    throw new TypeError('Exact evidence encoding received an unsupported value.');
  }
}

export function encodeMeasurementWatertightSurfaceEvidenceExactV2(value: unknown): Uint8Array {
  const snapshot = snapshotData(value, 'exact-value');
  const writer = new BinaryWriter();
  writeString(writer, MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_ENCODING_V2);
  writeExact(writer, snapshot);
  return writer.finish();
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Encode(bytes: Uint8Array): string {
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const a = bytes[offset];
    const hasB = offset + 1 < bytes.length;
    const hasC = offset + 2 < bytes.length;
    const b = hasB ? bytes[offset + 1] : 0;
    const c = hasC ? bytes[offset + 2] : 0;
    output += BASE64_ALPHABET[a >>> 2];
    output += BASE64_ALPHABET[((a & 0x03) << 4) | (b >>> 4)];
    output += hasB ? BASE64_ALPHABET[((b & 0x0f) << 2) | (c >>> 6)] : '=';
    output += hasC ? BASE64_ALPHABET[c & 0x3f] : '=';
  }
  return output;
}

function immutableCanonicalBytes(
  value: Float32Array | Uint32Array,
): MeasurementWatertightSurfaceCanonicalBytesV2 {
  const bytes = canonicalTypedArrayBytes(value);
  return Object.freeze({
    encoding: 'base64',
    scalar: value instanceof Float32Array ? 'float32' : 'uint32',
    byteOrder: 'big-endian',
    elementCount: value.length,
    byteLength: bytes.byteLength,
    base64: base64Encode(bytes),
  });
}

function immutableLodSnapshot(
  lod: MeasurementWatertightSurfaceArtifactV1['lods']['display'],
): MeasurementWatertightSurfaceImmutableLodV2 {
  const positions = immutableCanonicalBytes(lod.mesh.positions);
  const indices = immutableCanonicalBytes(lod.mesh.indices);
  if (
    positions.elementCount !== lod.mesh.vertexCount * 3 ||
    indices.elementCount !== lod.mesh.triangleCount * 3 ||
    positions.byteLength + indices.byteLength !== lod.mesh.byteLength
  ) {
    throw new TypeError('Surface mesh counts do not match its canonical byte snapshot.');
  }
  return deepFreezeOwned({
    id: lod.id,
    mesh: {
      positions,
      indices,
      vertexCount: lod.mesh.vertexCount,
      triangleCount: lod.mesh.triangleCount,
      byteLength: lod.mesh.byteLength,
    },
    grid: snapshotData(lod.grid, `surface.lods.${lod.id}.grid`),
    topology: snapshotData(lod.topology, `surface.lods.${lod.id}.topology`),
  }) as MeasurementWatertightSurfaceImmutableLodV2;
}

function immutableSurfaceSnapshot(
  surface: MeasurementWatertightSurfaceArtifactV1,
): MeasurementWatertightSurfaceImmutableSnapshotV2 {
  return deepFreezeOwned({
    format: MEASUREMENT_WATERTIGHT_SURFACE_IMMUTABLE_SNAPSHOT_V2,
    version: surface.version,
    id: surface.id,
    revision: surface.revision,
    units: surface.units,
    pose: surface.pose,
    sourceRevision: surface.sourceRevision,
    frameRevision: surface.frameRevision,
    policy: snapshotData(surface.policy, 'surface.policy'),
    lods: {
      display: immutableLodSnapshot(surface.lods.display),
      collisionCandidate: immutableLodSnapshot(surface.lods.collisionCandidate),
    },
    closure: snapshotData(surface.closure, 'surface.closure'),
    provenance: snapshotData(surface.provenance, 'surface.provenance'),
    claims: snapshotData(surface.claims, 'surface.claims'),
    identity: snapshotData(surface.identity, 'surface.identity'),
  }) as MeasurementWatertightSurfaceImmutableSnapshotV2;
}

function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function selectedCryptoProvider(
  options: MeasurementWatertightSurfaceEvidenceCryptoOptionsV1,
): TrustedSha256Provider | undefined {
  const data = ownDataObject(options, 'cryptoOptions', new Set(['crypto']));
  if (!Object.prototype.hasOwnProperty.call(data, 'crypto')) return capturedSha256Provider;
  if (data.crypto === null) return undefined;
  if (!capturedSha256Provider || data.crypto !== capturedSha256Provider.crypto) {
    throw new TypeError('Only the captured global Web Crypto provider is trusted.');
  }
  return capturedSha256Provider;
}

async function digestSha256(
  provider: TrustedSha256Provider,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  let result: ArrayBuffer;
  try {
    result = (await Reflect.apply(provider.digest, provider.subtle, [
      MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_HASH_ALGORITHM_V1,
      bytes,
    ])) as ArrayBuffer;
  } catch {
    throw new Sha256UnavailableError('Web Crypto SHA-256 digest failed.');
  }
  if (!(result instanceof ArrayBuffer) || result.byteLength !== 32) {
    throw new Sha256UnavailableError('Web Crypto SHA-256 returned an invalid digest.');
  }
  return new Uint8Array(result);
}

async function trustedCryptoProvider(
  options: MeasurementWatertightSurfaceEvidenceCryptoOptionsV1,
): Promise<TrustedSha256Provider | undefined> {
  const provider = selectedCryptoProvider(options);
  if (!provider) return undefined;
  if (!sha256KnownAnswerPromise) {
    sha256KnownAnswerPromise = (async () => {
      try {
        const bytes = new Uint8Array(3);
        bytes.set(Reflect.apply(textEncoderEncode, textEncoder, ['abc']) as Uint8Array);
        return bytesHex(await digestSha256(provider, bytes)) === SHA256_KNOWN_ANSWER_ABC;
      } catch {
        return false;
      }
    })();
  }
  return (await sha256KnownAnswerPromise) ? provider : undefined;
}

async function sha256Domain(
  domain: string,
  payload: unknown,
  crypto: TrustedSha256Provider,
): Promise<string> {
  const encoded = encodeMeasurementWatertightSurfaceEvidenceExactV2({ domain, payload });
  const owned = new Uint8Array(encoded.byteLength);
  owned.set(encoded);
  return bytesHex(await digestSha256(crypto, owned));
}

function dependencySnapshot(): MeasurementWatertightSurfaceEvidenceDependencyV1 {
  return deepFreezeOwned({
    surfaceVersion: MEASUREMENT_WATERTIGHT_SURFACE_V1,
    surfaceRevision: 'measurement-watertight-surface-v1.0.1',
    validatorVersion: MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
    validatorSourceSha256: MEASUREMENT_SURFACE_SELF_INTERSECTION_SOURCE_SHA256_V1,
    validatorPolicy: snapshotData(
      DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
      'validatorPolicy',
    ) as MeasurementSurfaceSelfIntersectionPolicyV1,
    corpusAudit: MEASUREMENT_SURFACE_CLEAN_CORPUS_AUDIT_V1,
    corpusReportCount: 64,
    corpusIntersectionCount: 0,
  });
}

function cleanReport(report: MeasurementSurfaceSelfIntersectionReportV1): boolean {
  return (
    report.version === MEASUREMENT_SURFACE_SELF_INTERSECTION_V1 &&
    report.passed === true &&
    report.intersectionCount === 0 &&
    report.intersections.length === 0 &&
    report.blockers.length === 0
  );
}

async function computeSeal(
  evidence: Omit<MeasurementWatertightSurfaceEvidenceV1, 'seal'>,
  crypto: TrustedSha256Provider,
): Promise<MeasurementWatertightSurfaceEvidenceSealV1> {
  const digests: MeasurementWatertightSurfaceEvidenceDigestsV1 = {
    inputSha256: await sha256Domain(
      MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_DOMAINS_V2.input,
      evidence.input,
      crypto,
    ),
    surfaceSha256: await sha256Domain(
      MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_DOMAINS_V2.surface,
      evidence.surface,
      crypto,
    ),
    displayReportSha256: await sha256Domain(
      MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_DOMAINS_V2.displayReport,
      evidence.reports.display,
      crypto,
    ),
    collisionCandidateReportSha256: await sha256Domain(
      MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_DOMAINS_V2.collisionCandidateReport,
      evidence.reports.collisionCandidate,
      crypto,
    ),
    bindingSha256: await sha256Domain(
      MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_DOMAINS_V2.binding,
      evidence.binding,
      crypto,
    ),
  };
  return deepFreezeOwned({
    version: MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_SEAL_V2,
    algorithm: MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_HASH_ALGORITHM_V1,
    encoding: MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_ENCODING_V2,
    digests,
    aggregateSha256: await sha256Domain(
      MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_DOMAINS_V2.aggregate,
      {
        version: evidence.version,
        encoding: evidence.encoding,
        dependency: evidence.dependency,
        claims: evidence.claims,
        digests,
      },
      crypto,
    ),
  });
}

function exactEqual(left: unknown, right: unknown): boolean {
  const a = encodeMeasurementWatertightSurfaceEvidenceExactV2(left);
  const b = encodeMeasurementWatertightSurfaceEvidenceExactV2(right);
  return a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]);
}

function preflightCanonicalBytes(
  value: MeasurementWatertightSurfaceCanonicalBytesV2,
  scalar: MeasurementWatertightSurfaceCanonicalBytesV2['scalar'],
  label: string,
): void {
  assertExactKeys(value, label, CANONICAL_BYTES_KEYS);
  if (
    value.encoding !== 'base64' ||
    value.scalar !== scalar ||
    value.byteOrder !== 'big-endian' ||
    !Number.isSafeInteger(value.elementCount) ||
    value.elementCount < 0 ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength !== value.elementCount * 4 ||
    typeof value.base64 !== 'string' ||
    value.base64.length !== Math.ceil(value.byteLength / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.base64)
  ) {
    throw new TypeError(`${label} is not canonical immutable scalar data.`);
  }
}

function preflightImmutableLod(
  value: MeasurementWatertightSurfaceImmutableLodV2,
  role: MeasurementWatertightSurfaceImmutableLodV2['id'],
  label: string,
): void {
  assertExactKeys(value, label, LOD_KEYS);
  assertExactKeys(value.mesh, `${label}.mesh`, MESH_KEYS);
  if (value.id !== role) throw new TypeError(`${label} role mismatch.`);
  preflightCanonicalBytes(value.mesh.positions, 'float32', `${label}.mesh.positions`);
  preflightCanonicalBytes(value.mesh.indices, 'uint32', `${label}.mesh.indices`);
  if (
    !Number.isSafeInteger(value.mesh.vertexCount) ||
    !Number.isSafeInteger(value.mesh.triangleCount) ||
    value.mesh.positions.elementCount !== value.mesh.vertexCount * 3 ||
    value.mesh.indices.elementCount !== value.mesh.triangleCount * 3 ||
    value.mesh.byteLength !== value.mesh.positions.byteLength + value.mesh.indices.byteLength
  ) {
    throw new TypeError(`${label}.mesh counts do not match its canonical bytes.`);
  }
}

function preflightEvidence(
  value: unknown,
): asserts value is MeasurementWatertightSurfaceEvidenceV1 {
  assertExactKeys(value, 'evidence', EVIDENCE_KEYS);
  const evidence = value as unknown as MeasurementWatertightSurfaceEvidenceV1;
  assertExactKeys(evidence.input, 'evidence.input', INPUT_KEYS);
  assertExactKeys(evidence.surface, 'evidence.surface', SURFACE_KEYS);
  assertExactKeys(evidence.surface.lods, 'evidence.surface.lods', LODS_KEYS);
  preflightImmutableLod(evidence.surface.lods.display, 'display', 'evidence.surface.lods.display');
  preflightImmutableLod(
    evidence.surface.lods.collisionCandidate,
    'collision-candidate',
    'evidence.surface.lods.collisionCandidate',
  );
  assertExactKeys(evidence.reports, 'evidence.reports', REPORTS_KEYS);
  assertExactKeys(evidence.dependency, 'evidence.dependency', DEPENDENCY_KEYS);
  assertExactKeys(evidence.binding, 'evidence.binding', BINDING_KEYS);
  assertExactKeys(evidence.claims, 'evidence.claims', CLAIM_KEYS);
  assertExactKeys(evidence.seal, 'evidence.seal', SEAL_KEYS);
  assertExactKeys(evidence.seal.digests, 'evidence.seal.digests', DIGEST_KEYS);
  snapshotInput(evidence.input);
  if (
    evidence.version !== MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_V1 ||
    evidence.encoding !== MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_ENCODING_V2
  ) {
    throw new TypeError('Evidence version or encoding mismatch.');
  }
  if (
    evidence.dependency.surfaceVersion !== MEASUREMENT_WATERTIGHT_SURFACE_V1 ||
    evidence.dependency.surfaceRevision !== 'measurement-watertight-surface-v1.0.1' ||
    evidence.dependency.validatorVersion !== MEASUREMENT_SURFACE_SELF_INTERSECTION_V1 ||
    evidence.dependency.validatorSourceSha256 !==
      MEASUREMENT_SURFACE_SELF_INTERSECTION_SOURCE_SHA256_V1 ||
    evidence.dependency.corpusAudit !== MEASUREMENT_SURFACE_CLEAN_CORPUS_AUDIT_V1 ||
    evidence.dependency.corpusReportCount !== 64 ||
    evidence.dependency.corpusIntersectionCount !== 0 ||
    !exactEqual(
      evidence.dependency.validatorPolicy,
      DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
    )
  ) {
    throw new TypeError('Evidence dependency mismatch.');
  }
  const claims = evidence.claims;
  if (
    claims.surfaceTechnicalEvidenceComplete !== true ||
    claims.technicalCollisionCandidateEligible !== true ||
    claims.admission !== false ||
    claims.collisionReady !== false ||
    claims.runtimeCollisionEligible !== false ||
    claims.runtimeIntegrated !== false ||
    claims.fitClaimEligible !== false ||
    claims.surfaceIsCollisionAuthority !== false ||
    claims.collisionAuthority !== 'body-artifact-collision-lods'
  ) {
    throw new TypeError('Evidence claim boundary mismatch.');
  }
  if (
    evidence.surface.format !== MEASUREMENT_WATERTIGHT_SURFACE_IMMUTABLE_SNAPSHOT_V2 ||
    evidence.surface.version !== MEASUREMENT_WATERTIGHT_SURFACE_V1 ||
    evidence.surface.claims.fitClaimEligible !== false ||
    evidence.surface.claims.runtimeCollisionEligible !== false ||
    evidence.surface.claims.collisionCandidateEligible !== false ||
    evidence.surface.identity.cryptographicSeal !== null ||
    evidence.surface.identity.persistedOrSealedEligible !== false
  ) {
    throw new TypeError('Surface V1 claim boundary mismatch.');
  }
  if (!cleanReport(evidence.reports.display) || !cleanReport(evidence.reports.collisionCandidate)) {
    throw new TypeError('Both LOD self-intersection reports must be complete and clean.');
  }
  if (
    evidence.binding.lodOrder.length !== 2 ||
    evidence.binding.lodOrder[0] !== 'display' ||
    evidence.binding.lodOrder[1] !== 'collision-candidate' ||
    evidence.binding.displayRole !== 'display' ||
    evidence.binding.collisionCandidateRole !== 'collision-candidate'
  ) {
    throw new TypeError('LOD role/order binding mismatch.');
  }
  if (
    evidence.seal.version !== MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_SEAL_V2 ||
    evidence.seal.algorithm !== MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_HASH_ALGORITHM_V1 ||
    evidence.seal.encoding !== MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_ENCODING_V2
  ) {
    throw new TypeError('Evidence seal metadata mismatch.');
  }
  for (const key of DIGEST_KEYS) {
    if (!SHA256_HEX.test(evidence.seal.digests[key])) {
      throw new TypeError('Evidence component digest is malformed.');
    }
  }
  if (!SHA256_HEX.test(evidence.seal.aggregateSha256)) {
    throw new TypeError('Evidence aggregate digest is malformed.');
  }
}

/**
 * Accepts trusted in-process plain data only. Untrusted values must cross a structured-clone
 * Worker/message boundary before this synchronous builder is called; live Proxy inspection is not
 * an inert security boundary.
 */
export async function buildMeasurementWatertightSurfaceEvidenceV1(
  input: MeasurementWatertightSurfaceEvidenceInputV1,
  options: MeasurementWatertightSurfaceEvidenceCryptoOptionsV1 = {},
): Promise<BuildMeasurementWatertightSurfaceEvidenceResultV1> {
  let boundary: MeasurementWatertightSurfaceEvidenceInputV1;
  try {
    boundary = snapshotInput(input);
  } catch (error) {
    return failure('input-invalid', [errorMessage(error)]);
  }
  let crypto: TrustedSha256Provider | undefined;
  try {
    crypto = await trustedCryptoProvider(options);
  } catch {
    crypto = undefined;
  }
  if (!crypto) return failure('sha256-unavailable', ['Web Crypto SHA-256 is unavailable.']);
  try {
    const surface = createMeasurementWatertightSurfaceV1(boundary);
    const displayReport = validateMeasurementSurfaceSelfIntersectionV1(
      surface.lods.display.mesh.positions,
      surface.lods.display.mesh.indices,
    );
    const collisionCandidateReport = validateMeasurementSurfaceSelfIntersectionV1(
      surface.lods.collisionCandidate.mesh.positions,
      surface.lods.collisionCandidate.mesh.indices,
    );
    if (!cleanReport(displayReport) || !cleanReport(collisionCandidateReport)) {
      return failure('self-intersection-failed', [
        'Both exact LOD byte sequences must pass the pinned self-intersection validator.',
      ]);
    }
    const ownedInput = snapshotData(
      boundary,
      'input',
    ) as MeasurementWatertightSurfaceEvidenceInputV1;
    const ownedSurface = immutableSurfaceSnapshot(surface);
    const reports: MeasurementWatertightSurfaceEvidenceReportsV1 = {
      display: snapshotData(
        displayReport,
        'reports.display',
      ) as MeasurementSurfaceSelfIntersectionReportV1,
      collisionCandidate: snapshotData(
        collisionCandidateReport,
        'reports.collisionCandidate',
      ) as MeasurementSurfaceSelfIntersectionReportV1,
    };
    const dependency = dependencySnapshot();
    const binding: MeasurementWatertightSurfaceEvidenceBindingV1 = {
      canonicalSchemaVersion: ownedInput.measurements.schemaVersion,
      sourceRevision: ownedInput.sourceRevision,
      pose: ownedInput.pose,
      surfaceId: ownedSurface.id,
      surfaceRevision: ownedSurface.revision,
      frameRevision: ownedSurface.frameRevision,
      validatorVersion: MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
      validatorSourceSha256: MEASUREMENT_SURFACE_SELF_INTERSECTION_SOURCE_SHA256_V1,
      lodOrder: ['display', 'collision-candidate'],
      displayRole: 'display',
      collisionCandidateRole: 'collision-candidate',
    };
    const claims: MeasurementWatertightSurfaceEvidenceClaimsV1 = {
      surfaceTechnicalEvidenceComplete: true,
      technicalCollisionCandidateEligible: true,
      admission: false,
      collisionReady: false,
      runtimeCollisionEligible: false,
      runtimeIntegrated: false,
      fitClaimEligible: false,
      surfaceIsCollisionAuthority: false,
      collisionAuthority: 'body-artifact-collision-lods',
    };
    const withoutSeal: Omit<MeasurementWatertightSurfaceEvidenceV1, 'seal'> = {
      version: MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_V1,
      encoding: MEASUREMENT_WATERTIGHT_SURFACE_EVIDENCE_ENCODING_V2,
      input: ownedInput,
      surface: ownedSurface,
      reports,
      dependency,
      binding,
      claims,
    };
    const seal = await computeSeal(withoutSeal, crypto);
    return {
      ok: true,
      evidence: deepFreezeOwned({ ...withoutSeal, seal }) as MeasurementWatertightSurfaceEvidenceV1,
    };
  } catch (error) {
    if (error instanceof Sha256UnavailableError) {
      return failure('sha256-unavailable', [error.message]);
    }
    return failure('construction-failed', [errorMessage(error)]);
  }
}

/**
 * Accepts only inert plain-data snapshots. Both submitted evidence and expected input originating
 * outside the trusted process must cross a structured-clone Worker/message boundary before this
 * function is called. Live same-realm Proxy objects are outside the threat model because reflection
 * traps may execute before bounds are established; seal verification and trusted rebuild authority
 * do not make inspection of such a live object inert.
 */
export async function validateMeasurementWatertightSurfaceEvidenceV1(
  evidence: MeasurementWatertightSurfaceEvidenceV1,
  expectedInput: MeasurementWatertightSurfaceEvidenceInputV1,
  options: MeasurementWatertightSurfaceEvidenceCryptoOptionsV1 = {},
): Promise<ValidateMeasurementWatertightSurfaceEvidenceResultV1> {
  let snapshot: MeasurementWatertightSurfaceEvidenceV1;
  let boundary: MeasurementWatertightSurfaceEvidenceInputV1;
  try {
    snapshot = snapshotData(evidence, 'evidence') as MeasurementWatertightSurfaceEvidenceV1;
    preflightEvidence(snapshot);
    boundary = snapshotInput(expectedInput);
  } catch (error) {
    if (error instanceof Sha256UnavailableError) {
      return failure('sha256-unavailable', [error.message]);
    }
    return failure('evidence-invalid', [errorMessage(error)]);
  }
  let crypto: TrustedSha256Provider | undefined;
  try {
    crypto = await trustedCryptoProvider(options);
  } catch {
    crypto = undefined;
  }
  if (!crypto) return failure('sha256-unavailable', ['Web Crypto SHA-256 is unavailable.']);
  try {
    const { seal: submittedSeal, ...withoutSeal } = snapshot;
    if (!exactEqual(submittedSeal, await computeSeal(withoutSeal, crypto))) {
      return failure('evidence-invalid', ['Surface evidence seal verification failed.']);
    }
  } catch (error) {
    if (error instanceof Sha256UnavailableError) {
      return failure('sha256-unavailable', [error.message]);
    }
    return failure('evidence-invalid', [errorMessage(error)]);
  }
  const rebuilt = await buildMeasurementWatertightSurfaceEvidenceV1(boundary, {
    crypto: crypto.crypto,
  });
  if (!rebuilt.ok) {
    if (rebuilt.code === 'sha256-unavailable') return rebuilt;
    return failure('expected-rebuild-failed', ['Trusted surface evidence rebuild failed.']);
  }
  try {
    if (!exactEqual(snapshot, rebuilt.evidence)) {
      return failure('evidence-invalid', ['Surface evidence does not match the trusted rebuild.']);
    }
  } catch (error) {
    return failure('evidence-invalid', [errorMessage(error)]);
  }
  return { ok: true, rebuilt: rebuilt.evidence };
}
