import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { AssemblyContext } from 'lib/pattern-import/types';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1,
  type PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1,
  type PatternImportDxfProductPhaseEExactTopologyBindingSealV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';

import {
  adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2,
  type PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterResultV2,
} from '../phase-e-workbench-existing-assembly-multiseam-adapter-v2';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SERVER_TRANSACTIONAL_SAVED_ASSEMBLY_V1,
  type PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1,
} from './saved-row-preparation-owner-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TOPOLOGY_HASH_CONTRACT_V1,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1,
  type PatternImportDxfPhaseESavedAssemblyTopologyHashContractV1,
} from './saved-assembly-topology-hash-v1';

export {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TOPOLOGY_HASH_CONTRACT_V1,
  type PatternImportDxfPhaseESavedAssemblyTopologyHashContractV1,
} from './saved-assembly-topology-hash-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1 =
  'pattern-import-dxf-phase-e-saved-assembly-transport-request/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1 =
  'pattern-import-dxf-phase-e-saved-assembly-transport-response/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_CONTRACT_V1 =
  'pattern-import-dxf-phase-e-saved-assembly-composite-codec-contract/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_RESULT_V1 =
  'pattern-import-dxf-phase-e-saved-assembly-composite-codec-result/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_AUTHORITY_TRANSPORT_ADAPTER_V1 =
  'pattern-import-dxf-phase-e-saved-assembly-authority-transport-adapter/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_CURRENT_TOPOLOGY_V1 =
  'pattern-import-dxf-phase-e-saved-assembly-current-topology/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const PROPOSAL_FINGERPRINT = /^pidpemsv2-fnv1a64:[0-9a-f]{16}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_ROW_STABLE_ID_LENGTH = 256;
const MAX_URL_LENGTH = 4_096;
const MAX_TEXT_BYTES = 4_096;
const MAX_DETACH_STRING_BYTES = 16 * 1_024;
const MAX_SERVER_ASSEMBLY_REVISION_BYTES = 512;
const MAX_COMPOSITE_SIDECAR_BYTES = 24 * 1_024 * 1_024;
const MAX_DEPTH = 24;
const MAX_NODES = 25_000;
const MAX_PROPERTIES = 100_000;
const MAX_ARRAY_LENGTH = 4_096;
const encoder = new TextEncoder();
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
)?.get;
const typedArraySet = Uint8Array.prototype.set;
const abortSignalAbortedGetter =
  typeof AbortSignal === 'function'
    ? Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get
    : undefined;

type SuccessfulAdapter = Extract<
  PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterResultV2,
  { ok: true }
>;

export type PatternImportDxfPhaseESavedAssemblyTransportRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1;
  techCardId: number;
  scopeKey: string;
  patternLineKey: string;
  /** Maps to proto expected_saved_row_revision; it is not human pattern.version. */
  expectedSavedRowRevision: number;
  expectedCardLockVersion: number;
  expectedUrl: string;
  expectedSizeBytes: number;
  expectedSha256: string;
  selectedOperationNumber: number;
}>;

export type PatternImportDxfPhaseESavedAssemblyTransportOperationV1 = Readonly<{
  operationNumber: number;
  work: string;
  inputKeys: readonly string[];
  outputUnitKey: string;
  outputUnitName: string;
  seamKeys: readonly string[];
}>;

export type PatternImportDxfPhaseESavedAssemblyTransportAnchorV1 = Readonly<{
  pieceLineKey: string;
  edgeHint: string;
  rangeFrom: number;
  rangeTo: number;
  lenMm: number;
  contourSig: string;
  samples: readonly Readonly<{ u: number; v: number }>[];
  layer?: 'under' | 'over';
}>;

export type PatternImportDxfPhaseESavedAssemblyTransportSeamV1 = Readonly<{
  seamKey: string;
  status: 'confirmed' | 'rejected';
  stale: boolean;
  kind: 'edge' | 'partial' | 'composite' | 'surface' | 'closure';
  direction: 'reversed' | 'same' | 'unknown';
  source: 'graph' | 'doll' | 'order' | 'manual' | 'ai';
  anchoredSize: string;
  sideA: readonly PatternImportDxfPhaseESavedAssemblyTransportAnchorV1[];
  sideB: readonly PatternImportDxfPhaseESavedAssemblyTransportAnchorV1[];
}>;

export type PatternImportDxfPhaseESavedAssemblySidecarEnvelopeV1 =
  | Readonly<{
      status: 'composite-v3';
      mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3;
      sha256: string;
      byteLength: number;
      /** Raw persisted Composite V3 bytes. No server-decoded carrier summary is trusted. */
      bytes: Uint8Array;
      /** Audit/download location only; the adapter never fetches or infers authority from it. */
      downloadUrl: string | null;
    }>
  | Readonly<{ status: 'legacy'; mediaType: string }>
  | Readonly<{ status: 'absent' }>;

export type PatternImportDxfPhaseESavedAssemblyTransportResponseV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1;
  row: DxfProductSavedRowIdentityV1;
  serverAssemblyRevision: string;
  serverTopologySha256: string;
  selectedOperationNumber: number;
  operations: readonly PatternImportDxfPhaseESavedAssemblyTransportOperationV1[];
  selectedSeams: readonly PatternImportDxfPhaseESavedAssemblyTransportSeamV1[];
  /** Optional on the wire. This adapter fails closed unless it carries the exact binding. */
  sidecar?: PatternImportDxfPhaseESavedAssemblySidecarEnvelopeV1 | null;
}>;

export type PatternImportDxfPhaseESavedAssemblyCompositeCodecResultV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_RESULT_V1;
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3;
  compositeCanonicalSha256: string;
  compositeCanonicalByteLength: number;
  row: DxfProductSavedRowIdentityV1;
  serverAssemblyRevision: string;
  assemblyTopologySha256: string;
  selectedOperation: Readonly<{
    sourceOperationNumber: number;
    seamIds: readonly [string, string];
  }>;
  exactTopology: Readonly<{
    carrier: PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1;
    seal: PatternImportDxfProductPhaseEExactTopologyBindingSealV1;
  }>;
  exactTopologyCarrierVerified: true;
}>;

export type PatternImportDxfPhaseESavedAssemblyCompositeCodecContractV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_CONTRACT_V1;
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3;
  /**
   * A production bridge must hash and decode the raw Composite V3 bytes and verify its exact
   * topology component/seal. Returning a transport-provided summary does not satisfy this API.
   */
  decodeAndVerifyExactTopology: (
    input: Readonly<{
      mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3;
      expectedSha256: string;
      expectedByteLength: number;
      bytes: Uint8Array;
    }>,
    signal: AbortSignal,
  ) => Promise<unknown>;
}>;

