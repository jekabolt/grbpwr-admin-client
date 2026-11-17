import type {
  DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_REQUEST_V1,
  DxfProductTwoPanelSkirtAnnularMappingParametersV1,
} from './dxf-product-two-panel-skirt-annular-mapping-parameters-v1';
import type {
  DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
  DxfProductTwoPanelSkirtPlacementSemanticsRequestV1,
} from './dxf-product-two-panel-skirt-placement-semantics-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_DOCUMENT_V1,
  PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
} from './pattern-import-dxf-product-semantic-sidecar-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2 =
  'pattern-import-dxf-product-multiseam-placement-sidecar-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_DOCUMENT_V2 =
  'pattern-import-dxf-product-multiseam-placement-sidecar-document/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_SEAL_V2 =
  'pattern-import-dxf-product-multiseam-placement-sidecar-seal/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_OWNER_V2 =
  'pattern-import-dxf-product-multiseam-placement-sidecar-owner/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2 =
  'application/vnd.grbpwr.pattern-dxf-product-multiseam-placement.v2+json' as const;

// Keep these read-only wire tags local so persistence validation does not value-load body/mesh
// producer owners into the Assembly Table bundle.
const ANNULAR_MAPPING_PARAMETERS_REQUEST_SCHEMA_VERSION_V1: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_REQUEST_V1 =
  'dxf-product-two-panel-skirt-annular-mapping-parameters-request/1';
const PLACEMENT_SEMANTICS_REQUEST_SCHEMA_VERSION_V1: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1 =
  'dxf-product-two-panel-skirt-placement-semantics-request/1';

type PlacementSemanticsIntentV1 = Omit<
  DxfProductTwoPanelSkirtPlacementSemanticsRequestV1,
  'composerOwner' | 'expectedComposerCanonicalSha256' | 'origin'
>;

export type PatternImportDxfProductMultiseamPlacementBindingsV2 = Readonly<{
  row: Readonly<{
    techCardId: number;
    cardLockVersion: number;
    scopeKey: string;
    patternLineKey: string;
    patternUrl: string;
    patternVersion: number;
    /** Numeric saved-row revision; intentionally distinct from Phase-E patternVersion. */
    revision: number;
    sizeId: number;
    sizeToken: string;
    dxfSha256: string;
    postSaveReceiptSha256: string;
  }>;
  source: Readonly<{
    sourceFileSha256: string;
    writerExportSha256: string;
    handoffSourceAggregateSha256: string;
    selectedGeometrySha256: string;
    sizeSelectionSha256: string;
    catalogCanonicalSha256: string;
    proposalFingerprint: string;
    phaseEPlanSha256: string;
    mappingCompositionSha256: string;
    handoffCanonicalSha256: string;
    aggregateCanonicalSha256: string;
    phase2ArtifactSha256: string;
  }>;
  topology: Readonly<{
    assemblyTopologySha256: string;
    documentId: string;
    revision: string;
    sourceOperationNumber: number;
    localOperationOrder: 0;
    pieceLineKeys: readonly [string, string];
    pieceIds: readonly [string, string];
    seamKeys: readonly [string, string];
    seamIds: readonly [string, string];
  }>;
}>;

export type PatternImportDxfProductMultiseamPlacementAuthoringV2 = Readonly<{
  authoredOrigin: 'fresh-import' | 'verified-saved-row';
  /** Audit evidence only. It is not a restore or invalidation authority by itself. */
  authoredImportGeneration: number;
  semantics: PlacementSemanticsIntentV1 &
    Readonly<{
      /** Audit evidence only; the detached intent is re-sealed by this V2 document. */
      originalCanonicalSha256: string;
    }>;
  annular: Readonly<{
    schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_MAPPING_PARAMETERS_REQUEST_V1;
    parameters: DxfProductTwoPanelSkirtAnnularMappingParametersV1;
    /** Audit evidence only. */
    originalCanonicalSha256: string;
    /** Audit evidence only. */
    originalMappingParametersSha256: string;
    /** Audit evidence only. */
    originalAcceptancePolicySha256: string;
  }>;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V2 = Object.freeze({
  stableRowSourceTopologyBound: true,
  detachedPlacementSemanticsEncoded: true,
  detachedAnnularParametersEncoded: true,
  originalSealsAreAuditOnly: true,
  authoredImportGenerationIsAuditOnly: true,
  authoredOriginIsAuditOnly: true,
  callerSuppliedRawDxfAccepted: false,
  rawDxfBytesRetained: false,
  typedArraysRetained: false,
  upstreamOwnersRetained: false,
  sidecarBytesAvailableFromOpaqueOwner: true,
  sidecarPersisted: false,
  persistenceIntegrated: false,
  placementRestoreIntegrated: false,
  mappingDomainEvaluated: false,
  acceptancePolicyQualified: false,
  placementAdmitted: false,
  runtimeReady: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V2,
  stableRowSourceTopologyBound: false as const,
  detachedPlacementSemanticsEncoded: false as const,
  detachedAnnularParametersEncoded: false as const,
  originalSealsAreAuditOnly: false as const,
  authoredImportGenerationIsAuditOnly: false as const,
  authoredOriginIsAuditOnly: false as const,
  sidecarBytesAvailableFromOpaqueOwner: false as const,
});

const LEGACY_COMPATIBILITY_CLAIMS = Object.freeze({
  legacyProductSidecarRecognized: true,
  placementAuthoringAvailable: false,
  legacyPlacementInferred: false,
  placementRestoreIntegrated: false,
  persistenceIntegrated: false,
  runtimeReady: false,
  productionReady: false,
} as const);

export type PatternImportDxfProductMultiseamPlacementSidecarRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2;
  bindings: PatternImportDxfProductMultiseamPlacementBindingsV2;
  placementAuthoring: PatternImportDxfProductMultiseamPlacementAuthoringV2;
}>;

export type PatternImportDxfProductMultiseamPlacementSidecarDocumentV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_DOCUMENT_V2;
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2;
  encoding: 'canonical-json-utf8';
  bindings: PatternImportDxfProductMultiseamPlacementBindingsV2;
  placementAuthoring: PatternImportDxfProductMultiseamPlacementAuthoringV2;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V2;
}>;

export type PatternImportDxfProductMultiseamPlacementSidecarSealV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_SEAL_V2;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  canonicalByteLength: number;
  authority: 'unsigned-sidecar-storage-consistency-only';
  persistenceIntegrated: false;
  placementRestoreIntegrated: false;
  productionReady: false;
}>;

declare const ownerBrand: unique symbol;
export type PatternImportDxfProductMultiseamPlacementSidecarOwnerV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_OWNER_V2;
  document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV2;
  seal: PatternImportDxfProductMultiseamPlacementSidecarSealV2;
  readonly [ownerBrand]: never;
}>;

export type PatternImportDxfProductMultiseamPlacementSidecarBlockerCodeV2 =
  | 'invalid-input'
  | 'binding-mismatch'
  | 'bounds-exceeded'
  | 'sha256-unavailable'
  | 'invalid-owner'
  | 'invalid-bytes'
  | 'invalid-utf8'
  | 'invalid-json'
  | 'noncanonical-bytes'
  | 'unsupported-schema';

