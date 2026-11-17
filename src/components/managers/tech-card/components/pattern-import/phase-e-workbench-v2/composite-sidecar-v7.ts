import type { PatternImportDxfProductCompositeSidecarBindingsV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
  decodePatternImportDxfProductCompositeSidecarV6,
  type PatternImportDxfProductCompositeSidecarResultV6,
} from './composite-sidecar-v6';
import {
  SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1,
  SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_MEDIA_TYPE_V1,
  decodeSavedFullAssemblyPhysicalComponentV1,
  inspectSavedFullAssemblyPhysicalComponentEnvelopeV1,
  type SavedFullAssemblyPhysicalComponentDocumentV1,
  type SavedFullAssemblyPhysicalComponentOwnerV1,
} from './saved-full-assembly-physical-component-v1';
import {
  projectSavedFullAssemblySnapshotV1,
  type SavedFullAssemblySnapshotProjectionV1,
  type SavedFullAssemblySnapshotReceiptV1,
} from './saved-full-assembly-snapshot-production-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7 =
  'pattern-import-dxf-product-composite-sidecar-request/7' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V7 =
  'pattern-import-dxf-product-composite-sidecar-document/7' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V7 =
  'pattern-import-dxf-product-composite-sidecar-seal/7' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V7 =
  'pattern-import-dxf-product-composite-sidecar-owner/7' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7 =
  'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json' as const;
export const SAVED_FULL_ASSEMBLY_PHYSICAL_AUTHORITY_RECEIPT_V1 =
  'saved-full-assembly-physical-authority-receipt/1' as const;

/** The active V7 component-kind/media decoder table. It extends the existing Composite chain. */
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_COMPONENT_REGISTRY_V7 = Object.freeze([
  Object.freeze({
    kind: 'composite-v6' as const,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
  }),
  Object.freeze({
    kind: SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1,
    mediaType: SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_MEDIA_TYPE_V1,
  }),
] as const);

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V7 = Object.freeze({
  nestedCompositeV6BytesPreservedExactly: true,
  registeredFullAssemblyPhysicalEnvelopeVerified: true,
  durableFullAssemblyPhysicalAuthorityVerified: false,
  completeGraphAndAllPieceInitializationAuthorityAdded: false,
  exactSavedRowEnvelopeBound: true,
  canonicalComponentOrderAndBase64Required: true,
  previousSidecarCasExpectationBound: true,
  secondRegistryCreated: false,
  secondWriterCreated: false,
  persistenceIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V7,
  nestedCompositeV6BytesPreservedExactly: false as const,
  registeredFullAssemblyPhysicalEnvelopeVerified: false as const,
  exactSavedRowEnvelopeBound: false as const,
  canonicalComponentOrderAndBase64Required: false as const,
  previousSidecarCasExpectationBound: false as const,
});

export type PatternImportDxfProductCompositeSidecarComponentKindV7 =
  (typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_COMPONENT_REGISTRY_V7)[number]['kind'];

export type PatternImportDxfProductCompositeSidecarComponentV7 = Readonly<{
  kind: PatternImportDxfProductCompositeSidecarComponentKindV7;
  mediaType:
    | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6
    | typeof SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_MEDIA_TYPE_V1;
  sha256: string;
  byteLength: number;
  base64: string;
}>;

export type PatternImportDxfProductCompositeSidecarRequestV7 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7;
  expectedPreviousSidecarSha256: string | null;
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
  compositeV6Bytes: Uint8Array;
  fullAssemblyPhysicalBytes: Uint8Array;
}>;

export type PatternImportDxfProductCompositeSidecarDocumentV7 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V7;
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7;
  encoding: 'canonical-json-utf8';
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
  writeCas: Readonly<{ expectedPreviousSidecarSha256: string | null }>;
  components: readonly [
    PatternImportDxfProductCompositeSidecarComponentV7,
    PatternImportDxfProductCompositeSidecarComponentV7,
  ];
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V7;
}>;

