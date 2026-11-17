import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3,
  decodePatternImportDxfProductMultiseamPlacementSidecarV3,
  type PatternImportDxfProductMultiseamPlacementSidecarDocumentV3,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v3';
import type { DxfProductSavedRowIdentityV1 } from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2,
  decodePatternImportDxfProductMultiseamPlacementSidecarV2,
  type PatternImportDxfProductMultiseamPlacementSidecarDocumentV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1,
  isPatternImportDxfProductPhaseEExactTopologyBindingOwnerV1,
  type PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1,
  type PatternImportDxfProductPhaseEExactTopologyBindingOwnerV1,
  type PatternImportDxfProductPhaseEExactTopologyBindingSealV1,
} from './pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_DOCUMENT_V1,
  PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
} from './pattern-import-dxf-product-semantic-sidecar-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3 =
  'pattern-import-dxf-product-composite-sidecar-request/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V3 =
  'pattern-import-dxf-product-composite-sidecar-document/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V3 =
  'pattern-import-dxf-product-composite-sidecar-seal/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V3 =
  'pattern-import-dxf-product-composite-sidecar-owner/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3 =
  'application/vnd.grbpwr.pattern-dxf-product-composite.v3+json' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_COMPONENT_MEDIA_TYPE_V1 =
  'application/vnd.grbpwr.pattern-dxf-product-phase-e-exact-topology.v1+json' as const;

export type PatternImportDxfProductCompositeSidecarBindingsV3 = Readonly<{
  /** Backend saved-row revision; intentionally not the human pattern.version. */
  row: DxfProductSavedRowIdentityV1;
  serverAssemblyRevision: string;
  assemblyTopologySha256: string;
}>;

export type PatternImportDxfProductCompositeSidecarComponentKindV3 =
  | 'semantic-product-v1'
  | 'multiseam-placement-v2'
  | 'multiseam-placement-v3'
  | 'phase-e-exact-topology-v1';

export type PatternImportDxfProductCompositeSidecarComponentV3 = Readonly<{
  kind: PatternImportDxfProductCompositeSidecarComponentKindV3;
  mediaType:
    | typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1
    | typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2
    | typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3
    | typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_COMPONENT_MEDIA_TYPE_V1;
  sha256: string;
  byteLength: number;
  base64: string;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V3 = Object.freeze({
  exactSavedRowBound: true,
  exactServerAssemblyRevisionBound: true,
  exactAssemblyTopologySha256Bound: true,
  requiredProductV1BytesVerifiedAndPreserved: true,
  optionalPlacementV2VerifiedWhenPresent: true,
  optionalExactTopologyCarrierSealVerifiedWhenPresent: true,
  canonicalComponentOrderAndBase64Required: true,
  previousSidecarCasExpectationBound: true,
  legacyV1PlacementInferred: false,
  techCardSeamPlacementAcceptedAsPlacementAuthority: false,
  exactTopologyRestoreOwnerMinted: false,
  rawDxfAccepted: false,
  rawDxfRetained: false,
  persistenceRequestAdapterAvailable: true,
  sidecarGetPerformed: false,
  sidecarPutPerformed: false,
  persistenceIntegrated: false,
  placementIntegrated: false,
  previewReady: false,
  runtimeReady: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V3,
  exactSavedRowBound: false as const,
  exactServerAssemblyRevisionBound: false as const,
  exactAssemblyTopologySha256Bound: false as const,
  requiredProductV1BytesVerifiedAndPreserved: false as const,
  optionalPlacementV2VerifiedWhenPresent: false as const,
  optionalExactTopologyCarrierSealVerifiedWhenPresent: false as const,
  canonicalComponentOrderAndBase64Required: false as const,
  previousSidecarCasExpectationBound: false as const,
});

export type PatternImportDxfProductCompositeSidecarRequestV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3;
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
  expectedPreviousSidecarSha256: string | null;
  semanticProductV1Bytes: Uint8Array;
  placementV2Bytes: Uint8Array | null;
  /** Mutually exclusive with placementV2Bytes; omission preserves legacy request/bytes. */
  placementV3Bytes?: Uint8Array | null;
  exactTopologyBytes: Uint8Array | null;
}>;

export type PatternImportDxfProductCompositeSidecarDocumentV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V3;
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3;
  encoding: 'canonical-json-utf8';
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
  writeCas: Readonly<{ expectedPreviousSidecarSha256: string | null }>;
  components: readonly PatternImportDxfProductCompositeSidecarComponentV3[];
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V3;
}>;

export type PatternImportDxfProductCompositeSidecarSealV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V3;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  canonicalByteLength: number;
  authority: 'unsigned-composite-sidecar-storage-consistency-only';
  persistenceIntegrated: false;
  productionReady: false;
}>;

declare const ownerBrand: unique symbol;
export type PatternImportDxfProductCompositeSidecarOwnerV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V3;
  document: PatternImportDxfProductCompositeSidecarDocumentV3;
  seal: PatternImportDxfProductCompositeSidecarSealV3;
  readonly [ownerBrand]: never;
}>;

export type PatternImportDxfProductCompositeSidecarBlockerCodeV3 =
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
  | 'exact-topology-seal-mismatch'
  | 'sha256-unavailable'
  | 'invalid-owner';

export type PatternImportDxfProductCompositeSidecarBlockerV3 = Readonly<{
  code: PatternImportDxfProductCompositeSidecarBlockerCodeV3;
  field: string;
  detail: string;
}>;

