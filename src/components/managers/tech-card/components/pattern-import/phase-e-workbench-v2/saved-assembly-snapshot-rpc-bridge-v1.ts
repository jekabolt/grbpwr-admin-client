import type { AdminService, GetTechCardSavedAssemblySnapshotRequest } from 'api/proto-http/admin';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import type { PatternImportDxfPhaseESavedDxfAuthorityReadV1 } from './saved-dxf-reprocess-host-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1,
  type PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
  type PatternImportDxfPhaseESavedAssemblyTransportResponseV1,
} from './saved-assembly-authority-transport-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_RPC_BRIDGE_V1 =
  'pattern-import-dxf-phase-e-saved-assembly-snapshot-rpc-bridge/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_SIDECAR_BYTES = 24 * 1024 * 1024;
const MAX_TEXT_LENGTH = 16 * 1024;
const BASE64_CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export type PatternImportDxfPhaseESavedAssemblySnapshotRpcRequestV1 =
  Readonly<GetTechCardSavedAssemblySnapshotRequest>;

export type PatternImportDxfPhaseESavedAssemblySnapshotRpcClientV1 = Readonly<
  Pick<AdminService, 'GetTechCardSavedAssemblySnapshot'>
>;

export type PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeDepsV1 = Readonly<{
  /** Build the generated client over the request's AbortSignal (abortableAdminService in production). */
  createClient: (signal: AbortSignal) => PatternImportDxfPhaseESavedAssemblySnapshotRpcClientV1;
  /** Binds saved-DXF re-reads to the same operation as the Assembly workbench. */
  selectedOperationNumber: number;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_RPC_BRIDGE_CLAIMS_V1 =
  Object.freeze({
    generatedClientCapabilityInjected: true,
    abortSignalBoundClientPerRead: true,
    exactSavedRowRequestProjected: true,
    savedRowRevisionConfusedWithPatternVersion: false,
    protobufInt64StringParsedOnlyWithinSafeIntegerRange: true,
    serverAssemblyRevisionParsedAsNumber: false,
    serverAssemblyRevisionPreservedAsOpaqueString: true,
    dxfDownloadUrlPreservedSeparately: true,
    dxfDownloadUrlUsedAsSidecarUrl: false,
    rawCompositeV3Base64DecodedStrictly: true,
    serverDecodedExactCarrierTrusted: false,
    getTechCardFallbackUsed: false,
    directFetchFallbackUsed: false,
    generatedRpcIntegrated: false,
    uiIntegrated: false,
    productionReady: false,
  } as const);

export type PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeErrorCodeV1 =
  | 'invalid-host'
  | 'invalid-request'
  | 'cancelled'
  | 'rpc-failed'
  | 'invalid-response'
  | 'invalid-base64'
  | 'unsupported-enum'
  | 'saved-row-mismatch'
  | 'selected-operation-mismatch';

export class PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeErrorV1 extends Error {
  constructor(
    readonly code: PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeErrorCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeErrorV1';
  }
}

export type PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_RPC_BRIDGE_V1;
  readSavedAssemblySnapshot: (
    request: PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseESavedAssemblyTransportResponseV1>;
  readAuthoritativeRow: (
    expected: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseESavedDxfAuthorityReadV1>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_RPC_BRIDGE_CLAIMS_V1;
}>;

type MappedSnapshot = Readonly<{
  transportResponse: PatternImportDxfPhaseESavedAssemblyTransportResponseV1;
  dxfAuthority: PatternImportDxfPhaseESavedDxfAuthorityReadV1;
}>;

function fail(
  code: PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeErrorCodeV1,
  message: string,
): never {
  throw new PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeErrorV1(code, message);
}

function record(value: unknown, path: string): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-response', `${path} must be a record.`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      fail('invalid-response', `${path} must be plain data.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string'))
      fail('invalid-response', `${path} contains symbol fields.`);
    return descriptors;
  } catch (error) {
    if (error instanceof PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeErrorV1) throw error;
    fail('invalid-response', `${path} cannot be inspected safely.`);
  }
}

