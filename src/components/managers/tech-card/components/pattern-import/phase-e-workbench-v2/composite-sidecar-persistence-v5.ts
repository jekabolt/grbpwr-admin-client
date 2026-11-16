import { abortableAdminService } from 'api/api';
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
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  decodePatternImportDxfProductCompositeSidecarV4,
} from './composite-sidecar-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
  decodePatternImportDxfProductCompositeSidecarV5,
  encodePatternImportDxfProductCompositeSidecarV5,
  readPatternImportDxfProductCompositeComponentBytesV5,
  type PatternImportDxfProductCompositeSidecarOwnerV5,
} from './composite-sidecar-v5';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V5 =
  'pattern-import-dxf-product-composite-sidecar-storage-request/5' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V5 =
  'pattern-import-dxf-product-composite-sidecar-storage-receipt/5' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PRODUCTION_PERSISTENCE_V5 =
  'pattern-import-dxf-product-composite-sidecar-production-persistence/5' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V5 = Object.freeze({
  existingSemanticSidecarWriterReused: true,
  opaqueMediaTypeTransportSupportedByProto: true,
  serverContractCompositeV5AdmissionImplemented: true,
  runtimeServerMediaAdmissionProven: false,
  explicitUserActionRequired: true,
  autosaveAllowed: false,
  localStorageAllowed: false,
  freshCurrentNarrowGetPerformed: true,
  currentCompositeV4OrV5Required: true,
  originalCompositeV4BytesPreservedExactly: true,
  exactSavedRowAndCardLockGuardsSent: true,
  assemblyRevisionAndTopologyCasSent: true,
  expectedPreviousSidecarShaSent: true,
  canonicalBytesShaAndDerivedLengthPersisted: true,
  putEchoCanonicalV5Verified: true,
  freshReadbackCanonicalV5Verified: true,
  unknownWriteOutcomeReported: true,
  abortAndStaleWritesFailClosed: true,
  persistenceIntegrated: true,
  productionWritePathAvailable: true,
  uiIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfProductCompositeSidecarStorageRequestV5 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V5;
  currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
  nextOwner: PatternImportDxfProductCompositeSidecarOwnerV5;
}>;

export type PatternImportDxfProductCompositeSidecarStorageResultV5 =
  PatternImportDxfProductCompositeSidecarStorageWriterResultV3<
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V5
  >;

export type PatternImportDxfProductCompositeSidecarStorageAdapterV5 =
  PatternImportDxfProductCompositeSidecarStorageWriterAdapterV3<
    PatternImportDxfProductCompositeSidecarStorageRequestV5,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V5
  >;

declare const productionPersistenceBrand: unique symbol;
export type PatternImportDxfProductCompositeSidecarProductionPersistenceV5 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PRODUCTION_PERSISTENCE_V5;
  adapter: PatternImportDxfProductCompositeSidecarStorageAdapterV5;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V5;
  readonly [productionPersistenceBrand]: never;
}>;

const productionPersistenceOwners = new WeakSet<object>();

/** A structural lookalike cannot enable the production annotation Save capability. */
export function isPatternImportDxfProductCompositeSidecarProductionPersistenceV5(
  candidate: unknown,
): candidate is PatternImportDxfProductCompositeSidecarProductionPersistenceV5 {
  return !!candidate && typeof candidate === 'object' && productionPersistenceOwners.has(candidate);
}

const SHA256 = /^[0-9a-f]{64}$/;
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

class CompositeV5PersistenceFailure extends Error {}

function fail(detail: string): never {
  throw new CompositeV5PersistenceFailure(detail.slice(0, 2_048));
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function sameAuthority(
  left: PatternImportDxfProductCompositeSidecarBindingsV3,
  right: PatternImportDxfProductCompositeSidecarBindingsV3,
): boolean {
  return canonical(left) === canonical(right);
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
    fail('SHA-256 is unavailable.');
  let known: ArrayBuffer;
  try {
    known = await crypto.subtle.digest('SHA-256', encoder.encode('abc'));
  } catch {
    fail('SHA-256 self-test failed.');
  }
  const knownHex = Array.from(new Uint8Array(known), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (known.byteLength !== 32 || knownHex !== SHA256_ABC) fail('SHA-256 self-test mismatch.');
  let digest: ArrayBuffer;
  try {
    digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  } catch {
    fail('SHA-256 failed.');
  }
  if (digest.byteLength !== 32) fail('SHA-256 returned an invalid digest.');
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function plainRecord(value: unknown, path: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail(`${path} is not a plain record.`);
  return value as Record<string, unknown>;
}

function readSemanticReceipt(bytes: Uint8Array<ArrayBuffer>) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes)) as unknown;
  } catch {
    fail('Preserved semantic-product-v1 bytes are invalid.');
  }
  const document = plainRecord(parsed, 'semantic-product-v1');
  const persistence = plainRecord(document.persistence, 'semantic-product-v1.persistence');
  const pattern = plainRecord(persistence.pattern, 'semantic-product-v1.persistence.pattern');
  if (
    !Number.isSafeInteger(pattern.version) ||
    (pattern.version as number) < 1 ||
    typeof persistence.receiptSealSha256 !== 'string' ||
    !SHA256.test(persistence.receiptSealSha256)
  )
    fail('Preserved semantic-product-v1 receipt metadata is invalid.');
  return Object.freeze({
    patternVersion: pattern.version as number,
    postSaveReceiptSha256: persistence.receiptSealSha256,
  });
}

