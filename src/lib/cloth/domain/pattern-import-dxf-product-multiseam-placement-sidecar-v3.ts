import {
  capturePatternImportDxfProductBodyFreePlacementWireV1,
  patternImportDxfProductPlacementWireCodecV1,
  type PatternImportDxfProductBodyFreePlacementAuthoringWireV1,
  type PatternImportDxfProductMultiseamPlacementBindingsV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import {
  validateSavedModelObservedPlacementTargetV1,
  type SavedModelObservedPlacementTargetV1,
} from './saved-model-observed-placement-target-codec-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3 =
  'pattern-import-dxf-product-multiseam-placement-sidecar-request/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_DOCUMENT_V3 =
  'pattern-import-dxf-product-multiseam-placement-sidecar-document/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3 =
  'application/vnd.grbpwr.pattern-dxf-product-multiseam-placement.v3+json' as const;
const OWNER = 'pattern-import-dxf-product-multiseam-placement-sidecar-owner/3' as const;
const SEAL = 'pattern-import-dxf-product-multiseam-placement-sidecar-seal/3' as const;
const { detachPlain, canonical, deepFreeze, sha256 } = patternImportDxfProductPlacementWireCodecV1;
const encoder = new TextEncoder();
const MAX_BYTES = 4 * 1024 * 1024;
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V3 = Object.freeze({
  stableRowSourceTopologyBound: true,
  detachedBodyFreeGarmentIntent: true,
  stableObservedTargetMetadataBound: true,
  originalAuthoringSealsAuditOnly: true,
  authoredOriginAndGenerationAuditOnly: true,
  decodedTargetAuthenticatesBody: false,
  omittedBodyGeometryReconstructed: false,
  placementRestoreAuthority: false,
  bodyAdmission: false,
  runtimeAdmission: false,
  persisted: false,
  productionReady: false,
} as const);
export type PatternImportDxfProductMultiseamPlacementAuthoringV3 =
  PatternImportDxfProductBodyFreePlacementAuthoringWireV1 &
    Readonly<{
      observedTarget: Readonly<{
        target: SavedModelObservedPlacementTargetV1;
        canonicalSha256: string;
      }>;
    }>;
export type PatternImportDxfProductMultiseamPlacementSidecarRequestV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3;
  bindings: PatternImportDxfProductMultiseamPlacementBindingsV2;
  placementAuthoring: PatternImportDxfProductMultiseamPlacementAuthoringV3;
}>;
export type PatternImportDxfProductMultiseamPlacementSidecarDocumentV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_DOCUMENT_V3;
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3;
  encoding: 'canonical-json-utf8';
  bindings: PatternImportDxfProductMultiseamPlacementBindingsV2;
  placementAuthoring: PatternImportDxfProductMultiseamPlacementAuthoringV3;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V3;
}>;
export type PatternImportDxfProductMultiseamPlacementSidecarSealV3 = Readonly<{
  schemaVersion: typeof SEAL;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  canonicalByteLength: number;
  authority: 'unsigned-sidecar-storage-consistency-only';
}>;
declare const brand: unique symbol;
export type PatternImportDxfProductMultiseamPlacementSidecarOwnerV3 = Readonly<{
  schemaVersion: typeof OWNER;
  document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV3;
  seal: PatternImportDxfProductMultiseamPlacementSidecarSealV3;
  readonly [brand]: never;
}>;
export type PatternImportDxfProductMultiseamPlacementSidecarResultV3 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductMultiseamPlacementSidecarOwnerV3;
      document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV3;
      seal: PatternImportDxfProductMultiseamPlacementSidecarSealV3;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      owner: null;
      document: null;
      seal: null;
      blockers: readonly [Readonly<{ code: 'invalid-input'; detail: string }>];
    }>;
