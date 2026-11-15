import type { DxfProductSavedRowIdentityV1 } from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2,
  decodePatternImportDxfProductMultiseamPlacementSidecarV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  decodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
  type PatternImportDxfProductCompositeSidecarBindingsV3,
  type PatternImportDxfProductCompositeSidecarOwnerV3,
} from './pattern-import-dxf-product-composite-sidecar-v3';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from './pattern-import-dxf-product-semantic-sidecar-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3 =
  'pattern-import-dxf-product-composite-sidecar-persistence-request/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_PLAN_V3 =
  'pattern-import-dxf-product-composite-sidecar-persistence-plan/3' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V3 = Object.freeze({
  verifiedGetEvidenceRequired: true,
  currentBytesDigestAndCodecVerified: true,
  exactSavedRowRevalidated: true,
  exactServerAssemblyRevisionRevalidated: true,
  exactAssemblyTopologySha256Revalidated: true,
  conditionalPutCasPrepared: true,
  requiredV1BytesPreservedAcrossUpgrade: true,
  absentRequiresNullPreviousSha: true,
  legacyV1PlacementInferred: false,
  techCardSeamPlacementAcceptedAsPlacementAuthority: false,
  getPerformedByAdapter: false,
  putPerformedByAdapter: false,
  persistenceIntegrated: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V3,
  currentBytesDigestAndCodecVerified: false as const,
  exactSavedRowRevalidated: false as const,
  exactServerAssemblyRevisionRevalidated: false as const,
  exactAssemblyTopologySha256Revalidated: false as const,
  conditionalPutCasPrepared: false as const,
  requiredV1BytesPreservedAcrossUpgrade: false as const,
  absentRequiresNullPreviousSha: false as const,
});

export type PatternImportDxfProductCompositeSidecarVerifiedGetV3 =
  | Readonly<{
      status: 'absent';
      source: 'verified-get-absence';
    }>
  | Readonly<{
      status: 'present';
      source: 'verified-get';
      mediaType:
        | typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1
        | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3;
      sha256: string;
      byteLength: number;
      bytes: Uint8Array;
    }>;

export type PatternImportDxfProductCompositeSidecarPersistenceRequestV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3;
  currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
  current: PatternImportDxfProductCompositeSidecarVerifiedGetV3;
  nextOwner: PatternImportDxfProductCompositeSidecarOwnerV3;
}>;

export type PatternImportDxfProductCompositeSidecarPersistencePlanV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_PLAN_V3;
  get: Readonly<{
    techCardId: number;
    patternLineKey: string;
    performed: false;
  }>;
  verification: Readonly<{
    observed: 'absent' | 'legacy-product-v1' | 'composite-v3';
    observedSidecarSha256: string | null;
    exactSavedRowMatched: true;
    exactServerAssemblyRevisionMatched: true;
    exactAssemblyTopologySha256Matched: true;
    requiredV1BytesPreserved: true;
  }>;
  conditionalPut: Readonly<{
    techCardId: number;
    patternLineKey: string;
    expectedPreviousSidecarSha256: string | null;
    expectedServerAssemblyRevision: string;
    expectedAssemblyTopologySha256: string;
    mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3;
    sidecarSha256: string;
    byteLength: number;
    bytes: Uint8Array<ArrayBuffer>;
    performed: false;
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V3;
}>;

export type PatternImportDxfProductCompositeSidecarPersistenceBlockerCodeV3 =
  | 'invalid-input'
  | 'invalid-owner'
  | 'unsupported-current-media'
  | 'current-evidence-invalid'
  | 'current-digest-mismatch'
  | 'authority-binding-mismatch'
  | 'cas-expectation-mismatch'
  | 'required-v1-bytes-not-preserved'
  | 'sha256-unavailable';

export type PatternImportDxfProductCompositeSidecarPersistenceBlockerV3 = Readonly<{
  code: PatternImportDxfProductCompositeSidecarPersistenceBlockerCodeV3;
  field: string;
  detail: string;
}>;

export type PatternImportDxfProductCompositeSidecarPersistenceResultV3 =
  | Readonly<{
      ok: true;
      plan: PatternImportDxfProductCompositeSidecarPersistencePlanV3;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V3;
    }>
  | Readonly<{
      ok: false;
      plan: null;
      blockers: readonly [PatternImportDxfProductCompositeSidecarPersistenceBlockerV3];
      claims: typeof BLOCKED_CLAIMS;
    }>;