export type PatternImportDxfProductMultiseamPlacementSidecarBlockerV2 = Readonly<{
  code: PatternImportDxfProductMultiseamPlacementSidecarBlockerCodeV2;
  field: string;
  detail: string;
}>;

export type PatternImportDxfProductMultiseamPlacementSidecarResultV2 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductMultiseamPlacementSidecarOwnerV2;
      document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV2;
      seal: PatternImportDxfProductMultiseamPlacementSidecarSealV2;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V2;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      document: null;
      seal: null;
      blockers: readonly [PatternImportDxfProductMultiseamPlacementSidecarBlockerV2];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export type EncodePatternImportDxfProductMultiseamPlacementSidecarResultV2 =
  | Readonly<{
      ok: true;
      bytes: Uint8Array<ArrayBuffer>;
      canonicalSha256: string;
      canonicalByteLength: number;
    }>
  | Readonly<{ ok: false; code: 'invalid-owner'; bytes: null }>;

export type DecodePatternImportDxfProductMultiseamPlacementSidecarResultV2 =
  | Readonly<{
      ok: true;
      compatibility: 'placement-v2';
      owner: PatternImportDxfProductMultiseamPlacementSidecarOwnerV2;
      document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV2;
      placementAuthoring: PatternImportDxfProductMultiseamPlacementAuthoringV2;
      seal: PatternImportDxfProductMultiseamPlacementSidecarSealV2;
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V2;
    }>
  | Readonly<{
      ok: true;
      compatibility: 'legacy-v1-no-placement';
      owner: null;
      document: null;
      placementAuthoring: null;
      seal: null;
      legacy: Readonly<{
        schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_DOCUMENT_V1;
        mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1;
        canonicalSha256: string;
        canonicalByteLength: number;
      }>;
      claims: typeof LEGACY_COMPATIBILITY_CLAIMS;
    }>
  | Readonly<{
      ok: false;
      compatibility: 'blocked';
      owner: null;
      document: null;
      placementAuthoring: null;
      seal: null;
      blockers: readonly [PatternImportDxfProductMultiseamPlacementSidecarBlockerV2];
      claims: typeof BLOCKED_CLAIMS;
    }>;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const MAX_AUTHORED_STABLE_ID_LENGTH = 1_024;
const MAX_SOURCE_CURVE_ID_LENGTH = 1_024;
const MAX_SAVED_ROW_STABLE_ID_LENGTH = 256;
const MAX_BINDING_TEXT_BYTES = 4_096;
const MAX_SAVED_ROW_URL_LENGTH = 4_096;
const MAX_CANONICAL_BYTES = 4 * 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_NODES = 50_000;
const MAX_PROPERTIES = 200_000;
const MAX_ARRAY_LENGTH = 8_192;
const MAX_NUMBER = 1_000_000_000;
const TWO_PI = Math.PI * 2;
const UNIT_TOLERANCE = 1e-12;
const encoder = new TextEncoder();
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
)?.get;
const typedArraySet = Uint8Array.prototype.set;

class SidecarFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductMultiseamPlacementSidecarBlockerCodeV2,
    readonly field: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

type OwnerState = Readonly<{ bytes: Uint8Array<ArrayBuffer> }>;
const ownerStates = new WeakMap<object, OwnerState>();

function fail(
  code: PatternImportDxfProductMultiseamPlacementSidecarBlockerCodeV2,
  field: string,
  detail: string,
): never {
  throw new SidecarFailure(code, field, detail);
}

function blocked(error: unknown): PatternImportDxfProductMultiseamPlacementSidecarResultV2 {
  const failure =
    error instanceof SidecarFailure
      ? error
      : new SidecarFailure('invalid-input', 'request', 'Request validation failed.');
  return Object.freeze({
    ok: false,
    owner: null,
    document: null,
    seal: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, field: failure.field, detail: failure.message }),
    ]) as readonly [PatternImportDxfProductMultiseamPlacementSidecarBlockerV2],
    claims: BLOCKED_CLAIMS,
  });
}

function blockedDecode(
  error: unknown,
): DecodePatternImportDxfProductMultiseamPlacementSidecarResultV2 {
  const failure =
    error instanceof SidecarFailure
      ? error
      : new SidecarFailure('invalid-bytes', 'bytes', 'Sidecar decoding failed.');
  return Object.freeze({
    ok: false,
    compatibility: 'blocked',
    owner: null,
    document: null,
    placementAuthoring: null,
    seal: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, field: failure.field, detail: failure.message }),
    ]) as readonly [PatternImportDxfProductMultiseamPlacementSidecarBlockerV2],
    claims: BLOCKED_CLAIMS,
  });
}

type ScanState = { nodes: number; properties: number; seen: Set<object> };

function detachPlain(value: unknown, path = 'request', depth = 0, state?: ScanState): unknown {
  const scan = state ?? { nodes: 0, properties: 0, seen: new Set<object>() };
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail('invalid-input', path, 'Numbers must be finite and signed zero is forbidden.');
    return value;
  }
  if (typeof value !== 'object')
    fail('invalid-input', path, 'Only JSON-domain values are accepted.');
  if (depth > MAX_DEPTH) fail('bounds-exceeded', path, 'Maximum nesting depth exceeded.');
  if (scan.seen.has(value)) fail('invalid-input', path, 'Aliases and cycles are forbidden.');
  scan.seen.add(value);
  scan.nodes += 1;
  if (scan.nodes > MAX_NODES) fail('bounds-exceeded', path, 'Maximum node count exceeded.');

  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  let symbols: symbol[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    symbols = Object.getOwnPropertySymbols(descriptors);
  } catch {
    fail('invalid-input', path, 'Object metadata inspection failed.');
  }
  if (symbols.length > 0) fail('invalid-input', path, 'Symbol properties are forbidden.');

  if (Array.isArray(value)) {
    if (prototype !== Array.prototype)
      fail('invalid-input', path, 'Array subclasses are forbidden.');
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !('value' in lengthDescriptor))
      fail('invalid-input', path, 'Invalid array length descriptor.');
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_ARRAY_LENGTH)
      fail('bounds-exceeded', path, 'Array length is out of bounds.');
    const keys = Object.keys(descriptors).filter((key) => key !== 'length');
    if (keys.length !== length)
      fail('invalid-input', path, 'Sparse or extra-key arrays are forbidden.');
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail(
          'invalid-input',
          `${path}[${index}]`,
          'Array entries must be enumerable data properties.',
        );
      output.push(detachPlain(descriptor.value, `${path}[${index}]`, depth + 1, scan));
    }
    scan.properties += length;
    if (scan.properties > MAX_PROPERTIES)
      fail('bounds-exceeded', path, 'Maximum property count exceeded.');
    return output;
  }

  if (prototype !== Object.prototype && prototype !== null)
    fail(
      'invalid-input',
      path,
      'Only plain records are accepted; binary views and owners are forbidden.',
    );
  const output = Object.create(null) as Record<string, unknown>;
  const keys = Object.keys(descriptors);
  scan.properties += keys.length;
  if (scan.properties > MAX_PROPERTIES)
    fail('bounds-exceeded', path, 'Maximum property count exceeded.');
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail(
        'invalid-input',
        `${path}.${key}`,
        'Accessors and non-enumerable properties are forbidden.',
      );
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
    fail('invalid-input', path, 'Expected an object.');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    fail('invalid-input', path, `Expected exact keys: ${expected.join(', ')}.`);
  return value as Record<string, unknown>;
}

