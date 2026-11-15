import type { AdminService, TechCardPatternSemanticSidecar } from 'api/proto-http/admin';

import {
  PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
  encodePatternImportDxfProductSemanticSidecarV1,
  type PatternImportDxfProductSemanticSidecarOwnerV1,
} from './pattern-import-dxf-product-semantic-sidecar-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_STORAGE_CLIENT_V1 =
  'pattern-import-dxf-product-sidecar-storage-client/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_STORAGE_RECEIPT_V1 =
  'pattern-import-dxf-product-sidecar-storage-receipt/1' as const;

export type PatternImportDxfProductSidecarStorageServiceV1 = Pick<
  AdminService,
  'PutTechCardPatternSemanticSidecar' | 'GetTechCardPatternSemanticSidecar'
>;

export type PatternImportDxfProductSidecarStorageBlockerV1 = Readonly<{
  code:
    | 'invalid-owner'
    | 'invalid-binding'
    | 'sha256-unavailable'
    | 'put-failed'
    | 'put-readback-invalid'
    | 'get-failed'
    | 'get-readback-invalid'
    | 'dual-readback-mismatch';
  phase: 'input' | 'local-hash' | 'put' | 'get' | 'dual-readback';
  detail: string;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_STORAGE_ACCEPTED_CLAIMS_V1 = Object.freeze({
  opaqueProductG4f4OwnerRequired: true,
  callerSuppliedDecodedDocumentAccepted: false,
  productMediaEnvelopeRequired: true,
  serverComputedSidecarShaRequired: true,
  freshNarrowReadbackPerformed: true,
  sidecarPersisted: true,
  dxfAndSidecarAtomicStorageAccepted: true,
  initialDxfSaveAndSidecarSameTransaction: false,
  trustedAuthorityIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  opaqueProductG4f4OwnerRequired: true as const,
  callerSuppliedDecodedDocumentAccepted: false as const,
  productMediaEnvelopeRequired: true as const,
  serverComputedSidecarShaRequired: true as const,
  freshNarrowReadbackPerformed: false as const,
  sidecarPersisted: false as const,
  dxfAndSidecarAtomicStorageAccepted: false as const,
  initialDxfSaveAndSidecarSameTransaction: false as const,
  trustedAuthorityIntegrated: false as const,
  productionReady: false as const,
});

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_STORAGE_CLIENT_CONTRACT_V1 = Object.freeze({
  inputAuthority: 'opaque genuine product G4F4 owner only',
  chronology: Object.freeze([
    'encode-and-rehash-owned-product-g4f4-bytes',
    'put-product-media-row-locked-post-save-cas',
    'validate-put-transaction-readback',
    'get-fresh-narrow-readback',
    'rehash-and-exact-compare-both-readbacks',
  ] as const),
  retrySafety:
    'same binding is an idempotent upsert; a put transport failure is unknown, not proof of absence',
  initialDxfSaveAndSidecarSameTransaction: false,
  trustedAuthorityIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfProductSidecarStorageResultV1 =
  | Readonly<{
      ok: true;
      receipt: Readonly<{
        schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_STORAGE_RECEIPT_V1;
        techCardId: number;
        cardLockVersion: number;
        patternLineKey: string;
        dxfSha256: string;
        patternVersion: number;
        postSaveReceiptSha256: string;
        sidecarSha256: string;
        mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1;
        canonicalByteLength: number;
      }>;
      writeOutcome: 'verified';
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_STORAGE_ACCEPTED_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      writeOutcome: 'not-attempted' | 'unknown' | 'acknowledged-unverified';
      blockers: readonly [PatternImportDxfProductSidecarStorageBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

type ExpectedBinding = Readonly<{
  techCardId: number;
  cardLockVersion: number;
  patternLineKey: string;
  dxfSha256: string;
  patternVersion: number;
  postSaveReceiptSha256: string;
  sidecarSha256: string;
  byteLength: number;
  bytes: Uint8Array<ArrayBuffer>;
  base64: string;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_SIDECAR_BYTES = 4 * 1024 * 1024;
const MAX_DETAIL_BYTES = 1_024;
const SHA256_KAT_PREIMAGE = new TextEncoder().encode('abc');
const SHA256_KAT_DIGEST = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const textEncoder = new TextEncoder();

class StorageFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductSidecarStorageBlockerV1['code'],
    readonly phase: PatternImportDxfProductSidecarStorageBlockerV1['phase'],
    message: string,
  ) {
    super(message);
  }
}

function fail(
  code: PatternImportDxfProductSidecarStorageBlockerV1['code'],
  phase: PatternImportDxfProductSidecarStorageBlockerV1['phase'],
  detail: string,
): never {
  throw new StorageFailure(code, phase, detail);
}

function bounded(value: string): string {
  if (textEncoder.encode(value).byteLength <= MAX_DETAIL_BYTES) return value;
  let output = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${output}${scalar}…`).byteLength > MAX_DETAIL_BYTES) break;
    output += scalar;
  }
  return `${output}…`;
}

function blocked(
  error: unknown,
  writeOutcome: 'not-attempted' | 'unknown' | 'acknowledged-unverified',
): PatternImportDxfProductSidecarStorageResultV1 {
  const known = error instanceof StorageFailure;
  return Object.freeze({
    ok: false as const,
    receipt: null,
    writeOutcome,
    blockers: Object.freeze([
      Object.freeze({
        code: known ? error.code : ('get-readback-invalid' as const),
        phase: known ? error.phase : ('get' as const),
        detail: bounded(
          known
            ? error.message
            : 'Product semantic-sidecar storage rejected an inconsistent response.',
        ),
      }),
    ]) as readonly [PatternImportDxfProductSidecarStorageBlockerV1],
    claims: BLOCKED_CLAIMS,
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

function base64ToBytes(value: unknown, phase: 'put' | 'get'): Uint8Array<ArrayBuffer> {
  const code = phase === 'put' ? 'put-readback-invalid' : 'get-readback-invalid';
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !BASE64.test(value)
  )
    fail(code, phase, `${phase} sidecar_bytes is not canonical base64.`);
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    fail(code, phase, `${phase} sidecar_bytes base64 decode failed.`);
  }
  if (binary.length < 1 || binary.length > MAX_SIDECAR_BYTES)
    fail(code, phase, `${phase} sidecar_bytes violates the 1..4 MiB bound.`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytesToBase64(bytes) !== value)
    fail(code, phase, `${phase} sidecar_bytes is not canonical base64.`);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function digest(crypto: Pick<Crypto, 'subtle'>, bytes: Uint8Array): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'local-hash', 'Web Crypto SHA-256 is unavailable.');
  try {
    return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice())));
  } catch {
    fail('sha256-unavailable', 'local-hash', 'Web Crypto SHA-256 failed.');
  }
}

async function requireSha256(crypto: Pick<Crypto, 'subtle'>): Promise<void> {
  if ((await digest(crypto, SHA256_KAT_PREIMAGE)) !== SHA256_KAT_DIGEST)
    fail('sha256-unavailable', 'local-hash', 'Web Crypto SHA-256 failed its known-answer test.');
}

function expectedBinding(owner: PatternImportDxfProductSemanticSidecarOwnerV1): ExpectedBinding {
  const encoded = encodePatternImportDxfProductSemanticSidecarV1(owner);
  if (!encoded.ok)
    fail('invalid-owner', 'input', 'A genuine opaque product G4F4 owner is required.');
  const { document } = owner;
  const techCardId = document.persistence.card.techCardId;
  const cardLockVersion = document.persistence.card.observedLockVersion;
  const patternLineKey = document.persistence.pattern.lineKey.toUpperCase();
  const dxfSha256 = document.persistence.pattern.sha256;
  const patternVersion = document.persistence.pattern.version;
  const postSaveReceiptSha256 = document.persistence.receiptSealSha256;
  if (
    !Number.isSafeInteger(techCardId) ||
    techCardId <= 0 ||
    !Number.isSafeInteger(cardLockVersion) ||
    cardLockVersion < 0 ||
    cardLockVersion > 2_147_483_647 ||
    !ULID.test(patternLineKey) ||
    !Number.isSafeInteger(patternVersion) ||
    patternVersion <= 0 ||
    !SHA256.test(dxfSha256) ||
    !SHA256.test(postSaveReceiptSha256) ||
    !SHA256.test(encoded.canonicalSha256) ||
    document.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 ||
    document.product.exportSha256 !== dxfSha256 ||
    document.product.scopeKey !== document.persistence.pattern.scopeKey ||
    encoded.canonicalByteLength !== encoded.bytes.byteLength ||
    encoded.bytes.byteLength < 1 ||
    encoded.bytes.byteLength > MAX_SIDECAR_BYTES
  )
    fail(
      'invalid-binding',
      'input',
      'The product G4F4 owner is not bound to a backend-compatible pattern revision.',
    );
  const bytes = encoded.bytes.slice();
  return Object.freeze({
    techCardId,
    cardLockVersion,
    patternLineKey,
    dxfSha256,
    patternVersion,
    postSaveReceiptSha256,
    sidecarSha256: encoded.canonicalSha256,
    byteLength: bytes.byteLength,
    bytes,
    base64: bytesToBase64(bytes),
  });
}

async function verifyRow(
  row: TechCardPatternSemanticSidecar | undefined,
  expected: ExpectedBinding,
  phase: 'put' | 'get',
  crypto: Pick<Crypto, 'subtle'>,
): Promise<string> {
  const code = phase === 'put' ? 'put-readback-invalid' : 'get-readback-invalid';
  if (!row || typeof row !== 'object') fail(code, phase, `${phase} omitted semantic_sidecar.`);
  if (
    row.techCardId !== expected.techCardId ||
    row.cardLockVersion !== expected.cardLockVersion ||
    row.patternLineKey?.toUpperCase() !== expected.patternLineKey ||
    row.dxfSha256 !== expected.dxfSha256 ||
    row.patternVersion !== expected.patternVersion ||
    row.postSaveReceiptSha256 !== expected.postSaveReceiptSha256 ||
    row.sidecarSha256 !== expected.sidecarSha256 ||
    row.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 ||
    row.byteLength !== expected.byteLength
  )
    fail(code, phase, `${phase} returned a different product pattern/receipt/sidecar binding.`);
  const bytes = base64ToBytes(row.sidecarBytes, phase);
  if (bytes.byteLength !== expected.byteLength)
    fail(code, phase, `${phase} returned a different sidecar byte length.`);
  const actualSha256 = await digest(crypto, bytes);
  if (actualSha256 !== expected.sidecarSha256)
    fail(code, phase, `${phase} returned sidecar bytes with a different SHA-256.`);
  return actualSha256;
}

/**
 * Attaches one genuine product G4F4 owner after its G4F3 readback. A PUT transport failure is
 * deliberately `unknown`: the server may have committed, and retrying the exact owner is safe.
 */
export async function persistPatternImportDxfProductSemanticSidecarV1(
  service: PatternImportDxfProductSidecarStorageServiceV1,
  owner: PatternImportDxfProductSemanticSidecarOwnerV1,
  crypto: Pick<Crypto, 'subtle'> = globalThis.crypto,
): Promise<PatternImportDxfProductSidecarStorageResultV1> {
  let expected: ExpectedBinding;
  try {
    expected = expectedBinding(owner);
    await requireSha256(crypto);
    if ((await digest(crypto, expected.bytes)) !== expected.sidecarSha256)
      fail('invalid-owner', 'local-hash', 'Product G4F4 bytes do not match their opaque seal.');
  } catch (error) {
    return blocked(error, 'not-attempted');
  }

  let putRow: TechCardPatternSemanticSidecar | undefined;
  try {
    const response = await service.PutTechCardPatternSemanticSidecar({
      techCardId: expected.techCardId,
      patternLineKey: expected.patternLineKey,
      expectedCardLockVersion: expected.cardLockVersion,
      expectedDxfSha256: expected.dxfSha256,
      expectedPatternVersion: expected.patternVersion,
      expectedPostSaveReceiptSha256: expected.postSaveReceiptSha256,
      selectedOperationNumber: 0,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
      sidecarSha256: expected.sidecarSha256,
      sidecarBytes: expected.base64,
    });
    putRow = response?.semanticSidecar;
  } catch {
    return blocked(
      new StorageFailure(
        'put-failed',
        'put',
        'PUT failed; it may have committed, so absence is not established and exact retry is safe.',
      ),
      'unknown',
    );
  }

  try {
    await verifyRow(putRow, expected, 'put', crypto);
  } catch (error) {
    return blocked(error, 'acknowledged-unverified');
  }

  let getRow: TechCardPatternSemanticSidecar | undefined;
  try {
    const response = await service.GetTechCardPatternSemanticSidecar({
      techCardId: expected.techCardId,
      patternLineKey: expected.patternLineKey,
    });
    getRow = response?.semanticSidecar;
  } catch {
    return blocked(
      new StorageFailure(
        'get-failed',
        'get',
        'PUT was acknowledged but the required fresh narrow readback failed.',
      ),
      'acknowledged-unverified',
    );
  }

  try {
    const putSha256 = await verifyRow(putRow, expected, 'put', crypto);
    const getSha256 = await verifyRow(getRow, expected, 'get', crypto);
    if (putSha256 !== getSha256 || putRow?.sidecarBytes !== getRow?.sidecarBytes)
      fail(
        'dual-readback-mismatch',
        'dual-readback',
        'PUT echo and fresh GET returned different product sidecar bytes.',
      );
  } catch (error) {
    return blocked(error, 'acknowledged-unverified');
  }

  return Object.freeze({
    ok: true as const,
    receipt: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_STORAGE_RECEIPT_V1,
      techCardId: expected.techCardId,
      cardLockVersion: expected.cardLockVersion,
      patternLineKey: expected.patternLineKey,
      dxfSha256: expected.dxfSha256,
      patternVersion: expected.patternVersion,
      postSaveReceiptSha256: expected.postSaveReceiptSha256,
      sidecarSha256: expected.sidecarSha256,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
      canonicalByteLength: expected.byteLength,
    }),
    writeOutcome: 'verified' as const,
    blockers: Object.freeze([]) as readonly [],
    claims: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_STORAGE_ACCEPTED_CLAIMS_V1,
  });
}
