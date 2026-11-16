import type { PatternImportDxfProductCompositeSidecarBindingsV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1,
  type PatternImportDxfPhaseECalloutV1,
} from './callout-session-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  decodePatternImportDxfProductCompositeSidecarV4,
  type PatternImportDxfProductCompositeSidecarOwnerV4,
} from './composite-sidecar-v4';
import type {
  PatternImportDxfPhaseEMeasurementKindV1,
  PatternImportDxfPhaseEMeasurementV1,
  PatternImportDxfPhaseEVertexAnchorV1,
} from './measurement-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1 =
  'pattern-import-dxf-phase-e-topology-annotations-request/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_DOCUMENT_V1 =
  'pattern-import-dxf-phase-e-topology-annotations/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_MEDIA_TYPE_V1 =
  'application/vnd.grbpwr.pattern-dxf-phase-e-topology-annotations.v1+json' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5 =
  'pattern-import-dxf-product-composite-sidecar-request/5' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V5 =
  'pattern-import-dxf-product-composite-sidecar-document/5' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V5 =
  'pattern-import-dxf-product-composite-sidecar-seal/5' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V5 =
  'pattern-import-dxf-product-composite-sidecar-owner/5' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 =
  'application/vnd.grbpwr.pattern-dxf-product-composite.v5+json' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V5 = Object.freeze({
  exactSavedRowBound: true,
  exactServerAssemblyRevisionBound: true,
  exactAssemblyTopologySha256Bound: true,
  exactSourceRevisionAndSha256Bound: true,
  nestedCompositeV4BytesPreservedExactly: true,
  topologyAnnotationsCanonicalAndDigestVerified: true,
  exactContourVertexAndMillimetreCoordinatesRequired: true,
  canonicalComponentOrderAndBase64Required: true,
  previousSidecarCasExpectationBound: true,
  autosaveAllowed: false,
  localStorageAllowed: false,
  persistenceIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V5,
  exactSavedRowBound: false as const,
  exactServerAssemblyRevisionBound: false as const,
  exactAssemblyTopologySha256Bound: false as const,
  exactSourceRevisionAndSha256Bound: false as const,
  nestedCompositeV4BytesPreservedExactly: false as const,
  topologyAnnotationsCanonicalAndDigestVerified: false as const,
  exactContourVertexAndMillimetreCoordinatesRequired: false as const,
  canonicalComponentOrderAndBase64Required: false as const,
  previousSidecarCasExpectationBound: false as const,
});

export type PatternImportDxfPhaseETopologyAnnotationsBindingsV1 = Readonly<{
  card: Readonly<{ techCardId: number; cardLockVersion: number }>;
  scope: Readonly<{ scopeKey: string; patternLineKey: string }>;
  savedRow: Readonly<{ revision: number; dxfSha256: string }>;
  source: Readonly<{ identity: string; revision: string; sha256: string }>;
  assembly: Readonly<{ serverRevision: string; topologySha256: string }>;
}>;

export type PatternImportDxfPhaseETopologyAnnotationAnchorV1 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  contourId: string;
  vertexId: string;
  pointMm: Readonly<{ x: number; y: number }>;
}>;

export type PatternImportDxfPhaseETopologyAnnotationMeasurementV1 = Readonly<{
  id: string;
  kind: PatternImportDxfPhaseEMeasurementKindV1;
  anchors: readonly PatternImportDxfPhaseETopologyAnnotationAnchorV1[];
  valueMm: number | null;
  label: string;
}>;

export type PatternImportDxfPhaseETopologyAnnotationCalloutV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1;
  id: string;
  anchor: PatternImportDxfPhaseETopologyAnnotationAnchorV1;
  text: string;
}>;

export type PatternImportDxfPhaseETopologyAnnotationsDocumentV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_DOCUMENT_V1;
  mediaType: typeof PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_MEDIA_TYPE_V1;
  encoding: 'canonical-json-utf8';
  bindings: PatternImportDxfPhaseETopologyAnnotationsBindingsV1;
  measurements: readonly PatternImportDxfPhaseETopologyAnnotationMeasurementV1[];
  callouts: readonly PatternImportDxfPhaseETopologyAnnotationCalloutV1[];
}>;

export type PatternImportDxfPhaseETopologyAnnotationsRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1;
  bindings: PatternImportDxfPhaseETopologyAnnotationsBindingsV1;
  measurements: readonly PatternImportDxfPhaseETopologyAnnotationMeasurementV1[];
  callouts: readonly PatternImportDxfPhaseETopologyAnnotationCalloutV1[];
}>;

export type PatternImportDxfProductCompositeSidecarComponentKindV5 =
  | 'composite-v4'
  | 'phase-e-topology-annotations-v1';

export type PatternImportDxfProductCompositeSidecarComponentV5 = Readonly<{
  kind: PatternImportDxfProductCompositeSidecarComponentKindV5;
  mediaType:
    | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4
    | typeof PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_MEDIA_TYPE_V1;
  sha256: string;
  byteLength: number;
  base64: string;
}>;

export type PatternImportDxfProductCompositeSidecarRequestV5 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5;
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
  expectedPreviousSidecarSha256: string | null;
  compositeV4Bytes: Uint8Array;
  topologyAnnotationsBytes: Uint8Array;
}>;

