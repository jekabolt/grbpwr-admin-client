import type { PatternImportDxfProductCompositeSidecarBindingsV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  decodePatternImportDxfProductCompositeSidecarV4,
} from './composite-sidecar-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V4,
  type PatternImportDxfProductCompositeSidecarStorageResultV4,
} from './composite-sidecar-persistence-v4';
import type { PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2 } from './exact-n-seam-consistency-carrier-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_REQUEST_V4 =
  'pattern-import-dxf-product-composite-sidecar-restore-request/4' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_RESTORE_PATCH_V2 =
  'pattern-import-dxf-product-exact-n-seam-restore-patch/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_RESTORE_OWNER_V2 =
  'pattern-import-dxf-product-exact-n-seam-restore-owner/2' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_CLAIMS_V4 = Object.freeze({
  verifiedPersistenceOutcomeRequired: true,
  freshFullSidecarReadbackRequired: true,
  canonicalV4BytesDigestAndLengthVerified: true,
  exactSavedRowAndCardLockMatched: true,
  exactServerAssemblyRevisionMatched: true,
  exactAssemblyTopologySha256Matched: true,
  exactSelectedOperationMatched: true,
  exactCatalogAndAggregatePlanMatched: true,
  orderedExactNSeamsRestored: true,
  oneAndGreaterThanTwoSeamsOnly: true,
  exactTwoSeamsRemainOnV3V1: true,
  unknownOrUnverifiedWriteOutcomeAccepted: false,
  staleOrCorruptReadbackAccepted: false,
  authorityPatchAvailableOnlyThroughOwner: true,
  directUiApplyPerformed: false,
  secondWriterCreated: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_CLAIMS_V4,
  canonicalV4BytesDigestAndLengthVerified: false as const,
  exactSavedRowAndCardLockMatched: false as const,
  exactServerAssemblyRevisionMatched: false as const,
  exactAssemblyTopologySha256Matched: false as const,
  exactSelectedOperationMatched: false as const,
  exactCatalogAndAggregatePlanMatched: false as const,
  orderedExactNSeamsRestored: false as const,
  authorityPatchAvailableOnlyThroughOwner: false as const,
});

type ExactNBindings = PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2['bindings'];
type ExactNSeams = PatternImportDxfPhaseEExactNSeamConsistencyCarrierV2['seams'];
type VerifiedPersistenceV4 = Extract<
  PatternImportDxfProductCompositeSidecarStorageResultV4,
  { ok: true }
>;

export type PatternImportDxfProductCompositeSidecarRestoreRequestV4 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_REQUEST_V4;
  current: ExactNBindings;
  verifiedPersistence: VerifiedPersistenceV4;
}>;

export type PatternImportDxfProductCompositeSidecarFreshReadbackV4 = Readonly<{
  status: 'present';
  source: 'fresh-current-sidecar-get';
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4;
  sha256: string;
  byteLength: number;
  bytes: Uint8Array<ArrayBuffer>;
}>;

export type PatternImportDxfProductCompositeSidecarRestoreHostV4 = Readonly<{
  readCurrentCompositeV4: (
    expected: Readonly<{ techCardId: number; patternLineKey: string }>,
    signal: AbortSignal,
  ) => Promise<unknown>;
}>;

export type PatternImportDxfProductExactNSeamRestorePatchV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_RESTORE_PATCH_V2;
  status: 'confirmed-exact-n-seam-prefill';
  authority: 'verified-composite-v4-full-readback';
  bindings: ExactNBindings;
  seams: ExactNSeams;
}>;

declare const ownerBrand: unique symbol;
export type PatternImportDxfProductExactNSeamRestoreOwnerV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_RESTORE_OWNER_V2;
  seamCount: number;
  sidecarSha256: string;
  readonly [ownerBrand]: never;
}>;

export type PatternImportDxfProductCompositeSidecarRestoreBlockerCodeV4 =
  | 'invalid-request'
  | 'invalid-host'
  | 'unverified-persistence-outcome'
  | 'cancelled'
  | 'readback-failed'
  | 'invalid-readback'
  | 'readback-digest-mismatch'
  | 'sidecar-codec-failed'
  | 'saved-row-binding-mismatch'
  | 'assembly-binding-mismatch'
  | 'operation-binding-mismatch'
  | 'catalog-plan-binding-mismatch'
  | 'receipt-binding-mismatch'
  | 'v1-two-seam-path-required'
  | 'sha256-unavailable';