export type PatternImportDxfPhaseESavedAssemblyAuthorityTransportHostV1 = Readonly<{
  readSavedAssemblySnapshot: (
    request: PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
    signal: AbortSignal,
  ) => Promise<unknown>;
  topologyHashContract: PatternImportDxfPhaseESavedAssemblyTopologyHashContractV1;
  compositeCodecContract: PatternImportDxfPhaseESavedAssemblyCompositeCodecContractV1;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_AUTHORITY_TRANSPORT_CLAIMS_V1 =
  Object.freeze({
    exactlyOneInjectedTransportCall: true,
    exactSavedRowEightFieldsRequested: true,
    exactSavedRowEightFieldsRevalidated: true,
    allPersistedOperationsProjected: true,
    exactlyTwoSelectedExactSeamsRequired: true,
    secondSeamOwnerRejected: true,
    rawCompositeV3Required: true,
    rawCompositeV3CodecVerified: true,
    verifiedSerializedCarrierAndSealReturned: true,
    serverDecodedCarrierSummaryTrusted: false,
    legacyOrAbsentCompositeAccepted: false,
    transactionalTopologyReadAvailable: true,
    topologyReadAcceptsLegacyOrAbsentComposite: true,
    topologyReadDecodesExactCarrier: false,
    versionedTopologyHashContractInjected: true,
    serverTopologySha256Verified: true,
    rawSidecarBytesReturned: false,
    rawSidecarBytesRetained: false,
    getTechCardFallbackUsed: false,
    upsertFallbackUsed: false,
    updateTechCardFallbackUsed: false,
    generatedRpcIntegrated: false,
    persistenceIntegrated: false,
    uiIntegrated: false,
    productionReady: false,
  } as const);

export type PatternImportDxfPhaseESavedAssemblyAuthorityTransportErrorCodeV1 =
  | 'invalid-adapter-host'
  | 'invalid-request'
  | 'cancelled'
  | 'transport-failed'
  | 'invalid-response'
  | 'saved-row-mismatch'
  | 'selected-operation-mismatch'
  | 'assembly-topology-invalid'
  | 'exact-carrier-unavailable'
  | 'exact-carrier-mismatch'
  | 'sidecar-codec-failed'
  | 'topology-hash-failed'
  | 'topology-hash-mismatch';

export const PATTERN_IMPORT_DXF_PHASE_E_LEGACY_EXACT_RECONFIRM_DETAIL_V1 =
  'This saved card retains its Assembly seam links, but no sealed exact contour and ordered boundary-vertex identities. Open this operation from a fresh DXF session and confirm all four sides once to upgrade it to Composite V3.' as const;

export class PatternImportDxfPhaseESavedAssemblyAuthorityTransportErrorV1 extends Error {
  constructor(
    readonly code: PatternImportDxfPhaseESavedAssemblyAuthorityTransportErrorCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'PatternImportDxfPhaseESavedAssemblyAuthorityTransportErrorV1';
  }
}

export type PatternImportDxfPhaseESavedAssemblyCurrentTopologyV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_CURRENT_TOPOLOGY_V1;
  origin: 'server-transactional-saved-assembly-topology';
  row: DxfProductSavedRowIdentityV1;
  serverAssemblyRevision: string;
  assemblyTopologySha256: string;
  selectedOperationNumber: number;
  /** Full normalized persisted operation list plus the selected two exact seam rows. */
  assembly: AssemblyContext;
  /** The existing Assembly Order projection admitted by the same bounded V2 adapter as restore. */
  topology: SuccessfulAdapter['existingAssembly'];
}>;