export type PatternImportDxfProductCompositeSidecarSealV7 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V7;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  canonicalByteLength: number;
  authority: 'unsigned-composite-sidecar-storage-consistency-only';
  persistenceIntegrated: false;
  productionReady: false;
}>;

declare const ownerBrand: unique symbol;
export type PatternImportDxfProductCompositeSidecarOwnerV7 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V7;
  document: PatternImportDxfProductCompositeSidecarDocumentV7;
  seal: PatternImportDxfProductCompositeSidecarSealV7;
  readonly [ownerBrand]: never;
}>;

export type PatternImportDxfProductCompositeSidecarBlockerV7 = Readonly<{
  code: string;
  field: string;
  detail: string;
}>;

type CompositeV6Success = Extract<PatternImportDxfProductCompositeSidecarResultV6, { ok: true }>;

export type PatternImportDxfProductCompositeSidecarResultV7 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductCompositeSidecarOwnerV7;
      document: PatternImportDxfProductCompositeSidecarDocumentV7;
      seal: PatternImportDxfProductCompositeSidecarSealV7;
      nestedCompositeV6: CompositeV6Success;
      fullAssemblyPhysicalEnvelope: Readonly<{
        document: SavedFullAssemblyPhysicalComponentDocumentV1;
        canonicalSha256: string;
        durableAuthority: false;
      }>;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V7;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      document: null;
      seal: null;
      nestedCompositeV6: null;
      fullAssemblyPhysicalEnvelope: null;
      blockers: readonly [PatternImportDxfProductCompositeSidecarBlockerV7];
      claims: typeof BLOCKED_CLAIMS;
    }>;

type OwnerState = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  components: ReadonlyMap<
    PatternImportDxfProductCompositeSidecarComponentKindV7,
    Uint8Array<ArrayBuffer>
  >;
}>;

const MAX_BYTES = 4 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const ownerStates = new WeakMap<object, OwnerState>();
type PhysicalAuthorityState = Readonly<{
  outerOwner: PatternImportDxfProductCompositeSidecarOwnerV7;
  borrowedSnapshotReceipt: SavedFullAssemblySnapshotReceiptV1;
  expectedSnapshotIdentity: string;
  expectedOuterIdentity: string;
}>;
const physicalAuthorityReceipts = new WeakMap<object, PhysicalAuthorityState>();

declare const physicalAuthorityBrand: unique symbol;
export type SavedFullAssemblyPhysicalAuthorityReceiptV1 = Readonly<{
  schemaVersion: typeof SAVED_FULL_ASSEMBLY_PHYSICAL_AUTHORITY_RECEIPT_V1;
  outerCanonicalSha256: string;
  physicalComponentCanonicalSha256: string;
  aoContentSha256: string;
  durableFullAssemblyPhysicalAuthorityVerified: true;
  readonly [physicalAuthorityBrand]: never;
}>;

export type VerifyPatternImportDxfProductCompositeSidecarV7PhysicalResult =
  | Readonly<{
      ok: true;
      receipt: SavedFullAssemblyPhysicalAuthorityReceiptV1;
      physicalOwner: SavedFullAssemblyPhysicalComponentOwnerV1;
      physicalDocument: SavedFullAssemblyPhysicalComponentDocumentV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      physicalOwner: null;
      physicalDocument: null;
      blocker: PatternImportDxfProductCompositeSidecarBlockerV7;
    }>;

class CompositeV7Failure extends Error {
  constructor(
    readonly code: string,
    readonly field: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(code: string, field: string, detail: string): never {
  throw new CompositeV7Failure(code, field, detail);
}

function record(value: unknown): value is Record<string, unknown> {
  return (
    !!value && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value)
  );
}

function exactRecord(value: unknown, keys: readonly string[], field: string) {
  if (!record(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    fail('invalid-input', field, 'Expected a plain record.');
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
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

function copyBytes(value: unknown, field: string): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array)) fail('invalid-bytes', field, 'Expected Uint8Array bytes.');
  const bytes = Uint8Array.from(value);
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES)
    fail('bounds-exceeded', field, 'Byte length is outside the production sidecar bound.');
  return bytes;
}