const SHA256 = /^[0-9a-f]{64}$/;
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const MAX_CURRENT_BYTES = 24 * 1024 * 1024;
const encoder = new TextEncoder();
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  'byteLength',
)?.get;
const typedArraySet = Uint8Array.prototype.set;

class PersistenceFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductCompositeSidecarPersistenceBlockerCodeV3,
    readonly field: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(
  code: PatternImportDxfProductCompositeSidecarPersistenceBlockerCodeV3,
  field: string,
  detail: string,
): never {
  throw new PersistenceFailure(code, field, detail);
}

function blocked(error: unknown): PatternImportDxfProductCompositeSidecarPersistenceResultV3 {
  const failure =
    error instanceof PersistenceFailure
      ? error
      : new PersistenceFailure('invalid-input', 'request', 'Persistence planning failed closed.');
  return Object.freeze({
    ok: false as const,
    plan: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, field: failure.field, detail: failure.message }),
    ]) as readonly [PatternImportDxfProductCompositeSidecarPersistenceBlockerV3],
    claims: BLOCKED_CLAIMS,
  });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    fail('invalid-input', path, 'Expected a plain record.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    Object.getPrototypeOf(value) !== Object.prototype ||
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('invalid-input', path, 'Record has missing, hidden, or unexpected fields.');
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
      fail('invalid-input', `${path}.${key}`, 'Expected an enumerable data property.');
    Object.defineProperty(output, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: descriptor.value,
    });
  }
  return output;
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1) {
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

function safeInteger(value: unknown, minimum: number, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    fail('invalid-input', path, `Expected a safe integer >= ${minimum}.`);
  return value as number;
}

function validateAuthority(value: unknown): PatternImportDxfProductCompositeSidecarBindingsV3 {
  const authority = exactRecord(
    value,
    ['row', 'serverAssemblyRevision', 'assemblyTopologySha256'],
    'request.currentAuthority',
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
    'request.currentAuthority.row',
  );
  safeInteger(row.techCardId, 1, 'request.currentAuthority.row.techCardId');
  safeInteger(row.revision, 0, 'request.currentAuthority.row.revision');
  safeInteger(row.cardLockVersion, 0, 'request.currentAuthority.row.cardLockVersion');
  safeInteger(row.sizeBytes, 1, 'request.currentAuthority.row.sizeBytes');
  for (const [field, maximum] of [
    ['scopeKey', 256],
    ['patternLineKey', 256],
  ] as const) {
    const fieldValue = row[field];
    if (
      typeof fieldValue !== 'string' ||
      fieldValue.length === 0 ||
      fieldValue.length > maximum ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(fieldValue)
    )
      fail('invalid-input', `request.currentAuthority.row.${field}`, 'Invalid stable identifier.');
  }
  if (
    typeof row.url !== 'string' ||
    row.url.length === 0 ||
    row.url.length > 4_096 ||
    Array.from(row.url).some((character) => character.charCodeAt(0) <= 0x1f)
  )
    fail('invalid-input', 'request.currentAuthority.row.url', 'Invalid saved-row URL.');
  if (typeof row.sha256 !== 'string' || !SHA256.test(row.sha256))
    fail('invalid-input', 'request.currentAuthority.row.sha256', 'Invalid saved-row SHA.');
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
    })
  )
    fail(
      'invalid-input',
      'request.currentAuthority.serverAssemblyRevision',
      'Invalid Assembly revision token.',
    );
  if (
    typeof authority.assemblyTopologySha256 !== 'string' ||
    !SHA256.test(authority.assemblyTopologySha256)
  )
    fail(
      'invalid-input',
      'request.currentAuthority.assemblyTopologySha256',
      'Invalid topology SHA.',
    );
  return {
    row: row as DxfProductSavedRowIdentityV1,
    serverAssemblyRevision: revision,
    assemblyTopologySha256: authority.assemblyTopologySha256,
  };
}