export type PatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_AUTHORITY_TRANSPORT_ADAPTER_V1;
  /**
   * Reads and verifies current saved-row + Assembly topology without requiring a previously
   * persisted exact carrier. This is the authority boundary for the first Composite V3 write.
   */
  readCurrentAssemblyTopology: (
    expected: Readonly<{
      row: DxfProductSavedRowIdentityV1;
      selectedOperationNumber: number;
    }>,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseESavedAssemblyCurrentTopologyV1>;
  readAuthoritativeAssembly: (
    expected: Readonly<{
      row: DxfProductSavedRowIdentityV1;
      selectedOperationNumber: number;
    }>,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_AUTHORITY_TRANSPORT_CLAIMS_V1;
}>;

function fail(
  code: PatternImportDxfPhaseESavedAssemblyAuthorityTransportErrorCodeV1,
  message: string,
): never {
  throw new PatternImportDxfPhaseESavedAssemblyAuthorityTransportErrorV1(code, message);
}

type DetachState = { nodes: number; properties: number; seen: Set<object> };

function detachPlain(
  candidate: unknown,
  path = 'value',
  depth = 0,
  state: DetachState = { nodes: 0, properties: 0, seen: new Set<object>() },
): unknown {
  if (candidate === null || typeof candidate === 'boolean') return candidate;
  if (typeof candidate === 'number') {
    if (!Number.isFinite(candidate) || Object.is(candidate, -0))
      fail('invalid-response', `${path} contains an invalid number.`);
    return candidate;
  }
  if (typeof candidate === 'string') {
    if (
      candidate.length > MAX_DETACH_STRING_BYTES ||
      encoder.encode(candidate).byteLength > MAX_DETACH_STRING_BYTES
    )
      fail('invalid-response', `${path} exceeds the string bound.`);
    return candidate;
  }
  if (!candidate || typeof candidate !== 'object')
    fail('invalid-response', `${path} is outside the plain-data domain.`);
  if (ArrayBuffer.isView(candidate)) {
    if (state.seen.has(candidate)) fail('invalid-response', `${path} contains an alias or cycle.`);
    state.seen.add(candidate);
    state.nodes += 1;
    if (state.nodes > MAX_NODES) fail('invalid-response', `${path} exceeds the node bound.`);
    if (!typedArrayByteLengthGetter || Object.getPrototypeOf(candidate) !== Uint8Array.prototype)
      fail('invalid-response', `${path} is not a supported byte view.`);
    let byteLength: number;
    try {
      byteLength = Reflect.apply(typedArrayByteLengthGetter, candidate, []) as number;
    } catch {
      fail('invalid-response', `${path} is not a genuine byte view.`);
    }
    if (byteLength < 1 || byteLength > MAX_COMPOSITE_SIDECAR_BYTES)
      fail('invalid-response', `${path} exceeds the byte bound.`);
    try {
      const output = new Uint8Array(byteLength);
      Reflect.apply(typedArraySet, output, [candidate]);
      return output;
    } catch {
      fail('invalid-response', `${path} could not be detached.`);
    }
  }
  if (depth > MAX_DEPTH) fail('invalid-response', `${path} exceeds the depth bound.`);
  if (state.seen.has(candidate)) fail('invalid-response', `${path} contains an alias or cycle.`);
  state.seen.add(candidate);
  state.nodes += 1;
  if (state.nodes > MAX_NODES) fail('invalid-response', `${path} exceeds the node bound.`);

  const array = Array.isArray(candidate);
  let capturedLength: number | null = null;
  try {
    if (array) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, 'length');
      if (!descriptor || !('value' in descriptor)) throw new TypeError();
      capturedLength = descriptor.value as number;
      if (
        !Number.isSafeInteger(capturedLength) ||
        capturedLength < 0 ||
        capturedLength > MAX_ARRAY_LENGTH
      )
        throw new TypeError();
    }
    const prototype = Object.getPrototypeOf(candidate);
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const keys = Reflect.ownKeys(descriptors);
    if (
      (array && prototype !== Array.prototype) ||
      (!array && prototype !== Object.prototype && prototype !== null) ||
      keys.some((key) => typeof key === 'symbol')
    )
      throw new TypeError();

    if (array) {
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : -1;
      if (length !== capturedLength || keys.length !== length + 1) throw new TypeError();
      const output: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
          throw new TypeError();
        output.push(detachPlain(descriptor.value, `${path}[${index}]`, depth + 1, state));
      }
      state.properties += length;
      if (state.properties > MAX_PROPERTIES) throw new TypeError();
      return output;
    }

    const output = Object.create(null) as Record<string, unknown>;
    const stringKeys = keys as string[];
    state.properties += stringKeys.length;
    if (state.properties > MAX_PROPERTIES) throw new TypeError();
    for (const key of stringKeys) {
      if (key.length > MAX_TEXT_BYTES || encoder.encode(key).byteLength > MAX_TEXT_BYTES)
        throw new TypeError();
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new TypeError();
      Object.defineProperty(output, key, {
        value: detachPlain(descriptor.value, `${path}.${key}`, depth + 1, state),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return output;
  } catch (error) {
    if (error instanceof PatternImportDxfPhaseESavedAssemblyAuthorityTransportErrorV1) throw error;
    fail('invalid-response', `${path} is not a stable plain-data graph.`);
  }
}

function dataRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
  path = 'value',
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-response', `${path} must be a record.`);
  const actual = Object.keys(value).sort();
  const allowed = [...required, ...optional].sort();
  if (
    required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) ||
    actual.some((key) => !allowed.includes(key))
  )
    fail('invalid-response', `${path} has missing or unexpected fields.`);
  return value as Record<string, unknown>;
}

function deepFreezePlain<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreezePlain(child, seen));
  return Object.freeze(value);
}

function boundedText(value: unknown, path: string, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > MAX_TEXT_BYTES ||
    encoder.encode(value).byteLength > MAX_TEXT_BYTES
  )
    fail('invalid-response', `${path} must be a bounded string.`);
  return value;
}

function stableId(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ROW_STABLE_ID_LENGTH ||
    !STABLE_ID.test(value)
  )
    fail('invalid-response', `${path} must be a stable identifier.`);
  return value;
}

function safeInteger(value: unknown, minimum: number, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    fail('invalid-response', `${path} must be a safe integer >= ${minimum}.`);
  return value as number;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0))
    fail('invalid-response', `${path} must be a finite non-negative-zero number.`);
  return value;
}

function sha256(value: unknown, path: string): string {
  if (typeof value !== 'string' || !SHA256.test(value))
    fail('invalid-response', `${path} must be a lowercase SHA-256 digest.`);
  return value;
}

function serverRevision(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_SERVER_ASSEMBLY_REVISION_BYTES ||
    encoder.encode(value).byteLength > MAX_SERVER_ASSEMBLY_REVISION_BYTES
  )
    fail('invalid-response', `${path} must be an opaque token within 512 UTF-8 bytes.`);
  const revision = value;
  if (revision.trim() !== revision || /^[0-9]+$/.test(revision))
    fail('invalid-response', `${path} must be a distinct opaque non-decimal token.`);
  for (let index = 0; index < revision.length; index += 1) {
    const code = revision.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f)
      fail('invalid-response', `${path} contains a control character.`);
  }
  return revision;
}

function savedUrl(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value || value.length > MAX_URL_LENGTH)
    fail('invalid-response', `${path} must be a saved-row URL within 4096 characters.`);
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) <= 0x1f)
      fail('invalid-response', `${path} contains a control character.`);
  const lower = value.trimStart().toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('javascript:'))
    fail('invalid-response', `${path} uses a forbidden scheme.`);
  return value;
}

function validateRow(value: unknown, path: string): DxfProductSavedRowIdentityV1 {
  const row = dataRecord(
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
    [],
    path,
  );
  return Object.freeze({
    techCardId: safeInteger(row.techCardId, 1, `${path}.techCardId`),
    scopeKey: stableId(row.scopeKey, `${path}.scopeKey`),
    patternLineKey: stableId(row.patternLineKey, `${path}.patternLineKey`),
    revision: safeInteger(row.revision, 0, `${path}.revision`),
    cardLockVersion: safeInteger(row.cardLockVersion, 0, `${path}.cardLockVersion`),
    url: savedUrl(row.url, `${path}.url`),
    sizeBytes: safeInteger(row.sizeBytes, 1, `${path}.sizeBytes`),
    sha256: sha256(row.sha256, `${path}.sha256`),
  });
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1): boolean {
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

function stringArray(value: unknown, path: string, allowEmpty = true): readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0))
    fail('invalid-response', `${path} must be an array.`);
  return Object.freeze(value.map((entry, index) => boundedText(entry, `${path}[${index}]`)));
}

function validateOperation(
  value: unknown,
  path: string,
): PatternImportDxfPhaseESavedAssemblyTransportOperationV1 {
  const operation = dataRecord(
    value,
    ['operationNumber', 'work', 'inputKeys', 'outputUnitKey', 'outputUnitName', 'seamKeys'],
    [],
    path,
  );
  return Object.freeze({
    operationNumber: safeInteger(operation.operationNumber, 0, `${path}.operationNumber`),
    work: boundedText(operation.work, `${path}.work`, true),
    inputKeys: stringArray(operation.inputKeys, `${path}.inputKeys`),
    outputUnitKey: boundedText(operation.outputUnitKey, `${path}.outputUnitKey`, true),
    outputUnitName: boundedText(operation.outputUnitName, `${path}.outputUnitName`, true),
    seamKeys: stringArray(operation.seamKeys, `${path}.seamKeys`),
  });
}

