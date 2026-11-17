import { abortableAdminService } from 'api/api';
import {
  isCurrentSavedGenericObservedPhysicalHostPersistenceContextV1,
  type SavedGenericObservedPhysicalHostPersistenceContextV1,
} from 'components/cloth-simulation-spike/saved-generic-observed-physical-host-v1';
import {
  createPatternImportDxfProductCompositeSidecarStorageWriterV3,
  type PatternImportDxfProductCompositeSidecarStorageDepsV3,
  type PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
  type PatternImportDxfProductCompositeSidecarStorageWriterAdapterV3,
  type PatternImportDxfProductCompositeSidecarStorageWriterResultV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';
import {
  readPatternImportDxfProductCompositeComponentBytesV3,
  type PatternImportDxfProductCompositeSidecarBindingsV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
  decodePatternImportDxfProductCompositeSidecarV6,
  readPatternImportDxfProductCompositeComponentBytesV6,
} from './composite-sidecar-v6';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
  decodePatternImportDxfProductCompositeSidecarV7,
  encodePatternImportDxfProductCompositeSidecarV7,
  readPatternImportDxfProductCompositeComponentBytesV7,
  type PatternImportDxfProductCompositeSidecarOwnerV7,
} from './composite-sidecar-v7';
import { SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1 } from './saved-full-assembly-physical-component-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7 =
  'pattern-import-dxf-product-composite-sidecar-storage-request/7' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V7 =
  'pattern-import-dxf-product-composite-sidecar-storage-receipt/7' as const;

export type PatternImportDxfProductCompositeSidecarTransportAnchorV7 = Readonly<{
  sourceOperationNumber: number;
  serverTopologySha256: string;
}>;

export type PatternImportDxfProductCompositeSidecarTransitionIntentV7 = 'physical' | 'arrangement';

export type PatternImportDxfProductCompositeSidecarStorageRequestV7 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7;
  transitionIntent: PatternImportDxfProductCompositeSidecarTransitionIntentV7;
  currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
  transportAnchor: PatternImportDxfProductCompositeSidecarTransportAnchorV7;
  nextOwner: PatternImportDxfProductCompositeSidecarOwnerV7;
}>;

export type PatternImportDxfProductCompositeSidecarStorageResultV7 =
  PatternImportDxfProductCompositeSidecarStorageWriterResultV3<
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V7
  >;

export type PatternImportDxfProductCompositeSidecarStorageAdapterV7 =
  PatternImportDxfProductCompositeSidecarStorageWriterAdapterV3<
    PatternImportDxfProductCompositeSidecarStorageRequestV7,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
    typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V7
  >;

const SHA256 = /^[0-9a-f]{64}$/;

class CompositeV7PersistenceFailure extends Error {}

function fail(detail: string): never {
  throw new CompositeV7PersistenceFailure(detail.slice(0, 2_048));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
  );
}

async function sha256(bytes: Uint8Array, crypto: Pick<Crypto, 'subtle'> | undefined) {
  if (!crypto?.subtle) fail('SHA-256 is unavailable.');
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  );
}

