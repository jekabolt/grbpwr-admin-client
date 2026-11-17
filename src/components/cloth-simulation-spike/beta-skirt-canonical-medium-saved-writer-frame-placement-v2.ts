import {
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from '../../lib/cloth/domain/pattern-import-dxf-product-multiseam-mapping-composition-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2,
  evaluatePatternImportDxfProductSavedAnnularLocalFramePreflightV2,
  type PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2,
  type PatternImportDxfProductSavedAnnularWriterFrameReceiptV2,
} from '../../lib/cloth/domain/pattern-import-dxf-product-saved-annular-local-frame-preflight-v2';
import { readPatternImportDxfProductSavedAnnularFrameReplayCarrierV3 } from '../../lib/cloth/domain/pattern-import-dxf-product-saved-annular-frame-replay-carrier-v3';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
} from '../../lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import { projectPatternImportDxfProductGarmentMeshComposerV3 } from '../../lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v3';
import {
  projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2,
  type PatternImportDxfProductSavedLocalFrameGarmentMeshComposerOwnerV2,
} from '../../lib/cloth/domain/pattern-import-dxf-product-saved-local-frame-garment-mesh-composer-v2';
import { writeDxfDetailed } from '../../lib/pattern-import/write';

import type { BetaSkirtG3b2PreviewMannequinResultV1 } from './beta-skirt-g3b2-preview-mannequin-contract-v1';
import {
  isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2,
  type BetaSkirtCanonicalMediumPlacementBodyInputV2,
} from './beta-skirt-canonical-medium-displayed-body-admission-v2';
import {
  buildBetaSkirtCanonicalMediumProductSeamPinV2,
  disposeBetaSkirtCanonicalMediumProductSeamPinV2,
  type BetaSkirtCanonicalMediumProductSeamPinRequestV2,
  type BetaSkirtCanonicalMediumProductSeamPinResultV2,
} from './beta-skirt-canonical-medium-product-seam-pin-v2';
import {
  BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1,
  BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_REQUEST_V1,
  buildBetaSkirtCanonicalMediumProductPlacementWithAuthoredFrameInternalV1,
  disposeBetaSkirtCanonicalMediumProductPlacementV1,
  projectBetaSkirtCanonicalMediumProductPlacementV1,
  type BetaSkirtCanonicalMediumProductAuthoredFrameV1,
  type BetaSkirtCanonicalMediumProductPlacementOwnerV1,
  type BetaSkirtCanonicalMediumProductPlacementProjectionV1,
  type BetaSkirtCanonicalMediumProductPlacementSnapshotV1,
  type BetaSkirtCanonicalMediumProductRefinedMeshExpectationV1,
} from './beta-skirt-canonical-medium-product-placement-v1';
import {
  buildBetaSkirtCanonicalMediumSourceAdmissionV1,
  disposeBetaSkirtCanonicalMediumSourceAdmissionV1,
  type BetaSkirtCanonicalMediumSourceAdmissionRequestV1,
  type BetaSkirtCanonicalMediumSourceAdmissionResultV1,
} from './beta-skirt-canonical-medium-source-admission-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_REQUEST_V2 =
  'beta-skirt-canonical-medium-saved-writer-frame-placement-request/2' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_V2 =
  'beta-skirt-canonical-medium-saved-writer-frame-placement/2' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_OWNER_V2 =
  'beta-skirt-canonical-medium-saved-writer-frame-placement-owner/2' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_PROJECTION_V2 =
  'beta-skirt-canonical-medium-saved-writer-frame-placement-projection/2' as const;

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const HEX = '0123456789abcdef';
const MAX_DEPTH = 48;
const MAX_NODES = 250_000;
const MAX_PROPERTIES = 1_000_000;
const MAX_ARRAY_LENGTH = 250_000;
const MAX_STRING_LENGTH = 16 * 1024 * 1024;
const SAVED_WRITER_FRAME_REFINED_MESH_EXPECTATION_V2 = Object.freeze({
  v2VertexCount: 244,
  v2TriangleCount: 240,
  v3VertexCount: 580,
  v3BoundaryVertexCount: 244,
  v3InteriorVertexCount: 336,
  v3TriangleCount: 912,
  seamCount: 2,
  seamPairCount: 34,
}) satisfies BetaSkirtCanonicalMediumProductRefinedMeshExpectationV1;
const encoder = new TextEncoder();
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const arrayIsArray = Array.isArray;
const arrayBufferIsView = ArrayBuffer.isView;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectIs = Object.is;
const objectFreeze = Object.freeze;
const jsonStringify = JSON.stringify;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const arrayPrototype = Array.prototype;
const objectPrototype = Object.prototype;
const arrayBufferPrototype = ArrayBuffer.prototype;
const uint8ArrayConstructor = Uint8Array;
const dataViewConstructor = DataView;
const dateConstructor = Date;
const nativeError = Error;
const arraySort = objectGetOwnPropertyDescriptor(arrayPrototype, 'sort')?.value;
const arrayJoin = objectGetOwnPropertyDescriptor(arrayPrototype, 'join')?.value;
const uint8ArraySet = Uint8Array.prototype.set;
const dataViewSetUint32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setUint32')?.value;
const stringSlice = objectGetOwnPropertyDescriptor(String.prototype, 'slice')?.value;
const stringCharCodeAt = objectGetOwnPropertyDescriptor(String.prototype, 'charCodeAt')?.value;
const textEncoderEncode = objectGetOwnPropertyDescriptor(TextEncoder.prototype, 'encode')?.value;
const weakMapGet = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'get')?.value;
const weakMapSet = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'set')?.value;
const weakMapDelete = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'delete')?.value;
const subtleDigest =
  typeof SubtleCrypto === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(SubtleCrypto.prototype, 'digest')?.value;

type ReadyMannequin = Extract<BetaSkirtG3b2PreviewMannequinResultV1, { status: 'ready' }>;