function validateAnchor(
  value: unknown,
  path: string,
): PatternImportDxfPhaseESavedAssemblyTransportAnchorV1 {
  const anchor = dataRecord(
    value,
    ['pieceLineKey', 'edgeHint', 'rangeFrom', 'rangeTo', 'lenMm', 'contourSig', 'samples'],
    ['layer'],
    path,
  );
  const rangeFrom = finite(anchor.rangeFrom, `${path}.rangeFrom`);
  const rangeTo = finite(anchor.rangeTo, `${path}.rangeTo`);
  if (
    rangeFrom < 0 ||
    rangeFrom > 1 ||
    rangeTo < 0 ||
    rangeTo > 1 ||
    !((rangeFrom === 0 && rangeTo === 0) || rangeFrom < rangeTo)
  )
    fail('assembly-topology-invalid', `${path} has an invalid sewn range.`);
  const lenMm = finite(anchor.lenMm, `${path}.lenMm`);
  if (lenMm <= 0) fail('assembly-topology-invalid', `${path}.lenMm must be positive.`);
  if (!Array.isArray(anchor.samples) || anchor.samples.length !== 5)
    fail('assembly-topology-invalid', `${path}.samples must contain the exact five stored points.`);
  const samples = anchor.samples.map((entry, index) => {
    const sample = dataRecord(entry, ['u', 'v'], [], `${path}.samples[${index}]`);
    const u = finite(sample.u, `${path}.samples[${index}].u`);
    const v = finite(sample.v, `${path}.samples[${index}].v`);
    if (u < 0 || u > 1 || v < 0 || v > 1)
      fail('assembly-topology-invalid', `${path}.samples[${index}] is outside [0, 1].`);
    return Object.freeze({ u, v });
  });
  const layer = anchor.layer;
  if (layer !== undefined && layer !== 'under' && layer !== 'over')
    fail('assembly-topology-invalid', `${path}.layer is unsupported.`);
  return Object.freeze({
    pieceLineKey: stableId(anchor.pieceLineKey, `${path}.pieceLineKey`),
    edgeHint: boundedText(anchor.edgeHint, `${path}.edgeHint`, true),
    rangeFrom,
    rangeTo,
    lenMm,
    contourSig: boundedText(anchor.contourSig, `${path}.contourSig`, true),
    samples: Object.freeze(samples),
    ...(layer ? { layer } : {}),
  });
}

function validateSeam(
  value: unknown,
  path: string,
): PatternImportDxfPhaseESavedAssemblyTransportSeamV1 {
  const seam = dataRecord(
    value,
    ['seamKey', 'status', 'stale', 'kind', 'direction', 'source', 'anchoredSize', 'sideA', 'sideB'],
    [],
    path,
  );
  if (seam.status !== 'confirmed') fail('assembly-topology-invalid', `${path} is not confirmed.`);
  if (seam.stale !== false) fail('assembly-topology-invalid', `${path} is stale.`);
  if (!['edge', 'partial', 'composite', 'surface', 'closure'].includes(String(seam.kind)))
    fail('assembly-topology-invalid', `${path}.kind is unsupported.`);
  if (seam.direction !== 'reversed' && seam.direction !== 'same')
    fail('assembly-topology-invalid', `${path}.direction must be explicit.`);
  if (!['graph', 'doll', 'order', 'manual', 'ai'].includes(String(seam.source)))
    fail('assembly-topology-invalid', `${path}.source is unsupported.`);
  if (!Array.isArray(seam.sideA) || seam.sideA.length !== 1)
    fail('assembly-topology-invalid', `${path}.sideA must contain one exact anchor.`);
  if (!Array.isArray(seam.sideB) || seam.sideB.length !== 1)
    fail('assembly-topology-invalid', `${path}.sideB must contain one exact anchor.`);
  return Object.freeze({
    seamKey: stableId(seam.seamKey, `${path}.seamKey`),
    status: 'confirmed',
    stale: false,
    kind: seam.kind as PatternImportDxfPhaseESavedAssemblyTransportSeamV1['kind'],
    direction: seam.direction,
    source: seam.source as PatternImportDxfPhaseESavedAssemblyTransportSeamV1['source'],
    anchoredSize: boundedText(seam.anchoredSize, `${path}.anchoredSize`),
    sideA: Object.freeze([validateAnchor(seam.sideA[0], `${path}.sideA[0]`)]),
    sideB: Object.freeze([validateAnchor(seam.sideB[0], `${path}.sideB[0]`)]),
  });
}

type CompositeSidecarSnapshot = Readonly<{
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3;
  sha256: string;
  byteLength: number;
  bytes: Uint8Array;
  downloadUrl: string | null;
}>;

function validateCompositeSidecar(value: unknown): CompositeSidecarSnapshot {
  if (value === undefined || value === null)
    fail('exact-carrier-unavailable', PATTERN_IMPORT_DXF_PHASE_E_LEGACY_EXACT_RECONFIRM_DETAIL_V1);
  const envelope = dataRecord(
    value,
    ['status'],
    ['mediaType', 'sha256', 'byteLength', 'bytes', 'downloadUrl'],
    'response.sidecar',
  );
  if (envelope.status === 'absent') {
    dataRecord(value, ['status'], [], 'response.sidecar');
    fail('exact-carrier-unavailable', PATTERN_IMPORT_DXF_PHASE_E_LEGACY_EXACT_RECONFIRM_DETAIL_V1);
  }
  if (envelope.status === 'legacy') {
    dataRecord(value, ['status', 'mediaType'], [], 'response.sidecar');
    boundedText(envelope.mediaType, 'response.sidecar.mediaType');
    fail('exact-carrier-unavailable', PATTERN_IMPORT_DXF_PHASE_E_LEGACY_EXACT_RECONFIRM_DETAIL_V1);
  }
  if (envelope.status !== 'composite-v3')
    fail('invalid-response', 'response.sidecar has an unsupported status.');
  dataRecord(
    value,
    ['status', 'mediaType', 'sha256', 'byteLength', 'bytes', 'downloadUrl'],
    [],
    'response.sidecar',
  );
  if (envelope.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3)
    fail('exact-carrier-unavailable', PATTERN_IMPORT_DXF_PHASE_E_LEGACY_EXACT_RECONFIRM_DETAIL_V1);
  const digest = sha256(envelope.sha256, 'response.sidecar.sha256');
  const byteLength = safeInteger(envelope.byteLength, 1, 'response.sidecar.byteLength');
  if (byteLength > MAX_COMPOSITE_SIDECAR_BYTES)
    fail('invalid-response', 'response.sidecar.byteLength exceeds the Composite V3 bound.');
  if (!(envelope.bytes instanceof Uint8Array) || envelope.bytes.byteLength !== byteLength)
    fail('invalid-response', 'response.sidecar.bytes does not match its declared byte length.');
  const downloadUrl =
    envelope.downloadUrl === null
      ? null
      : savedUrl(envelope.downloadUrl, 'response.sidecar.downloadUrl');
  return Object.freeze({
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
    sha256: digest,
    byteLength,
    bytes: envelope.bytes,
    downloadUrl,
  });
}