export type PatternImportDxfProductCompositeSidecarRestoreBlockerV4 = Readonly<{
  code: PatternImportDxfProductCompositeSidecarRestoreBlockerCodeV4;
  phase: 'input' | 'readback' | 'codec' | 'authority';
  detail: string;
}>;

export type PatternImportDxfProductCompositeSidecarRestoreResultV4 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductExactNSeamRestoreOwnerV2;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_CLAIMS_V4;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      blockers: readonly [PatternImportDxfProductCompositeSidecarRestoreBlockerV4];
      claims: typeof BLOCKED_CLAIMS;
    }>;

type Phase = PatternImportDxfProductCompositeSidecarRestoreBlockerV4['phase'];
type Code = PatternImportDxfProductCompositeSidecarRestoreBlockerCodeV4;
type OwnerState = Readonly<{ patch: PatternImportDxfProductExactNSeamRestorePatchV2 }>;

const SHA256 = /^[0-9a-f]{64}$/;
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const MAX_SIDECAR_BYTES = 4 * 1024 * 1024;
const encoder = new TextEncoder();
const ownerStates = new WeakMap<object, OwnerState>();

class RestoreFailure extends Error {
  constructor(
    readonly code: Code,
    readonly phase: Phase,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
    this.name = 'PatternImportDxfProductCompositeSidecarRestoreFailureV4';
  }
}

function fail(code: Code, phase: Phase, detail: string): never {
  throw new RestoreFailure(code, phase, detail);
}

function blocked(error: unknown): PatternImportDxfProductCompositeSidecarRestoreResultV4 {
  const known =
    error instanceof RestoreFailure
      ? error
      : new RestoreFailure('invalid-request', 'input', 'Restore failed closed.');
  return Object.freeze({
    ok: false as const,
    owner: null,
    blockers: Object.freeze([
      Object.freeze({ code: known.code, phase: known.phase, detail: known.message }),
    ]) as readonly [PatternImportDxfProductCompositeSidecarRestoreBlockerV4],
    claims: BLOCKED_CLAIMS,
  });
}

function plainDataRecord(value: unknown, keys: readonly string[], field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-readback', 'readback', `${field} must be an exact plain record.`);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-readback', 'readback', `${field} reflection failed.`);
  }
  if (prototype !== Object.prototype && prototype !== null)
    fail('invalid-readback', 'readback', `${field} must be an exact plain record.`);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.some((key) => typeof key !== 'string') ||
    actual.map(String).sort().join('\u0000') !== [...keys].sort().join('\u0000') ||
    actual.some((key) => {
      const descriptor = descriptors[String(key)]!;
      return !descriptor.enumerable || !('value' in descriptor);
    })
  )
    fail('invalid-readback', 'readback', `${field} has unexpected or active fields.`);
  return Object.fromEntries(
    actual.map((key) => [String(key), descriptors[String(key)]!.value]),
  ) as Record<string, unknown>;
}

function copyBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype)
    fail('invalid-readback', 'readback', 'Readback bytes must be a genuine Uint8Array.');
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = value.slice() as Uint8Array<ArrayBuffer>;
  } catch {
    fail('invalid-readback', 'readback', 'Readback bytes could not be detached.');
  }
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_SIDECAR_BYTES)
    fail('invalid-readback', 'readback', 'Readback bytes exceed the sidecar bound.');
  return bytes;
}

