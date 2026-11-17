import type { TechCardPatternSemanticSidecar } from 'api/proto-http/admin';

import type { DxfProductSavedRowIdentityV1 } from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2,
  decodePatternImportDxfProductMultiseamPlacementSidecarV2,
  type PatternImportDxfProductMultiseamPlacementAuthoringV2,
  type PatternImportDxfProductMultiseamPlacementBindingsV2,
  type PatternImportDxfProductMultiseamPlacementSidecarDocumentV2,
  type PatternImportDxfProductMultiseamPlacementSidecarSealV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from './pattern-import-dxf-product-semantic-sidecar-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2 =
  'pattern-import-dxf-product-multiseam-placement-sidecar-read-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REPORT_V2 =
  'pattern-import-dxf-product-multiseam-placement-sidecar-read-report/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_VERIFIED_READ_OWNER_V2 =
  'pattern-import-dxf-product-multiseam-placement-sidecar-verified-read-owner/2' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_SIDECAR_BYTES = 4 * 1024 * 1024;
const MAX_BASE64_CHARACTERS = Math.ceil(MAX_SIDECAR_BYTES / 3) * 4;
const MAX_SAVED_ROW_STABLE_ID_LENGTH = 256;
const MAX_BINDING_TEXT_BYTES = 4_096;
const MAX_SAVED_ROW_URL_LENGTH = 4_096;
const MAX_DETAIL_BYTES = 1_024;
const MAX_SCAN_DEPTH = 16;
const MAX_SCAN_PROPERTIES = 4_096;
const encoder = new TextEncoder();
const abortSignalAbortedGetter =
  typeof AbortSignal === 'function'
    ? Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get
    : undefined;
const nativeCrypto = globalThis.crypto;
const nativeCryptoPrototype = nativeCrypto ? Object.getPrototypeOf(nativeCrypto) : null;
const nativeCryptoSubtleGetter = nativeCryptoPrototype
  ? Object.getOwnPropertyDescriptor(nativeCryptoPrototype, 'subtle')?.get
  : undefined;
const nativeSubtle = nativeCryptoSubtleGetter
  ? (Reflect.apply(nativeCryptoSubtleGetter, nativeCrypto, []) as SubtleCrypto)
  : undefined;
const nativeSubtlePrototype = nativeSubtle ? Object.getPrototypeOf(nativeSubtle) : null;
const nativeSubtleDigest = nativeSubtlePrototype
  ? (Object.getOwnPropertyDescriptor(nativeSubtlePrototype, 'digest')?.value as
      SubtleCrypto['digest'] | undefined)
  : undefined;

export type PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  topology: PatternImportDxfProductMultiseamPlacementBindingsV2['topology'];
}>;

export type PatternImportDxfProductMultiseamPlacementSidecarReadRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2;
  expectedRow: DxfProductSavedRowIdentityV1;
  expectedBindings: PatternImportDxfProductMultiseamPlacementBindingsV2;
}>;

/**
 * The generated GET cannot express AbortSignal or a typed NotFound result. The application
 * boundary normalizes those two transport details here without changing generated code.
 */
export type PatternImportDxfProductMultiseamPlacementSidecarReadHostV2 = Readonly<{
  getSidecar: (
    request: Readonly<{ techCardId: number; patternLineKey: string }>,
    signal: AbortSignal,
  ) => Promise<
    | Readonly<{ status: 'found'; row: TechCardPatternSemanticSidecar }>
    | Readonly<{ status: 'absent' }>
  >;
  readCurrentEvidence: (
    expected: PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2>;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_ACCEPTED_CLAIMS_V2 =
  Object.freeze({
    narrowGetPerformed: true,
    getEnvelopeVerified: true,
    authoritativeRowRevalidatedBeforeGet: true,
    authoritativeRowRevalidatedAfterGet: true,
    assemblyTopologyRevalidatedBeforeGet: true,
    assemblyTopologyRevalidatedAfterGet: true,
    canonicalBase64Verified: true,
    byteLengthVerified: true,
    sidecarSha256Verified: true,
    d2p1CodecVerified: true,
    placementV2Available: true,
    legacyPlacementInferred: false,
    savedRevisionUsedAsPatternVersion: false,
    authoredImportGenerationIsAuditOnly: true,
    originalSealsAreAuditOnly: true,
    rawSidecarBytesReturned: false,
    rawSidecarBytesRetained: false,
    putPerformed: false,
    sidecarPersistedByThisRead: false,
    restoreAuthorityMinted: false,
    previewReady: false,
    runtimeReady: false,
    productionReady: false,
  } as const);

const LEGACY_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_ACCEPTED_CLAIMS_V2,
  placementV2Available: false as const,
});

const ABSENT_CLAIMS = Object.freeze({
  ...LEGACY_CLAIMS,
  getEnvelopeVerified: false as const,
  canonicalBase64Verified: false as const,
  byteLengthVerified: false as const,
  sidecarSha256Verified: false as const,
  d2p1CodecVerified: false as const,
});