function currentEvidenceStatus(value: unknown): 'absent' | 'present' {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    fail('current-evidence-invalid', 'request.current', 'Expected a current-evidence record.');
  let prototype: object | null;
  let descriptor: PropertyDescriptor | undefined;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptor = Object.getOwnPropertyDescriptor(value, 'status');
  } catch {
    fail('current-evidence-invalid', 'request.current', 'Current-evidence reflection failed.');
  }
  if (
    prototype !== Object.prototype ||
    !descriptor ||
    !descriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    (descriptor.value !== 'absent' && descriptor.value !== 'present')
  )
    fail(
      'current-evidence-invalid',
      'request.current.status',
      'Current-evidence status is invalid.',
    );
  return descriptor.value as 'absent' | 'present';
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1)
    difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

function copyBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (Object.getPrototypeOf(value) !== Uint8Array.prototype || !typedArrayByteLengthGetter)
    fail('current-evidence-invalid', 'request.current.bytes', 'Expected an exact Uint8Array.');
  let byteLength: number;
  try {
    byteLength = Reflect.apply(typedArrayByteLengthGetter, value, []) as number;
  } catch {
    fail('current-evidence-invalid', 'request.current.bytes', 'Could not inspect current bytes.');
  }
  if (byteLength < 1 || byteLength > MAX_CURRENT_BYTES)
    fail('current-evidence-invalid', 'request.current.bytes', 'Current bytes are out of bounds.');
  try {
    const copy = new Uint8Array(byteLength);
    Reflect.apply(typedArraySet, copy, [value]);
    return copy;
  } catch {
    fail('current-evidence-invalid', 'request.current.bytes', 'Could not copy current bytes.');
  }
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
  const knownHex = [...new Uint8Array(known)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  if (known.byteLength !== 32 || knownHex !== SHA256_ABC)
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

export async function preparePatternImportDxfProductCompositeSidecarPersistenceV3(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductCompositeSidecarPersistenceResultV3> {
  try {
    const request = exactRecord(
      input,
      ['schemaVersion', 'currentAuthority', 'current', 'nextOwner'],
      'request',
    );
    if (
      request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_REQUEST_V3
    )
      fail('invalid-input', 'request.schemaVersion', 'Persistence request schema is unsupported.');
    const currentAuthority = validateAuthority(request.currentAuthority);
    const currentStatus = currentEvidenceStatus(request.current);
    const encodedNext = encodePatternImportDxfProductCompositeSidecarV3(request.nextOwner);
    if (!encodedNext.ok)
      fail('invalid-owner', 'request.nextOwner', 'A genuine V3 owner is required.');
    const nextOwner = request.nextOwner as PatternImportDxfProductCompositeSidecarOwnerV3;
    const nextBindings = nextOwner.document.bindings;
    if (
      !sameRow(currentAuthority.row, nextBindings.row) ||
      currentAuthority.serverAssemblyRevision !== nextBindings.serverAssemblyRevision ||
      currentAuthority.assemblyTopologySha256 !== nextBindings.assemblyTopologySha256
    )
      fail(
        'authority-binding-mismatch',
        'request.currentAuthority',
        'Current authority differs from next V3 bindings.',
      );
    const nextV1 = readPatternImportDxfProductCompositeComponentBytesV3(
      request.nextOwner,
      'semantic-product-v1',
    );
    if (!nextV1)
      fail('invalid-owner', 'request.nextOwner', 'Next owner has no preserved V1 component bytes.');

    let observed: 'absent' | 'legacy-product-v1' | 'composite-v3';
    let observedSha256: string | null;
    if (currentStatus === 'absent') {
      const absent = exactRecord(request.current, ['status', 'source'], 'request.current');
      if (absent.status !== 'absent' || absent.source !== 'verified-get-absence')
        fail('current-evidence-invalid', 'request.current', 'Absent evidence marker is invalid.');
      if (nextOwner.document.writeCas.expectedPreviousSidecarSha256 !== null)
        fail(
          'cas-expectation-mismatch',
          'request.nextOwner.document.writeCas',
          'Absent row requires null CAS expectation.',
        );
      observed = 'absent';
      observedSha256 = null;
    } else {
      const present = exactRecord(
        request.current,
        ['status', 'source', 'mediaType', 'sha256', 'byteLength', 'bytes'],
        'request.current',
      );
      if (present.status !== 'present' || present.source !== 'verified-get')
        fail('current-evidence-invalid', 'request.current', 'Present evidence marker is invalid.');
      if (typeof present.sha256 !== 'string' || !SHA256.test(present.sha256))
        fail('current-evidence-invalid', 'request.current.sha256', 'Current SHA is invalid.');
      const bytes = copyBytes(present.bytes);
      if (present.byteLength !== bytes.byteLength)
        fail(
          'current-evidence-invalid',
          'request.current.byteLength',
          'Current byte length differs.',
        );
      const digest = await sha256(bytes, crypto);
      if (present.sha256 !== digest)
        fail(
          'current-digest-mismatch',
          'request.current.sha256',
          'Current digest differs from bytes.',
        );
      if (nextOwner.document.writeCas.expectedPreviousSidecarSha256 !== digest)
        fail(
          'cas-expectation-mismatch',
          'request.nextOwner.document.writeCas',
          'Next CAS does not match verified current bytes.',
        );
      if (present.mediaType === PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1) {
        const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(
          bytes,
          crypto,
        );
        if (!decoded.ok || decoded.compatibility !== 'legacy-v1-no-placement')
          fail(
            'current-evidence-invalid',
            'request.current.bytes',
            'Current bytes are not verified V1.',
          );
        if (!sameBytes(bytes, nextV1))
          fail('required-v1-bytes-not-preserved', 'request.nextOwner', 'V1 upgrade bytes changed.');
        observed = 'legacy-product-v1';
      } else if (present.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3) {
        const decoded = await decodePatternImportDxfProductCompositeSidecarV3(bytes, crypto);
        if (!decoded.ok)
          fail(
            'current-evidence-invalid',
            'request.current.bytes',
            'Current bytes are not verified V3.',
          );
        if (
          !sameRow(decoded.document.bindings.row, currentAuthority.row) ||
          decoded.document.bindings.serverAssemblyRevision !==
            currentAuthority.serverAssemblyRevision ||
          decoded.document.bindings.assemblyTopologySha256 !==
            currentAuthority.assemblyTopologySha256
        )
          fail(
            'authority-binding-mismatch',
            'request.current.bytes',
            'Current V3 differs from exact authority.',
          );
        const currentV1 = readPatternImportDxfProductCompositeComponentBytesV3(
          decoded.owner,
          'semantic-product-v1',
        );
        if (!currentV1 || !sameBytes(currentV1, nextV1))
          fail(
            'required-v1-bytes-not-preserved',
            'request.nextOwner',
            'V1 component changed across V3 replacement.',
          );
        observed = 'composite-v3';
      } else {
        const unsupported =
          present.mediaType === PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V2
            ? 'Placement V2 cannot supply the required opaque V1 component.'
            : 'Current media type is unsupported.';
        fail('unsupported-current-media', 'request.current.mediaType', unsupported);
      }
      observedSha256 = digest;
    }

    const plan = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_PLAN_V3,
      get: Object.freeze({
        techCardId: currentAuthority.row.techCardId,
        patternLineKey: currentAuthority.row.patternLineKey,
        performed: false as const,
      }),
      verification: Object.freeze({
        observed,
        observedSidecarSha256: observedSha256,
        exactSavedRowMatched: true as const,
        exactServerAssemblyRevisionMatched: true as const,
        exactAssemblyTopologySha256Matched: true as const,
        requiredV1BytesPreserved: true as const,
      }),
      conditionalPut: Object.freeze({
        techCardId: currentAuthority.row.techCardId,
        patternLineKey: currentAuthority.row.patternLineKey,
        expectedPreviousSidecarSha256: observedSha256,
        expectedServerAssemblyRevision: currentAuthority.serverAssemblyRevision,
        expectedAssemblyTopologySha256: currentAuthority.assemblyTopologySha256,
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
        sidecarSha256: encodedNext.canonicalSha256,
        byteLength: encodedNext.canonicalByteLength,
        bytes: encodedNext.bytes.slice(),
        performed: false as const,
      }),
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V3,
    } satisfies PatternImportDxfProductCompositeSidecarPersistencePlanV3);
    return Object.freeze({
      ok: true as const,
      plan,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_PERSISTENCE_CLAIMS_V3,
    });
  } catch (error) {
    return blocked(error);
  }
}
