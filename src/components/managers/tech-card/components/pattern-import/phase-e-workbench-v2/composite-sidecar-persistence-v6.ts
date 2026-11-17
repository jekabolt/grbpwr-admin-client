import { abortableAdminService } from 'api/api';
import type { AdminService, TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import {
  readPatternImportDxfProductCompositeComponentBytesV3,
  type PatternImportDxfProductCompositeSidecarBindingsV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  createPatternImportDxfProductCompositeSidecarStorageWriterV3,
  type PatternImportDxfProductCompositeSidecarStorageDepsV3,
  type PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
  type PatternImportDxfProductCompositeSidecarStorageWriterAdapterV3,
  type PatternImportDxfProductCompositeSidecarStorageWriterResultV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
  decodePatternImportDxfProductCompositeSidecarV5,
} from './composite-sidecar-v5';
import { CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1 } from './cad-mannequin-arrangement-document-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
  decodePatternImportDxfProductCompositeSidecarV6,
  encodePatternImportDxfProductCompositeSidecarV6,
  readPatternImportDxfProductCompositeComponentBytesV6,
  type PatternImportDxfProductCompositeSidecarOwnerV6,
} from './composite-sidecar-v6';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6 =
  'pattern-import-dxf-product-composite-sidecar-storage-request/6' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V6 =
  'pattern-import-dxf-product-composite-sidecar-storage-receipt/6' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SAVE_V6 =
  'pattern-import-dxf-product-composite-sidecar-save/6' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_REQUEST_V6 =
  'pattern-import-dxf-product-composite-sidecar-restore-request/6' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_V6 =
  'pattern-import-dxf-product-composite-sidecar-restore/6' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V6 = Object.freeze({
  explicitUserActionRequired: true,
  autosaveAllowed: false,
  localStorageAllowed: false,
  genericSemanticSidecarRpcReused: true,
  freshCurrentGetBeforePut: true,
  exactNestedV5BytesPreserved: true,
  currentAuthorityAndArrangementTargetBound: true,
  putEchoAndFreshGetVerified: true,
  unknownOutcomeFreshGetRecovery: true,
  abortFailsClosed: true,
  runtimeServerMediaAdmissionProven: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS_V6 = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V6,
  genericSemanticSidecarRpcReused: false as const,
  freshCurrentGetBeforePut: false as const,
  exactNestedV5BytesPreserved: false as const,
  currentAuthorityAndArrangementTargetBound: false as const,
  putEchoAndFreshGetVerified: false as const,
  unknownOutcomeFreshGetRecovery: false as const,
});

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_CLAIMS_V6 = Object.freeze({
  readOnly: true,
  putAllowed: false,
  autosaveAllowed: false,
  localStorageAllowed: false,
  futureOwnerRequired: false,
  futureArrangementTargetRequired: false,
  freshCurrentGet: true,
  exactCurrentAuthorityBound: true,
  storedBytesShaAndCanonicalV6Verified: true,
  nestedCompositeV5BytesReturned: true,
} as const);

const BLOCKED_RESTORE_CLAIMS_V6 = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_CLAIMS_V6,
  freshCurrentGet: false as const,
  exactCurrentAuthorityBound: false as const,
  storedBytesShaAndCanonicalV6Verified: false as const,
  nestedCompositeV5BytesReturned: false as const,
});

export type PatternImportDxfProductCompositeSidecarArrangementTargetV6 = Readonly<{
  sizeToken: string;
  catalogCanonicalSha256: string;
  sizeSelectionCanonicalSha256: string;
  baseModelId: number;
  modelFormRevisionKeyV1: string;
  poseCanonicalKey: string;
}>;

export type PatternImportDxfProductCompositeSidecarStorageRequestV6 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6;
  currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
  arrangementTarget: PatternImportDxfProductCompositeSidecarArrangementTargetV6;
  nextOwner: PatternImportDxfProductCompositeSidecarOwnerV6;
}>;

export type PatternImportDxfProductCompositeSidecarRestoreRequestV6 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_REQUEST_V6;
  currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
}>;

export type PatternImportDxfProductCompositeSidecarStorageResultV6 =
  PatternImportDxfProductCompositeSidecarStorageWriterResultV3<
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V6
  >;

export type PatternImportDxfProductCompositeSidecarStorageAdapterV6 =
  PatternImportDxfProductCompositeSidecarStorageWriterAdapterV3<
    PatternImportDxfProductCompositeSidecarStorageRequestV6,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V6
  >;

export type PatternImportDxfProductCompositeSidecarSaveBlockerV6 = Readonly<{
  code:
    | 'storage-blocked'
    | 'cancelled'
    | 'readback-failed'
    | 'readback-missing'
    | 'readback-invalid'
    | 'readback-drift';
  detail: string;
}>;