function tuple(value: unknown, length: number, path: string): unknown[] {
  if (!Array.isArray(value) || value.length !== length)
    fail('invalid-input', path, `Expected an array with ${length} entries.`);
  return value;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === left.length &&
    rightSet.size === right.length &&
    left.every((value) => rightSet.has(value))
  );
}

function authoredStableId(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_AUTHORED_STABLE_ID_LENGTH ||
    !STABLE_ID.test(value)
  )
    fail('invalid-input', path, 'Expected a D0/D2a stable ID of at most 1024 characters.');
  return value;
}

function bindingStableText(value: unknown, path: string, maximumCharacters?: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_BINDING_TEXT_BYTES ||
    (maximumCharacters !== undefined && value.length > maximumCharacters) ||
    !STABLE_ID.test(value) ||
    encoder.encode(value).byteLength > MAX_BINDING_TEXT_BYTES
  )
    fail('invalid-input', path, 'Expected a bounded storage binding identifier.');
  return value;
}

function bindingUrl(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_SAVED_ROW_URL_LENGTH ||
    encoder.encode(value).byteLength > MAX_BINDING_TEXT_BYTES
  )
    fail('invalid-input', path, 'Expected a bounded saved-row URL.');
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x1f)
      fail('invalid-input', path, 'Saved-row URLs cannot contain control characters.');
  }
  const lower = value.trimStart().toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('javascript:'))
    fail('invalid-input', path, 'Saved-row URL uses a forbidden scheme.');
  return value;
}

function legacyStableText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || !STABLE_ID.test(value))
    fail('invalid-input', path, 'Expected a legacy stable identifier.');
  return value;
}

function legacyReadText(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_BINDING_TEXT_BYTES ||
    value.trim() !== value ||
    encoder.encode(value).byteLength > MAX_BINDING_TEXT_BYTES
  )
    fail('invalid-input', path, 'Expected bounded legacy readback text.');
  return value;
}

function sourceCurveId(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SOURCE_CURVE_ID_LENGTH)
    fail('invalid-input', path, 'Expected a non-empty source curve ID of at most 1024 characters.');
  return value;
}

function literal<T extends string>(value: unknown, expected: T, path: string): T {
  if (value !== expected) fail('invalid-input', path, `Expected ${expected}.`);
  return expected;
}

function sha(value: unknown, path: string): string {
  if (typeof value !== 'string' || !SHA256.test(value))
    fail('invalid-input', path, 'Expected a lowercase SHA-256 digest.');
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    fail('invalid-input', path, 'Expected a bounded safe integer.');
  return value as number;
}

function finite(value: unknown, path: string, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Object.is(value, -0) ||
    value < minimum ||
    value > maximum
  )
    fail('invalid-input', path, 'Expected a bounded finite number without signed zero.');
  return value;
}

function validateSelection(value: unknown, path: string, pieceCurves: Set<string>): void {
  const item = record(value, ['contourId', 'sourceCurveIds', 'boundaryVertexIndices'], path);
  authoredStableId(item.contourId, `${path}.contourId`);
  const curves = item.sourceCurveIds;
  if (!Array.isArray(curves) || curves.length < 1 || curves.length > 64)
    fail('invalid-input', `${path}.sourceCurveIds`, 'Expected 1..64 source curves.');
  curves.forEach((entry, index) => {
    const curveId = sourceCurveId(entry, `${path}.sourceCurveIds[${index}]`);
    if (pieceCurves.has(curveId))
      fail(
        'invalid-input',
        `${path}.sourceCurveIds`,
        'Source curves must be unique across all boundary roles of one piece.',
      );
    pieceCurves.add(curveId);
  });
  const vertices = item.boundaryVertexIndices;
  if (!Array.isArray(vertices) || vertices.length < 2 || vertices.length > 4_096)
    fail('invalid-input', `${path}.boundaryVertexIndices`, 'Expected 2..4096 vertices.');
  const seen = new Set<number>();
  vertices.forEach((entry, index) => {
    const vertex = integer(entry, `${path}.boundaryVertexIndices[${index}]`);
    if (seen.has(vertex))
      fail('invalid-input', `${path}.boundaryVertexIndices`, 'Duplicate vertex.');
    seen.add(vertex);
  });
}

function validateWireGarment(value: unknown, path: string): void {
  const garment = record(
    value,
    [
      'kind',
      'frontPieceId',
      'backPieceId',
      'leftSeamId',
      'rightSeamId',
      'circumferentialOrder',
      'boundaries',
    ],
    `${path}.garment`,
  );
  literal(garment.kind, 'two-panel-skirt', `${path}.garment.kind`);
  ['frontPieceId', 'backPieceId', 'leftSeamId', 'rightSeamId'].forEach((key) =>
    authoredStableId(garment[key], `${path}.garment.${key}`),
  );
  const order = record(
    garment.circumferentialOrder,
    ['direction', 'pieceIds'],
    `${path}.garment.circumferentialOrder`,
  );
  if (
    order.direction !== 'clockwise-seen-from-above' &&
    order.direction !== 'counterclockwise-seen-from-above'
  )
    fail('invalid-input', `${path}.garment.circumferentialOrder.direction`, 'Invalid direction.');
  tuple(order.pieceIds, 2, `${path}.garment.circumferentialOrder.pieceIds`).forEach(
    (entry, index) =>
      authoredStableId(entry, `${path}.garment.circumferentialOrder.pieceIds[${index}]`),
  );
  tuple(garment.boundaries, 2, `${path}.garment.boundaries`).forEach((entry, index) => {
    const boundary = record(
      entry,
      ['pieceId', 'waist', 'hem', 'leftSeam', 'rightSeam'],
      `${path}.garment.boundaries[${index}]`,
    );
    authoredStableId(boundary.pieceId, `${path}.garment.boundaries[${index}].pieceId`);
    const pieceCurves = new Set<string>();
    ['waist', 'hem', 'leftSeam', 'rightSeam'].forEach((role) =>
      validateSelection(
        boundary[role],
        `${path}.garment.boundaries[${index}].${role}`,
        pieceCurves,
      ),
    );
  });
}

function validateWirePolicy(value: unknown, path: string): void {
  const policy = record(
    value,
    ['id', 'revision', 'mapping', 'authoredClearanceM', 'clothThicknessM', 'retention'],
    `${path}.policy`,
  );
  authoredStableId(policy.id, `${path}.policy.id`);
  authoredStableId(policy.revision, `${path}.policy.revision`);
  const mapping = record(policy.mapping, ['kind', 'id', 'revision'], `${path}.policy.mapping`);
  literal(mapping.kind, 'authored-annular-sector-conical', `${path}.policy.mapping.kind`);
  authoredStableId(mapping.id, `${path}.policy.mapping.id`);
  authoredStableId(mapping.revision, `${path}.policy.mapping.revision`);
  finite(policy.authoredClearanceM, `${path}.policy.authoredClearanceM`, 0, 0.1);
  const thickness = finite(policy.clothThicknessM, `${path}.policy.clothThicknessM`, 0, 0.02);
  if (thickness <= 0)
    fail('invalid-input', `${path}.policy.clothThicknessM`, 'Cloth thickness must be positive.');
  const retention = record(
    policy.retention,
    ['id', 'revision', 'kind'],
    `${path}.policy.retention`,
  );
  authoredStableId(retention.id, `${path}.policy.retention.id`);
  authoredStableId(retention.revision, `${path}.policy.retention.revision`);
  literal(retention.kind, 'waist-boundary-support', `${path}.policy.retention.kind`);
}