export type BetaSkirtCanonicalMediumSavedWriterFramePlacementRequestV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_REQUEST_V2;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  composerV3Owner: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerOwnerV2;
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
}> &
  (
    | Readonly<{ mannequin: ReadyMannequin; canonicalDisplayedBodyOwner?: never }>
    | BetaSkirtCanonicalMediumPlacementBodyInputV2
  );

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_CLAIMS_V2 = Object.freeze({
  durableManifestReplayCarrierFreshDecoded: true,
  writerReplayBytesExactBoundToSavedRow: true,
  writerFrameReceiptExactBoundToCarrier: true,
  sourcePathIdsExactBoundToFreshAggregate: true,
  sourcePathCoordinateSha256ExactBoundToFreshAggregate: true,
  composerV2AndV3ExactBound: true,
  classifyBoundaryUsedPersistedWrittenApex: true,
  annularMappingUsedPersistedWrittenApex: true,
  geometryExtremaInferenceUsed: false,
  privateLegacyDiagnosticOwnerRetained: true,
  canonical580v912tTopologyParityEstablished: true,
  downstreamSeamPinTopologyCompatible: true,
  bodyFrameAuthority: false,
  placementAuthority: false,
  collisionAuthority: false,
  initializationAuthority: false,
  fitAuthority: false,
  runtimeAuthority: false,
  persistenceAuthority: false,
  productionAuthority: false,
} as const);

const BLOCKERS = Object.freeze([
  'source-authenticity-not-established',
  'front-back-orientation-and-gravity-frame-not-qualified',
  'normalized-topology-material-frame-transform-not-qualified',
  'seam-aware-self-intersection-gate-not-qualified',
  'retention-and-support-gate-not-qualified',
  'cloth-solver-settle-not-evaluated',
  'fit-not-qualified',
  'runtime-owner-not-integrated',
  'persistence-not-integrated',
  'production-qualification-not-run',
] as const);

export type BetaSkirtCanonicalMediumSavedWriterFramePlacementSnapshotV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_V2;
  status: 'saved-writer-frame-actual-body-diagnostic';
  bindings: Readonly<{
    rowDxfSha256: string;
    sourceFileSha256: string;
    aggregateCanonicalSha256: string;
    sourcePathCoordinateSha256: string;
    compositionCanonicalSha256: string;
    composerV2CanonicalSha256: string;
    composerV3CanonicalSha256: string;
    savedLocalFrameComposerCanonicalSha256: string;
    phase2ArtifactSha256: string;
    refinedArtifactSha256: string;
    localArtifactSha256: string;
    writtenArtifactSha256: string;
    writtenFrameDiagnosticArtifactSha256: string;
    phaseEvidenceSha256: string;
    localSourceIdsSha256: string;
    translationSha256: string;
    replayCarrierCanonicalSha256: string;
    writerFrameReceiptCanonicalSha256: string;
    localFramePreflightCanonicalSha256: string;
    sourceFrameOverrideCanonicalSha256: string;
    placementCanonicalSha256: string;
  }>;
  sourceFrame: Readonly<{
    provenance: 'saved-replay-answer-byte-bound';
    pieces: readonly [
      Readonly<{
        pieceId: 'FRONT';
        blockName: string;
        sourceApexMm: readonly [number, number];
        sourceToWrittenAffine: readonly [number, number, number, number, number, number];
        sourcePathIds: readonly [number, ...number[]];
        writtenApexMm: readonly [number, number];
      }>,
      Readonly<{
        pieceId: 'BACK';
        blockName: string;
        sourceApexMm: readonly [number, number];
        sourceToWrittenAffine: readonly [number, number, number, number, number, number];
        sourcePathIds: readonly [number, ...number[]];
        writtenApexMm: readonly [number, number];
      }>,
    ];
  }>;
  placement: BetaSkirtCanonicalMediumProductPlacementSnapshotV1;
  claims: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_CLAIMS_V2;
  blockers: typeof BLOCKERS;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-saved-frame-diagnostic-consistency-only';
  }>;
}>;

declare const ownerBrand: unique symbol;
export type BetaSkirtCanonicalMediumSavedWriterFramePlacementOwnerV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_OWNER_V2;
  snapshot: BetaSkirtCanonicalMediumSavedWriterFramePlacementSnapshotV2;
  readonly [ownerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumSavedWriterFramePlacementProjectionV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_PROJECTION_V2;
  snapshot: BetaSkirtCanonicalMediumSavedWriterFramePlacementSnapshotV2;
  placement: BetaSkirtCanonicalMediumProductPlacementProjectionV1;
  localFramePreflight: PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2;
  callerOwnedMutableBinaryCopies: true;
  bodyFrameAuthority: false;
  placementAuthority: false;
  collisionAuthority: false;
  initializationAuthority: false;
  fitAuthority: false;
  runtimeAuthority: false;
  persistenceAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumSavedWriterFramePlacementBlockerCodeV2 =
  | 'invalid-input'
  | 'sha256-unavailable'
  | 'composer-v2-owner-unavailable'
  | 'composer-v3-owner-unavailable'
  | 'saved-local-frame-composer-unavailable'
  | 'composer-binding-mismatch'
  | 'saved-origin-required'
  | 'composition-rebuild-blocked'
  | 'writer-replay-binding-mismatch'
  | 'writer-frame-carrier-blocked'
  | 'writer-frame-binding-mismatch'
  | 'aggregate-source-path-binding-mismatch'
  | 'local-frame-preflight-blocked'
  | 'local-frame-geometry-incompatible'
  | 'placement-blocked'
  | 'placement-owner-invalid';

export type BetaSkirtCanonicalMediumSavedWriterFramePlacementResultV2 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumSavedWriterFramePlacementOwnerV2;
      snapshot: BetaSkirtCanonicalMediumSavedWriterFramePlacementSnapshotV2;
      claims: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_CLAIMS_V2;
      blockers: typeof BLOCKERS;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      claims: Readonly<
        Record<
          keyof typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_CLAIMS_V2,
          false
        >
      >;
      blockers: readonly [
        Readonly<{
          code: BetaSkirtCanonicalMediumSavedWriterFramePlacementBlockerCodeV2;
          detail: string;
        }>,
      ];
    }>;

export type BetaSkirtCanonicalMediumSavedWriterFrameSeamPinHandoffRequestV2 = Omit<
  BetaSkirtCanonicalMediumProductSeamPinRequestV2,
  'placementOwner'
>;

export type BetaSkirtCanonicalMediumSavedWriterFrameSourceAdmissionHandoffRequestV2 = Omit<
  BetaSkirtCanonicalMediumSourceAdmissionRequestV1,
  'placementOwner'
>;

export type BetaSkirtCanonicalMediumSavedWriterFrameDisplayedBodyHandoffRequestV2 = Omit<
  import('./beta-skirt-personalized-displayed-body-product-placement-v2').BetaSkirtPersonalizedDisplayedBodyProductPlacementRequestV2,
  'canonicalPlacementOwner' | 'compositionGeneration'
>;

type OwnerRecord = {
  placementOwner: BetaSkirtCanonicalMediumProductPlacementOwnerV1;
  localFramePreflight: PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2;
  disposed: boolean;
  /** Pending/retained observed-body children; the canonical source owner is never exposed. */
  personalizedHandoffs?: Set<() => void>;
};

