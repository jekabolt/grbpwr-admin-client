import type { DxfProductSavedRowIdentityV1 } from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_CHOICES_V2,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PLAN_SEAL_V2,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PROPOSAL_V2,
  computePatternImportDxfProductPhaseEMultiseamProposalFingerprintV2,
  type PatternImportDxfProductPhaseEMultiseamChoicesV2,
  type PatternImportDxfProductPhaseEMultiseamProposalV2,
} from '../../pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from './pattern-import-dxf-product-phase-e-authoring-catalog-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1 =
  'pattern-import-dxf-product-phase-e-exact-topology-binding-request/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1 =
  'pattern-import-dxf-product-phase-e-exact-topology-binding/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1 =
  'pattern-import-dxf-product-phase-e-exact-topology-binding-seal/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_OWNER_V1 =
  'pattern-import-dxf-product-phase-e-exact-topology-binding-owner/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_REQUEST_V1 =
  'pattern-import-dxf-product-phase-e-exact-topology-restore-request/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_REQUEST_V1 =
  'pattern-import-dxf-product-phase-e-exact-topology-serialized-restore-request/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_PREFILL_PATCH_V1 =
  'pattern-import-dxf-product-phase-e-exact-topology-prefill-patch/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_PREFILL_OWNER_V1 =
  'pattern-import-dxf-product-phase-e-exact-topology-prefill-owner/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const PROPOSAL_FINGERPRINT = /^pidpemsv2-fnv1a64:[0-9a-f]{16}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_SAVED_ROW_STABLE_ID_LENGTH = 256;
const MAX_SERVER_ASSEMBLY_REVISION_BYTES = 512;
const MAX_TEXT_LENGTH = 4_096;
const MAX_URL_LENGTH = 4_096;
const MAX_GRAPH_STRING_BYTES = 64 * 1_024;
const MAX_DEPTH = 24;
const MAX_NODES = 50_000;
const MAX_PROPERTIES = 200_000;
const MAX_ARRAY_LENGTH = 16_384;
const MAX_CANONICAL_BYTES = 8 * 1024 * 1024;
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const encoder = new TextEncoder();
const platformCrypto = globalThis.crypto;

const REQUIRED_EXPLICIT_FIELDS = Object.freeze([
  'documentId-and-revision',
  'physical-surface',
  'two-seam-sides-and-anchor-ranges',
  'side-directions',
  'mapping-and-length-ratio',
  'operation-stage-and-order',
  'immutable-material-revisions',
  'tolerances',
] as const);

export type PatternImportDxfProductPhaseEExactTopologySelectedOperationV1 = Readonly<{
  sourceOperationNumber: number;
  authoringOperationId: string;
  localOperationOrder: 0;
  seamIds: readonly [string, string];
}>;

export type PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  /**
   * Opaque token minted by the server Assembly transaction. This is a distinct authority from
   * saved-row revision, patternVersion and cardLockVersion and is never inferred from them.
   */
  serverAssemblyRevision: string;
  assemblyTopologySha256: string;
  selectedOperation: PatternImportDxfProductPhaseEExactTopologySelectedOperationV1;
  catalogCanonicalSha256: string;
  proposalFingerprint: string;
  phaseEAggregatePlanSha256: string;
}>;

export type PatternImportDxfProductPhaseEExactTopologySideBindingV1 = Readonly<{
  seamId: string;
  sideIndex: 0 | 1;
  pieceLineKey: string;
  pieceId: string;
  contourId: string;
  boundaryVertexIds: readonly [string, string];
  direction: 'forward' | 'reverse';
}>;

export type PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1;
  status: 'exact-phase-e-topology-authoring-binding';
  bindings: PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1;
  sides: readonly [
    PatternImportDxfProductPhaseEExactTopologySideBindingV1,
    PatternImportDxfProductPhaseEExactTopologySideBindingV1,
    PatternImportDxfProductPhaseEExactTopologySideBindingV1,
    PatternImportDxfProductPhaseEExactTopologySideBindingV1,
  ];
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_CLAIMS_V1;
}>;

export type PatternImportDxfProductPhaseEExactTopologyBindingSealV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  canonicalByteLength: number;
  authority: 'unsigned-exact-authoring-subdocument-consistency-only';
  persistenceIntegrated: false;
  productionReady: false;
}>;

export type PatternImportDxfProductPhaseEExactTopologyBindingRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1;
  current: PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  choices: PatternImportDxfProductPhaseEMultiseamChoicesV2;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_CLAIMS_V1 = Object.freeze({
  status: 'exact-phase-e-topology-authoring-binding',
  exactSavedRowBound: true,
  exactServerAssemblyRevisionBound: true,
  exactAssemblyTopologyBound: true,
  exactCatalogRecomputed: true,
  exactProposalFingerprintRecomputed: true,
  aggregatePlanSha256Recomputed: true,
  allFourSidesBound: true,
  exactAdjacentOrderedVerticesRequired: true,
  // Document/revision/import generation are committed by the aggregate seal, but this V1 has no
  // independent fresh-current authority for them and must not claim one.
  freshDocumentRevisionAuthorityBound: false,
  freshImportGenerationAuthorityBound: false,
  edgeHintAcceptedAsGeometryAuthority: false,
  anchorRangeAcceptedAsGeometryAuthority: false,
  anchorSamplesAcceptedAsGeometryAuthority: false,
  nearestGeometryRecoveryUsed: false,
  shapeFitRecoveryUsed: false,
  rawDxfAccepted: false,
  rawDxfRetained: false,
  typedArraysRetained: false,
  upstreamCatalogProposalOrChoicesRetained: false,
  persistenceIntegrated: false,
  sidecarWritePerformed: false,
  confirmationPerformed: false,
  placementIntegrated: false,
  previewReady: false,
  runtimeReady: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_BINDING_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_CLAIMS_V1,
  exactSavedRowBound: false as const,
  exactServerAssemblyRevisionBound: false as const,
  exactAssemblyTopologyBound: false as const,
  exactCatalogRecomputed: false as const,
  exactProposalFingerprintRecomputed: false as const,
  aggregatePlanSha256Recomputed: false as const,
  allFourSidesBound: false as const,
  exactAdjacentOrderedVerticesRequired: false as const,
});

declare const bindingOwnerBrand: unique symbol;
export type PatternImportDxfProductPhaseEExactTopologyBindingOwnerV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_OWNER_V1;
  carrier: PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1;
  seal: PatternImportDxfProductPhaseEExactTopologyBindingSealV1;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_CLAIMS_V1;
  readonly [bindingOwnerBrand]: never;
}>;

export type PatternImportDxfProductPhaseEExactTopologyRestoreRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_REQUEST_V1;
  bindingOwner: PatternImportDxfProductPhaseEExactTopologyBindingOwnerV1;
  current: PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
}>;

export type PatternImportDxfProductPhaseEExactTopologySerializedRestoreRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_REQUEST_V1;
  carrier: PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1;
  seal: PatternImportDxfProductPhaseEExactTopologyBindingSealV1;
  current: PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
}>;

type PrefillSideV1 = Readonly<{
  sideIndex: 0 | 1;
  contourId: string;
  boundaryVertexIds: readonly [string, string];
  direction: 'forward' | 'reverse';
}>;

export type PatternImportDxfProductPhaseEExactTopologyPrefillPatchV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_PREFILL_PATCH_V1;
  seams: readonly [
    Readonly<{ seamId: string; sides: readonly [PrefillSideV1, PrefillSideV1] }>,
    Readonly<{ seamId: string; sides: readonly [PrefillSideV1, PrefillSideV1] }>,
  ];
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_CLAIMS_V1 = Object.freeze({
  status: 'exact-phase-e-topology-prefill-patch',
  genuineLiveBindingOwnerRequired: true,
  carrierSealRecomputed: true,
  currentSavedRowExactMatched: true,
  currentServerAssemblyRevisionExactMatched: true,
  currentAssemblyTopologyExactMatched: true,
  currentCatalogRecomputedAndMatched: true,
  currentProposalRecomputedAndMatched: true,
  currentAggregatePlanSealExactMatched: true,
  patchContainsOnlyExactTopologyChoices: true,
  currentDocumentRevisionAuthorityBound: false,
  currentImportGenerationAuthorityBound: false,
  edgeHintAcceptedAsGeometryAuthority: false,
  anchorRangeAcceptedAsGeometryAuthority: false,
  anchorSamplesAcceptedAsGeometryAuthority: false,
  nearestGeometryRecoveryUsed: false,
  shapeFitRecoveryUsed: false,
  rawDxfAccepted: false,
  rawDxfRetained: false,
  bindingOwnerRetained: false,
  catalogOrProposalRetained: false,
  persistenceIntegrated: false,
  sidecarWritePerformed: false,
  confirmationPerformed: false,
  placementIntegrated: false,
  previewReady: false,
  runtimeReady: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_CLAIMS_V1 =
  Object.freeze({
    ...PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_CLAIMS_V1,
    genuineLiveBindingOwnerRequired: false as const,
    verifiedSerializedCarrierAndSealRequired: true as const,
  });

const BLOCKED_RESTORE_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_CLAIMS_V1,
  carrierSealRecomputed: false as const,
  currentSavedRowExactMatched: false as const,
  currentServerAssemblyRevisionExactMatched: false as const,
  currentAssemblyTopologyExactMatched: false as const,
  currentCatalogRecomputedAndMatched: false as const,
  currentProposalRecomputedAndMatched: false as const,
  currentAggregatePlanSealExactMatched: false as const,
  patchContainsOnlyExactTopologyChoices: false as const,
});

