import {
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from './pattern-import-dxf-product-multiseam-mapping-composition-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2,
  evaluatePatternImportDxfProductSavedAnnularLocalFramePreflightV2,
  type PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2,
  type PatternImportDxfProductSavedAnnularWriterFrameReceiptV2,
} from './pattern-import-dxf-product-saved-annular-local-frame-preflight-v2';
import { readPatternImportDxfProductSavedAnnularFrameReplayCarrierV3 } from './pattern-import-dxf-product-saved-annular-frame-replay-carrier-v3';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_SAVED_LOCAL_FRAME_INTERNAL_REQUEST_V2,
  buildPatternImportDxfProductGarmentMeshComposerSavedLocalFrameInternalV2,
  disposePatternImportDxfProductGarmentMeshComposerV3,
  projectPatternImportDxfProductGarmentMeshComposerV3,
  type PatternImportDxfProductGarmentMeshComposerOwnerV3,
  type PatternImportDxfProductGarmentMeshComposerProjectionV3,
  type PatternImportDxfProductGarmentMeshComposerSavedLocalFrameEvidenceV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v3';
import { writeDxfDetailed } from '../../pattern-import/write';

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_REQUEST_V2 =
  'pattern-import-dxf-product-saved-local-frame-garment-mesh-composer-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_V2 =
  'pattern-import-dxf-product-saved-local-frame-garment-mesh-composer/2' as const;

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const HEX = '0123456789abcdef';
const MAX_DEPTH = 48;
const MAX_NODES = 300_000;
const MAX_PROPERTIES = 1_200_000;
const MAX_ARRAY = 300_000;
const MAX_STRING = 16 * 1024 * 1024;
const encoder = new TextEncoder();
const arrayIsArray = Array.isArray;
const arrayBufferIsView = ArrayBuffer.isView;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectIs = Object.is;
const objectFreeze = Object.freeze;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const arrayBufferPrototype = ArrayBuffer.prototype;
const uint8ArrayConstructor = Uint8Array;
const dateConstructor = Date;
const nativeError = Error;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const jsonStringify = JSON.stringify;
const arrayJoin = Array.prototype.join;
const arraySort = Array.prototype.sort;
const stringCharCodeAt = String.prototype.charCodeAt;
const stringSlice = String.prototype.slice;
const textEncoderEncode = objectGetOwnPropertyDescriptor(TextEncoder.prototype, 'encode')?.value;
const weakMapGet = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'get')?.value;
const weakMapSet = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'set')?.value;
const weakMapHas = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'has')?.value;
const weakMapDelete = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'delete')?.value;
const subtleDigest =
  typeof SubtleCrypto === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(SubtleCrypto.prototype, 'digest')?.value;

export type PatternImportDxfProductSavedLocalFrameGarmentMeshComposerRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_REQUEST_V2;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_CLAIMS_V2 =
  objectFreeze({
    genuineComposerV3OwnerPublished: true,
    writerReplayBytesExactBoundToSavedRow: true,
    durableReplayCarrierExactBound: true,
    writerFrameReceiptExactBound: true,
    aggregateSourcePathIdsExactBound: true,
    aggregateSourcePathCoordinatesExactBound: true,
    originalWrittenFrameEvaluationAccepted: true,
    sourceLocalF32RefinementUsed: true,
    exactFreshLocalLatticeIdsMatched: true,
    outputReturnedToPersistedWrittenFrame: true,
    canonical580v912tTopologyParityEstablished: true,
    fullWrittenToLocalLatticePhaseChangeObserved: true,
    geometryExtremaInferenceUsed: false,
    sourceAuthenticityAccepted: false,
    placementAuthority: false,
    runtimeAuthority: false,
    persistenceAuthority: false,
    productionAuthority: false,
  } as const);

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_BLOCKERS_V2 =
  objectFreeze([
    'source-authenticity-not-established',
    'row-chronology-not-authenticated',
    'placement-not-proven',
    'runtime-owner-not-integrated',
    'persistence-not-integrated',
    'production-qualification-not-run',
  ] as const);