function validateSemantics(
  value: unknown,
  path: string,
): PlacementSemanticsIntentV1 & {
  originalCanonicalSha256: string;
} {
  const semantics = record(
    value,
    ['schemaVersion', 'garment', 'body', 'policy', 'originalCanonicalSha256'],
    path,
  );
  literal(
    semantics.schemaVersion,
    PLACEMENT_SEMANTICS_REQUEST_SCHEMA_VERSION_V1,
    `${path}.schemaVersion`,
  );
  sha(semantics.originalCanonicalSha256, `${path}.originalCanonicalSha256`);

  validateWireGarment(semantics.garment, path);

  const body = record(
    semantics.body,
    [
      'providerId',
      'providerRevision',
      'bodyId',
      'bodyRevision',
      'poseKind',
      'poseRevision',
      'collisionLodId',
      'landmarks',
    ],
    `${path}.body`,
  );
  [
    'providerId',
    'providerRevision',
    'bodyId',
    'bodyRevision',
    'poseRevision',
    'collisionLodId',
  ].forEach((key) => authoredStableId(body[key], `${path}.body.${key}`));
  literal(body.poseKind, 'A', `${path}.body.poseKind`);
  const landmarks = record(
    body.landmarks,
    ['revision', 'waistCenterId', 'hipLeftId', 'hipRightId'],
    `${path}.body.landmarks`,
  );
  Object.keys(landmarks).forEach((key) =>
    authoredStableId(landmarks[key], `${path}.body.landmarks.${key}`),
  );
  if (new Set([landmarks.waistCenterId, landmarks.hipLeftId, landmarks.hipRightId]).size !== 3)
    fail('invalid-input', `${path}.body.landmarks`, 'Waist and hip landmark IDs must be distinct.');

  validateWirePolicy(semantics.policy, path);
  return semantics as PlacementSemanticsIntentV1 & { originalCanonicalSha256: string };
}

function validateParameters(
  value: unknown,
  path: string,
): DxfProductTwoPanelSkirtAnnularMappingParametersV1 {
  const parameters = record(
    value,
    ['id', 'revision', 'units', 'waistReferenceColliderId', 'seamAnchor', 'pieces', 'acceptance'],
    path,
  );
  authoredStableId(parameters.id, `${path}.id`);
  authoredStableId(parameters.revision, `${path}.revision`);
  authoredStableId(parameters.waistReferenceColliderId, `${path}.waistReferenceColliderId`);
  const units = record(parameters.units, ['planar', 'body', 'angle'], `${path}.units`);
  literal(units.planar, 'mm', `${path}.units.planar`);
  literal(units.body, 'm', `${path}.units.body`);
  literal(units.angle, 'rad', `${path}.units.angle`);
  const anchor = record(parameters.seamAnchor, ['seamId', 'bodyAngleRad'], `${path}.seamAnchor`);
  authoredStableId(anchor.seamId, `${path}.seamAnchor.seamId`);
  const bodyAngle = finite(anchor.bodyAngleRad, `${path}.seamAnchor.bodyAngleRad`, 0, TWO_PI);
  if (bodyAngle >= TWO_PI)
    fail('invalid-input', `${path}.seamAnchor.bodyAngleRad`, 'Body angle must be below 2π.');
  let totalSpan = 0;
  tuple(parameters.pieces, 2, `${path}.pieces`).forEach((entry, index) => {
    const piecePath = `${path}.pieces[${index}]`;
    const piece = record(
      entry,
      [
        'pieceId',
        'planarApexMm',
        'planarStartRayUnit2',
        'planarAngularDirection',
        'planarStartSeamId',
        'waistSlantRadiusMm',
        'hemSlantRadiusMm',
        'sectorSpanRad',
      ],
      piecePath,
    );
    authoredStableId(piece.pieceId, `${piecePath}.pieceId`);
    authoredStableId(piece.planarStartSeamId, `${piecePath}.planarStartSeamId`);
    tuple(piece.planarApexMm, 2, `${piecePath}.planarApexMm`).forEach((coordinate, axis) =>
      finite(coordinate, `${piecePath}.planarApexMm[${axis}]`, -1_000_000, 1_000_000),
    );
    const ray = tuple(piece.planarStartRayUnit2, 2, `${piecePath}.planarStartRayUnit2`).map(
      (coordinate, axis) => finite(coordinate, `${piecePath}.planarStartRayUnit2[${axis}]`, -1, 1),
    );
    if (Math.abs(Math.hypot(ray[0], ray[1]) - 1) > UNIT_TOLERANCE)
      fail('invalid-input', `${piecePath}.planarStartRayUnit2`, 'Expected a unit vector.');
    if (piece.planarAngularDirection !== 1 && piece.planarAngularDirection !== -1)
      fail('invalid-input', `${piecePath}.planarAngularDirection`, 'Expected 1 or -1.');
    const waist = finite(piece.waistSlantRadiusMm, `${piecePath}.waistSlantRadiusMm`, 0, 1_000_000);
    const hem = finite(piece.hemSlantRadiusMm, `${piecePath}.hemSlantRadiusMm`, 0, 1_000_000);
    if (waist <= 0)
      fail('invalid-input', `${piecePath}.waistSlantRadiusMm`, 'Waist radius must be positive.');
    if (hem <= waist)
      fail('invalid-input', `${piecePath}.hemSlantRadiusMm`, 'Hem radius must exceed waist.');
    const span = finite(piece.sectorSpanRad, `${piecePath}.sectorSpanRad`, 0, TWO_PI);
    if (span <= 0 || span >= TWO_PI)
      fail('invalid-input', `${piecePath}.sectorSpanRad`, 'Sector span must be within (0, 2π).');
    totalSpan += span;
  });
  if (totalSpan >= TWO_PI)
    fail('invalid-input', `${path}.pieces`, 'Total sector span must be below 2π.');
  const acceptance = record(
    parameters.acceptance,
    [
      'id',
      'revision',
      'parameterResidualMm',
      'parameterResidualRad',
      'conicalIdentityResidualM',
      'maxAbsEdgeStretchDelta',
      'maxAbsAreaScaleDelta',
      'minNormalizedOrientationDot',
      'maxAbsWarpGreenStrain',
      'maxAbsWeftGreenStrain',
      'maxAbsShear',
      'selfIntersectionPolicyRevision',
    ],
    `${path}.acceptance`,
  );
  ['id', 'revision', 'selfIntersectionPolicyRevision'].forEach((key) =>
    authoredStableId(acceptance[key], `${path}.acceptance.${key}`),
  );
  [
    'parameterResidualMm',
    'parameterResidualRad',
    'conicalIdentityResidualM',
    'maxAbsEdgeStretchDelta',
    'maxAbsAreaScaleDelta',
    'maxAbsWarpGreenStrain',
    'maxAbsWeftGreenStrain',
    'maxAbsShear',
  ].forEach((key) => finite(acceptance[key], `${path}.acceptance.${key}`, 0, 1_000_000));
  finite(
    acceptance.minNormalizedOrientationDot,
    `${path}.acceptance.minNormalizedOrientationDot`,
    -1,
    1,
  );
  return parameters as DxfProductTwoPanelSkirtAnnularMappingParametersV1;
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
  integer(row.techCardId, `${path}.row.techCardId`, 1);
  integer(row.cardLockVersion, `${path}.row.cardLockVersion`, 0);
  integer(row.patternVersion, `${path}.row.patternVersion`, 1);
  integer(row.revision, `${path}.row.revision`, 0);
  integer(row.sizeId, `${path}.row.sizeId`, 0);
  bindingStableText(row.scopeKey, `${path}.row.scopeKey`, MAX_SAVED_ROW_STABLE_ID_LENGTH);
  bindingStableText(
    row.patternLineKey,
    `${path}.row.patternLineKey`,
    MAX_SAVED_ROW_STABLE_ID_LENGTH,
  );
  bindingStableText(row.sizeToken, `${path}.row.sizeToken`);
  bindingUrl(row.patternUrl, `${path}.row.patternUrl`);
  sha(row.dxfSha256, `${path}.row.dxfSha256`);
  sha(row.postSaveReceiptSha256, `${path}.row.postSaveReceiptSha256`);

  const source = record(
    bindings.source,
    [
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
    ],
    `${path}.source`,
  );
  Object.keys(source)
    .filter((key) => key !== 'proposalFingerprint')
    .forEach((key) => sha(source[key], `${path}.source.${key}`));
  if (
    typeof source.proposalFingerprint !== 'string' ||
    !/^pidpemsv2-fnv1a64:[0-9a-f]{16}$/.test(source.proposalFingerprint)
  )
    fail(
      'invalid-input',
      `${path}.source.proposalFingerprint`,
      'Expected the exact Phase-E multiseam proposal fingerprint.',
    );

  const topology = record(
    bindings.topology,
    [
      'assemblyTopologySha256',
      'documentId',
      'revision',
      'sourceOperationNumber',
      'localOperationOrder',
      'pieceLineKeys',
      'pieceIds',
      'seamKeys',
      'seamIds',
    ],
    `${path}.topology`,
  );
  sha(topology.assemblyTopologySha256, `${path}.topology.assemblyTopologySha256`);
  bindingStableText(topology.documentId, `${path}.topology.documentId`);
  bindingStableText(topology.revision, `${path}.topology.revision`);
  integer(topology.sourceOperationNumber, `${path}.topology.sourceOperationNumber`, 1);
  if (topology.localOperationOrder !== 0)
    fail(
      'invalid-input',
      `${path}.topology.localOperationOrder`,
      'Expected local operation order 0.',
    );
  ['pieceLineKeys', 'pieceIds', 'seamKeys', 'seamIds'].forEach((key) =>
    tuple(topology[key], 2, `${path}.topology.${key}`).forEach((entry, index) =>
      bindingStableText(entry, `${path}.topology.${key}[${index}]`),
    ),
  );
  ['pieceLineKeys', 'pieceIds', 'seamKeys', 'seamIds'].forEach((key) => {
    if (new Set(topology[key] as unknown[]).size !== 2)
      fail('binding-mismatch', `${path}.topology.${key}`, 'Tuple identities must be distinct.');
  });

  if (row.dxfSha256 !== source.writerExportSha256)
    fail(
      'binding-mismatch',
      `${path}.source.writerExportSha256`,
      'Writer export SHA must equal row DXF SHA.',
    );
  return bindings as PatternImportDxfProductMultiseamPlacementBindingsV2;
}