type StorageReceiptV6 = Extract<
  PatternImportDxfProductCompositeSidecarStorageResultV6,
  { ok: true }
>['receipt'];

export type PatternImportDxfProductCompositeSidecarSaveResultV6 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SAVE_V6;
      writeOutcome: 'verified' | 'verified-after-unknown';
      receipt: StorageReceiptV6;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V6;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SAVE_V6;
      writeOutcome: 'not-attempted' | 'unknown' | 'acknowledged-unverified';
      receipt: null;
      blockers: readonly [PatternImportDxfProductCompositeSidecarSaveBlockerV6];
      claims: typeof BLOCKED_CLAIMS_V6;
    }>;

type DecodedCompositeV6Success = Extract<
  Awaited<ReturnType<typeof decodePatternImportDxfProductCompositeSidecarV6>>,
  { ok: true }
>;

export type PatternImportDxfProductCompositeSidecarRestoreResultV6 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_V6;
      sidecarSha256: string;
      canonicalByteLength: number;
      mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6;
      owner: DecodedCompositeV6Success['owner'];
      arrangement: DecodedCompositeV6Success['mannequinArrangement'];
      nestedCompositeV5: DecodedCompositeV6Success['nestedCompositeV5'];
      nestedCompositeV5Bytes: Uint8Array<ArrayBuffer>;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_CLAIMS_V6;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_V6;
      blocker: PatternImportDxfProductCompositeSidecarSaveBlockerV6;
      claims: typeof BLOCKED_RESTORE_CLAIMS_V6;
    }>;

type SidecarService = Pick<
  AdminService,
  'GetTechCardPatternSemanticSidecar' | 'PutTechCardPatternSemanticSidecar'
>;

type StoredSidecarRowSnapshotV6 = Readonly<
  Pick<
    TechCardPatternSemanticSidecar,
    | 'techCardId'
    | 'patternLineKey'
    | 'dxfSha256'
    | 'patternVersion'
    | 'sidecarSha256'
    | 'mediaType'
    | 'byteLength'
    | 'sidecarBytes'
    | 'postSaveReceiptSha256'
    | 'cardLockVersion'
    | 'savedRowRevision'
  >
>;