export type PatternImportDxfProductSavedLocalFrameGarmentMeshComposerSnapshotV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_V2;
  status: 'saved-local-frame-genuine-composer-v3-ready';
  bindings: Readonly<{
    rowDxfSha256: string;
    sourceFileSha256: string;
    aggregateCanonicalSha256: string;
    sourcePathCoordinateSha256: string;
    compositionCanonicalSha256: string;
    composerV2CanonicalSha256: string;
    composerV3CanonicalSha256: string;
    phase2ArtifactSha256: string;
    replayCarrierCanonicalSha256: string;
    writerFrameReceiptCanonicalSha256: string;
    localFramePreflightCanonicalSha256: string;
    localArtifactSha256: string;
    writtenArtifactSha256: string;
    writtenFrameDiagnosticArtifactSha256: string;
    phaseEvidenceSha256: string;
    localSourceIdsSha256: string;
    translationSha256: string;
  }>;
  refinement: PatternImportDxfProductGarmentMeshComposerSavedLocalFrameEvidenceV2;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_CLAIMS_V2;
  blockers: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_BLOCKERS_V2;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-saved-local-frame-consistency-only';
  }>;
}>;

declare const savedOwnerBrand: unique symbol;
export type PatternImportDxfProductSavedLocalFrameGarmentMeshComposerOwnerV2 =
  PatternImportDxfProductGarmentMeshComposerOwnerV3 &
    Readonly<{ readonly [savedOwnerBrand]: never }>;

export type PatternImportDxfProductSavedLocalFrameGarmentMeshComposerProjectionV2 = Readonly<{
  snapshot: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerSnapshotV2;
  composerV3: PatternImportDxfProductGarmentMeshComposerProjectionV3;
  localFramePreflight: PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2;
  callerOwnedMutableCopies: true;
  placementAuthority: false;
  runtimeAuthority: false;
  persistenceAuthority: false;
  productionAuthority: false;
}>;

export type PatternImportDxfProductSavedLocalFrameGarmentMeshComposerBlockerCodeV2 =
  | 'invalid-input'
  | 'sha256-unavailable'
  | 'composer-v2-owner-unavailable'
  | 'composition-rebuild-blocked'
  | 'composer-binding-mismatch'
  | 'writer-replay-binding-mismatch'
  | 'writer-frame-carrier-blocked'
  | 'writer-frame-binding-mismatch'
  | 'aggregate-source-path-binding-mismatch'
  | 'local-frame-preflight-blocked'
  | 'local-frame-geometry-incompatible'
  | 'local-frame-refinement-blocked'
  | 'composer-v3-owner-invalid';

type FalseClaims = Readonly<
  Record<
    keyof typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_CLAIMS_V2,
    false
  >
>;

export type PatternImportDxfProductSavedLocalFrameGarmentMeshComposerResultV2 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerOwnerV2;
      snapshot: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerSnapshotV2;
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_CLAIMS_V2;
      blockers: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_BLOCKERS_V2;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      claims: FalseClaims;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerBlockerCodeV2;
          detail: string;
        }>,
      ];
    }>;

type OwnerRecord = Readonly<{
  snapshot: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerSnapshotV2;
  localFramePreflight: PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2;
}>;
const owners = new WeakMap<object, OwnerRecord>();

class SavedLocalFrameFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerBlockerCodeV2,
    detail: string,
  ) {
    super(reflectApply(stringSlice, detail, [0, 2_048]) as string);
  }
}

function fail(
  code: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerBlockerCodeV2,
  detail: string,
): never {
  throw new SavedLocalFrameFailure(code, detail);
}

const FALSE_CLAIMS = objectFreeze({
  genuineComposerV3OwnerPublished: false,
  writerReplayBytesExactBoundToSavedRow: false,
  durableReplayCarrierExactBound: false,
  writerFrameReceiptExactBound: false,
  aggregateSourcePathIdsExactBound: false,
  aggregateSourcePathCoordinatesExactBound: false,
  originalWrittenFrameEvaluationAccepted: false,
  sourceLocalF32RefinementUsed: false,
  exactFreshLocalLatticeIdsMatched: false,
  outputReturnedToPersistedWrittenFrame: false,
  canonical580v912tTopologyParityEstablished: false,
  fullWrittenToLocalLatticePhaseChangeObserved: false,
  geometryExtremaInferenceUsed: false,
  sourceAuthenticityAccepted: false,
  placementAuthority: false,
  runtimeAuthority: false,
  persistenceAuthority: false,
  productionAuthority: false,
} satisfies FalseClaims);