const owners = new WeakMap<object, OwnerRecord>();

class SavedFramePlacementFailure extends Error {
  constructor(
    readonly code: BetaSkirtCanonicalMediumSavedWriterFramePlacementBlockerCodeV2,
    detail: string,
  ) {
    super(reflectApply(stringSlice, detail, [0, 2_048]) as string);
  }
}

function fail(
  code: BetaSkirtCanonicalMediumSavedWriterFramePlacementBlockerCodeV2,
  detail: string,
): never {
  throw new SavedFramePlacementFailure(code, detail);
}

const FALSE_CLAIMS = Object.freeze(
  Object.fromEntries(
    Object.keys(BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_CLAIMS_V2).map((key) => [
      key,
      false,
    ]),
  ),
) as Readonly<
  Record<keyof typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_CLAIMS_V2, false>
>;

function blocked(error: unknown): BetaSkirtCanonicalMediumSavedWriterFramePlacementResultV2 {
  const failure =
    error instanceof SavedFramePlacementFailure
      ? error
      : new SavedFramePlacementFailure(
          'invalid-input',
          error instanceof nativeError
            ? error.message
            : 'Saved writer-frame placement failed closed.',
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
    if (value.length > MAX_STRING_LENGTH) fail('invalid-input', `${path} exceeds string bounds.`);
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
        length.value > MAX_ARRAY_LENGTH
      )
        fail('invalid-input', `${path} has an invalid array length.`);
      if (dataKeys.length !== length.value)
        fail('invalid-input', `${path} must be a dense array without extras.`);
      for (let index = 0; index < dataKeys.length; index += 1)
        if (dataKeys[index] !== `${index}`)
          fail('invalid-input', `${path} must be a dense array without extras.`);
      const output: unknown[] = [];
      for (let index = 0; index < dataKeys.length; index += 1) {
        const key = dataKeys[index]!;
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
          fail('invalid-input', `${path}[${key}] must be enumerable data.`);
        output[index] = snapshotPlain(descriptor.value, `${path}[${key}]`, depth + 1, state);
      }
      return output;
    }
    const output: Record<string, unknown> = {};
    for (let index = 0; index < dataKeys.length; index += 1) {
      const key = dataKeys[index]!;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
        fail('invalid-input', `${path}.${key} must be enumerable data.`);
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

function exactRequest(input: unknown): {
  composerV2Owner: unknown;
  composerV3Owner: unknown;
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
  mannequin: unknown;
  canonicalDisplayedBodyOwner: unknown | null;
} {
  if (!input || typeof input !== 'object' || arrayIsArray(input) || arrayBufferIsView(input))
    fail('invalid-input', 'Saved writer-frame placement request must be one exact plain record.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = objectGetPrototypeOf(input);
    descriptors = objectGetOwnPropertyDescriptors(input);
  } catch {
    fail('invalid-input', 'Saved writer-frame placement request could not be inspected safely.');
  }
  if (prototype !== objectPrototype && prototype !== null)
    fail('invalid-input', 'Saved writer-frame placement request must use a plain prototype.');
  const observed = Object.prototype.hasOwnProperty.call(descriptors, 'canonicalDisplayedBodyOwner');
  const expected = observed
    ? [
        'canonicalDisplayedBodyOwner',
        'composerV2Owner',
        'composerV3Owner',
        'compositionRequest',
        'schemaVersion',
        'writerFrameReceipt',
      ]
    : [
        'composerV2Owner',
        'composerV3Owner',
        'compositionRequest',
        'mannequin',
        'schemaVersion',
        'writerFrameReceipt',
      ];
  const keys = reflectOwnKeys(descriptors);
  const actual: string[] = [];
  for (const key of keys) if (typeof key === 'string') actual.push(key);
  if (!arraySort) fail('invalid-input', 'Native array sorting is unavailable.');
  reflectApply(arraySort, actual, []);
  if (keys.length !== actual.length || actual.length !== expected.length)
    fail('invalid-input', 'Saved writer-frame placement request has unexpected fields.');
  for (let index = 0; index < actual.length; index += 1)
    if (actual[index] !== expected[index])
      fail('invalid-input', 'Saved writer-frame placement request has unexpected fields.');
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      fail('invalid-input', `Saved writer-frame placement request ${key} must be own data.`);
  }
  if (
    descriptors.schemaVersion!.value !==
    BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_REQUEST_V2
  )
    fail('invalid-input', 'Saved writer-frame placement request version is unsupported.');
  if (observed && !descriptors.canonicalDisplayedBodyOwner!.value)
    fail('invalid-input', 'Canonical displayed body owner must be present.');
  return {
    composerV2Owner: descriptors.composerV2Owner!.value,
    composerV3Owner: descriptors.composerV3Owner!.value,
    compositionRequest: snapshotData(descriptors.compositionRequest!.value, 'compositionRequest'),
    writerFrameReceipt: snapshotData(descriptors.writerFrameReceipt!.value, 'writerFrameReceipt'),
    mannequin: observed ? null : descriptors.mannequin!.value,
    canonicalDisplayedBodyOwner: observed ? descriptors.canonicalDisplayedBodyOwner!.value : null,
  };
}

function exactHandoffRecord(
  input: unknown,
  expected: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || arrayIsArray(input) || arrayBufferIsView(input))
    throw new TypeError(`${label} must be one exact plain record.`);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = objectGetPrototypeOf(input);
    descriptors = objectGetOwnPropertyDescriptors(input);
  } catch {
    throw new TypeError(`${label} could not be inspected safely.`);
  }
  if (prototype !== objectPrototype && prototype !== null)
    throw new TypeError(`${label} must use a plain object prototype.`);
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== expected.length) throw new TypeError(`${label} has unexpected fields.`);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    let allowed = false;
    if (typeof key === 'string')
      for (const candidate of expected) if (candidate === key) allowed = true;
    if (typeof key !== 'string' || !allowed)
      throw new TypeError(`${label} has symbol or unexpected fields.`);
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new TypeError(`${label}.${key} must be one enumerable own data property.`);
    result[key] = descriptor.value;
  }
  for (const expectedKey of expected) {
    let present = false;
    for (const key of keys) if (key === expectedKey) present = true;
    if (!present) throw new TypeError(`${label}.${expectedKey} is required.`);
  }
  return result;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return jsonStringify(value);
  if (typeof value === 'number') {
    if (!numberIsFinite(value)) throw new TypeError('Canonical value contains non-finite data.');
    return jsonStringify(objectIs(value, -0) ? 0 : value);
  }
  if (arrayIsArray(value)) {
    const entries: string[] = [];
    for (let index = 0; index < value.length; index += 1) entries[index] = canonical(value[index]);
    if (!arrayJoin) throw new TypeError('Native array joining is unavailable.');
    return `[${reflectApply(arrayJoin, entries, [',']) as string}]`;
  }
  if (!value || typeof value !== 'object' || arrayBufferIsView(value))
    throw new TypeError('Canonical value contains unsupported data.');
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  const included: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!;
    if (typeof key !== 'string') throw new TypeError('Canonical value contains symbols.');
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor))
      throw new TypeError('Canonical value contains accessors.');
    if (descriptor.value !== undefined) included[included.length] = key;
  }
  if (!arraySort) throw new TypeError('Native array sorting is unavailable.');
  reflectApply(arraySort, included, []);
  const fields: string[] = [];
  for (let index = 0; index < included.length; index += 1) {
    const key = included[index]!;
    fields[index] = `${jsonStringify(key)}:${canonical(descriptors[key]!.value)}`;
  }
  if (!arrayJoin) throw new TypeError('Native array joining is unavailable.');
  return `{${reflectApply(arrayJoin, fields, [',']) as string}}`;
}