function parse(bytes: Uint8Array<ArrayBuffer>, field: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes)) as unknown;
  } catch {
    fail('invalid-json', field, 'Bytes are not strict UTF-8 canonical JSON.');
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
  );
}

async function sha256(
  bytes: Uint8Array<ArrayBuffer>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle) fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 is required.');
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (digest.byteLength !== 32) throw new TypeError();
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof CompositeV7Failure) throw error;
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 digest failed.');
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const word = (bytes[index]! << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    output += BASE64[(word >> 18) & 63];
    output += BASE64[(word >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64[(word >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? BASE64[word & 63] : '=';
  }
  return output;
}

function decodeBase64(value: unknown, field: string): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !value || value.length % 4 !== 0)
    fail('invalid-bytes', field, 'Expected canonical padded base64.');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const length = (value.length / 4) * 3 - padding;
  if (length <= 0 || length > MAX_BYTES)
    fail('bounds-exceeded', field, 'Decoded bytes exceed the production sidecar bound.');
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
): PatternImportDxfProductCompositeSidecarComponentV7 {
  const field = `document.components[${index}]`;
  const component = exactRecord(
    value,
    ['kind', 'mediaType', 'sha256', 'byteLength', 'base64'],
    field,
  );
  const registration = PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_COMPONENT_REGISTRY_V7[index];
  if (!registration || component.kind !== registration.kind)
    fail('component-order-mismatch', `${field}.kind`, 'V7 components are missing or reordered.');
  if (component.mediaType !== registration.mediaType)
    fail('component-media-mismatch', `${field}.mediaType`, 'Component media type differs.');
  if (typeof component.sha256 !== 'string' || !SHA256.test(component.sha256))
    fail('invalid-input', `${field}.sha256`, 'Component digest is invalid.');
  if (!Number.isSafeInteger(component.byteLength) || (component.byteLength as number) <= 0)
    fail('invalid-input', `${field}.byteLength`, 'Component length is invalid.');
  if (typeof component.base64 !== 'string')
    fail('invalid-input', `${field}.base64`, 'Component base64 is invalid.');
  return component as PatternImportDxfProductCompositeSidecarComponentV7;
}

function componentArray(value: unknown): readonly [unknown, unknown] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    fail(
      'component-order-mismatch',
      'document.components',
      'V7 requires two registered components.',
    );
  return value as [unknown, unknown];
}

async function makeComponent(
  registration: (typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_COMPONENT_REGISTRY_V7)[number],
  bytes: Uint8Array<ArrayBuffer>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<PatternImportDxfProductCompositeSidecarComponentV7> {
  return Object.freeze({
    kind: registration.kind,
    mediaType: registration.mediaType,
    sha256: await sha256(bytes, crypto),
    byteLength: bytes.byteLength,
    base64: encodeBase64(bytes),
  });
}

function samePhysicalAuthority(
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
  physical: SavedFullAssemblyPhysicalComponentDocumentV1,
) {
  return (
    canonical(bindings.row) === canonical(physical.bindings.row) &&
    bindings.serverAssemblyRevision === physical.bindings.serverAssemblyRevision
  );
}

function captureBindings(value: unknown): PatternImportDxfProductCompositeSidecarBindingsV3 {
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
  )
    fail('invalid-input', 'document.bindings', 'Composite V7 bindings are invalid.');
  return bindings as PatternImportDxfProductCompositeSidecarBindingsV3;
}

function sameSavedRowAndRevisionAuthority(
  left: PatternImportDxfProductCompositeSidecarBindingsV3,
  right: PatternImportDxfProductCompositeSidecarBindingsV3,
): boolean {
  return (
    canonical(left.row) === canonical(right.row) &&
    left.serverAssemblyRevision === right.serverAssemblyRevision
  );
}