function blocked(
  error: unknown,
): Extract<PatternImportDxfProductSavedLocalFrameGarmentMeshComposerResultV2, { ok: false }> {
  const failure =
    error instanceof SavedLocalFrameFailure
      ? error
      : new SavedLocalFrameFailure(
          'invalid-input',
          error instanceof nativeError
            ? error.message
            : 'Saved local-frame Composer V3 failed closed.',
        );
  return objectFreeze({
    ok: false as const,
    owner: null,
    snapshot: null,
    claims: FALSE_CLAIMS,
    blockers: objectFreeze([
      objectFreeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [Readonly<{ code: typeof failure.code; detail: string }>],
  });
}

type SnapshotState = { nodes: number; properties: number; active: object[] };

function activeContains(active: readonly object[], value: object): boolean {
  for (let index = 0; index < active.length; index += 1) if (active[index] === value) return true;
  return false;
}

function snapshotPlain(value: unknown, path: string, depth: number, state: SnapshotState): unknown {
  if (value === null || typeof value === 'boolean' || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) fail('invalid-input', `${path} exceeds string bounds.`);
    return value;
  }
  if (typeof value === 'number') {
    if (!numberIsFinite(value) || objectIs(value, -0))
      fail('invalid-input', `${path} must be finite canonical numeric data.`);
    return value;
  }
  if (!value || typeof value !== 'object' || arrayBufferIsView(value))
    fail('invalid-input', `${path} must contain plain data only.`);
  if (depth > MAX_DEPTH) fail('invalid-input', `${path} exceeds depth bounds.`);
  if (activeContains(state.active, value)) fail('invalid-input', `${path} contains a cycle.`);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = objectGetPrototypeOf(value);
    descriptors = objectGetOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', `${path} could not be inspected safely.`);
  }
  const isArray = arrayIsArray(value);
  if (prototype !== (isArray ? arrayPrototype : objectPrototype) && prototype !== null)
    fail('invalid-input', `${path} has an unsupported prototype.`);
  const keys = reflectOwnKeys(descriptors);
  const dataKeys: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!;
    if (typeof key !== 'string') fail('invalid-input', `${path} contains symbol fields.`);
    if (!(isArray && key === 'length')) dataKeys[dataKeys.length] = key;
  }
  state.nodes += 1;
  state.properties += dataKeys.length;
  if (state.nodes > MAX_NODES || state.properties > MAX_PROPERTIES)
    fail('invalid-input', `${path} exceeds graph bounds.`);
  state.active[state.active.length] = value;
  try {
    if (isArray) {
      const length = descriptors.length;
      if (
        !length ||
        !('value' in length) ||
        !numberIsSafeInteger(length.value) ||
        length.value < 0 ||
        length.value > MAX_ARRAY ||
        dataKeys.length !== length.value
      )
        fail('invalid-input', `${path} must be one bounded dense array.`);
      const output: unknown[] = [];
      for (let index = 0; index < dataKeys.length; index += 1) {
        const key = dataKeys[index]!;
        if (key !== `${index}`) fail('invalid-input', `${path} must be one bounded dense array.`);
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
          fail('invalid-input', `${path}[${key}] must be own enumerable data.`);
        output[index] = snapshotPlain(descriptor.value, `${path}[${key}]`, depth + 1, state);
      }
      return output;
    }
    const output: Record<string, unknown> = {};
    for (let index = 0; index < dataKeys.length; index += 1) {
      const key = dataKeys[index]!;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
        fail('invalid-input', `${path}.${key} must be own enumerable data.`);
      output[key] = snapshotPlain(descriptor.value, `${path}.${key}`, depth + 1, state);
    }
    return output;
  } finally {
    state.active.length -= 1;
  }
}

function snapshotData<T>(value: T, path: string): T {
  return snapshotPlain(value, path, 0, {
    nodes: 0,
    properties: 0,
    active: [],
  }) as T;
}