type DigestAuthority = Readonly<{ subtle: SubtleCrypto; digest: SubtleCrypto['digest'] }>;

function digestAuthority(): DigestAuthority {
  const subtle = globalThis.crypto?.subtle;
  if (
    !subtle ||
    !subtleDigest ||
    typeof SubtleCrypto === 'undefined' ||
    objectGetPrototypeOf(subtle) !== SubtleCrypto.prototype
  )
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 authority is unavailable.');
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
    fail('sha256-unavailable', 'SHA-256 empty-message known-answer test failed.');
  if ((await digest(encodeText('abc'), authority)) !== ABC_SHA256)
    fail('sha256-unavailable', 'SHA-256 abc known-answer test failed.');
}

async function sha256Plain(
  domain: string,
  value: unknown,
  authority: DigestAuthority,
): Promise<string> {
  const domainBytes = encodeText(`${domain}\0`);
  const valueBytes = encodeText(canonical(value));
  const bytes = new uint8ArrayConstructor(domainBytes.length + 8 + valueBytes.length);
  if (!uint8ArraySet || !dataViewSetUint32)
    fail('sha256-unavailable', 'Native digest framing intrinsics are unavailable.');
  reflectApply(uint8ArraySet, bytes, [domainBytes]);
  const view = new dataViewConstructor(bytes.buffer);
  reflectApply(dataViewSetUint32, view, [domainBytes.length, valueBytes.length, true]);
  reflectApply(dataViewSetUint32, view, [domainBytes.length + 4, 0, true]);
  reflectApply(uint8ArraySet, bytes, [valueBytes, domainBytes.length + 8]);
  return digest(bytes, authority);
}

async function sha256UnframedPlain(
  domain: string,
  value: unknown,
  authority: DigestAuthority,
): Promise<string> {
  return digest(encodeText(`${domain}\0${canonical(value)}`), authority);
}

function isSha256(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 64 || !stringCharCodeAt) return false;
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
  if (!arraySort) fail('invalid-input', 'Native array sorting is unavailable.');
  reflectApply(arraySort, result, [(left: number, right: number) => left - right]);
  return result;
}

function framePiece(
  pieceId: 'FRONT' | 'BACK',
  receipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2,
  report: PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2,
) {
  let persisted: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2['pieces'][number] | null =
    null;
  let diagnosed:
    | PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2['pieces'][number]
    | null = null;
  for (let index = 0; index < receipt.pieces.length; index += 1) {
    const piece = receipt.pieces[index]!;
    if (piece.pieceId === pieceId) persisted = piece;
  }
  for (let index = 0; index < report.pieces.length; index += 1) {
    const piece = report.pieces[index]!;
    if (piece.pieceId === pieceId) diagnosed = piece;
  }
  if (!persisted || !diagnosed)
    fail('writer-frame-binding-mismatch', `${pieceId} is absent from the persisted frame binding.`);
  const sourcePathIds: number[] = [];
  for (let index = 0; index < persisted.sourcePathIds.length; index += 1)
    sourcePathIds[index] = persisted.sourcePathIds[index]!;
  return objectFreeze({
    pieceId,
    blockName: persisted.blockName,
    sourceApexMm: objectFreeze([persisted.sourceApexMm[0], persisted.sourceApexMm[1]]) as readonly [
      number,
      number,
    ],
    sourceToWrittenAffine: objectFreeze([
      persisted.sourceToWrittenAffine[0],
      persisted.sourceToWrittenAffine[1],
      persisted.sourceToWrittenAffine[2],
      persisted.sourceToWrittenAffine[3],
      persisted.sourceToWrittenAffine[4],
      persisted.sourceToWrittenAffine[5],
    ]) as readonly [number, number, number, number, number, number],
    sourcePathIds: objectFreeze(sourcePathIds) as readonly [number, ...number[]],
    writtenApexMm: objectFreeze([
      diagnosed.writtenApexMm[0],
      diagnosed.writtenApexMm[1],
    ]) as readonly [number, number],
  });
}