export type PatternImportDxfProductCompositeSidecarResultV3 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductCompositeSidecarOwnerV3;
      document: PatternImportDxfProductCompositeSidecarDocumentV3;
      seal: PatternImportDxfProductCompositeSidecarSealV3;
      placementDocument: PatternImportDxfProductMultiseamPlacementSidecarDocumentV2 | null;
      observedPlacementDocument: PatternImportDxfProductMultiseamPlacementSidecarDocumentV3 | null;
      exactTopology: Readonly<{
        carrier: PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1;
        seal: PatternImportDxfProductPhaseEExactTopologyBindingSealV1;
        restoreOwner: null;
      }> | null;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V3;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      document: null;
      seal: null;
      placementDocument: null;
      observedPlacementDocument: null;
      exactTopology: null;
      blockers: readonly [PatternImportDxfProductCompositeSidecarBlockerV3];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export type EncodePatternImportDxfProductCompositeSidecarResultV3 =
  | Readonly<{
      ok: true;
      bytes: Uint8Array<ArrayBuffer>;
      canonicalSha256: string;
      canonicalByteLength: number;
    }>
  | Readonly<{ ok: false; code: 'invalid-owner'; bytes: null }>;

export type EncodePatternImportDxfProductExactTopologyComponentResultV3 =
  | Readonly<{
      ok: true;
      bytes: Uint8Array<ArrayBuffer>;
      sha256: string;
      byteLength: number;
    }>
  | Readonly<{
      ok: false;
      bytes: null;
      blocker: PatternImportDxfProductCompositeSidecarBlockerV3;
    }>;

type ExactTopologyProjection = Readonly<{
  carrier: PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1;
  seal: PatternImportDxfProductPhaseEExactTopologyBindingSealV1;
  restoreOwner: null;
}>;

type VerifiedComponents = Readonly<{
  placementDocument: PatternImportDxfProductMultiseamPlacementSidecarDocumentV2 | null;
  observedPlacementDocument: PatternImportDxfProductMultiseamPlacementSidecarDocumentV3 | null;
  exactTopology: ExactTopologyProjection | null;
  bytes: ReadonlyMap<
    PatternImportDxfProductCompositeSidecarComponentKindV3,
    Uint8Array<ArrayBuffer>
  >;
}>;

type OwnerState = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  components: ReadonlyMap<
    PatternImportDxfProductCompositeSidecarComponentKindV3,
    Uint8Array<ArrayBuffer>
  >;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const MAX_COMPONENT_BYTES = 4 * 1024 * 1024;
const MAX_EXACT_TOPOLOGY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_COMPONENT_BYTES = 16 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 24 * 1024 * 1024;
const MAX_GRAPH_DEPTH = 32;
const MAX_GRAPH_NODES = 100_000;
const MAX_GRAPH_PROPERTIES = 400_000;
const MAX_ARRAY_LENGTH = 32_768;
const MAX_STRING_BYTES = 16 * 1024 * 1024;
const MAX_SERVER_ASSEMBLY_REVISION_BYTES = 512;
const EXACT_TOPOLOGY_HASH_DOMAIN = 'pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const encoder = new TextEncoder();
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  'byteLength',
)?.get;
const typedArraySet = Uint8Array.prototype.set;
const ownerStates = new WeakMap<object, OwnerState>();

class CompositeFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductCompositeSidecarBlockerCodeV3,
    readonly field: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(
  code: PatternImportDxfProductCompositeSidecarBlockerCodeV3,
  field: string,
  detail: string,
): never {
  throw new CompositeFailure(code, field, detail);
}

function blocker(error: unknown): PatternImportDxfProductCompositeSidecarBlockerV3 {
  const failure =
    error instanceof CompositeFailure
      ? error
      : new CompositeFailure('invalid-input', 'request', 'Composite sidecar failed closed.');
  return Object.freeze({ code: failure.code, field: failure.field, detail: failure.message });
}

function blocked(error: unknown): PatternImportDxfProductCompositeSidecarResultV3 {
  return Object.freeze({
    ok: false as const,
    owner: null,
    document: null,
    seal: null,
    placementDocument: null,
    observedPlacementDocument: null,
    exactTopology: null,
    blockers: Object.freeze([blocker(error)]) as readonly [
      PatternImportDxfProductCompositeSidecarBlockerV3,
    ],
    claims: BLOCKED_CLAIMS,
  });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    fail('invalid-input', path, 'Expected a plain record.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', path, 'Record reflection failed.');
  }
  if (prototype !== Object.prototype && prototype !== null)
    fail('invalid-input', path, 'Expected an exact plain record prototype.');
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('invalid-input', path, 'Record has missing, hidden, symbol, or unexpected fields.');
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
      fail('invalid-input', `${path}.${key}`, 'Expected one enumerable data property.');
    Object.defineProperty(output, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: descriptor.value,
    });
  }
  return output;
}

function integer(value: unknown, minimum: number, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    fail('invalid-input', path, `Expected a safe integer >= ${minimum}.`);
  return value as number;
}

function stableText(value: unknown, path: string, maximum = 4_096): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    !STABLE_ID.test(value)
  )
    fail('invalid-input', path, 'Expected a bounded stable identifier.');
  return value;
}

function sha(value: unknown, path: string): string {
  if (typeof value !== 'string' || !SHA256.test(value))
    fail('invalid-input', path, 'Expected a lowercase SHA-256 digest.');
  return value;
}

function savedUrl(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096)
    fail('invalid-input', path, 'Expected a bounded saved-row URL.');
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) <= 0x1f)
      fail('invalid-input', path, 'Saved-row URL contains a forbidden control character.');
  const lower = value.trimStart().toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('javascript:'))
    fail('invalid-input', path, 'Saved-row URL uses a forbidden scheme.');
  return value;
}

function serverAssemblyRevision(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_SERVER_ASSEMBLY_REVISION_BYTES ||
    value.trim() !== value ||
    /^[0-9]+$/.test(value)
  )
    fail('invalid-input', path, 'Expected a distinct opaque server Assembly revision token.');
  if (encoder.encode(value).byteLength > MAX_SERVER_ASSEMBLY_REVISION_BYTES)
    fail('bounds-exceeded', path, 'Server Assembly revision exceeds 512 UTF-8 bytes.');
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f)
      fail('invalid-input', path, 'Server Assembly revision contains a control character.');
  }
  return value;
}