export type PatternImportDxfProductCompositeSidecarDocumentV5 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V5;
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5;
  encoding: 'canonical-json-utf8';
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
  writeCas: Readonly<{ expectedPreviousSidecarSha256: string | null }>;
  components: readonly [
    PatternImportDxfProductCompositeSidecarComponentV5,
    PatternImportDxfProductCompositeSidecarComponentV5,
  ];
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V5;
}>;

export type PatternImportDxfProductCompositeSidecarSealV5 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V5;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  canonicalByteLength: number;
  authority: 'unsigned-composite-sidecar-storage-consistency-only';
  persistenceIntegrated: false;
  productionReady: false;
}>;

declare const ownerBrand: unique symbol;
export type PatternImportDxfProductCompositeSidecarOwnerV5 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V5;
  document: PatternImportDxfProductCompositeSidecarDocumentV5;
  seal: PatternImportDxfProductCompositeSidecarSealV5;
  readonly [ownerBrand]: never;
}>;

export type PatternImportDxfProductCompositeSidecarBlockerCodeV5 =
  | 'invalid-input'
  | 'invalid-bytes'
  | 'invalid-utf8'
  | 'invalid-json'
  | 'unsupported-schema'
  | 'bounds-exceeded'
  | 'noncanonical-bytes'
  | 'component-order-mismatch'
  | 'component-media-mismatch'
  | 'component-digest-mismatch'
  | 'component-binding-mismatch'
  | 'nested-composite-v4-invalid'
  | 'topology-annotations-invalid'
  | 'sha256-unavailable'
  | 'invalid-owner'
  | 'stale-authority';

export type PatternImportDxfProductCompositeSidecarBlockerV5 = Readonly<{
  code: PatternImportDxfProductCompositeSidecarBlockerCodeV5;
  field: string;
  detail: string;
}>;

type CompositeV4Success = Extract<
  Awaited<ReturnType<typeof decodePatternImportDxfProductCompositeSidecarV4>>,
  { ok: true }
>;

export type PatternImportDxfProductCompositeSidecarResultV5 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductCompositeSidecarOwnerV5;
      document: PatternImportDxfProductCompositeSidecarDocumentV5;
      seal: PatternImportDxfProductCompositeSidecarSealV5;
      nestedCompositeV4: CompositeV4Success;
      topologyAnnotations: PatternImportDxfPhaseETopologyAnnotationsDocumentV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V5;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      document: null;
      seal: null;
      nestedCompositeV4: null;
      topologyAnnotations: null;
      blockers: readonly [PatternImportDxfProductCompositeSidecarBlockerV5];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export type PatternImportDxfPhaseETopologyAnnotationsEncodeResultV1 =
  | Readonly<{
      ok: true;
      document: PatternImportDxfPhaseETopologyAnnotationsDocumentV1;
      bytes: Uint8Array<ArrayBuffer>;
      sha256: string;
      byteLength: number;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      document: null;
      bytes: null;
      sha256: null;
      byteLength: null;
      blocker: PatternImportDxfProductCompositeSidecarBlockerV5;
    }>;

export type PatternImportDxfProductCompositeSidecarRestoreResultV5 =
  | Readonly<{
      ok: true;
      sourceIdentity: string;
      measurements: readonly PatternImportDxfPhaseEMeasurementV1[];
      callouts: readonly PatternImportDxfPhaseECalloutV1[];
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      sourceIdentity: null;
      measurements: null;
      callouts: null;
      blockers: readonly [PatternImportDxfProductCompositeSidecarBlockerV5];
    }>;

type OwnerState = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  components: ReadonlyMap<
    PatternImportDxfProductCompositeSidecarComponentKindV5,
    Uint8Array<ArrayBuffer>
  >;
  nestedCompositeV4: CompositeV4Success;
  topologyAnnotations: PatternImportDxfPhaseETopologyAnnotationsDocumentV1;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MAX_ID_LENGTH = 256;
const MAX_TEXT_LENGTH = 500;
const MAX_LABEL_LENGTH = 512;
const MAX_SOURCE_IDENTITY_LENGTH = 4_096;
const MAX_COMPONENT_BYTES = 48 * 1024 * 1024;
const MAX_ANNOTATIONS_BYTES = 16 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
const MAX_RECORDS = 20_000;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const ownerStates = new WeakMap<object, OwnerState>();