/**
 * The first exact-topology write legitimately starts from no sidecar or a legacy product V1
 * sidecar. Validate those envelopes as stable transport data without promoting either to exact
 * topology authority. A Composite V3 envelope is still fully byte/digest validated here so the
 * exact restore method can consume the same one-call snapshot.
 */
function validateOptionalCompositeSidecar(value: unknown): CompositeSidecarSnapshot | null {
  if (value === undefined || value === null) return null;
  const envelope = dataRecord(
    value,
    ['status'],
    ['mediaType', 'sha256', 'byteLength', 'bytes', 'downloadUrl'],
    'response.sidecar',
  );
  if (envelope.status === 'absent') {
    dataRecord(value, ['status'], [], 'response.sidecar');
    return null;
  }
  if (envelope.status === 'legacy') {
    dataRecord(value, ['status', 'mediaType'], [], 'response.sidecar');
    boundedText(envelope.mediaType, 'response.sidecar.mediaType');
    return null;
  }
  if (envelope.status !== 'composite-v3')
    fail('invalid-response', 'response.sidecar has an unsupported status.');
  return validateCompositeSidecar(value);
}

function validateDecodedComposite(
  value: unknown,
  sidecar: CompositeSidecarSnapshot,
  expectedRow: DxfProductSavedRowIdentityV1,
  serverAssemblyRevision: string,
  serverTopologySha256: string,
  selectedOperationNumber: number,
  selectedSeamKeys: readonly [string, string],
): PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1['exactTopology'] {
  const decoded = dataRecord(
    value,
    [
      'schemaVersion',
      'mediaType',
      'compositeCanonicalSha256',
      'compositeCanonicalByteLength',
      'row',
      'serverAssemblyRevision',
      'assemblyTopologySha256',
      'selectedOperation',
      'exactTopology',
      'exactTopologyCarrierVerified',
    ],
    [],
    'decodedComposite',
  );
  if (
    decoded.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_RESULT_V1 ||
    decoded.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3 ||
    decoded.exactTopologyCarrierVerified !== true
  )
    fail(
      'exact-carrier-unavailable',
      'The Composite V3 exact-topology codec result is unsupported.',
    );
  const decodedRow = validateRow(decoded.row, 'decodedComposite.row');
  const operation = dataRecord(
    decoded.selectedOperation,
    ['sourceOperationNumber', 'seamIds'],
    [],
    'decodedComposite.selectedOperation',
  );
  if (!Array.isArray(operation.seamIds) || operation.seamIds.length !== 2)
    fail('exact-carrier-mismatch', 'The exact topology carrier does not bind two seams.');
  const seamIds = operation.seamIds.map((entry, index) =>
    stableId(entry, `decodedComposite.selectedOperation.seamIds[${index}]`),
  );
  const exactTopology = dataRecord(
    decoded.exactTopology,
    ['carrier', 'seal'],
    [],
    'decodedComposite.exactTopology',
  );
  const carrier = dataRecord(
    exactTopology.carrier,
    ['schemaVersion', 'status', 'bindings', 'sides', 'claims'],
    [],
    'decodedComposite.exactTopology.carrier',
  );
  const bindings = dataRecord(
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
    [],
    'decodedComposite.exactTopology.carrier.bindings',
  );
  const carrierRow = validateRow(
    bindings.row,
    'decodedComposite.exactTopology.carrier.bindings.row',
  );
  const carrierOperation = dataRecord(
    bindings.selectedOperation,
    ['sourceOperationNumber', 'authoringOperationId', 'localOperationOrder', 'seamIds'],
    [],
    'decodedComposite.exactTopology.carrier.bindings.selectedOperation',
  );
  if (!Array.isArray(carrierOperation.seamIds) || carrierOperation.seamIds.length !== 2)
    fail('exact-carrier-mismatch', 'The serialized exact topology carrier must bind two seams.');
  const carrierSeamIds = carrierOperation.seamIds.map((entry, index) =>
    stableId(
      entry,
      `decodedComposite.exactTopology.carrier.bindings.selectedOperation.seamIds[${index}]`,
    ),
  );
  const seal = dataRecord(
    exactTopology.seal,
    [
      'schemaVersion',
      'algorithm',
      'canonicalSha256',
      'canonicalByteLength',
      'authority',
      'persistenceIntegrated',
      'productionReady',
    ],
    [],
    'decodedComposite.exactTopology.seal',
  );
  if (
    decoded.compositeCanonicalSha256 !== sidecar.sha256 ||
    decoded.compositeCanonicalByteLength !== sidecar.byteLength ||
    !sameRow(decodedRow, expectedRow) ||
    decoded.serverAssemblyRevision !== serverAssemblyRevision ||
    decoded.assemblyTopologySha256 !== serverTopologySha256 ||
    operation.sourceOperationNumber !== selectedOperationNumber ||
    seamIds[0] !== selectedSeamKeys[0] ||
    seamIds[1] !== selectedSeamKeys[1] ||
    carrier.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_V1 ||
    carrier.status !== 'exact-phase-e-topology-authoring-binding' ||
    !sameRow(carrierRow, expectedRow) ||
    bindings.serverAssemblyRevision !== serverAssemblyRevision ||
    bindings.assemblyTopologySha256 !== serverTopologySha256 ||
    carrierOperation.sourceOperationNumber !== selectedOperationNumber ||
    carrierOperation.localOperationOrder !== 0 ||
    carrierSeamIds[0] !== selectedSeamKeys[0] ||
    carrierSeamIds[1] !== selectedSeamKeys[1] ||
    seal.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_SEAL_V1 ||
    seal.algorithm !== 'SHA-256' ||
    seal.authority !== 'unsigned-exact-authoring-subdocument-consistency-only' ||
    seal.persistenceIntegrated !== false ||
    seal.productionReady !== false
  )
    fail(
      'exact-carrier-mismatch',
      'The decoded exact topology carrier does not match the snapshot.',
    );
  if (!Array.isArray(carrier.sides) || carrier.sides.length !== 4)
    fail('exact-carrier-mismatch', 'The serialized exact topology carrier must bind four sides.');
  stableId(
    carrierOperation.authoringOperationId,
    'decodedComposite.exactTopology.carrier.bindings.selectedOperation.authoringOperationId',
  );
  sha256(
    bindings.catalogCanonicalSha256,
    'decodedComposite.exactTopology.carrier.bindings.catalogCanonicalSha256',
  );
  sha256(
    bindings.phaseEAggregatePlanSha256,
    'decodedComposite.exactTopology.carrier.bindings.phaseEAggregatePlanSha256',
  );
  if (
    typeof bindings.proposalFingerprint !== 'string' ||
    !PROPOSAL_FINGERPRINT.test(bindings.proposalFingerprint)
  )
    fail('exact-carrier-mismatch', 'The exact topology proposal fingerprint is invalid.');
  sha256(seal.canonicalSha256, 'decodedComposite.exactTopology.seal.canonicalSha256');
  safeInteger(
    seal.canonicalByteLength,
    1,
    'decodedComposite.exactTopology.seal.canonicalByteLength',
  );
  return Object.freeze({
    carrier: deepFreezePlain(
      exactTopology.carrier as PatternImportDxfProductPhaseEExactTopologyBindingCarrierV1,
    ),
    seal: deepFreezePlain(
      exactTopology.seal as PatternImportDxfProductPhaseEExactTopologyBindingSealV1,
    ),
    compositeSha256: sidecar.sha256,
    compositeByteLength: sidecar.byteLength,
  });
}

