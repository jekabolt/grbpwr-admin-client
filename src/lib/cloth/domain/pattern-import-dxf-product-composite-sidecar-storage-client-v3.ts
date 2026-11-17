import type { AdminService, TechCardPatternSemanticSidecar } from 'api/proto-http/admin';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3,
  preparePatternImportDxfProductCompositeSidecarPersistenceV3,
  type PatternImportDxfProductCompositeSidecarVerifiedGetV3,
} from './pattern-import-dxf-product-composite-sidecar-persistence-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  decodePatternImportDxfProductCompositeSidecarV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
  type PatternImportDxfProductCompositeSidecarBindingsV3,
  type PatternImportDxfProductCompositeSidecarOwnerV3,
} from './pattern-import-dxf-product-composite-sidecar-v3';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from './pattern-import-dxf-product-semantic-sidecar-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V3 =
  'pattern-import-dxf-product-composite-sidecar-storage-request/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V3 =
  'pattern-import-dxf-product-composite-sidecar-storage-receipt/3' as const;

export type PatternImportDxfProductCompositeSidecarStorageServiceV3 = Pick<
  AdminService,
  'PutTechCardPatternSemanticSidecar' | 'GetTechCardPatternSemanticSidecar'
>;

export type PatternImportDxfProductCompositeSidecarStorageRequestV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V3;
  currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
  nextOwner: PatternImportDxfProductCompositeSidecarOwnerV3;
}>;