const owners = new WeakMap<object, Uint8Array<ArrayBuffer>>();
function fail(detail: string): never {
  throw new TypeError(detail);
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('Expected an exact record.');
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)))
    fail('Unexpected or missing placement fields.');
  return value as Record<string, unknown>;
}
function blocked(
  error: unknown,
): Extract<PatternImportDxfProductMultiseamPlacementSidecarResultV3, { ok: false }> {
  return Object.freeze({
    ok: false,
    owner: null,
    document: null,
    seal: null,
    blockers: Object.freeze([
      Object.freeze({
        code: 'invalid-input',
        detail: error instanceof Error ? error.message.slice(0, 2048) : 'Invalid placement.',
      }),
    ]) as readonly [Readonly<{ code: 'invalid-input'; detail: string }>],
  });
}
async function authoring(input: unknown, bindings: unknown) {
  const a = exact(input, [
    'authoredOrigin',
    'authoredImportGeneration',
    'semantics',
    'annular',
    'observedTarget',
  ]);
  const captured = capturePatternImportDxfProductBodyFreePlacementWireV1({
    bindings,
    placementAuthoring: {
      authoredOrigin: a.authoredOrigin,
      authoredImportGeneration: a.authoredImportGeneration,
      semantics: a.semantics,
      annular: a.annular,
    },
  });
  const target = exact(a.observedTarget, ['target', 'canonicalSha256']);
  if (typeof target.canonicalSha256 !== 'string') fail('Expected target digest.');
  const checked = await validateSavedModelObservedPlacementTargetV1(
    target.target,
    target.canonicalSha256,
  );
  if (!checked.ok) fail(`Observed target: ${checked.detail}`);
  return {
    bindings: captured.bindings,
    placementAuthoring: deepFreeze({
      ...captured.placementAuthoring,
      observedTarget: { target: checked.target, canonicalSha256: checked.canonicalSha256 },
    }),
  };
}
async function mint(
  document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  const bytes = encoder.encode(canonical(document));
  if (bytes.byteLength > MAX_BYTES) fail('Placement exceeds its byte bound.');
  const seal = deepFreeze({
    schemaVersion: SEAL,
    algorithm: 'SHA-256' as const,
    canonicalSha256: await sha256(bytes, crypto),
    canonicalByteLength: bytes.byteLength,
    authority: 'unsigned-sidecar-storage-consistency-only' as const,
  });
  const owner = Object.freeze({
    schemaVersion: OWNER,
    document,
    seal,
  }) as PatternImportDxfProductMultiseamPlacementSidecarOwnerV3;
  owners.set(owner, bytes.slice());
  return Object.freeze({
    ok: true as const,
    owner,
    document,
    seal,
    blockers: Object.freeze([]) as readonly [],
  });
}
/** Unsigned storage consistency only. Production emission additionally requires the genuine issuer. */
export async function buildPatternImportDxfProductMultiseamPlacementSidecarV3(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductMultiseamPlacementSidecarResultV3> {
  try {
    const request = exact(detachPlain(input), ['schemaVersion', 'bindings', 'placementAuthoring']);
    if (request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3)
      fail('Unsupported request schema.');
    const captured = await authoring(request.placementAuthoring, request.bindings);
    return await mint(
      deepFreeze({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_DOCUMENT_V3,
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3,
        encoding: 'canonical-json-utf8',
        ...captured,
        claims: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V3,
      }),
      crypto,
    );
  } catch (error) {
    return blocked(error);
  }
}
export async function decodePatternImportDxfProductMultiseamPlacementSidecarV3(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductMultiseamPlacementSidecarResultV3> {
  try {
    if (
      !(input instanceof Uint8Array) ||
      Object.getPrototypeOf(input) !== Uint8Array.prototype ||
      !(input.buffer instanceof ArrayBuffer) ||
      input.byteLength > MAX_BYTES
    )
      fail('Expected bounded canonical UTF-8 bytes.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(input.slice());
    const doc = exact(detachPlain(JSON.parse(text)), [
      'schemaVersion',
      'mediaType',
      'encoding',
      'bindings',
      'placementAuthoring',
      'claims',
    ]);
    if (canonical(doc) !== text) fail('Noncanonical placement bytes.');
    if (
      doc.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_DOCUMENT_V3 ||
      doc.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3 ||
      doc.encoding !== 'canonical-json-utf8'
    )
      fail('Unsupported placement schema/media/encoding.');
    if (
      canonical(doc.claims) !==
      canonical(PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_CLAIMS_V3)
    )
      fail('Placement claims differ.');
    await authoring(doc.placementAuthoring, doc.bindings);
    return await mint(
      deepFreeze(doc as PatternImportDxfProductMultiseamPlacementSidecarDocumentV3),
      crypto,
    );
  } catch (error) {
    return blocked(error);
  }
}
export function encodePatternImportDxfProductMultiseamPlacementSidecarV3(candidate: unknown) {
  const bytes = candidate && typeof candidate === 'object' ? owners.get(candidate) : undefined;
  if (!bytes)
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  const owner = candidate as PatternImportDxfProductMultiseamPlacementSidecarOwnerV3;
  return Object.freeze({
    ok: true as const,
    bytes: bytes.slice(),
    canonicalSha256: owner.seal.canonicalSha256,
    canonicalByteLength: bytes.byteLength,
  });
}