const BLOCKED_CLAIMS = Object.freeze({
  narrowGetPerformed: false as const,
  getEnvelopeVerified: false as const,
  authoritativeRowRevalidatedBeforeGet: false as const,
  authoritativeRowRevalidatedAfterGet: false as const,
  assemblyTopologyRevalidatedBeforeGet: false as const,
  assemblyTopologyRevalidatedAfterGet: false as const,
  canonicalBase64Verified: false as const,
  byteLengthVerified: false as const,
  sidecarSha256Verified: false as const,
  d2p1CodecVerified: false as const,
  placementV2Available: false as const,
  legacyPlacementInferred: false as const,
  savedRevisionUsedAsPatternVersion: false as const,
  authoredImportGenerationIsAuditOnly: true as const,
  originalSealsAreAuditOnly: true as const,
  rawSidecarBytesReturned: false as const,
  rawSidecarBytesRetained: false as const,
  putPerformed: false as const,
  sidecarPersistedByThisRead: false as const,
  restoreAuthorityMinted: false as const,
  previewReady: false as const,
  runtimeReady: false as const,
  productionReady: false as const,
});

export type PatternImportDxfProductMultiseamPlacementSidecarReadBlockerCodeV2 =
  | 'invalid-request'
  | 'cancelled'
  | 'row-read-failed'
  | 'row-stale-before-get'
  | 'topology-stale-before-get'
  | 'get-failed'
  | 'envelope-invalid'
  | 'unsupported-media-type'
  | 'base64-invalid'
  | 'sidecar-size-invalid'
  | 'sha256-unavailable'
  | 'sidecar-sha256-mismatch'
  | 'codec-blocked'
  | 'decoded-media-mismatch'
  | 'decoded-binding-mismatch'
  | 'row-revalidation-failed'
  | 'row-stale-after-decode'
  | 'topology-stale-after-decode';

export type PatternImportDxfProductMultiseamPlacementSidecarReadBlockerV2 = Readonly<{
  code: PatternImportDxfProductMultiseamPlacementSidecarReadBlockerCodeV2;
  phase: 'input' | 'preflight' | 'get' | 'transport-verify' | 'codec' | 'postflight';
  detail: string;
}>;

export type PatternImportDxfProductMultiseamPlacementSidecarReadReportV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REPORT_V2;
  compatibility: 'placement-v2' | 'legacy-v1-no-placement' | 'absent';
  row: DxfProductSavedRowIdentityV1;
  topology: PatternImportDxfProductMultiseamPlacementBindingsV2['topology'];
  sidecar: Readonly<{
    mediaType:
      | typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2
      | typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1;
    canonicalSha256: string;
    canonicalByteLength: number;
  }> | null;
}>;

declare const verifiedReadOwnerBrand: unique symbol;
export type PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_VERIFIED_READ_OWNER_V2;
  document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV2;
  placementAuthoring: PatternImportDxfProductMultiseamPlacementAuthoringV2;
  seal: PatternImportDxfProductMultiseamPlacementSidecarSealV2;
  report: PatternImportDxfProductMultiseamPlacementSidecarReadReportV2;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_ACCEPTED_CLAIMS_V2;
  readonly [verifiedReadOwnerBrand]: never;
}>;

export type PatternImportDxfProductMultiseamPlacementSidecarReadResultV2 =
  | Readonly<{
      ok: true;
      compatibility: 'placement-v2';
      owner: PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2;
      placementAuthoring: PatternImportDxfProductMultiseamPlacementAuthoringV2;
      report: PatternImportDxfProductMultiseamPlacementSidecarReadReportV2;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_ACCEPTED_CLAIMS_V2;
    }>
  | Readonly<{
      ok: true;
      compatibility: 'legacy-v1-no-placement';
      owner: null;
      placementAuthoring: null;
      report: PatternImportDxfProductMultiseamPlacementSidecarReadReportV2;
      blockers: readonly [];
      claims: typeof LEGACY_CLAIMS;
    }>
  | Readonly<{
      ok: true;
      compatibility: 'absent';
      owner: null;
      placementAuthoring: null;
      report: PatternImportDxfProductMultiseamPlacementSidecarReadReportV2;
      blockers: readonly [];
      claims: typeof ABSENT_CLAIMS;
    }>
  | Readonly<{
      ok: false;
      compatibility: 'blocked';
      owner: null;
      placementAuthoring: null;
      report: null;
      blockers: readonly [PatternImportDxfProductMultiseamPlacementSidecarReadBlockerV2];
      claims: typeof BLOCKED_CLAIMS;
    }>;

class ReadFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductMultiseamPlacementSidecarReadBlockerCodeV2,
    readonly phase: PatternImportDxfProductMultiseamPlacementSidecarReadBlockerV2['phase'],
    detail: string,
  ) {
    super(bounded(detail));
  }
}

const verifiedReadOwners = new WeakSet<object>();

function bounded(value: string): string {
  if (encoder.encode(value).byteLength <= MAX_DETAIL_BYTES) return value;
  let result = '';
  for (const scalar of value) {
    if (encoder.encode(`${result}${scalar}…`).byteLength > MAX_DETAIL_BYTES) break;
    result += scalar;
  }
  return `${result}…`;
}