class CompositeV5Failure extends Error {
  constructor(
    readonly code: PatternImportDxfProductCompositeSidecarBlockerCodeV5,
    readonly field: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(
  code: PatternImportDxfProductCompositeSidecarBlockerCodeV5,
  field: string,
  detail: string,
): never {
  throw new CompositeV5Failure(code, field, detail);
}

function asBlocker(error: unknown): PatternImportDxfProductCompositeSidecarBlockerV5 {
  const failure =
    error instanceof CompositeV5Failure
      ? error
      : new CompositeV5Failure('invalid-input', 'request', 'Composite V5 failed closed.');
  return Object.freeze({ code: failure.code, field: failure.field, detail: failure.message });
}

function blocked(error: unknown): PatternImportDxfProductCompositeSidecarResultV5 {
  return Object.freeze({
    ok: false as const,
    owner: null,
    document: null,
    seal: null,
    nestedCompositeV4: null,
    topologyAnnotations: null,
    blockers: Object.freeze([asBlocker(error)]) as readonly [
      PatternImportDxfProductCompositeSidecarBlockerV5,
    ],
    claims: BLOCKED_CLAIMS,
  });
}

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!record(value)) fail('invalid-input', field, 'Expected a plain record.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('invalid-input', field, 'Record has missing, symbol, hidden, or unexpected fields.');
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value'))
      fail('invalid-input', `${field}.${key}`, 'Expected an enumerable data property.');
    output[key] = descriptor.value;
  }
  return output;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail('invalid-input', 'data', 'Canonical data contains an invalid number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!record(value)) fail('invalid-input', 'data', 'Expected detached canonical data.');
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function copyBytes(value: unknown, field: string, maximum: number): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array)) fail('invalid-bytes', field, 'Expected Uint8Array bytes.');
  const bytes = new Uint8Array(value.byteLength);
  try {
    bytes.set(value);
  } catch {
    fail('invalid-bytes', field, 'Bytes are detached or unreadable.');
  }
  if (bytes.byteLength === 0 || bytes.byteLength > maximum)
    fail('bounds-exceeded', field, 'Byte length is outside the allowed bound.');
  return bytes;
}

function parseJson(bytes: Uint8Array<ArrayBuffer>, field: string): unknown {
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    fail('invalid-utf8', field, 'Bytes are not strict UTF-8.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail('invalid-json', field, 'Bytes are not JSON.');
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1)
    difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

async function sha256(
  bytes: Uint8Array<ArrayBuffer>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 is required.');
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (digest.byteLength !== 32) throw new TypeError();
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof CompositeV5Failure) throw error;
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 digest failed.');
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const word = (a << 16) | (b << 8) | c;
    output += BASE64[(word >> 18) & 63];
    output += BASE64[(word >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64[(word >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? BASE64[word & 63] : '=';
  }
  return output;
}

function decodeBase64(value: unknown, field: string, maximum: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !value || value.length % 4 !== 0)
    fail('invalid-bytes', field, 'Expected canonical padded base64.');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const length = (value.length / 4) * 3 - padding;
  if (length <= 0 || length > maximum)
    fail('bounds-exceeded', field, 'Decoded bytes exceed their bound.');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < value.length; index += 4) {
    const quartet = [...value.slice(index, index + 4)].map((character, characterIndex) => {
      if (character === '=' && index + characterIndex >= value.length - padding) return 0;
      const found = BASE64.indexOf(character);
      if (found < 0) fail('invalid-bytes', field, 'Base64 alphabet differs.');
      return found;
    });
    const word = (quartet[0]! << 18) | (quartet[1]! << 12) | (quartet[2]! << 6) | quartet[3]!;
    if (offset < length) bytes[offset++] = (word >> 16) & 255;
    if (offset < length) bytes[offset++] = (word >> 8) & 255;
    if (offset < length) bytes[offset++] = word & 255;
  }
  if (encodeBase64(bytes) !== value) fail('invalid-bytes', field, 'Base64 is not canonical.');
  return bytes;
}

function stableString(value: unknown, field: string, maximum = MAX_ID_LENGTH): string {
  if (typeof value !== 'string' || !value || value.length > maximum || !STABLE_ID.test(value))
    fail('invalid-input', field, 'Expected one bounded stable identifier.');
  return value;
}

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value || value.length > maximum || value.trim() !== value)
    fail('invalid-input', field, 'Expected bounded, non-empty, trimmed text.');
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f))
      fail('invalid-input', field, 'Text contains a disallowed control character.');
  }
  return value;
}

function validateOuterBindings(
  value: unknown,
  field: string,
): PatternImportDxfProductCompositeSidecarBindingsV3 {
  const bindings = exactRecord(
    value,
    ['row', 'serverAssemblyRevision', 'assemblyTopologySha256'],
    field,
  );
  const row = exactRecord(
    bindings.row,
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
    `${field}.row`,
  );
  if (
    !Number.isSafeInteger(row.techCardId) ||
    (row.techCardId as number) <= 0 ||
    typeof row.scopeKey !== 'string' ||
    !row.scopeKey ||
    typeof row.patternLineKey !== 'string' ||
    !row.patternLineKey ||
    !Number.isSafeInteger(row.revision) ||
    (row.revision as number) <= 0 ||
    !Number.isSafeInteger(row.cardLockVersion) ||
    (row.cardLockVersion as number) < 0 ||
    typeof row.url !== 'string' ||
    !row.url ||
    !Number.isSafeInteger(row.sizeBytes) ||
    (row.sizeBytes as number) <= 0 ||
    typeof row.sha256 !== 'string' ||
    !SHA256.test(row.sha256) ||
    typeof bindings.serverAssemblyRevision !== 'string' ||
    !bindings.serverAssemblyRevision ||
    typeof bindings.assemblyTopologySha256 !== 'string' ||
    !SHA256.test(bindings.assemblyTopologySha256)
  )
    fail('invalid-input', field, 'Composite authority bindings are incomplete or invalid.');
  return structuredClone(bindings) as PatternImportDxfProductCompositeSidecarBindingsV3;
}