export type PatternImportDxfProductCompositeSidecarStorageBlockerV3 = Readonly<{
  code:
    | 'invalid-request'
    | 'invalid-client'
    | 'cancelled'
    | 'current-get-failed'
    | 'current-readback-invalid'
    | 'planning-blocked'
    | 'next-sidecar-invalid'
    | 'pre-put-blocked'
    | 'put-failed'
    | 'put-readback-invalid'
    | 'get-failed'
    | 'get-readback-invalid'
    | 'dual-readback-mismatch';
  phase: 'input' | 'current-get' | 'planning' | 'pre-put' | 'put' | 'get' | 'dual-readback';
  detail: string;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_CLAIMS_V3 = Object.freeze({
  generatedClientCapabilityInjected: true,
  abortSignalBoundClientPerPersistence: true,
  freshCurrentNarrowGetPerformed: true,
  currentBytesDigestAndCodecVerifiedByPlanner: true,
  currentExactAuthorityRevalidatedByPlanner: true,
  requiredV1BytesPreservedByPlanner: true,
  v1TransportBindingReadOnlyFromVerifiedComponent: true,
  expectedPreviousSidecarPresenceAlwaysSent: true,
  absentMappedToExplicitEmptyPreviousSha: true,
  conditionalAssemblyCasSent: true,
  putEchoExactBytesVerified: true,
  freshPostPutNarrowGetPerformed: true,
  postPutExactBytesVerified: true,
  sidecarPersisted: true,
  uiIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_CLAIMS_V3,
  currentBytesDigestAndCodecVerifiedByPlanner: false as const,
  currentExactAuthorityRevalidatedByPlanner: false as const,
  requiredV1BytesPreservedByPlanner: false as const,
  v1TransportBindingReadOnlyFromVerifiedComponent: false as const,
  expectedPreviousSidecarPresenceAlwaysSent: false as const,
  absentMappedToExplicitEmptyPreviousSha: false as const,
  conditionalAssemblyCasSent: false as const,
  putEchoExactBytesVerified: false as const,
  freshPostPutNarrowGetPerformed: false as const,
  postPutExactBytesVerified: false as const,
  sidecarPersisted: false as const,
});

export type PatternImportDxfProductCompositeSidecarStorageResultV3 =
  | Readonly<{
      ok: true;
      receipt: Readonly<{
        schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V3;
        techCardId: number;
        patternLineKey: string;
        savedRowRevision: number;
        cardLockVersion: number;
        dxfSha256: string;
        patternVersion: number;
        postSaveReceiptSha256: string;
        selectedOperationNumber: number;
        serverAssemblyRevision: string;
        assemblyTopologySha256: string;
        previousSidecarSha256: string | null;
        sidecarSha256: string;
        canonicalByteLength: number;
        mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3;
      }>;
      writeOutcome: 'verified';
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_CLAIMS_V3;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      writeOutcome: 'not-attempted' | 'unknown' | 'acknowledged-unverified';
      blockers: readonly [PatternImportDxfProductCompositeSidecarStorageBlockerV3];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export type PatternImportDxfProductCompositeSidecarStorageAdapterV3 = Readonly<{
  persist: (
    request: PatternImportDxfProductCompositeSidecarStorageRequestV3,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfProductCompositeSidecarStorageResultV3>;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_CLAIMS_V3;
}>;

export type PatternImportDxfProductCompositeSidecarStorageDepsV3 = Readonly<{
  createClient: (signal: AbortSignal) => PatternImportDxfProductCompositeSidecarStorageServiceV3;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

export type PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3 =
  | Readonly<{
      status: 'absent';
      source: 'verified-get-absence';
    }>
  | Readonly<{
      status: 'present';
      source: 'verified-get';
      mediaType: string;
      sha256: string;
      byteLength: number;
      bytes: Uint8Array<ArrayBuffer>;
    }>;

export type PatternImportDxfProductCompositeSidecarStoragePlannedWriteV3<
  MediaType extends string = string,
> = Readonly<{
  authority: PatternImportDxfProductCompositeSidecarBindingsV3;
  transport: Readonly<{
    patternVersion: number;
    postSaveReceiptSha256: string;
    selectedOperationNumber: number;
  }>;
  previousSidecarSha256: string | null;
  sidecarSha256: string;
  byteLength: number;
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: MediaType;
}>;

export type PatternImportDxfProductCompositeSidecarStorageWriterStrategyV3<
  Request extends Readonly<{
    schemaVersion: string;
    currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
  }>,
  MediaType extends string,
  ReceiptSchema extends string,
> = Readonly<{
  requestSchemaVersion: Request['schemaVersion'];
  receiptSchemaVersion: ReceiptSchema;
  mediaType: MediaType;
  acceptedCurrentMediaTypes: readonly string[];
  label: string;
  prepare: (
    request: Request,
    current: PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
    crypto: Pick<Crypto, 'subtle'> | undefined,
  ) => Promise<PatternImportDxfProductCompositeSidecarStoragePlannedWriteV3<MediaType>>;
  beforeRequest?: (
    request: Request,
    planned: PatternImportDxfProductCompositeSidecarStoragePlannedWriteV3<MediaType>,
    signal: AbortSignal,
  ) => Promise<void>;
  verifyCanonical: (
    bytes: Uint8Array<ArrayBuffer>,
    crypto: Pick<Crypto, 'subtle'> | undefined,
  ) => Promise<boolean>;
}>;

export type PatternImportDxfProductCompositeSidecarStorageWriterResultV3<
  MediaType extends string,
  ReceiptSchema extends string,
> =
  | Readonly<{
      ok: true;
      receipt: Readonly<{
        schemaVersion: ReceiptSchema;
        techCardId: number;
        patternLineKey: string;
        savedRowRevision: number;
        cardLockVersion: number;
        dxfSha256: string;
        patternVersion: number;
        postSaveReceiptSha256: string;
        selectedOperationNumber: number;
        serverAssemblyRevision: string;
        assemblyTopologySha256: string;
        previousSidecarSha256: string | null;
        sidecarSha256: string;
        canonicalByteLength: number;
        mediaType: MediaType;
      }>;
      writeOutcome: 'verified';
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_CLAIMS_V3;
    }>
  | Extract<PatternImportDxfProductCompositeSidecarStorageResultV3, { ok: false }>;

export type PatternImportDxfProductCompositeSidecarStorageWriterAdapterV3<
  Request extends Readonly<{
    schemaVersion: string;
    currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
  }>,
  MediaType extends string,
  ReceiptSchema extends string,
> = Readonly<{
  persist: (
    request: Request,
    signal: AbortSignal,
  ) => Promise<
    PatternImportDxfProductCompositeSidecarStorageWriterResultV3<MediaType, ReceiptSchema>
  >;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_CLAIMS_V3;
}>;

type Phase = PatternImportDxfProductCompositeSidecarStorageBlockerV3['phase'];
type Code = PatternImportDxfProductCompositeSidecarStorageBlockerV3['code'];
type WriteOutcome = Extract<
  PatternImportDxfProductCompositeSidecarStorageResultV3,
  { ok: false }
>['writeOutcome'];

type V1TransportBinding = Readonly<{
  patternVersion: number;
  postSaveReceiptSha256: string;
  selectedOperationNumber: number;
}>;

type PlannedWrite = Readonly<{
  authority: PatternImportDxfProductCompositeSidecarBindingsV3;
  transport: V1TransportBinding;
  previousSidecarSha256: string | null;
  sidecarSha256: string;
  byteLength: number;
  bytes: Uint8Array<ArrayBuffer>;
  base64: string;
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
// The Composite codec accepts larger detached documents for verification, but the shared backend
// semantic-sidecar table has a 4 MiB payload limit. Refuse locally before an ambiguous PUT.
const MAX_SIDECAR_BYTES = 4 * 1024 * 1024;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

class StorageFailure extends Error {
  constructor(
    readonly code: Code,
    readonly phase: Phase,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
    this.name = 'PatternImportDxfProductCompositeSidecarStorageFailureV3';
  }
}

function fail(code: Code, phase: Phase, detail: string): never {
  throw new StorageFailure(code, phase, detail);
}

function blocked(
  error: unknown,
  writeOutcome: WriteOutcome,
): Extract<PatternImportDxfProductCompositeSidecarStorageResultV3, { ok: false }> {
  const known = error instanceof StorageFailure;
  return Object.freeze({
    ok: false as const,
    receipt: null,
    writeOutcome,
    blockers: Object.freeze([
      Object.freeze({
        code: known ? error.code : ('current-readback-invalid' as const),
        phase: known ? error.phase : ('current-get' as const),
        detail: known ? error.message : 'Composite V3 storage rejected unsafe data.',
      }),
    ]) as readonly [PatternImportDxfProductCompositeSidecarStorageBlockerV3],
    claims: BLOCKED_CLAIMS,
  });
}

function stableField(value: unknown, key: string, phase: Phase): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(
      phase === 'put' ? 'put-readback-invalid' : 'get-readback-invalid',
      phase,
      `${phase} response is not a record.`,
    );
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    fail(
      phase === 'put' ? 'put-readback-invalid' : 'get-readback-invalid',
      phase,
      `${phase} response cannot be inspected.`,
    );
  }
  if (!descriptor) return undefined;
  if (!descriptor.enumerable || !('value' in descriptor))
    fail(
      phase === 'put' ? 'put-readback-invalid' : 'get-readback-invalid',
      phase,
      `${phase}.${key} is not stable data.`,
    );
  return descriptor.value;
}

function responseRow(
  value: unknown,
  phase: 'current-get' | 'put' | 'get',
): TechCardPatternSemanticSidecar | undefined {
  const row = stableField(value, 'semanticSidecar', phase);
  if (row === undefined) return undefined;
  if (!row || typeof row !== 'object' || Array.isArray(row))
    fail(
      phase === 'put' ? 'put-readback-invalid' : 'get-readback-invalid',
      phase,
      `${phase}.semanticSidecar is not a record.`,
    );
  return row as TechCardPatternSemanticSidecar;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

function base64ToBytes(
  value: unknown,
  expectedLength: number,
  phase: Phase,
): Uint8Array<ArrayBuffer> {
  const code = phase === 'put' ? 'put-readback-invalid' : 'get-readback-invalid';
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SIDECAR_BYTES * 2)
    fail(code, phase, `${phase} sidecar bytes are not bounded base64.`);
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    fail(code, phase, `${phase} sidecar bytes are not base64.`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytes.byteLength !== expectedLength || bytesToBase64(bytes) !== value)
    fail(code, phase, `${phase} sidecar base64 is not canonical or has the wrong length.`);
  return bytes;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function sameRow(
  row: TechCardPatternSemanticSidecar,
  authority: PatternImportDxfProductCompositeSidecarBindingsV3,
): boolean {
  return (
    row.techCardId === authority.row.techCardId &&
    row.patternLineKey === authority.row.patternLineKey &&
    row.dxfSha256 === authority.row.sha256 &&
    row.cardLockVersion === authority.row.cardLockVersion &&
    row.savedRowRevision === authority.row.revision
  );
}

async function mapCurrentEvidence(
  row: TechCardPatternSemanticSidecar | undefined,
  authority: PatternImportDxfProductCompositeSidecarBindingsV3,
  acceptedMediaTypes: readonly string[],
): Promise<PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3> {
  if (!row)
    return Object.freeze({ status: 'absent' as const, source: 'verified-get-absence' as const });
  if (!sameRow(row, authority))
    fail('current-readback-invalid', 'current-get', 'Current sidecar row differs from authority.');
  if (typeof row.mediaType !== 'string' || !acceptedMediaTypes.includes(row.mediaType))
    fail('current-readback-invalid', 'current-get', 'Current sidecar media type is unsupported.');
  if (
    typeof row.sidecarSha256 !== 'string' ||
    !SHA256.test(row.sidecarSha256) ||
    !Number.isSafeInteger(row.byteLength) ||
    (row.byteLength as number) < 1 ||
    (row.byteLength as number) > MAX_SIDECAR_BYTES
  )
    fail('current-readback-invalid', 'current-get', 'Current sidecar metadata is invalid.');
  const bytes = base64ToBytes(row.sidecarBytes, row.byteLength as number, 'current-get');
  return Object.freeze({
    status: 'present' as const,
    source: 'verified-get' as const,
    mediaType: row.mediaType,
    sha256: row.sidecarSha256,
    byteLength: bytes.byteLength,
    bytes,
  });
}

function plainRecord(value: unknown, path: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail('next-sidecar-invalid', 'planning', `${path} must be a plain record.`);
  return value as Record<string, unknown>;
}

function readV1TransportBinding(
  semanticBytes: Uint8Array<ArrayBuffer>,
  decoded: Awaited<ReturnType<typeof decodePatternImportDxfProductCompositeSidecarV3>>,
): V1TransportBinding {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(semanticBytes)) as unknown;
  } catch {
    fail('next-sidecar-invalid', 'planning', 'Preserved semantic-product-v1 bytes are invalid.');
  }
  const document = plainRecord(parsed, 'semantic-product-v1');
  const persistence = plainRecord(document.persistence, 'semantic-product-v1.persistence');
  const pattern = plainRecord(persistence.pattern, 'semantic-product-v1.persistence.pattern');
  const patternVersion = pattern.version;
  const postSaveReceiptSha256 = persistence.receiptSealSha256;
  const selectedOperationNumber =
    decoded.ok && decoded.exactTopology
      ? decoded.exactTopology.carrier.bindings.selectedOperation.sourceOperationNumber
      : undefined;
  if (
    !Number.isSafeInteger(patternVersion) ||
    (patternVersion as number) < 1 ||
    typeof postSaveReceiptSha256 !== 'string' ||
    !SHA256.test(postSaveReceiptSha256) ||
    !Number.isSafeInteger(selectedOperationNumber) ||
    (selectedOperationNumber as number) < 1
  )
    fail(
      'next-sidecar-invalid',
      'planning',
      'Composite V3 lacks a backend-compatible V1 receipt or exact selected operation.',
    );
  return Object.freeze({
    patternVersion: patternVersion as number,
    postSaveReceiptSha256,
    selectedOperationNumber: selectedOperationNumber as number,
  });
}

async function prepareWrite(
  request: PatternImportDxfProductCompositeSidecarStorageRequestV3,
  current: PatternImportDxfProductCompositeSidecarVerifiedGetV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<PlannedWrite> {
  const planned = await preparePatternImportDxfProductCompositeSidecarPersistenceV3(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3,
      currentAuthority: request.currentAuthority,
      current,
      nextOwner: request.nextOwner,
    },
    crypto,
  );
  if (!planned.ok)
    fail(
      'planning-blocked',
      'planning',
      `${planned.blockers[0].field}: ${planned.blockers[0].detail}`,
    );
  const bytes = planned.plan.conditionalPut.bytes.slice();
  if (bytes.byteLength > MAX_SIDECAR_BYTES)
    fail('next-sidecar-invalid', 'planning', 'Composite V3 exceeds the storage payload limit.');
  const decoded = await decodePatternImportDxfProductCompositeSidecarV3(bytes, crypto);
  if (!decoded.ok || !decoded.exactTopology)
    fail('next-sidecar-invalid', 'planning', 'Planned Composite V3 exact topology is invalid.');
  const semanticBytes = readPatternImportDxfProductCompositeComponentBytesV3(
    decoded.owner,
    'semantic-product-v1',
  );
  if (!semanticBytes)
    fail('next-sidecar-invalid', 'planning', 'Planned Composite V3 has no V1 component.');
  const transport = readV1TransportBinding(semanticBytes, decoded);
  return Object.freeze({
    authority: request.currentAuthority,
    transport,
    previousSidecarSha256: planned.plan.conditionalPut.expectedPreviousSidecarSha256,
    sidecarSha256: planned.plan.conditionalPut.sidecarSha256,
    byteLength: planned.plan.conditionalPut.byteLength,
    bytes,
    base64: bytesToBase64(bytes),
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  });
}

function verifyCurrentTransportBinding(
  row: TechCardPatternSemanticSidecar | undefined,
  planned: PatternImportDxfProductCompositeSidecarStoragePlannedWriteV3,
): void {
  if (!row) return;
  if (
    row.patternVersion !== planned.transport.patternVersion ||
    row.postSaveReceiptSha256 !== planned.transport.postSaveReceiptSha256
  )
    fail(
      'current-readback-invalid',
      'current-get',
      'Current sidecar metadata differs from its preserved semantic-product-v1 receipt.',
    );
}

async function verifyStoredRow(
  row: TechCardPatternSemanticSidecar | undefined,
  planned: PatternImportDxfProductCompositeSidecarStoragePlannedWriteV3,
  phase: 'put' | 'get',
  verifyCanonical: (
    bytes: Uint8Array<ArrayBuffer>,
    crypto: Pick<Crypto, 'subtle'> | undefined,
  ) => Promise<boolean>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<void> {
  const code = phase === 'put' ? 'put-readback-invalid' : 'get-readback-invalid';
  if (!row) fail(code, phase, `${phase} omitted semanticSidecar.`);
  const authority = planned.authority;
  if (
    !sameRow(row, authority) ||
    row.patternVersion !== planned.transport.patternVersion ||
    row.postSaveReceiptSha256 !== planned.transport.postSaveReceiptSha256 ||
    row.mediaType !== planned.mediaType ||
    row.sidecarSha256 !== planned.sidecarSha256 ||
    row.byteLength !== planned.byteLength
  )
    fail(code, phase, `${phase} returned a different row, receipt, or sidecar envelope.`);
  const bytes = base64ToBytes(row.sidecarBytes, planned.byteLength, phase);
  if (!sameBytes(bytes, planned.bytes)) fail(code, phase, `${phase} returned different bytes.`);
  let canonical = false;
  try {
    canonical = await verifyCanonical(bytes, crypto);
  } catch {
    canonical = false;
  }
  if (!canonical) fail(code, phase, `${phase} returned noncanonical or invalid sidecar bytes.`);
}

function checkSignal(signal: AbortSignal, phase: Phase): void {
  if (signal.aborted) fail('cancelled', phase, 'Composite V3 persistence was cancelled.');
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'status');
    return !!descriptor && 'value' in descriptor && descriptor.value === 404;
  } catch {
    return false;
  }
}

function method<Client extends object, Key extends keyof Client>(
  client: Client,
  key: Key,
): Client[Key] {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(client, key);
  } catch {
    fail('invalid-client', 'input', 'Generated client cannot be inspected.');
  }
  if (
    !descriptor ||
    !descriptor.enumerable ||
    !('value' in descriptor) ||
    typeof descriptor.value !== 'function'
  )
    fail('invalid-client', 'input', `Generated client omits ${String(key)}.`);
  return descriptor.value as Client[Key];
}