function exactInput(input: unknown): {
  composerV2Owner: unknown;
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
} {
  if (!input || typeof input !== 'object' || arrayIsArray(input) || arrayBufferIsView(input))
    fail('invalid-input', 'Saved local-frame Composer request must be one exact record.');
  let descriptors: PropertyDescriptorMap;
  try {
    if (objectGetPrototypeOf(input) !== objectPrototype)
      fail('invalid-input', 'Saved local-frame Composer request must be plain.');
    descriptors = objectGetOwnPropertyDescriptors(input);
  } catch (error) {
    if (error instanceof SavedLocalFrameFailure) throw error;
    fail('invalid-input', 'Saved local-frame Composer request reflection failed closed.');
  }
  const expected = ['composerV2Owner', 'compositionRequest', 'schemaVersion', 'writerFrameReceipt'];
  const keys = reflectOwnKeys(descriptors);
  const actual: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string')
      fail('invalid-input', 'Saved local-frame Composer request has unexpected fields.');
    actual[actual.length] = key;
  }
  reflectApply(arraySort, actual, []);
  if (actual.length !== expected.length)
    fail('invalid-input', 'Saved local-frame Composer request has unexpected fields.');
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index])
      fail('invalid-input', 'Saved local-frame Composer request has unexpected fields.');
    const key = expected[index]!;
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      fail('invalid-input', `Saved local-frame Composer request ${key} must be own data.`);
  }
  if (
    descriptors.schemaVersion!.value !==
    PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_REQUEST_V2
  )
    fail('invalid-input', 'Saved local-frame Composer request version is unsupported.');
  return {
    composerV2Owner: descriptors.composerV2Owner!.value,
    compositionRequest: snapshotData(descriptors.compositionRequest!.value, 'compositionRequest'),
    writerFrameReceipt: snapshotData(descriptors.writerFrameReceipt!.value, 'writerFrameReceipt'),
  };
}

function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return jsonStringify(value);
  if (typeof value === 'number') {
    if (!numberIsFinite(value)) fail('invalid-input', 'Canonical number is invalid.');
    return jsonStringify(objectIs(value, -0) ? 0 : value);
  }
  if (arrayIsArray(value)) {
    const descriptors: PropertyDescriptorMap = objectGetOwnPropertyDescriptors(value as object);
    const length = descriptors.length;
    if (!length || !('value' in length) || !numberIsSafeInteger(length.value) || length.value < 0)
      fail('invalid-input', 'Canonical array length is invalid.');
    const values: string[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors[`${index}`];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
        fail('invalid-input', 'Canonical array must contain own enumerable data only.');
      values[index] = canonical(descriptor.value);
    }
    const keys = reflectOwnKeys(descriptors);
    if (keys.length !== length.value + 1)
      fail('invalid-input', 'Canonical array contains extra fields.');
    return `[${reflectApply(arrayJoin, values, [',']) as string}]`;
  }
  if (!value || typeof value !== 'object' || arrayBufferIsView(value))
    fail('invalid-input', 'Canonical value is invalid.');
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(descriptors);
  const keys: string[] = [];
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index];
    if (typeof key !== 'string') fail('invalid-input', 'Canonical value contains symbols.');
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      fail('invalid-input', 'Canonical value contains accessors or hidden fields.');
    keys[keys.length] = key;
  }
  reflectApply(arraySort, keys, []);
  const fields: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!;
    fields[index] = `${jsonStringify(key)}:${canonical(descriptors[key]!.value)}`;
  }
  return `{${reflectApply(arrayJoin, fields, [',']) as string}}`;
}

type DigestAuthority = Readonly<{ subtle: SubtleCrypto; digest: SubtleCrypto['digest'] }>;

function digestAuthority(): DigestAuthority {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || !subtleDigest)
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 is unavailable.');
  return objectFreeze({ subtle, digest: subtleDigest as SubtleCrypto['digest'] });
}

function encodeText(value: string): Uint8Array {
  if (!textEncoderEncode) fail('sha256-unavailable', 'Native TextEncoder is unavailable.');
  return reflectApply(textEncoderEncode, encoder, [value]) as Uint8Array;
}