function validateAuthoring(
  value: unknown,
  bindings: PatternImportDxfProductMultiseamPlacementBindingsV2,
  path: string,
  bodyFree = false,
):
  | PatternImportDxfProductMultiseamPlacementAuthoringV2
  | PatternImportDxfProductBodyFreePlacementAuthoringWireV1 {
  const authoring = record(
    value,
    ['authoredOrigin', 'authoredImportGeneration', 'semantics', 'annular'],
    path,
  );
  if (
    authoring.authoredOrigin !== 'fresh-import' &&
    authoring.authoredOrigin !== 'verified-saved-row'
  )
    fail('invalid-input', `${path}.authoredOrigin`, 'Unsupported authored origin.');
  integer(authoring.authoredImportGeneration, `${path}.authoredImportGeneration`, 1);
  const semantics = bodyFree
    ? validateBodyFreeWireSemantics(authoring.semantics, `${path}.semantics`)
    : validateSemantics(authoring.semantics, `${path}.semantics`);
  const annular = record(
    authoring.annular,
    [
      'schemaVersion',
      'parameters',
      'originalCanonicalSha256',
      'originalMappingParametersSha256',
      'originalAcceptancePolicySha256',
    ],
    `${path}.annular`,
  );
  literal(
    annular.schemaVersion,
    ANNULAR_MAPPING_PARAMETERS_REQUEST_SCHEMA_VERSION_V1,
    `${path}.annular.schemaVersion`,
  );
  sha(annular.originalCanonicalSha256, `${path}.annular.originalCanonicalSha256`);
  sha(annular.originalMappingParametersSha256, `${path}.annular.originalMappingParametersSha256`);
  sha(annular.originalAcceptancePolicySha256, `${path}.annular.originalAcceptancePolicySha256`);
  const parameters = validateParameters(annular.parameters, `${path}.annular.parameters`);

  const expectedPieces = bindings.topology.pieceIds;
  const expectedSeams = bindings.topology.seamIds;
  const garment = semantics.garment;
  if (
    !sameStringSet([garment.frontPieceId, garment.backPieceId], expectedPieces) ||
    !sameStringSet(garment.circumferentialOrder.pieceIds, expectedPieces)
  )
    fail('binding-mismatch', `${path}.semantics.garment`, 'D0 piece roles must cover topology.');
  if (!sameStringSet([garment.leftSeamId, garment.rightSeamId], expectedSeams))
    fail('binding-mismatch', `${path}.semantics.garment`, 'D0 seam roles must cover topology.');
  if (
    !sameStringSet(
      garment.boundaries.map(({ pieceId }) => pieceId),
      expectedPieces,
    )
  )
    fail(
      'binding-mismatch',
      `${path}.semantics.garment.boundaries`,
      'Boundary piece records must cover topology.',
    );
  if (
    parameters.id !== semantics.policy.mapping.id ||
    parameters.revision !== semantics.policy.mapping.revision
  )
    fail(
      'binding-mismatch',
      `${path}.annular.parameters`,
      'D2 mapping id/revision must equal D0 policy.',
    );
  if (
    parameters.pieces[0].pieceId !== garment.circumferentialOrder.pieceIds[0] ||
    parameters.pieces[1].pieceId !== garment.circumferentialOrder.pieceIds[1]
  )
    fail(
      'binding-mismatch',
      `${path}.annular.parameters.pieces`,
      'D2 piece order must equal the exact D0 circumferential order.',
    );
  const seams = new Set(expectedSeams);
  if (seams.size !== 2)
    fail('binding-mismatch', `${path}.bindings.topology`, 'Topology seam ids must be distinct.');
  if (
    !seams.has(parameters.seamAnchor.seamId) ||
    parameters.pieces.some((piece) => piece.planarStartSeamId !== parameters.seamAnchor.seamId)
  )
    fail(
      'binding-mismatch',
      `${path}.annular.parameters`,
      'D2 piece start seams must equal the topology-bound seam anchor.',
    );
  return authoring as
    | PatternImportDxfProductMultiseamPlacementAuthoringV2
    | PatternImportDxfProductBodyFreePlacementAuthoringWireV1;
}