function fail(
  code: PatternImportDxfProductMultiseamPlacementSidecarReadBlockerCodeV2,
  phase: PatternImportDxfProductMultiseamPlacementSidecarReadBlockerV2['phase'],
  detail: string,
): never {
  throw new ReadFailure(code, phase, detail);
}

function blocked(error: unknown): PatternImportDxfProductMultiseamPlacementSidecarReadResultV2 {
  const failure =
    error instanceof ReadFailure
      ? error
      : new ReadFailure('invalid-request', 'input', 'Sidecar read validation failed.');
  return Object.freeze({
    ok: false as const,
    compatibility: 'blocked' as const,
    owner: null,
    placementAuthoring: null,
    report: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, phase: failure.phase, detail: failure.message }),
    ]) as readonly [PatternImportDxfProductMultiseamPlacementSidecarReadBlockerV2],
    claims: BLOCKED_CLAIMS,
  });
}

type ScanState = { properties: number; seen: Set<object> };

function detachPlain(value: unknown, path = 'request', depth = 0, state?: ScanState): unknown {
  const scan = state ?? { properties: 0, seen: new Set<object>() };
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail('invalid-request', 'input', `${path} contains an invalid number.`);
    return value;
  }
  if (!value || typeof value !== 'object')
    fail('invalid-request', 'input', `${path} is outside the JSON domain.`);
  if (depth > MAX_SCAN_DEPTH)
    fail('invalid-request', 'input', `${path} exceeds the nesting bound.`);
  if (scan.seen.has(value)) fail('invalid-request', 'input', `${path} contains an alias or cycle.`);
  scan.seen.add(value);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  let symbols: symbol[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    fail('invalid-request', 'input', `${path} metadata inspection failed.`);
  }
  if (symbols.length > 0) fail('invalid-request', 'input', `${path} contains symbol properties.`);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype)
      fail('invalid-request', 'input', `${path} must be an exact array.`);
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !('value' in lengthDescriptor))
      fail('invalid-request', 'input', `${path} has an invalid length descriptor.`);
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_SCAN_PROPERTIES)
      fail('invalid-request', 'input', `${path} has an invalid array length.`);
    const keys = Object.keys(descriptors).filter((key) => key !== 'length');
    if (keys.length !== length) fail('invalid-request', 'input', `${path} must be a dense array.`);
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('invalid-request', 'input', `${path}[${index}] must be a data property.`);
      output.push(detachPlain(descriptor.value, `${path}[${index}]`, depth + 1, scan));
    }
    scan.properties += length;
    if (scan.properties > MAX_SCAN_PROPERTIES)
      fail('invalid-request', 'input', `${path} exceeds the property bound.`);
    return output;
  }
  if (prototype !== Object.prototype && prototype !== null)
    fail('invalid-request', 'input', `${path} must be a plain record.`);
  const output = Object.create(null) as Record<string, unknown>;
  const keys = Object.keys(descriptors);
  scan.properties += keys.length;
  if (scan.properties > MAX_SCAN_PROPERTIES)
    fail('invalid-request', 'input', `${path} exceeds the property bound.`);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail('invalid-request', 'input', `${path}.${key} must be an enumerable data property.`);
    Object.defineProperty(output, key, {
      value: detachPlain(descriptor.value, `${path}.${key}`, depth + 1, scan),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return output;
}

function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-request', 'input', `${path} must be a record.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    fail('invalid-request', 'input', `${path} has unexpected fields.`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, minimum: number, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    fail('invalid-request', 'input', `${path} must be a safe integer >= ${minimum}.`);
  return value as number;
}

function text(value: unknown, path: string, stable = true, maximumCharacters?: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_BINDING_TEXT_BYTES ||
    (maximumCharacters !== undefined && value.length > maximumCharacters) ||
    encoder.encode(value).byteLength > MAX_BINDING_TEXT_BYTES ||
    (stable && !STABLE_ID.test(value))
  )
    fail('invalid-request', 'input', `${path} must be a bounded string.`);
  return value;
}

function sha(value: unknown, path: string): string {
  if (typeof value !== 'string' || !SHA256.test(value))
    fail('invalid-request', 'input', `${path} must be a lowercase SHA-256 digest.`);
  return value;
}

function validateUrl(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_SAVED_ROW_URL_LENGTH ||
    encoder.encode(value).byteLength > MAX_BINDING_TEXT_BYTES
  )
    fail('invalid-request', 'input', `${path} must be a bounded saved-row URL.`);
  const url = value;
  for (let index = 0; index < url.length; index += 1) {
    if (url.charCodeAt(index) <= 0x1f)
      fail('invalid-request', 'input', `${path} contains a control character.`);
  }
  const lower = url.trimStart().toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('javascript:'))
    fail('invalid-request', 'input', `${path} uses a forbidden URL scheme.`);
  return url;
}