async function digest(bytes: Uint8Array, authority: DigestAuthority): Promise<string> {
  let result: ArrayBuffer;
  try {
    result = (await reflectApply(authority.digest, authority.subtle, [
      'SHA-256',
      bytes,
    ])) as ArrayBuffer;
  } catch {
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 failed.');
  }
  if (objectGetPrototypeOf(result) !== arrayBufferPrototype || result.byteLength !== 32)
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 returned an invalid digest.');
  const digestBytes = new uint8ArrayConstructor(result);
  let hex = '';
  for (let index = 0; index < digestBytes.length; index += 1) {
    const byte = digestBytes[index]!;
    hex += HEX[byte >>> 4]! + HEX[byte & 0x0f]!;
  }
  return hex;
}

async function validateDigest(authority: DigestAuthority): Promise<void> {
  if ((await digest(new uint8ArrayConstructor(0), authority)) !== EMPTY_SHA256)
    fail('sha256-unavailable', 'SHA-256 empty-message known answer failed.');
  if ((await digest(encodeText('abc'), authority)) !== ABC_SHA256)
    fail('sha256-unavailable', 'SHA-256 abc known answer failed.');
}

async function sha256Plain(
  domain: string,
  value: unknown,
  authority: DigestAuthority,
): Promise<string> {
  return digest(encodeText(`${domain}\0${canonical(value)}`), authority);
}

function isSha256(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 64) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = reflectApply(stringCharCodeAt, value, [index]) as number;
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) return false;
  }
  return true;
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1)
    if (left[index] !== right[index]) return false;
  return true;
}

function sortedNumbers(values: readonly number[]): number[] {
  const result: number[] = [];
  for (let index = 0; index < values.length; index += 1) result[index] = values[index]!;
  reflectApply(arraySort, result, [(left: number, right: number) => left - right]);
  return result;
}