async function verifyComponents(
  components: readonly [
    PatternImportDxfProductCompositeSidecarComponentV7,
    PatternImportDxfProductCompositeSidecarComponentV7,
  ],
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  const metadata = components.map(componentMetadata);
  const bytes = metadata.map((component, index) =>
    decodeBase64(component.base64, `document.components[${index}].base64`),
  );
  for (const [index, component] of metadata.entries()) {
    if (
      component.byteLength !== bytes[index]!.byteLength ||
      component.sha256 !== (await sha256(bytes[index]!, crypto))
    )
      fail(
        'component-digest-mismatch',
        `document.components[${index}]`,
        'Component digest differs.',
      );
  }
  const nestedCompositeV6 = await decodePatternImportDxfProductCompositeSidecarV6(
    bytes[0]!,
    crypto,
  );
  if (!nestedCompositeV6.ok)
    fail(
      'nested-composite-v6-invalid',
      'components.composite-v6',
      nestedCompositeV6.blockers[0].detail,
    );
  if (!sameSavedRowAndRevisionAuthority(nestedCompositeV6.document.bindings, bindings))
    fail(
      'component-binding-mismatch',
      'components.composite-v6',
      'Nested V6 saved row or server Assembly revision differs.',
    );
  const fullAssemblyPhysicalEnvelope = await inspectSavedFullAssemblyPhysicalComponentEnvelopeV1(
    bytes[1]!,
  );
  if (!fullAssemblyPhysicalEnvelope.ok)
    fail(
      'full-assembly-physical-invalid',
      `components.${SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1}`,
      fullAssemblyPhysicalEnvelope.blockers[0].detail,
    );
  if (!samePhysicalAuthority(bindings, fullAssemblyPhysicalEnvelope.document))
    fail(
      'component-binding-mismatch',
      `components.${SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1}`,
      'Full Assembly physical saved-row or server revision differs from Composite V6.',
    );
  return Object.freeze({
    nestedCompositeV6,
    fullAssemblyPhysicalEnvelope: Object.freeze({
      document: fullAssemblyPhysicalEnvelope.document,
      canonicalSha256: fullAssemblyPhysicalEnvelope.canonicalSha256,
      durableAuthority: false as const,
    }),
    bytes: new Map<PatternImportDxfProductCompositeSidecarComponentKindV7, Uint8Array<ArrayBuffer>>(
      [
        ['composite-v6', bytes[0]!.slice()],
        [SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1, bytes[1]!.slice()],
      ],
    ),
  });
}

function seal(sha: string, byteLength: number): PatternImportDxfProductCompositeSidecarSealV7 {
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V7,
    algorithm: 'SHA-256' as const,
    canonicalSha256: sha,
    canonicalByteLength: byteLength,
    authority: 'unsigned-composite-sidecar-storage-consistency-only' as const,
    persistenceIntegrated: false as const,
    productionReady: false as const,
  });
}

function owner(
  document: PatternImportDxfProductCompositeSidecarDocumentV7,
  documentSeal: PatternImportDxfProductCompositeSidecarSealV7,
  bytes: Uint8Array<ArrayBuffer>,
  components: OwnerState['components'],
) {
  const result = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V7,
    document,
    seal: documentSeal,
  }) as PatternImportDxfProductCompositeSidecarOwnerV7;
  ownerStates.set(result, {
    bytes: bytes.slice(),
    components: new Map([...components].map(([kind, value]) => [kind, value.slice()])),
  });
  return result;
}

function blocked(error: unknown): PatternImportDxfProductCompositeSidecarResultV7 {
  const failure =
    error instanceof CompositeV7Failure
      ? error
      : new CompositeV7Failure('invalid-input', 'request', 'Composite V7 failed closed.');
  return Object.freeze({
    ok: false as const,
    owner: null,
    document: null,
    seal: null,
    nestedCompositeV6: null,
    fullAssemblyPhysicalEnvelope: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, field: failure.field, detail: failure.message }),
    ]) as readonly [PatternImportDxfProductCompositeSidecarBlockerV7],
    claims: BLOCKED_CLAIMS,
  });
}