export function createPatternImportDxfProductCompositeSidecarStorageWriterV3<
  Request extends Readonly<{
    schemaVersion: string;
    currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
  }>,
  MediaType extends string,
  ReceiptSchema extends string,
>(
  deps: PatternImportDxfProductCompositeSidecarStorageDepsV3,
  strategy: PatternImportDxfProductCompositeSidecarStorageWriterStrategyV3<
    Request,
    MediaType,
    ReceiptSchema
  >,
): PatternImportDxfProductCompositeSidecarStorageWriterAdapterV3<
  Request,
  MediaType,
  ReceiptSchema
> {
  if (!deps || typeof deps.createClient !== 'function')
    fail('invalid-client', 'input', 'A generated client factory is required.');
  if (
    !strategy ||
    typeof strategy.requestSchemaVersion !== 'string' ||
    typeof strategy.receiptSchemaVersion !== 'string' ||
    typeof strategy.mediaType !== 'string' ||
    typeof strategy.label !== 'string' ||
    !Array.isArray(strategy.acceptedCurrentMediaTypes) ||
    typeof strategy.prepare !== 'function' ||
    (strategy.beforeRequest !== undefined && typeof strategy.beforeRequest !== 'function') ||
    typeof strategy.verifyCanonical !== 'function'
  )
    fail('invalid-client', 'input', 'A complete sidecar codec strategy is required.');
  const createClient = deps.createClient;
  const crypto = deps.crypto ?? globalThis.crypto;
  const acceptedCurrentMediaTypes = Object.freeze([...strategy.acceptedCurrentMediaTypes]);
  return Object.freeze({
    async persist(request, signal) {
      let client: PatternImportDxfProductCompositeSidecarStorageServiceV3;
      let get: PatternImportDxfProductCompositeSidecarStorageServiceV3['GetTechCardPatternSemanticSidecar'];
      let put: PatternImportDxfProductCompositeSidecarStorageServiceV3['PutTechCardPatternSemanticSidecar'];
      try {
        checkSignal(signal, 'input');
        if (request?.schemaVersion !== strategy.requestSchemaVersion)
          fail('invalid-request', 'input', `${strategy.label} storage request is unsupported.`);
        client = createClient(signal);
        get = method(client, 'GetTechCardPatternSemanticSidecar');
        put = method(client, 'PutTechCardPatternSemanticSidecar');
      } catch (error) {
        return blocked(error, 'not-attempted');
      }

      let currentRow: TechCardPatternSemanticSidecar | undefined;
      try {
        const response = await Reflect.apply(get, client, [
          {
            techCardId: request.currentAuthority.row.techCardId,
            patternLineKey: request.currentAuthority.row.patternLineKey,
          },
        ]);
        checkSignal(signal, 'current-get');
        currentRow = responseRow(response, 'current-get');
      } catch (error) {
        if (error instanceof StorageFailure) return blocked(error, 'not-attempted');
        if (isNotFound(error) && !signal.aborted) currentRow = undefined;
        else
          return blocked(
            new StorageFailure(
              signal.aborted ? 'cancelled' : 'current-get-failed',
              'current-get',
              signal.aborted
                ? `${strategy.label} persistence was cancelled.`
                : 'The current sidecar GET failed.',
            ),
            'not-attempted',
          );
      }

      let planned: PatternImportDxfProductCompositeSidecarStoragePlannedWriteV3<MediaType>;
      let base64: string;
      try {
        const current = await mapCurrentEvidence(
          currentRow,
          request.currentAuthority,
          acceptedCurrentMediaTypes,
        );
        try {
          planned = await strategy.prepare(request, current, crypto);
        } catch (error) {
          if (error instanceof StorageFailure) throw error;
          fail(
            'planning-blocked',
            'planning',
            error instanceof Error
              ? `${strategy.label} planning failed: ${error.message}`
              : `${strategy.label} planning failed closed.`,
          );
        }
        if (
          planned.mediaType !== strategy.mediaType ||
          !SHA256.test(planned.sidecarSha256) ||
          !Number.isSafeInteger(planned.byteLength) ||
          planned.byteLength !== planned.bytes.byteLength ||
          planned.byteLength < 1 ||
          planned.byteLength > MAX_SIDECAR_BYTES ||
          (planned.previousSidecarSha256 !== null && !SHA256.test(planned.previousSidecarSha256)) ||
          !Number.isSafeInteger(planned.transport.patternVersion) ||
          planned.transport.patternVersion < 1 ||
          !SHA256.test(planned.transport.postSaveReceiptSha256) ||
          !Number.isSafeInteger(planned.transport.selectedOperationNumber) ||
          planned.transport.selectedOperationNumber < 1
        )
          fail('next-sidecar-invalid', 'planning', 'Planned sidecar metadata is invalid.');
        let canonical = false;
        try {
          canonical = await strategy.verifyCanonical(planned.bytes.slice(), crypto);
        } catch {
          canonical = false;
        }
        if (!canonical)
          fail('next-sidecar-invalid', 'planning', 'Planned sidecar bytes are not canonical.');
        base64 = bytesToBase64(planned.bytes);
        verifyCurrentTransportBinding(currentRow, planned);
        checkSignal(signal, 'planning');
      } catch (error) {
        return blocked(error, 'not-attempted');
      }

      try {
        checkSignal(signal, 'pre-put');
        if (strategy.beforeRequest) await strategy.beforeRequest(request, planned, signal);
        checkSignal(signal, 'pre-put');
      } catch (error) {
        if (error instanceof StorageFailure) return blocked(error, 'not-attempted');
        return blocked(
          new StorageFailure(
            signal.aborted ? 'cancelled' : 'pre-put-blocked',
            'pre-put',
            signal.aborted
              ? `${strategy.label} persistence was cancelled before PUT.`
              : error instanceof Error
                ? `${strategy.label} pre-PUT currentness check failed: ${error.message}`
                : `${strategy.label} pre-PUT currentness check failed closed.`,
          ),
          'not-attempted',
        );
      }

      let putRow: TechCardPatternSemanticSidecar | undefined;
      try {
        const response = await Reflect.apply(put, client, [
          {
            techCardId: planned.authority.row.techCardId,
            patternLineKey: planned.authority.row.patternLineKey,
            expectedDxfSha256: planned.authority.row.sha256,
            expectedPatternVersion: planned.transport.patternVersion,
            expectedPostSaveReceiptSha256: planned.transport.postSaveReceiptSha256,
            expectedCardLockVersion: planned.authority.row.cardLockVersion,
            expectedSavedRowRevision: planned.authority.row.revision,
            // Proto presence is the CAS: explicit empty string means "require absent".
            expectedPreviousSidecarSha256: planned.previousSidecarSha256 ?? '',
            expectedServerAssemblyRevision: planned.authority.serverAssemblyRevision,
            expectedAssemblyTopologySha256: planned.authority.assemblyTopologySha256,
            selectedOperationNumber: planned.transport.selectedOperationNumber,
            mediaType: planned.mediaType,
            sidecarSha256: planned.sidecarSha256,
            sidecarBytes: base64,
          },
        ]);
        checkSignal(signal, 'put');
        putRow = responseRow(response, 'put');
        await verifyStoredRow(putRow, planned, 'put', strategy.verifyCanonical, crypto);
      } catch (error) {
        if (error instanceof StorageFailure)
          return blocked(error, error.code === 'cancelled' ? 'unknown' : 'acknowledged-unverified');
        return blocked(
          new StorageFailure(
            signal.aborted ? 'cancelled' : 'put-failed',
            'put',
            signal.aborted
              ? `${strategy.label} PUT was cancelled and may have committed.`
              : `${strategy.label} PUT failed and may have committed.`,
          ),
          'unknown',
        );
      }

      let getRow: TechCardPatternSemanticSidecar | undefined;
      try {
        const response = await Reflect.apply(get, client, [
          {
            techCardId: planned.authority.row.techCardId,
            patternLineKey: planned.authority.row.patternLineKey,
          },
        ]);
        checkSignal(signal, 'get');
        getRow = responseRow(response, 'get');
        await verifyStoredRow(getRow, planned, 'get', strategy.verifyCanonical, crypto);
        if (putRow?.sidecarBytes !== getRow?.sidecarBytes)
          fail(
            'dual-readback-mismatch',
            'dual-readback',
            'PUT echo and fresh GET sidecar bytes differ.',
          );
      } catch (error) {
        if (error instanceof StorageFailure) return blocked(error, 'acknowledged-unverified');
        return blocked(
          new StorageFailure(
            signal.aborted ? 'cancelled' : 'get-failed',
            'get',
            signal.aborted
              ? 'Post-PUT GET was cancelled.'
              : 'PUT was acknowledged but the fresh GET failed.',
          ),
          'acknowledged-unverified',
        );
      }

      return Object.freeze({
        ok: true as const,
        receipt: Object.freeze({
          schemaVersion: strategy.receiptSchemaVersion,
          techCardId: planned.authority.row.techCardId,
          patternLineKey: planned.authority.row.patternLineKey,
          savedRowRevision: planned.authority.row.revision,
          cardLockVersion: planned.authority.row.cardLockVersion,
          dxfSha256: planned.authority.row.sha256,
          patternVersion: planned.transport.patternVersion,
          postSaveReceiptSha256: planned.transport.postSaveReceiptSha256,
          selectedOperationNumber: planned.transport.selectedOperationNumber,
          serverAssemblyRevision: planned.authority.serverAssemblyRevision,
          assemblyTopologySha256: planned.authority.assemblyTopologySha256,
          previousSidecarSha256: planned.previousSidecarSha256,
          sidecarSha256: planned.sidecarSha256,
          canonicalByteLength: planned.byteLength,
          mediaType: planned.mediaType,
        }),
        writeOutcome: 'verified' as const,
        blockers: Object.freeze([]) as readonly [],
        claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_CLAIMS_V3,
      });
    },
    claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_CLAIMS_V3,
  });
}

export function createPatternImportDxfProductCompositeSidecarStorageAdapterV3(
  deps: PatternImportDxfProductCompositeSidecarStorageDepsV3,
): PatternImportDxfProductCompositeSidecarStorageAdapterV3 {
  return createPatternImportDxfProductCompositeSidecarStorageWriterV3(deps, {
    requestSchemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V3,
    receiptSchemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V3,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
    acceptedCurrentMediaTypes: Object.freeze([
      PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
    ]),
    label: 'Composite V3',
    prepare: async (request, current, crypto) =>
      prepareWrite(
        request,
        current as PatternImportDxfProductCompositeSidecarVerifiedGetV3,
        crypto,
      ),
    verifyCanonical: async (bytes, crypto) => {
      const decoded = await decodePatternImportDxfProductCompositeSidecarV3(bytes, crypto);
      return decoded.ok && decoded.exactTopology !== null;
    },
  });
}