function captureReadback(value: unknown): PatternImportDxfProductCompositeSidecarFreshReadbackV4 {
  const record = plainDataRecord(
    value,
    ['status', 'source', 'mediaType', 'sha256', 'byteLength', 'bytes'],
    'readback',
  );
  if (
    record.status !== 'present' ||
    record.source !== 'fresh-current-sidecar-get' ||
    record.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 ||
    typeof record.sha256 !== 'string' ||
    !SHA256.test(record.sha256) ||
    !Number.isSafeInteger(record.byteLength) ||
    (record.byteLength as number) < 1 ||
    (record.byteLength as number) > MAX_SIDECAR_BYTES
  )
    fail('invalid-readback', 'readback', 'Fresh Composite V4 readback metadata is invalid.');
  const bytes = copyBytes(record.bytes);
  if (bytes.byteLength !== record.byteLength)
    fail('invalid-readback', 'readback', 'Readback byte length differs from its metadata.');
  return Object.freeze({
    status: 'present' as const,
    source: 'fresh-current-sidecar-get' as const,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
    sha256: record.sha256,
    byteLength: record.byteLength as number,
    bytes,
  });
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

function sameOperation(
  left: ExactNBindings['selectedOperation'],
  right: ExactNBindings['selectedOperation'],
) {
  return (
    left.sourceOperationNumber === right.sourceOperationNumber &&
    left.authoringOperationId === right.authoringOperationId &&
    left.localOperationOrder === right.localOperationOrder &&
    left.seamIds.length === right.seamIds.length &&
    left.seamIds.every((seamId, index) => seamId === right.seamIds[index])
  );
}

function validateVerifiedPersistence(
  value: unknown,
  current: ExactNBindings,
): VerifiedPersistenceV4 {
  if (!value || typeof value !== 'object')
    fail('unverified-persistence-outcome', 'input', 'A verified persistence result is required.');
  const result = value as Partial<VerifiedPersistenceV4>;
  if (
    result.ok !== true ||
    result.writeOutcome !== 'verified' ||
    !Array.isArray(result.blockers) ||
    result.blockers.length !== 0 ||
    !result.receipt ||
    result.receipt.schemaVersion !==
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_RECEIPT_V4 ||
    result.receipt.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4
  )
    fail(
      'unverified-persistence-outcome',
      'input',
      'Unknown, acknowledged-unverified, failed or malformed persistence cannot mint restore authority.',
    );
  const receipt = result.receipt;
  if (
    receipt.techCardId !== current.row.techCardId ||
    receipt.patternLineKey !== current.row.patternLineKey ||
    receipt.savedRowRevision !== current.row.revision ||
    receipt.cardLockVersion !== current.row.cardLockVersion ||
    receipt.dxfSha256 !== current.row.sha256 ||
    receipt.selectedOperationNumber !== current.selectedOperation.sourceOperationNumber ||
    receipt.serverAssemblyRevision !== current.serverAssemblyRevision ||
    receipt.assemblyTopologySha256 !== current.assemblyTopologySha256 ||
    !SHA256.test(receipt.sidecarSha256) ||
    !Number.isSafeInteger(receipt.canonicalByteLength) ||
    receipt.canonicalByteLength < 1 ||
    receipt.canonicalByteLength > MAX_SIDECAR_BYTES
  )
    fail(
      'receipt-binding-mismatch',
      'input',
      'Persistence receipt differs from current authority.',
    );
  return result as VerifiedPersistenceV4;
}

async function sha256(
  bytes: Uint8Array<ArrayBuffer>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'codec', 'SHA-256 is unavailable.');
  try {
    const known = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode('abc')));
    const knownHex = Array.from(known, (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (known.byteLength !== 32 || knownHex !== SHA256_ABC)
      fail('sha256-unavailable', 'codec', 'SHA-256 self-test mismatch.');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer));
    if (digest.byteLength !== 32)
      fail('sha256-unavailable', 'codec', 'SHA-256 returned an invalid digest.');
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof RestoreFailure) throw error;
    fail('sha256-unavailable', 'codec', 'SHA-256 failed.');
  }
}

function makeOwner(
  patch: PatternImportDxfProductExactNSeamRestorePatchV2,
  sidecarSha256: string,
): PatternImportDxfProductExactNSeamRestoreOwnerV2 {
  const owner = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_RESTORE_OWNER_V2,
    seamCount: patch.seams.length,
    sidecarSha256,
  }) as PatternImportDxfProductExactNSeamRestoreOwnerV2;
  ownerStates.set(owner, Object.freeze({ patch }));
  return owner;
}

export function readPatternImportDxfProductExactNSeamRestorePatchV2(
  owner: PatternImportDxfProductExactNSeamRestoreOwnerV2,
): PatternImportDxfProductExactNSeamRestorePatchV2 | null {
  const state = owner && typeof owner === 'object' ? ownerStates.get(owner) : undefined;
  return state?.patch ?? null;
}