async function currentNestedV4(
  current: Extract<
    PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
    { status: 'present' }
  >,
  authority: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  if (current.sha256 !== (await sha256(current.bytes, crypto)))
    fail('Current sidecar SHA-256 differs from its bytes.');
  if (current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4) {
    const decoded = await decodePatternImportDxfProductCompositeSidecarV4(current.bytes, crypto);
    if (!decoded.ok || !sameAuthority(decoded.document.bindings, authority))
      fail('Current Composite V4 sidecar or its authority is invalid.');
    return current.bytes.slice();
  }
  if (current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5) {
    const decoded = await decodePatternImportDxfProductCompositeSidecarV5(current.bytes, crypto);
    if (!decoded.ok || !sameAuthority(decoded.document.bindings, authority))
      fail('Current Composite V5 sidecar or its authority is invalid.');
    const nested = readPatternImportDxfProductCompositeComponentBytesV5(
      decoded.owner,
      'composite-v4',
    );
    if (!nested) fail('Current Composite V5 has no verified nested V4 bytes.');
    return nested;
  }
  fail('Current sidecar is not a Composite V4 or V5 document.');
}

async function prepareV5(
  request: PatternImportDxfProductCompositeSidecarStorageRequestV5,
  current: PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  if (current.status !== 'present')
    fail('Composite V5 requires a fresh current Composite V4 or V5 sidecar.');
  const encoded = encodePatternImportDxfProductCompositeSidecarV5(request.nextOwner);
  if (!encoded.ok) fail('A genuine Composite V5 owner is required.');
  const decoded = await decodePatternImportDxfProductCompositeSidecarV5(encoded.bytes, crypto);
  if (!decoded.ok) fail(`Composite V5 verification failed: ${decoded.blockers[0].detail}`);
  if (!sameAuthority(request.currentAuthority, decoded.document.bindings))
    fail('Current authority differs from Composite V5 bindings.');
  if (decoded.document.writeCas.expectedPreviousSidecarSha256 !== current.sha256)
    fail('Composite V5 CAS expectation differs from the fresh current GET.');

  const nextNestedV4 = readPatternImportDxfProductCompositeComponentBytesV5(
    decoded.owner,
    'composite-v4',
  );
  if (!nextNestedV4) fail('Composite V5 has no verified nested V4 bytes.');
  const previousNestedV4 = await currentNestedV4(current, request.currentAuthority, crypto);
  if (!sameBytes(previousNestedV4, nextNestedV4))
    fail('Original Composite V4 bytes changed across the V5 annotation transaction.');

  const semantic = readPatternImportDxfProductCompositeComponentBytesV3(
    decoded.nestedCompositeV4.nestedCompositeV3.owner,
    'semantic-product-v1',
  );
  if (!semantic) fail('Nested Composite V4/V3 has no semantic-product-v1 component.');
  const receipt = readSemanticReceipt(semantic);
  const selectedOperationNumber =
    decoded.nestedCompositeV4.exactNSeam.carrier.bindings.selectedOperation.sourceOperationNumber;
  if (!Number.isSafeInteger(selectedOperationNumber) || selectedOperationNumber < 1)
    fail('Nested Composite V4 selected operation is invalid.');
  const digest = await sha256(encoded.bytes, crypto);
  if (
    digest !== encoded.canonicalSha256 ||
    encoded.canonicalByteLength !== encoded.bytes.byteLength
  )
    fail('Composite V5 canonical seal differs from encoded bytes.');

  return Object.freeze({
    authority: request.currentAuthority,
    transport: Object.freeze({ ...receipt, selectedOperationNumber }),
    previousSidecarSha256: current.sha256,
    sidecarSha256: digest,
    byteLength: encoded.bytes.byteLength,
    bytes: encoded.bytes.slice(),
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
  });
}

export function createPatternImportDxfProductCompositeSidecarStorageAdapterV5(
  deps: PatternImportDxfProductCompositeSidecarStorageDepsV3,
): PatternImportDxfProductCompositeSidecarStorageAdapterV5 {
  return createPatternImportDxfProductCompositeSidecarStorageWriterV3(deps, {
    requestSchemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V5,
    receiptSchemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V5,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
    acceptedCurrentMediaTypes: Object.freeze([
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
    ]),
    label: 'Composite V5 topology annotations',
    prepare: prepareV5,
    verifyCanonical: async (bytes, crypto) =>
      (await decodePatternImportDxfProductCompositeSidecarV5(bytes, crypto)).ok,
  });
}

/** Composes the owner; only its adapter.persist method may run from explicit Save annotations. */
export function createPatternImportDxfProductCompositeSidecarApplicationPersistenceV5(
  deps: PatternImportDxfProductCompositeSidecarStorageDepsV3,
): PatternImportDxfProductCompositeSidecarProductionPersistenceV5 {
  const owner = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PRODUCTION_PERSISTENCE_V5,
    adapter: createPatternImportDxfProductCompositeSidecarStorageAdapterV5(deps),
    claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V5,
  }) as PatternImportDxfProductCompositeSidecarProductionPersistenceV5;
  productionPersistenceOwners.add(owner);
  return owner;
}

/** Production composition; only adapter.persist is invoked by explicit Save annotations. */
export function createPatternImportDxfProductCompositeSidecarProductionPersistenceV5(
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): PatternImportDxfProductCompositeSidecarProductionPersistenceV5 {
  return createPatternImportDxfProductCompositeSidecarApplicationPersistenceV5({
    createClient: (signal) => abortableAdminService(signal),
    crypto,
  });
}