function normalizeAssembly(
  operations: readonly PatternImportDxfPhaseESavedAssemblyTransportOperationV1[],
  selectedSeams: readonly PatternImportDxfPhaseESavedAssemblyTransportSeamV1[],
  selectedOperationNumber: number,
): Readonly<{ assembly: AssemblyContext; adapted: SuccessfulAdapter }> {
  if (operations.length === 0)
    fail('assembly-topology-invalid', 'The persisted Assembly operation list is empty.');
  const operationNumbers = new Set<number>();
  for (const operation of operations) {
    if (operationNumbers.has(operation.operationNumber))
      fail('assembly-topology-invalid', 'Persisted Assembly operation numbers are not unique.');
    operationNumbers.add(operation.operationNumber);
  }
  const selected = operations.find(
    ({ operationNumber }) => operationNumber === selectedOperationNumber,
  );
  if (!selected)
    fail('assembly-topology-invalid', 'The selected persisted Assembly operation is absent.');
  if (
    selected.seamKeys.length !== 2 ||
    selected.seamKeys[0] === selected.seamKeys[1] ||
    selected.seamKeys.some((key) => !key)
  )
    fail(
      'assembly-topology-invalid',
      'The selected operation must own exactly two distinct seams.',
    );
  if (
    operations.some(
      (operation) =>
        operation !== selected &&
        operation.seamKeys.some((seamKey) => selected.seamKeys.includes(seamKey)),
    )
  )
    fail('assembly-topology-invalid', 'A selected seam is also owned by another operation.');
  if (
    selectedSeams.length !== 2 ||
    selectedSeams[0].seamKey !== selected.seamKeys[0] ||
    selectedSeams[1].seamKey !== selected.seamKeys[1]
  )
    fail(
      'assembly-topology-invalid',
      'The exact seam rows must match the selected operation seam order.',
    );
  const pairs = selectedSeams.map((seam) =>
    [seam.sideA[0].pieceLineKey, seam.sideB[0].pieceLineKey].sort(),
  );
  if (
    pairs.some(([left, right]) => !left || !right || left === right) ||
    pairs[0][0] !== pairs[1][0] ||
    pairs[0][1] !== pairs[1][1] ||
    selectedSeams[0].anchoredSize !== selectedSeams[1].anchoredSize
  )
    fail(
      'assembly-topology-invalid',
      'Both exact seams must bind the same two pieces and anchored size.',
    );

  const assembly = Object.freeze({
    ops: Object.freeze(
      operations.map((operation) =>
        Object.freeze({
          number: operation.operationNumber,
          work: operation.work,
          inputKeys: Object.freeze([...operation.inputKeys]),
          outputUnitKey: operation.outputUnitKey,
          outputUnitName: operation.outputUnitName,
          seamKeys: Object.freeze([...operation.seamKeys]),
        }),
      ),
    ),
    seams: Object.freeze(
      selectedSeams.map((seam) => {
        const copyAnchor = (anchor: PatternImportDxfPhaseESavedAssemblyTransportAnchorV1) =>
          Object.freeze({
            pieceLineKey: anchor.pieceLineKey,
            edgeHint: anchor.edgeHint,
            range: Object.freeze([anchor.rangeFrom, anchor.rangeTo]) as [number, number],
            lenMm: anchor.lenMm,
            contourSig: anchor.contourSig,
            samples: Object.freeze(
              anchor.samples.map(({ u, v }) => Object.freeze([u, v]) as [number, number]),
            ) as [number, number][],
            ...(anchor.layer ? { layer: anchor.layer } : {}),
          });
        const pieces = [seam.sideA[0].pieceLineKey, seam.sideB[0].pieceLineKey];
        return Object.freeze({
          seamKey: seam.seamKey,
          pieces: Object.freeze(pieces),
          confirmed: true,
          stale: false,
          kind: seam.kind,
          direction: seam.direction,
          source: seam.source,
          anchoredSize: seam.anchoredSize,
          sideA: Object.freeze([copyAnchor(seam.sideA[0])]),
          sideB: Object.freeze([copyAnchor(seam.sideB[0])]),
        });
      }),
    ),
  }) as unknown as AssemblyContext;
  const adapted = adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2(
    assembly,
    selectedOperationNumber,
  );
  if (!adapted.ok)
    fail(
      'assembly-topology-invalid',
      `The saved Assembly projection is not admissible: ${adapted.blockers[0].code}.`,
    );
  return Object.freeze({ assembly, adapted });
}