function validateSavedRow(value: unknown, path: string): DxfProductSavedRowIdentityV1 {
  const row = record(
    value,
    [
      'techCardId',
      'scopeKey',
      'patternLineKey',
      'revision',
      'cardLockVersion',
      'url',
      'sizeBytes',
      'sha256',
    ],
    path,
  );
  integer(row.techCardId, 1, `${path}.techCardId`);
  text(row.scopeKey, `${path}.scopeKey`, true, MAX_SAVED_ROW_STABLE_ID_LENGTH);
  text(row.patternLineKey, `${path}.patternLineKey`, true, MAX_SAVED_ROW_STABLE_ID_LENGTH);
  integer(row.revision, 0, `${path}.revision`);
  integer(row.cardLockVersion, 0, `${path}.cardLockVersion`);
  validateUrl(row.url, `${path}.url`);
  integer(row.sizeBytes, 1, `${path}.sizeBytes`);
  sha(row.sha256, `${path}.sha256`);
  return row as DxfProductSavedRowIdentityV1;
}

const SOURCE_KEYS = [
  'sourceFileSha256',
  'writerExportSha256',
  'handoffSourceAggregateSha256',
  'selectedGeometrySha256',
  'sizeSelectionSha256',
  'catalogCanonicalSha256',
  'proposalFingerprint',
  'phaseEPlanSha256',
  'mappingCompositionSha256',
  'handoffCanonicalSha256',
  'aggregateCanonicalSha256',
  'phase2ArtifactSha256',
] as const;

const TOPOLOGY_KEYS = [
  'assemblyTopologySha256',
  'documentId',
  'revision',
  'sourceOperationNumber',
  'localOperationOrder',
  'pieceLineKeys',
  'pieceIds',
  'seamKeys',
  'seamIds',
] as const;

function validateTopology(
  value: unknown,
  path: string,
): PatternImportDxfProductMultiseamPlacementBindingsV2['topology'] {
  const topology = record(value, TOPOLOGY_KEYS, path);
  sha(topology.assemblyTopologySha256, `${path}.assemblyTopologySha256`);
  text(topology.documentId, `${path}.documentId`);
  text(topology.revision, `${path}.revision`);
  integer(topology.sourceOperationNumber, 1, `${path}.sourceOperationNumber`);
  if (topology.localOperationOrder !== 0)
    fail('invalid-request', 'input', `${path}.localOperationOrder must be 0.`);
  for (const key of ['pieceLineKeys', 'pieceIds', 'seamKeys', 'seamIds'] as const) {
    const tuple = topology[key];
    if (!Array.isArray(tuple) || tuple.length !== 2)
      fail('invalid-request', 'input', `${path}.${key} must have exactly two entries.`);
    text(tuple[0], `${path}.${key}[0]`);
    text(tuple[1], `${path}.${key}[1]`);
    if (tuple[0] === tuple[1])
      fail('invalid-request', 'input', `${path}.${key} entries must be distinct.`);
  }
  return topology as PatternImportDxfProductMultiseamPlacementBindingsV2['topology'];
}