export async function buildPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(
  input: unknown,
): Promise<PatternImportDxfProductSavedLocalFrameGarmentMeshComposerResultV2> {
  let composerV3Owner: PatternImportDxfProductGarmentMeshComposerOwnerV3 | null = null;
  try {
    const request = exactInput(input);
    const authority = digestAuthority();
    await validateDigest(authority);
    const v2 = projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner);
    if (!v2) fail('composer-v2-owner-unavailable', 'A live genuine Composer V2 owner is required.');
    const v2Owner = request.composerV2Owner as PatternImportDxfProductGarmentMeshComposerOwnerV2;
    const v2Snapshot = v2Owner.snapshot;
    if (
      v2Snapshot.origin !== 'verified-saved-row' ||
      v2.composerCanonicalSha256 !== v2Snapshot.seal.canonicalSha256 ||
      v2.phase2ArtifactSha256 !== v2Snapshot.seals.phase2ArtifactSha256
    )
      fail('composer-binding-mismatch', 'Composer V2 is not an exact verified saved-row source.');

    const composed = await buildPatternImportDxfProductMultiseamMappingCompositionV2(
      request.compositionRequest,
    );
    if (!composed.ok)
      fail(
        'composition-rebuild-blocked',
        `${composed.blockers[0].code}: ${composed.blockers[0].detail}`,
      );
    if (
      composed.aggregateSeal.canonicalSha256 !== v2Snapshot.seals.aggregateCanonicalSha256 ||
      composed.compositionSeal.canonicalSha256 !== v2Snapshot.seals.compositionCanonicalSha256 ||
      composed.evidence.productExportSha256 !== v2Snapshot.row.dxfSha256 ||
      composed.evidence.sourceFileSha256 !== v2Snapshot.seals.sourceFileSha256 ||
      composed.evidence.techCardId !== v2Snapshot.row.techCardId ||
      composed.evidence.scopeKey !== v2Snapshot.row.scopeKey ||
      composed.evidence.patternLineKey !== v2Snapshot.row.patternLineKey ||
      composed.evidence.patternVersion !== v2Snapshot.row.patternVersion ||
      composed.evidence.cardLockVersion !== v2Snapshot.row.cardLockVersion ||
      composed.evidence.importGeneration !== v2Snapshot.row.importGeneration
    )
      fail('composer-binding-mismatch', 'Fresh composition differs from the Composer V2 source.');

    const receipt = request.writerFrameReceipt;
    if (
      receipt.sourceFileSha256 !== v2Snapshot.seals.sourceFileSha256 ||
      receipt.writerExportSha256 !== v2Snapshot.row.dxfSha256 ||
      receipt.aggregateCanonicalSha256 !== composed.aggregateSeal.canonicalSha256 ||
      receipt.sourcePathCoordinateSha256 !==
        composed.aggregate.sourceBinding.sourcePathCoordinateSha256
    )
      fail(
        'writer-frame-binding-mismatch',
        'Writer receipt differs from row or aggregate binding.',
      );
    let replay: (typeof request.compositionRequest.draft.scopes)[number]['writerReplay'] | null =
      null;
    let matchingScopeCount = 0;
    for (let index = 0; index < request.compositionRequest.draft.scopes.length; index += 1) {
      const scope = request.compositionRequest.draft.scopes[index]!;
      if (scope.target.scopeKey === v2Snapshot.row.scopeKey) {
        matchingScopeCount += 1;
        replay = scope.writerReplay;
      }
    }
    if (matchingScopeCount !== 1) replay = null;
    if (!replay) fail('writer-replay-binding-mismatch', 'No unique saved writer replay exists.');
    const written = writeDxfDetailed(replay.job, {
      now: () => new dateConstructor(replay.createdAt),
    });
    const replaySha256 = await digest(encodeText(written.dxfText), authority);
    if (
      replaySha256 !== v2Snapshot.row.dxfSha256 ||
      replaySha256 !== receipt.writerExportSha256 ||
      replaySha256 !== receipt.sourceFileSha256 ||
      replay.job.scope.scopeKey !== v2Snapshot.row.scopeKey
    )
      fail('writer-replay-binding-mismatch', 'Writer replay bytes differ from the saved row.');
    const carrier = readPatternImportDxfProductSavedAnnularFrameReplayCarrierV3(replay.job.replay);
    if (!carrier.ok)
      fail('writer-frame-carrier-blocked', `${carrier.blocker.code}: ${carrier.blocker.detail}`);

    const translations: {
      pieceId: string;
      sourceToWrittenTranslationMm: readonly [number, number];
    }[] = [];
    for (let persistedIndex = 0; persistedIndex < receipt.pieces.length; persistedIndex += 1) {
      const persisted = receipt.pieces[persistedIndex]!;
      let carrierPiece: (typeof carrier.carrier.pieces)[number] | null = null;
      for (let pieceIndex = 0; pieceIndex < carrier.carrier.pieces.length; pieceIndex += 1) {
        const piece = carrier.carrier.pieces[pieceIndex]!;
        if (piece.pieceId === persisted.pieceId) carrierPiece = piece;
      }
      let block: (typeof written.plan.blocks)[number] | null = null;
      for (let blockIndex = 0; blockIndex < written.plan.blocks.length; blockIndex += 1) {
        const candidate = written.plan.blocks[blockIndex]!;
        if (candidate.name === persisted.blockName && candidate.identity === persisted.pieceId)
          block = candidate;
      }
      if (
        !carrierPiece ||
        !block ||
        carrierPiece.blockName !== persisted.blockName ||
        !sameNumbers(carrierPiece.sourceApexMm, persisted.sourceApexMm) ||
        !sameNumbers(carrierPiece.sourceToWrittenAffine, persisted.sourceToWrittenAffine) ||
        persisted.sourceToWrittenAffine[0] !== 1 ||
        persisted.sourceToWrittenAffine[1] !== 0 ||
        persisted.sourceToWrittenAffine[2] !== 0 ||
        persisted.sourceToWrittenAffine[3] !== 1
      )
        fail(
          'writer-frame-binding-mismatch',
          `${persisted.pieceId} receipt differs from its exact translation-only carrier.`,
        );
      const pathIds: number[] = [];
      for (let seamIndex = 0; seamIndex < composed.aggregate.seams.length; seamIndex += 1) {
        const seam = composed.aggregate.seams[seamIndex]!;
        for (let sideIndex = 0; sideIndex < seam.sides.length; sideIndex += 1) {
          const side = seam.sides[sideIndex]!;
          if (side.pieceId !== persisted.pieceId) continue;
          let present = false;
          for (let pathIndex = 0; pathIndex < pathIds.length; pathIndex += 1)
            if (pathIds[pathIndex] === side.sourcePathId) present = true;
          if (!present) pathIds[pathIds.length] = side.sourcePathId;
        }
      }
      if (!sameNumbers(sortedNumbers(pathIds), sortedNumbers(persisted.sourcePathIds)))
        fail(
          'aggregate-source-path-binding-mismatch',
          `${persisted.pieceId} source PathIds differ from the sealed aggregate.`,
        );
      translations[translations.length] = {
        pieceId: persisted.pieceId,
        sourceToWrittenTranslationMm: [
          persisted.sourceToWrittenAffine[4],
          persisted.sourceToWrittenAffine[5],
        ],
      };
    }

    const local = evaluatePatternImportDxfProductSavedAnnularLocalFramePreflightV2({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2,
      composerSnapshot: v2Snapshot,
      projection: v2,
      writerFrameReceipt: receipt,
    });
    if (!local.ok)
      fail('local-frame-preflight-blocked', `${local.blocker.code}: ${local.blocker.detail}`);
    if (
      local.report.origin !== 'verified-saved-row' ||
      local.report.status !== 'canonical-medium-local-geometry-compatible' ||
      local.report.mismatchReasons.length !== 0
    )
      fail(
        'local-frame-geometry-incompatible',
        (reflectApply(arrayJoin, local.report.mismatchReasons, [', ']) as string) ||
          'Local geometry is incompatible.',
      );
    const replayCarrierCanonicalSha256 = await sha256Plain(
      'saved-local-frame-replay-carrier-v2',
      carrier.carrier,
      authority,
    );
    const writerFrameReceiptCanonicalSha256 = await sha256Plain(
      'saved-local-frame-writer-receipt-v2',
      receipt,
      authority,
    );
    const localFramePreflightCanonicalSha256 = await sha256Plain(
      'saved-local-frame-preflight-v2',
      local.report,
      authority,
    );
    const beforeConsume = projectPatternImportDxfProductGarmentMeshComposerV2(v2Owner);
    if (
      !beforeConsume ||
      beforeConsume.composerCanonicalSha256 !== v2Snapshot.seal.canonicalSha256 ||
      beforeConsume.phase2ArtifactSha256 !== v2Snapshot.seals.phase2ArtifactSha256
    )
      fail('composer-v2-owner-unavailable', 'Composer V2 became stale before refinement.');

    const refined = await buildPatternImportDxfProductGarmentMeshComposerSavedLocalFrameInternalV2({
      schemaVersion:
        PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_SAVED_LOCAL_FRAME_INTERNAL_REQUEST_V2,
      composerV2Owner: v2Owner,
      translations,
    });
    if (!refined.ok)
      fail(
        'local-frame-refinement-blocked',
        `${refined.blockers[0].code}: ${refined.blockers[0].detail}`,
      );
    composerV3Owner = refined.owner;
    const projection = projectPatternImportDxfProductGarmentMeshComposerV3(refined.owner);
    if (
      !projection ||
      projection.composerCanonicalSha256 !== refined.snapshot.seal.canonicalSha256 ||
      projection.composerV2CanonicalSha256 !== v2Snapshot.seal.canonicalSha256 ||
      projection.phase2ArtifactSha256 !== v2Snapshot.seals.phase2ArtifactSha256 ||
      projection.refinedArtifactSha256 !== refined.evidence.writtenArtifactSha256 ||
      projection.mesh.restPositions2Mm.length / 2 !== 580 ||
      projection.mesh.triangles.length / 3 !== 912
    )
      fail('composer-v3-owner-invalid', 'Genuine saved local-frame V3 projection is invalid.');

    const bindings = objectFreeze({
      rowDxfSha256: v2Snapshot.row.dxfSha256,
      sourceFileSha256: v2Snapshot.seals.sourceFileSha256,
      aggregateCanonicalSha256: composed.aggregateSeal.canonicalSha256,
      sourcePathCoordinateSha256: composed.aggregate.sourceBinding.sourcePathCoordinateSha256,
      compositionCanonicalSha256: composed.compositionSeal.canonicalSha256,
      composerV2CanonicalSha256: v2Snapshot.seal.canonicalSha256,
      composerV3CanonicalSha256: refined.snapshot.seal.canonicalSha256,
      phase2ArtifactSha256: v2Snapshot.seals.phase2ArtifactSha256,
      replayCarrierCanonicalSha256,
      writerFrameReceiptCanonicalSha256,
      localFramePreflightCanonicalSha256,
      localArtifactSha256: refined.evidence.localArtifactSha256,
      writtenArtifactSha256: refined.evidence.writtenArtifactSha256,
      writtenFrameDiagnosticArtifactSha256: refined.evidence.writtenFrameDiagnosticArtifactSha256,
      phaseEvidenceSha256: refined.evidence.phaseEvidenceSha256,
      localSourceIdsSha256: refined.evidence.localSourceIdsSha256,
      translationSha256: refined.evidence.translationSha256,
    });
    const bindingDescriptors = objectGetOwnPropertyDescriptors(bindings);
    const bindingKeys = reflectOwnKeys(bindingDescriptors);
    for (let index = 0; index < bindingKeys.length; index += 1) {
      const key = bindingKeys[index];
      if (typeof key !== 'string')
        fail('sha256-unavailable', 'Saved local-frame binding contains an invalid key.');
      const descriptor = bindingDescriptors[key];
      if (!descriptor || !('value' in descriptor) || !isSha256(descriptor.value))
        fail('sha256-unavailable', 'Saved local-frame binding contains an invalid SHA-256.');
    }
    const payload = objectFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_V2,
      status: 'saved-local-frame-genuine-composer-v3-ready' as const,
      bindings,
      refinement: refined.evidence,
      claims: PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_CLAIMS_V2,
      blockers: PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_BLOCKERS_V2,
    });
    const canonicalSha256 = await sha256Plain(
      'pattern-import-dxf-product-saved-local-frame-garment-mesh-composer-v2',
      payload,
      authority,
    );
    const post = projectPatternImportDxfProductGarmentMeshComposerV3(refined.owner);
    if (!post || post.composerCanonicalSha256 !== refined.snapshot.seal.canonicalSha256)
      fail('composer-v3-owner-invalid', 'Genuine Composer V3 became stale during wrapper seal.');
    const snapshot = objectFreeze({
      ...payload,
      seal: objectFreeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-saved-local-frame-consistency-only' as const,
      }),
    }) satisfies PatternImportDxfProductSavedLocalFrameGarmentMeshComposerSnapshotV2;
    const owner = refined.owner as PatternImportDxfProductSavedLocalFrameGarmentMeshComposerOwnerV2;
    if (!weakMapSet) fail('invalid-input', 'Native WeakMap#set is unavailable.');
    reflectApply(weakMapSet, owners, [
      owner,
      objectFreeze({ snapshot, localFramePreflight: local.report }),
    ]);
    composerV3Owner = null;
    return objectFreeze({
      ok: true as const,
      owner,
      snapshot,
      claims: PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_CLAIMS_V2,
      blockers: PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_BLOCKERS_V2,
    });
  } catch (error) {
    if (composerV3Owner) disposePatternImportDxfProductGarmentMeshComposerV3(composerV3Owner);
    return blocked(error);
  }
}

