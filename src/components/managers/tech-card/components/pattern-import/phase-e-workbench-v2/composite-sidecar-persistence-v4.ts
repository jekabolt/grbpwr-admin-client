import { abortableAdminService } from 'api/api';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  decodePatternImportDxfProductCompositeSidecarV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
  type PatternImportDxfProductCompositeSidecarBindingsV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';
import { decodePatternImportDxfProductMultiseamPlacementSidecarV2 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_CLAIMS_V3,
  createPatternImportDxfProductCompositeSidecarStorageWriterV3,
  type PatternImportDxfProductCompositeSidecarStorageDepsV3,
  type PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
  type PatternImportDxfProductCompositeSidecarStorageWriterAdapterV3,
  type PatternImportDxfProductCompositeSidecarStorageWriterResultV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  decodePatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductCompositeSidecarV4,
  type PatternImportDxfProductCompositeSidecarOwnerV4,
} from './composite-sidecar-v4';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4 =
  'pattern-import-dxf-product-composite-sidecar-storage-request/4' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V4 =
  'pattern-import-dxf-product-composite-sidecar-storage-receipt/4' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V4 = Object.freeze({
  existingSemanticSidecarWriterReused: true,
  freshCurrentNarrowGetPerformed: true,
  exactSavedRowAndCardLockGuardsSent: true,
  assemblyRevisionAndTopologyCasSent: true,
  expectedPreviousSidecarShaSent: true,
  canonicalBytesShaAndDerivedLengthPersisted: true,
  putEchoCanonicalV4Verified: true,
  freshReadbackCanonicalV4Verified: true,
  oneAndGreaterThanTwoSeamsOnly: true,
  exactTwoSeamsRemainOnV3V1: true,
  unknownWriteOutcomeReported: true,
  abortAndStaleWritesFailClosed: true,
  persistenceIntegrated: true,
  productionWritePerformed: true,
  uiIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfProductCompositeSidecarStorageRequestV4 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4;
  currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
  nextOwner: PatternImportDxfProductCompositeSidecarOwnerV4;
}>;

export type PatternImportDxfProductCompositeSidecarStorageResultV4 =
  PatternImportDxfProductCompositeSidecarStorageWriterResultV3<
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V4
  >;

export type PatternImportDxfProductCompositeSidecarStorageAdapterV4 =
  PatternImportDxfProductCompositeSidecarStorageWriterAdapterV3<
    PatternImportDxfProductCompositeSidecarStorageRequestV4,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V4
  >;

const SHA256 = /^[0-9a-f]{64}$/;
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

class CompositeV4PersistenceFailure extends Error {}

function fail(detail: string): never {
  throw new CompositeV4PersistenceFailure(detail.slice(0, 2_048));
}

function sameRow(
  left: PatternImportDxfProductCompositeSidecarBindingsV3['row'],
  right: PatternImportDxfProductCompositeSidecarBindingsV3['row'],
): boolean {
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

function sameAuthority(
  left: PatternImportDxfProductCompositeSidecarBindingsV3,
  right: PatternImportDxfProductCompositeSidecarBindingsV3,
): boolean {
  return (
    sameRow(left.row, right.row) &&
    left.serverAssemblyRevision === right.serverAssemblyRevision &&
    left.assemblyTopologySha256 === right.assemblyTopologySha256
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

function readSemanticReceipt(
  bytes: Uint8Array<ArrayBuffer>,
): Readonly<{ patternVersion: number; postSaveReceiptSha256: string }> {
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

async function readCurrentSemanticV1(
  current: Extract<
    PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
    { status: 'present' }
  >,
  authority: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  if (current.sha256 !== (await sha256(current.bytes, crypto)))
    fail('Current sidecar SHA-256 differs from its bytes.');
  if (current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1) {
    const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(
      current.bytes,
      crypto,
    );
    if (!decoded.ok || decoded.compatibility !== 'legacy-v1-no-placement')
      fail('Current semantic V1 sidecar is invalid.');
    return current.bytes.slice();
  }
  if (current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3) {
    const decoded = await decodePatternImportDxfProductCompositeSidecarV3(current.bytes, crypto);
    if (!decoded.ok || !sameAuthority(decoded.document.bindings, authority))
      fail('Current Composite V3 sidecar or its authority is invalid.');
    const semantic = readPatternImportDxfProductCompositeComponentBytesV3(
      decoded.owner,
      'semantic-product-v1',
    );
    if (!semantic) fail('Current Composite V3 has no semantic V1 component.');
    return semantic;
  }
  if (current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4) {
    const decoded = await decodePatternImportDxfProductCompositeSidecarV4(current.bytes, crypto);
    if (!decoded.ok || !sameAuthority(decoded.document.bindings, authority))
      fail('Current Composite V4 sidecar or its authority is invalid.');
    const semantic = readPatternImportDxfProductCompositeComponentBytesV3(
      decoded.nestedCompositeV3.owner,
      'semantic-product-v1',
    );
    if (!semantic) fail('Current Composite V4 has no nested semantic V1 component.');
    return semantic;
  }
  fail('Current sidecar media type is unsupported.');
}

async function prepareV4(
  request: PatternImportDxfProductCompositeSidecarStorageRequestV4,
  current: PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  const encoded = encodePatternImportDxfProductCompositeSidecarV4(request.nextOwner);
  if (!encoded.ok) fail('A genuine Composite V4 owner is required.');
  const decoded = await decodePatternImportDxfProductCompositeSidecarV4(encoded.bytes, crypto);
  if (!decoded.ok) fail(`Composite V4 verification failed: ${decoded.blockers[0].detail}`);
  if (!sameAuthority(request.currentAuthority, decoded.document.bindings))
    fail('Current authority differs from Composite V4 bindings.');
  const seamCount = decoded.exactNSeam.carrier.seams.length;
  if (seamCount < 1 || seamCount === 2)
    fail('Composite V4 storage accepts only one or greater-than-two seams.');
  const nestedSemantic = readPatternImportDxfProductCompositeComponentBytesV3(
    decoded.nestedCompositeV3.owner,
    'semantic-product-v1',
  );
  if (!nestedSemantic) fail('Composite V4 nested V3 has no semantic V1 component.');

  let previousSidecarSha256: string | null;
  if (current.status === 'absent') {
    previousSidecarSha256 = null;
  } else {
    previousSidecarSha256 = current.sha256;
    const currentSemantic = await readCurrentSemanticV1(current, request.currentAuthority, crypto);
    if (!sameBytes(currentSemantic, nestedSemantic))
      fail('Required semantic V1 bytes changed across Composite V4 replacement.');
  }
  if (decoded.document.writeCas.expectedPreviousSidecarSha256 !== previousSidecarSha256)
    fail('Composite V4 CAS expectation differs from the fresh current GET.');

  const receipt = readSemanticReceipt(nestedSemantic);
  const selectedOperationNumber =
    decoded.exactNSeam.carrier.bindings.selectedOperation.sourceOperationNumber;
  if (!Number.isSafeInteger(selectedOperationNumber) || selectedOperationNumber < 1)
    fail('Composite V4 exact-N selected operation is invalid.');
  const digest = await sha256(encoded.bytes, crypto);
  if (
    digest !== encoded.canonicalSha256 ||
    encoded.canonicalByteLength !== encoded.bytes.byteLength
  )
    fail('Composite V4 canonical seal differs from encoded bytes.');

  return Object.freeze({
    authority: request.currentAuthority,
    transport: Object.freeze({ ...receipt, selectedOperationNumber }),
    previousSidecarSha256,
    sidecarSha256: digest,
    byteLength: encoded.bytes.byteLength,
    bytes: encoded.bytes.slice(),
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  });
}

export function createPatternImportDxfProductCompositeSidecarStorageAdapterV4(
  deps: PatternImportDxfProductCompositeSidecarStorageDepsV3,
): PatternImportDxfProductCompositeSidecarStorageAdapterV4 {
  return createPatternImportDxfProductCompositeSidecarStorageWriterV3(deps, {
    requestSchemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4,
    receiptSchemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V4,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
    acceptedCurrentMediaTypes: Object.freeze([
      PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
    ]),
    label: 'Composite V4',
    prepare: prepareV4,
    verifyCanonical: async (bytes, crypto) => {
      const decoded = await decodePatternImportDxfProductCompositeSidecarV4(bytes, crypto);
      return decoded.ok && decoded.exactNSeam.carrier.seams.length !== 2;
    },
  });
}

export function createPatternImportDxfProductCompositeSidecarProductionPersistenceV4(
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Readonly<{
  adapter: PatternImportDxfProductCompositeSidecarStorageAdapterV4;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V4;
}> {
  return Object.freeze({
    adapter: createPatternImportDxfProductCompositeSidecarStorageAdapterV4({
      createClient: (signal) => abortableAdminService(signal),
      crypto,
    }),
    claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V4,
  });
}

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_SHARED_STORAGE_CLAIMS_V4 =
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_CLAIMS_V3;
