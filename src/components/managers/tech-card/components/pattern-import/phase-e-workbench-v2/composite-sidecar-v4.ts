import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  decodePatternImportDxfProductCompositeSidecarV3,
  type PatternImportDxfProductCompositeSidecarBindingsV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  verifyPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2,
  type PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2,
  type PatternImportDxfPhaseEExactNSeamConsistencySealV2,
} from './exact-n-seam-consistency-carrier-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4 =
  'pattern-import-dxf-product-composite-sidecar-request/4' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V4 =
  'pattern-import-dxf-product-composite-sidecar-document/4' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V4 =
  'pattern-import-dxf-product-composite-sidecar-seal/4' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V4 =
  'pattern-import-dxf-product-composite-sidecar-owner/4' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 =
  'application/vnd.grbpwr.pattern-dxf-product-composite.v4+json' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_N_SEAM_COMPONENT_MEDIA_TYPE_V2 =
  'application/vnd.grbpwr.pattern-dxf-product-phase-e-exact-n-seam-consistency.v2+json' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V4 = Object.freeze({
  exactSavedRowBound: true,
  exactServerAssemblyRevisionBound: true,
  exactAssemblyTopologySha256Bound: true,
  nestedCompositeV3BytesVerified: true,
  nestedCompositeV3BindingsVerified: true,
  nestedCompositeV3ExactTopologyForbidden: true,
  exactNConsistencyCarrierAndSealVerified: true,
  exactNConsistencyRestoreProjectionAvailable: true,
  exactNAuthorityRestorePatchAvailable: false,
  canonicalComponentOrderAndBase64Required: true,
  previousSidecarCasExpectationBound: true,
  twoSeamV1BypassCreated: false,
  persistenceIntegrated: false,
  sidecarGetPerformed: false,
  sidecarPutPerformed: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V4,
  exactSavedRowBound: false as const,
  exactServerAssemblyRevisionBound: false as const,
  exactAssemblyTopologySha256Bound: false as const,
  nestedCompositeV3BytesVerified: false as const,
  nestedCompositeV3BindingsVerified: false as const,
  nestedCompositeV3ExactTopologyForbidden: false as const,
  exactNConsistencyCarrierAndSealVerified: false as const,
  exactNConsistencyRestoreProjectionAvailable: false as const,
  canonicalComponentOrderAndBase64Required: false as const,
  previousSidecarCasExpectationBound: false as const,
});

export type PatternImportDxfProductCompositeSidecarComponentKindV4 =
  'composite-v3' | 'phase-e-exact-n-seam-consistency-v2';

export type PatternImportDxfProductCompositeSidecarComponentV4 = Readonly<{
  kind: PatternImportDxfProductCompositeSidecarComponentKindV4;
  mediaType:
    | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3
    | typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_N_SEAM_COMPONENT_MEDIA_TYPE_V2;
  sha256: string;
  byteLength: number;
  base64: string;
}>;

export type PatternImportDxfProductCompositeSidecarRequestV4 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4;
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
  expectedPreviousSidecarSha256: string | null;
  compositeV3Bytes: Uint8Array;
  exactNSeamConsistencyBytes: Uint8Array;
}>;

export type PatternImportDxfProductCompositeSidecarDocumentV4 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V4;
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4;
  encoding: 'canonical-json-utf8';
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
  writeCas: Readonly<{ expectedPreviousSidecarSha256: string | null }>;
  components: readonly [
    PatternImportDxfProductCompositeSidecarComponentV4,
    PatternImportDxfProductCompositeSidecarComponentV4,
  ];
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V4;
}>;

export type PatternImportDxfProductCompositeSidecarSealV4 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V4;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  canonicalByteLength: number;
  authority: 'unsigned-composite-sidecar-storage-consistency-only';
  persistenceIntegrated: false;
  productionReady: false;
}>;

export type PatternImportDxfProductExactNSeamRestoreProjectionV4 = Readonly<{
  status: 'verified-consistency-only';
  authorityAvailable: false;
  bindings: PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2['bindings'];
  seams: PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2['seams'];
  carrierFingerprintSha256: string;
  persistenceIntegrated: false;
}>;

declare const ownerBrand: unique symbol;
export type PatternImportDxfProductCompositeSidecarOwnerV4 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V4;
  document: PatternImportDxfProductCompositeSidecarDocumentV4;
  seal: PatternImportDxfProductCompositeSidecarSealV4;
  readonly [ownerBrand]: never;
}>;