export async function buildBetaSkirtCanonicalMediumSavedWriterFramePlacementV2(
  input: unknown,
): Promise<BetaSkirtCanonicalMediumSavedWriterFramePlacementResultV2> {
  let placementOwner: BetaSkirtCanonicalMediumProductPlacementOwnerV1 | null = null;
  try {
    const request = exactRequest(input);
    const authority = digestAuthority();
    await validateDigest(authority);
    const v2 = projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner);
    if (!v2) fail('composer-v2-owner-unavailable', 'A live genuine Composer V2 owner is required.');
    const v3 = projectPatternImportDxfProductGarmentMeshComposerV3(request.composerV3Owner);
    if (!v3) fail('composer-v3-owner-unavailable', 'A live genuine Composer V3 owner is required.');
    const savedV3 = projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(
      request.composerV3Owner,
    );
    if (!savedV3)
      fail(
        'saved-local-frame-composer-unavailable',
        'A live authenticated saved local-frame Composer V3 owner is required.',
      );
    const v2Owner = request.composerV2Owner as PatternImportDxfProductGarmentMeshComposerOwnerV2;
    const v3Owner =
      request.composerV3Owner as PatternImportDxfProductSavedLocalFrameGarmentMeshComposerOwnerV2;
    const v2Snapshot = v2Owner.snapshot;
    const v3Snapshot = v3Owner.snapshot;
    const savedV3Snapshot = savedV3.snapshot;
    if (
      v2.composerCanonicalSha256 !== v2Snapshot.seal.canonicalSha256 ||
      v2.phase2ArtifactSha256 !== v2Snapshot.seals.phase2ArtifactSha256 ||
      v3.composerCanonicalSha256 !== v3Snapshot.seal.canonicalSha256 ||
      v3.composerV2CanonicalSha256 !== v2Snapshot.seal.canonicalSha256 ||
      v3.phase2ArtifactSha256 !== v2Snapshot.seals.phase2ArtifactSha256 ||
      v3.refinedArtifactSha256 !== v3Snapshot.bindings.refinedArtifactSha256 ||
      v3Snapshot.bindings.composerV2CanonicalSha256 !== v2Snapshot.seal.canonicalSha256 ||
      savedV3.composerV3.composerCanonicalSha256 !== v3Snapshot.seal.canonicalSha256 ||
      savedV3Snapshot.bindings.composerV2CanonicalSha256 !== v2Snapshot.seal.canonicalSha256 ||
      savedV3Snapshot.bindings.composerV3CanonicalSha256 !== v3Snapshot.seal.canonicalSha256 ||
      savedV3Snapshot.bindings.phase2ArtifactSha256 !== v2Snapshot.seals.phase2ArtifactSha256 ||
      savedV3Snapshot.bindings.writtenArtifactSha256 !==
        v3Snapshot.bindings.refinedArtifactSha256 ||
      savedV3Snapshot.refinement.counts.vertexCount !== 580 ||
      savedV3Snapshot.refinement.counts.boundaryVertexCount !== 244 ||
      savedV3Snapshot.refinement.counts.interiorVertexCount !== 336 ||
      savedV3Snapshot.refinement.counts.triangleCount !== 912 ||
      savedV3Snapshot.refinement.counts.seamPairCount !== 34
    )
      fail('composer-binding-mismatch', 'Composer V2/V3 owners are not one exact source chain.');
    if (v2Snapshot.origin !== 'verified-saved-row' || v3Snapshot.origin !== 'verified-saved-row')
      fail(
        'saved-origin-required',
        'Saved writer-frame placement requires verified-saved-row origin.',
      );

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
      composed.evidence.importGeneration !== v2Snapshot.row.importGeneration ||
      savedV3Snapshot.bindings.rowDxfSha256 !== v2Snapshot.row.dxfSha256 ||
      savedV3Snapshot.bindings.sourceFileSha256 !== v2Snapshot.seals.sourceFileSha256 ||
      savedV3Snapshot.bindings.aggregateCanonicalSha256 !==
        composed.aggregateSeal.canonicalSha256 ||
      savedV3Snapshot.bindings.sourcePathCoordinateSha256 !==
        composed.aggregate.sourceBinding.sourcePathCoordinateSha256 ||
      savedV3Snapshot.bindings.compositionCanonicalSha256 !==
        composed.compositionSeal.canonicalSha256
    )
      fail(
        'composer-binding-mismatch',
        'Fresh composition does not exact-bind the retained Composer V2 row and aggregate.',
      );

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
        'Writer-frame receipt does not exact-bind the saved row and fresh aggregate.',
      );

    const scopes: typeof request.compositionRequest.draft.scopes = [];
    for (let index = 0; index < request.compositionRequest.draft.scopes.length; index += 1) {
      const scope = request.compositionRequest.draft.scopes[index]!;
      if (scope.target.scopeKey === v2Snapshot.row.scopeKey) scopes[scopes.length] = scope;
    }
    const replay = scopes.length === 1 ? scopes[0]!.writerReplay : null;
    if (!replay)
      fail('writer-replay-binding-mismatch', 'Saved composition has no unique writer replay.');
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
      fail(
        'writer-replay-binding-mismatch',
        'Fresh writer replay bytes do not exact-bind the saved row DXF SHA-256.',
      );
    const carrierResult = readPatternImportDxfProductSavedAnnularFrameReplayCarrierV3(
      replay.job.replay,
    );
    if (!carrierResult.ok)
      fail(
        'writer-frame-carrier-blocked',
        `${carrierResult.blocker.code}: ${carrierResult.blocker.detail}`,
      );

    for (let persistedIndex = 0; persistedIndex < receipt.pieces.length; persistedIndex += 1) {
      const persisted = receipt.pieces[persistedIndex]!;
      let carrier: (typeof carrierResult.carrier.pieces)[number] | null = null;
      for (let pieceIndex = 0; pieceIndex < carrierResult.carrier.pieces.length; pieceIndex += 1) {
        const piece = carrierResult.carrier.pieces[pieceIndex]!;
        if (piece.pieceId === persisted.pieceId) carrier = piece;
      }
      let block: (typeof written.plan.blocks)[number] | null = null;
      for (let blockIndex = 0; blockIndex < written.plan.blocks.length; blockIndex += 1) {
        const candidate = written.plan.blocks[blockIndex]!;
        if (candidate.name === persisted.blockName && candidate.identity === persisted.pieceId)
          block = candidate;
      }
      if (
        !carrier ||
        !block ||
        carrier.blockName !== persisted.blockName ||
        !sameNumbers(carrier.sourceApexMm, persisted.sourceApexMm) ||
        !sameNumbers(carrier.sourceToWrittenAffine, persisted.sourceToWrittenAffine)
      )
        fail(
          'writer-frame-binding-mismatch',
          `${persisted.pieceId} receipt differs from its durable writer-frame carrier.`,
        );
      const aggregatePathIds: number[] = [];
      for (let seamIndex = 0; seamIndex < composed.aggregate.seams.length; seamIndex += 1) {
        const seam = composed.aggregate.seams[seamIndex]!;
        for (let sideIndex = 0; sideIndex < seam.sides.length; sideIndex += 1) {
          const side = seam.sides[sideIndex]!;
          if (side.pieceId !== persisted.pieceId) continue;
          let present = false;
          for (let pathIndex = 0; pathIndex < aggregatePathIds.length; pathIndex += 1)
            if (aggregatePathIds[pathIndex] === side.sourcePathId) present = true;
          if (!present) aggregatePathIds[aggregatePathIds.length] = side.sourcePathId;
        }
      }
      if (!sameNumbers(sortedNumbers(aggregatePathIds), sortedNumbers(persisted.sourcePathIds)))
        fail(
          'aggregate-source-path-binding-mismatch',
          `${persisted.pieceId} receipt PathIds differ from the fresh sealed aggregate.`,
        );
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
          'Local annular geometry is incompatible.',
      );

    const front = framePiece('FRONT', receipt, local.report);
    const back = framePiece('BACK', receipt, local.report);
    const authored: BetaSkirtCanonicalMediumProductAuthoredFrameV1 = objectFreeze({
      ...BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1,
      pieces: objectFreeze([
        objectFreeze({
          ...BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1.pieces[0],
          planarApexMm: front.writtenApexMm,
        }),
        objectFreeze({
          ...BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1.pieces[1],
          planarApexMm: back.writtenApexMm,
        }),
      ]) as BetaSkirtCanonicalMediumProductAuthoredFrameV1['pieces'],
    });
    const placement =
      await buildBetaSkirtCanonicalMediumProductPlacementWithAuthoredFrameInternalV1(
        {
          schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_PLACEMENT_REQUEST_V1,
          composerV2Owner: v2Owner,
          composerV3Owner: v3Owner,
          ...(request.canonicalDisplayedBodyOwner !== null
            ? { canonicalDisplayedBodyOwner: request.canonicalDisplayedBodyOwner }
            : { mannequin: request.mannequin }),
        },
        authored,
        SAVED_WRITER_FRAME_REFINED_MESH_EXPECTATION_V2,
      );
    if (!placement.ok)
      fail('placement-blocked', `${placement.blockers[0].code}: ${placement.blockers[0].detail}`);
    placementOwner = placement.owner;
    if (
      request.canonicalDisplayedBodyOwner !== null &&
      !isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2(request.canonicalDisplayedBodyOwner)
    )
      fail('placement-blocked', 'Canonical displayed body changed during saved placement.');
    const placementProjection = projectBetaSkirtCanonicalMediumProductPlacementV1(placement.owner);
    const savedV3AfterPlacement =
      projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(v3Owner);
    if (
      !placementProjection ||
      !savedV3AfterPlacement ||
      savedV3AfterPlacement.snapshot.seal.canonicalSha256 !==
        savedV3Snapshot.seal.canonicalSha256 ||
      placement.snapshot.bindings.composerV2CanonicalSha256 !== v2Snapshot.seal.canonicalSha256 ||
      placement.snapshot.bindings.composerV3CanonicalSha256 !== v3Snapshot.seal.canonicalSha256 ||
      placement.snapshot.bindings.phase2ArtifactSha256 !== v2Snapshot.seals.phase2ArtifactSha256 ||
      placement.snapshot.bindings.refinedArtifactSha256 !==
        v3Snapshot.bindings.refinedArtifactSha256
    )
      fail(
        'placement-owner-invalid',
        'Private placement owner lost its exact Composer source binding.',
      );

    const replayCarrierCanonicalSha256 = await sha256Plain(
      'beta-skirt-saved-writer-frame-replay-carrier-v2',
      carrierResult.carrier,
      authority,
    );
    const writerFrameReceiptCanonicalSha256 = await sha256Plain(
      'beta-skirt-saved-writer-frame-receipt-v2',
      receipt,
      authority,
    );
    const localFramePreflightCanonicalSha256 = await sha256Plain(
      'beta-skirt-saved-local-frame-preflight-v2',
      local.report,
      authority,
    );
    const savedComposerReplayCarrierCanonicalSha256 = await sha256UnframedPlain(
      'saved-local-frame-replay-carrier-v2',
      carrierResult.carrier,
      authority,
    );
    const savedComposerWriterFrameReceiptCanonicalSha256 = await sha256UnframedPlain(
      'saved-local-frame-writer-receipt-v2',
      receipt,
      authority,
    );
    const savedComposerLocalFramePreflightCanonicalSha256 = await sha256UnframedPlain(
      'saved-local-frame-preflight-v2',
      local.report,
      authority,
    );
    if (
      savedV3Snapshot.bindings.replayCarrierCanonicalSha256 !==
        savedComposerReplayCarrierCanonicalSha256 ||
      savedV3Snapshot.bindings.writerFrameReceiptCanonicalSha256 !==
        savedComposerWriterFrameReceiptCanonicalSha256 ||
      savedV3Snapshot.bindings.localFramePreflightCanonicalSha256 !==
        savedComposerLocalFramePreflightCanonicalSha256
    )
      fail(
        'composer-binding-mismatch',
        'Saved local-frame Composer evidence differs from placement replay/frame evidence.',
      );
    const sourceFrame = objectFreeze({
      provenance: 'saved-replay-answer-byte-bound' as const,
      pieces: objectFreeze([
        front,
        back,
      ]) as BetaSkirtCanonicalMediumSavedWriterFramePlacementSnapshotV2['sourceFrame']['pieces'],
    });
    const sourceFrameOverrideCanonicalSha256 = await sha256Plain(
      'beta-skirt-saved-source-frame-override-v2',
      {
        rowDxfSha256: v2Snapshot.row.dxfSha256,
        aggregateCanonicalSha256: composed.aggregateSeal.canonicalSha256,
        sourcePathCoordinateSha256: composed.aggregate.sourceBinding.sourcePathCoordinateSha256,
        replayCarrierCanonicalSha256,
        writerFrameReceiptCanonicalSha256,
        localFramePreflightCanonicalSha256,
        sourceFrame,
      },
      authority,
    );
    const bindings = objectFreeze({
      rowDxfSha256: v2Snapshot.row.dxfSha256,
      sourceFileSha256: v2Snapshot.seals.sourceFileSha256,
      aggregateCanonicalSha256: composed.aggregateSeal.canonicalSha256,
      sourcePathCoordinateSha256: composed.aggregate.sourceBinding.sourcePathCoordinateSha256,
      compositionCanonicalSha256: composed.compositionSeal.canonicalSha256,
      composerV2CanonicalSha256: v2Snapshot.seal.canonicalSha256,
      composerV3CanonicalSha256: v3Snapshot.seal.canonicalSha256,
      savedLocalFrameComposerCanonicalSha256: savedV3Snapshot.seal.canonicalSha256,
      phase2ArtifactSha256: v2Snapshot.seals.phase2ArtifactSha256,
      refinedArtifactSha256: v3Snapshot.bindings.refinedArtifactSha256,
      localArtifactSha256: savedV3Snapshot.bindings.localArtifactSha256,
      writtenArtifactSha256: savedV3Snapshot.bindings.writtenArtifactSha256,
      writtenFrameDiagnosticArtifactSha256:
        savedV3Snapshot.bindings.writtenFrameDiagnosticArtifactSha256,
      phaseEvidenceSha256: savedV3Snapshot.bindings.phaseEvidenceSha256,
      localSourceIdsSha256: savedV3Snapshot.bindings.localSourceIdsSha256,
      translationSha256: savedV3Snapshot.bindings.translationSha256,
      replayCarrierCanonicalSha256,
      writerFrameReceiptCanonicalSha256,
      localFramePreflightCanonicalSha256,
      sourceFrameOverrideCanonicalSha256,
      placementCanonicalSha256: placement.snapshot.seal.canonicalSha256,
    });
    const bindingKeys = reflectOwnKeys(bindings);
    for (let index = 0; index < bindingKeys.length; index += 1) {
      const key = bindingKeys[index]!;
      const descriptor = objectGetOwnPropertyDescriptor(bindings, key);
      if (
        typeof key !== 'string' ||
        !descriptor ||
        !('value' in descriptor) ||
        typeof descriptor.value !== 'string' ||
        !isSha256(descriptor.value)
      )
        fail('sha256-unavailable', 'Saved writer-frame binding produced an invalid SHA-256 value.');
    }
    const payload = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_V2,
      status: 'saved-writer-frame-actual-body-diagnostic' as const,
      bindings,
      sourceFrame,
      placement: placement.snapshot,
      claims: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_CLAIMS_V2,
      blockers: BLOCKERS,
    });
    const canonicalSha256 = await sha256Plain(
      'beta-skirt-canonical-medium-saved-writer-frame-placement-v2',
      payload,
      authority,
    );
    const savedV3AfterSeal =
      projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(v3Owner);
    if (
      request.canonicalDisplayedBodyOwner !== null &&
      !isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2(request.canonicalDisplayedBodyOwner)
    )
      fail('placement-blocked', 'Canonical displayed body changed during saved placement sealing.');
    if (
      !savedV3AfterSeal ||
      savedV3AfterSeal.snapshot.seal.canonicalSha256 !== savedV3Snapshot.seal.canonicalSha256
    )
      fail(
        'saved-local-frame-composer-unavailable',
        'Saved local-frame Composer owner became stale during placement sealing.',
      );
    const snapshot = objectFreeze({
      ...payload,
      seal: objectFreeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-saved-frame-diagnostic-consistency-only' as const,
      }),
    }) satisfies BetaSkirtCanonicalMediumSavedWriterFramePlacementSnapshotV2;
    const owner = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_OWNER_V2,
      snapshot,
    }) as BetaSkirtCanonicalMediumSavedWriterFramePlacementOwnerV2;
    if (!weakMapSet) fail('invalid-input', 'Native WeakMap#set is unavailable.');
    reflectApply(weakMapSet, owners, [
      owner,
      {
        placementOwner: placement.owner,
        localFramePreflight: local.report,
        disposed: false,
      },
    ]);
    placementOwner = null;
    return objectFreeze({
      ok: true as const,
      owner,
      snapshot,
      claims: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_CLAIMS_V2,
      blockers: BLOCKERS,
    });
  } catch (error) {
    if (placementOwner) disposeBetaSkirtCanonicalMediumProductPlacementV1(placementOwner);
    return blocked(error);
  }
}