function validateAnnotationBindings(
  value: unknown,
  field: string,
): PatternImportDxfPhaseETopologyAnnotationsBindingsV1 {
  const bindings = exactRecord(value, ['card', 'scope', 'savedRow', 'source', 'assembly'], field);
  const card = exactRecord(bindings.card, ['techCardId', 'cardLockVersion'], `${field}.card`);
  const scope = exactRecord(bindings.scope, ['scopeKey', 'patternLineKey'], `${field}.scope`);
  const savedRow = exactRecord(bindings.savedRow, ['revision', 'dxfSha256'], `${field}.savedRow`);
  const source = exactRecord(
    bindings.source,
    ['identity', 'revision', 'sha256'],
    `${field}.source`,
  );
  const assembly = exactRecord(
    bindings.assembly,
    ['serverRevision', 'topologySha256'],
    `${field}.assembly`,
  );
  if (
    !Number.isSafeInteger(card.techCardId) ||
    (card.techCardId as number) <= 0 ||
    !Number.isSafeInteger(card.cardLockVersion) ||
    (card.cardLockVersion as number) < 0 ||
    typeof scope.scopeKey !== 'string' ||
    !scope.scopeKey ||
    typeof scope.patternLineKey !== 'string' ||
    !scope.patternLineKey ||
    !Number.isSafeInteger(savedRow.revision) ||
    (savedRow.revision as number) <= 0 ||
    typeof savedRow.dxfSha256 !== 'string' ||
    !SHA256.test(savedRow.dxfSha256) ||
    typeof source.identity !== 'string' ||
    !source.identity ||
    source.identity.length > MAX_SOURCE_IDENTITY_LENGTH ||
    typeof source.revision !== 'string' ||
    !source.revision ||
    source.revision.length > MAX_ID_LENGTH ||
    typeof source.sha256 !== 'string' ||
    !SHA256.test(source.sha256) ||
    typeof assembly.serverRevision !== 'string' ||
    !assembly.serverRevision ||
    typeof assembly.topologySha256 !== 'string' ||
    !SHA256.test(assembly.topologySha256)
  )
    fail('topology-annotations-invalid', field, 'Annotation authority bindings are invalid.');
  return structuredClone(bindings) as PatternImportDxfPhaseETopologyAnnotationsBindingsV1;
}

function sameAuthority(
  annotations: PatternImportDxfPhaseETopologyAnnotationsBindingsV1,
  outer: PatternImportDxfProductCompositeSidecarBindingsV3,
): boolean {
  return (
    annotations.card.techCardId === outer.row.techCardId &&
    annotations.card.cardLockVersion === outer.row.cardLockVersion &&
    annotations.scope.scopeKey === outer.row.scopeKey &&
    annotations.scope.patternLineKey === outer.row.patternLineKey &&
    annotations.savedRow.revision === outer.row.revision &&
    annotations.savedRow.dxfSha256 === outer.row.sha256 &&
    annotations.assembly.serverRevision === outer.serverAssemblyRevision &&
    annotations.assembly.topologySha256 === outer.assemblyTopologySha256
  );
}

function anchor(value: unknown, field: string): PatternImportDxfPhaseETopologyAnnotationAnchorV1 {
  const candidate = exactRecord(
    value,
    ['pieceId', 'pieceLineKey', 'contourId', 'vertexId', 'pointMm'],
    field,
  );
  const point = exactRecord(candidate.pointMm, ['x', 'y'], `${field}.pointMm`);
  stableString(candidate.pieceId, `${field}.pieceId`);
  stableString(candidate.pieceLineKey, `${field}.pieceLineKey`);
  stableString(candidate.contourId, `${field}.contourId`);
  stableString(candidate.vertexId, `${field}.vertexId`);
  if (
    typeof point.x !== 'number' ||
    !Number.isFinite(point.x) ||
    Object.is(point.x, -0) ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.y) ||
    Object.is(point.y, -0)
  )
    fail(
      'topology-annotations-invalid',
      `${field}.pointMm`,
      'Exact millimetre coordinates differ.',
    );
  return structuredClone(candidate) as PatternImportDxfPhaseETopologyAnnotationAnchorV1;
}

function measurement(
  value: unknown,
  field: string,
): PatternImportDxfPhaseETopologyAnnotationMeasurementV1 {
  const candidate = exactRecord(value, ['id', 'kind', 'anchors', 'valueMm', 'label'], field);
  stableString(candidate.id, `${field}.id`);
  if (candidate.kind !== 'point' && candidate.kind !== 'line' && candidate.kind !== 'edge')
    fail('topology-annotations-invalid', `${field}.kind`, 'Measurement kind differs.');
  if (!Array.isArray(candidate.anchors))
    fail('topology-annotations-invalid', `${field}.anchors`, 'Measurement anchors are missing.');
  const required = candidate.kind === 'point' ? 1 : 2;
  if (candidate.anchors.length !== required)
    fail('topology-annotations-invalid', `${field}.anchors`, 'Measurement anchor count differs.');
  const anchors = candidate.anchors.map((value, index) =>
    anchor(value, `${field}.anchors[${index}]`),
  );
  if (
    (candidate.kind === 'point' && candidate.valueMm !== null) ||
    (candidate.kind !== 'point' &&
      (typeof candidate.valueMm !== 'number' ||
        !Number.isFinite(candidate.valueMm) ||
        candidate.valueMm < 0 ||
        Object.is(candidate.valueMm, -0)))
  )
    fail('topology-annotations-invalid', `${field}.valueMm`, 'Measurement value is invalid.');
  boundedText(candidate.label, `${field}.label`, MAX_LABEL_LENGTH);
  return {
    id: candidate.id as string,
    kind: candidate.kind,
    anchors,
    valueMm: candidate.valueMm as number | null,
    label: candidate.label as string,
  };
}