export type PatternImportDxfProductCompositeSidecarBlockerCodeV4 =
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
  | 'nested-composite-v3-invalid'
  | 'nested-composite-v3-exact-topology-conflict'
  | 'exact-n-seam-component-invalid'
  | 'v1-two-seam-path-required'
  | 'sha256-unavailable'
  | 'invalid-owner';

export type PatternImportDxfProductCompositeSidecarBlockerV4 = Readonly<{
  code: PatternImportDxfProductCompositeSidecarBlockerCodeV4;
  field: string;
  detail: string;
}>;

type ExactNProjection = Readonly<{
  carrier: PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2;
  seal: PatternImportDxfPhaseEExactNSeamConsistencySealV2;
  restoreProjection: PatternImportDxfProductExactNSeamRestoreProjectionV4;
  authorityRestoreOwner: null;
}>;

type CompositeV3Success = Extract<
  Awaited<ReturnType<typeof decodePatternImportDxfProductCompositeSidecarV3>>,
  { ok: true }
>;

export type PatternImportDxfProductCompositeSidecarResultV4 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductCompositeSidecarOwnerV4;
      document: PatternImportDxfProductCompositeSidecarDocumentV4;
      seal: PatternImportDxfProductCompositeSidecarSealV4;
      nestedCompositeV3: CompositeV3Success;
      exactNSeam: ExactNProjection;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V4;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      document: null;
      seal: null;
      nestedCompositeV3: null;
      exactNSeam: null;
      blockers: readonly [PatternImportDxfProductCompositeSidecarBlockerV4];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export type EncodePatternImportDxfProductCompositeSidecarResultV4 =
  | Readonly<{
      ok: true;
      bytes: Uint8Array<ArrayBuffer>;
      canonicalSha256: string;
      canonicalByteLength: number;
    }>
  | Readonly<{ ok: false; code: 'invalid-owner'; bytes: null }>;

export type EncodePatternImportDxfProductExactNSeamComponentResultV4 =
  | Readonly<{
      ok: true;
      bytes: Uint8Array<ArrayBuffer>;
      sha256: string;
      byteLength: number;
    }>
  | Readonly<{
      ok: false;
      bytes: null;
      blocker: PatternImportDxfProductCompositeSidecarBlockerV4;
    }>;

type OwnerState = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  components: ReadonlyMap<
    PatternImportDxfProductCompositeSidecarComponentKindV4,
    Uint8Array<ArrayBuffer>
  >;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_COMPONENT_BYTES = 24 * 1024 * 1024;
const MAX_EXACT_N_BYTES = 16 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 48 * 1024 * 1024;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const ownerStates = new WeakMap<object, OwnerState>();

class CompositeV4Failure extends Error {
  constructor(
    readonly code: PatternImportDxfProductCompositeSidecarBlockerCodeV4,
    readonly field: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(
  code: PatternImportDxfProductCompositeSidecarBlockerCodeV4,
  field: string,
  detail: string,
): never {
  throw new CompositeV4Failure(code, field, detail);
}

function asBlocker(error: unknown): PatternImportDxfProductCompositeSidecarBlockerV4 {
  const failure =
    error instanceof CompositeV4Failure
      ? error
      : new CompositeV4Failure('invalid-input', 'request', 'Composite V4 failed closed.');
  return Object.freeze({ code: failure.code, field: failure.field, detail: failure.message });
}

function blocked(error: unknown): PatternImportDxfProductCompositeSidecarResultV4 {
  return Object.freeze({
    ok: false as const,
    owner: null,
    document: null,
    seal: null,
    nestedCompositeV3: null,
    exactNSeam: null,
    blockers: Object.freeze([asBlocker(error)]) as readonly [
      PatternImportDxfProductCompositeSidecarBlockerV4,
    ],
    claims: BLOCKED_CLAIMS,
  });
}

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!record(value)) fail('invalid-input', field, 'Expected a plain record.');
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', field, 'Record reflection failed.');
  }
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('invalid-input', field, 'Record has missing, hidden, symbol, or unexpected fields.');
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
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
      fail('invalid-input', 'data', 'Invalid number.');
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
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(value.byteLength);
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
    return JSON.parse(text);
  } catch {
    fail('invalid-json', field, 'Bytes are not JSON.');
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
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
    if (error instanceof CompositeV4Failure) throw error;
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 digest failed.');
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
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
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0)
    fail('invalid-bytes', field, 'Expected canonical padded base64.');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const length = (value.length / 4) * 3 - padding;
  if (length <= 0 || length > maximum)
    fail('bounds-exceeded', field, 'Decoded bytes exceed bound.');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < value.length; index += 4) {
    const chars = value.slice(index, index + 4);
    const values = [...chars].map((character, charIndex) => {
      if (character === '=' && index + charIndex >= value.length - padding) return 0;
      const found = BASE64.indexOf(character);
      if (found < 0) fail('invalid-bytes', field, 'Base64 alphabet differs.');
      return found;
    });
    const word = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    if (offset < length) bytes[offset++] = (word >> 16) & 255;
    if (offset < length) bytes[offset++] = (word >> 8) & 255;
    if (offset < length) bytes[offset++] = word & 255;
  }
  if (encodeBase64(bytes) !== value) fail('invalid-bytes', field, 'Base64 is not canonical.');
  return bytes;
}