export function projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(
  owner: unknown,
): PatternImportDxfProductSavedLocalFrameGarmentMeshComposerProjectionV2 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  if (!weakMapGet) return null;
  const record = reflectApply(weakMapGet, owners, [owner]) as OwnerRecord | undefined;
  if (!record) return null;
  const base = projectPatternImportDxfProductGarmentMeshComposerV3(owner);
  if (
    !base ||
    base.composerCanonicalSha256 !== record.snapshot.bindings.composerV3CanonicalSha256 ||
    base.composerV2CanonicalSha256 !== record.snapshot.bindings.composerV2CanonicalSha256 ||
    base.refinedArtifactSha256 !== record.snapshot.bindings.writtenArtifactSha256
  )
    return null;
  return objectFreeze({
    snapshot: record.snapshot,
    composerV3: base,
    localFramePreflight: record.localFramePreflight,
    callerOwnedMutableCopies: true as const,
    placementAuthority: false as const,
    runtimeAuthority: false as const,
    persistenceAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposePatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(
  owner: unknown,
): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  if (!weakMapHas || !weakMapDelete || !reflectApply(weakMapHas, owners, [owner])) return false;
  reflectApply(weakMapDelete, owners, [owner]);
  return disposePatternImportDxfProductGarmentMeshComposerV3(owner);
}