function callout(value: unknown, field: string): PatternImportDxfPhaseETopologyAnnotationCalloutV1 {
  const candidate = exactRecord(value, ['schemaVersion', 'id', 'anchor', 'text'], field);
  if (candidate.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1)
    fail('topology-annotations-invalid', `${field}.schemaVersion`, 'Callout schema differs.');
  stableString(candidate.id, `${field}.id`);
  boundedText(candidate.text, `${field}.text`, MAX_TEXT_LENGTH);
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1,
    id: candidate.id as string,
    anchor: anchor(candidate.anchor, `${field}.anchor`),
    text: candidate.text as string,
  };
}

function validateAnnotationsDocument(
  value: unknown,
): PatternImportDxfPhaseETopologyAnnotationsDocumentV1 {
  const document = exactRecord(
    value,
    ['schemaVersion', 'mediaType', 'encoding', 'bindings', 'measurements', 'callouts'],
    'topologyAnnotations',
  );
  if (
    document.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_DOCUMENT_V1 ||
    document.mediaType !== PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_MEDIA_TYPE_V1 ||
    document.encoding !== 'canonical-json-utf8'
  )
    fail('unsupported-schema', 'topologyAnnotations', 'Topology annotation schema/media differs.');
  if (!Array.isArray(document.measurements) || !Array.isArray(document.callouts))
    fail('topology-annotations-invalid', 'topologyAnnotations', 'Annotation lists are missing.');
  if (document.measurements.length + document.callouts.length > MAX_RECORDS)
    fail('bounds-exceeded', 'topologyAnnotations', 'Annotation record bound is exceeded.');
  const measurements = document.measurements.map((value, index) =>
    measurement(value, `topologyAnnotations.measurements[${index}]`),
  );
  const callouts = document.callouts.map((value, index) =>
    callout(value, `topologyAnnotations.callouts[${index}]`),
  );
  const ids = new Set<string>();
  for (const item of [...measurements, ...callouts]) {
    if (ids.has(item.id))
      fail('topology-annotations-invalid', 'topologyAnnotations', 'Annotation ids are duplicated.');
    ids.add(item.id);
  }
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_DOCUMENT_V1,
    mediaType: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_MEDIA_TYPE_V1,
    encoding: 'canonical-json-utf8' as const,
    bindings: validateAnnotationBindings(document.bindings, 'topologyAnnotations.bindings'),
    measurements,
    callouts,
  });
}