function validateRow(value: unknown, path: string): DxfProductSavedRowIdentityV1 {
  const row = exactRecord(
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
  stableText(row.scopeKey, `${path}.scopeKey`, 256);
  stableText(row.patternLineKey, `${path}.patternLineKey`, 256);
  integer(row.revision, 1, `${path}.revision`);
  integer(row.cardLockVersion, 0, `${path}.cardLockVersion`);
  savedUrl(row.url, `${path}.url`);
  integer(row.sizeBytes, 1, `${path}.sizeBytes`);
  sha(row.sha256, `${path}.sha256`);
  return row as DxfProductSavedRowIdentityV1;
}

function validateBindings(
  value: unknown,
  path: string,
): PatternImportDxfProductCompositeSidecarBindingsV3 {
  const bindings = exactRecord(
    value,
    ['row', 'serverAssemblyRevision', 'assemblyTopologySha256'],
    path,
  );
  validateRow(bindings.row, `${path}.row`);
  serverAssemblyRevision(bindings.serverAssemblyRevision, `${path}.serverAssemblyRevision`);
  sha(bindings.assemblyTopologySha256, `${path}.assemblyTopologySha256`);
  return bindings as PatternImportDxfProductCompositeSidecarBindingsV3;
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1) {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError('noncanonical number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('unsupported canonical value');
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

type ScanState = { nodes: number; properties: number; seen: Set<object> };

function detachPlain(value: unknown, path = 'value', depth = 0, state?: ScanState): unknown {
  const current = state ?? { nodes: 0, properties: 0, seen: new Set<object>() };
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_BYTES || encoder.encode(value).byteLength > MAX_STRING_BYTES)
      fail('bounds-exceeded', path, 'String exceeds the byte bound.');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail('invalid-input', path, 'Numbers must be finite and cannot be signed zero.');
    return value;
  }
  if (!value || typeof value !== 'object')
    fail('invalid-input', path, 'Only plain data is accepted.');
  if (depth > MAX_GRAPH_DEPTH) fail('bounds-exceeded', path, 'Object graph is too deep.');
  if (current.seen.has(value)) fail('invalid-input', path, 'Aliases and cycles are forbidden.');
  current.seen.add(value);
  current.nodes += 1;
  if (current.nodes > MAX_GRAPH_NODES) fail('bounds-exceeded', path, 'Object graph is too large.');
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    fail('invalid-input', path, 'Binary values are not plain data.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', path, 'Input reflection failed.');
  }
  const isArray = Array.isArray(value);
  if (
    (isArray && prototype !== Array.prototype) ||
    (!isArray && prototype !== Object.prototype && prototype !== null)
  )
    fail('invalid-input', path, 'Expected an exact plain record or array prototype.');
  const keys = Reflect.ownKeys(descriptors);
  const dataKeys = isArray ? keys.filter((key) => key !== 'length') : keys;
  if (isArray) {
    const descriptor = descriptors.length;
    if (
      !descriptor ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      !Number.isSafeInteger(descriptor.value) ||
      descriptor.value < 0 ||
      descriptor.value > MAX_ARRAY_LENGTH
    )
      fail('bounds-exceeded', path, 'Array length is invalid.');
    const length = descriptor.value as number;
    if (dataKeys.length !== length || dataKeys.some((key, index) => key !== String(index)))
      fail('invalid-input', path, 'Arrays must be dense and have no extra properties.');
  }
  current.properties += dataKeys.length;
  if (current.properties > MAX_GRAPH_PROPERTIES)
    fail('bounds-exceeded', path, 'Object graph has too many properties.');
  const output: unknown[] | Record<string, unknown> = isArray
    ? []
    : (Object.create(null) as Record<string, unknown>);
  for (const key of dataKeys) {
    if (typeof key !== 'string') fail('invalid-input', path, 'Symbol properties are forbidden.');
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${path}.${key}`, 'Expected one enumerable data property.');
    const child = detachPlain(descriptor.value, `${path}.${key}`, depth + 1, current);
    if (Array.isArray(output)) output.push(child);
    else
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: child,
      });
  }
  return output;
}

function copyBytes(value: unknown, path: string, maximum: number): Uint8Array<ArrayBuffer> {
  if (Object.getPrototypeOf(value) !== Uint8Array.prototype || !typedArrayByteLengthGetter)
    fail('invalid-bytes', path, 'Expected an exact Uint8Array.');
  let byteLength: number;
  try {
    byteLength = Reflect.apply(typedArrayByteLengthGetter, value, []) as number;
  } catch {
    fail('invalid-bytes', path, 'Could not inspect bytes.');
  }
  if (byteLength < 1 || byteLength > maximum)
    fail('bounds-exceeded', path, 'Byte length is out of bounds.');
  try {
    const copy = new Uint8Array(byteLength);
    Reflect.apply(typedArraySet, copy, [value]);
    return copy;
  } catch {
    fail('invalid-bytes', path, 'Could not copy bytes.');
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
  if (!crypto?.subtle) fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 is unavailable.');
  let known: ArrayBuffer;
  try {
    known = await crypto.subtle.digest('SHA-256', encoder.encode('abc'));
  } catch {
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 self-test failed.');
  }
  if (known.byteLength !== 32)
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 self-test length mismatch.');
  const knownHex = [...new Uint8Array(known)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  if (knownHex !== SHA256_ABC)
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 self-test mismatch.');
  let result: ArrayBuffer;
  try {
    result = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  } catch {
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 digest failed.');
  }
  if (result.byteLength !== 32)
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 digest length mismatch.');
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.byteLength; index += 3) {
    const a = bytes[index]!;
    const hasB = index + 1 < bytes.byteLength;
    const hasC = index + 2 < bytes.byteLength;
    const b = hasB ? bytes[index + 1]! : 0;
    const c = hasC ? bytes[index + 2]! : 0;
    const packed = (a << 16) | (b << 8) | c;
    output += BASE64_ALPHABET[(packed >>> 18) & 63];
    output += BASE64_ALPHABET[(packed >>> 12) & 63];
    output += hasB ? BASE64_ALPHABET[(packed >>> 6) & 63] : '=';
    output += hasC ? BASE64_ALPHABET[packed & 63] : '=';
  }
  return output;
}

function decodeBase64(value: unknown, path: string, maximum: number): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    fail('invalid-input', path, 'Expected canonical padded base64.');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const byteLength = (value.length / 4) * 3 - padding;
  if (byteLength < 1 || byteLength > maximum)
    fail('bounds-exceeded', path, 'Decoded component length is out of bounds.');
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (let index = 0; index < value.length; index += 4) {
    const a = BASE64_ALPHABET.indexOf(value[index]!);
    const b = BASE64_ALPHABET.indexOf(value[index + 1]!);
    const c = value[index + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(value[index + 2]!);
    const d = value[index + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(value[index + 3]!);
    const packed = (a << 18) | (b << 12) | (c << 6) | d;
    if (offset < byteLength) output[offset++] = (packed >>> 16) & 255;
    if (offset < byteLength) output[offset++] = (packed >>> 8) & 255;
    if (offset < byteLength) output[offset++] = packed & 255;
  }
  if (encodeBase64(output) !== value)
    fail('noncanonical-bytes', path, 'Base64 spelling is not canonical.');
  return output;
}

function parseJsonBytes(bytes: Uint8Array<ArrayBuffer>, path: string): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('invalid-utf8', path, 'Component is not valid UTF-8.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail('invalid-json', path, 'Component is not valid JSON.');
  }
}

function validateLegacyCrossBinding(
  parsed: unknown,
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
): void {
  const document = exactRecord(
    parsed,
    ['schemaVersion', 'mediaType', 'encoding', 'product', 'mapping', 'persistence'],
    'components.semantic-product-v1',
  );
  const product = document.product as Record<string, unknown>;
  const persistence = document.persistence as Record<string, unknown>;
  const card = persistence.card as Record<string, unknown>;
  const pattern = persistence.pattern as Record<string, unknown>;
  const previousLockVersion = card.previousLockVersion;
  const observedLockVersion = card.observedLockVersion;
  if (
    document.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_DOCUMENT_V1 ||
    product.scopeKey !== bindings.row.scopeKey ||
    product.exportSha256 !== bindings.row.sha256 ||
    product.byteLength !== bindings.row.sizeBytes ||
    card.techCardId !== bindings.row.techCardId ||
    !Number.isSafeInteger(previousLockVersion) ||
    (previousLockVersion as number) < 0 ||
    !Number.isSafeInteger(observedLockVersion) ||
    (observedLockVersion as number) <= (previousLockVersion as number) ||
    (observedLockVersion as number) > bindings.row.cardLockVersion ||
    pattern.lineKey !== bindings.row.patternLineKey ||
    pattern.url !== bindings.row.url ||
    pattern.scopeKey !== bindings.row.scopeKey ||
    pattern.sha256 !== bindings.row.sha256
  )
    fail(
      'component-binding-mismatch',
      'components.semantic-product-v1',
      'V1 semantic/product component differs from the exact saved row.',
    );
}

function validatePlacementCrossBinding(
  document:
    | PatternImportDxfProductMultiseamPlacementSidecarDocumentV2
    | PatternImportDxfProductMultiseamPlacementSidecarDocumentV3,
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
): void {
  const row = document.bindings.row;
  if (
    row.techCardId !== bindings.row.techCardId ||
    row.cardLockVersion !== bindings.row.cardLockVersion ||
    row.scopeKey !== bindings.row.scopeKey ||
    row.patternLineKey !== bindings.row.patternLineKey ||
    row.patternUrl !== bindings.row.url ||
    row.revision !== bindings.row.revision ||
    row.dxfSha256 !== bindings.row.sha256 ||
    document.bindings.topology.assemblyTopologySha256 !== bindings.assemblyTopologySha256
  )
    fail(
      'component-binding-mismatch',
      'components.multiseam-placement-v2',
      'Placement V2 component differs from the exact row or Assembly topology.',
    );
}

function validateExactTopologyCarrier(
  value: unknown,
): PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1 {
  const carrier = exactRecord(
    value,
    ['schemaVersion', 'status', 'bindings', 'sides', 'claims'],
    'exact.carrier',
  );
  if (
    carrier.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1 ||
    carrier.status !== 'exact-phase-e-topology-authoring-binding' ||
    canonical(carrier.claims) !==
      canonical(PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_CLAIMS_V1)
  )
    fail('invalid-input', 'exact.carrier', 'Exact-topology carrier policy differs from V1.');
  const bindings = exactRecord(
    carrier.bindings,
    [
      'row',
      'serverAssemblyRevision',
      'assemblyTopologySha256',
      'selectedOperation',
      'catalogCanonicalSha256',
      'proposalFingerprint',
      'phaseEAggregatePlanSha256',
    ],
    'exact.carrier.bindings',
  );
  validateRow(bindings.row, 'exact.carrier.bindings.row');
  serverAssemblyRevision(
    bindings.serverAssemblyRevision,
    'exact.carrier.bindings.serverAssemblyRevision',
  );
  sha(bindings.assemblyTopologySha256, 'exact.carrier.bindings.assemblyTopologySha256');
  sha(bindings.catalogCanonicalSha256, 'exact.carrier.bindings.catalogCanonicalSha256');
  sha(bindings.phaseEAggregatePlanSha256, 'exact.carrier.bindings.phaseEAggregatePlanSha256');
  if (
    typeof bindings.proposalFingerprint !== 'string' ||
    !/^pidpemsv2-fnv1a64:[0-9a-f]{16}$/.test(bindings.proposalFingerprint)
  )
    fail(
      'invalid-input',
      'exact.carrier.bindings.proposalFingerprint',
      'Invalid proposal fingerprint.',
    );
  const operation = exactRecord(
    bindings.selectedOperation,
    ['sourceOperationNumber', 'authoringOperationId', 'localOperationOrder', 'seamIds'],
    'exact.carrier.bindings.selectedOperation',
  );
  integer(
    operation.sourceOperationNumber,
    1,
    'exact.carrier.bindings.selectedOperation.sourceOperationNumber',
  );
  stableText(
    operation.authoringOperationId,
    'exact.carrier.bindings.selectedOperation.authoringOperationId',
  );
  if (operation.localOperationOrder !== 0)
    fail(
      'invalid-input',
      'exact.carrier.bindings.selectedOperation.localOperationOrder',
      'Expected zero.',
    );
  if (!Array.isArray(operation.seamIds) || operation.seamIds.length !== 2)
    fail(
      'invalid-input',
      'exact.carrier.bindings.selectedOperation.seamIds',
      'Expected two seams.',
    );
  const seamIds = operation.seamIds;
  seamIds.forEach((id, index) =>
    stableText(id, `exact.carrier.bindings.selectedOperation.seamIds[${index}]`),
  );
  if (seamIds[0] === seamIds[1])
    fail('invalid-input', 'exact.carrier.bindings.selectedOperation.seamIds', 'Seams must differ.');
  if (!Array.isArray(carrier.sides) || carrier.sides.length !== 4)
    fail('invalid-input', 'exact.carrier.sides', 'Expected four exact side bindings.');
  carrier.sides.forEach((entry, index) => {
    const side = exactRecord(
      entry,
      [
        'seamId',
        'sideIndex',
        'pieceLineKey',
        'pieceId',
        'contourId',
        'boundaryVertexIds',
        'direction',
      ],
      `exact.carrier.sides[${index}]`,
    );
    const expectedSeam = seamIds[Math.floor(index / 2)];
    if (side.seamId !== expectedSeam || side.sideIndex !== index % 2)
      fail(
        'invalid-input',
        `exact.carrier.sides[${index}]`,
        'Side ordering differs from selected seams.',
      );
    ['pieceLineKey', 'pieceId', 'contourId'].forEach((key) =>
      stableText(side[key], `exact.carrier.sides[${index}].${key}`),
    );
    if (!Array.isArray(side.boundaryVertexIds) || side.boundaryVertexIds.length !== 2)
      fail(
        'invalid-input',
        `exact.carrier.sides[${index}].boundaryVertexIds`,
        'Expected two vertices.',
      );
    side.boundaryVertexIds.forEach((id, vertexIndex) =>
      stableText(id, `exact.carrier.sides[${index}].boundaryVertexIds[${vertexIndex}]`),
    );
    if (side.boundaryVertexIds[0] === side.boundaryVertexIds[1])
      fail(
        'invalid-input',
        `exact.carrier.sides[${index}].boundaryVertexIds`,
        'Vertices must differ.',
      );
    if (side.direction !== 'forward' && side.direction !== 'reverse')
      fail('invalid-input', `exact.carrier.sides[${index}].direction`, 'Invalid direction.');
  });
  return carrier as PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1;
}

async function verifyExactTopologyBytes(
  bytes: Uint8Array<ArrayBuffer>,
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<ExactTopologyProjection> {
  const parsed = detachPlain(
    parseJsonBytes(bytes, 'components.phase-e-exact-topology-v1'),
    'exact',
  );
  const wrapper = exactRecord(parsed, ['carrier', 'seal'], 'exact');
  const carrier = validateExactTopologyCarrier(wrapper.carrier);
  const seal = exactRecord(
    wrapper.seal,
    [
      'schemaVersion',
      'algorithm',
      'canonicalSha256',
      'canonicalByteLength',
      'authority',
      'persistenceIntegrated',
      'productionReady',
    ],
    'exact.seal',
  );
  if (
    seal.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1 ||
    seal.algorithm !== 'SHA-256' ||
    seal.authority !== 'unsigned-exact-authoring-subdocument-consistency-only' ||
    seal.persistenceIntegrated !== false ||
    seal.productionReady !== false
  )
    fail('exact-topology-seal-mismatch', 'exact.seal', 'Exact-topology seal policy differs.');
  sha(seal.canonicalSha256, 'exact.seal.canonicalSha256');
  integer(seal.canonicalByteLength, 1, 'exact.seal.canonicalByteLength');
  const canonicalBytes = encoder.encode(canonical(parsed));
  if (!sameBytes(bytes, canonicalBytes))
    fail(
      'noncanonical-bytes',
      'components.phase-e-exact-topology-v1',
      'Exact-topology bytes are not canonical.',
    );
  const carrierBytes = encoder.encode(canonical(carrier));
  const digest = await sha256(
    encoder.encode(`${EXACT_TOPOLOGY_HASH_DOMAIN}\0${canonical(carrier)}`),
    crypto,
  );
  if (seal.canonicalSha256 !== digest || seal.canonicalByteLength !== carrierBytes.byteLength)
    fail(
      'exact-topology-seal-mismatch',
      'exact.seal',
      'Exact-topology carrier seal does not verify.',
    );
  const exactBindings = carrier.bindings;
  if (
    !sameRow(exactBindings.row, bindings.row) ||
    exactBindings.serverAssemblyRevision !== bindings.serverAssemblyRevision ||
    exactBindings.assemblyTopologySha256 !== bindings.assemblyTopologySha256
  )
    fail(
      'component-binding-mismatch',
      'components.phase-e-exact-topology-v1',
      'Exact-topology component differs from the outer row or Assembly authority.',
    );
  return deepFreeze({
    carrier,
    seal: seal as PatternImportDxfProductPhaseEExactTopologyBindingSealV1,
    restoreOwner: null,
  });
}

async function verifyComponents(
  components: readonly PatternImportDxfProductCompositeSidecarComponentV3[],
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<VerifiedComponents> {
  const kinds = components.map(({ kind }) => kind);
  const expected = [
    'semantic-product-v1',
  ] as PatternImportDxfProductCompositeSidecarComponentKindV3[];
  if (kinds.includes('multiseam-placement-v2') && kinds.includes('multiseam-placement-v3'))
    fail(
      'component-order-mismatch',
      'document.components',
      'Only one placement version may be active.',
    );
  if (kinds.includes('multiseam-placement-v2')) expected.push('multiseam-placement-v2');
  if (kinds.includes('multiseam-placement-v3')) expected.push('multiseam-placement-v3');
  if (kinds.includes('phase-e-exact-topology-v1')) expected.push('phase-e-exact-topology-v1');
  if (kinds.length !== expected.length || kinds.some((kind, index) => kind !== expected[index]))
    fail(
      'component-order-mismatch',
      'document.components',
      'Components are missing, duplicated, or out of order.',
    );
  let total = 0;
  let placementDocument: PatternImportDxfProductMultiseamPlacementSidecarDocumentV2 | null = null;
  let observedPlacementDocument: PatternImportDxfProductMultiseamPlacementSidecarDocumentV3 | null =
    null;
  let exactTopology: ExactTopologyProjection | null = null;
  const byteMap = new Map<
    PatternImportDxfProductCompositeSidecarComponentKindV3,
    Uint8Array<ArrayBuffer>
  >();
  for (const [index, component] of components.entries()) {
    const maximum =
      component.kind === 'phase-e-exact-topology-v1'
        ? MAX_EXACT_TOPOLOGY_BYTES
        : MAX_COMPONENT_BYTES;
    const expectedMedia =
      component.kind === 'semantic-product-v1'
        ? PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1
        : component.kind === 'multiseam-placement-v2'
          ? PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2
          : component.kind === 'multiseam-placement-v3'
            ? PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3
            : PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_COMPONENT_MEDIA_TYPE_V1;
    if (component.mediaType !== expectedMedia)
      fail(
        'component-media-mismatch',
        `document.components[${index}].mediaType`,
        'Component media type differs from kind.',
      );
    sha(component.sha256, `document.components[${index}].sha256`);
    integer(component.byteLength, 1, `document.components[${index}].byteLength`);
    const bytes = decodeBase64(component.base64, `document.components[${index}].base64`, maximum);
    if (component.byteLength !== bytes.byteLength)
      fail(
        'component-digest-mismatch',
        `document.components[${index}].byteLength`,
        'Component length differs.',
      );
    total += bytes.byteLength;
    if (total > MAX_TOTAL_COMPONENT_BYTES)
      fail('bounds-exceeded', 'document.components', 'Combined component bytes exceed the bound.');
    const digest = await sha256(bytes, crypto);
    if (component.sha256 !== digest)
      fail(
        'component-digest-mismatch',
        `document.components[${index}].sha256`,
        'Component digest differs.',
      );
    if (component.kind === 'semantic-product-v1') {
      const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(bytes, crypto);
      if (!decoded.ok || decoded.compatibility !== 'legacy-v1-no-placement')
        fail(
          'component-media-mismatch',
          `document.components[${index}]`,
          'Required component is not verified V1.',
        );
      validateLegacyCrossBinding(parseJsonBytes(bytes, 'semantic-product-v1'), bindings);
    } else if (component.kind === 'multiseam-placement-v2') {
      const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(bytes, crypto);
      if (!decoded.ok || decoded.compatibility !== 'placement-v2')
        fail(
          'component-media-mismatch',
          `document.components[${index}]`,
          'Optional placement component is not V2.',
        );
      validatePlacementCrossBinding(decoded.document, bindings);
      placementDocument = decoded.document;
    } else if (component.kind === 'multiseam-placement-v3') {
      const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV3(bytes, crypto);
      if (!decoded.ok)
        fail(
          'component-media-mismatch',
          `document.components[${index}]`,
          'Optional observed placement component is not V3.',
        );
      validatePlacementCrossBinding(decoded.document, bindings);
      observedPlacementDocument = decoded.document;
    } else exactTopology = await verifyExactTopologyBytes(bytes, bindings, crypto);
    byteMap.set(component.kind, bytes.slice());
  }
  return Object.freeze({
    placementDocument,
    observedPlacementDocument,
    exactTopology,
    bytes: byteMap,
  });
}

function validateComponentMetadata(
  value: unknown,
  path: string,
): PatternImportDxfProductCompositeSidecarComponentV3 {
  const component = exactRecord(
    value,
    ['kind', 'mediaType', 'sha256', 'byteLength', 'base64'],
    path,
  );
  if (
    component.kind !== 'semantic-product-v1' &&
    component.kind !== 'multiseam-placement-v2' &&
    component.kind !== 'multiseam-placement-v3' &&
    component.kind !== 'phase-e-exact-topology-v1'
  )
    fail('invalid-input', `${path}.kind`, 'Unsupported component kind.');
  if (typeof component.mediaType !== 'string' || typeof component.base64 !== 'string')
    fail('invalid-input', path, 'Component text fields are invalid.');
  sha(component.sha256, `${path}.sha256`);
  integer(component.byteLength, 1, `${path}.byteLength`);
  return component as PatternImportDxfProductCompositeSidecarComponentV3;
}

function validateDocument(value: unknown): PatternImportDxfProductCompositeSidecarDocumentV3 {
  const document = exactRecord(
    value,
    ['schemaVersion', 'mediaType', 'encoding', 'bindings', 'writeCas', 'components', 'claims'],
    'document',
  );
  if (
    document.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V3 ||
    document.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3 ||
    document.encoding !== 'canonical-json-utf8'
  )
    fail(
      'unsupported-schema',
      'document',
      'Composite sidecar schema/media/encoding is unsupported.',
    );
  validateBindings(document.bindings, 'document.bindings');
  const writeCas = exactRecord(
    document.writeCas,
    ['expectedPreviousSidecarSha256'],
    'document.writeCas',
  );
  if (writeCas.expectedPreviousSidecarSha256 !== null)
    sha(writeCas.expectedPreviousSidecarSha256, 'document.writeCas.expectedPreviousSidecarSha256');
  if (
    !Array.isArray(document.components) ||
    document.components.length < 1 ||
    document.components.length > 3
  )
    fail('invalid-input', 'document.components', 'Expected one to three ordered components.');
  document.components.forEach((component, index) =>
    validateComponentMetadata(component, `document.components[${index}]`),
  );
  if (
    canonical(document.claims) !== canonical(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V3)
  )
    fail('invalid-input', 'document.claims', 'Composite claims differ from V3.');
  return document as PatternImportDxfProductCompositeSidecarDocumentV3;
}

function makeSeal(
  canonicalSha256: string,
  canonicalByteLength: number,
): PatternImportDxfProductCompositeSidecarSealV3 {
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SEAL_V3,
    algorithm: 'SHA-256' as const,
    canonicalSha256,
    canonicalByteLength,
    authority: 'unsigned-composite-sidecar-storage-consistency-only' as const,
    persistenceIntegrated: false as const,
    productionReady: false as const,
  });
}

function makeOwner(
  document: PatternImportDxfProductCompositeSidecarDocumentV3,
  seal: PatternImportDxfProductCompositeSidecarSealV3,
  bytes: Uint8Array<ArrayBuffer>,
  components: ReadonlyMap<
    PatternImportDxfProductCompositeSidecarComponentKindV3,
    Uint8Array<ArrayBuffer>
  >,
): PatternImportDxfProductCompositeSidecarOwnerV3 {
  const owner = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_OWNER_V3,
    document,
    seal,
  }) as PatternImportDxfProductCompositeSidecarOwnerV3;
  ownerStates.set(owner, {
    bytes: bytes.slice(),
    components: new Map([...components].map(([kind, value]) => [kind, value.slice()])),
  });
  return owner;
}

async function component(
  kind: PatternImportDxfProductCompositeSidecarComponentKindV3,
  mediaType: PatternImportDxfProductCompositeSidecarComponentV3['mediaType'],
  bytes: Uint8Array<ArrayBuffer>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<PatternImportDxfProductCompositeSidecarComponentV3> {
  return Object.freeze({
    kind,
    mediaType,
    sha256: await sha256(bytes, crypto),
    byteLength: bytes.byteLength,
    base64: encodeBase64(bytes),
  });
}

export async function encodePatternImportDxfProductExactTopologyComponentV3(
  candidate: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<EncodePatternImportDxfProductExactTopologyComponentResultV3> {
  try {
    if (!isPatternImportDxfProductPhaseEExactTopologyBindingOwnerV1(candidate))
      fail('invalid-owner', 'owner', 'A genuine live exact-topology owner is required.');
    const owner = candidate as PatternImportDxfProductPhaseEExactTopologyBindingOwnerV1;
    const bytes = encoder.encode(canonical({ carrier: owner.carrier, seal: owner.seal }));
    if (bytes.byteLength > MAX_EXACT_TOPOLOGY_BYTES)
      fail('bounds-exceeded', 'owner', 'Exact-topology component exceeds the byte bound.');
    await verifyExactTopologyBytes(
      bytes,
      {
        row: owner.carrier.bindings.row,
        serverAssemblyRevision: owner.carrier.bindings.serverAssemblyRevision,
        assemblyTopologySha256: owner.carrier.bindings.assemblyTopologySha256,
      },
      crypto,
    );
    return Object.freeze({
      ok: true as const,
      bytes: bytes.slice(),
      sha256: await sha256(bytes, crypto),
      byteLength: bytes.byteLength,
    });
  } catch (error) {
    return Object.freeze({ ok: false as const, bytes: null, blocker: blocker(error) });
  }
}

function captureBuildRequest(input: unknown): Readonly<{
  bindings: PatternImportDxfProductCompositeSidecarBindingsV3;
  expectedPreviousSidecarSha256: string | null;
  semanticProductV1Bytes: Uint8Array<ArrayBuffer>;
  placementV2Bytes: Uint8Array<ArrayBuffer> | null;
  placementV3Bytes: Uint8Array<ArrayBuffer> | null;
  exactTopologyBytes: Uint8Array<ArrayBuffer> | null;
}> {
  const request = exactRecord(
    input,
    [
      'schemaVersion',
      'bindings',
      'expectedPreviousSidecarSha256',
      'semanticProductV1Bytes',
      'placementV2Bytes',
      'exactTopologyBytes',
      ...(input && typeof input === 'object' && Object.hasOwn(input, 'placementV3Bytes')
        ? ['placementV3Bytes']
        : []),
    ],
    'request',
  );
  if (request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3)
    fail('unsupported-schema', 'request.schemaVersion', 'Composite request schema is unsupported.');
  const detachedBindings = detachPlain(request.bindings, 'request.bindings');
  const bindings = validateBindings(detachedBindings, 'request.bindings');
  if (request.expectedPreviousSidecarSha256 !== null)
    sha(request.expectedPreviousSidecarSha256, 'request.expectedPreviousSidecarSha256');
  if (request.placementV3Bytes != null && request.placementV2Bytes !== null)
    fail('component-order-mismatch', 'request', 'Only one placement version may be active.');
  return Object.freeze({
    bindings,
    expectedPreviousSidecarSha256: request.expectedPreviousSidecarSha256 as string | null,
    semanticProductV1Bytes: copyBytes(
      request.semanticProductV1Bytes,
      'request.semanticProductV1Bytes',
      MAX_COMPONENT_BYTES,
    ),
    placementV2Bytes:
      request.placementV2Bytes === null
        ? null
        : copyBytes(request.placementV2Bytes, 'request.placementV2Bytes', MAX_COMPONENT_BYTES),
    placementV3Bytes:
      request.placementV3Bytes === undefined || request.placementV3Bytes === null
        ? null
        : copyBytes(request.placementV3Bytes, 'request.placementV3Bytes', MAX_COMPONENT_BYTES),
    exactTopologyBytes:
      request.exactTopologyBytes === null
        ? null
        : copyBytes(
            request.exactTopologyBytes,
            'request.exactTopologyBytes',
            MAX_EXACT_TOPOLOGY_BYTES,
          ),
  });
}

export async function buildPatternImportDxfProductCompositeSidecarV3(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCompositeSidecarResultV3> {
  try {
    const request = captureBuildRequest(input);
    const components: PatternImportDxfProductCompositeSidecarComponentV3[] = [
      await component(
        'semantic-product-v1',
        PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
        request.semanticProductV1Bytes,
        crypto,
      ),
    ];
    if (request.placementV2Bytes)
      components.push(
        await component(
          'multiseam-placement-v2',
          PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2,
          request.placementV2Bytes,
          crypto,
        ),
      );
    if (request.placementV3Bytes)
      components.push(
        await component(
          'multiseam-placement-v3',
          PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3,
          request.placementV3Bytes,
          crypto,
        ),
      );
    if (request.exactTopologyBytes)
      components.push(
        await component(
          'phase-e-exact-topology-v1',
          PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_COMPONENT_MEDIA_TYPE_V1,
          request.exactTopologyBytes,
          crypto,
        ),
      );
    const verified = await verifyComponents(components, request.bindings, crypto);
    const document = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DOCUMENT_V3,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
      encoding: 'canonical-json-utf8' as const,
      bindings: request.bindings,
      writeCas: Object.freeze({
        expectedPreviousSidecarSha256: request.expectedPreviousSidecarSha256,
      }),
      components: Object.freeze(components),
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V3,
    } satisfies PatternImportDxfProductCompositeSidecarDocumentV3);
    const bytes = encoder.encode(canonical(document));
    if (bytes.byteLength > MAX_DOCUMENT_BYTES)
      fail('bounds-exceeded', 'document', 'Composite document exceeds the byte bound.');
    const seal = makeSeal(await sha256(bytes, crypto), bytes.byteLength);
    const owner = makeOwner(document, seal, bytes, verified.bytes);
    return Object.freeze({
      ok: true as const,
      owner,
      document,
      seal,
      placementDocument: verified.placementDocument,
      observedPlacementDocument: verified.observedPlacementDocument,
      exactTopology: verified.exactTopology,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V3,
    });
  } catch (error) {
    return blocked(error);
  }
}

export async function decodePatternImportDxfProductCompositeSidecarV3(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCompositeSidecarResultV3> {
  try {
    const bytes = copyBytes(input, 'bytes', MAX_DOCUMENT_BYTES);
    const detached = detachPlain(parseJsonBytes(bytes, 'bytes'), 'document');
    const document = validateDocument(detached);
    const canonicalBytes = encoder.encode(canonical(document));
    if (!sameBytes(bytes, canonicalBytes))
      fail('noncanonical-bytes', 'bytes', 'Composite bytes are not the exact canonical encoding.');
    const verified = await verifyComponents(document.components, document.bindings, crypto);
    const frozenDocument = deepFreeze(document);
    const seal = makeSeal(await sha256(canonicalBytes, crypto), canonicalBytes.byteLength);
    const owner = makeOwner(frozenDocument, seal, canonicalBytes, verified.bytes);
    return Object.freeze({
      ok: true as const,
      owner,
      document: frozenDocument,
      seal,
      placementDocument: verified.placementDocument,
      observedPlacementDocument: verified.observedPlacementDocument,
      exactTopology: verified.exactTopology,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_CLAIMS_V3,
    });
  } catch (error) {
    return blocked(error);
  }
}

export function encodePatternImportDxfProductCompositeSidecarV3(
  candidate: unknown,
): EncodePatternImportDxfProductCompositeSidecarResultV3 {
  if (!candidate || typeof candidate !== 'object')
    return Object.freeze({ ok: false, code: 'invalid-owner', bytes: null });
  const state = ownerStates.get(candidate);
  if (!state) return Object.freeze({ ok: false, code: 'invalid-owner', bytes: null });
  const owner = candidate as PatternImportDxfProductCompositeSidecarOwnerV3;
  return Object.freeze({
    ok: true,
    bytes: state.bytes.slice(),
    canonicalSha256: owner.seal.canonicalSha256,
    canonicalByteLength: state.bytes.byteLength,
  });
}

export function readPatternImportDxfProductCompositeComponentBytesV3(
  candidate: unknown,
  kind: PatternImportDxfProductCompositeSidecarComponentKindV3,
): Uint8Array<ArrayBuffer> | null {
  if (!candidate || typeof candidate !== 'object') return null;
  return ownerStates.get(candidate)?.components.get(kind)?.slice() ?? null;
}