export async function buildPatternImportDxfProductCompositeSidecarV7(
  input: PatternImportDxfProductCompositeSidecarRequestV7,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCompositeSidecarResultV7> {
  try {
    const request = exactRecord(
      input,
      [
        'schemaVersion',
        'expectedPreviousSidecarSha256',
        'bindings',
        'compositeV6Bytes',
        'fullAssemblyPhysicalBytes',
      ],
      'request',
    );
    if (request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7)
      fail('unsupported-schema', 'request.schemaVersion', 'Composite V7 request schema differs.');
    if (
      request.expectedPreviousSidecarSha256 !== null &&
      (typeof request.expectedPreviousSidecarSha256 !== 'string' ||
        !SHA256.test(request.expectedPreviousSidecarSha256))
    )
      fail('invalid-input', 'request.expectedPreviousSidecarSha256', 'CAS digest is invalid.');
    const v6Bytes = copyBytes(request.compositeV6Bytes, 'request.compositeV6Bytes');
    const physicalBytes = copyBytes(
      request.fullAssemblyPhysicalBytes,
      'request.fullAssemblyPhysicalBytes',
    );
    const nested = await decodePatternImportDxfProductCompositeSidecarV6(v6Bytes, crypto);
    if (!nested.ok)
      fail('nested-composite-v6-invalid', 'request.compositeV6Bytes', nested.blockers[0].detail);
    const bindings = captureBindings(request.bindings);
    if (!sameSavedRowAndRevisionAuthority(nested.document.bindings, bindings))
      fail(
        'component-binding-mismatch',
        'request.bindings',
        'Requested transport anchor names another saved row or server Assembly revision.',
      );
    const components = Object.freeze([
      await makeComponent(
        PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_COMPONENT_REGISTRY_V7[0],
        v6Bytes,
        crypto,
      ),
      await makeComponent(
        PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_COMPONENT_REGISTRY_V7[1],
        physicalBytes,
        crypto,
      ),
    ]) as PatternImportDxfProductCompositeSidecarDocumentV7['components'];
    const verified = await verifyComponents(components, bindings, crypto);
    const document = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V7,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
      encoding: 'canonical-json-utf8' as const,
      bindings: structuredClone(bindings),
      writeCas: {
        expectedPreviousSidecarSha256: request.expectedPreviousSidecarSha256 as string | null,
      },
      components,
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V7,
    } satisfies PatternImportDxfProductCompositeSidecarDocumentV7);
    const documentBytes = encoder.encode(canonical(document));
    if (documentBytes.byteLength > MAX_BYTES)
      fail('bounds-exceeded', 'document', 'Composite V7 document exceeds its production bound.');
    const documentSeal = seal(await sha256(documentBytes, crypto), documentBytes.byteLength);
    const documentOwner = owner(document, documentSeal, documentBytes, verified.bytes);
    return Object.freeze({
      ok: true as const,
      owner: documentOwner,
      document,
      seal: documentSeal,
      nestedCompositeV6: verified.nestedCompositeV6,
      fullAssemblyPhysicalEnvelope: verified.fullAssemblyPhysicalEnvelope,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V7,
    });
  } catch (error) {
    return blocked(error);
  }
}

function validateDocument(value: unknown): PatternImportDxfProductCompositeSidecarDocumentV7 {
  const document = exactRecord(
    value,
    ['schemaVersion', 'mediaType', 'encoding', 'bindings', 'writeCas', 'components', 'claims'],
    'document',
  );
  if (
    document.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V7 ||
    document.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7 ||
    document.encoding !== 'canonical-json-utf8'
  )
    fail('unsupported-schema', 'document', 'Composite V7 schema, media type, or encoding differs.');
  captureBindings(document.bindings);
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
  const pair = componentArray(document.components);
  componentMetadata(pair[0], 0);
  componentMetadata(pair[1], 1);
  if (
    canonical(document.claims) !== canonical(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V7)
  )
    fail('invalid-input', 'document.claims', 'Composite V7 claims differ.');
  return document as PatternImportDxfProductCompositeSidecarDocumentV7;
}