function validateRequest(
  value: unknown,
): PatternImportDxfProductMultiseamPlacementSidecarRequestV2 {
  const request = record(value, ['schemaVersion', 'bindings', 'placementAuthoring'], 'request');
  literal(
    request.schemaVersion,
    PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2,
    'request.schemaVersion',
  );
  const bindings = validateBindings(request.bindings, 'request.bindings');
  validateAuthoring(request.placementAuthoring, bindings, 'request.placementAuthoring');
  return request as PatternImportDxfProductMultiseamPlacementSidecarRequestV2;
}

function validateDocument(
  value: unknown,
): PatternImportDxfProductMultiseamPlacementSidecarDocumentV2 {
  const document = record(
    value,
    ['schemaVersion', 'mediaType', 'encoding', 'bindings', 'placementAuthoring', 'claims'],
    'document',
  );
  literal(
    document.schemaVersion,
    PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_DOCUMENT_V2,
    'document.schemaVersion',
  );
  literal(
    document.mediaType,
    PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2,
    'document.mediaType',
  );
  literal(document.encoding, 'canonical-json-utf8', 'document.encoding');
  const bindings = validateBindings(document.bindings, 'document.bindings');
  validateAuthoring(document.placementAuthoring, bindings, 'document.placementAuthoring');
  const claims = record(
    document.claims,
    Object.keys(PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V2),
    'document.claims',
  );
  for (const [key, expected] of Object.entries(
    PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V2,
  )) {
    if (claims[key] !== expected)
      fail('invalid-input', `document.claims.${key}`, 'Claim mismatch.');
  }
  return document as PatternImportDxfProductMultiseamPlacementSidecarDocumentV2;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new TypeError('non-canonical number');
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
  let digest: ArrayBuffer;
  try {
    digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  } catch {
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 digest failed.');
  }
  if (digest.byteLength !== 32)
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 digest length mismatch.');
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function makeSeal(
  canonicalSha256: string,
  canonicalByteLength: number,
): PatternImportDxfProductMultiseamPlacementSidecarSealV2 {
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_SEAL_V2,
    algorithm: 'SHA-256' as const,
    canonicalSha256,
    canonicalByteLength,
    authority: 'unsigned-sidecar-storage-consistency-only' as const,
    persistenceIntegrated: false as const,
    placementRestoreIntegrated: false as const,
    productionReady: false as const,
  });
}

function makeOwner(
  document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV2,
  seal: PatternImportDxfProductMultiseamPlacementSidecarSealV2,
  bytes: Uint8Array<ArrayBuffer>,
): PatternImportDxfProductMultiseamPlacementSidecarOwnerV2 {
  const owner = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_OWNER_V2,
    document,
    seal,
  }) as PatternImportDxfProductMultiseamPlacementSidecarOwnerV2;
  ownerStates.set(owner, { bytes: bytes.slice() });
  return owner;
}

export async function buildPatternImportDxfProductMultiseamPlacementSidecarV2(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductMultiseamPlacementSidecarResultV2> {
  try {
    const detached = detachPlain(input);
    const request = validateRequest(detached);
    const document = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_DOCUMENT_V2,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2,
      encoding: 'canonical-json-utf8' as const,
      bindings: request.bindings,
      placementAuthoring: request.placementAuthoring,
      claims: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V2,
    });
    const bytes = encoder.encode(canonical(document));
    if (bytes.byteLength > MAX_CANONICAL_BYTES)
      fail('bounds-exceeded', 'document', 'Canonical sidecar exceeds the byte bound.');
    const digest = await sha256(bytes.slice(), crypto);
    const seal = makeSeal(digest, bytes.byteLength);
    const owner = makeOwner(document, seal, bytes);
    return Object.freeze({
      ok: true,
      owner,
      document,
      seal,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V2,
    });
  } catch (error) {
    return blocked(error);
  }
}

export function encodePatternImportDxfProductMultiseamPlacementSidecarV2(
  candidate: unknown,
): EncodePatternImportDxfProductMultiseamPlacementSidecarResultV2 {
  if (!candidate || typeof candidate !== 'object')
    return Object.freeze({ ok: false, code: 'invalid-owner', bytes: null });
  const state = ownerStates.get(candidate);
  if (!state) return Object.freeze({ ok: false, code: 'invalid-owner', bytes: null });
  const owner = candidate as PatternImportDxfProductMultiseamPlacementSidecarOwnerV2;
  return Object.freeze({
    ok: true,
    bytes: state.bytes.slice(),
    canonicalSha256: owner.seal.canonicalSha256,
    canonicalByteLength: state.bytes.byteLength,
  });
}

function validateLegacySample(value: unknown, path: string): void {
  const sample = record(
    value,
    [
      'ordinal',
      'vertexId',
      'sourceCurveId',
      'parameterSpace',
      'sourceCurveT',
      'contourNormalizedArc',
      'normalizedProgress',
    ],
    path,
  );
  integer(sample.ordinal, `${path}.ordinal`);
  legacyStableText(sample.vertexId, `${path}.vertexId`);
  legacyStableText(sample.sourceCurveId, `${path}.sourceCurveId`);
  if (
    sample.parameterSpace !== 'unit' &&
    sample.parameterSpace !== 'angle-radians' &&
    sample.parameterSpace !== 'knot-domain'
  )
    fail('invalid-input', `${path}.parameterSpace`, 'Invalid legacy parameter space.');
  finite(sample.sourceCurveT, `${path}.sourceCurveT`, 0, 1);
  finite(sample.contourNormalizedArc, `${path}.contourNormalizedArc`, 0, 1);
  finite(sample.normalizedProgress, `${path}.normalizedProgress`, 0, 1);
}