export function projectBetaSkirtCanonicalMediumSavedWriterFramePlacementV2(
  owner: unknown,
): BetaSkirtCanonicalMediumSavedWriterFramePlacementProjectionV2 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  if (!weakMapGet) return null;
  const record = reflectApply(weakMapGet, owners, [owner]) as OwnerRecord | undefined;
  if (!record || record.disposed) return null;
  const placement = projectBetaSkirtCanonicalMediumProductPlacementV1(record.placementOwner);
  if (!placement) return null;
  const publicOwner = owner as BetaSkirtCanonicalMediumSavedWriterFramePlacementOwnerV2;
  if (
    placement.snapshot.seal.canonicalSha256 !==
    publicOwner.snapshot.bindings.placementCanonicalSha256
  )
    return null;
  return objectFreeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_PROJECTION_V2,
    snapshot: publicOwner.snapshot,
    placement,
    localFramePreflight: record.localFramePreflight,
    callerOwnedMutableBinaryCopies: true as const,
    bodyFrameAuthority: false as const,
    placementAuthority: false as const,
    collisionAuthority: false as const,
    initializationAuthority: false as const,
    fitAuthority: false as const,
    runtimeAuthority: false as const,
    persistenceAuthority: false as const,
    productionAuthority: false as const,
  });
}