function validateExpected(
  candidate: unknown,
): Readonly<{ row: DxfProductSavedRowIdentityV1; selectedOperationNumber: number }> {
  let detached: unknown;
  try {
    detached = detachPlain(candidate, 'expected');
  } catch (error) {
    if (error instanceof PatternImportDxfPhaseESavedAssemblyAuthorityTransportErrorV1)
      fail('invalid-request', 'The saved Assembly request is not a stable plain-data graph.');
    throw error;
  }
  const expected = dataRecord(detached, ['row', 'selectedOperationNumber'], [], 'expected');
  const row = validateRow(expected.row, 'expected.row');
  return Object.freeze({
    row,
    selectedOperationNumber: safeInteger(
      expected.selectedOperationNumber,
      1,
      'expected.selectedOperationNumber',
    ),
  });
}

function signalAborted(signal: AbortSignal): boolean {
  if (!abortSignalAbortedGetter) fail('invalid-request', 'AbortSignal support is unavailable.');
  try {
    return Reflect.apply(abortSignalAbortedGetter, signal, []) as boolean;
  } catch {
    fail('invalid-request', 'A genuine AbortSignal is required.');
  }
}

function captureRecordDescriptors(
  candidate: unknown,
  exactKeys: readonly string[],
): PropertyDescriptorMap {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
    fail('invalid-adapter-host', 'The saved Assembly adapter host is invalid.');
  try {
    const prototype = Object.getPrototypeOf(candidate);
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const keys = Reflect.ownKeys(descriptors);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      keys.some((entry) => typeof entry !== 'string') ||
      keys.length !== exactKeys.length ||
      exactKeys.some((entry) => !Object.prototype.hasOwnProperty.call(descriptors, entry))
    )
      throw new TypeError();
    for (const key of exactKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new TypeError();
    }
    return descriptors;
  } catch {
    fail(
      'invalid-adapter-host',
      'The saved Assembly adapter host must expose stable data capabilities.',
    );
  }
}

function captureHost(candidate: unknown): Readonly<{
  readSavedAssemblySnapshot: PatternImportDxfPhaseESavedAssemblyAuthorityTransportHostV1['readSavedAssemblySnapshot'];
  computeCanonicalSha256: PatternImportDxfPhaseESavedAssemblyTopologyHashContractV1['computeCanonicalSha256'];
  decodeAndVerifyExactTopology: PatternImportDxfPhaseESavedAssemblyCompositeCodecContractV1['decodeAndVerifyExactTopology'];
}> {
  const hostDescriptors = captureRecordDescriptors(candidate, [
    'readSavedAssemblySnapshot',
    'topologyHashContract',
    'compositeCodecContract',
  ]);
  const readSavedAssemblySnapshot = hostDescriptors.readSavedAssemblySnapshot.value as
    | PatternImportDxfPhaseESavedAssemblyAuthorityTransportHostV1['readSavedAssemblySnapshot']
    | undefined;
  if (typeof readSavedAssemblySnapshot !== 'function')
    fail('invalid-adapter-host', 'A stable saved Assembly transport is required.');
  const contractDescriptor = hostDescriptors.topologyHashContract;
  const contract = contractDescriptor.value;
  const contractDescriptors = captureRecordDescriptors(contract, [
    'schemaVersion',
    'domain',
    'computeCanonicalSha256',
  ]);
  const computeCanonicalSha256 = contractDescriptors.computeCanonicalSha256.value as
    PatternImportDxfPhaseESavedAssemblyTopologyHashContractV1['computeCanonicalSha256'] | undefined;
  if (typeof computeCanonicalSha256 !== 'function')
    fail('invalid-adapter-host', 'A stable topology hash capability is required.');
  if (
    contractDescriptors.schemaVersion.value !==
      PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TOPOLOGY_HASH_CONTRACT_V1 ||
    contractDescriptors.domain.value !==
      PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1
  )
    fail('invalid-adapter-host', 'The topology hash contract version or domain is unsupported.');
  const codecDescriptors = captureRecordDescriptors(hostDescriptors.compositeCodecContract.value, [
    'schemaVersion',
    'mediaType',
    'decodeAndVerifyExactTopology',
  ]);
  const decodeAndVerifyExactTopology = codecDescriptors.decodeAndVerifyExactTopology.value as
    | PatternImportDxfPhaseESavedAssemblyCompositeCodecContractV1['decodeAndVerifyExactTopology']
    | undefined;
  if (
    codecDescriptors.schemaVersion.value !==
      PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_CONTRACT_V1 ||
    codecDescriptors.mediaType.value !==
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3 ||
    typeof decodeAndVerifyExactTopology !== 'function'
  )
    fail('invalid-adapter-host', 'The Composite V3 codec contract is unsupported.');
  return Object.freeze({
    readSavedAssemblySnapshot,
    computeCanonicalSha256,
    decodeAndVerifyExactTopology,
  });
}

