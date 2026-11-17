import type { PatternImportDxfProductCompositeSidecarBindingsV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  CAD_MANNEQUIN_ARRANGEMENT_MEDIA_TYPE_V1,
  decodeCadMannequinArrangementDocumentV1,
  encodeCadMannequinArrangementDocumentV1,
  type CadMannequinArrangementDocumentV1,
} from './cad-mannequin-arrangement-document-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
  decodePatternImportDxfProductCompositeSidecarV5,
  type PatternImportDxfProductCompositeSidecarResultV5,
} from './composite-sidecar-v5';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6 =
  'pattern-import-dxf-product-composite-sidecar-request/6' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V6 =
  'pattern-import-dxf-product-composite-sidecar-document/6' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V6 =
  'pattern-import-dxf-product-composite-sidecar-seal/6' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V6 =
  'pattern-import-dxf-product-composite-sidecar-owner/6' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 =
  'application/vnd.grbpwr.pattern-dxf-product-composite.v6+json' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V6 = Object.freeze({
  nestedCompositeV5BytesPreservedExactly: true,
  mannequinArrangementCanonicalAndDigestVerified: true,
  exactCardScopeAndSavedRowBound: true,
  canonicalComponentOrderAndBase64Required: true,
  previousSidecarCasExpectationBound: true,
  mannequinArrangementPresentationOnly: true,
  dxfAuthorityAdded: false,
  assemblyOrderAuthorityAdded: false,
  clothAuthorityAdded: false,
  persistenceIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V6,
  nestedCompositeV5BytesPreservedExactly: false as const,
  mannequinArrangementCanonicalAndDigestVerified: false as const,
  exactCardScopeAndSavedRowBound: false as const,
  canonicalComponentOrderAndBase64Required: false as const,
  previousSidecarCasExpectationBound: false as const,
});

export type PatternImportDxfProductCompositeSidecarComponentKindV6 =
  | 'composite-v5'
  | 'cad-mannequin-arrangement-v1';

export type PatternImportDxfProductCompositeSidecarComponentV6 = Readonly<{
  kind: PatternImportDxfProductCompositeSidecarComponentKindV6;
  mediaType:
    | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5
    | typeof CAD_MANNEQUIN_ARRANGEMENT_MEDIA_TYPE_V1;
  sha256: string;
  byteLength: number;
  base64: string;
}>;

export type PatternImportDxfProductCompositeSidecarRequestV6 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6;
  expectedPreviousSidecarSha256: string | null;
  compositeV5Bytes: Uint8Array;
  mannequinArrangementBytes: Uint8Array;
}>;

export type PatternImportDxfProductCompositeSidecarDocumentV6 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V6;
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6;
  encoding: 'canonical-json-utf8';
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
  writeCas: Readonly<{ expectedPreviousSidecarSha256: string | null }>;
  components: readonly [
    PatternImportDxfProductCompositeSidecarComponentV6,
    PatternImportDxfProductCompositeSidecarComponentV6,
  ];
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V6;
}>;

export type PatternImportDxfProductCompositeSidecarSealV6 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V6;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  canonicalByteLength: number;
  authority: 'unsigned-composite-sidecar-storage-consistency-only';
  persistenceIntegrated: false;
  productionReady: false;
}>;

declare const ownerBrand: unique symbol;
export type PatternImportDxfProductCompositeSidecarOwnerV6 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V6;
  document: PatternImportDxfProductCompositeSidecarDocumentV6;
  seal: PatternImportDxfProductCompositeSidecarSealV6;
  readonly [ownerBrand]: never;
}>;

export type PatternImportDxfProductCompositeSidecarBlockerCodeV6 =
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
  | 'nested-composite-v5-invalid'
  | 'mannequin-arrangement-invalid'
  | 'sha256-unavailable'
  | 'invalid-owner';

export type PatternImportDxfProductCompositeSidecarBlockerV6 = Readonly<{
  code: PatternImportDxfProductCompositeSidecarBlockerCodeV6;
  field: string;
  detail: string;
}>;

type CompositeV5Success = Extract<PatternImportDxfProductCompositeSidecarResultV5, { ok: true }>;

export type PatternImportDxfProductCompositeSidecarResultV6 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductCompositeSidecarOwnerV6;
      document: PatternImportDxfProductCompositeSidecarDocumentV6;
      seal: PatternImportDxfProductCompositeSidecarSealV6;
      nestedCompositeV5: CompositeV5Success;
      mannequinArrangement: CadMannequinArrangementDocumentV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V6;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      document: null;
      seal: null;
      nestedCompositeV5: null;
      mannequinArrangement: null;
      blockers: readonly [PatternImportDxfProductCompositeSidecarBlockerV6];
      claims: typeof BLOCKED_CLAIMS;
    }>;