async function decodeAnnotations(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<PatternImportDxfPhaseETopologyAnnotationsDocumentV1> {
  const document = validateAnnotationsDocument(parseJson(bytes, 'topologyAnnotationsBytes'));
  if (!sameBytes(bytes, encoder.encode(canonical(document))))
    fail('noncanonical-bytes', 'topologyAnnotationsBytes', 'Annotation bytes are not canonical.');
  return document;
}

export async function encodePatternImportDxfPhaseETopologyAnnotationsV1(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfPhaseETopologyAnnotationsEncodeResultV1> {
  try {
    const request = exactRecord(
      input,
      ['schemaVersion', 'bindings', 'measurements', 'callouts'],
      'request',
    );
    if (request.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1)
      fail('unsupported-schema', 'request.schemaVersion', 'Annotation request schema differs.');
    const document = validateAnnotationsDocument({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_DOCUMENT_V1,
      mediaType: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_MEDIA_TYPE_V1,
      encoding: 'canonical-json-utf8',
      bindings: request.bindings,
      measurements: request.measurements,
      callouts: request.callouts,
    });
    const bytes = encoder.encode(canonical(document));
    if (bytes.byteLength > MAX_ANNOTATIONS_BYTES)
      fail('bounds-exceeded', 'topologyAnnotations', 'Annotation component exceeds its bound.');
    return Object.freeze({
      ok: true as const,
      document,
      bytes: bytes.slice(),
      sha256: await sha256(bytes, crypto),
      byteLength: bytes.byteLength,
      blocker: null,
    });
  } catch (error) {
    return Object.freeze({
      ok: false as const,
      document: null,
      bytes: null,
      sha256: null,
      byteLength: null,
      blocker: asBlocker(error),
    });
  }
}

function componentMetadata(
  value: unknown,
  index: number,
): PatternImportDxfProductCompositeSidecarComponentV5 {
  const field = `document.components[${index}]`;
  const component = exactRecord(
    value,
    ['kind', 'mediaType', 'sha256', 'byteLength', 'base64'],
    field,
  );
  const expectedKind = index === 0 ? 'composite-v4' : 'phase-e-topology-annotations-v1';
  const expectedMedia =
    index === 0
      ? PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4
      : PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_MEDIA_TYPE_V1;
  if (component.kind !== expectedKind)
    fail('component-order-mismatch', `${field}.kind`, 'V5 components are missing or reordered.');
  if (component.mediaType !== expectedMedia)
    fail('component-media-mismatch', `${field}.mediaType`, 'Component media type differs.');
  if (typeof component.sha256 !== 'string' || !SHA256.test(component.sha256))
    fail('invalid-input', `${field}.sha256`, 'Component digest is invalid.');
  if (!Number.isSafeInteger(component.byteLength) || (component.byteLength as number) <= 0)
    fail('invalid-input', `${field}.byteLength`, 'Component length is invalid.');
  if (typeof component.base64 !== 'string')
    fail('invalid-input', `${field}.base64`, 'Component base64 is invalid.');
  return component as PatternImportDxfProductCompositeSidecarComponentV5;
}

async function verifyComponents(
  components: readonly PatternImportDxfProductCompositeSidecarComponentV5[],
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  if (components.length !== 2)
    fail('component-order-mismatch', 'document.components', 'V5 requires two components.');
  const v4Metadata = componentMetadata(components[0], 0);
  const annotationsMetadata = componentMetadata(components[1], 1);
  const v4Bytes = decodeBase64(
    v4Metadata.base64,
    'document.components[0].base64',
    MAX_COMPONENT_BYTES,
  );
  const annotationsBytes = decodeBase64(
    annotationsMetadata.base64,
    'document.components[1].base64',
    MAX_ANNOTATIONS_BYTES,
  );
  for (const [index, pair] of [
    [v4Metadata, v4Bytes],
    [annotationsMetadata, annotationsBytes],
  ].entries()) {
    const [metadata, bytes] = pair as [
      PatternImportDxfProductCompositeSidecarComponentV5,
      Uint8Array<ArrayBuffer>,
    ];
    if (
      metadata.byteLength !== bytes.byteLength ||
      metadata.sha256 !== (await sha256(bytes, crypto))
    )
      fail(
        'component-digest-mismatch',
        `document.components[${index}]`,
        'Component digest differs.',
      );
  }
  const nestedCompositeV4 = await decodePatternImportDxfProductCompositeSidecarV4(v4Bytes, crypto);
  if (!nestedCompositeV4.ok)
    fail(
      'nested-composite-v4-invalid',
      'components.composite-v4',
      nestedCompositeV4.blockers[0].detail,
    );
  if (canonical(nestedCompositeV4.document.bindings) !== canonical(bindings))
    fail('component-binding-mismatch', 'components.composite-v4', 'Nested V4 authority differs.');
  const topologyAnnotations = await decodeAnnotations(annotationsBytes);
  if (!sameAuthority(topologyAnnotations.bindings, bindings))
    fail(
      'component-binding-mismatch',
      'components.phase-e-topology-annotations-v1',
      'Annotation authority differs from the outer saved-row authority.',
    );
  return Object.freeze({
    nestedCompositeV4,
    topologyAnnotations,
    bytes: new Map<PatternImportDxfProductCompositeSidecarComponentKindV5, Uint8Array<ArrayBuffer>>(
      [
        ['composite-v4', v4Bytes.slice()],
        ['phase-e-topology-annotations-v1', annotationsBytes.slice()],
      ],
    ),
  });
}

async function makeComponent(
  kind: PatternImportDxfProductCompositeSidecarComponentKindV5,
  mediaType: PatternImportDxfProductCompositeSidecarComponentV5['mediaType'],
  bytes: Uint8Array<ArrayBuffer>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<PatternImportDxfProductCompositeSidecarComponentV5> {
  return Object.freeze({
    kind,
    mediaType,
    sha256: await sha256(bytes, crypto),
    byteLength: bytes.byteLength,
    base64: encodeBase64(bytes),
  });
}

function makeSeal(sha: string, byteLength: number): PatternImportDxfProductCompositeSidecarSealV5 {
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V5,
    algorithm: 'SHA-256' as const,
    canonicalSha256: sha,
    canonicalByteLength: byteLength,
    authority: 'unsigned-composite-sidecar-storage-consistency-only' as const,
    persistenceIntegrated: false as const,
    productionReady: false as const,
  });
}

function makeOwner(
  document: PatternImportDxfProductCompositeSidecarDocumentV5,
  seal: PatternImportDxfProductCompositeSidecarSealV5,
  bytes: Uint8Array<ArrayBuffer>,
  verified: Awaited<ReturnType<typeof verifyComponents>>,
): PatternImportDxfProductCompositeSidecarOwnerV5 {
  const owner = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V5,
    document,
    seal,
  }) as PatternImportDxfProductCompositeSidecarOwnerV5;
  ownerStates.set(owner, {
    bytes: bytes.slice(),
    components: new Map([...verified.bytes].map(([kind, value]) => [kind, value.slice()])),
    nestedCompositeV4: verified.nestedCompositeV4,
    topologyAnnotations: verified.topologyAnnotations,
  });
  return owner;
}