function validateBindings(
  value: unknown,
  path: string,
): PatternImportDxfProductMultiseamPlacementBindingsV2 {
  const bindings = record(value, ['row', 'source', 'topology'], path);
  const row = record(
    bindings.row,
    [
      'techCardId',
      'cardLockVersion',
      'scopeKey',
      'patternLineKey',
      'patternUrl',
      'patternVersion',
      'revision',
      'sizeId',
      'sizeToken',
      'dxfSha256',
      'postSaveReceiptSha256',
    ],
    `${path}.row`,
  );
  integer(row.techCardId, 1, `${path}.row.techCardId`);
  integer(row.cardLockVersion, 0, `${path}.row.cardLockVersion`);
  text(row.scopeKey, `${path}.row.scopeKey`, true, MAX_SAVED_ROW_STABLE_ID_LENGTH);
  text(row.patternLineKey, `${path}.row.patternLineKey`, true, MAX_SAVED_ROW_STABLE_ID_LENGTH);
  validateUrl(row.patternUrl, `${path}.row.patternUrl`);
  integer(row.patternVersion, 1, `${path}.row.patternVersion`);
  integer(row.revision, 0, `${path}.row.revision`);
  integer(row.sizeId, 0, `${path}.row.sizeId`);
  text(row.sizeToken, `${path}.row.sizeToken`);
  sha(row.dxfSha256, `${path}.row.dxfSha256`);
  sha(row.postSaveReceiptSha256, `${path}.row.postSaveReceiptSha256`);

  const source = record(bindings.source, SOURCE_KEYS, `${path}.source`);
  for (const key of SOURCE_KEYS) {
    if (key === 'proposalFingerprint') {
      if (typeof source[key] !== 'string' || !/^pidpemsv2-fnv1a64:[0-9a-f]{16}$/.test(source[key]))
        fail('invalid-request', 'input', `${path}.source.${key} is invalid.`);
    } else sha(source[key], `${path}.source.${key}`);
  }
  if (row.dxfSha256 !== source.writerExportSha256)
    fail(
      'invalid-request',
      'input',
      `${path}.source.writerExportSha256 must equal the row DXF SHA-256.`,
    );
  validateTopology(bindings.topology, `${path}.topology`);
  return bindings as PatternImportDxfProductMultiseamPlacementBindingsV2;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`;
}

function same(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function validateRequest(
  candidate: unknown,
  expectedSchema: string = PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
): PatternImportDxfProductMultiseamPlacementSidecarReadRequestV2 {
  const detached = detachPlain(candidate);
  const request = record(detached, ['schemaVersion', 'expectedRow', 'expectedBindings'], 'request');
  if (request.schemaVersion !== expectedSchema)
    fail('invalid-request', 'input', 'Read request schema version mismatch.');
  const expectedRow = validateSavedRow(request.expectedRow, 'request.expectedRow');
  const expectedBindings = validateBindings(request.expectedBindings, 'request.expectedBindings');
  const bindingRow = expectedBindings.row;
  if (
    expectedRow.techCardId !== bindingRow.techCardId ||
    expectedRow.scopeKey !== bindingRow.scopeKey ||
    expectedRow.patternLineKey !== bindingRow.patternLineKey ||
    expectedRow.revision !== bindingRow.revision ||
    expectedRow.cardLockVersion !== bindingRow.cardLockVersion ||
    expectedRow.url !== bindingRow.patternUrl ||
    expectedRow.sha256 !== bindingRow.dxfSha256
  )
    fail(
      'invalid-request',
      'input',
      'Saved-row identity does not match the expected sidecar row binding.',
    );
  // `patternVersion` deliberately has no equality check against numeric saved-row `revision`.
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
    expectedRow: deepFreeze(expectedRow),
    expectedBindings: deepFreeze(expectedBindings),
  });
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

function snapshotDataRecord(
  candidate: unknown,
  path: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  code: PatternImportDxfProductMultiseamPlacementSidecarReadBlockerCodeV2,
  phase: PatternImportDxfProductMultiseamPlacementSidecarReadBlockerV2['phase'],
): Record<string, unknown> {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
    fail(code, phase, `${path} must be a plain data record.`);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(candidate);
    descriptors = Object.getOwnPropertyDescriptors(candidate);
  } catch {
    fail(code, phase, `${path} metadata inspection failed.`);
  }
  if (prototype !== Object.prototype && prototype !== null)
    fail(code, phase, `${path} must use a plain-record prototype.`);
  const keys = Reflect.ownKeys(descriptors);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (
    keys.some((key) => typeof key !== 'string' || !allowed.has(key)) ||
    requiredKeys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key))
  )
    fail(code, phase, `${path} contains missing, symbol, or unexpected fields.`);
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== 'string') continue;
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail(code, phase, `${path}.${key} must be an enumerable data property.`);
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return snapshot;
}

function captureCrypto(candidate: unknown): Pick<Crypto, 'subtle'> | undefined {
  if (candidate === undefined) return undefined;
  let subtle: SubtleCrypto | undefined;
  if (nativeCryptoSubtleGetter) {
    try {
      subtle = Reflect.apply(nativeCryptoSubtleGetter, candidate, []) as SubtleCrypto;
    } catch {
      subtle = undefined;
    }
  }
  if (!subtle) {
    const cryptoRecord = snapshotDataRecord(
      candidate,
      'host.crypto',
      ['subtle'],
      [],
      'invalid-request',
      'input',
    );
    subtle = cryptoRecord.subtle as SubtleCrypto;
  }

  let digestFunction: SubtleCrypto['digest'] | undefined;
  if (nativeSubtleDigest && subtle === nativeSubtle) {
    digestFunction = nativeSubtleDigest;
  } else {
    const subtleRecord = snapshotDataRecord(
      subtle,
      'host.crypto.subtle',
      ['digest'],
      [],
      'invalid-request',
      'input',
    );
    digestFunction = subtleRecord.digest as SubtleCrypto['digest'];
  }
  if (typeof digestFunction !== 'function')
    fail('invalid-request', 'input', 'host.crypto.subtle.digest must be a function.');
  const digestReceiver = subtle;
  const stableSubtle = Object.freeze({
    digest: (...args: Parameters<SubtleCrypto['digest']>) =>
      Reflect.apply(digestFunction, digestReceiver, args),
  }) as unknown as SubtleCrypto;
  return Object.freeze({ subtle: stableSubtle });
}

type CapturedHost = Readonly<{
  getSidecar: PatternImportDxfProductMultiseamPlacementSidecarReadHostV2['getSidecar'];
  readCurrentEvidence: PatternImportDxfProductMultiseamPlacementSidecarReadHostV2['readCurrentEvidence'];
  crypto: Pick<Crypto, 'subtle'> | undefined;
}>;

function captureHost(candidate: unknown): CapturedHost {
  const host = snapshotDataRecord(
    candidate,
    'host',
    ['getSidecar', 'readCurrentEvidence'],
    ['crypto'],
    'invalid-request',
    'input',
  );
  if (typeof host.getSidecar !== 'function' || typeof host.readCurrentEvidence !== 'function')
    fail('invalid-request', 'input', 'A GET-only sidecar read host is required.');
  const receiver = candidate as object;
  const getSidecar = host.getSidecar;
  const readCurrentEvidence = host.readCurrentEvidence;
  return Object.freeze({
    getSidecar: (request, signal) => Reflect.apply(getSidecar, receiver, [request, signal]),
    readCurrentEvidence: (expected, signal) =>
      Reflect.apply(readCurrentEvidence, receiver, [expected, signal]),
    crypto: captureCrypto(host.crypto === undefined ? nativeCrypto : host.crypto),
  });
}

function checkCancelled(signal: AbortSignal): void {
  if (!abortSignalAbortedGetter)
    fail('invalid-request', 'input', 'AbortSignal support is unavailable.');
  let aborted: boolean;
  try {
    aborted = Reflect.apply(abortSignalAbortedGetter, signal, []) as boolean;
  } catch {
    fail('invalid-request', 'input', 'A genuine AbortSignal is required.');
  }
  if (aborted) fail('cancelled', 'preflight', 'Sidecar read was cancelled.');
}

function validateCurrentEvidence(
  candidate: unknown,
): PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2 {
  const detached = detachPlain(candidate, 'currentEvidence');
  const evidence = record(detached, ['row', 'topology'], 'currentEvidence');
  return deepFreeze({
    row: validateSavedRow(evidence.row, 'currentEvidence.row'),
    topology: validateTopology(evidence.topology, 'currentEvidence.topology'),
  });
}

async function requireCurrentEvidence(
  readCurrentEvidence: CapturedHost['readCurrentEvidence'],
  expected: PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2,
  signal: AbortSignal,
  phase: 'before-get' | 'after-decode',
): Promise<void> {
  checkCancelled(signal);
  let returned: unknown;
  try {
    returned = await readCurrentEvidence(expected, signal);
  } catch {
    fail(
      phase === 'before-get' ? 'row-read-failed' : 'row-revalidation-failed',
      phase === 'before-get' ? 'preflight' : 'postflight',
      `Current saved-row evidence could not be read ${phase}.`,
    );
  }
  checkCancelled(signal);
  let current: PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2;
  try {
    current = validateCurrentEvidence(returned);
  } catch {
    fail(
      phase === 'before-get' ? 'row-read-failed' : 'row-revalidation-failed',
      phase === 'before-get' ? 'preflight' : 'postflight',
      `Current saved-row evidence was invalid ${phase}.`,
    );
  }
  if (!same(current.row, expected.row))
    fail(
      phase === 'before-get' ? 'row-stale-before-get' : 'row-stale-after-decode',
      phase === 'before-get' ? 'preflight' : 'postflight',
      `The authoritative saved-row identity changed ${phase}.`,
    );
  if (!same(current.topology, expected.topology))
    fail(
      phase === 'before-get' ? 'topology-stale-before-get' : 'topology-stale-after-decode',
      phase === 'before-get' ? 'preflight' : 'postflight',
      `The Assembly Order topology changed ${phase}.`,
    );
}

type VerifiedEnvelope = Readonly<{
  mediaType: string;
  sidecarSha256: string;
  byteLength: number;
  sidecarBytes: string;
}>;

type CapturedReadback =
  Readonly<{ status: 'absent' }> | Readonly<{ status: 'found'; row: unknown }>;

function captureReadback(candidate: unknown): CapturedReadback {
  const readback = snapshotDataRecord(
    candidate,
    'GET result',
    ['status'],
    ['row'],
    'get-failed',
    'get',
  );
  if (readback.status === 'absent') {
    if (Object.prototype.hasOwnProperty.call(readback, 'row'))
      fail('get-failed', 'get', 'Absent GET result must not contain a row.');
    return Object.freeze({ status: 'absent' as const });
  }
  if (readback.status !== 'found' || !Object.prototype.hasOwnProperty.call(readback, 'row'))
    fail('get-failed', 'get', 'The narrow GET returned an invalid transport result.');
  return Object.freeze({ status: 'found' as const, row: readback.row });
}

function validateEnvelope(
  candidate: unknown,
  expected: PatternImportDxfProductMultiseamPlacementBindingsV2['row'],
  observedMediaType?: string,
): VerifiedEnvelope {
  const value = snapshotDataRecord(
    candidate,
    'GET envelope',
    [
      'techCardId',
      'patternLineKey',
      'dxfSha256',
      'patternVersion',
      'sidecarSha256',
      'mediaType',
      'byteLength',
      'sidecarBytes',
      'postSaveReceiptSha256',
      'cardLockVersion',
    ],
    ['createdAt', 'createdBy', 'savedRowRevision'],
    'envelope-invalid',
    'transport-verify',
  );
  const {
    techCardId,
    cardLockVersion,
    patternLineKey,
    dxfSha256,
    patternVersion,
    postSaveReceiptSha256,
    savedRowRevision,
    sidecarSha256,
    mediaType,
    byteLength,
    sidecarBytes,
  } = value;
  if (
    techCardId !== expected.techCardId ||
    cardLockVersion !== expected.cardLockVersion ||
    patternLineKey !== expected.patternLineKey ||
    dxfSha256 !== expected.dxfSha256 ||
    patternVersion !== expected.patternVersion ||
    postSaveReceiptSha256 !== expected.postSaveReceiptSha256 ||
    (savedRowRevision !== undefined && savedRowRevision !== expected.revision)
  )
    fail(
      'envelope-invalid',
      'transport-verify',
      'GET returned a different card, pattern, lock, DXF, version, saved revision or save receipt.',
    );
  if (
    mediaType !== PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2 &&
    mediaType !== PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 &&
    (observedMediaType === undefined || mediaType !== observedMediaType)
  )
    fail('unsupported-media-type', 'transport-verify', 'GET returned an unsupported media type.');
  if (typeof sidecarSha256 !== 'string' || !SHA256.test(sidecarSha256))
    fail('envelope-invalid', 'transport-verify', 'GET returned an invalid sidecar SHA-256.');
  if (
    !Number.isSafeInteger(byteLength) ||
    (byteLength as number) < 1 ||
    (byteLength as number) > MAX_SIDECAR_BYTES
  )
    fail(
      'sidecar-size-invalid',
      'transport-verify',
      'GET returned an invalid sidecar byte length.',
    );
  if (typeof sidecarBytes !== 'string')
    fail('base64-invalid', 'transport-verify', 'GET returned invalid sidecar base64.');
  return Object.freeze({
    mediaType: String(mediaType),
    sidecarSha256,
    byteLength: byteLength as number,
    sidecarBytes,
  });
}

function decodeBase64(value: string, expectedLength: number): Uint8Array<ArrayBuffer> {
  if (
    value.length < 4 ||
    value.length > MAX_BASE64_CHARACTERS ||
    value.length % 4 !== 0 ||
    !BASE64.test(value)
  )
    fail('base64-invalid', 'transport-verify', 'GET sidecar bytes are not canonical base64.');
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    fail('base64-invalid', 'transport-verify', 'GET sidecar base64 decoding failed.');
  }
  if (binary.length < 1 || binary.length > MAX_SIDECAR_BYTES || binary.length !== expectedLength)
    fail('sidecar-size-invalid', 'transport-verify', 'GET sidecar byte length mismatch.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  let roundTrip = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize)
    roundTrip += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  if (btoa(roundTrip) !== value) {
    bytes.fill(0);
    fail('base64-invalid', 'transport-verify', 'GET sidecar base64 is not canonical.');
  }
  return bytes;
}

function makeReport(
  compatibility: PatternImportDxfProductMultiseamPlacementSidecarReadReportV2['compatibility'],
  request: PatternImportDxfProductMultiseamPlacementSidecarReadRequestV2,
  sidecar: PatternImportDxfProductMultiseamPlacementSidecarReadReportV2['sidecar'],
): PatternImportDxfProductMultiseamPlacementSidecarReadReportV2 {
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REPORT_V2,
    compatibility,
    row: request.expectedRow,
    topology: request.expectedBindings.topology,
    sidecar,
  });
}

function makeVerifiedOwner(
  document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV2,
  placementAuthoring: PatternImportDxfProductMultiseamPlacementAuthoringV2,
  seal: PatternImportDxfProductMultiseamPlacementSidecarSealV2,
  report: PatternImportDxfProductMultiseamPlacementSidecarReadReportV2,
): PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2 {
  const owner = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_VERIFIED_READ_OWNER_V2,
    document,
    placementAuthoring,
    seal,
    report,
    claims: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_ACCEPTED_CLAIMS_V2,
  }) as PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2;
  verifiedReadOwners.add(owner);
  return owner;
}

export function isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2(
  candidate: unknown,
): candidate is PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2 {
  return !!candidate && typeof candidate === 'object' && verifiedReadOwners.has(candidate);
}

/**
 * Performs a verified narrow GET only. It never writes, restores a card session, or admits a
 * placement. Session-generation publication races belong to the future restore controller.
 */
export async function readPatternImportDxfProductMultiseamPlacementSidecarV2(
  candidate: unknown,
  host: PatternImportDxfProductMultiseamPlacementSidecarReadHostV2,
  signal: AbortSignal = new AbortController().signal,
): Promise<PatternImportDxfProductMultiseamPlacementSidecarReadResultV2> {
  let bytes: Uint8Array<ArrayBuffer> | null = null;
  try {
    const request = validateRequest(candidate);
    const capturedHost = captureHost(host);
    const expectedEvidence = Object.freeze({
      row: request.expectedRow,
      topology: request.expectedBindings.topology,
    });
    await requireCurrentEvidence(
      capturedHost.readCurrentEvidence,
      expectedEvidence,
      signal,
      'before-get',
    );
    checkCancelled(signal);

    let readback:
      | Readonly<{ status: 'found'; row: TechCardPatternSemanticSidecar }>
      | Readonly<{ status: 'absent' }>;
    try {
      readback = await capturedHost.getSidecar(
        {
          techCardId: request.expectedBindings.row.techCardId,
          patternLineKey: request.expectedBindings.row.patternLineKey,
        },
        signal,
      );
    } catch {
      fail('get-failed', 'get', 'The narrow semantic-sidecar GET failed.');
    }
    checkCancelled(signal);
    const capturedReadback = captureReadback(readback);
    if (capturedReadback.status === 'absent') {
      await requireCurrentEvidence(
        capturedHost.readCurrentEvidence,
        expectedEvidence,
        signal,
        'after-decode',
      );
      const report = makeReport('absent', request, null);
      return Object.freeze({
        ok: true as const,
        compatibility: 'absent' as const,
        owner: null,
        placementAuthoring: null,
        report,
        blockers: Object.freeze([]) as readonly [],
        claims: ABSENT_CLAIMS,
      });
    }

    const envelope = validateEnvelope(capturedReadback.row, request.expectedBindings.row);
    bytes = decodeBase64(envelope.sidecarBytes, envelope.byteLength);
    checkCancelled(signal);
    const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(
      bytes,
      capturedHost.crypto,
    );
    checkCancelled(signal);
    if (!decoded.ok) {
      const codecCode = decoded.blockers[0].code;
      fail(
        codecCode === 'sha256-unavailable' ? 'sha256-unavailable' : 'codec-blocked',
        codecCode === 'sha256-unavailable' ? 'transport-verify' : 'codec',
        `D2p1 codec rejected the canonical sidecar (${codecCode}).`,
      );
    }
    if (decoded.compatibility === 'legacy-v1-no-placement') {
      if (decoded.legacy.canonicalSha256 !== envelope.sidecarSha256)
        fail(
          'sidecar-sha256-mismatch',
          'transport-verify',
          'GET sidecar bytes do not match the envelope SHA-256.',
        );
      if (
        envelope.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 ||
        decoded.legacy.canonicalByteLength !== envelope.byteLength
      )
        fail(
          'decoded-media-mismatch',
          'codec',
          'Legacy codec result does not match the GET media envelope.',
        );
      await requireCurrentEvidence(
        capturedHost.readCurrentEvidence,
        expectedEvidence,
        signal,
        'after-decode',
      );
      const report = makeReport('legacy-v1-no-placement', request, {
        mediaType: envelope.mediaType,
        canonicalSha256: decoded.legacy.canonicalSha256,
        canonicalByteLength: decoded.legacy.canonicalByteLength,
      });
      return Object.freeze({
        ok: true as const,
        compatibility: 'legacy-v1-no-placement' as const,
        owner: null,
        placementAuthoring: null,
        report,
        blockers: Object.freeze([]) as readonly [],
        claims: LEGACY_CLAIMS,
      });
    }

    if (decoded.seal.canonicalSha256 !== envelope.sidecarSha256)
      fail(
        'sidecar-sha256-mismatch',
        'transport-verify',
        'GET sidecar bytes do not match the envelope SHA-256.',
      );
    if (
      envelope.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2 ||
      decoded.document.mediaType !== envelope.mediaType ||
      decoded.seal.canonicalByteLength !== envelope.byteLength
    )
      fail(
        'decoded-media-mismatch',
        'codec',
        'V2 codec result does not match the GET media envelope.',
      );
    if (!same(decoded.document.bindings, request.expectedBindings))
      fail(
        'decoded-binding-mismatch',
        'codec',
        'Decoded V2 row, source or topology bindings differ from current expected bindings.',
      );

    await requireCurrentEvidence(
      capturedHost.readCurrentEvidence,
      expectedEvidence,
      signal,
      'after-decode',
    );
    const report = makeReport('placement-v2', request, {
      mediaType: envelope.mediaType,
      canonicalSha256: decoded.seal.canonicalSha256,
      canonicalByteLength: decoded.seal.canonicalByteLength,
    });
    const owner = makeVerifiedOwner(
      decoded.document,
      decoded.placementAuthoring,
      decoded.seal,
      report,
    );
    return Object.freeze({
      ok: true as const,
      compatibility: 'placement-v2' as const,
      owner,
      placementAuthoring: decoded.placementAuthoring,
      report,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_ACCEPTED_CLAIMS_V2,
    });
  } catch (error) {
    return blocked(error);
  } finally {
    bytes?.fill(0);
  }
}

/** Shared GET-only transport checks. This facade never mints or restores an owner. */
export const patternImportDxfProductPlacementReadTransportV1 = Object.freeze({
  captureRequest(candidate: unknown, schema: string) {
    const captured = validateRequest(candidate, schema);
    return Object.freeze({
      expectedRow: captured.expectedRow,
      expectedBindings: captured.expectedBindings,
    });
  },
  captureObservedEnvelope(
    candidate: unknown,
    expected: PatternImportDxfProductMultiseamPlacementBindingsV2['row'],
    media: string,
  ) {
    const envelope = validateEnvelope(candidate, expected, media);
    if ((envelope.mediaType as string) !== media)
      fail(
        'unsupported-media-type',
        'transport-verify',
        'Observed placement requires its exact media type.',
      );
    return { ...envelope, mediaType: media };
  },
  captureHost,
  checkCancelled,
  requireCurrentEvidence,
  captureReadback,
  decodeBase64,
  same,
  deepFreeze,
});