function validateLegacyMapping(value: unknown, path: string): void {
  const artifact = record(
    value,
    ['schemaVersion', 'baseWitnessVersion', 'sourceBinding', 'scope', 'seam', 'compatibility'],
    path,
  );
  literal(
    artifact.schemaVersion,
    'pattern-import-dxf-two-sided-seam-mapping/2',
    `${path}.schemaVersion`,
  );
  literal(
    artifact.baseWitnessVersion,
    'pattern-import-dxf-two-sided-seam-mapping/1',
    `${path}.baseWitnessVersion`,
  );
  const source = record(
    artifact.sourceBinding,
    [
      'sourceFileId',
      'documentId',
      'revision',
      'baseFinalCoordinateSha256',
      'sourcePathCoordinateSha256',
      'handoffCanonicalSha256',
    ],
    `${path}.sourceBinding`,
  );
  ['sourceFileId', 'documentId', 'revision'].forEach((key) =>
    legacyStableText(source[key], `${path}.sourceBinding.${key}`),
  );
  ['baseFinalCoordinateSha256', 'sourcePathCoordinateSha256', 'handoffCanonicalSha256'].forEach(
    (key) => sha(source[key], `${path}.sourceBinding.${key}`),
  );
  const scope = record(artifact.scope, ['scopeId', 'pieceIds'], `${path}.scope`);
  legacyStableText(scope.scopeId, `${path}.scope.scopeId`);
  if (!Array.isArray(scope.pieceIds) || scope.pieceIds.length < 1 || scope.pieceIds.length > 256)
    fail('invalid-input', `${path}.scope.pieceIds`, 'Invalid legacy piece list.');
  scope.pieceIds.forEach((piece, index) =>
    legacyStableText(piece, `${path}.scope.pieceIds[${index}]`),
  );
  const seam = record(
    artifact.seam,
    ['id', 'operationId', 'mapping', 'lengthRatio', 'sides'],
    `${path}.seam`,
  );
  legacyStableText(seam.id, `${path}.seam.id`);
  legacyStableText(seam.operationId, `${path}.seam.operationId`);
  literal(seam.mapping, 'equal', `${path}.seam.mapping`);
  if (seam.lengthRatio !== 1)
    fail('invalid-input', `${path}.seam.lengthRatio`, 'Expected ratio 1.');
  tuple(seam.sides, 2, `${path}.seam.sides`).forEach((entry, index) => {
    const sidePath = `${path}.seam.sides[${index}]`;
    const side = record(
      entry,
      [
        'sideIndex',
        'pieceId',
        'contourId',
        'sourcePathId',
        'authoredAnchors',
        'direction',
        'reversed',
        'contourTraversal',
        'orderedSamples',
        'lengthMm',
        'endpointResidualMm',
      ],
      sidePath,
    );
    if (side.sideIndex !== index)
      fail('invalid-input', `${sidePath}.sideIndex`, 'Legacy side index mismatch.');
    legacyStableText(side.pieceId, `${sidePath}.pieceId`);
    legacyStableText(side.contourId, `${sidePath}.contourId`);
    integer(side.sourcePathId, `${sidePath}.sourcePathId`);
    tuple(side.authoredAnchors, 2, `${sidePath}.authoredAnchors`).forEach((anchor, anchorIndex) =>
      legacyStableText(anchor, `${sidePath}.authoredAnchors[${anchorIndex}]`),
    );
    if (side.direction !== 'forward' && side.direction !== 'reverse')
      fail('invalid-input', `${sidePath}.direction`, 'Invalid legacy direction.');
    if (typeof side.reversed !== 'boolean')
      fail('invalid-input', `${sidePath}.reversed`, 'Expected boolean.');
    literal(side.contourTraversal, 'increasing-index', `${sidePath}.contourTraversal`);
    if (!Array.isArray(side.orderedSamples) || side.orderedSamples.length < 2)
      fail('invalid-input', `${sidePath}.orderedSamples`, 'Legacy side requires samples.');
    side.orderedSamples.forEach((sample, sampleIndex) =>
      validateLegacySample(sample, `${sidePath}.orderedSamples[${sampleIndex}]`),
    );
    finite(side.lengthMm, `${sidePath}.lengthMm`, 0.000001, MAX_NUMBER);
    finite(side.endpointResidualMm, `${sidePath}.endpointResidualMm`, 0, MAX_NUMBER);
  });
  const compatibility = record(
    artifact.compatibility,
    [
      'endpointToleranceMm',
      'maximumEndpointResidualMm',
      'fullLengthToleranceMm',
      'fullLengthToleranceRelative',
      'effectiveFullLengthToleranceMm',
      'fullLengthResidualMm',
      'fullLengthResidualRelative',
      'endpointsCompatible',
      'fullLengthsCompatible',
    ],
    `${path}.compatibility`,
  );
  Object.keys(compatibility)
    .filter((key) => key !== 'endpointsCompatible' && key !== 'fullLengthsCompatible')
    .forEach((key) => finite(compatibility[key], `${path}.compatibility.${key}`, 0, MAX_NUMBER));
  if (compatibility.endpointsCompatible !== true || compatibility.fullLengthsCompatible !== true)
    fail('invalid-input', `${path}.compatibility`, 'Legacy compatibility must be admitted.');
}

function validateLegacyDocument(value: unknown): void {
  const document = record(
    value,
    ['schemaVersion', 'mediaType', 'encoding', 'product', 'mapping', 'persistence'],
    'legacy',
  );
  literal(
    document.schemaVersion,
    PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_DOCUMENT_V1,
    'legacy.schemaVersion',
  );
  literal(
    document.mediaType,
    PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
    'legacy.mediaType',
  );
  literal(document.encoding, 'canonical-json-utf8', 'legacy.encoding');
  const product = record(
    document.product,
    [
      'writerReceiptVersion',
      'writerId',
      'writerDialect',
      'format',
      'scopeKey',
      'exportSha256',
      'byteLength',
      'phaseEPlanSha256',
      'sizeSelectionSha256',
      'mappingCompositionSealSha256',
    ],
    'legacy.product',
  );
  literal(
    product.writerReceiptVersion,
    'pattern-import-dxf-product-writer-replay-receipt/1',
    'legacy.product.writerReceiptVersion',
  );
  literal(product.writerId, 'grbpwr.pattern-import.writeDxfDetailed', 'legacy.product.writerId');
  literal(product.writerDialect, 'r12', 'legacy.product.writerDialect');
  literal(product.format, 'AAMA-DXF-AC1009', 'legacy.product.format');
  legacyStableText(product.scopeKey, 'legacy.product.scopeKey');
  sha(product.exportSha256, 'legacy.product.exportSha256');
  const byteLength = integer(product.byteLength, 'legacy.product.byteLength', 1);
  if (byteLength > 40 * 1024 * 1024)
    fail(
      'bounds-exceeded',
      'legacy.product.byteLength',
      'Legacy product byte length is too large.',
    );
  ['phaseEPlanSha256', 'sizeSelectionSha256', 'mappingCompositionSealSha256'].forEach((key) =>
    sha(product[key], `legacy.product.${key}`),
  );
  const mapping = record(document.mapping, ['version', 'sealSha256', 'artifact'], 'legacy.mapping');
  literal(mapping.version, 'pattern-import-dxf-two-sided-seam-mapping/2', 'legacy.mapping.version');
  sha(mapping.sealSha256, 'legacy.mapping.sealSha256');
  validateLegacyMapping(mapping.artifact, 'legacy.mapping.artifact');

  const persistence = record(
    document.persistence,
    [
      'receiptVersion',
      'receiptSealVersion',
      'receiptSealSha256',
      'card',
      'pattern',
      'pieceLineKeys',
      'aliases',
    ],
    'legacy.persistence',
  );
  literal(
    persistence.receiptVersion,
    'pattern-import-dxf-product-post-save-readback-receipt/1',
    'legacy.persistence.receiptVersion',
  );
  literal(
    persistence.receiptSealVersion,
    'pattern-import-dxf-product-post-save-readback-seal/1',
    'legacy.persistence.receiptSealVersion',
  );
  sha(persistence.receiptSealSha256, 'legacy.persistence.receiptSealSha256');
  const card = record(
    persistence.card,
    ['techCardId', 'previousLockVersion', 'observedLockVersion'],
    'legacy.persistence.card',
  );
  integer(card.techCardId, 'legacy.persistence.card.techCardId', 1);
  integer(card.previousLockVersion, 'legacy.persistence.card.previousLockVersion');
  integer(card.observedLockVersion, 'legacy.persistence.card.observedLockVersion');
  const pattern = record(
    persistence.pattern,
    ['lineKey', 'url', 'scopeKey', 'sizeId', 'version', 'sha256'],
    'legacy.persistence.pattern',
  );
  legacyStableText(pattern.lineKey, 'legacy.persistence.pattern.lineKey');
  legacyReadText(pattern.url, 'legacy.persistence.pattern.url');
  legacyStableText(pattern.scopeKey, 'legacy.persistence.pattern.scopeKey');
  integer(pattern.sizeId, 'legacy.persistence.pattern.sizeId', 0);
  integer(pattern.version, 'legacy.persistence.pattern.version', 1);
  sha(pattern.sha256, 'legacy.persistence.pattern.sha256');
  if (!Array.isArray(persistence.pieceLineKeys) || persistence.pieceLineKeys.length < 1)
    fail('invalid-input', 'legacy.persistence.pieceLineKeys', 'Legacy piece lines required.');
  persistence.pieceLineKeys.forEach((key, index) =>
    legacyStableText(key, `legacy.persistence.pieceLineKeys[${index}]`),
  );
  if (!Array.isArray(persistence.aliases))
    fail('invalid-input', 'legacy.persistence.aliases', 'Expected aliases array.');
  persistence.aliases.forEach((entry, index) => {
    const alias = record(
      entry,
      ['scopeKey', 'blockName', 'pieceLineKey'],
      `legacy.persistence.aliases[${index}]`,
    );
    legacyStableText(alias.scopeKey, `legacy.persistence.aliases[${index}].scopeKey`);
    legacyReadText(alias.blockName, `legacy.persistence.aliases[${index}].blockName`);
    legacyStableText(alias.pieceLineKey, `legacy.persistence.aliases[${index}].pieceLineKey`);
  });
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1)
    difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