function sameRow(
  left: PatternImportDxfProductCompositeSidecarBindingsV3['row'],
  right: PatternImportDxfProductCompositeSidecarBindingsV3['row'],
): boolean {
  return canonical(left) === canonical(right);
}

function validateBindings(
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
    fail('invalid-input', field, 'Bindings are incomplete or invalid.');
  return structuredClone(bindings) as PatternImportDxfProductCompositeSidecarBindingsV3;
}

function componentMetadata(
  value: unknown,
  index: number,
): PatternImportDxfProductCompositeSidecarComponentV4 {
  const field = `document.components[${index}]`;
  const component = exactRecord(
    value,
    ['kind', 'mediaType', 'sha256', 'byteLength', 'base64'],
    field,
  );
  const expected = index === 0 ? 'composite-v3' : 'phase-e-exact-n-seam-consistency-v2';
  const media =
    index === 0
      ? PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3
      : PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_N_SEAM_COMPONENT_MEDIA_TYPE_V2;
  if (component.kind !== expected)
    fail(
      'component-order-mismatch',
      `${field}.kind`,
      'V4 components are missing, duplicated or reordered.',
    );
  if (component.mediaType !== media)
    fail('component-media-mismatch', `${field}.mediaType`, 'Component media type differs.');
  if (typeof component.sha256 !== 'string' || !SHA256.test(component.sha256))
    fail('invalid-input', `${field}.sha256`, 'Component SHA-256 is invalid.');
  if (!Number.isSafeInteger(component.byteLength) || (component.byteLength as number) <= 0)
    fail('invalid-input', `${field}.byteLength`, 'Component length is invalid.');
  if (typeof component.base64 !== 'string')
    fail('invalid-input', `${field}.base64`, 'Component base64 is invalid.');
  return component as PatternImportDxfProductCompositeSidecarComponentV4;
}

function makeRestoreProjection(
  carrier: PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2,
): PatternImportDxfProductExactNSeamRestoreProjectionV4 {
  return deepFreeze({
    status: 'verified-consistency-only' as const,
    authorityAvailable: false as const,
    bindings: carrier.bindings,
    seams: carrier.seams,
    carrierFingerprintSha256: carrier.fingerprint.canonicalSha256,
    persistenceIntegrated: false as const,
  });
}