function semanticTransport(owner: unknown, selectedOperationNumber: number) {
  const bytes = readPatternImportDxfProductCompositeComponentBytesV3(owner, 'semantic-product-v1');
  if (!bytes) fail('Nested Composite V3 has no semantic receipt.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('Nested semantic receipt JSON is invalid.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    fail('Nested semantic receipt is not a record.');
  const persistence = (parsed as Record<string, unknown>).persistence;
  if (!persistence || typeof persistence !== 'object' || Array.isArray(persistence))
    fail('Nested semantic persistence metadata is absent.');
  const pattern = (persistence as Record<string, unknown>).pattern;
  const postSaveReceiptSha256 = (persistence as Record<string, unknown>).receiptSealSha256;
  const patternVersion =
    pattern && typeof pattern === 'object' && !Array.isArray(pattern)
      ? (pattern as Record<string, unknown>).version
      : null;
  if (
    !Number.isSafeInteger(patternVersion) ||
    (patternVersion as number) < 1 ||
    typeof postSaveReceiptSha256 !== 'string' ||
    !SHA256.test(postSaveReceiptSha256)
  )
    fail('Nested semantic receipt metadata is invalid.');
  return Object.freeze({
    patternVersion: patternVersion as number,
    postSaveReceiptSha256,
    selectedOperationNumber,
  });
}

async function currentV7Components(
  current: Extract<
    PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
    { status: 'present' }
  >,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  if ((await sha256(current.bytes, crypto)) !== current.sha256)
    fail('Current Composite bytes differ from their digest.');
  if (current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6)
    return Object.freeze({ nestedV6: current.bytes.slice(), physical: null });
  if (current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7) {
    const decoded = await decodePatternImportDxfProductCompositeSidecarV7(current.bytes, crypto);
    if (!decoded.ok) fail(`Current Composite V7 is invalid: ${decoded.blockers[0].detail}`);
    const nestedV6 = readPatternImportDxfProductCompositeComponentBytesV7(
      decoded.owner,
      'composite-v6',
    );
    const physical = readPatternImportDxfProductCompositeComponentBytesV7(
      decoded.owner,
      SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1,
    );
    if (!nestedV6 || !physical)
      fail('Current Composite V7 has no exact nested V6 or physical bytes.');
    return Object.freeze({ nestedV6, physical });
  }
  fail('Current sidecar is not Composite V6 or V7.');
}

async function arrangementComponentsV6(
  bytes: Uint8Array,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  const decoded = await decodePatternImportDxfProductCompositeSidecarV6(bytes, crypto);
  if (!decoded.ok) fail(`Nested Composite V6 is invalid: ${decoded.blockers[0].detail}`);
  const nestedV5 = readPatternImportDxfProductCompositeComponentBytesV6(
    decoded.owner,
    'composite-v5',
  );
  const arrangement = readPatternImportDxfProductCompositeComponentBytesV6(
    decoded.owner,
    'cad-mannequin-arrangement-v1',
  );
  if (!nestedV5 || !arrangement)
    fail('Nested Composite V6 arrangement components are unavailable.');
  return Object.freeze({ nestedV5, arrangement });
}

async function prepareV7(
  request: PatternImportDxfProductCompositeSidecarStorageRequestV7,
  current: PatternImportDxfProductCompositeSidecarStorageVerifiedGetV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  if (current.status !== 'present') fail('A current Composite V6 or V7 is required.');
  if (
    !Number.isSafeInteger(request.transportAnchor.sourceOperationNumber) ||
    request.transportAnchor.sourceOperationNumber < 1 ||
    !SHA256.test(request.transportAnchor.serverTopologySha256) ||
    request.currentAuthority.assemblyTopologySha256 !== request.transportAnchor.serverTopologySha256
  )
    fail('The V7 transport anchor differs from current authority.');
  const encoded = encodePatternImportDxfProductCompositeSidecarV7(request.nextOwner);
  if (!encoded.ok) fail('A genuine Composite V7 owner is required.');
  const decoded = await decodePatternImportDxfProductCompositeSidecarV7(encoded.bytes, crypto);
  if (!decoded.ok) fail(`Composite V7 verification failed: ${decoded.blockers[0].detail}`);
  if (canonical(decoded.document.bindings) !== canonical(request.currentAuthority))
    fail('Composite V7 bindings differ from current authority.');
  if (decoded.document.writeCas.expectedPreviousSidecarSha256 !== current.sha256)
    fail('Composite V7 CAS differs from the fresh current GET.');
  const previous = await currentV7Components(current, crypto);
  const nextNestedV6 = readPatternImportDxfProductCompositeComponentBytesV7(
    decoded.owner,
    'composite-v6',
  );
  const nextPhysical = readPatternImportDxfProductCompositeComponentBytesV7(
    decoded.owner,
    SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1,
  );
  if (!nextNestedV6 || !nextPhysical) fail('Composite V7 transition components are unavailable.');
  if (request.transitionIntent === 'physical') {
    if (!sameBytes(previous.nestedV6, nextNestedV6))
      fail('Exact nested Composite V6 bytes changed during the physical transition.');
  } else if (request.transitionIntent === 'arrangement') {
    if (current.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7)
      fail('Arrangement transition requires current Composite V7.');
    if (!previous.physical || !sameBytes(previous.physical, nextPhysical))
      fail('Exact physical component bytes changed during the arrangement transition.');
    const [previousV6, nextV6] = await Promise.all([
      arrangementComponentsV6(previous.nestedV6, crypto),
      arrangementComponentsV6(nextNestedV6, crypto),
    ]);
    if (!sameBytes(previousV6.nestedV5, nextV6.nestedV5))
      fail('Exact nested Composite V5 bytes changed during the arrangement transition.');
  } else {
    fail('Composite V7 transition intent is invalid.');
  }
  const nestedV3 =
    decoded.nestedCompositeV6.nestedCompositeV5.nestedCompositeV4.nestedCompositeV3.owner;
  const transport = semanticTransport(nestedV3, request.transportAnchor.sourceOperationNumber);
  return Object.freeze({
    authority: request.currentAuthority,
    transport,
    previousSidecarSha256: current.sha256,
    sidecarSha256: encoded.canonicalSha256,
    byteLength: encoded.canonicalByteLength,
    bytes: encoded.bytes.slice(),
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
  });
}

function createStorageAdapterV7(
  deps: PatternImportDxfProductCompositeSidecarStorageDepsV3,
  guard:
    | Readonly<{
        intent: 'physical';
        host: unknown;
        context: SavedGenericObservedPhysicalHostPersistenceContextV1;
      }>
    | Readonly<{ intent: 'arrangement' }>,
): PatternImportDxfProductCompositeSidecarStorageAdapterV7 {
  return createPatternImportDxfProductCompositeSidecarStorageWriterV3(deps, {
    requestSchemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
    receiptSchemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V7,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
    acceptedCurrentMediaTypes: Object.freeze([
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
    ]),
    label: `Composite V7 ${guard.intent} transition`,
    prepare: prepareV7,
    beforeRequest: async (request, _planned, signal) => {
      if (request.transitionIntent !== guard.intent)
        fail('Composite V7 adapter transition intent differs.');
      if (
        guard.intent === 'physical' &&
        !isCurrentSavedGenericObservedPhysicalHostPersistenceContextV1(
          guard.host,
          guard.context,
          signal,
        )
      )
        fail('The genuine physical host changed before its storage PUT.');
    },
    verifyCanonical: async (bytes, crypto) =>
      (await decodePatternImportDxfProductCompositeSidecarV7(bytes, crypto)).ok,
  });
}

export function createPatternImportDxfProductCompositeSidecarStorageAdapterV7(
  deps: PatternImportDxfProductCompositeSidecarStorageDepsV3,
  host: unknown,
  context: SavedGenericObservedPhysicalHostPersistenceContextV1,
): PatternImportDxfProductCompositeSidecarStorageAdapterV7 {
  return createStorageAdapterV7(deps, { intent: 'physical', host, context });
}

export function createPatternImportDxfProductCompositeSidecarArrangementStorageAdapterV7(
  deps: PatternImportDxfProductCompositeSidecarStorageDepsV3,
): PatternImportDxfProductCompositeSidecarStorageAdapterV7 {
  return createStorageAdapterV7(deps, { intent: 'arrangement' });
}

export function createPatternImportDxfProductCompositeSidecarProductionStorageAdapterV7(
  host: unknown,
  context: SavedGenericObservedPhysicalHostPersistenceContextV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
) {
  return createPatternImportDxfProductCompositeSidecarStorageAdapterV7(
    {
      createClient: (signal) => abortableAdminService(signal),
      crypto,
    },
    host,
    context,
  );
}

export function createPatternImportDxfProductCompositeSidecarProductionArrangementStorageAdapterV7(
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
) {
  return createPatternImportDxfProductCompositeSidecarArrangementStorageAdapterV7({
    createClient: (signal) => abortableAdminService(signal),
    crypto,
  });
}