export type PatternImportDxfProductCompositeSidecarPersistenceDepsV6 = Readonly<{
  createClient: (signal: AbortSignal) => SidecarService;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_SIDECAR_BYTES = 4 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

class CompositeV6PersistenceFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductCompositeSidecarSaveBlockerV6['code'],
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(
  code: PatternImportDxfProductCompositeSidecarSaveBlockerV6['code'],
  detail: string,
): never {
  throw new CompositeV6PersistenceFailure(code, detail);
}

function exactRecord(value: unknown, keys: readonly string[], label: string) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail('readback-invalid', `${label} must be a plain record.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    fail('readback-invalid', `${label} has missing, symbol, hidden, or unexpected fields.`);
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail('readback-invalid', `${label}.${key} must be stable data.`);
    }
    output[key] = descriptor.value;
  }
  return output;
}

function arrangementTarget(
  value: unknown,
): PatternImportDxfProductCompositeSidecarArrangementTargetV6 {
  const target = exactRecord(
    value,
    [
      'sizeToken',
      'catalogCanonicalSha256',
      'sizeSelectionCanonicalSha256',
      'baseModelId',
      'modelFormRevisionKeyV1',
      'poseCanonicalKey',
    ],
    'arrangementTarget',
  );
  if (
    typeof target.sizeToken !== 'string' ||
    !target.sizeToken ||
    target.sizeToken.trim() !== target.sizeToken ||
    target.sizeToken.length > CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxIdentifierLength ||
    typeof target.catalogCanonicalSha256 !== 'string' ||
    !SHA256.test(target.catalogCanonicalSha256) ||
    typeof target.sizeSelectionCanonicalSha256 !== 'string' ||
    !SHA256.test(target.sizeSelectionCanonicalSha256) ||
    !Number.isSafeInteger(target.baseModelId) ||
    (target.baseModelId as number) <= 0 ||
    typeof target.modelFormRevisionKeyV1 !== 'string' ||
    !target.modelFormRevisionKeyV1 ||
    target.modelFormRevisionKeyV1.trim() !== target.modelFormRevisionKeyV1 ||
    target.modelFormRevisionKeyV1.length >
      CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxModelRevisionLength ||
    typeof target.poseCanonicalKey !== 'string' ||
    !target.poseCanonicalKey ||
    target.poseCanonicalKey.trim() !== target.poseCanonicalKey ||
    target.poseCanonicalKey.length > CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxPoseCanonicalKeyLength
  ) {
    fail('readback-invalid', 'Arrangement restore target is invalid.');
  }
  return Object.freeze({
    sizeToken: target.sizeToken,
    catalogCanonicalSha256: target.catalogCanonicalSha256,
    sizeSelectionCanonicalSha256: target.sizeSelectionCanonicalSha256,
    baseModelId: target.baseModelId,
    modelFormRevisionKeyV1: target.modelFormRevisionKeyV1,
    poseCanonicalKey: target.poseCanonicalKey,
  }) as PatternImportDxfProductCompositeSidecarArrangementTargetV6;
}

function authoritySnapshot(value: unknown): PatternImportDxfProductCompositeSidecarBindingsV3 {
  const authority = exactRecord(
    value,
    ['row', 'serverAssemblyRevision', 'assemblyTopologySha256'],
    'currentAuthority',
  );
  const row = exactRecord(
    authority.row,
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
    'currentAuthority.row',
  );
  if (
    !Number.isSafeInteger(row.techCardId) ||
    (row.techCardId as number) < 1 ||
    !Number.isSafeInteger(row.revision) ||
    (row.revision as number) < 1 ||
    !Number.isSafeInteger(row.cardLockVersion) ||
    (row.cardLockVersion as number) < 0 ||
    !Number.isSafeInteger(row.sizeBytes) ||
    (row.sizeBytes as number) < 1
  ) {
    fail('readback-invalid', 'Current authority row integers are invalid.');
  }
  for (const field of ['scopeKey', 'patternLineKey'] as const) {
    const fieldValue = row[field];
    if (
      typeof fieldValue !== 'string' ||
      fieldValue.length === 0 ||
      fieldValue.length > 256 ||
      !STABLE_ID.test(fieldValue)
    ) {
      fail('readback-invalid', `Current authority ${field} is invalid.`);
    }
  }
  if (
    typeof row.url !== 'string' ||
    row.url.length === 0 ||
    row.url.length > 4_096 ||
    Array.from(row.url).some((character) => character.charCodeAt(0) <= 0x1f) ||
    /^(?:data|javascript):/i.test(row.url.trimStart()) ||
    typeof row.sha256 !== 'string' ||
    !SHA256.test(row.sha256)
  ) {
    fail('readback-invalid', 'Current authority saved-row URL or SHA is invalid.');
  }
  const revision = authority.serverAssemblyRevision;
  if (
    typeof revision !== 'string' ||
    revision.length === 0 ||
    revision.length > 512 ||
    revision.trim() !== revision ||
    /^[0-9]+$/.test(revision) ||
    encoder.encode(revision).byteLength > 512 ||
    Array.from(revision).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    }) ||
    typeof authority.assemblyTopologySha256 !== 'string' ||
    !SHA256.test(authority.assemblyTopologySha256)
  ) {
    fail('readback-invalid', 'Current Assembly revision or topology SHA is invalid.');
  }
  const rowSnapshot = Object.freeze({
    techCardId: row.techCardId as number,
    scopeKey: row.scopeKey as string,
    patternLineKey: row.patternLineKey as string,
    revision: row.revision as number,
    cardLockVersion: row.cardLockVersion as number,
    url: row.url,
    sizeBytes: row.sizeBytes as number,
    sha256: row.sha256,
  });
  return Object.freeze({
    row: rowSnapshot,
    serverAssemblyRevision: revision,
    assemblyTopologySha256: authority.assemblyTopologySha256,
  }) as PatternImportDxfProductCompositeSidecarBindingsV3;
}

function captureRequest(value: unknown): PatternImportDxfProductCompositeSidecarStorageRequestV6 {
  const request = exactRecord(
    value,
    ['schemaVersion', 'currentAuthority', 'arrangementTarget', 'nextOwner'],
    'request',
  );
  if (request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6) {
    fail('readback-invalid', 'Composite V6 persistence request schema differs.');
  }
  if (!request.nextOwner || typeof request.nextOwner !== 'object') {
    fail('readback-invalid', 'Composite V6 owner is missing.');
  }
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
    currentAuthority: authoritySnapshot(request.currentAuthority),
    arrangementTarget: arrangementTarget(request.arrangementTarget),
    nextOwner: request.nextOwner as PatternImportDxfProductCompositeSidecarOwnerV6,
  });
}

function captureRestoreRequest(
  value: unknown,
): PatternImportDxfProductCompositeSidecarRestoreRequestV6 {
  const request = exactRecord(value, ['schemaVersion', 'currentAuthority'], 'restore request');
  if (request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_REQUEST_V6) {
    fail('readback-invalid', 'Composite V6 restore request schema differs.');
  }
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_REQUEST_V6,
    currentAuthority: authoritySnapshot(request.currentAuthority),
  });
}

function sameAuthority(
  left: PatternImportDxfProductCompositeSidecarBindingsV3,
  right: PatternImportDxfProductCompositeSidecarBindingsV3,
): boolean {
  return (
    left.row.techCardId === right.row.techCardId &&
    left.row.scopeKey === right.row.scopeKey &&
    left.row.patternLineKey === right.row.patternLineKey &&
    left.row.revision === right.row.revision &&
    left.row.cardLockVersion === right.row.cardLockVersion &&
    left.row.url === right.row.url &&
    left.row.sizeBytes === right.row.sizeBytes &&
    left.row.sha256 === right.row.sha256 &&
    left.serverAssemblyRevision === right.serverAssemblyRevision &&
    left.assemblyTopologySha256 === right.assemblyTopologySha256
  );
}

function sameTarget(
  expected: PatternImportDxfProductCompositeSidecarArrangementTargetV6,
  actual: Awaited<ReturnType<typeof decodePatternImportDxfProductCompositeSidecarV6>>,
): boolean {
  if (!actual.ok) return false;
  const bindings = actual.mannequinArrangement.bindings;
  return (
    expected.sizeToken === bindings.scope.sizeToken &&
    expected.catalogCanonicalSha256 === bindings.source.catalogCanonicalSha256 &&
    expected.sizeSelectionCanonicalSha256 === bindings.source.sizeSelectionCanonicalSha256 &&
    expected.baseModelId === bindings.mannequin.baseModelId &&
    expected.modelFormRevisionKeyV1 === bindings.mannequin.modelFormRevisionKeyV1 &&
    expected.poseCanonicalKey === bindings.mannequin.poseBinding.canonicalKey
  );
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
    fail('readback-invalid', 'SHA-256 is unavailable.');
  let known: ArrayBuffer;
  try {
    known = await crypto.subtle.digest('SHA-256', encoder.encode('abc'));
  } catch {
    fail('readback-invalid', 'SHA-256 self-test failed.');
  }
  const knownHex = Array.from(new Uint8Array(known), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (known.byteLength !== 32 || knownHex !== SHA256_ABC)
    fail('readback-invalid', 'SHA-256 self-test mismatch.');
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer));
    if (digest.byteLength !== 32) throw new TypeError();
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof CompositeV6PersistenceFailure) throw error;
    fail('readback-invalid', 'SHA-256 failed.');
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value: unknown, expectedLength: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !value || value.length > MAX_SIDECAR_BYTES * 2)
    fail('readback-invalid', 'Stored V6 bytes are not bounded base64.');
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    fail('readback-invalid', 'Stored V6 bytes are not base64.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytes.byteLength !== expectedLength || bytesToBase64(bytes) !== value)
    fail('readback-invalid', 'Stored V6 bytes are noncanonical or have the wrong length.');
  return bytes;
}

const STORED_SIDECAR_ROW_REQUIRED_KEYS_V6 = Object.freeze([
  'techCardId',
  'patternLineKey',
  'dxfSha256',
  'patternVersion',
  'sidecarSha256',
  'mediaType',
  'byteLength',
  'sidecarBytes',
  'postSaveReceiptSha256',
  'cardLockVersion',
  'savedRowRevision',
] as const);
const STORED_SIDECAR_ROW_ALLOWED_KEYS_V6 = new Set<PropertyKey>([
  ...STORED_SIDECAR_ROW_REQUIRED_KEYS_V6,
  'createdAt',
  'createdBy',
]);

function responseRow(value: unknown): StoredSidecarRowSnapshotV6 | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail('readback-invalid', 'GET response is not a record.');
  const responseDescriptors = Object.getOwnPropertyDescriptors(value);
  const responseKeys = Reflect.ownKeys(responseDescriptors);
  if (responseKeys.length === 0) return undefined;
  if (
    responseKeys.length !== 1 ||
    responseKeys[0] !== 'semanticSidecar' ||
    !responseDescriptors.semanticSidecar
  )
    fail('readback-invalid', 'GET response has symbol, hidden, or unexpected fields.');
  const descriptor = responseDescriptors.semanticSidecar;
  if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value'))
    fail('readback-invalid', 'GET semanticSidecar is not stable data.');
  if (descriptor.value === undefined) return undefined;
  if (
    !descriptor.value ||
    typeof descriptor.value !== 'object' ||
    Array.isArray(descriptor.value) ||
    Object.getPrototypeOf(descriptor.value) !== Object.prototype
  )
    fail('readback-invalid', 'GET semanticSidecar is not a record.');
  const rowDescriptors = Object.getOwnPropertyDescriptors(descriptor.value);
  const rowKeys = Reflect.ownKeys(rowDescriptors);
  if (
    rowKeys.some(
      (key) =>
        typeof key !== 'string' ||
        !STORED_SIDECAR_ROW_ALLOWED_KEYS_V6.has(key) ||
        !rowDescriptors[key]?.enumerable ||
        !Object.prototype.hasOwnProperty.call(rowDescriptors[key], 'value'),
    ) ||
    STORED_SIDECAR_ROW_REQUIRED_KEYS_V6.some((key) => !rowDescriptors[key])
  ) {
    fail(
      'readback-invalid',
      'GET semanticSidecar has accessor, symbol, hidden, or unexpected fields.',
    );
  }
  const read = <Key extends (typeof STORED_SIDECAR_ROW_REQUIRED_KEYS_V6)[number]>(key: Key) =>
    rowDescriptors[key]!.value as TechCardPatternSemanticSidecar[Key];
  return Object.freeze({
    techCardId: read('techCardId'),
    patternLineKey: read('patternLineKey'),
    dxfSha256: read('dxfSha256'),
    patternVersion: read('patternVersion'),
    sidecarSha256: read('sidecarSha256'),
    mediaType: read('mediaType'),
    byteLength: read('byteLength'),
    sidecarBytes: read('sidecarBytes'),
    postSaveReceiptSha256: read('postSaveReceiptSha256'),
    cardLockVersion: read('cardLockVersion'),
    savedRowRevision: read('savedRowRevision'),
  });
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail('readback-invalid', `${label} must be a plain record.`);
  }
  return value as Record<string, unknown>;
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

function checkReadbackSignal(signal: AbortSignal): void {
  if (signal.aborted) fail('cancelled', 'Composite V6 readback was cancelled.');
}

async function readbackStep<T>(step: Promise<T>, signal: AbortSignal): Promise<T> {
  try {
    const value = await step;
    checkReadbackSignal(signal);
    return value;
  } catch (error) {
    checkReadbackSignal(signal);
    throw error;
  }
}

function readSemanticReceipt(bytes: Uint8Array<ArrayBuffer>) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes)) as unknown;
  } catch {
    fail('readback-invalid', 'Nested semantic-product-v1 bytes are invalid.');
  }
  const document = plainRecord(parsed, 'semantic');
  const persistence = plainRecord(document.persistence, 'semantic.persistence');
  const pattern = plainRecord(persistence.pattern, 'semantic.pattern');
  if (
    !Number.isSafeInteger(pattern.version) ||
    (pattern.version as number) < 1 ||
    typeof persistence.receiptSealSha256 !== 'string' ||
    !SHA256.test(persistence.receiptSealSha256)
  ) {
    fail('readback-invalid', 'Nested semantic-product-v1 receipt is invalid.');
  }
  return Object.freeze({
    patternVersion: pattern.version as number,
    postSaveReceiptSha256: persistence.receiptSealSha256,
  });
}

async function decodedOwner(
  owner: PatternImportDxfProductCompositeSidecarOwnerV6,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  const encoded = encodePatternImportDxfProductCompositeSidecarV6(owner);
  if (!encoded.ok) fail('readback-invalid', 'A genuine Composite V6 owner is required.');
  const actualSha256 = await sha256(encoded.bytes.slice(), crypto);
  if (
    encoded.canonicalByteLength !== encoded.bytes.byteLength ||
    encoded.canonicalByteLength < 1 ||
    encoded.canonicalByteLength > MAX_SIDECAR_BYTES ||
    encoded.canonicalSha256 !== actualSha256
  ) {
    fail('readback-invalid', 'Composite V6 encoded bytes differ from their canonical seal.');
  }
  const decoded = await decodePatternImportDxfProductCompositeSidecarV6(encoded.bytes, crypto);
  if (!decoded.ok)
    fail('readback-invalid', `Composite V6 is invalid: ${decoded.blockers[0].detail}`);
  return Object.freeze({ encoded, decoded });
}

async function transportFromDecoded(
  decoded: Extract<
    Awaited<ReturnType<typeof decodePatternImportDxfProductCompositeSidecarV6>>,
    { ok: true }
  >,
) {
  const semantic = readPatternImportDxfProductCompositeComponentBytesV3(
    decoded.nestedCompositeV5.nestedCompositeV4.nestedCompositeV3.owner,
    'semantic-product-v1',
  );
  if (!semantic) fail('readback-invalid', 'Nested Composite V3 has no semantic-product-v1 bytes.');
  const receipt = readSemanticReceipt(semantic);
  const selectedOperationNumber =
    decoded.nestedCompositeV5.nestedCompositeV4.exactNSeam.carrier.bindings.selectedOperation
      .sourceOperationNumber;
  if (!Number.isSafeInteger(selectedOperationNumber) || selectedOperationNumber < 1)
    fail('readback-invalid', 'Nested selected Assembly Order operation is invalid.');
  return Object.freeze({ ...receipt, selectedOperationNumber });
}

async function nestedV5FromCurrent(
  current: Extract<
    PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
    { status: 'present' }
  >,
  authority: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  if (current.sha256 !== (await sha256(current.bytes, crypto)))
    fail('readback-invalid', 'Current sidecar SHA differs from its bytes.');
  if (current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5) {
    const decoded = await decodePatternImportDxfProductCompositeSidecarV5(current.bytes, crypto);
    if (!decoded.ok || !sameAuthority(decoded.document.bindings, authority))
      fail('readback-drift', 'Current Composite V5 authority differs.');
    return current.bytes.slice();
  }
  if (current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6) {
    const decoded = await decodePatternImportDxfProductCompositeSidecarV6(current.bytes, crypto);
    if (!decoded.ok || !sameAuthority(decoded.document.bindings, authority))
      fail('readback-drift', 'Current Composite V6 authority differs.');
    const nested = readPatternImportDxfProductCompositeComponentBytesV6(
      decoded.owner,
      'composite-v5',
    );
    if (!nested) fail('readback-invalid', 'Current Composite V6 has no nested V5 bytes.');
    return nested;
  }
  fail('readback-invalid', 'Current sidecar is not Composite V5 or V6.');
}

async function prepareV6(
  request: PatternImportDxfProductCompositeSidecarStorageRequestV6,
  current: PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  if (current.status !== 'present')
    fail('readback-missing', 'Composite V6 requires current V5/V6.');
  const target = arrangementTarget(request.arrangementTarget);
  const next = await decodedOwner(request.nextOwner, crypto);
  if (!sameAuthority(request.currentAuthority, next.decoded.document.bindings))
    fail('readback-drift', 'Current authority differs from Composite V6 bindings.');
  if (!sameTarget(target, next.decoded))
    fail('readback-drift', 'Arrangement target differs from Composite V6 bindings.');
  if (next.decoded.document.writeCas.expectedPreviousSidecarSha256 !== current.sha256)
    fail('readback-drift', 'Composite V6 CAS differs from the fresh current GET.');
  const currentNestedV5 = await nestedV5FromCurrent(current, request.currentAuthority, crypto);
  const nextNestedV5 = readPatternImportDxfProductCompositeComponentBytesV6(
    next.decoded.owner,
    'composite-v5',
  );
  if (!nextNestedV5 || !sameBytes(currentNestedV5, nextNestedV5))
    fail('readback-drift', 'Nested Composite V5 bytes changed during arrangement save.');
  const transport = await transportFromDecoded(next.decoded);
  return Object.freeze({
    authority: request.currentAuthority,
    transport,
    previousSidecarSha256: current.sha256,
    sidecarSha256: next.encoded.canonicalSha256,
    byteLength: next.encoded.canonicalByteLength,
    bytes: next.encoded.bytes.slice(),
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
  });
}

export function createPatternImportDxfProductCompositeSidecarStorageAdapterV6(
  deps: PatternImportDxfProductCompositeSidecarStorageDepsV3,
): PatternImportDxfProductCompositeSidecarStorageAdapterV6 {
  return createPatternImportDxfProductCompositeSidecarStorageWriterV3(deps, {
    requestSchemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
    receiptSchemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V6,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
    acceptedCurrentMediaTypes: Object.freeze([
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
    ]),
    label: 'Composite V6 mannequin arrangement',
    prepare: prepareV6,
    verifyCanonical: async (bytes, crypto) =>
      (await decodePatternImportDxfProductCompositeSidecarV6(bytes, crypto)).ok,
  });
}

function sameStoredRow(
  row: StoredSidecarRowSnapshotV6,
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

async function readExactStoredV6(
  deps: PatternImportDxfProductCompositeSidecarPersistenceDepsV6,
  request: Readonly<{
    currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
    arrangementTarget?: PatternImportDxfProductCompositeSidecarArrangementTargetV6;
  }>,
  signal: AbortSignal,
) {
  checkReadbackSignal(signal);
  const client = deps.createClient(signal);
  let response: Awaited<ReturnType<SidecarService['GetTechCardPatternSemanticSidecar']>>;
  try {
    response = await client.GetTechCardPatternSemanticSidecar({
      techCardId: request.currentAuthority.row.techCardId,
      patternLineKey: request.currentAuthority.row.patternLineKey,
    });
  } catch (error) {
    if (signal.aborted) fail('cancelled', 'Composite V6 readback was cancelled.');
    if (isNotFound(error)) fail('readback-missing', 'Composite V6 readback is absent.');
    fail('readback-failed', 'Composite V6 readback GET failed.');
  }
  checkReadbackSignal(signal);
  const row = responseRow(response);
  if (!row) fail('readback-missing', 'Composite V6 readback is absent.');
  if (
    !sameStoredRow(row, request.currentAuthority) ||
    row.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 ||
    typeof row.sidecarSha256 !== 'string' ||
    !SHA256.test(row.sidecarSha256) ||
    !Number.isSafeInteger(row.byteLength) ||
    (row.byteLength as number) < 1 ||
    (row.byteLength as number) > MAX_SIDECAR_BYTES
  ) {
    fail('readback-drift', 'Stored Composite V6 row differs from current authority.');
  }
  const bytes = base64ToBytes(row.sidecarBytes, row.byteLength as number);
  const verifiedSha256 = await readbackStep(
    sha256(bytes, deps.crypto ?? globalThis.crypto),
    signal,
  );
  if (row.sidecarSha256 !== verifiedSha256)
    fail('readback-invalid', 'Stored Composite V6 SHA differs from its bytes.');
  const decoded = await readbackStep(
    decodePatternImportDxfProductCompositeSidecarV6(bytes, deps.crypto ?? globalThis.crypto),
    signal,
  );
  if (
    !decoded.ok ||
    !sameAuthority(request.currentAuthority, decoded.document.bindings) ||
    (request.arrangementTarget !== undefined &&
      !sameTarget(arrangementTarget(request.arrangementTarget), decoded))
  ) {
    fail('readback-drift', 'Stored Composite V6 authority or arrangement target drifted.');
  }
  const nestedCompositeV5Bytes = readPatternImportDxfProductCompositeComponentBytesV6(
    decoded.owner,
    'composite-v5',
  );
  if (!nestedCompositeV5Bytes)
    fail('readback-invalid', 'Stored Composite V6 has no verified nested V5 bytes.');
  const transport = await readbackStep(transportFromDecoded(decoded), signal);
  if (
    row.patternVersion !== transport.patternVersion ||
    row.postSaveReceiptSha256 !== transport.postSaveReceiptSha256
  ) {
    fail('readback-drift', 'Stored row receipt differs from nested semantic-product-v1.');
  }
  checkReadbackSignal(signal);
  return Object.freeze({
    row,
    bytes,
    decoded,
    transport,
    nestedCompositeV5Bytes,
    verifiedSha256,
  });
}

function blocker(
  error: unknown,
  fallback: PatternImportDxfProductCompositeSidecarSaveBlockerV6['code'],
): PatternImportDxfProductCompositeSidecarSaveBlockerV6 {
  return Object.freeze({
    code: error instanceof CompositeV6PersistenceFailure ? error.code : fallback,
    detail:
      error instanceof CompositeV6PersistenceFailure
        ? error.message
        : 'Composite V6 persistence failed closed.',
  });
}

function failed(
  error: unknown,
  writeOutcome: Extract<
    PatternImportDxfProductCompositeSidecarSaveResultV6,
    { ok: false }
  >['writeOutcome'],
): Extract<PatternImportDxfProductCompositeSidecarSaveResultV6, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SAVE_V6,
    writeOutcome,
    receipt: null,
    blockers: Object.freeze([blocker(error, 'storage-blocked')]) as readonly [
      PatternImportDxfProductCompositeSidecarSaveBlockerV6,
    ],
    claims: BLOCKED_CLAIMS_V6,
  });
}

function restoreFailed(error: unknown): PatternImportDxfProductCompositeSidecarRestoreResultV6 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_V6,
    blocker: blocker(error, 'readback-failed'),
    claims: BLOCKED_RESTORE_CLAIMS_V6,
  });
}

async function recoveredReceipt(
  request: PatternImportDxfProductCompositeSidecarStorageRequestV6,
  stored: Awaited<ReturnType<typeof readExactStoredV6>>,
): Promise<StorageReceiptV6> {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V6,
    techCardId: request.currentAuthority.row.techCardId,
    patternLineKey: request.currentAuthority.row.patternLineKey,
    savedRowRevision: request.currentAuthority.row.revision,
    cardLockVersion: request.currentAuthority.row.cardLockVersion,
    dxfSha256: request.currentAuthority.row.sha256,
    patternVersion: stored.transport.patternVersion,
    postSaveReceiptSha256: stored.transport.postSaveReceiptSha256,
    selectedOperationNumber: stored.transport.selectedOperationNumber,
    serverAssemblyRevision: request.currentAuthority.serverAssemblyRevision,
    assemblyTopologySha256: request.currentAuthority.assemblyTopologySha256,
    previousSidecarSha256: stored.decoded.document.writeCas.expectedPreviousSidecarSha256,
    sidecarSha256: stored.verifiedSha256,
    canonicalByteLength: stored.bytes.byteLength,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
  });
}

export function createPatternImportDxfProductCompositeSidecarPersistenceV6(
  deps: PatternImportDxfProductCompositeSidecarPersistenceDepsV6,
) {
  const adapter = createPatternImportDxfProductCompositeSidecarStorageAdapterV6(deps);
  return Object.freeze({
    adapter,
    claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V6,
    restoreClaims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_CLAIMS_V6,
    async restore(
      request: PatternImportDxfProductCompositeSidecarRestoreRequestV6,
      signal: AbortSignal,
    ): Promise<PatternImportDxfProductCompositeSidecarRestoreResultV6> {
      try {
        const captured = captureRestoreRequest(request);
        const stored = await readExactStoredV6(deps, captured, signal);
        checkReadbackSignal(signal);
        return Object.freeze({
          ok: true as const,
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_V6,
          sidecarSha256: stored.verifiedSha256,
          canonicalByteLength: stored.bytes.byteLength,
          mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
          owner: stored.decoded.owner,
          arrangement: stored.decoded.mannequinArrangement,
          nestedCompositeV5: stored.decoded.nestedCompositeV5,
          nestedCompositeV5Bytes: stored.nestedCompositeV5Bytes.slice(),
          blocker: null,
          claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_CLAIMS_V6,
        });
      } catch (error) {
        return restoreFailed(error);
      }
    },
    async read(
      request: PatternImportDxfProductCompositeSidecarStorageRequestV6,
      signal: AbortSignal,
    ) {
      try {
        const captured = captureRequest(request);
        const stored = await readExactStoredV6(deps, captured, signal);
        checkReadbackSignal(signal);
        return Object.freeze({
          ok: true as const,
          ...stored,
        });
      } catch (error) {
        return Object.freeze({ ok: false as const, blocker: blocker(error, 'readback-failed') });
      }
    },
    async save(
      request: PatternImportDxfProductCompositeSidecarStorageRequestV6,
      signal: AbortSignal,
    ): Promise<PatternImportDxfProductCompositeSidecarSaveResultV6> {
      let captured: PatternImportDxfProductCompositeSidecarStorageRequestV6;
      try {
        captured = captureRequest(request);
      } catch (error) {
        return failed(error, 'not-attempted');
      }
      const stored = await adapter.persist(captured, signal);
      if (signal.aborted) {
        return failed(
          new CompositeV6PersistenceFailure('cancelled', 'Composite V6 save was cancelled.'),
          stored.ok ? 'acknowledged-unverified' : stored.writeOutcome,
        );
      }
      if (stored.ok) {
        return Object.freeze({
          ok: true as const,
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SAVE_V6,
          writeOutcome: 'verified' as const,
          receipt: stored.receipt,
          blockers: Object.freeze([]) as readonly [],
          claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V6,
        });
      }
      if (stored.writeOutcome === 'not-attempted' || signal.aborted) {
        return failed(
          signal.aborted
            ? new CompositeV6PersistenceFailure('cancelled', 'Composite V6 save was cancelled.')
            : stored.blockers[0],
          stored.writeOutcome,
        );
      }
      try {
        const recovered = await readExactStoredV6(deps, captured, signal);
        checkReadbackSignal(signal);
        const intended = encodePatternImportDxfProductCompositeSidecarV6(captured.nextOwner);
        if (!intended.ok || !sameBytes(intended.bytes, recovered.bytes)) {
          fail('readback-drift', 'Unknown write outcome resolved to different Composite V6 bytes.');
        }
        const receipt = await recoveredReceipt(captured, recovered);
        checkReadbackSignal(signal);
        return Object.freeze({
          ok: true as const,
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SAVE_V6,
          writeOutcome: 'verified-after-unknown' as const,
          receipt,
          blockers: Object.freeze([]) as readonly [],
          claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V6,
        });
      } catch (error) {
        return failed(error, stored.writeOutcome);
      }
    },
  });
}

export function createPatternImportDxfProductCompositeSidecarProductionPersistenceV6(
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
) {
  return createPatternImportDxfProductCompositeSidecarPersistenceV6({
    createClient: (signal) => abortableAdminService(signal),
    crypto,
  });
}