type OwnerState = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  components: ReadonlyMap<
    PatternImportDxfProductCompositeSidecarComponentKindV6,
    Uint8Array<ArrayBuffer>
  >;
}>;

const PRODUCTION_SIDECAR_MAX_BYTES = 4 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const ownerStates = new WeakMap<object, OwnerState>();

class CompositeV6Failure extends Error {
  constructor(
    readonly code: PatternImportDxfProductCompositeSidecarBlockerCodeV6,
    readonly field: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(
  code: PatternImportDxfProductCompositeSidecarBlockerCodeV6,
  field: string,
  detail: string,
): never {
  throw new CompositeV6Failure(code, field, detail);
}

function asBlocker(error: unknown): PatternImportDxfProductCompositeSidecarBlockerV6 {
  const failure =
    error instanceof CompositeV6Failure
      ? error
      : new CompositeV6Failure('invalid-input', 'request', 'Composite V6 failed closed.');
  return Object.freeze({ code: failure.code, field: failure.field, detail: failure.message });
}

function blocked(error: unknown): PatternImportDxfProductCompositeSidecarResultV6 {
  return Object.freeze({
    ok: false as const,
    owner: null,
    document: null,
    seal: null,
    nestedCompositeV5: null,
    mannequinArrangement: null,
    blockers: Object.freeze([asBlocker(error)]) as readonly [
      PatternImportDxfProductCompositeSidecarBlockerV6,
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

function exactRecord(value: unknown, keys: readonly string[], field: string) {
  if (!record(value)) fail('invalid-input', field, 'Expected a plain record.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    fail('invalid-input', field, 'Record has missing, symbol, hidden, or unexpected fields.');
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail('invalid-input', `${field}.${key}`, 'Expected an enumerable data property.');
    }
    output[key] = descriptor.value;
  }
  return output;
}

function exactArray(value: unknown, length: number, field: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail('invalid-input', field, 'Expected a plain array.');
  }
  if (value.length !== length) {
    fail('component-order-mismatch', field, `Composite V6 requires ${length} components.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== expected.size ||
    actual.some((key) => typeof key !== 'string' || !expected.has(key))
  ) {
    fail('invalid-input', field, 'Array has sparse, symbol, hidden, or unexpected fields.');
  }
  return Array.from({ length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail('invalid-input', `${field}[${index}]`, 'Expected an enumerable data property.');
    }
    return descriptor.value;
  });
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail('invalid-input', 'data', 'Canonical data contains an invalid number.');
    }
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
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value)) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function copyBytes(value: unknown, field: string): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array)) fail('invalid-bytes', field, 'Expected Uint8Array bytes.');
  const bytes = new Uint8Array(value.byteLength);
  try {
    bytes.set(value);
  } catch {
    fail('invalid-bytes', field, 'Bytes are detached or unreadable.');
  }
  if (bytes.byteLength === 0 || bytes.byteLength > PRODUCTION_SIDECAR_MAX_BYTES) {
    fail('bounds-exceeded', field, 'Byte length is outside the production sidecar bound.');
  }
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
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

async function sha256(
  bytes: Uint8Array<ArrayBuffer>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') {
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 is required.');
  }
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (digest.byteLength !== 32) throw new TypeError();
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof CompositeV6Failure) throw error;
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

function decodeBase64(value: unknown, field: string): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !value || value.length % 4 !== 0) {
    fail('invalid-bytes', field, 'Expected canonical padded base64.');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const length = (value.length / 4) * 3 - padding;
  if (length <= 0 || length > PRODUCTION_SIDECAR_MAX_BYTES) {
    fail('bounds-exceeded', field, 'Decoded bytes exceed the production sidecar bound.');
  }
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

function componentMetadata(
  value: unknown,
  index: number,
): PatternImportDxfProductCompositeSidecarComponentV6 {
  const field = `document.components[${index}]`;
  const component = exactRecord(
    value,
    ['kind', 'mediaType', 'sha256', 'byteLength', 'base64'],
    field,
  );
  const expectedKind = index === 0 ? 'composite-v5' : 'cad-mannequin-arrangement-v1';
  const expectedMedia =
    index === 0
      ? PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5
      : CAD_MANNEQUIN_ARRANGEMENT_MEDIA_TYPE_V1;
  if (component.kind !== expectedKind) {
    fail('component-order-mismatch', `${field}.kind`, 'V6 components are missing or reordered.');
  }
  if (component.mediaType !== expectedMedia) {
    fail('component-media-mismatch', `${field}.mediaType`, 'Component media type differs.');
  }
  if (typeof component.sha256 !== 'string' || !SHA256.test(component.sha256)) {
    fail('invalid-input', `${field}.sha256`, 'Component digest is invalid.');
  }
  if (!Number.isSafeInteger(component.byteLength) || (component.byteLength as number) <= 0) {
    fail('invalid-input', `${field}.byteLength`, 'Component length is invalid.');
  }
  if (typeof component.base64 !== 'string') {
    fail('invalid-input', `${field}.base64`, 'Component base64 is invalid.');
  }
  return component as PatternImportDxfProductCompositeSidecarComponentV6;
}

function exactBindings(value: unknown): PatternImportDxfProductCompositeSidecarBindingsV3 {
  const bindings = exactRecord(
    value,
    ['row', 'serverAssemblyRevision', 'assemblyTopologySha256'],
    'document.bindings',
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
    'document.bindings.row',
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
  ) {
    fail('invalid-input', 'document.bindings', 'Composite V6 bindings are invalid.');
  }
  return bindings as PatternImportDxfProductCompositeSidecarBindingsV3;
}

function sameArrangementAuthority(
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
  arrangement: CadMannequinArrangementDocumentV1,
): boolean {
  return (
    arrangement.bindings.card.techCardId === bindings.row.techCardId &&
    arrangement.bindings.card.cardLockVersion === bindings.row.cardLockVersion &&
    arrangement.bindings.scope.scopeKey === bindings.row.scopeKey &&
    arrangement.bindings.scope.patternLineKey === bindings.row.patternLineKey &&
    arrangement.bindings.savedRow.revision === bindings.row.revision &&
    arrangement.bindings.savedRow.dxfSha256 === bindings.row.sha256
  );
}

async function decodeArrangement(bytes: Uint8Array<ArrayBuffer>) {
  let document: CadMannequinArrangementDocumentV1;
  try {
    document = decodeCadMannequinArrangementDocumentV1(parseJson(bytes, 'mannequinArrangement'));
  } catch (error) {
    if (error instanceof CompositeV6Failure) throw error;
    fail(
      'mannequin-arrangement-invalid',
      'components.cad-mannequin-arrangement-v1',
      error instanceof Error ? error.message : 'Mannequin arrangement is invalid.',
    );
  }
  const canonicalBytes = encoder.encode(encodeCadMannequinArrangementDocumentV1(document));
  if (!sameBytes(bytes, canonicalBytes)) {
    fail(
      'noncanonical-bytes',
      'components.cad-mannequin-arrangement-v1',
      'Mannequin arrangement bytes are not canonical.',
    );
  }
  return document;
}

async function verifyComponents(
  components: readonly PatternImportDxfProductCompositeSidecarComponentV6[],
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  const v5Metadata = componentMetadata(components[0], 0);
  const arrangementMetadata = componentMetadata(components[1], 1);
  const v5Bytes = decodeBase64(v5Metadata.base64, 'document.components[0].base64');
  const arrangementBytes = decodeBase64(
    arrangementMetadata.base64,
    'document.components[1].base64',
  );
  const pairs = [
    [v5Metadata, v5Bytes],
    [arrangementMetadata, arrangementBytes],
  ] as const;
  for (const [index, [metadata, bytes]] of pairs.entries()) {
    if (
      metadata.byteLength !== bytes.byteLength ||
      metadata.sha256 !== (await sha256(bytes, crypto))
    ) {
      fail(
        'component-digest-mismatch',
        `document.components[${index}]`,
        'Component digest differs.',
      );
    }
  }
  const nestedCompositeV5 = await decodePatternImportDxfProductCompositeSidecarV5(v5Bytes, crypto);
  if (!nestedCompositeV5.ok) {
    fail(
      'nested-composite-v5-invalid',
      'components.composite-v5',
      nestedCompositeV5.blockers[0].detail,
    );
  }
  if (canonical(nestedCompositeV5.document.bindings) !== canonical(bindings)) {
    fail('component-binding-mismatch', 'components.composite-v5', 'Nested V5 authority differs.');
  }
  const mannequinArrangement = await decodeArrangement(arrangementBytes);
  if (!sameArrangementAuthority(bindings, mannequinArrangement)) {
    fail(
      'component-binding-mismatch',
      'components.cad-mannequin-arrangement-v1',
      'Arrangement card, scope, pattern row revision, or DXF SHA differs from Composite V5.',
    );
  }
  return Object.freeze({
    nestedCompositeV5,
    mannequinArrangement,
    bytes: new Map<PatternImportDxfProductCompositeSidecarComponentKindV6, Uint8Array<ArrayBuffer>>(
      [
        ['composite-v5', v5Bytes.slice()],
        ['cad-mannequin-arrangement-v1', arrangementBytes.slice()],
      ],
    ),
  });
}

async function makeComponent(
  kind: PatternImportDxfProductCompositeSidecarComponentKindV6,
  mediaType: PatternImportDxfProductCompositeSidecarComponentV6['mediaType'],
  bytes: Uint8Array<ArrayBuffer>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<PatternImportDxfProductCompositeSidecarComponentV6> {
  return Object.freeze({
    kind,
    mediaType,
    sha256: await sha256(bytes, crypto),
    byteLength: bytes.byteLength,
    base64: encodeBase64(bytes),
  });
}

function makeSeal(sha: string, byteLength: number): PatternImportDxfProductCompositeSidecarSealV6 {
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V6,
    algorithm: 'SHA-256' as const,
    canonicalSha256: sha,
    canonicalByteLength: byteLength,
    authority: 'unsigned-composite-sidecar-storage-consistency-only' as const,
    persistenceIntegrated: false as const,
    productionReady: false as const,
  });
}

function makeOwner(
  document: PatternImportDxfProductCompositeSidecarDocumentV6,
  seal: PatternImportDxfProductCompositeSidecarSealV6,
  bytes: Uint8Array<ArrayBuffer>,
  componentBytes: OwnerState['components'],
): PatternImportDxfProductCompositeSidecarOwnerV6 {
  const owner = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V6,
    document,
    seal,
  }) as PatternImportDxfProductCompositeSidecarOwnerV6;
  ownerStates.set(owner, {
    bytes: bytes.slice(),
    components: new Map([...componentBytes].map(([kind, value]) => [kind, value.slice()])),
  });
  return owner;
}

function captureRequest(input: unknown) {
  const request = exactRecord(
    input,
    [
      'schemaVersion',
      'expectedPreviousSidecarSha256',
      'compositeV5Bytes',
      'mannequinArrangementBytes',
    ],
    'request',
  );
  if (request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6) {
    fail('unsupported-schema', 'request.schemaVersion', 'Composite V6 request schema differs.');
  }
  if (
    request.expectedPreviousSidecarSha256 !== null &&
    (typeof request.expectedPreviousSidecarSha256 !== 'string' ||
      !SHA256.test(request.expectedPreviousSidecarSha256))
  ) {
    fail('invalid-input', 'request.expectedPreviousSidecarSha256', 'CAS digest is invalid.');
  }
  return Object.freeze({
    expectedPreviousSidecarSha256: request.expectedPreviousSidecarSha256 as string | null,
    compositeV5Bytes: copyBytes(request.compositeV5Bytes, 'request.compositeV5Bytes'),
    mannequinArrangementBytes: copyBytes(
      request.mannequinArrangementBytes,
      'request.mannequinArrangementBytes',
    ),
  });
}

export async function buildPatternImportDxfProductCompositeSidecarV6(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCompositeSidecarResultV6> {
  try {
    const request = captureRequest(input);
    const nestedCompositeV5 = await decodePatternImportDxfProductCompositeSidecarV5(
      request.compositeV5Bytes,
      crypto,
    );
    if (!nestedCompositeV5.ok) {
      fail(
        'nested-composite-v5-invalid',
        'request.compositeV5Bytes',
        nestedCompositeV5.blockers[0].detail,
      );
    }
    const bindings = exactBindings(nestedCompositeV5.document.bindings);
    const components = Object.freeze([
      await makeComponent(
        'composite-v5',
        PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
        request.compositeV5Bytes,
        crypto,
      ),
      await makeComponent(
        'cad-mannequin-arrangement-v1',
        CAD_MANNEQUIN_ARRANGEMENT_MEDIA_TYPE_V1,
        request.mannequinArrangementBytes,
        crypto,
      ),
    ]) as PatternImportDxfProductCompositeSidecarDocumentV6['components'];
    const verified = await verifyComponents(components, bindings, crypto);
    const document = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V6,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
      encoding: 'canonical-json-utf8' as const,
      bindings,
      writeCas: Object.freeze({
        expectedPreviousSidecarSha256: request.expectedPreviousSidecarSha256,
      }),
      components,
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V6,
    } satisfies PatternImportDxfProductCompositeSidecarDocumentV6);
    const bytes = encoder.encode(canonical(document));
    if (bytes.byteLength > PRODUCTION_SIDECAR_MAX_BYTES) {
      fail('bounds-exceeded', 'document', 'Composite V6 document exceeds its production bound.');
    }
    const seal = makeSeal(await sha256(bytes, crypto), bytes.byteLength);
    const owner = makeOwner(document, seal, bytes, verified.bytes);
    return Object.freeze({
      ok: true as const,
      owner,
      document,
      seal,
      nestedCompositeV5: verified.nestedCompositeV5,
      mannequinArrangement: verified.mannequinArrangement,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V6,
    });
  } catch (error) {
    return blocked(error);
  }
}

function validateDocument(value: unknown): PatternImportDxfProductCompositeSidecarDocumentV6 {
  const document = exactRecord(
    value,
    ['schemaVersion', 'mediaType', 'encoding', 'bindings', 'writeCas', 'components', 'claims'],
    'document',
  );
  if (
    document.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V6 ||
    document.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 ||
    document.encoding !== 'canonical-json-utf8'
  ) {
    fail('unsupported-schema', 'document', 'Composite V6 schema, media type, or encoding differs.');
  }
  exactBindings(document.bindings);
  const writeCas = exactRecord(
    document.writeCas,
    ['expectedPreviousSidecarSha256'],
    'document.writeCas',
  );
  if (
    writeCas.expectedPreviousSidecarSha256 !== null &&
    (typeof writeCas.expectedPreviousSidecarSha256 !== 'string' ||
      !SHA256.test(writeCas.expectedPreviousSidecarSha256))
  ) {
    fail('invalid-input', 'document.writeCas', 'CAS digest is invalid.');
  }
  const components = exactArray(document.components, 2, 'document.components');
  componentMetadata(components[0], 0);
  componentMetadata(components[1], 1);
  if (
    canonical(document.claims) !== canonical(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V6)
  ) {
    fail('invalid-input', 'document.claims', 'Composite V6 claims differ.');
  }
  return document as PatternImportDxfProductCompositeSidecarDocumentV6;
}

export async function decodePatternImportDxfProductCompositeSidecarV6(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCompositeSidecarResultV6> {
  try {
    const bytes = copyBytes(input, 'bytes');
    const document = validateDocument(parseJson(bytes, 'bytes'));
    const canonicalBytes = encoder.encode(canonical(document));
    if (!sameBytes(bytes, canonicalBytes)) {
      fail('noncanonical-bytes', 'bytes', 'Composite V6 bytes are not canonical.');
    }
    const verified = await verifyComponents(document.components, document.bindings, crypto);
    const frozenDocument = deepFreeze(structuredClone(document));
    const seal = makeSeal(await sha256(canonicalBytes, crypto), canonicalBytes.byteLength);
    const owner = makeOwner(frozenDocument, seal, canonicalBytes, verified.bytes);
    return Object.freeze({
      ok: true as const,
      owner,
      document: frozenDocument,
      seal,
      nestedCompositeV5: verified.nestedCompositeV5,
      mannequinArrangement: verified.mannequinArrangement,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V6,
    });
  } catch (error) {
    return blocked(error);
  }
}

export function encodePatternImportDxfProductCompositeSidecarV6(candidate: unknown) {
  if (!candidate || typeof candidate !== 'object') {
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  }
  const state = ownerStates.get(candidate);
  if (!state) {
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  }
  const owner = candidate as PatternImportDxfProductCompositeSidecarOwnerV6;
  return Object.freeze({
    ok: true as const,
    bytes: state.bytes.slice(),
    canonicalSha256: owner.seal.canonicalSha256,
    canonicalByteLength: state.bytes.byteLength,
  });
}

export function readPatternImportDxfProductCompositeComponentBytesV6(
  candidate: unknown,
  kind: PatternImportDxfProductCompositeSidecarComponentKindV6,
): Uint8Array<ArrayBuffer> | null {
  if (!candidate || typeof candidate !== 'object') return null;
  return ownerStates.get(candidate)?.components.get(kind)?.slice() ?? null;
}