function retainedLegacyPlacementOwner(
  savedPlacementOwner: unknown,
): BetaSkirtCanonicalMediumProductPlacementOwnerV1 {
  if (
    !savedPlacementOwner ||
    (typeof savedPlacementOwner !== 'object' && typeof savedPlacementOwner !== 'function')
  )
    throw new TypeError('A live saved writer-frame placement V2 owner is required.');
  if (!weakMapGet)
    throw new TypeError('Native WeakMap#get is unavailable for saved placement handoff.');
  const record = reflectApply(weakMapGet, owners, [savedPlacementOwner]) as OwnerRecord | undefined;
  if (!record || record.disposed)
    throw new TypeError('The saved writer-frame placement V2 owner is unavailable or disposed.');
  const publicOwner =
    savedPlacementOwner as BetaSkirtCanonicalMediumSavedWriterFramePlacementOwnerV2;
  const projection = projectBetaSkirtCanonicalMediumProductPlacementV1(record.placementOwner);
  if (
    !projection ||
    projection.snapshot.seal.canonicalSha256 !==
      publicOwner.snapshot.bindings.placementCanonicalSha256 ||
    projection.snapshot.bindings.authoredFrameSha256 !==
      publicOwner.snapshot.placement.bindings.authoredFrameSha256
  )
    throw new TypeError('The retained legacy placement owner lost its exact V2 binding.');
  return record.placementOwner;
}

/**
 * Narrow non-borrowing handoff. The retained V1 owner is inserted only into the existing exact
 * seam/pin builder and is never returned to the caller.
 */