export function createPatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1(
  host: PatternImportDxfPhaseESavedAssemblyAuthorityTransportHostV1,
): PatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1 {
  const captured = captureHost(host);
  const readSnapshot = async (
    expectedCandidate: Readonly<{
      row: DxfProductSavedRowIdentityV1;
      selectedOperationNumber: number;
    }>,
    signal: AbortSignal,
  ) => {
    const expected = validateExpected(expectedCandidate);
    if (signalAborted(signal)) fail('cancelled', 'The saved Assembly read was cancelled.');
    const request = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1,
      techCardId: expected.row.techCardId,
      scopeKey: expected.row.scopeKey,
      patternLineKey: expected.row.patternLineKey,
      // Backend expected_saved_row_revision is this saved-row identity, never pattern.version.
      expectedSavedRowRevision: expected.row.revision,
      expectedCardLockVersion: expected.row.cardLockVersion,
      expectedUrl: expected.row.url,
      expectedSizeBytes: expected.row.sizeBytes,
      expectedSha256: expected.row.sha256,
      selectedOperationNumber: expected.selectedOperationNumber,
    });
    let candidate: unknown;
    try {
      candidate = await Reflect.apply(captured.readSavedAssemblySnapshot, undefined, [
        request,
        signal,
      ]);
    } catch {
      if (signalAborted(signal)) fail('cancelled', 'The saved Assembly read was cancelled.');
      fail('transport-failed', 'The injected saved Assembly transport failed.');
    }
    if (signalAborted(signal)) fail('cancelled', 'The saved Assembly read was cancelled.');
    const response = dataRecord(
      detachPlain(candidate, 'response'),
      [
        'schemaVersion',
        'row',
        'serverAssemblyRevision',
        'serverTopologySha256',
        'selectedOperationNumber',
        'operations',
        'selectedSeams',
      ],
      ['sidecar'],
      'response',
    );
    if (response.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1)
      fail('invalid-response', 'The saved Assembly transport response schema is unsupported.');
    const row = validateRow(response.row, 'response.row');
    if (!sameRow(row, expected.row))
      fail('saved-row-mismatch', 'The saved Assembly response row drifted from the request.');
    const selectedOperationNumber = safeInteger(
      response.selectedOperationNumber,
      1,
      'response.selectedOperationNumber',
    );
    if (selectedOperationNumber !== expected.selectedOperationNumber)
      fail(
        'selected-operation-mismatch',
        'The saved Assembly response selected a different operation.',
      );
    const serverAssemblyRevision = serverRevision(
      response.serverAssemblyRevision,
      'response.serverAssemblyRevision',
    );
    const serverTopologySha256 = sha256(
      response.serverTopologySha256,
      'response.serverTopologySha256',
    );
    if (!Array.isArray(response.operations) || !Array.isArray(response.selectedSeams))
      fail('invalid-response', 'The saved Assembly response projection is invalid.');
    const operations = Object.freeze(
      response.operations.map((operation, index) =>
        validateOperation(operation, `response.operations[${index}]`),
      ),
    );
    const selectedSeams = Object.freeze(
      response.selectedSeams.map((seam, index) =>
        validateSeam(seam, `response.selectedSeams[${index}]`),
      ),
    );
    const normalized = normalizeAssembly(operations, selectedSeams, selectedOperationNumber);
    const sidecar = validateOptionalCompositeSidecar(response.sidecar);
    return Object.freeze({
      row,
      serverAssemblyRevision,
      serverTopologySha256,
      selectedOperationNumber,
      selectedSeams,
      normalized,
      sidecar,
    });
  };

  const verifyTopologySha256 = async (
    snapshot: Awaited<ReturnType<typeof readSnapshot>>,
    signal: AbortSignal,
  ): Promise<void> => {
    let computedSha256: unknown;
    try {
      computedSha256 = await Reflect.apply(captured.computeCanonicalSha256, undefined, [
        snapshot.normalized.adapted.existingAssembly,
        signal,
      ]);
    } catch {
      if (signalAborted(signal)) fail('cancelled', 'The saved Assembly read was cancelled.');
      fail('topology-hash-failed', 'The injected topology hash contract failed.');
    }
    if (signalAborted(signal)) fail('cancelled', 'The saved Assembly read was cancelled.');
    if (typeof computedSha256 !== 'string' || !SHA256.test(computedSha256))
      fail('topology-hash-failed', 'The topology hash contract returned an invalid digest.');
    if (computedSha256 !== snapshot.serverTopologySha256)
      fail(
        'topology-hash-mismatch',
        'The server topology SHA does not match the exact projection.',
      );
  };

  const readCurrentAssemblyTopology = async (
    expectedCandidate: Readonly<{
      row: DxfProductSavedRowIdentityV1;
      selectedOperationNumber: number;
    }>,
    signal: AbortSignal,
  ): Promise<PatternImportDxfPhaseESavedAssemblyCurrentTopologyV1> => {
    const snapshot = await readSnapshot(expectedCandidate, signal);
    await verifyTopologySha256(snapshot, signal);
    return Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_CURRENT_TOPOLOGY_V1,
      origin: 'server-transactional-saved-assembly-topology' as const,
      row: snapshot.row,
      serverAssemblyRevision: snapshot.serverAssemblyRevision,
      assemblyTopologySha256: snapshot.serverTopologySha256,
      selectedOperationNumber: snapshot.selectedOperationNumber,
      assembly: snapshot.normalized.assembly,
      topology: snapshot.normalized.adapted.existingAssembly,
    });
  };

  const readAuthoritativeAssembly = async (
    expectedCandidate: Readonly<{
      row: DxfProductSavedRowIdentityV1;
      selectedOperationNumber: number;
    }>,
    signal: AbortSignal,
  ): Promise<PatternImportDxfPhaseESavedRowAuthoritativeAssemblyEvidenceV1> => {
    const snapshot = await readSnapshot(expectedCandidate, signal);
    const sidecar = snapshot.sidecar;
    if (!sidecar)
      fail(
        'exact-carrier-unavailable',
        PATTERN_IMPORT_DXF_PHASE_E_LEGACY_EXACT_RECONFIRM_DETAIL_V1,
      );
    let decodedCompositeCandidate: unknown;
    try {
      decodedCompositeCandidate = await Reflect.apply(
        captured.decodeAndVerifyExactTopology,
        undefined,
        [
          Object.freeze({
            mediaType: sidecar.mediaType,
            expectedSha256: sidecar.sha256,
            expectedByteLength: sidecar.byteLength,
            bytes: sidecar.bytes,
          }),
          signal,
        ],
      );
    } catch {
      if (signalAborted(signal)) fail('cancelled', 'The saved Assembly read was cancelled.');
      fail('sidecar-codec-failed', 'The injected Composite V3 codec failed.');
    }
    if (signalAborted(signal)) fail('cancelled', 'The saved Assembly read was cancelled.');
    const decodedComposite = detachPlain(decodedCompositeCandidate, 'decodedComposite');
    const exactTopology = validateDecodedComposite(
      decodedComposite,
      sidecar,
      snapshot.row,
      snapshot.serverAssemblyRevision,
      snapshot.serverTopologySha256,
      snapshot.selectedOperationNumber,
      [snapshot.selectedSeams[0].seamKey, snapshot.selectedSeams[1].seamKey],
    );
    await verifyTopologySha256(snapshot, signal);

    return Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SERVER_TRANSACTIONAL_SAVED_ASSEMBLY_V1,
      origin: 'server-transactional-saved-assembly' as const,
      serverAssemblyRevision: snapshot.serverAssemblyRevision,
      serverTopologySha256: snapshot.serverTopologySha256,
      row: snapshot.row,
      selectedOperationNumber: snapshot.selectedOperationNumber,
      assembly: snapshot.normalized.assembly,
      exactTopology,
    });
  };
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_AUTHORITY_TRANSPORT_ADAPTER_V1,
    readCurrentAssemblyTopology,
    readAuthoritativeAssembly,
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_AUTHORITY_TRANSPORT_CLAIMS_V1,
  });
}