export async function decodePatternImportDxfProductCompositeSidecarV7(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCompositeSidecarResultV7> {
  try {
    const bytes = copyBytes(input, 'bytes');
    const document = validateDocument(parse(bytes, 'bytes'));
    const canonicalBytes = encoder.encode(canonical(document));
    if (!sameBytes(bytes, canonicalBytes))
      fail('noncanonical-bytes', 'bytes', 'Composite V7 bytes are not canonical.');
    const pair = componentArray(document.components).map(componentMetadata) as [
      PatternImportDxfProductCompositeSidecarComponentV7,
      PatternImportDxfProductCompositeSidecarComponentV7,
    ];
    const verified = await verifyComponents(pair, document.bindings, crypto);
    const frozen = deepFreeze(structuredClone(document));
    const documentSeal = seal(await sha256(canonicalBytes, crypto), canonicalBytes.byteLength);
    const documentOwner = owner(frozen, documentSeal, canonicalBytes, verified.bytes);
    return Object.freeze({
      ok: true as const,
      owner: documentOwner,
      document: frozen,
      seal: documentSeal,
      nestedCompositeV6: verified.nestedCompositeV6,
      fullAssemblyPhysicalEnvelope: verified.fullAssemblyPhysicalEnvelope,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V7,
    });
  } catch (error) {
    return blocked(error);
  }
}

export function encodePatternImportDxfProductCompositeSidecarV7(candidate: unknown) {
  if (!candidate || typeof candidate !== 'object')
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  const state = ownerStates.get(candidate);
  if (!state)
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  const value = candidate as PatternImportDxfProductCompositeSidecarOwnerV7;
  return Object.freeze({
    ok: true as const,
    bytes: state.bytes.slice(),
    canonicalSha256: value.seal.canonicalSha256,
    canonicalByteLength: state.bytes.byteLength,
  });
}

export function readPatternImportDxfProductCompositeComponentBytesV7(
  candidate: unknown,
  kind: PatternImportDxfProductCompositeSidecarComponentKindV7,
): Uint8Array<ArrayBuffer> | null {
  if (!candidate || typeof candidate !== 'object') return null;
  return ownerStates.get(candidate)?.components.get(kind)?.slice() ?? null;
}

function snapshotIdentity(snapshot: SavedFullAssemblySnapshotProjectionV1): string {
  return canonical({
    row: snapshot.row,
    serverAssemblyRevision: snapshot.serverAssemblyRevision,
    operationsPayloadCanonicalJson: snapshot.operationsPayloadCanonicalJson,
    selectedTopologyReceipts: snapshot.selectedTopologyReceipts,
    snapshotSha256: snapshot.snapshotSha256,
  });
}

function outerIdentity(snapshot: SavedFullAssemblySnapshotProjectionV1): string {
  if (snapshot.outer.status === 'absent') return 'absent';
  return canonical({
    status: snapshot.outer.status,
    mediaType: snapshot.outer.mediaType,
    sha256: snapshot.outer.sha256,
    byteLength: snapshot.outer.byteLength,
    persistedCardLockVersion: snapshot.outer.persistedCardLockVersion,
    persistedSavedRowRevision: snapshot.outer.persistedSavedRowRevision,
    currentRowBound: snapshot.outer.currentRowBound,
  });
}

/**
 * The only durable V7 verification lane. Structural decode above remains usable by legacy
 * transition routes and never authenticates the embedded graph/physical document.
 */
export async function verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority(
  candidate: unknown,
  snapshotReceipt: SavedFullAssemblySnapshotReceiptV1,
): Promise<VerifyPatternImportDxfProductCompositeSidecarV7PhysicalResult> {
  try {
    if (!candidate || typeof candidate !== 'object')
      fail('invalid-owner', 'owner', 'A genuine Composite V7 owner is required.');
    const state = ownerStates.get(candidate);
    if (!state) fail('invalid-owner', 'owner', 'A genuine Composite V7 owner is required.');
    const outer = candidate as PatternImportDxfProductCompositeSidecarOwnerV7;
    const initialSnapshot = projectSavedFullAssemblySnapshotV1(snapshotReceipt);
    const expectedSnapshotIdentity = snapshotIdentity(initialSnapshot);
    const expectedOuterIdentity = outerIdentity(initialSnapshot);
    const physicalBytes = state.components.get(SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1);
    if (!physicalBytes)
      fail(
        'component-order-mismatch',
        `components.${SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1}`,
        'Registered Full Assembly physical bytes are missing.',
      );
    const verified = await decodeSavedFullAssemblyPhysicalComponentV1(
      physicalBytes,
      initialSnapshot,
    );
    if (!verified.ok)
      fail(
        'full-assembly-physical-invalid',
        `components.${SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1}`,
        verified.blockers[0].detail,
      );
    if (!samePhysicalAuthority(outer.document.bindings, verified.document))
      fail(
        'component-binding-mismatch',
        `components.${SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1}`,
        'Verified Full Assembly physical authority differs from Composite V7.',
      );
    const currentSnapshot = projectSavedFullAssemblySnapshotV1(snapshotReceipt);
    if (
      snapshotIdentity(currentSnapshot) !== expectedSnapshotIdentity ||
      outerIdentity(currentSnapshot) !== expectedOuterIdentity
    )
      fail(
        'stale-snapshot-receipt',
        'snapshotReceipt',
        'Full Assembly snapshot or exact outer identity moved during physical verification.',
      );
    const receipt = Object.freeze({
      schemaVersion: SAVED_FULL_ASSEMBLY_PHYSICAL_AUTHORITY_RECEIPT_V1,
      outerCanonicalSha256: outer.seal.canonicalSha256,
      physicalComponentCanonicalSha256: verified.owner.canonicalSha256,
      aoContentSha256: verified.document.bindings.aoContentSha256,
      durableFullAssemblyPhysicalAuthorityVerified: true as const,
    }) as SavedFullAssemblyPhysicalAuthorityReceiptV1;
    physicalAuthorityReceipts.set(receipt, {
      outerOwner: outer,
      borrowedSnapshotReceipt: snapshotReceipt,
      expectedSnapshotIdentity,
      expectedOuterIdentity,
    });
    return Object.freeze({
      ok: true as const,
      receipt,
      physicalOwner: verified.owner,
      physicalDocument: verified.document,
      blocker: null,
    });
  } catch (error) {
    const failure =
      error instanceof CompositeV7Failure
        ? error
        : new CompositeV7Failure(
            'invalid-input',
            'owner',
            'V7 physical verification failed closed.',
          );
    return Object.freeze({
      ok: false as const,
      receipt: null,
      physicalOwner: null,
      physicalDocument: null,
      blocker: Object.freeze({
        code: failure.code,
        field: failure.field,
        detail: failure.message,
      }),
    });
  }
}

export function isSavedFullAssemblyPhysicalAuthorityReceiptV1(
  candidate: unknown,
): candidate is SavedFullAssemblyPhysicalAuthorityReceiptV1 {
  if (!candidate || typeof candidate !== 'object') return false;
  const state = physicalAuthorityReceipts.get(candidate);
  if (!state || !ownerStates.has(state.outerOwner)) return false;
  try {
    const current = projectSavedFullAssemblySnapshotV1(state.borrowedSnapshotReceipt);
    return (
      snapshotIdentity(current) === state.expectedSnapshotIdentity &&
      outerIdentity(current) === state.expectedOuterIdentity
    );
  } catch {
    return false;
  }
}

export function disposeSavedFullAssemblyPhysicalAuthorityReceiptV1(receipt: unknown): void {
  if (!receipt || typeof receipt !== 'object') return;
  physicalAuthorityReceipts.delete(receipt);
}