export async function buildBetaSkirtCanonicalMediumSavedWriterFrameSeamPinHandoffV2(
  savedPlacementOwner: unknown,
  input: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtCanonicalMediumProductSeamPinResultV2> {
  if (signal?.aborted)
    throw new DOMException('Saved seam/pin handoff was cancelled.', 'AbortError');
  const placementOwner = retainedLegacyPlacementOwner(savedPlacementOwner);
  const request = exactHandoffRecord(
    input,
    ['composerV2Owner', 'composerV3Owner', 'expected', 'schemaVersion', 'selfOrientationOwner'],
    'Saved seam/pin handoff request',
  );
  const result = await buildBetaSkirtCanonicalMediumProductSeamPinV2({
    schemaVersion: request.schemaVersion,
    expected: request.expected,
    composerV2Owner: request.composerV2Owner,
    composerV3Owner: request.composerV3Owner,
    selfOrientationOwner: request.selfOrientationOwner,
    placementOwner,
  });
  if (signal?.aborted) {
    if (result.ok) disposeBetaSkirtCanonicalMediumProductSeamPinV2(result.owner);
    throw new DOMException('Saved seam/pin handoff was cancelled.', 'AbortError');
  }
  try {
    retainedLegacyPlacementOwner(savedPlacementOwner);
  } catch (error) {
    if (result.ok) disposeBetaSkirtCanonicalMediumProductSeamPinV2(result.owner);
    throw error;
  }
  return result;
}

/**
 * Narrow non-borrowing handoff. The retained V1 owner is inserted only into the existing exact
 * source-admission builder and is never returned to the caller.
 */
export async function buildBetaSkirtCanonicalMediumSavedWriterFrameSourceAdmissionHandoffV2(
  savedPlacementOwner: unknown,
  input: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtCanonicalMediumSourceAdmissionResultV1> {
  if (signal?.aborted)
    throw new DOMException('Saved source-admission handoff was cancelled.', 'AbortError');
  const placementOwner = retainedLegacyPlacementOwner(savedPlacementOwner);
  const request = exactHandoffRecord(
    input,
    ['expected', 'schemaVersion', 'seamPinOwner', 'selfOrientationOwner'],
    'Saved source-admission handoff request',
  );
  const result = await buildBetaSkirtCanonicalMediumSourceAdmissionV1({
    schemaVersion: request.schemaVersion,
    expected: request.expected,
    selfOrientationOwner: request.selfOrientationOwner,
    seamPinOwner: request.seamPinOwner,
    placementOwner,
  });
  if (signal?.aborted) {
    if (result.ok) disposeBetaSkirtCanonicalMediumSourceAdmissionV1(result.owner);
    throw new DOMException('Saved source-admission handoff was cancelled.', 'AbortError');
  }
  try {
    retainedLegacyPlacementOwner(savedPlacementOwner);
  } catch (error) {
    if (result.ok) disposeBetaSkirtCanonicalMediumSourceAdmissionV1(result.owner);
    throw error;
  }
  return result;
}

export function disposeBetaSkirtCanonicalMediumSavedWriterFramePlacementV2(
  owner: unknown,
): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  if (!weakMapGet || !weakMapDelete) return false;
  const record = reflectApply(weakMapGet, owners, [owner]) as OwnerRecord | undefined;
  if (!record || record.disposed) return false;
  record.disposed = true;
  for (const cancel of record.personalizedHandoffs ?? []) cancel();
  record.personalizedHandoffs?.clear();
  disposeBetaSkirtCanonicalMediumProductPlacementV1(record.placementOwner);
  reflectApply(weakMapDelete, owners, [owner]);
  return true;
}

/**
 * A diagnostic handoff from an already live saved placement. It never creates a hidden canonical
 * body. The genuine retained source supplies both the garment owner and composition generation;
 * the caller supplies only its independently bound observed-body owner. Parent disposal cancels
 * pending work and revokes returned pair owners, without disposing the borrowed displayed body.
 */
export async function buildBetaSkirtCanonicalMediumSavedWriterFrameDisplayedBodyHandoffV2(
  savedPlacementOwner: unknown,
  input: unknown,
  signal?: AbortSignal,
): Promise<
  import('./beta-skirt-personalized-displayed-body-product-placement-v2').BetaSkirtPersonalizedDisplayedBodyProductPlacementResultV2
> {
  const placementOwner = retainedLegacyPlacementOwner(savedPlacementOwner);
  const request = exactHandoffRecord(
    input,
    ['schemaVersion', 'displayedBodyOwner', 'displayedBodyBinding'],
    'Saved displayed-body handoff request',
  );
  const record = reflectApply(weakMapGet!, owners, [savedPlacementOwner]) as OwnerRecord;
  const controller = new AbortController();
  let disposeChild: (() => void) | null = null;
  let removeChildListener: (() => void) | null = null;
  const cancel = () => {
    controller.abort();
    disposeChild?.();
  };
  const unlink = () => {
    record.personalizedHandoffs?.delete(cancel);
    if (signal) EventTarget.prototype.removeEventListener.call(signal, 'abort', cancel);
    removeChildListener?.();
    removeChildListener = null;
  };
  const requireCurrent = () => {
    if (controller.signal.aborted)
      throw new DOMException('Saved displayed-body handoff was cancelled.', 'AbortError');
    if (retainedLegacyPlacementOwner(savedPlacementOwner) !== placementOwner)
      throw new TypeError('The saved placement source changed during observed-body handoff.');
  };
  try {
    if (signal) {
      const aborted = objectGetOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
      if (reflectApply(aborted, signal, [])) cancel();
      else EventTarget.prototype.addEventListener.call(signal, 'abort', cancel, { once: true });
    }
    record.personalizedHandoffs ??= new Set();
    record.personalizedHandoffs.add(cancel);
    requireCurrent();
    const pair = await import('./beta-skirt-personalized-displayed-body-product-placement-v2');
    requireCurrent();
    const source = projectBetaSkirtCanonicalMediumProductPlacementV1(placementOwner);
    if (!source) throw new TypeError('The retained canonical garment projection is unavailable.');
    const result = await pair.buildBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(
      {
        schemaVersion: request.schemaVersion,
        displayedBodyOwner: request.displayedBodyOwner,
        displayedBodyBinding: request.displayedBodyBinding,
        canonicalPlacementOwner: placementOwner,
        compositionGeneration: source.collisionInput.binding.compositionGeneration,
      },
      controller.signal,
    );
    if (result.ok)
      disposeChild = () => {
        pair.disposeBetaSkirtPersonalizedDisplayedBodyProductPlacementV2(result.owner);
      };
    requireCurrent();
    if (!result.ok) {
      unlink();
      return result;
    }
    const lifetime = pair.getBetaSkirtPersonalizedDisplayedBodyProductPlacementLifetimeV2(
      result.owner,
    );
    if (!lifetime || lifetime.aborted)
      throw new TypeError('The observed-body pair was revoked before its saved handoff.');
    EventTarget.prototype.addEventListener.call(lifetime, 'abort', unlink, { once: true });
    removeChildListener = () =>
      EventTarget.prototype.removeEventListener.call(lifetime, 'abort', unlink);
    requireCurrent();
    return result;
  } catch (error) {
    cancel();
    unlink();
    throw error;
  }
}