async function verifyExactNBytes(
  bytes: Uint8Array<ArrayBuffer>,
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<ExactNProjection> {
  const parsed = parseJson(bytes, 'components.phase-e-exact-n-seam-consistency-v2');
  const canonicalBytes = encoder.encode(canonical(parsed));
  if (!sameBytes(bytes, canonicalBytes))
    fail(
      'noncanonical-bytes',
      'components.phase-e-exact-n-seam-consistency-v2',
      'Exact N-seam bytes are not canonical.',
    );
  const verified = await verifyPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2(parsed, {
    crypto,
  });
  if (!verified.ok) {
    const code = verified.blockers[0].code;
    fail(
      code === 'v1-two-seam-path-required'
        ? 'v1-two-seam-path-required'
        : 'exact-n-seam-component-invalid',
      'components.phase-e-exact-n-seam-consistency-v2',
      verified.blockers[0].detail,
    );
  }
  const carrierBindings = verified.carrier.bindings;
  if (
    !sameRow(carrierBindings.row, bindings.row) ||
    carrierBindings.serverAssemblyRevision !== bindings.serverAssemblyRevision ||
    carrierBindings.assemblyTopologySha256 !== bindings.assemblyTopologySha256
  )
    fail(
      'component-binding-mismatch',
      'components.phase-e-exact-n-seam-consistency-v2',
      'Exact N-seam component differs from outer saved-row or Assembly bindings.',
    );
  return deepFreeze({
    carrier: verified.carrier,
    seal: verified.seal,
    restoreProjection: makeRestoreProjection(verified.carrier),
    authorityRestoreOwner: null,
  });
}

async function verifyNestedV3(
  bytes: Uint8Array<ArrayBuffer>,
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<CompositeV3Success> {
  const decoded = await decodePatternImportDxfProductCompositeSidecarV3(bytes, crypto);
  if (!decoded.ok)
    fail('nested-composite-v3-invalid', 'components.composite-v3', decoded.blockers[0].detail);
  if (
    !sameRow(decoded.document.bindings.row, bindings.row) ||
    decoded.document.bindings.serverAssemblyRevision !== bindings.serverAssemblyRevision ||
    decoded.document.bindings.assemblyTopologySha256 !== bindings.assemblyTopologySha256
  )
    fail('component-binding-mismatch', 'components.composite-v3', 'Nested V3 bindings differ.');
  if (decoded.exactTopology)
    fail(
      'nested-composite-v3-exact-topology-conflict',
      'components.composite-v3',
      'An N-seam V4 document cannot also carry the fixed two-seam V1 exact component.',
    );
  return decoded;
}

async function verifyComponents(
  components: readonly PatternImportDxfProductCompositeSidecarComponentV4[],
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<
  Readonly<{
    nestedCompositeV3: CompositeV3Success;
    exactNSeam: ExactNProjection;
    bytes: ReadonlyMap<
      PatternImportDxfProductCompositeSidecarComponentKindV4,
      Uint8Array<ArrayBuffer>
    >;
  }>
> {
  if (components.length !== 2)
    fail(
      'component-order-mismatch',
      'document.components',
      'V4 requires exactly two ordered components.',
    );
  const first = componentMetadata(components[0], 0);
  const second = componentMetadata(components[1], 1);
  const firstBytes = decodeBase64(
    first.base64,
    'document.components[0].base64',
    MAX_COMPONENT_BYTES,
  );
  const secondBytes = decodeBase64(
    second.base64,
    'document.components[1].base64',
    MAX_EXACT_N_BYTES,
  );
  for (const [index, pair] of [
    [first, firstBytes],
    [second, secondBytes],
  ].entries()) {
    const [metadata, bytes] = pair as [
      PatternImportDxfProductCompositeSidecarComponentV4,
      Uint8Array<ArrayBuffer>,
    ];
    if (
      metadata.byteLength !== bytes.byteLength ||
      metadata.sha256 !== (await sha256(bytes, crypto))
    )
      fail(
        'component-digest-mismatch',
        `document.components[${index}]`,
        'Component digest or length differs.',
      );
  }
  const nestedCompositeV3 = await verifyNestedV3(firstBytes, bindings, crypto);
  const exactNSeam = await verifyExactNBytes(secondBytes, bindings, crypto);
  return Object.freeze({
    nestedCompositeV3,
    exactNSeam,
    bytes: new Map<PatternImportDxfProductCompositeSidecarComponentKindV4, Uint8Array<ArrayBuffer>>(
      [
        ['composite-v3', firstBytes.slice()],
        ['phase-e-exact-n-seam-consistency-v2', secondBytes.slice()],
      ],
    ),
  });
}

async function makeComponent(
  kind: PatternImportDxfProductCompositeSidecarComponentKindV4,
  mediaType: PatternImportDxfProductCompositeSidecarComponentV4['mediaType'],
  bytes: Uint8Array<ArrayBuffer>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<PatternImportDxfProductCompositeSidecarComponentV4> {
  return Object.freeze({
    kind,
    mediaType,
    sha256: await sha256(bytes, crypto),
    byteLength: bytes.byteLength,
    base64: encodeBase64(bytes),
  });
}

function makeSeal(
  sha256: string,
  byteLength: number,
): PatternImportDxfProductCompositeSidecarSealV4 {
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V4,
    algorithm: 'SHA-256' as const,
    canonicalSha256: sha256,
    canonicalByteLength: byteLength,
    authority: 'unsigned-composite-sidecar-storage-consistency-only' as const,
    persistenceIntegrated: false as const,
    productionReady: false as const,
  });
}

function makeOwner(
  document: PatternImportDxfProductCompositeSidecarDocumentV4,
  seal: PatternImportDxfProductCompositeSidecarSealV4,
  bytes: Uint8Array<ArrayBuffer>,
  components: ReadonlyMap<
    PatternImportDxfProductCompositeSidecarComponentKindV4,
    Uint8Array<ArrayBuffer>
  >,
): PatternImportDxfProductCompositeSidecarOwnerV4 {
  const owner = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V4,
    document,
    seal,
  }) as PatternImportDxfProductCompositeSidecarOwnerV4;
  ownerStates.set(owner, {
    bytes: bytes.slice(),
    components: new Map([...components].map(([kind, value]) => [kind, value.slice()])),
  });
  return owner;
}