export function createPatternImportDxfProductCompositeSidecarRestoreAuthorityV4(
  host: PatternImportDxfProductCompositeSidecarRestoreHostV4,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Readonly<{
  restore: (
    request: PatternImportDxfProductCompositeSidecarRestoreRequestV4,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfProductCompositeSidecarRestoreResultV4>;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_CLAIMS_V4;
}> {
  const read = host?.readCurrentCompositeV4;
  return Object.freeze({
    async restore(request, signal) {
      try {
        if (typeof read !== 'function')
          fail('invalid-host', 'input', 'Restore host is unavailable.');
        if (
          !request ||
          typeof request !== 'object' ||
          request.schemaVersion !==
            PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_REQUEST_V4 ||
          !request.current
        )
          fail('invalid-request', 'input', 'Composite V4 restore request is invalid.');
        if (!(signal instanceof AbortSignal))
          fail('invalid-request', 'input', 'A genuine AbortSignal is required.');
        if (signal.aborted) fail('cancelled', 'input', 'Restore was cancelled before readback.');
        const persistence = validateVerifiedPersistence(
          request.verifiedPersistence,
          request.current,
        );

        let raw: unknown;
        try {
          raw = await Reflect.apply(read, host, [
            {
              techCardId: request.current.row.techCardId,
              patternLineKey: request.current.row.patternLineKey,
            },
            signal,
          ]);
        } catch {
          fail(
            signal.aborted ? 'cancelled' : 'readback-failed',
            'readback',
            signal.aborted ? 'Restore readback was cancelled.' : 'Fresh sidecar readback failed.',
          );
        }
        if (signal.aborted) fail('cancelled', 'readback', 'Restore was cancelled after readback.');
        const readback = captureReadback(raw);
        const digest = await sha256(readback.bytes, crypto);
        if (
          digest !== readback.sha256 ||
          digest !== persistence.receipt.sidecarSha256 ||
          readback.byteLength !== persistence.receipt.canonicalByteLength
        )
          fail(
            'readback-digest-mismatch',
            'readback',
            'Fresh readback bytes, digest, length and verified persistence receipt differ.',
          );

        const decoded = await decodePatternImportDxfProductCompositeSidecarV4(
          readback.bytes,
          crypto,
        );
        if (!decoded.ok) fail('sidecar-codec-failed', 'codec', decoded.blockers[0].detail);
        const decodedBindings = decoded.exactNSeam.carrier.bindings;
        if (
          !sameRow(decoded.document.bindings.row, request.current.row) ||
          !sameRow(decodedBindings.row, request.current.row)
        )
          fail('saved-row-binding-mismatch', 'authority', 'Saved-row bindings are stale.');
        if (
          decoded.document.bindings.serverAssemblyRevision !==
            request.current.serverAssemblyRevision ||
          decoded.document.bindings.assemblyTopologySha256 !==
            request.current.assemblyTopologySha256 ||
          decodedBindings.serverAssemblyRevision !== request.current.serverAssemblyRevision ||
          decodedBindings.assemblyTopologySha256 !== request.current.assemblyTopologySha256
        )
          fail('assembly-binding-mismatch', 'authority', 'Assembly bindings are stale.');
        if (!sameOperation(decodedBindings.selectedOperation, request.current.selectedOperation))
          fail('operation-binding-mismatch', 'authority', 'Selected operation bindings are stale.');
        if (
          decodedBindings.catalogCanonicalSha256 !== request.current.catalogCanonicalSha256 ||
          decodedBindings.phaseEAggregatePlanSha256 !== request.current.phaseEAggregatePlanSha256
        )
          fail(
            'catalog-plan-binding-mismatch',
            'authority',
            'Catalog or aggregate-plan binding is stale.',
          );
        if (
          decoded.document.writeCas.expectedPreviousSidecarSha256 !==
          persistence.receipt.previousSidecarSha256
        )
          fail('receipt-binding-mismatch', 'authority', 'Composite CAS differs from the receipt.');
        const seamCount = decoded.exactNSeam.carrier.seams.length;
        if (seamCount < 1 || seamCount === 2)
          fail(
            'v1-two-seam-path-required',
            'authority',
            'Composite V4 restore accepts one or greater-than-two seams; exact two stays V3/V1.',
          );
        const patch = Object.freeze({
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_RESTORE_PATCH_V2,
          status: 'confirmed-exact-n-seam-prefill' as const,
          authority: 'verified-composite-v4-full-readback' as const,
          bindings: decodedBindings,
          seams: decoded.exactNSeam.carrier.seams,
        });
        return Object.freeze({
          ok: true as const,
          owner: makeOwner(patch, digest),
          blockers: Object.freeze([]) as readonly [],
          claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_CLAIMS_V4,
        });
      } catch (error) {
        return blocked(error);
      }
    },
    claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_CLAIMS_V4,
  });
}