const BLOCKED_SERIALIZED_RESTORE_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_CLAIMS_V1,
  carrierSealRecomputed: false as const,
  currentSavedRowExactMatched: false as const,
  currentServerAssemblyRevisionExactMatched: false as const,
  currentAssemblyTopologyExactMatched: false as const,
  currentCatalogRecomputedAndMatched: false as const,
  currentProposalRecomputedAndMatched: false as const,
  currentAggregatePlanSealExactMatched: false as const,
  patchContainsOnlyExactTopologyChoices: false as const,
});

declare const prefillOwnerBrand: unique symbol;
export type PatternImportDxfProductPhaseEExactTopologyPrefillOwnerV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_PREFILL_OWNER_V1;
  patch: PatternImportDxfProductPhaseEExactTopologyPrefillPatchV1;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_CLAIMS_V1;
  readonly [prefillOwnerBrand]: never;
}>;

export type PatternImportDxfProductPhaseEExactTopologyBlockerCodeV1 =
  | 'invalid-input'
  | 'bounds-exceeded'
  | 'saved-row-binding-mismatch'
  | 'server-assembly-revision-binding-mismatch'
  | 'assembly-topology-binding-mismatch'
  | 'selected-operation-binding-mismatch'
  | 'catalog-binding-mismatch'
  | 'proposal-binding-mismatch'
  | 'aggregate-plan-seal-mismatch'
  | 'topology-choice-mismatch'
  | 'binding-owner-unavailable'
  | 'binding-seal-mismatch'
  | 'sha256-unavailable';

export type PatternImportDxfProductPhaseEExactTopologyBlockerV1 = Readonly<{
  code: PatternImportDxfProductPhaseEExactTopologyBlockerCodeV1;
  field: string;
  detail: string;
}>;

export type PatternImportDxfProductPhaseEExactTopologyBindingResultV1 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductPhaseEExactTopologyBindingOwnerV1;
      carrier: PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1;
      seal: PatternImportDxfProductPhaseEExactTopologyBindingSealV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      carrier: null;
      seal: null;
      blockers: readonly [PatternImportDxfProductPhaseEExactTopologyBlockerV1];
      claims: typeof BLOCKED_BINDING_CLAIMS;
    }>;

export type PatternImportDxfProductPhaseEExactTopologyRestoreResultV1 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductPhaseEExactTopologyPrefillOwnerV1;
      patch: PatternImportDxfProductPhaseEExactTopologyPrefillPatchV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      patch: null;
      blockers: readonly [PatternImportDxfProductPhaseEExactTopologyBlockerV1];
      claims: typeof BLOCKED_RESTORE_CLAIMS;
    }>;

export type PatternImportDxfProductPhaseEExactTopologySerializedRestoreResultV1 =
  | Readonly<{
      ok: true;
      patch: PatternImportDxfProductPhaseEExactTopologyPrefillPatchV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      patch: null;
      blockers: readonly [PatternImportDxfProductPhaseEExactTopologyBlockerV1];
      claims: typeof BLOCKED_SERIALIZED_RESTORE_CLAIMS;
    }>;

type ScanState = { nodes: number; properties: number; seen: Set<object> };
type Digest = (bytes: Uint8Array) => Promise<Uint8Array>;
type BindingOwnerRecord = Readonly<{
  carrier: PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1;
  seal: PatternImportDxfProductPhaseEExactTopologyBindingSealV1;
}>;

class ExactTopologyFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductPhaseEExactTopologyBlockerCodeV1,
    readonly field: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(
  code: PatternImportDxfProductPhaseEExactTopologyBlockerCodeV1,
  field: string,
  detail: string,
): never {
  throw new ExactTopologyFailure(code, field, detail);
}

function blocker(error: unknown): PatternImportDxfProductPhaseEExactTopologyBlockerV1 {
  const failure =
    error instanceof ExactTopologyFailure
      ? error
      : new ExactTopologyFailure(
          'invalid-input',
          'request',
          error instanceof Error ? error.message : 'Exact topology binding failed closed.',
        );
  return Object.freeze({ code: failure.code, field: failure.field, detail: failure.message });
}

function blockedBinding(error: unknown): PatternImportDxfProductPhaseEExactTopologyBindingResultV1 {
  return Object.freeze({
    ok: false as const,
    owner: null,
    carrier: null,
    seal: null,
    blockers: Object.freeze([blocker(error)]) as readonly [
      PatternImportDxfProductPhaseEExactTopologyBlockerV1,
    ],
    claims: BLOCKED_BINDING_CLAIMS,
  });
}

function blockedRestore(error: unknown): PatternImportDxfProductPhaseEExactTopologyRestoreResultV1 {
  return Object.freeze({
    ok: false as const,
    owner: null,
    patch: null,
    blockers: Object.freeze([blocker(error)]) as readonly [
      PatternImportDxfProductPhaseEExactTopologyBlockerV1,
    ],
    claims: BLOCKED_RESTORE_CLAIMS,
  });
}

function blockedSerializedRestore(
  error: unknown,
): PatternImportDxfProductPhaseEExactTopologySerializedRestoreResultV1 {
  return Object.freeze({
    ok: false as const,
    patch: null,
    blockers: Object.freeze([blocker(error)]) as readonly [
      PatternImportDxfProductPhaseEExactTopologyBlockerV1,
    ],
    claims: BLOCKED_SERIALIZED_RESTORE_CLAIMS,
  });
}