export async function encodePatternImportDxfProductExactNSeamComponentV4(
  envelope: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<EncodePatternImportDxfProductExactNSeamComponentResultV4> {
  try {
    const verified = await verifyPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2(envelope, {
      crypto,
    });
    if (!verified.ok)
      fail(
        verified.blockers[0].code === 'v1-two-seam-path-required'
          ? 'v1-two-seam-path-required'
          : 'exact-n-seam-component-invalid',
        'envelope',
        verified.blockers[0].detail,
      );
    const bytes = encoder.encode(canonical({ carrier: verified.carrier, seal: verified.seal }));
    if (bytes.byteLength > MAX_EXACT_N_BYTES)
      fail('bounds-exceeded', 'envelope', 'Exact N-seam component exceeds the byte bound.');
    return Object.freeze({
      ok: true as const,
      bytes: bytes.slice(),
      sha256: await sha256(bytes, crypto),
      byteLength: bytes.byteLength,
    });
  } catch (error) {
    return Object.freeze({ ok: false as const, bytes: null, blocker: asBlocker(error) });
  }
}

function captureRequest(input: unknown): Readonly<{
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
  expectedPreviousSidecarSha256: string | null;
  compositeV3Bytes: Uint8Array<ArrayBuffer>;
  exactNSeamConsistencyBytes: Uint8Array<ArrayBuffer>;
}> {
  const request = exactRecord(
    input,
    [
      'schemaVersion',
      'bindings',
      'expectedPreviousSidecarSha256',
      'compositeV3Bytes',
      'exactNSeamConsistencyBytes',
    ],
    'request',
  );
  if (request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4)
    fail('unsupported-schema', 'request.schemaVersion', 'Composite V4 request schema differs.');
  if (
    request.expectedPreviousSidecarSha256 !== null &&
    (typeof request.expectedPreviousSidecarSha256 !== 'string' ||
      !SHA256.test(request.expectedPreviousSidecarSha256))
  )
    fail('invalid-input', 'request.expectedPreviousSidecarSha256', 'CAS SHA-256 is invalid.');
  return Object.freeze({
    bindings: validateBindings(request.bindings, 'request.bindings'),
    expectedPreviousSidecarSha256: request.expectedPreviousSidecarSha256 as string | null,
    compositeV3Bytes: copyBytes(
      request.compositeV3Bytes,
      'request.compositeV3Bytes',
      MAX_COMPONENT_BYTES,
    ),
    exactNSeamConsistencyBytes: copyBytes(
      request.exactNSeamConsistencyBytes,
      'request.exactNSeamConsistencyBytes',
      MAX_EXACT_N_BYTES,
    ),
  });
}

export async function buildPatternImportDxfProductCompositeSidecarV4(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCompositeSidecarResultV4> {
  try {
    const request = captureRequest(input);
    const components = Object.freeze([
      await makeComponent(
        'composite-v3',
        PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
        request.compositeV3Bytes,
        crypto,
      ),
      await makeComponent(
        'phase-e-exact-n-seam-consistency-v2',
        PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_N_SEAM_COMPONENT_MEDIA_TYPE_V2,
        request.exactNSeamConsistencyBytes,
        crypto,
      ),
    ]) as PatternImportDxfProductCompositeSidecarDocumentV4['components'];
    const verified = await verifyComponents(components, request.bindings, crypto);
    const document = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V4,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
      encoding: 'canonical-json-utf8' as const,
      bindings: request.bindings,
      writeCas: Object.freeze({
        expectedPreviousSidecarSha256: request.expectedPreviousSidecarSha256,
      }),
      components,
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V4,
    } satisfies PatternImportDxfProductCompositeSidecarDocumentV4);
    const bytes = encoder.encode(canonical(document));
    if (bytes.byteLength > MAX_DOCUMENT_BYTES)
      fail('bounds-exceeded', 'document', 'Composite V4 document exceeds the byte bound.');
    const seal = makeSeal(await sha256(bytes, crypto), bytes.byteLength);
    const owner = makeOwner(document, seal, bytes, verified.bytes);
    return Object.freeze({
      ok: true as const,
      owner,
      document,
      seal,
      nestedCompositeV3: verified.nestedCompositeV3,
      exactNSeam: verified.exactNSeam,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V4,
    });
  } catch (error) {
    return blocked(error);
  }
}