function field(
  descriptors: Record<string, PropertyDescriptor>,
  key: string,
  path: string,
): unknown {
  const descriptor = descriptors[key];
  if (!descriptor) return undefined;
  if (!descriptor.enumerable || !('value' in descriptor))
    fail('invalid-response', `${path}.${key} must be a stable data field.`);
  return descriptor.value;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail('invalid-response', `${path} must be an array.`);
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype)
      fail('invalid-response', `${path} must be a plain array.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const lengthValue: unknown =
      lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : -1;
    if (
      !Number.isSafeInteger(lengthValue) ||
      (lengthValue as number) < 0 ||
      (lengthValue as number) > 4_096
    )
      fail('invalid-response', `${path} exceeds the array bound.`);
    const length = lengthValue as number;
    if (Reflect.ownKeys(descriptors).length !== length + 1)
      fail('invalid-response', `${path} must be dense and contain no extra fields.`);
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
        fail('invalid-response', `${path}[${index}] must be a stable data field.`);
      result.push(descriptor.value);
    }
    return result;
  } catch (error) {
    if (error instanceof PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeErrorV1) throw error;
    fail('invalid-response', `${path} cannot be inspected safely.`);
  }
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    fail('invalid-response', `${path} must be a safe integer >= ${minimum}.`);
  return value as number;
}

function protobufInt64(value: unknown, path: string, minimum = 0): number {
  if (typeof value === 'number') return integer(value, path, minimum);
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value) || value.length > 16)
    fail('invalid-response', `${path} must be a canonical protobuf int64 value.`);
  const exact = BigInt(value);
  if (exact < BigInt(minimum) || exact > BigInt(Number.MAX_SAFE_INTEGER))
    fail('invalid-response', `${path} is outside the exact JavaScript integer range.`);
  return Number(exact);
}

function number(value: unknown, path: string, defaultValue = 0): number {
  const candidate = value === undefined ? defaultValue : value;
  if (typeof candidate !== 'number' || !Number.isFinite(candidate) || Object.is(candidate, -0))
    fail('invalid-response', `${path} must be a finite number.`);
  return candidate;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function text(value: unknown, path: string, defaultValue?: string): string {
  const candidate = value === undefined ? defaultValue : value;
  if (
    typeof candidate !== 'string' ||
    candidate.length > MAX_TEXT_LENGTH ||
    hasControlCharacter(candidate)
  )
    fail('invalid-response', `${path} must be a bounded text value.`);
  return candidate;
}

function digest(value: unknown, path: string): string {
  const candidate = text(value, path);
  if (!SHA256.test(candidate)) fail('invalid-response', `${path} must be a lowercase SHA-256.`);
  return candidate;
}

function boolean(value: unknown, path: string, defaultValue = false): boolean {
  const candidate = value === undefined ? defaultValue : value;
  if (typeof candidate !== 'boolean') fail('invalid-response', `${path} must be a boolean.`);
  return candidate;
}

function url(value: unknown, path: string): string {
  const candidate = text(value, path);
  const lower = candidate.trimStart().toLowerCase();
  if (!candidate || lower.startsWith('data:') || lower.startsWith('javascript:'))
    fail('invalid-response', `${path} must be a non-executable URL.`);
  return candidate;
}

function stringArray(value: unknown, path: string): readonly string[] {
  return Object.freeze(array(value, path).map((entry, index) => text(entry, `${path}[${index}]`)));
}

function enumValue<T extends string>(
  value: unknown,
  path: string,
  values: Readonly<Record<string, T>>,
): T {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(values, value))
    fail('unsupported-enum', `${path} contains an unsupported protobuf enum value.`);
  return values[value];
}

function decodeCanonicalBase64(value: unknown, expectedBytes: number, path: string): Uint8Array {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SIDECAR_BYTES * 2)
    fail('invalid-base64', `${path} must be bounded base64 text.`);
  if (!BASE64.test(value) || value.length % 4 !== 0)
    fail('invalid-base64', `${path} is not canonical standard base64.`);
  if (value.length !== Math.ceil(expectedBytes / 3) * 4)
    fail('invalid-base64', `${path} length does not match byte_length.`);

  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const decodedLength = (value.length / 4) * 3 - padding;
  if (decodedLength !== expectedBytes || decodedLength > MAX_SIDECAR_BYTES)
    fail('invalid-base64', `${path} decoded length does not match byte_length.`);
  const output = new Uint8Array(decodedLength);
  let outputIndex = 0;
  for (let index = 0; index < value.length; index += 4) {
    const a = BASE64_CODES.indexOf(value[index]);
    const b = BASE64_CODES.indexOf(value[index + 1]);
    const c = value[index + 2] === '=' ? 0 : BASE64_CODES.indexOf(value[index + 2]);
    const d = value[index + 3] === '=' ? 0 : BASE64_CODES.indexOf(value[index + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0) fail('invalid-base64', `${path} is not standard base64.`);
    if (index + 4 === value.length) {
      if (padding === 2 && (b & 15) !== 0)
        fail('invalid-base64', `${path} has non-zero trailing bits.`);
      if (padding === 1 && (c & 3) !== 0)
        fail('invalid-base64', `${path} has non-zero trailing bits.`);
    }
    if (outputIndex < decodedLength) output[outputIndex++] = (a << 2) | (b >> 4);
    if (outputIndex < decodedLength) output[outputIndex++] = ((b & 15) << 4) | (c >> 2);
    if (outputIndex < decodedLength) output[outputIndex++] = ((c & 3) << 6) | d;
  }
  return output;
}

function mapAnchor(value: unknown, path: string) {
  const anchor = record(value, path);
  const rawLayer = field(anchor, 'layer', path);
  const layer =
    rawLayer === undefined || rawLayer === 'TECH_CARD_SEAM_LAYER_UNKNOWN'
      ? undefined
      : enumValue(rawLayer, `${path}.layer`, {
          TECH_CARD_SEAM_LAYER_UNDER: 'under',
          TECH_CARD_SEAM_LAYER_OVER: 'over',
        });
  return Object.freeze({
    pieceLineKey: text(field(anchor, 'pieceLineKey', path), `${path}.pieceLineKey`, ''),
    edgeHint: text(field(anchor, 'edgeHint', path), `${path}.edgeHint`, ''),
    rangeFrom: number(field(anchor, 'rangeFrom', path), `${path}.rangeFrom`),
    rangeTo: number(field(anchor, 'rangeTo', path), `${path}.rangeTo`),
    lenMm: number(field(anchor, 'lenMm', path), `${path}.lenMm`),
    contourSig: text(field(anchor, 'contourSig', path), `${path}.contourSig`, ''),
    samples: Object.freeze(
      array(field(anchor, 'samples', path), `${path}.samples`).map((sample, index) => {
        const samplePath = `${path}.samples[${index}]`;
        const sampleRecord = record(sample, samplePath);
        return Object.freeze({
          u: number(field(sampleRecord, 'u', samplePath), `${samplePath}.u`),
          v: number(field(sampleRecord, 'v', samplePath), `${samplePath}.v`),
        });
      }),
    ),
    ...(layer ? { layer } : {}),
  });
}

function mapSeam(value: unknown, path: string) {
  const seam = record(value, path);
  const side = (fieldName: 'sideA' | 'sideB') => {
    const sidePath = `${path}.${fieldName}`;
    const sideRecord = record(field(seam, fieldName, path), sidePath);
    return Object.freeze(
      array(field(sideRecord, 'parts', sidePath), `${sidePath}.parts`).map((anchor, index) =>
        mapAnchor(anchor, `${sidePath}.parts[${index}]`),
      ),
    );
  };
  return Object.freeze({
    seamKey: text(field(seam, 'seamKey', path), `${path}.seamKey`, ''),
    status: enumValue(field(seam, 'status', path), `${path}.status`, {
      TECH_CARD_SEAM_STATUS_CONFIRMED: 'confirmed',
      TECH_CARD_SEAM_STATUS_REJECTED: 'rejected',
    }),
    stale: boolean(field(seam, 'stale', path), `${path}.stale`),
    kind: enumValue(field(seam, 'kind', path), `${path}.kind`, {
      TECH_CARD_SEAM_KIND_EDGE: 'edge',
      TECH_CARD_SEAM_KIND_PARTIAL: 'partial',
      TECH_CARD_SEAM_KIND_COMPOSITE: 'composite',
      TECH_CARD_SEAM_KIND_SURFACE: 'surface',
      TECH_CARD_SEAM_KIND_CLOSURE: 'closure',
    }),
    direction: enumValue(field(seam, 'direction', path), `${path}.direction`, {
      TECH_CARD_SEAM_DIRECTION_UNKNOWN: 'unknown',
      TECH_CARD_SEAM_DIRECTION_REVERSED: 'reversed',
      TECH_CARD_SEAM_DIRECTION_SAME: 'same',
    }),
    source: enumValue(field(seam, 'source', path), `${path}.source`, {
      TECH_CARD_SEAM_SOURCE_GRAPH: 'graph',
      TECH_CARD_SEAM_SOURCE_DOLL: 'doll',
      TECH_CARD_SEAM_SOURCE_ORDER: 'order',
      TECH_CARD_SEAM_SOURCE_MANUAL: 'manual',
      TECH_CARD_SEAM_SOURCE_AI: 'ai',
    }),
    anchoredSize: text(field(seam, 'anchoredSize', path), `${path}.anchoredSize`, ''),
    sideA: side('sideA'),
    sideB: side('sideB'),
  });
}

function mapOperation(value: unknown, path: string) {
  const operation = record(value, path);
  return Object.freeze({
    operationNumber: integer(
      field(operation, 'operationNumber', path) ?? 0,
      `${path}.operationNumber`,
    ),
    work: text(field(operation, 'work', path), `${path}.work`, ''),
    inputKeys: stringArray(field(operation, 'inputKeys', path), `${path}.inputKeys`),
    outputUnitKey: text(field(operation, 'outputUnitKey', path), `${path}.outputUnitKey`, ''),
    outputUnitName: text(field(operation, 'outputUnitName', path), `${path}.outputUnitName`, ''),
    seamKeys: stringArray(field(operation, 'seamKeys', path), `${path}.seamKeys`),
  });
}

function mapRow(value: unknown): Readonly<{
  identity: DxfProductSavedRowIdentityV1;
  downloadUrl: string;
}> {
  const path = 'snapshot.row';
  const row = record(value, path);
  const identity = Object.freeze({
    techCardId: integer(field(row, 'techCardId', path), `${path}.techCardId`, 1),
    scopeKey: text(field(row, 'scopeKey', path), `${path}.scopeKey`),
    patternLineKey: text(field(row, 'patternLineKey', path), `${path}.patternLineKey`),
    revision: integer(field(row, 'savedRowRevision', path), `${path}.savedRowRevision`, 1),
    cardLockVersion: integer(field(row, 'cardLockVersion', path), `${path}.cardLockVersion`),
    url: url(field(row, 'url', path), `${path}.url`),
    sizeBytes: protobufInt64(field(row, 'sizeBytes', path), `${path}.sizeBytes`, 1),
    sha256: digest(field(row, 'sha256', path), `${path}.sha256`),
  });
  return Object.freeze({
    identity,
    downloadUrl: url(field(row, 'downloadUrl', path), `${path}.downloadUrl`),
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

function mapSidecar(value: unknown, row: DxfProductSavedRowIdentityV1) {
  if (value === undefined) return Object.freeze({ status: 'absent' as const });
  const path = 'snapshot.semanticSidecar';
  const sidecar = record(value, path);
  if (
    integer(field(sidecar, 'techCardId', path), `${path}.techCardId`, 1) !== row.techCardId ||
    text(field(sidecar, 'patternLineKey', path), `${path}.patternLineKey`) !== row.patternLineKey ||
    digest(field(sidecar, 'dxfSha256', path), `${path}.dxfSha256`) !== row.sha256 ||
    integer(field(sidecar, 'cardLockVersion', path), `${path}.cardLockVersion`) !==
      row.cardLockVersion ||
    integer(field(sidecar, 'savedRowRevision', path), `${path}.savedRowRevision`, 1) !==
      row.revision
  )
    fail('saved-row-mismatch', 'The semantic sidecar metadata drifted from snapshot.row.');
  const mediaType = text(field(sidecar, 'mediaType', path), `${path}.mediaType`);
  if (mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3)
    return Object.freeze({ status: 'legacy' as const, mediaType });
  const byteLength = integer(field(sidecar, 'byteLength', path), `${path}.byteLength`, 1);
  if (byteLength > MAX_SIDECAR_BYTES)
    fail('invalid-response', `${path}.byteLength exceeds the Composite V3 bound.`);
  return Object.freeze({
    status: 'composite-v3' as const,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
    sha256: digest(field(sidecar, 'sidecarSha256', path), `${path}.sidecarSha256`),
    byteLength,
    bytes: decodeCanonicalBase64(
      field(sidecar, 'sidecarBytes', path),
      byteLength,
      `${path}.sidecarBytes`,
    ),
    // This is deliberately not snapshot.row.downloadUrl: that URL downloads the DXF, not the sidecar.
    downloadUrl: null,
  });
}

export function mapPatternImportDxfPhaseESavedAssemblySnapshotRpcResponseV1(
  value: unknown,
): MappedSnapshot {
  const snapshot = record(value, 'snapshot');
  const mappedRow = mapRow(field(snapshot, 'row', 'snapshot'));
  const serverAssemblyRevision = text(
    field(snapshot, 'serverAssemblyRevision', 'snapshot'),
    'snapshot.serverAssemblyRevision',
  );
  const serverTopologySha256 = digest(
    field(snapshot, 'assemblyTopologySha256', 'snapshot'),
    'snapshot.assemblyTopologySha256',
  );
  const operations = Object.freeze(
    array(field(snapshot, 'operations', 'snapshot'), 'snapshot.operations').map(
      (operation, index) => mapOperation(operation, `snapshot.operations[${index}]`),
    ),
  );
  const selectedSeams = Object.freeze(
    array(field(snapshot, 'selectedSeams', 'snapshot'), 'snapshot.selectedSeams').map(
      (seam, index) => mapSeam(seam, `snapshot.selectedSeams[${index}]`),
    ),
  );
  return Object.freeze({
    transportResponse: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1,
      row: mappedRow.identity,
      serverAssemblyRevision,
      serverTopologySha256,
      selectedOperationNumber: integer(
        field(snapshot, 'selectedOperationNumber', 'snapshot'),
        'snapshot.selectedOperationNumber',
        1,
      ),
      operations,
      selectedSeams,
      sidecar: mapSidecar(field(snapshot, 'semanticSidecar', 'snapshot'), mappedRow.identity),
    }),
    dxfAuthority: Object.freeze({
      row: mappedRow.identity,
      downloadUrl: mappedRow.downloadUrl,
    }),
  });
}

function validateTransportRequest(
  request: PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
  selectedOperationNumber: number,
): PatternImportDxfPhaseESavedAssemblySnapshotRpcRequestV1 {
  if (
    request.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1 ||
    request.selectedOperationNumber !== selectedOperationNumber
  )
    fail('invalid-request', 'The saved Assembly snapshot request is unsupported.');
  return Object.freeze({
    techCardId: integer(request.techCardId, 'request.techCardId', 1),
    patternLineKey: text(request.patternLineKey, 'request.patternLineKey'),
    expectedScopeKey: text(request.scopeKey, 'request.scopeKey'),
    expectedSavedRowRevision: integer(
      request.expectedSavedRowRevision,
      'request.expectedSavedRowRevision',
      1,
    ),
    expectedCardLockVersion: integer(
      request.expectedCardLockVersion,
      'request.expectedCardLockVersion',
    ),
    expectedUrl: text(request.expectedUrl, 'request.expectedUrl'),
    expectedSizeBytes: integer(request.expectedSizeBytes, 'request.expectedSizeBytes', 1),
    expectedSha256: digest(request.expectedSha256, 'request.expectedSha256'),
    selectedOperationNumber,
  });
}

function rowRequest(
  row: DxfProductSavedRowIdentityV1,
  selectedOperationNumber: number,
): PatternImportDxfPhaseESavedAssemblyTransportRequestV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1,
    techCardId: row.techCardId,
    scopeKey: row.scopeKey,
    patternLineKey: row.patternLineKey,
    expectedSavedRowRevision: row.revision,
    expectedCardLockVersion: row.cardLockVersion,
    expectedUrl: row.url,
    expectedSizeBytes: row.sizeBytes,
    expectedSha256: row.sha256,
    selectedOperationNumber,
  });
}

export function createPatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeV1(
  deps: PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeDepsV1,
): PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeV1 {
  if (
    typeof deps?.createClient !== 'function' ||
    !Number.isSafeInteger(deps.selectedOperationNumber) ||
    deps.selectedOperationNumber < 1
  )
    fail('invalid-host', 'A generated client factory and selected operation are required.');
  const createClient = deps.createClient;
  const selectedOperationNumber = deps.selectedOperationNumber;

  const read = async (
    request: PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
    signal: AbortSignal,
  ): Promise<MappedSnapshot> => {
    if (signal.aborted) fail('cancelled', 'The saved Assembly snapshot read was cancelled.');
    const rpcRequest = validateTransportRequest(request, selectedOperationNumber);
    let client: PatternImportDxfPhaseESavedAssemblySnapshotRpcClientV1;
    let method: PatternImportDxfPhaseESavedAssemblySnapshotRpcClientV1['GetTechCardSavedAssemblySnapshot'];
    try {
      client = createClient(signal);
      const descriptor = Object.getOwnPropertyDescriptor(
        client,
        'GetTechCardSavedAssemblySnapshot',
      );
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        typeof descriptor.value !== 'function'
      )
        fail('invalid-host', 'The generated client does not expose a stable snapshot method.');
      method = descriptor.value as typeof method;
    } catch (error) {
      if (error instanceof PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeErrorV1) throw error;
      fail('invalid-host', 'The generated client factory failed.');
    }
    let response: unknown;
    try {
      response = await Reflect.apply(method, client, [rpcRequest]);
    } catch {
      if (signal.aborted) fail('cancelled', 'The saved Assembly snapshot read was cancelled.');
      fail('rpc-failed', 'GetTechCardSavedAssemblySnapshot failed.');
    }
    if (signal.aborted) fail('cancelled', 'The saved Assembly snapshot read was cancelled.');
    const mapped = mapPatternImportDxfPhaseESavedAssemblySnapshotRpcResponseV1(response);
    const expectedRow = Object.freeze({
      techCardId: request.techCardId,
      scopeKey: request.scopeKey,
      patternLineKey: request.patternLineKey,
      revision: request.expectedSavedRowRevision,
      cardLockVersion: request.expectedCardLockVersion,
      url: request.expectedUrl,
      sizeBytes: request.expectedSizeBytes,
      sha256: request.expectedSha256,
    });
    if (!sameRow(mapped.dxfAuthority.row, expectedRow))
      fail('saved-row-mismatch', 'The transactional saved pattern row moved.');
    if (mapped.transportResponse.selectedOperationNumber !== selectedOperationNumber)
      fail(
        'selected-operation-mismatch',
        'The transactional snapshot selected a different Assembly operation.',
      );
    return mapped;
  };

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_RPC_BRIDGE_V1,
    readSavedAssemblySnapshot: async (request, signal) =>
      (await read(request, signal)).transportResponse,
    async readAuthoritativeRow(expected, signal) {
      const mapped = await read(rowRequest(expected, selectedOperationNumber), signal);
      if (!sameRow(mapped.dxfAuthority.row, expected))
        fail('saved-row-mismatch', 'The transactional saved pattern row moved.');
      return mapped.dxfAuthority;
    },
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_RPC_BRIDGE_CLAIMS_V1,
  });
}