export async function decodePatternImportDxfProductMultiseamPlacementSidecarV2(
  input: Uint8Array,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<DecodePatternImportDxfProductMultiseamPlacementSidecarResultV2> {
  try {
    if (Object.getPrototypeOf(input) !== Uint8Array.prototype || !typedArrayByteLengthGetter)
      fail('invalid-bytes', 'bytes', 'Expected an exact Uint8Array.');
    let byteLength: number;
    try {
      byteLength = Reflect.apply(typedArrayByteLengthGetter, input, []) as number;
    } catch {
      fail('invalid-bytes', 'bytes', 'Could not inspect input bytes.');
    }
    if (byteLength < 1 || byteLength > MAX_CANONICAL_BYTES)
      fail('bounds-exceeded', 'bytes', 'Sidecar byte length is out of bounds.');
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = new Uint8Array(byteLength);
      Reflect.apply(typedArraySet, bytes, [input]);
    } catch {
      fail('invalid-bytes', 'bytes', 'Could not copy input bytes.');
    }
    let json: string;
    try {
      json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      fail('invalid-utf8', 'bytes', 'Sidecar is not valid UTF-8.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json) as unknown;
    } catch {
      fail('invalid-json', 'bytes', 'Sidecar is not valid JSON.');
    }
    const detached = detachPlain(parsed, 'document');
    const root = record(detached, Object.keys(detached as Record<string, unknown>), 'document');
    const schemaVersion = root.schemaVersion;
    if (
      schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_DOCUMENT_V2 &&
      schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_DOCUMENT_V1
    )
      fail('unsupported-schema', 'document.schemaVersion', 'Unsupported sidecar schema.');
    if (schemaVersion === PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_DOCUMENT_V2)
      validateDocument(detached);
    else validateLegacyDocument(detached);

    const canonicalBytes = encoder.encode(canonical(detached));
    if (!sameBytes(bytes, canonicalBytes))
      fail('noncanonical-bytes', 'bytes', 'Bytes are not the exact canonical encoding.');
    const digest = await sha256(canonicalBytes.slice(), crypto);

    if (schemaVersion === PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_DOCUMENT_V1) {
      return Object.freeze({
        ok: true,
        compatibility: 'legacy-v1-no-placement',
        owner: null,
        document: null,
        placementAuthoring: null,
        seal: null,
        legacy: Object.freeze({
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_DOCUMENT_V1,
          mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
          canonicalSha256: digest,
          canonicalByteLength: canonicalBytes.byteLength,
        }),
        claims: LEGACY_COMPATIBILITY_CLAIMS,
      });
    }

    const document = deepFreeze(
      detached,
    ) as PatternImportDxfProductMultiseamPlacementSidecarDocumentV2;
    const seal = makeSeal(digest, canonicalBytes.byteLength);
    const owner = makeOwner(document, seal, canonicalBytes);
    return Object.freeze({
      ok: true,
      compatibility: 'placement-v2',
      owner,
      document,
      placementAuthoring: document.placementAuthoring,
      seal,
      claims: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V2,
    });
  } catch (error) {
    return blockedDecode(error);
  }
}

/** Shared storage-only validation. A body-free wire intent is never promoted to a D0 owner. */
export type PatternImportDxfProductBodyFreePlacementAuthoringWireV1 = Omit<
  PatternImportDxfProductMultiseamPlacementAuthoringV2,
  'semantics'
> &
  Readonly<{
    semantics: Omit<
      PatternImportDxfProductMultiseamPlacementAuthoringV2['semantics'],
      'body' | 'schemaVersion'
    > &
      Readonly<{ schemaVersion: 'dxf-product-two-panel-skirt-garment-semantics-request/1' }>;
  }>;
function validateBodyFreeWireSemantics(
  value: unknown,
  path: string,
): PatternImportDxfProductBodyFreePlacementAuthoringWireV1['semantics'] {
  const semantics = record(
    value,
    ['schemaVersion', 'garment', 'policy', 'originalCanonicalSha256'],
    path,
  );
  literal(
    semantics.schemaVersion,
    'dxf-product-two-panel-skirt-garment-semantics-request/1',
    `${path}.schemaVersion`,
  );
  sha(semantics.originalCanonicalSha256, `${path}.originalCanonicalSha256`);
  validateWireGarment(semantics.garment, path);
  validateWirePolicy(semantics.policy, path);
  return semantics as PatternImportDxfProductBodyFreePlacementAuthoringWireV1['semantics'];
}
export function capturePatternImportDxfProductBodyFreePlacementWireV1(value: unknown): Readonly<{
  bindings: PatternImportDxfProductMultiseamPlacementBindingsV2;
  placementAuthoring: PatternImportDxfProductBodyFreePlacementAuthoringWireV1;
}> {
  const candidate = record(
    detachPlain(value),
    ['bindings', 'placementAuthoring'],
    'bodyFreePlacement',
  );
  const bindings = validateBindings(candidate.bindings, 'bindings');
  validateAuthoring(candidate.placementAuthoring, bindings, 'placementAuthoring', true);
  return deepFreeze(
    candidate as {
      bindings: PatternImportDxfProductMultiseamPlacementBindingsV2;
      placementAuthoring: PatternImportDxfProductBodyFreePlacementAuthoringWireV1;
    },
  );
}

/** Internal pure codec primitives shared by the next wire version, not authority validators. */
export const patternImportDxfProductPlacementWireCodecV1 = Object.freeze({
  detachPlain,
  canonical,
  deepFreeze,
  sha256,
});