function detachPlain(value: unknown, path: string, depth: number, state: ScanState): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (
      value.length > MAX_GRAPH_STRING_BYTES ||
      encoder.encode(value).byteLength > MAX_GRAPH_STRING_BYTES
    )
      fail('bounds-exceeded', path, 'String exceeds the UTF-8 byte bound.');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail('invalid-input', path, 'Numbers must be finite and cannot be signed zero.');
    return value;
  }
  if (!value || typeof value !== 'object')
    fail('invalid-input', path, 'Only plain data is accepted.');
  if (depth > MAX_DEPTH) fail('bounds-exceeded', path, 'Object graph exceeds the depth bound.');
  if (state.seen.has(value))
    fail('invalid-input', path, 'Aliases and cyclic references are forbidden.');
  state.seen.add(value);
  state.nodes += 1;
  if (state.nodes > MAX_NODES)
    fail('bounds-exceeded', path, 'Object graph exceeds the node bound.');
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    fail('invalid-input', path, 'Binary storage is forbidden.');
  let isArray: boolean;
  let preflightLength: number | null = null;
  try {
    isArray = Array.isArray(value);
    if (isArray) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (
        !lengthDescriptor ||
        !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 ||
        lengthDescriptor.value > MAX_ARRAY_LENGTH
      )
        fail('bounds-exceeded', path, 'Array length is invalid or exceeds the bound.');
      preflightLength = lengthDescriptor.value as number;
    }
  } catch (error) {
    if (error instanceof ExactTopologyFailure) throw error;
    fail('invalid-input', path, 'Array preflight could not be inspected safely.');
  }
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', path, 'Input could not be reflected safely.');
  }
  if (
    (isArray && prototype !== Array.prototype) ||
    (!isArray && prototype !== Object.prototype && prototype !== null)
  )
    fail('invalid-input', path, 'Input must use an exact plain record or array prototype.');
  const keys = Reflect.ownKeys(descriptors);
  const dataKeys = isArray ? keys.filter((key) => key !== 'length') : keys;
  if (isArray) {
    const lengthDescriptor = descriptors.length;
    if (
      !lengthDescriptor ||
      !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > MAX_ARRAY_LENGTH
    )
      fail('bounds-exceeded', path, 'Array length is invalid or exceeds the bound.');
    const length = lengthDescriptor.value as number;
    if (length !== preflightLength)
      fail('invalid-input', path, 'Array length changed during descriptor capture.');
    if (dataKeys.length !== length || dataKeys.some((key, index) => key !== String(index)))
      fail('invalid-input', path, 'Arrays must be dense and contain no extra properties.');
  }
  state.properties += dataKeys.length;
  if (state.properties > MAX_PROPERTIES)
    fail('bounds-exceeded', path, 'Object graph exceeds the property bound.');
  const output: unknown[] | Record<string, unknown> = isArray
    ? []
    : (Object.create(null) as Record<string, unknown>);
  for (const key of dataKeys) {
    if (typeof key !== 'string') fail('invalid-input', path, 'Symbols are forbidden.');
    if (
      key.length > MAX_GRAPH_STRING_BYTES ||
      encoder.encode(key).byteLength > MAX_GRAPH_STRING_BYTES
    )
      fail('bounds-exceeded', path, 'Property key exceeds the UTF-8 byte bound.');
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${path}.${key}`, 'Expected one enumerable data property.');
    const child = detachPlain(descriptor.value, `${path}.${key}`, depth + 1, state);
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

function rootRecord(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    fail('invalid-input', path, 'Expected an exact plain record.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', path, 'Record reflection failed.');
  }
  if (prototype !== Object.prototype && prototype !== null)
    fail('invalid-input', path, 'Expected a plain record prototype.');
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

function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    fail('invalid-input', path, 'Expected an exact plain record.');
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('invalid-input', path, 'Record has missing or unexpected fields.');
  return value as Record<string, unknown>;
}

function array(value: unknown, length: number, path: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length !== length)
    fail('invalid-input', path, `Expected an exact ${length}-item tuple.`);
  return value;
}

function boundedArray(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    fail('bounds-exceeded', path, `Expected ${minimum}..${maximum} items.`);
  return value;
}

function integer(value: unknown, minimum: number, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    fail('invalid-input', path, `Expected a safe integer >= ${minimum}.`);
  return value as number;
}

function finite(value: unknown, minimum: number, maximum: number, path: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Object.is(value, -0) ||
    value < minimum ||
    value > maximum
  )
    fail('invalid-input', path, `Expected a finite number within [${minimum}, ${maximum}].`);
  return value;
}

function text(
  value: unknown,
  path: string,
  stable = false,
  maximumLength = MAX_TEXT_LENGTH,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength ||
    (stable && !STABLE_ID.test(value)) ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    })
  )
    fail('invalid-input', path, `Expected a bounded${stable ? ' stable-ID' : ''} string.`);
  return value;
}

function sha(value: unknown, path: string): string {
  if (typeof value !== 'string' || !SHA256.test(value))
    fail('invalid-input', path, 'Expected a lowercase SHA-256 digest.');
  return value;
}

function url(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0)
    fail('invalid-input', path, 'Expected a nonempty saved-row URL within 4096 JS characters.');
  if (value.length > MAX_URL_LENGTH)
    fail('bounds-exceeded', path, 'Saved-row URL exceeds 4096 JS characters.');
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

function boundedCanonical(
  value: unknown,
  maximumBytes = MAX_CANONICAL_BYTES,
): Readonly<{ text: string; byteLength: number }> {
  const chunks: string[] = [];
  let byteLength = 0;
  const append = (chunk: string) => {
    const nextLength = encoder.encode(chunk).byteLength;
    if (byteLength + nextLength > maximumBytes)
      fail('bounds-exceeded', 'canonical', 'Canonical payload exceeds the byte bound.');
    byteLength += nextLength;
    chunks.push(chunk);
  };
  const visit = (item: unknown): void => {
    if (item === null || typeof item === 'boolean' || typeof item === 'string') {
      append(JSON.stringify(item));
      return;
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || Object.is(item, -0))
        fail('invalid-input', 'canonical', 'Canonical numbers must be finite and unsigned-zero.');
      append(JSON.stringify(item));
      return;
    }
    if (Array.isArray(item)) {
      append('[');
      item.forEach((child, index) => {
        if (index > 0) append(',');
        visit(child);
      });
      append(']');
      return;
    }
    if (!item || typeof item !== 'object' || ArrayBuffer.isView(item))
      fail('invalid-input', 'canonical', 'Canonical payload contains unsupported data.');
    append('{');
    Object.keys(item as Record<string, unknown>)
      .sort()
      .forEach((key, index) => {
        if (index > 0) append(',');
        append(JSON.stringify(key));
        append(':');
        visit((item as Record<string, unknown>)[key]);
      });
    append('}');
  };
  visit(value);
  return Object.freeze({ text: chunks.join(''), byteLength });
}

function same(left: unknown, right: unknown): boolean {
  try {
    return boundedCanonical(left).text === boundedCanonical(right).text;
  } catch {
    return false;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function captureCryptoOption(options: unknown): Pick<Crypto, 'subtle'> | undefined {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    ArrayBuffer.isView(options)
  )
    fail('invalid-input', 'options', 'Options must be an exact plain record.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(options);
    descriptors = Object.getOwnPropertyDescriptors(options);
  } catch {
    fail('invalid-input', 'options', 'Options could not be reflected safely.');
  }
  if (prototype !== Object.prototype && prototype !== null)
    fail('invalid-input', 'options', 'Options must use a plain record prototype.');
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => key !== 'crypto') || keys.length > 1)
    fail('invalid-input', 'options', 'Options contain hidden, symbol, or unexpected fields.');
  if (keys.length === 0) return undefined;
  const descriptor = descriptors.crypto;
  if (
    !descriptor ||
    !descriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined
  )
    fail('invalid-input', 'options.crypto', 'Crypto must be one enumerable data property.');
  return descriptor.value as Pick<Crypto, 'subtle'> | undefined;
}

function captureDigest(crypto: Pick<Crypto, 'subtle'> | undefined): Digest {
  if (!crypto)
    fail('sha256-unavailable', 'crypto', 'Web Crypto SHA-256 capability is unavailable.');
  let subtle: SubtleCrypto;
  let digest: SubtleCrypto['digest'];
  if (crypto === platformCrypto) {
    try {
      subtle = crypto.subtle;
      digest = subtle.digest;
    } catch {
      fail('sha256-unavailable', 'crypto', 'Web Crypto SHA-256 capability is inaccessible.');
    }
  } else {
    const provider = rootRecord(crypto, ['subtle'], 'crypto');
    const capturedSubtle = provider.subtle;
    const methods = rootRecord(capturedSubtle, ['digest'], 'crypto.subtle');
    subtle = capturedSubtle as SubtleCrypto;
    digest = methods.digest as SubtleCrypto['digest'];
  }
  if (!subtle || typeof digest !== 'function')
    fail('sha256-unavailable', 'crypto', 'Web Crypto SHA-256 capability is unavailable.');
  return async (bytes: Uint8Array) => {
    try {
      const result = new Uint8Array(await Reflect.apply(digest, subtle, ['SHA-256', bytes]));
      if (result.byteLength !== 32)
        fail('sha256-unavailable', 'crypto.digest', 'SHA-256 returned the wrong byte length.');
      return result;
    } catch (error) {
      if (error instanceof ExactTopologyFailure) throw error;
      fail('sha256-unavailable', 'crypto.digest', 'Web Crypto SHA-256 failed.');
    }
  };
}

async function verifyKat(digest: Digest): Promise<void> {
  const known = await digest(encoder.encode('abc'));
  if (known.byteLength !== 32 || bytesToHex(known) !== SHA256_ABC)
    fail('sha256-unavailable', 'crypto.digest', 'SHA-256 known-answer test failed.');
}

async function hash(
  domain: string,
  value: unknown,
  digest: Digest,
): Promise<Readonly<{ sha256: string; byteLength: number }>> {
  const prefix = `${domain}\0`;
  const prefixByteLength = encoder.encode(prefix).byteLength;
  if (prefixByteLength >= MAX_CANONICAL_BYTES)
    fail('bounds-exceeded', domain, 'Canonical domain exceeds the byte bound.');
  const payload = boundedCanonical(value, MAX_CANONICAL_BYTES - prefixByteLength);
  const bytes = encoder.encode(`${prefix}${payload.text}`);
  if (bytes.byteLength !== prefixByteLength + payload.byteLength)
    fail('invalid-input', domain, 'Canonical byte accounting changed unexpectedly.');
  const result = await digest(bytes);
  return Object.freeze({ sha256: bytesToHex(result), byteLength: payload.byteLength });
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || seen.has(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function validateRow(value: unknown, path: string): DxfProductSavedRowIdentityV1 {
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
  integer(row.revision, 1, `${path}.revision`);
  integer(row.cardLockVersion, 0, `${path}.cardLockVersion`);
  url(row.url, `${path}.url`);
  integer(row.sizeBytes, 1, `${path}.sizeBytes`);
  sha(row.sha256, `${path}.sha256`);
  return row as DxfProductSavedRowIdentityV1;
}

function validateSelectedOperation(
  value: unknown,
  path: string,
): PatternImportDxfProductPhaseEExactTopologySelectedOperationV1 {
  const operation = record(
    value,
    ['sourceOperationNumber', 'authoringOperationId', 'localOperationOrder', 'seamIds'],
    path,
  );
  integer(operation.sourceOperationNumber, 1, `${path}.sourceOperationNumber`);
  text(operation.authoringOperationId, `${path}.authoringOperationId`, true);
  if (operation.localOperationOrder !== 0)
    fail('invalid-input', `${path}.localOperationOrder`, 'Expected local operation order zero.');
  const seamIds = array(operation.seamIds, 2, `${path}.seamIds`);
  seamIds.forEach((id, index) => text(id, `${path}.seamIds[${index}]`, true));
  if (seamIds[0] === seamIds[1])
    fail('invalid-input', `${path}.seamIds`, 'Seam identities must be distinct.');
  return operation as PatternImportDxfProductPhaseEExactTopologySelectedOperationV1;
}

function validateCurrent(
  value: unknown,
  path: string,
): PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1 {
  const current = record(
    value,
    [
      'row',
      'serverAssemblyRevision',
      'assemblyTopologySha256',
      'selectedOperation',
      'catalogCanonicalSha256',
      'proposalFingerprint',
      'phaseEAggregatePlanSha256',
    ],
    path,
  );
  validateRow(current.row, `${path}.row`);
  serverAssemblyRevision(current.serverAssemblyRevision, `${path}.serverAssemblyRevision`);
  sha(current.assemblyTopologySha256, `${path}.assemblyTopologySha256`);
  validateSelectedOperation(current.selectedOperation, `${path}.selectedOperation`);
  sha(current.catalogCanonicalSha256, `${path}.catalogCanonicalSha256`);
  if (
    typeof current.proposalFingerprint !== 'string' ||
    !PROPOSAL_FINGERPRINT.test(current.proposalFingerprint)
  )
    fail('invalid-input', `${path}.proposalFingerprint`, 'Expected the V2 proposal fingerprint.');
  sha(current.phaseEAggregatePlanSha256, `${path}.phaseEAggregatePlanSha256`);
  return current as PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1;
}

function validateCatalogShape(
  value: unknown,
  path: string,
): PatternImportDxfProductPhaseEAuthoringCatalogV1 {
  const catalog = record(
    value,
    [
      'schemaVersion',
      'techCardId',
      'scopeKey',
      'sizeToken',
      'sourceFileId',
      'sizeSelectionCanonicalSha256',
      'pieces',
      'requiredExplicitFields',
      'canonicalSha256',
      'geometryCoordinatesExposed',
      'rawDxfExposed',
      'assemblyInferred',
      'productionReady',
    ],
    path,
  );
  if (catalog.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1)
    fail('catalog-binding-mismatch', `${path}.schemaVersion`, 'Catalog schema is unsupported.');
  integer(catalog.techCardId, 1, `${path}.techCardId`);
  text(catalog.scopeKey, `${path}.scopeKey`, true);
  text(catalog.sizeToken, `${path}.sizeToken`, true);
  text(catalog.sourceFileId, `${path}.sourceFileId`, true);
  sha(catalog.sizeSelectionCanonicalSha256, `${path}.sizeSelectionCanonicalSha256`);
  sha(catalog.canonicalSha256, `${path}.canonicalSha256`);
  if (
    catalog.geometryCoordinatesExposed !== false ||
    catalog.rawDxfExposed !== false ||
    catalog.assemblyInferred !== false ||
    catalog.productionReady !== false
  )
    fail('catalog-binding-mismatch', path, 'Catalog safety claims differ from V1.');
  const required = array(
    catalog.requiredExplicitFields,
    REQUIRED_EXPLICIT_FIELDS.length,
    `${path}.requiredExplicitFields`,
  );
  if (required.some((field, index) => field !== REQUIRED_EXPLICIT_FIELDS[index]))
    fail(
      'catalog-binding-mismatch',
      `${path}.requiredExplicitFields`,
      'Catalog field policy differs.',
    );
  const pieces = array(catalog.pieces, 2, `${path}.pieces`);
  const pieceIds = new Set<string>();
  const lineKeys = new Set<string>();
  const globalVertices = new Set<string>();
  for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
    const piecePath = `${path}.pieces[${pieceIndex}]`;
    const piece = record(pieces[pieceIndex], ['pieceId', 'pieceLineKey', 'contours'], piecePath);
    const pieceId = text(piece.pieceId, `${piecePath}.pieceId`, true);
    const pieceLineKey = text(piece.pieceLineKey, `${piecePath}.pieceLineKey`, true);
    if (pieceIds.has(pieceId) || lineKeys.has(pieceLineKey))
      fail('catalog-binding-mismatch', piecePath, 'Piece and line identities must be unique.');
    pieceIds.add(pieceId);
    lineKeys.add(pieceLineKey);
    const contours = boundedArray(piece.contours, 1, 4_096, `${piecePath}.contours`);
    const contourIds = new Set<string>();
    for (let contourIndex = 0; contourIndex < contours.length; contourIndex += 1) {
      const contourPath = `${piecePath}.contours[${contourIndex}]`;
      const contour = record(
        contours[contourIndex],
        ['contourId', 'role', 'geometry', 'closed', 'boundaryVertices'],
        contourPath,
      );
      const contourId = text(contour.contourId, `${contourPath}.contourId`, true);
      if (contourIds.has(contourId))
        fail('catalog-binding-mismatch', contourPath, 'Contour identity must be unique per piece.');
      contourIds.add(contourId);
      if (
        contour.role !== 'sewing-boundary' &&
        contour.role !== 'cut-boundary' &&
        contour.role !== 'hole'
      )
        fail('catalog-binding-mismatch', `${contourPath}.role`, 'Contour role is unsupported.');
      if (contour.closed !== true)
        fail(
          'catalog-binding-mismatch',
          `${contourPath}.closed`,
          'Phase-E contours must be closed.',
        );
      const geometry = contour.geometry as unknown;
      if (!geometry || typeof geometry !== 'object')
        fail('catalog-binding-mismatch', `${contourPath}.geometry`, 'Geometry is missing.');
      const kind = (geometry as Record<string, unknown>).kind;
      if (kind === 'cut-loop') {
        const item = record(geometry, ['kind', 'index'], `${contourPath}.geometry`);
        integer(item.index, 0, `${contourPath}.geometry.index`);
      } else {
        const item = record(geometry, ['kind'], `${contourPath}.geometry`);
        if (item.kind !== 'cut' && item.kind !== 'seam')
          fail(
            'catalog-binding-mismatch',
            `${contourPath}.geometry.kind`,
            'Geometry is unsupported.',
          );
      }
      const vertices = boundedArray(
        contour.boundaryVertices,
        2,
        MAX_ARRAY_LENGTH,
        `${contourPath}.boundaryVertices`,
      );
      const localVertices = new Set<string>();
      let priorArc = -1;
      for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex += 1) {
        const vertexPath = `${contourPath}.boundaryVertices[${vertexIndex}]`;
        const vertex = record(
          vertices[vertexIndex],
          ['ordinal', 'vertexId', 'normalizedArc'],
          vertexPath,
        );
        if (vertex.ordinal !== vertexIndex)
          fail(
            'catalog-binding-mismatch',
            `${vertexPath}.ordinal`,
            'Vertex ordinal is not canonical.',
          );
        const vertexId = text(vertex.vertexId, `${vertexPath}.vertexId`, true);
        if (localVertices.has(vertexId) || globalVertices.has(vertexId))
          fail(
            'catalog-binding-mismatch',
            vertexPath,
            'Boundary vertex identities must be global.',
          );
        localVertices.add(vertexId);
        globalVertices.add(vertexId);
        const arc = finite(vertex.normalizedArc, 0, 1, `${vertexPath}.normalizedArc`);
        if ((vertexIndex === 0 && arc !== 0) || arc <= priorArc)
          fail(
            'catalog-binding-mismatch',
            `${vertexPath}.normalizedArc`,
            'Arc order is not canonical.',
          );
        priorArc = arc;
      }
    }
  }
  return catalog as PatternImportDxfProductPhaseEAuthoringCatalogV1;
}

async function verifyCatalog(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  digest: Digest,
): Promise<void> {
  const unsigned = {
    schemaVersion: catalog.schemaVersion,
    techCardId: catalog.techCardId,
    scopeKey: catalog.scopeKey,
    sizeToken: catalog.sizeToken,
    sourceFileId: catalog.sourceFileId,
    sizeSelectionCanonicalSha256: catalog.sizeSelectionCanonicalSha256,
    pieces: catalog.pieces,
    requiredExplicitFields: catalog.requiredExplicitFields,
    geometryCoordinatesExposed: catalog.geometryCoordinatesExposed,
    rawDxfExposed: catalog.rawDxfExposed,
    assemblyInferred: catalog.assemblyInferred,
    productionReady: catalog.productionReady,
  };
  const computed = await hash(
    'pattern-import-dxf-product-phase-e-authoring-catalog-v1',
    unsigned,
    digest,
  );
  if (computed.sha256 !== catalog.canonicalSha256)
    fail(
      'catalog-binding-mismatch',
      'catalog.canonicalSha256',
      'Catalog SHA-256 did not recompute.',
    );
}

function validateAnchorEvidence(value: unknown, path: string): void {
  const baseKeys = ['pieceLineKey', 'edgeHint', 'range', 'lenMm', 'contourSig'] as const;
  const actualKeys = value && typeof value === 'object' ? Reflect.ownKeys(value) : [];
  const hasSamples = actualKeys.includes('samples');
  const hasLayer = actualKeys.includes('layer');
  if (hasLayer && !hasSamples)
    fail('invalid-input', path, 'Diagnostic layer requires the diagnostic samples field.');
  const anchor = record(
    value,
    hasLayer ? [...baseKeys, 'samples', 'layer'] : hasSamples ? [...baseKeys, 'samples'] : baseKeys,
    path,
  );
  text(anchor.pieceLineKey, `${path}.pieceLineKey`, true);
  text(anchor.edgeHint, `${path}.edgeHint`);
  const range = array(anchor.range, 2, `${path}.range`);
  const from = finite(range[0], 0, 1, `${path}.range[0]`);
  const to = finite(range[1], 0, 1, `${path}.range[1]`);
  if (from >= to) fail('proposal-binding-mismatch', `${path}.range`, 'Anchor range is invalid.');
  finite(anchor.lenMm, Number.MIN_VALUE, 1_000_000_000, `${path}.lenMm`);
  text(anchor.contourSig, `${path}.contourSig`);
  if (hasSamples) {
    const samples = boundedArray(anchor.samples, 0, MAX_ARRAY_LENGTH, `${path}.samples`);
    samples.forEach((sample, sampleIndex) => {
      const pair = array(sample, 2, `${path}.samples[${sampleIndex}]`);
      finite(pair[0], -1_000_000_000, 1_000_000_000, `${path}.samples[${sampleIndex}][0]`);
      finite(pair[1], -1_000_000_000, 1_000_000_000, `${path}.samples[${sampleIndex}][1]`);
    });
  }
  if (hasLayer && anchor.layer !== 'under' && anchor.layer !== 'over')
    fail('invalid-input', `${path}.layer`, 'Diagnostic layer is unsupported.');
}

function validateProposalShape(
  value: unknown,
  path: string,
): PatternImportDxfProductPhaseEMultiseamProposalV2 {
  const proposal = record(
    value,
    [
      'schemaVersion',
      'status',
      'expectedCatalogCanonicalSha256',
      'operation',
      'seams',
      'deterministicFingerprint',
    ],
    path,
  );
  if (
    proposal.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PROPOSAL_V2 ||
    proposal.status !== 'proposal-not-authority'
  )
    fail('proposal-binding-mismatch', path, 'Proposal schema or status is unsupported.');
  sha(proposal.expectedCatalogCanonicalSha256, `${path}.expectedCatalogCanonicalSha256`);
  if (
    typeof proposal.deterministicFingerprint !== 'string' ||
    !PROPOSAL_FINGERPRINT.test(proposal.deterministicFingerprint)
  )
    fail(
      'proposal-binding-mismatch',
      `${path}.deterministicFingerprint`,
      'Fingerprint is invalid.',
    );
  const operation = record(
    proposal.operation,
    [
      'authoringOperationId',
      'sourceOperationNumber',
      'order',
      'work',
      'inputKeys',
      'outputUnitKey',
      'outputUnitName',
      'kind',
      'seamIds',
    ],
    `${path}.operation`,
  );
  text(operation.authoringOperationId, `${path}.operation.authoringOperationId`, true);
  integer(operation.sourceOperationNumber, 1, `${path}.operation.sourceOperationNumber`);
  if (operation.order !== 0 || operation.kind !== 'stitch')
    fail(
      'proposal-binding-mismatch',
      `${path}.operation`,
      'Proposal operation is not local stitch 0.',
    );
  text(operation.work, `${path}.operation.work`);
  boundedArray(operation.inputKeys, 1, 32, `${path}.operation.inputKeys`).forEach((item, index) =>
    text(item, `${path}.operation.inputKeys[${index}]`, true),
  );
  text(operation.outputUnitKey, `${path}.operation.outputUnitKey`, true);
  text(operation.outputUnitName, `${path}.operation.outputUnitName`);
  const seamIds = array(operation.seamIds, 2, `${path}.operation.seamIds`);
  seamIds.forEach((item, index) => text(item, `${path}.operation.seamIds[${index}]`, true));
  if (seamIds[0] === seamIds[1])
    fail('proposal-binding-mismatch', `${path}.operation.seamIds`, 'Proposal seams must differ.');
  const seams = array(proposal.seams, 2, `${path}.seams`);
  for (let seamIndex = 0; seamIndex < seams.length; seamIndex += 1) {
    const seamPath = `${path}.seams[${seamIndex}]`;
    const seam = record(
      seams[seamIndex],
      ['id', 'kind', 'anchoredSize', 'sourceDirection', 'sides'],
      seamPath,
    );
    if (seam.id !== seamIds[seamIndex])
      fail(
        'proposal-binding-mismatch',
        `${seamPath}.id`,
        'Proposal seam order differs from operation.',
      );
    text(seam.id, `${seamPath}.id`, true);
    if (!['edge', 'partial', 'composite', 'surface', 'closure'].includes(seam.kind as string))
      fail('proposal-binding-mismatch', `${seamPath}.kind`, 'Seam kind is unsupported.');
    text(seam.anchoredSize, `${seamPath}.anchoredSize`, true);
    if (seam.sourceDirection !== 'same' && seam.sourceDirection !== 'reversed')
      fail(
        'proposal-binding-mismatch',
        `${seamPath}.sourceDirection`,
        'Direction is not explicit.',
      );
    const sides = array(seam.sides, 2, `${seamPath}.sides`);
    for (let sideIndex = 0; sideIndex < sides.length; sideIndex += 1) {
      const sidePath = `${seamPath}.sides[${sideIndex}]`;
      const side = record(
        sides[sideIndex],
        ['pieceId', 'pieceLineKey', 'sourceSide', 'requiredDirection', 'evidence'],
        sidePath,
      );
      text(side.pieceId, `${sidePath}.pieceId`, true);
      text(side.pieceLineKey, `${sidePath}.pieceLineKey`, true);
      if (side.sourceSide !== (sideIndex === 0 ? 'A' : 'B'))
        fail(
          'proposal-binding-mismatch',
          `${sidePath}.sourceSide`,
          'Proposal side order is invalid.',
        );
      if (side.requiredDirection !== 'forward' && side.requiredDirection !== 'reverse')
        fail('proposal-binding-mismatch', `${sidePath}.requiredDirection`, 'Direction is invalid.');
      validateAnchorEvidence(side.evidence, `${sidePath}.evidence`);
      const evidence = side.evidence as Record<string, unknown>;
      if (evidence.pieceLineKey !== side.pieceLineKey)
        fail('proposal-binding-mismatch', `${sidePath}.evidence`, 'Anchor piece line differs.');
    }
  }
  const recomputed = computePatternImportDxfProductPhaseEMultiseamProposalFingerprintV2(
    proposal as unknown as PatternImportDxfProductPhaseEMultiseamProposalV2,
  );
  if (recomputed !== proposal.deterministicFingerprint)
    fail(
      'proposal-binding-mismatch',
      `${path}.deterministicFingerprint`,
      'Fingerprint did not recompute.',
    );
  return proposal as unknown as PatternImportDxfProductPhaseEMultiseamProposalV2;
}

function directedArc(
  contour: PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number]['contours'][number],
  ids: readonly [string, string],
  direction: 'forward' | 'reverse',
): Readonly<{ start: number; end: number }> | null {
  if (ids[0] === ids[1]) return null;
  const byId = new Map(contour.boundaryVertices.map((vertex) => [vertex.vertexId, vertex]));
  const first = byId.get(ids[0]);
  const second = byId.get(ids[1]);
  if (!first || !second) return null;
  const count = contour.boundaryVertices.length;
  const expected =
    direction === 'forward' ? (first.ordinal + 1) % count : (first.ordinal - 1 + count) % count;
  if (second.ordinal !== expected) return null;
  const start = direction === 'forward' ? first.normalizedArc : 1 - first.normalizedArc;
  let end = direction === 'forward' ? second.normalizedArc : 1 - second.normalizedArc;
  while (end <= start) end += 1;
  return { start, end };
}

function catalogSide(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  pieceId: string,
  pieceLineKey: string,
  contourId: string,
): PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number]['contours'][number] | null {
  const pieces = catalog.pieces.filter(
    (piece) => piece.pieceId === pieceId && piece.pieceLineKey === pieceLineKey,
  );
  if (pieces.length !== 1) return null;
  const contours = pieces[0].contours.filter((contour) => contour.contourId === contourId);
  return contours.length === 1 ? contours[0] : null;
}

function validateChoiceSide(
  value: unknown,
  path: string,
  proposalSide: PatternImportDxfProductPhaseEMultiseamProposalV2['seams'][number]['sides'][number],
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  expectedRole: 'sewing-boundary' | 'cut-boundary',
): PatternImportDxfProductPhaseEExactTopologySideBindingV1 {
  const side = record(
    value,
    ['pieceId', 'pieceLineKey', 'contourId', 'boundaryVertexIds', 'direction', 'directedArc'],
    path,
  );
  const pieceId = text(side.pieceId, `${path}.pieceId`, true);
  const pieceLineKey = text(side.pieceLineKey, `${path}.pieceLineKey`, true);
  const contourId = text(side.contourId, `${path}.contourId`, true);
  if (
    pieceId !== proposalSide.pieceId ||
    pieceLineKey !== proposalSide.pieceLineKey ||
    side.direction !== proposalSide.requiredDirection
  )
    fail('topology-choice-mismatch', path, 'Choice differs from the exact proposal side.');
  const direction = side.direction as 'forward' | 'reverse';
  const rawIds = array(side.boundaryVertexIds, 2, `${path}.boundaryVertexIds`);
  const ids = [
    text(rawIds[0], `${path}.boundaryVertexIds[0]`, true),
    text(rawIds[1], `${path}.boundaryVertexIds[1]`, true),
  ] as const;
  const contour = catalogSide(catalog, pieceId, pieceLineKey, contourId);
  if (!contour || contour.role !== expectedRole)
    fail('topology-choice-mismatch', path, 'Choice does not exact-match one authorable contour.');
  const expectedArc = directedArc(contour, ids, direction);
  if (!expectedArc)
    fail(
      'topology-choice-mismatch',
      `${path}.boundaryVertexIds`,
      'Vertices must be one exact adjacent ordered source-boundary edge.',
    );
  const arc = record(side.directedArc, ['start', 'end'], `${path}.directedArc`);
  finite(arc.start, 0, 1, `${path}.directedArc.start`);
  finite(arc.end, Number.MIN_VALUE, 2, `${path}.directedArc.end`);
  if (arc.start !== expectedArc.start || arc.end !== expectedArc.end)
    fail(
      'topology-choice-mismatch',
      `${path}.directedArc`,
      'Directed arc differs from vertex order.',
    );
  return {
    seamId: '',
    sideIndex: 0,
    pieceLineKey,
    pieceId,
    contourId,
    boundaryVertexIds: ids,
    direction,
  };
}

function validateChoicesShape(
  value: unknown,
  path: string,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
): Readonly<{
  choices: PatternImportDxfProductPhaseEMultiseamChoicesV2;
  sides: PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1['sides'];
}> {
  const choices = record(
    value,
    [
      'schemaVersion',
      'expectedCatalogCanonicalSha256',
      'expectedProposalFingerprint',
      'importGeneration',
      'documentId',
      'revision',
      'physicalSurface',
      'seams',
      'operations',
      'materials',
      'tolerance',
      'aggregatePlanSeal',
    ],
    path,
  );
  if (choices.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_CHOICES_V2)
    fail('aggregate-plan-seal-mismatch', `${path}.schemaVersion`, 'Choices schema is unsupported.');
  sha(choices.expectedCatalogCanonicalSha256, `${path}.expectedCatalogCanonicalSha256`);
  if (
    typeof choices.expectedProposalFingerprint !== 'string' ||
    !PROPOSAL_FINGERPRINT.test(choices.expectedProposalFingerprint)
  )
    fail(
      'aggregate-plan-seal-mismatch',
      `${path}.expectedProposalFingerprint`,
      'Fingerprint invalid.',
    );
  integer(choices.importGeneration, 1, `${path}.importGeneration`);
  text(choices.documentId, `${path}.documentId`, true);
  text(choices.revision, `${path}.revision`, true);
  const surface = choices.physicalSurface as unknown;
  const physical = record(surface, ['mode', 'seamAllowancePhysical'], `${path}.physicalSurface`);
  if (
    !(
      (physical.mode === 'sewing-surface' && physical.seamAllowancePhysical === false) ||
      (physical.mode === 'cut-surface' && physical.seamAllowancePhysical === true)
    )
  )
    fail('aggregate-plan-seal-mismatch', `${path}.physicalSurface`, 'Physical surface is invalid.');
  const expectedRole =
    physical.mode === 'sewing-surface' ? ('sewing-boundary' as const) : ('cut-boundary' as const);
  const seams = array(choices.seams, 2, `${path}.seams`);
  const boundSides: PatternImportDxfProductPhaseEExactTopologySideBindingV1[] = [];
  const physicalEdges = new Set<string>();
  for (let seamIndex = 0; seamIndex < seams.length; seamIndex += 1) {
    const seamPath = `${path}.seams[${seamIndex}]`;
    const seam = record(
      seams[seamIndex],
      ['id', 'operationId', 'mapping', 'lengthRatio', 'sides'],
      seamPath,
    );
    const proposedSeam = proposal.seams[seamIndex];
    if (
      seam.id !== proposedSeam.id ||
      seam.operationId !== proposal.operation.authoringOperationId ||
      seam.mapping !== 'equal' ||
      seam.lengthRatio !== 1
    )
      fail('topology-choice-mismatch', seamPath, 'Choice seam differs from proposal authority.');
    const sides = array(seam.sides, 2, `${seamPath}.sides`);
    for (let sideIndex = 0; sideIndex < sides.length; sideIndex += 1) {
      const validated = validateChoiceSide(
        sides[sideIndex],
        `${seamPath}.sides[${sideIndex}]`,
        proposedSeam.sides[sideIndex],
        catalog,
        expectedRole,
      );
      const binding = {
        ...validated,
        seamId: seam.id as string,
        sideIndex: sideIndex as 0 | 1,
      };
      const undirected = [...binding.boundaryVertexIds].sort();
      const edge = `${binding.pieceId}\0${binding.contourId}\0${undirected[0]}\0${undirected[1]}`;
      if (physicalEdges.has(edge))
        fail('topology-choice-mismatch', seamPath, 'Two seams reuse one physical boundary edge.');
      physicalEdges.add(edge);
      boundSides.push(binding);
    }
  }
  const operations = array(choices.operations, 1, `${path}.operations`);
  const operation = record(
    operations[0],
    ['id', 'stage', 'order', 'kind', 'seamIds'],
    `${path}.operations[0]`,
  );
  text(operation.id, `${path}.operations[0].id`, true);
  integer(operation.stage, 0, `${path}.operations[0].stage`);
  if (operation.order !== 0 || operation.kind !== 'stitch')
    fail(
      'selected-operation-binding-mismatch',
      `${path}.operations[0]`,
      'Choice operation is invalid.',
    );
  const operationSeams = array(operation.seamIds, 2, `${path}.operations[0].seamIds`);
  if (
    operation.id !== proposal.operation.authoringOperationId ||
    operationSeams.some((id, index) => id !== proposal.operation.seamIds[index])
  )
    fail(
      'selected-operation-binding-mismatch',
      `${path}.operations[0]`,
      'Choice operation differs.',
    );
  const materials = boundedArray(choices.materials, 1, 256, `${path}.materials`);
  const materialIds = new Set<string>();
  const materialPieces = new Set<string>();
  const expectedPieces = new Set(catalog.pieces.map(({ pieceId }) => pieceId));
  for (let index = 0; index < materials.length; index += 1) {
    const materialPath = `${path}.materials[${index}]`;
    const material = record(materials[index], ['id', 'materialRevision', 'pieceIds'], materialPath);
    const id = text(material.id, `${materialPath}.id`, true);
    text(material.materialRevision, `${materialPath}.materialRevision`, true);
    if (materialIds.has(id))
      fail('aggregate-plan-seal-mismatch', `${materialPath}.id`, 'Material identity repeats.');
    materialIds.add(id);
    const pieceIds = boundedArray(material.pieceIds, 1, 2, `${materialPath}.pieceIds`);
    for (let pieceIndex = 0; pieceIndex < pieceIds.length; pieceIndex += 1) {
      const pieceId = text(pieceIds[pieceIndex], `${materialPath}.pieceIds[${pieceIndex}]`, true);
      if (!expectedPieces.has(pieceId) || materialPieces.has(pieceId))
        fail('aggregate-plan-seal-mismatch', materialPath, 'Material piece coverage is invalid.');
      materialPieces.add(pieceId);
    }
  }
  if (materialPieces.size !== expectedPieces.size)
    fail(
      'aggregate-plan-seal-mismatch',
      `${path}.materials`,
      'Material piece coverage is incomplete.',
    );
  const tolerance = record(
    choices.tolerance,
    ['endpointMm', 'fullLengthMm', 'fullLengthRelative'],
    `${path}.tolerance`,
  );
  finite(tolerance.endpointMm, 0, 1_000, `${path}.tolerance.endpointMm`);
  finite(tolerance.fullLengthMm, 0, 1_000_000, `${path}.tolerance.fullLengthMm`);
  finite(tolerance.fullLengthRelative, 0, 1, `${path}.tolerance.fullLengthRelative`);
  const seal = record(
    choices.aggregatePlanSeal,
    ['schemaVersion', 'algorithm', 'canonicalSha256', 'authority', 'productionReady'],
    `${path}.aggregatePlanSeal`,
  );
  if (
    seal.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_PLAN_SEAL_V2 ||
    seal.algorithm !== 'SHA-256' ||
    seal.authority !== 'explicit-bounded-two-piece-two-seam' ||
    seal.productionReady !== false
  )
    fail(
      'aggregate-plan-seal-mismatch',
      `${path}.aggregatePlanSeal`,
      'Plan seal metadata differs.',
    );
  sha(seal.canonicalSha256, `${path}.aggregatePlanSeal.canonicalSha256`);
  return {
    choices: choices as unknown as PatternImportDxfProductPhaseEMultiseamChoicesV2,
    sides:
      boundSides as unknown as PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1['sides'],
  };
}

async function verifyChoicesSeal(
  choices: PatternImportDxfProductPhaseEMultiseamChoicesV2,
  digest: Digest,
): Promise<void> {
  const unsigned = {
    schemaVersion: choices.schemaVersion,
    expectedCatalogCanonicalSha256: choices.expectedCatalogCanonicalSha256,
    expectedProposalFingerprint: choices.expectedProposalFingerprint,
    importGeneration: choices.importGeneration,
    documentId: choices.documentId,
    revision: choices.revision,
    physicalSurface: choices.physicalSurface,
    seams: choices.seams,
    operations: choices.operations,
    materials: choices.materials,
    tolerance: choices.tolerance,
  };
  const computed = await hash(
    'pattern-import-dxf-product-phase-e-multiseam-plan-v2',
    unsigned,
    digest,
  );
  if (computed.sha256 !== choices.aggregatePlanSeal.canonicalSha256)
    fail(
      'aggregate-plan-seal-mismatch',
      'choices.aggregatePlanSeal.canonicalSha256',
      'Aggregate plan SHA-256 did not independently recompute.',
    );
}

function validateContextCrossBindings(
  current: PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
): void {
  const operation = current.selectedOperation;
  if (current.row.techCardId !== catalog.techCardId || current.row.scopeKey !== catalog.scopeKey)
    fail(
      'saved-row-binding-mismatch',
      'current.row',
      'Saved row differs from the exact catalog scope.',
    );
  if (current.catalogCanonicalSha256 !== catalog.canonicalSha256)
    fail(
      'catalog-binding-mismatch',
      'current.catalogCanonicalSha256',
      'Current catalog SHA differs.',
    );
  if (
    current.proposalFingerprint !== proposal.deterministicFingerprint ||
    proposal.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256
  )
    fail(
      'proposal-binding-mismatch',
      'current.proposalFingerprint',
      'Current proposal binding differs.',
    );
  if (
    operation.sourceOperationNumber !== proposal.operation.sourceOperationNumber ||
    operation.authoringOperationId !== proposal.operation.authoringOperationId ||
    operation.localOperationOrder !== proposal.operation.order ||
    operation.seamIds.some((id, index) => id !== proposal.operation.seamIds[index])
  )
    fail(
      'selected-operation-binding-mismatch',
      'current.selectedOperation',
      'Selected operation differs.',
    );
  if (!SHA256.test(current.assemblyTopologySha256))
    fail(
      'assembly-topology-binding-mismatch',
      'current.assemblyTopologySha256',
      'Topology SHA invalid.',
    );
}

function verifyChoicesCrossBindings(
  current: PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
  choices: PatternImportDxfProductPhaseEMultiseamChoicesV2,
): void {
  if (
    choices.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
    choices.expectedProposalFingerprint !== proposal.deterministicFingerprint
  )
    fail('aggregate-plan-seal-mismatch', 'choices', 'Choices catalog/proposal binding differs.');
  if (choices.aggregatePlanSeal.canonicalSha256 !== current.phaseEAggregatePlanSha256)
    fail(
      'aggregate-plan-seal-mismatch',
      'current.phaseEAggregatePlanSha256',
      'Current aggregate plan SHA differs from the choices.',
    );
}

function detachBindingRequest(
  input: unknown,
): PatternImportDxfProductPhaseEExactTopologyBindingRequestV1 {
  const root = rootRecord(
    input,
    ['schemaVersion', 'current', 'catalog', 'proposal', 'choices'],
    'request',
  );
  return detachPlain(root, 'request', 0, {
    nodes: 0,
    properties: 0,
    seen: new Set<object>(),
  }) as PatternImportDxfProductPhaseEExactTopologyBindingRequestV1;
}

function detachRestoreRequest(input: unknown): Readonly<{
  request: Omit<PatternImportDxfProductPhaseEExactTopologyRestoreRequestV1, 'bindingOwner'>;
  bindingOwner: unknown;
}> {
  const root = rootRecord(
    input,
    ['schemaVersion', 'bindingOwner', 'current', 'catalog', 'proposal'],
    'request',
  );
  const request = detachPlain(
    {
      schemaVersion: root.schemaVersion,
      current: root.current,
      catalog: root.catalog,
      proposal: root.proposal,
    },
    'request',
    0,
    { nodes: 0, properties: 0, seen: new Set<object>() },
  ) as Omit<PatternImportDxfProductPhaseEExactTopologyRestoreRequestV1, 'bindingOwner'>;
  return { request, bindingOwner: root.bindingOwner };
}

function detachSerializedRestoreRequest(
  input: unknown,
): PatternImportDxfProductPhaseEExactTopologySerializedRestoreRequestV1 {
  const root = rootRecord(
    input,
    ['schemaVersion', 'carrier', 'seal', 'current', 'catalog', 'proposal'],
    'request',
  );
  return detachPlain(root, 'request', 0, {
    nodes: 0,
    properties: 0,
    seen: new Set<object>(),
  }) as PatternImportDxfProductPhaseEExactTopologySerializedRestoreRequestV1;
}

function validateSerializedCarrierSide(
  value: unknown,
  path: string,
): PatternImportDxfProductPhaseEExactTopologySideBindingV1 {
  const side = record(
    value,
    [
      'seamId',
      'sideIndex',
      'pieceLineKey',
      'pieceId',
      'contourId',
      'boundaryVertexIds',
      'direction',
    ],
    path,
  );
  text(side.seamId, `${path}.seamId`, true);
  if (side.sideIndex !== 0 && side.sideIndex !== 1)
    fail('invalid-input', `${path}.sideIndex`, 'Expected exact side index zero or one.');
  text(side.pieceLineKey, `${path}.pieceLineKey`, true);
  text(side.pieceId, `${path}.pieceId`, true);
  text(side.contourId, `${path}.contourId`, true);
  const ids = array(side.boundaryVertexIds, 2, `${path}.boundaryVertexIds`);
  text(ids[0], `${path}.boundaryVertexIds[0]`, true);
  text(ids[1], `${path}.boundaryVertexIds[1]`, true);
  if (ids[0] === ids[1])
    fail(
      'topology-choice-mismatch',
      `${path}.boundaryVertexIds`,
      'Stored boundary vertices must be distinct.',
    );
  if (side.direction !== 'forward' && side.direction !== 'reverse')
    fail('invalid-input', `${path}.direction`, 'Expected an exact topology direction.');
  return side as unknown as PatternImportDxfProductPhaseEExactTopologySideBindingV1;
}

function validateSerializedCarrier(
  value: unknown,
  path: string,
): PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1 {
  const carrier = record(value, ['schemaVersion', 'status', 'bindings', 'sides', 'claims'], path);
  if (
    carrier.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1 ||
    carrier.status !== 'exact-phase-e-topology-authoring-binding'
  )
    fail(
      'invalid-input',
      path,
      'Serialized exact topology carrier schema or status is unsupported.',
    );
  validateCurrent(carrier.bindings, `${path}.bindings`);
  array(carrier.sides, 4, `${path}.sides`).forEach((side, index) =>
    validateSerializedCarrierSide(side, `${path}.sides[${index}]`),
  );
  if (!same(carrier.claims, PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_CLAIMS_V1))
    fail('invalid-input', `${path}.claims`, 'Serialized exact topology carrier claims differ.');
  return carrier as unknown as PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1;
}

function validateSerializedSeal(
  value: unknown,
  path: string,
): PatternImportDxfProductPhaseEExactTopologyBindingSealV1 {
  const seal = record(
    value,
    [
      'schemaVersion',
      'algorithm',
      'canonicalSha256',
      'canonicalByteLength',
      'authority',
      'persistenceIntegrated',
      'productionReady',
    ],
    path,
  );
  if (
    seal.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1 ||
    seal.algorithm !== 'SHA-256' ||
    seal.authority !== 'unsigned-exact-authoring-subdocument-consistency-only' ||
    seal.persistenceIntegrated !== false ||
    seal.productionReady !== false
  )
    fail('binding-seal-mismatch', path, 'Serialized exact topology seal metadata differs.');
  sha(seal.canonicalSha256, `${path}.canonicalSha256`);
  const byteLength = integer(seal.canonicalByteLength, 1, `${path}.canonicalByteLength`);
  if (byteLength > MAX_CANONICAL_BYTES)
    fail(
      'bounds-exceeded',
      `${path}.canonicalByteLength`,
      'Carrier byte length exceeds the bound.',
    );
  return seal as unknown as PatternImportDxfProductPhaseEExactTopologyBindingSealV1;
}

function validateCarrierSideAgainstContext(
  side: PatternImportDxfProductPhaseEExactTopologySideBindingV1,
  expectedSeamIndex: number,
  expectedSideIndex: 0 | 1,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
): void {
  const proposedSeam = proposal.seams[expectedSeamIndex];
  const proposedSide = proposedSeam.sides[expectedSideIndex];
  if (
    side.seamId !== proposedSeam.id ||
    side.sideIndex !== expectedSideIndex ||
    side.pieceId !== proposedSide.pieceId ||
    side.pieceLineKey !== proposedSide.pieceLineKey ||
    side.direction !== proposedSide.requiredDirection
  )
    fail(
      'proposal-binding-mismatch',
      'carrier.sides',
      'Stored side differs from current proposal.',
    );
  const contour = catalogSide(catalog, side.pieceId, side.pieceLineKey, side.contourId);
  if (!contour || !directedArc(contour, side.boundaryVertexIds, side.direction))
    fail(
      'catalog-binding-mismatch',
      'carrier.sides',
      'Stored side is absent from current catalog.',
    );
}

async function restoreVerifiedCarrierPatch(
  carrier: PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1,
  seal: PatternImportDxfProductPhaseEExactTopologyBindingSealV1,
  current: PatternImportDxfProductPhaseEExactTopologyCurrentBindingsV1,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
  digest: Digest,
): Promise<PatternImportDxfProductPhaseEExactTopologyPrefillPatchV1> {
  validateContextCrossBindings(current, catalog, proposal);
  await verifyKat(digest);
  await verifyCatalog(catalog, digest);
  const recomputedSeal = await hash(
    'pattern-import-dxf-product-phase-e-exact-topology-binding-v1',
    carrier,
    digest,
  );
  if (
    recomputedSeal.sha256 !== seal.canonicalSha256 ||
    recomputedSeal.byteLength !== seal.canonicalByteLength
  )
    fail('binding-seal-mismatch', 'carrier.seal', 'Binding carrier seal did not recompute.');
  if (!same(current.row, carrier.bindings.row))
    fail('saved-row-binding-mismatch', 'request.current.row', 'Current saved row drifted.');
  if (current.serverAssemblyRevision !== carrier.bindings.serverAssemblyRevision)
    fail(
      'server-assembly-revision-binding-mismatch',
      'request.current.serverAssemblyRevision',
      'Current server Assembly revision drifted.',
    );
  if (current.assemblyTopologySha256 !== carrier.bindings.assemblyTopologySha256)
    fail(
      'assembly-topology-binding-mismatch',
      'request.current.assemblyTopologySha256',
      'Current assembly topology drifted.',
    );
  if (!same(current.selectedOperation, carrier.bindings.selectedOperation))
    fail(
      'selected-operation-binding-mismatch',
      'request.current.selectedOperation',
      'Current selected operation drifted.',
    );
  if (current.catalogCanonicalSha256 !== carrier.bindings.catalogCanonicalSha256)
    fail('catalog-binding-mismatch', 'request.current.catalogCanonicalSha256', 'Catalog drifted.');
  if (current.proposalFingerprint !== carrier.bindings.proposalFingerprint)
    fail('proposal-binding-mismatch', 'request.current.proposalFingerprint', 'Proposal drifted.');
  if (current.phaseEAggregatePlanSha256 !== carrier.bindings.phaseEAggregatePlanSha256)
    fail(
      'aggregate-plan-seal-mismatch',
      'request.current.phaseEAggregatePlanSha256',
      'Aggregate Phase-E plan drifted.',
    );
  const physicalEdges = new Set<string>();
  carrier.sides.forEach((side, index) => {
    validateCarrierSideAgainstContext(
      side,
      Math.floor(index / 2),
      (index % 2) as 0 | 1,
      catalog,
      proposal,
    );
    const undirected = [...side.boundaryVertexIds].sort();
    const edge = `${side.pieceId}\0${side.contourId}\0${undirected[0]}\0${undirected[1]}`;
    if (physicalEdges.has(edge))
      fail(
        'topology-choice-mismatch',
        `carrier.sides[${index}]`,
        'Two stored sides reuse one physical boundary edge.',
      );
    physicalEdges.add(edge);
  });
  const bySeam = (seamIndex: 0 | 1) => {
    const left = carrier.sides[seamIndex * 2];
    const right = carrier.sides[seamIndex * 2 + 1];
    return {
      seamId: left.seamId,
      sides: [
        {
          sideIndex: left.sideIndex,
          contourId: left.contourId,
          boundaryVertexIds: [...left.boundaryVertexIds] as [string, string],
          direction: left.direction,
        },
        {
          sideIndex: right.sideIndex,
          contourId: right.contourId,
          boundaryVertexIds: [...right.boundaryVertexIds] as [string, string],
          direction: right.direction,
        },
      ] as const,
    };
  };
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_PREFILL_PATCH_V1,
    seams: [bySeam(0), bySeam(1)] as const,
  } satisfies PatternImportDxfProductPhaseEExactTopologyPrefillPatchV1);
}

const bindingOwners = new WeakMap<object, BindingOwnerRecord>();
const prefillOwners = new WeakSet<object>();

export async function buildPatternImportDxfProductPhaseEExactTopologyBindingV1(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<PatternImportDxfProductPhaseEExactTopologyBindingResultV1> {
  try {
    const digest = captureDigest(captureCryptoOption(options) ?? platformCrypto);
    const request = detachBindingRequest(input);
    if (
      request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1
    )
      fail(
        'invalid-input',
        'request.schemaVersion',
        'Exact topology request schema is unsupported.',
      );
    const current = validateCurrent(request.current, 'request.current');
    const catalog = validateCatalogShape(request.catalog, 'request.catalog');
    const proposal = validateProposalShape(request.proposal, 'request.proposal');
    validateContextCrossBindings(current, catalog, proposal);
    const validatedChoices = validateChoicesShape(
      request.choices,
      'request.choices',
      catalog,
      proposal,
    );
    verifyChoicesCrossBindings(current, catalog, proposal, validatedChoices.choices);
    await verifyKat(digest);
    await verifyCatalog(catalog, digest);
    await verifyChoicesSeal(validatedChoices.choices, digest);
    const carrier = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1,
      status: 'exact-phase-e-topology-authoring-binding' as const,
      bindings: current,
      sides: validatedChoices.sides,
      claims: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_CLAIMS_V1,
    } satisfies PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1);
    const carrierDigest = await hash(
      'pattern-import-dxf-product-phase-e-exact-topology-binding-v1',
      carrier,
      digest,
    );
    const seal = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1,
      algorithm: 'SHA-256' as const,
      canonicalSha256: carrierDigest.sha256,
      canonicalByteLength: carrierDigest.byteLength,
      authority: 'unsigned-exact-authoring-subdocument-consistency-only' as const,
      persistenceIntegrated: false as const,
      productionReady: false as const,
    } satisfies PatternImportDxfProductPhaseEExactTopologyBindingSealV1);
    const owner = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_OWNER_V1,
      carrier,
      seal,
      claims: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_CLAIMS_V1,
    }) as unknown as PatternImportDxfProductPhaseEExactTopologyBindingOwnerV1;
    bindingOwners.set(owner, { carrier, seal });
    return Object.freeze({
      ok: true as const,
      owner,
      carrier,
      seal,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_CLAIMS_V1,
    });
  } catch (error) {
    return blockedBinding(error);
  }
}

export async function restorePatternImportDxfProductPhaseEExactTopologyPrefillV1(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<PatternImportDxfProductPhaseEExactTopologyRestoreResultV1> {
  try {
    const digest = captureDigest(captureCryptoOption(options) ?? platformCrypto);
    const { request, bindingOwner } = detachRestoreRequest(input);
    if (
      request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_REQUEST_V1
    )
      fail(
        'invalid-input',
        'request.schemaVersion',
        'Exact topology restore schema is unsupported.',
      );
    if (!bindingOwner || (typeof bindingOwner !== 'object' && typeof bindingOwner !== 'function'))
      fail(
        'binding-owner-unavailable',
        'request.bindingOwner',
        'A live genuine binding owner is required.',
      );
    const owned = bindingOwners.get(bindingOwner);
    if (!owned)
      fail(
        'binding-owner-unavailable',
        'request.bindingOwner',
        'Missing, legacy, copied, forged, or disposed binding owners are not accepted.',
      );
    const current = validateCurrent(request.current, 'request.current');
    const catalog = validateCatalogShape(request.catalog, 'request.catalog');
    const proposal = validateProposalShape(request.proposal, 'request.proposal');
    const patch = await restoreVerifiedCarrierPatch(
      owned.carrier,
      owned.seal,
      current,
      catalog,
      proposal,
      digest,
    );
    if (bindingOwners.get(bindingOwner) !== owned)
      fail(
        'binding-owner-unavailable',
        'request.bindingOwner',
        'The binding owner was disposed while the restore was pending.',
      );
    const owner = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_PREFILL_OWNER_V1,
      patch,
      claims: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_CLAIMS_V1,
    }) as unknown as PatternImportDxfProductPhaseEExactTopologyPrefillOwnerV1;
    prefillOwners.add(owner);
    return Object.freeze({
      ok: true as const,
      owner,
      patch,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_RESTORE_CLAIMS_V1,
    });
  } catch (error) {
    return blockedRestore(error);
  }
}

export async function restorePatternImportDxfProductPhaseEExactTopologySerializedPrefillV1(
  input: unknown,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<PatternImportDxfProductPhaseEExactTopologySerializedRestoreResultV1> {
  try {
    const digest = captureDigest(captureCryptoOption(options) ?? platformCrypto);
    const request = detachSerializedRestoreRequest(input);
    if (
      request.schemaVersion !==
      PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_REQUEST_V1
    )
      fail(
        'invalid-input',
        'request.schemaVersion',
        'Serialized exact topology restore schema is unsupported.',
      );
    const carrier = validateSerializedCarrier(request.carrier, 'request.carrier');
    const seal = validateSerializedSeal(request.seal, 'request.seal');
    const current = validateCurrent(request.current, 'request.current');
    const catalog = validateCatalogShape(request.catalog, 'request.catalog');
    const proposal = validateProposalShape(request.proposal, 'request.proposal');
    const patch = await restoreVerifiedCarrierPatch(
      carrier,
      seal,
      current,
      catalog,
      proposal,
      digest,
    );
    return Object.freeze({
      ok: true as const,
      patch,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_SERIALIZED_RESTORE_CLAIMS_V1,
    });
  } catch (error) {
    return blockedSerializedRestore(error);
  }
}

export function isPatternImportDxfProductPhaseEExactTopologyBindingOwnerV1(
  owner: unknown,
): owner is PatternImportDxfProductPhaseEExactTopologyBindingOwnerV1 {
  return (
    !!owner &&
    (typeof owner === 'object' || typeof owner === 'function') &&
    bindingOwners.has(owner)
  );
}

export function disposePatternImportDxfProductPhaseEExactTopologyBindingOwnerV1(
  owner: unknown,
): boolean {
  return (
    !!owner &&
    (typeof owner === 'object' || typeof owner === 'function') &&
    bindingOwners.delete(owner)
  );
}

export function isPatternImportDxfProductPhaseEExactTopologyPrefillOwnerV1(
  owner: unknown,
): owner is PatternImportDxfProductPhaseEExactTopologyPrefillOwnerV1 {
  return (
    !!owner &&
    (typeof owner === 'object' || typeof owner === 'function') &&
    prefillOwners.has(owner)
  );
}

export function disposePatternImportDxfProductPhaseEExactTopologyPrefillOwnerV1(
  owner: unknown,
): boolean {
  return (
    !!owner &&
    (typeof owner === 'object' || typeof owner === 'function') &&
    prefillOwners.delete(owner)
  );
}