function captureRequest(input: unknown) {
  const request = exactRecord(
    input,
    [
      'schemaVersion',
      'bindings',
      'expectedPreviousSidecarSha256',
      'compositeV4Bytes',
      'topologyAnnotationsBytes',
    ],
    'request',
  );
  if (request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5)
    fail('unsupported-schema', 'request.schemaVersion', 'Composite V5 request schema differs.');
  if (
    request.expectedPreviousSidecarSha256 !== null &&
    (typeof request.expectedPreviousSidecarSha256 !== 'string' ||
      !SHA256.test(request.expectedPreviousSidecarSha256))
  )
    fail('invalid-input', 'request.expectedPreviousSidecarSha256', 'CAS digest is invalid.');
  return Object.freeze({
    bindings: validateOuterBindings(request.bindings, 'request.bindings'),
    expectedPreviousSidecarSha256: request.expectedPreviousSidecarSha256 as string | null,
    compositeV4Bytes: copyBytes(
      request.compositeV4Bytes,
      'request.compositeV4Bytes',
      MAX_COMPONENT_BYTES,
    ),
    topologyAnnotationsBytes: copyBytes(
      request.topologyAnnotationsBytes,
      'request.topologyAnnotationsBytes',
      MAX_ANNOTATIONS_BYTES,
    ),
  });
}

export async function buildPatternImportDxfProductCompositeSidecarV5(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCompositeSidecarResultV5> {
  try {
    const request = captureRequest(input);
    const components = Object.freeze([
      await makeComponent(
        'composite-v4',
        PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
        request.compositeV4Bytes,
        crypto,
      ),
      await makeComponent(
        'phase-e-topology-annotations-v1',
        PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_MEDIA_TYPE_V1,
        request.topologyAnnotationsBytes,
        crypto,
      ),
    ]) as PatternImportDxfProductCompositeSidecarDocumentV5['components'];
    const verified = await verifyComponents(components, request.bindings, crypto);
    const document = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V5,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
      encoding: 'canonical-json-utf8' as const,
      bindings: request.bindings,
      writeCas: Object.freeze({
        expectedPreviousSidecarSha256: request.expectedPreviousSidecarSha256,
      }),
      components,
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V5,
    } satisfies PatternImportDxfProductCompositeSidecarDocumentV5);
    const bytes = encoder.encode(canonical(document));
    if (bytes.byteLength > MAX_DOCUMENT_BYTES)
      fail('bounds-exceeded', 'document', 'Composite V5 document exceeds its bound.');
    const seal = makeSeal(await sha256(bytes, crypto), bytes.byteLength);
    const owner = makeOwner(document, seal, bytes, verified);
    return Object.freeze({
      ok: true as const,
      owner,
      document,
      seal,
      nestedCompositeV4: verified.nestedCompositeV4,
      topologyAnnotations: verified.topologyAnnotations,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V5,
    });
  } catch (error) {
    return blocked(error);
  }
}

function validateDocument(value: unknown): PatternImportDxfProductCompositeSidecarDocumentV5 {
  const document = exactRecord(
    value,
    ['schemaVersion', 'mediaType', 'encoding', 'bindings', 'writeCas', 'components', 'claims'],
    'document',
  );
  if (
    document.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V5 ||
    document.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 ||
    document.encoding !== 'canonical-json-utf8'
  )
    fail('unsupported-schema', 'document', 'Composite V5 schema/media/encoding differs.');
  validateOuterBindings(document.bindings, 'document.bindings');
  const writeCas = exactRecord(
    document.writeCas,
    ['expectedPreviousSidecarSha256'],
    'document.writeCas',
  );
  if (
    writeCas.expectedPreviousSidecarSha256 !== null &&
    (typeof writeCas.expectedPreviousSidecarSha256 !== 'string' ||
      !SHA256.test(writeCas.expectedPreviousSidecarSha256))
  )
    fail('invalid-input', 'document.writeCas', 'CAS digest is invalid.');
  if (!Array.isArray(document.components) || document.components.length !== 2)
    fail('component-order-mismatch', 'document.components', 'V5 requires two components.');
  componentMetadata(document.components[0], 0);
  componentMetadata(document.components[1], 1);
  if (
    canonical(document.claims) !== canonical(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V5)
  )
    fail('invalid-input', 'document.claims', 'Composite V5 claims differ.');
  return document as PatternImportDxfProductCompositeSidecarDocumentV5;
}