function validateDocument(value: unknown): PatternImportDxfProductCompositeSidecarDocumentV4 {
  const document = exactRecord(
    value,
    ['schemaVersion', 'mediaType', 'encoding', 'bindings', 'writeCas', 'components', 'claims'],
    'document',
  );
  if (
    document.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V4 ||
    document.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 ||
    document.encoding !== 'canonical-json-utf8'
  )
    fail('unsupported-schema', 'document', 'Composite V4 schema/media/encoding differs.');
  validateBindings(document.bindings, 'document.bindings');
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
    fail('invalid-input', 'document.writeCas', 'CAS SHA-256 is invalid.');
  if (!Array.isArray(document.components) || document.components.length !== 2)
    fail(
      'component-order-mismatch',
      'document.components',
      'Composite V4 requires exactly two components.',
    );
  componentMetadata(document.components[0], 0);
  componentMetadata(document.components[1], 1);
  if (
    canonical(document.claims) !== canonical(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V4)
  )
    fail('invalid-input', 'document.claims', 'Composite V4 claims differ.');
  return document as PatternImportDxfProductCompositeSidecarDocumentV4;
}

export async function decodePatternImportDxfProductCompositeSidecarV4(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCompositeSidecarResultV4> {
  try {
    const bytes = copyBytes(input, 'bytes', MAX_DOCUMENT_BYTES);
    const parsed = parseJson(bytes, 'bytes');
    const document = validateDocument(parsed);
    const canonicalBytes = encoder.encode(canonical(document));
    if (!sameBytes(bytes, canonicalBytes))
      fail('noncanonical-bytes', 'bytes', 'Composite V4 bytes are not canonical.');
    const verified = await verifyComponents(document.components, document.bindings, crypto);
    const frozenDocument = deepFreeze(structuredClone(document));
    const seal = makeSeal(await sha256(canonicalBytes, crypto), canonicalBytes.byteLength);
    const owner = makeOwner(frozenDocument, seal, canonicalBytes, verified.bytes);
    return Object.freeze({
      ok: true as const,
      owner,
      document: frozenDocument,
      seal,
      nestedCompositeV3: verified.nestedCompositeV3,
      exactNSeam: verified.exactNSeam,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V4,
    });
  } catch (error) {
    return blocked(error);
  }
}

export function encodePatternImportDxfProductCompositeSidecarV4(
  candidate: unknown,
): EncodePatternImportDxfProductCompositeSidecarResultV4 {
  if (!candidate || typeof candidate !== 'object')
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  const state = ownerStates.get(candidate);
  if (!state)
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  const owner = candidate as PatternImportDxfProductCompositeSidecarOwnerV4;
  return Object.freeze({
    ok: true as const,
    bytes: state.bytes.slice(),
    canonicalSha256: owner.seal.canonicalSha256,
    canonicalByteLength: state.bytes.byteLength,
  });
}

export function readPatternImportDxfProductCompositeComponentBytesV4(
  candidate: unknown,
  kind: PatternImportDxfProductCompositeSidecarComponentKindV4,
): Uint8Array<ArrayBuffer> | null {
  if (!candidate || typeof candidate !== 'object') return null;
  return ownerStates.get(candidate)?.components.get(kind)?.slice() ?? null;
}