export async function decodePatternImportDxfProductCompositeSidecarV5(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCompositeSidecarResultV5> {
  try {
    const bytes = copyBytes(input, 'bytes', MAX_DOCUMENT_BYTES);
    const document = validateDocument(parseJson(bytes, 'bytes'));
    const canonicalBytes = encoder.encode(canonical(document));
    if (!sameBytes(bytes, canonicalBytes))
      fail('noncanonical-bytes', 'bytes', 'Composite V5 bytes are not canonical.');
    const verified = await verifyComponents(document.components, document.bindings, crypto);
    const frozenDocument = deepFreeze(structuredClone(document));
    const seal = makeSeal(await sha256(canonicalBytes, crypto), canonicalBytes.byteLength);
    const owner = makeOwner(frozenDocument, seal, canonicalBytes, verified);
    return Object.freeze({
      ok: true as const,
      owner,
      document: frozenDocument,
      seal,
      nestedCompositeV4: verified.nestedCompositeV4,
      topologyAnnotations: verified.topologyAnnotations,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V5,
    });
  } catch (error) {
    return blocked(error);
  }
}

export function encodePatternImportDxfProductCompositeSidecarV5(candidate: unknown) {
  if (!candidate || typeof candidate !== 'object')
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  const state = ownerStates.get(candidate);
  if (!state)
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  const owner = candidate as PatternImportDxfProductCompositeSidecarOwnerV5;
  return Object.freeze({
    ok: true as const,
    bytes: state.bytes.slice(),
    canonicalSha256: owner.seal.canonicalSha256,
    canonicalByteLength: state.bytes.byteLength,
  });
}

export function readPatternImportDxfProductCompositeComponentBytesV5(
  candidate: unknown,
  kind: PatternImportDxfProductCompositeSidecarComponentKindV5,
): Uint8Array<ArrayBuffer> | null {
  if (!candidate || typeof candidate !== 'object') return null;
  return ownerStates.get(candidate)?.components.get(kind)?.slice() ?? null;
}

export function restorePatternImportDxfPhaseETopologyAnnotationsV5(
  candidate: unknown,
  expected: Readonly<{
    bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
    sourceIdentity: string;
    sourceRevision: string;
    sourceSha256: string;
  }>,
): PatternImportDxfProductCompositeSidecarRestoreResultV5 {
  try {
    if (!candidate || typeof candidate !== 'object' || !record(expected))
      fail(
        'invalid-owner',
        'owner',
        'A genuine Composite V5 owner and current authority are required.',
      );
    const state = ownerStates.get(candidate);
    if (!state) fail('invalid-owner', 'owner', 'A genuine Composite V5 owner is required.');
    const expectedBindings = validateOuterBindings(expected.bindings, 'expected.bindings');
    const bindings = state.topologyAnnotations.bindings;
    if (
      !sameAuthority(bindings, expectedBindings) ||
      bindings.source.identity !== expected.sourceIdentity ||
      bindings.source.revision !== expected.sourceRevision ||
      bindings.source.sha256 !== expected.sourceSha256
    )
      fail(
        'stale-authority',
        'expected',
        'Annotation card/scope/source revision or SHA differs from current authority.',
      );
    const withoutPointMm = (
      itemAnchor: PatternImportDxfPhaseETopologyAnnotationAnchorV1,
    ): PatternImportDxfPhaseEVertexAnchorV1 => ({
      pieceId: itemAnchor.pieceId,
      pieceLineKey: itemAnchor.pieceLineKey,
      contourId: itemAnchor.contourId,
      vertexId: itemAnchor.vertexId,
    });
    const measurements = state.topologyAnnotations.measurements.map((item) =>
      deepFreeze({
        id: item.id,
        kind: item.kind,
        anchors: item.anchors.map(withoutPointMm),
        valueMm: item.valueMm,
        label: item.label,
      } satisfies PatternImportDxfPhaseEMeasurementV1),
    );
    const callouts = state.topologyAnnotations.callouts.map((item) =>
      deepFreeze({
        schemaVersion: item.schemaVersion,
        id: item.id,
        anchor: withoutPointMm(item.anchor),
        text: item.text,
      } satisfies PatternImportDxfPhaseECalloutV1),
    );
    return Object.freeze({
      ok: true as const,
      sourceIdentity: bindings.source.identity,
      measurements: Object.freeze(measurements),
      callouts: Object.freeze(callouts),
      blockers: Object.freeze([]) as readonly [],
    });
  } catch (error) {
    return Object.freeze({
      ok: false as const,
      sourceIdentity: null,
      measurements: null,
      callouts: null,
      blockers: Object.freeze([asBlocker(error)]) as readonly [
        PatternImportDxfProductCompositeSidecarBlockerV5,
      ],
    });
  }
}

export function derivePatternImportDxfPhaseETopologyAnnotationsBindingsV1(
  authority: PatternImportDxfProductCompositeSidecarBindingsV3,
  source: Readonly<{ identity: string; revision: string; sha256: string }>,
): PatternImportDxfPhaseETopologyAnnotationsBindingsV1 {
  return deepFreeze({
    card: { techCardId: authority.row.techCardId, cardLockVersion: authority.row.cardLockVersion },
    scope: { scopeKey: authority.row.scopeKey, patternLineKey: authority.row.patternLineKey },
    savedRow: { revision: authority.row.revision, dxfSha256: authority.row.sha256 },
    source,
    assembly: {
      serverRevision: authority.serverAssemblyRevision,
      topologySha256: authority.assemblyTopologySha256,
    },
  });
}

export type PatternImportDxfPhaseETopologyAnnotationAnchorInputV1 = Readonly<{
  anchor: PatternImportDxfPhaseEVertexAnchorV1;
  pointMm: Readonly<{ x: number; y: number }>;
}>;

export type PatternImportDxfProductCompositeSidecarNestedV4OwnerV5 =
  PatternImportDxfProductCompositeSidecarOwnerV4;
