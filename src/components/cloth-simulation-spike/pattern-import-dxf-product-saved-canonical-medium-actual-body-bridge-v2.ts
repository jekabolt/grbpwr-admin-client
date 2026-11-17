import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_REQUEST_V2,
  buildDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2,
  disposeDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2,
  projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2,
  type DxfProductTwoPanelSkirtCanonicalMediumMappingSpecV2,
  type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2,
} from 'lib/cloth/domain/dxf-product-two-panel-skirt-canonical-medium-self-orientation-v2';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_REQUEST_V1,
  buildDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1,
  disposeDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1,
  type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1,
} from 'lib/cloth/domain/dxf-product-two-panel-skirt-canonical-medium-normalized-v5-solver-bridge-v1';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
  buildDxfProductTwoPanelSkirtPlacementSemanticsV1,
  disposeDxfProductTwoPanelSkirtPlacementSemanticsV1,
  projectDxfProductTwoPanelSkirtPlacementSemanticsV1,
  type DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1,
} from 'lib/cloth/domain/dxf-product-two-panel-skirt-placement-semantics-v1';
import type { PatternImportDxfProductMultiseamMappingCompositionRequestV2 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-mapping-composition-v2';
import type { PatternImportDxfProductGarmentMeshComposerOwnerV2 } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import type { PatternImportDxfProductGarmentMeshComposerOwnerV3 } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v3';
import type { PatternImportDxfProductSavedAnnularWriterFrameReceiptV2 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-local-frame-preflight-v2';

import {
  BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1,
  type BetaSkirtCanonicalMediumProductPlacementProjectionV1,
} from './beta-skirt-canonical-medium-product-placement-v1';
import {
  BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_REQUEST_V2,
  disposeBetaSkirtCanonicalMediumProductSeamPinV2,
  projectBetaSkirtCanonicalMediumProductSeamPinV2,
  type BetaSkirtCanonicalMediumProductSeamPinOwnerV2,
  type BetaSkirtCanonicalMediumProductSeamPinRequestV2,
} from './beta-skirt-canonical-medium-product-seam-pin-v2';
import {
  BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_REQUEST_V2,
  buildBetaSkirtCanonicalMediumSavedWriterFramePlacementV2,
  buildBetaSkirtCanonicalMediumSavedWriterFrameSeamPinHandoffV2,
  buildBetaSkirtCanonicalMediumSavedWriterFrameSourceAdmissionHandoffV2,
  disposeBetaSkirtCanonicalMediumSavedWriterFramePlacementV2,
  projectBetaSkirtCanonicalMediumSavedWriterFramePlacementV2,
  type BetaSkirtCanonicalMediumSavedWriterFramePlacementOwnerV2,
  type BetaSkirtCanonicalMediumSavedWriterFramePlacementProjectionV2,
} from './beta-skirt-canonical-medium-saved-writer-frame-placement-v2';
import {
  BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_REQUEST_V1,
  disposeBetaSkirtCanonicalMediumSourceAdmissionV1,
  projectBetaSkirtCanonicalMediumSourceAdmissionV1,
  type BetaSkirtCanonicalMediumSourceAdmissionOwnerV1,
  type BetaSkirtCanonicalMediumSourceAdmissionProjectionV1,
  type BetaSkirtCanonicalMediumSourceAdmissionRequestV1,
} from './beta-skirt-canonical-medium-source-admission-v1';
import type { BetaSkirtG3b2PreviewMannequinResultV1 } from './beta-skirt-g3b2-preview-mannequin-contract-v1';
import type { BetaSkirtCanonicalMediumPlacementBodyInputV2 } from './beta-skirt-canonical-medium-displayed-body-admission-v2';
import type { PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1 } from './pattern-import-dxf-product-saved-canonical-medium-authored-input-contract-v1';
import {
  BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_REQUEST_V1,
  buildBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  disposeBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceResultV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_REQUEST_V2 =
  'pattern-import-dxf-product-saved-canonical-medium-actual-body-bridge-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_V2 =
  'pattern-import-dxf-product-saved-canonical-medium-actual-body-bridge/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_OWNER_V2 =
  'pattern-import-dxf-product-saved-canonical-medium-actual-body-bridge-owner/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_PROJECTION_V2 =
  'pattern-import-dxf-product-saved-canonical-medium-actual-body-bridge-projection/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_HANDOFF_REQUEST_V2 =
  'pattern-import-dxf-product-saved-canonical-medium-actual-body-runtime-source-handoff-request/2' as const;

const SHA256 = /^[0-9a-f]{64}$/u;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const MAX_DEPTH = 32;
const MAX_NODES = 50_000;
const MAX_PROPERTIES = 250_000;
const MAX_ARRAY_LENGTH = 10_000;
const MAX_STRING_LENGTH = 4_096;
const encoder = new TextEncoder();
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectKeys = Object.keys;
const objectFreeze = Object.freeze;
const objectFromEntries = Object.fromEntries;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectIs = Object.is;
const arrayIsArray = Array.isArray;
const arrayBufferIsView = ArrayBuffer.isView;
const CapturedArrayBuffer = ArrayBuffer;
const CapturedSet = Set;
const CapturedUint8Array = Uint8Array;
const CapturedWeakMap = WeakMap;
const weakMapGetIntrinsic = WeakMap.prototype.get;
const weakMapSetIntrinsic = WeakMap.prototype.set;
const weakMapDeleteIntrinsic = WeakMap.prototype.delete;
const arrayPrototype = Array.prototype;
const objectPrototype = Object.prototype;
const arrayFilterIntrinsic = objectGetOwnPropertyDescriptor(arrayPrototype, 'filter')?.value;
const arrayJoinIntrinsic = objectGetOwnPropertyDescriptor(arrayPrototype, 'join')?.value;
const arrayMapIntrinsic = objectGetOwnPropertyDescriptor(arrayPrototype, 'map')?.value;
const arraySomeIntrinsic = objectGetOwnPropertyDescriptor(arrayPrototype, 'some')?.value;
const arraySortIntrinsic = objectGetOwnPropertyDescriptor(arrayPrototype, 'sort')?.value;
const regExpTestIntrinsic = objectGetOwnPropertyDescriptor(RegExp.prototype, 'test')?.value;
const stringSliceIntrinsic = objectGetOwnPropertyDescriptor(String.prototype, 'slice')?.value;
const numberToStringIntrinsic = objectGetOwnPropertyDescriptor(Number.prototype, 'toString')?.value;
const stringPadStartIntrinsic = objectGetOwnPropertyDescriptor(String.prototype, 'padStart')?.value;
const textEncoderEncodeIntrinsic = objectGetOwnPropertyDescriptor(
  TextEncoder.prototype,
  'encode',
)?.value;
const jsonStringify = JSON.stringify;
const subtleDigest =
  typeof SubtleCrypto === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(SubtleCrypto.prototype, 'digest')?.value;

function arrayFilter<T>(
  values: readonly T[],
  predicate: (value: T, index: number) => unknown,
): T[] {
  return reflectApply(arrayFilterIntrinsic, values, [predicate]) as T[];
}

function arrayMap<T, U>(values: readonly T[], mapper: (value: T, index: number) => U): U[] {
  return reflectApply(arrayMapIntrinsic, values, [mapper]) as U[];
}

function arraySome<T>(
  values: readonly T[],
  predicate: (value: T, index: number) => unknown,
): boolean {
  return reflectApply(arraySomeIntrinsic, values, [predicate]) as boolean;
}

function sortedStrings(values: readonly string[]): string[] {
  return reflectApply(arraySortIntrinsic, [...values], []) as string[];
}

function arrayJoin(values: readonly unknown[], separator: string): string {
  return reflectApply(arrayJoinIntrinsic, values, [separator]) as string;
}

function safeSlice(value: string, end: number): string {
  return reflectApply(stringSliceIntrinsic, value, [0, end]) as string;
}

function isSha256(value: unknown): value is string {
  return (
    typeof value === 'string' && (reflectApply(regExpTestIntrinsic, SHA256, [value]) as boolean)
  );
}

function encodeText(value: string): Uint8Array {
  return reflectApply(textEncoderEncodeIntrinsic, encoder, [value]) as Uint8Array;
}

type ReadyMannequin = Extract<BetaSkirtG3b2PreviewMannequinResultV1, { status: 'ready' }>;

export type PatternImportDxfProductSavedActualBodyInputV2 =
  | Readonly<{ mannequin: ReadyMannequin; canonicalDisplayedBodyOwner?: never }>
  | BetaSkirtCanonicalMediumPlacementBodyInputV2;

export type PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_REQUEST_V2;
  expected: Readonly<{
    composerV2CanonicalSha256: string;
    composerV3CanonicalSha256: string;
    phase2ArtifactSha256: string;
    refinedArtifactSha256: string;
  }>;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  composerV3Owner: PatternImportDxfProductGarmentMeshComposerOwnerV3;
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
  authored: PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1;
}> &
  PatternImportDxfProductSavedActualBodyInputV2;

export type PatternImportDxfProductSavedCanonicalMediumActualBodyRuntimeSourceHandoffRequestV2 =
  Readonly<{
    schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_HANDOFF_REQUEST_V2;
    expected: Readonly<{
      actualBodyBridgeCanonicalSha256: string;
      composerV3CanonicalSha256: string;
      phase2ArtifactSha256: string;
      refinedArtifactSha256: string;
    }>;
    composerV3Owner: PatternImportDxfProductGarmentMeshComposerOwnerV3;
  }>;

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_CLAIMS_V2 =
  objectFreeze({
    genuineSavedRowWriterReplayAggregateAndAoBound: true,
    persistedWrittenPieceApexConsumed: true,
    localFramePreflightIntegrated: true,
    exactSavedPlacementV2OwnerPrivatelyRetained: true,
    savedGeometryReplayAndSourcePathAuthenticityEstablished: true,
    exactSavedTopologyParity580V912TEstablished: true,
    explicitAuthoredGarmentSemanticsBound: true,
    explicitDisplayBodyIdentityBound: true,
    genuineComposerV2AndV3Bound: true,
    renderedActualBodyContactDiagnosticEvaluated: true,
    sectionCompatibilityEvaluated: true,
    selfOrientationQualified: true,
    seamPinQualified: true,
    sourceAdmissionQualified: true,
    retainedRollbackCandidateAvailable: true,
    analyticalCapsuleBodyAdmissionUsedAsActualBody: false,
    productionAuthoredGarmentSemanticAuthorityEstablished: false,
    placementAuthority: false,
    collisionAuthority: false,
    initializationAuthority: false,
    runtimeAuthority: false,
    fitAuthority: false,
    productionAuthority: false,
  } as const);

const BLOCKERS = objectFreeze([
  'authored-garment-semantic-sidecar-not-production-established',
  'concurrent-independent-d0-semantics-build-not-supported',
  'front-back-gravity-frame-production-qualification-not-run',
  'solver-material-frame-transform-not-qualified',
  'retention-and-support-runtime-gate-not-run',
  'gravity-settle-not-evaluated',
  'fit-not-qualified',
  'runtime-source-handoff-not-executed',
  'actual-body-and-runtime-receipt-persistence-not-integrated',
  'production-qualification-not-run',
] as const);

export type PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeSnapshotV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_V2;
  status: 'saved-writer-frame-actual-body-source-admission-diagnostic';
  bindings: Readonly<{
    rowDxfSha256: string;
    aggregateCanonicalSha256: string;
    sourcePathCoordinateSha256: string;
    writerFrameReceiptCanonicalSha256: string;
    localFramePreflightCanonicalSha256: string;
    sourceFrameOverrideCanonicalSha256: string;
    savedPlacementCanonicalSha256: string;
    innerPlacementCanonicalSha256: string;
    composerV2CanonicalSha256: string;
    composerV3CanonicalSha256: string;
    phase2ArtifactSha256: string;
    refinedArtifactSha256: string;
    semanticsCanonicalSha256: string;
    selfOrientationCanonicalSha256: string;
    seamPinCanonicalSha256: string;
    sourceAdmissionCanonicalSha256: string;
    collisionInputSha256: string;
    authoredFrameSha256: string;
    bodyPositionsSha256: string;
    bodyTopologySha256: string;
  }>;
  counts: Readonly<{
    bodyVertexCount: 13_380;
    bodyTriangleCount: 26_756;
    garmentVertexCount: 580;
    garmentTriangleCount: 912;
    seamPairCount: 34;
    pinnedVertexCount: 82;
    selfRawIntersectionCount: 182;
    selfResidualIntersectionCount: 0;
  }>;
  contact: Readonly<{
    status: 'signed-clearance-measured';
    bodyGarmentTriangleIntersectionCount: 0;
    penetratingVertexCount: 0;
    unsafeVertexCount: 0;
    ambiguousSignVertexCount: 0;
    minimumSignedClearanceM: number;
  }>;
  sourceAdmissionDecision: string;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_CLAIMS_V2;
  blockers: typeof BLOCKERS;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-saved-writer-frame-session-diagnostic-only';
  }>;
}>;

declare const ownerBrand: unique symbol;
export type PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_OWNER_V2;
  snapshot: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeSnapshotV2;
  readonly [ownerBrand]: never;
}>;

export type PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeProjectionV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_PROJECTION_V2;
  snapshot: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeSnapshotV2;
  placement: BetaSkirtCanonicalMediumSavedWriterFramePlacementProjectionV2;
  sourceAdmission: BetaSkirtCanonicalMediumSourceAdmissionProjectionV1;
  callerOwnedMutableBinaryCopies: true;
  placementAuthority: false;
  collisionAuthority: false;
  initializationAuthority: false;
  runtimeAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeBlockerCodeV2 =
  | 'invalid-input'
  | 'authority-binding-mismatch'
  | 'authored-semantics-blocked'
  | 'authored-frame-mismatch'
  | 'display-body-binding-mismatch'
  | 'saved-placement-blocked'
  | 'saved-topology-parity-blocked'
  | 'self-orientation-blocked'
  | 'seam-pin-blocked'
  | 'source-admission-blocked'
  | 'projection-unavailable'
  | 'diagnostic-gate-mismatch'
  | 'session-cancelled'
  | 'sha256-unavailable';

export type PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeResultV2 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2;
      snapshot: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeSnapshotV2;
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_CLAIMS_V2;
      blockers: typeof BLOCKERS;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      snapshot: null;
      claims: Readonly<
        Record<
          keyof typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_CLAIMS_V2,
          false
        >
      >;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeBlockerCodeV2;
          detail: string;
        }>,
      ];
    }>;

type OwnerRecord = {
  semanticsOwner: DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1;
  placementOwner: BetaSkirtCanonicalMediumSavedWriterFramePlacementOwnerV2;
  selfOrientationOwner: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2;
  seamPinOwner: BetaSkirtCanonicalMediumProductSeamPinOwnerV2;
  sourceAdmissionOwner: BetaSkirtCanonicalMediumSourceAdmissionOwnerV1;
  runtimeSourceIssuance: 'available' | 'issuing' | 'issued';
  disposed: boolean;
};

const owners = new CapturedWeakMap<object, OwnerRecord>();

function ownerRecord(owner: object): OwnerRecord | undefined {
  return reflectApply(weakMapGetIntrinsic, owners, [owner]) as OwnerRecord | undefined;
}

function retainOwnerRecord(owner: object, record: OwnerRecord): void {
  reflectApply(weakMapSetIntrinsic, owners, [owner, record]);
}

function forgetOwnerRecord(owner: object): boolean {
  return reflectApply(weakMapDeleteIntrinsic, owners, [owner]) as boolean;
}

class BridgeFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeBlockerCodeV2,
    detail: string,
  ) {
    super(safeSlice(detail, 2_048));
  }
}

function fail(
  code: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeBlockerCodeV2,
  detail: string,
): never {
  throw new BridgeFailure(code, detail);
}

const FALSE_CLAIMS = objectFreeze(
  objectFromEntries(
    arrayMap(
      objectKeys(PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_CLAIMS_V2),
      (key) => [key, false],
    ),
  ),
) as Readonly<
  Record<
    keyof typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_CLAIMS_V2,
    false
  >
>;

function blocked(
  error: unknown,
): PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeResultV2 {
  const failure =
    error instanceof BridgeFailure
      ? error
      : new BridgeFailure(
          'invalid-input',
          error instanceof Error ? error.message : 'Saved actual-body bridge failed closed.',
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

type SnapshotState = { nodes: number; properties: number; active: Set<object> };

function snapshotPlain(value: unknown, path: string, depth: number, state: SnapshotState): unknown {
  if (value === null || typeof value === 'boolean') return value;
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
    fail('invalid-input', `${path} must be plain data.`);
  if (depth > MAX_DEPTH) fail('invalid-input', `${path} exceeds depth bounds.`);
  if (state.active.has(value)) fail('invalid-input', `${path} contains a cycle.`);
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
  if (arraySome(keys, (key) => typeof key !== 'string'))
    fail('invalid-input', `${path} contains symbol fields.`);
  const dataKeys = arrayFilter(keys as string[], (key) => !(isArray && key === 'length'));
  state.nodes += 1;
  state.properties += dataKeys.length;
  if (state.nodes > MAX_NODES || state.properties > MAX_PROPERTIES)
    fail('invalid-input', `${path} exceeds graph bounds.`);
  state.active.add(value);
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
        fail('invalid-input', `${path} has no exact bounded array length.`);
      if (
        dataKeys.length !== length.value ||
        arraySome(dataKeys, (key, index) => key !== String(index))
      )
        fail('invalid-input', `${path} must be a dense array without extras.`);
      return arrayMap(dataKeys, (key) => {
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
          fail('invalid-input', `${path}[${key}] must be enumerable data.`);
        return snapshotPlain(descriptor.value, `${path}[${key}]`, depth + 1, state);
      });
    }
    const output: Record<string, unknown> = {};
    for (const key of dataKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
        fail('invalid-input', `${path}.${key} must be enumerable data.`);
      output[key] = snapshotPlain(descriptor.value, `${path}.${key}`, depth + 1, state);
    }
    return output;
  } finally {
    state.active.delete(value);
  }
}

function exactRequest(input: unknown): Readonly<{
  expected: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['expected'];
  composerV2Owner: unknown;
  composerV3Owner: unknown;
  compositionRequest: unknown;
  writerFrameReceipt: unknown;
  authored: PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1;
  bodyInput: PatternImportDxfProductSavedActualBodyInputV2;
}> {
  if (!input || typeof input !== 'object' || arrayIsArray(input) || arrayBufferIsView(input))
    fail('invalid-input', 'Bridge request must be one exact plain record.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = objectGetPrototypeOf(input);
    descriptors = objectGetOwnPropertyDescriptors(input);
  } catch {
    fail('invalid-input', 'Bridge request could not be inspected safely.');
  }
  if (prototype !== objectPrototype && prototype !== null)
    fail('invalid-input', 'Bridge request must use a plain object prototype.');
  const bodyKey = descriptors.canonicalDisplayedBodyOwner
    ? 'canonicalDisplayedBodyOwner'
    : 'mannequin';
  const expectedKeys = sortedStrings([
    'authored',
    'composerV2Owner',
    'composerV3Owner',
    'compositionRequest',
    'expected',
    bodyKey,
    'schemaVersion',
    'writerFrameReceipt',
  ]);
  const keys = reflectOwnKeys(descriptors);
  const actual = sortedStrings(arrayFilter(keys, (key) => typeof key === 'string') as string[]);
  if (
    actual.length !== keys.length ||
    actual.length !== expectedKeys.length ||
    arraySome(actual, (key, index) => key !== expectedKeys[index])
  )
    fail('invalid-input', 'Bridge request has missing, symbol, accessor, or unexpected fields.');
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      fail('invalid-input', `Bridge request ${key} must be enumerable data.`);
  }
  if (
    descriptors.schemaVersion!.value !==
    PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_REQUEST_V2
  )
    fail('invalid-input', 'Bridge request schemaVersion is unsupported.');
  const detached = snapshotPlain(
    {
      expected: descriptors.expected!.value,
      authored: descriptors.authored!.value,
      compositionRequest: descriptors.compositionRequest!.value,
      writerFrameReceipt: descriptors.writerFrameReceipt!.value,
    },
    'request',
    0,
    { nodes: 0, properties: 0, active: new CapturedSet<object>() },
  ) as {
    expected: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['expected'];
    authored: PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1;
    compositionRequest: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['compositionRequest'];
    writerFrameReceipt: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['writerFrameReceipt'];
  };
  const expectedSealKeys = [
    'composerV2CanonicalSha256',
    'composerV3CanonicalSha256',
    'phase2ArtifactSha256',
    'refinedArtifactSha256',
  ];
  const detachedExpectedKeys = sortedStrings(objectKeys(detached.expected));
  if (
    detachedExpectedKeys.length !== expectedSealKeys.length ||
    arraySome(detachedExpectedKeys, (key, index) => key !== expectedSealKeys[index]) ||
    arraySome(detachedExpectedKeys, (key) => {
      const value = detached.expected[key as keyof typeof detached.expected];
      return !isSha256(value);
    })
  )
    fail('invalid-input', 'Expected upstream seals are invalid.');
  return objectFreeze({
    expected: detached.expected,
    composerV2Owner: descriptors.composerV2Owner!.value,
    composerV3Owner: descriptors.composerV3Owner!.value,
    compositionRequest: detached.compositionRequest,
    writerFrameReceipt: detached.writerFrameReceipt,
    authored: detached.authored,
    bodyInput:
      bodyKey === 'canonicalDisplayedBodyOwner'
        ? { canonicalDisplayedBodyOwner: descriptors[bodyKey]!.value }
        : { mannequin: descriptors[bodyKey]!.value },
  });
}

function exactRuntimeSourceHandoffRequest(input: unknown): Readonly<{
  expected: PatternImportDxfProductSavedCanonicalMediumActualBodyRuntimeSourceHandoffRequestV2['expected'];
  composerV3Owner: unknown;
}> {
  if (!input || typeof input !== 'object' || arrayIsArray(input) || arrayBufferIsView(input))
    throw new TypeError('Runtime-source handoff request must be one exact plain record.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = objectGetPrototypeOf(input);
    descriptors = objectGetOwnPropertyDescriptors(input);
  } catch {
    throw new TypeError('Runtime-source handoff request could not be inspected safely.');
  }
  if (prototype !== objectPrototype && prototype !== null)
    throw new TypeError('Runtime-source handoff request must use a plain object prototype.');
  const expectedKeys = ['composerV3Owner', 'expected', 'schemaVersion'];
  const keys = reflectOwnKeys(descriptors);
  const actual = sortedStrings(arrayFilter(keys, (key) => typeof key === 'string') as string[]);
  if (
    actual.length !== keys.length ||
    actual.length !== expectedKeys.length ||
    arraySome(actual, (key, index) => key !== expectedKeys[index])
  )
    throw new TypeError('Runtime-source handoff request has missing or unexpected fields.');
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new TypeError(`Runtime-source handoff request ${key} must be enumerable data.`);
  }
  if (
    descriptors.schemaVersion!.value !==
    PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_HANDOFF_REQUEST_V2
  )
    throw new TypeError('Runtime-source handoff request schemaVersion is unsupported.');
  const expected = snapshotPlain(descriptors.expected!.value, 'runtimeSourceHandoff.expected', 0, {
    nodes: 0,
    properties: 0,
    active: new CapturedSet<object>(),
  }) as PatternImportDxfProductSavedCanonicalMediumActualBodyRuntimeSourceHandoffRequestV2['expected'];
  const expectedSealKeys = [
    'actualBodyBridgeCanonicalSha256',
    'composerV3CanonicalSha256',
    'phase2ArtifactSha256',
    'refinedArtifactSha256',
  ];
  const actualSealKeys = sortedStrings(objectKeys(expected));
  if (
    actualSealKeys.length !== expectedSealKeys.length ||
    arraySome(actualSealKeys, (key, index) => key !== expectedSealKeys[index]) ||
    arraySome(actualSealKeys, (key) => !isSha256(expected[key as keyof typeof expected]))
  )
    throw new TypeError('Runtime-source handoff expected seals are invalid.');
  return objectFreeze({ expected, composerV3Owner: descriptors.composerV3Owner!.value });
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return jsonStringify(value);
  if (typeof value === 'number') {
    if (!numberIsFinite(value) || objectIs(value, -0)) throw new TypeError();
    return jsonStringify(value);
  }
  if (arrayIsArray(value)) return `[${arrayJoin(arrayMap(value, canonical), ',')}]`;
  if (!value || typeof value !== 'object' || arrayBufferIsView(value)) throw new TypeError();
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (arraySome(keys, (key) => typeof key !== 'string')) throw new TypeError();
  const definedKeys = arrayFilter(keys as string[], (key) => {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor)) throw new TypeError();
    return descriptor.value !== undefined;
  });
  const members = arrayMap(
    sortedStrings(definedKeys),
    (key) => `${jsonStringify(key)}:${canonical(descriptors[key]!.value)}`,
  );
  return `{${arrayJoin(members, ',')}}`;
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
    fail('sha256-unavailable', 'Native SHA-256 authority is unavailable.');
  return objectFreeze({ subtle, digest: subtleDigest as SubtleCrypto['digest'] });
}

async function digest(bytes: Uint8Array, authority: DigestAuthority): Promise<string> {
  let result: ArrayBuffer;
  try {
    result = (await reflectApply(authority.digest, authority.subtle, [
      'SHA-256',
      bytes,
    ])) as ArrayBuffer;
  } catch {
    fail('sha256-unavailable', 'Native SHA-256 failed.');
  }
  if (!(result instanceof CapturedArrayBuffer) || result.byteLength !== 32)
    fail('sha256-unavailable', 'Native SHA-256 returned invalid bytes.');
  const outputBytes = new CapturedUint8Array(result);
  const hex = arrayMap([...outputBytes], (byte) => {
    const unpadded = reflectApply(numberToStringIntrinsic, byte, [16]) as string;
    return reflectApply(stringPadStartIntrinsic, unpadded, [2, '0']) as string;
  });
  return arrayJoin(hex, '');
}

async function sha256(domain: string, value: unknown, authority: DigestAuthority): Promise<string> {
  const bytes = encodeText(`${domain}\0${canonical(value)}`);
  return digest(bytes, authority);
}

async function validateDigest(authority: DigestAuthority): Promise<void> {
  if ((await digest(new CapturedUint8Array(0), authority)) !== EMPTY_SHA256)
    fail('sha256-unavailable', 'SHA-256 empty-message known-answer test failed.');
  if ((await digest(encodeText('abc'), authority)) !== ABC_SHA256)
    fail('sha256-unavailable', 'SHA-256 abc known-answer test failed.');
}

function validateAuthoredInput(
  authored: PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1,
): void {
  if (
    canonical(authored.frame) !== canonical(BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1)
  )
    fail('authored-frame-mismatch', 'The source authored frame is not canonical-medium V1.');
  const body = authored.semantics.body;
  const display = authored.displayBody;
  if (
    body.providerId !== display.modelId ||
    body.providerRevision !== display.modelContentRevision ||
    body.bodyId !== display.modelId ||
    body.bodyRevision !== display.modelContentRevision ||
    body.poseKind !== 'A' ||
    body.poseRevision !== display.posePresetId ||
    body.collisionLodId !== 'rendered-body-13380v-26756t'
  )
    fail(
      'display-body-binding-mismatch',
      'Authored semantics body identity does not exact-bind the rendered display body.',
    );
}

function placementFrameSpec(
  authored: PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1,
  placement: BetaSkirtCanonicalMediumSavedWriterFramePlacementProjectionV2,
): DxfProductTwoPanelSkirtCanonicalMediumMappingSpecV2 {
  const sourceFront = placement.snapshot.sourceFrame.pieces[0];
  const sourceBack = placement.snapshot.sourceFrame.pieces[1];
  const authoredFront = authored.frame.pieces[0];
  const authoredBack = authored.frame.pieces[1];
  if (
    sourceFront.pieceId !== authoredFront.pieceId ||
    sourceBack.pieceId !== authoredBack.pieceId ||
    sourceFront.sourceApexMm[0] !== authoredFront.planarApexMm[0] ||
    sourceFront.sourceApexMm[1] !== authoredFront.planarApexMm[1] ||
    sourceBack.sourceApexMm[0] !== authoredBack.planarApexMm[0] ||
    sourceBack.sourceApexMm[1] !== authoredBack.planarApexMm[1]
  )
    fail(
      'authored-frame-mismatch',
      'Persisted source apex does not exact-bind the explicit authored source frame.',
    );
  return objectFreeze({
    pieces: objectFreeze([
      objectFreeze({ ...authoredFront, planarApexMm: sourceFront.writtenApexMm }),
      objectFreeze({ ...authoredBack, planarApexMm: sourceBack.writtenApexMm }),
    ]) as DxfProductTwoPanelSkirtCanonicalMediumMappingSpecV2['pieces'],
    waistSlantRadiusMm: authored.frame.waistSlantRadiusMm,
    hemSlantRadiusMm: authored.frame.hemSlantRadiusMm,
    sectorSpanRadPerPiece: authored.frame.sectorSpanRadPerPiece,
    waistCenterM: placement.snapshot.placement.authoredFrame.waistCenterM,
    seamAnchorAngleRad: authored.frame.seamAnchorAngleRad,
    parameterResidualMm: 0.01,
    parameterResidualRad: 0.000001,
  });
}

function mappingSnapshot(placement: BetaSkirtCanonicalMediumProductPlacementProjectionV1) {
  return objectFreeze({
    positions3M: placement.collisionInput.garmentPositionsM,
    positionsInvMass: placement.positionsInvMass,
    triangles: placement.collisionInput.garmentTriangles,
    seamPairs: placement.seamPairs,
    pinnedWaistVertexIndices: placement.pinnedWaistVertexIndices,
  });
}

function disposeRecord(record: OwnerRecord): void {
  disposeBetaSkirtCanonicalMediumSourceAdmissionV1(record.sourceAdmissionOwner);
  disposeBetaSkirtCanonicalMediumProductSeamPinV2(record.seamPinOwner);
  disposeDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(record.selfOrientationOwner);
  disposeBetaSkirtCanonicalMediumSavedWriterFramePlacementV2(record.placementOwner);
  disposeDxfProductTwoPanelSkirtPlacementSemanticsV1(record.semanticsOwner);
  record.disposed = true;
}

function liveOwnerRecord(owner: unknown): Readonly<{
  owner: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2;
  record: OwnerRecord;
}> | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = ownerRecord(owner);
  if (!record || record.disposed) return null;
  const publicOwner = owner as PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2;
  const semantics = projectDxfProductTwoPanelSkirtPlacementSemanticsV1(record.semanticsOwner);
  const placement = projectBetaSkirtCanonicalMediumSavedWriterFramePlacementV2(
    record.placementOwner,
  );
  const selfOrientation = projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(
    record.selfOrientationOwner,
  );
  const seamPin = projectBetaSkirtCanonicalMediumProductSeamPinV2(record.seamPinOwner);
  const sourceAdmission = projectBetaSkirtCanonicalMediumSourceAdmissionV1(
    record.sourceAdmissionOwner,
  );
  if (
    !semantics ||
    !placement ||
    !selfOrientation ||
    !seamPin ||
    !sourceAdmission ||
    record.semanticsOwner.snapshot.seal.canonicalSha256 !==
      publicOwner.snapshot.bindings.semanticsCanonicalSha256 ||
    placement.snapshot.seal.canonicalSha256 !==
      publicOwner.snapshot.bindings.savedPlacementCanonicalSha256 ||
    placement.snapshot.placement.seal.canonicalSha256 !==
      publicOwner.snapshot.bindings.innerPlacementCanonicalSha256 ||
    selfOrientation.reportCanonicalSha256 !==
      publicOwner.snapshot.bindings.selfOrientationCanonicalSha256 ||
    seamPin.reportCanonicalSha256 !== publicOwner.snapshot.bindings.seamPinCanonicalSha256 ||
    sourceAdmission.reportCanonicalSha256 !==
      publicOwner.snapshot.bindings.sourceAdmissionCanonicalSha256
  )
    return null;
  return objectFreeze({ owner: publicOwner, record });
}

export async function buildPatternImportDxfProductSavedCanonicalMediumActualBodyBridgeV2(
  input: unknown,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeResultV2> {
  let semanticsOwner: DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1 | null = null;
  let placementOwner: BetaSkirtCanonicalMediumSavedWriterFramePlacementOwnerV2 | null = null;
  let selfOrientationOwner: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2 | null =
    null;
  let seamPinOwner: BetaSkirtCanonicalMediumProductSeamPinOwnerV2 | null = null;
  let sourceAdmissionOwner: BetaSkirtCanonicalMediumSourceAdmissionOwnerV1 | null = null;
  try {
    if (signal?.aborted) fail('session-cancelled', 'Actual-body bridge was cancelled.');
    const request = exactRequest(input);
    const authority = digestAuthority();
    await validateDigest(authority);
    if (signal?.aborted) fail('session-cancelled', 'Actual-body bridge was cancelled.');
    validateAuthoredInput(request.authored);

    const semantics = await buildDxfProductTwoPanelSkirtPlacementSemanticsV1({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
      origin: request.authored.semantics.origin,
      expectedComposerCanonicalSha256: request.expected.composerV2CanonicalSha256,
      composerOwner: request.composerV2Owner as PatternImportDxfProductGarmentMeshComposerOwnerV2,
      garment: request.authored.semantics.garment,
      body: request.authored.semantics.body,
      policy: request.authored.semantics.policy,
    });
    if (signal?.aborted) {
      if (semantics.ok) disposeDxfProductTwoPanelSkirtPlacementSemanticsV1(semantics.owner);
      fail('session-cancelled', 'Actual-body bridge was cancelled after semantics build.');
    }
    if (!semantics.ok)
      fail(
        'authored-semantics-blocked',
        `${semantics.blockers[0].code}: ${semantics.blockers[0].detail}`,
      );
    semanticsOwner = semantics.owner;
    if (!projectDxfProductTwoPanelSkirtPlacementSemanticsV1(semantics.owner))
      fail('projection-unavailable', 'Semantics projection is unavailable.');

    const placement = await buildBetaSkirtCanonicalMediumSavedWriterFramePlacementV2({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WRITER_FRAME_PLACEMENT_REQUEST_V2,
      composerV2Owner: request.composerV2Owner,
      composerV3Owner: request.composerV3Owner,
      compositionRequest: request.compositionRequest,
      writerFrameReceipt: request.writerFrameReceipt,
      ...request.bodyInput,
    });
    if (signal?.aborted) {
      if (placement.ok) disposeBetaSkirtCanonicalMediumSavedWriterFramePlacementV2(placement.owner);
      fail('session-cancelled', 'Actual-body bridge was cancelled after saved placement build.');
    }
    if (!placement.ok)
      fail(
        'saved-placement-blocked',
        `${placement.blockers[0].code}: ${placement.blockers[0].detail}`,
      );
    placementOwner = placement.owner;
    const placementProjection = projectBetaSkirtCanonicalMediumSavedWriterFramePlacementV2(
      placement.owner,
    );
    if (!placementProjection)
      fail('projection-unavailable', 'Saved placement projection is unavailable.');
    if (
      placement.snapshot.bindings.composerV2CanonicalSha256 !==
        request.expected.composerV2CanonicalSha256 ||
      placement.snapshot.bindings.composerV3CanonicalSha256 !==
        request.expected.composerV3CanonicalSha256 ||
      placement.snapshot.bindings.phase2ArtifactSha256 !== request.expected.phase2ArtifactSha256 ||
      placement.snapshot.bindings.refinedArtifactSha256 !== request.expected.refinedArtifactSha256
    )
      fail('authority-binding-mismatch', 'Saved placement lost an exact Composer binding.');

    const display = request.authored.displayBody;
    const innerPlacement = placement.snapshot.placement;
    if (
      innerPlacement.bindings.modelId !== display.modelId ||
      innerPlacement.bindings.modelContentRevision !== display.modelContentRevision ||
      innerPlacement.bindings.inputFingerprint !== display.inputFingerprint ||
      innerPlacement.bindings.basisKind !== display.basisKind ||
      innerPlacement.bindings.posePresetId !== display.posePresetId
    )
      fail('display-body-binding-mismatch', 'Saved placement lost the display-body binding.');

    if (
      !placement.snapshot.claims.canonical580v912tTopologyParityEstablished ||
      !placement.snapshot.claims.downstreamSeamPinTopologyCompatible ||
      innerPlacement.counts.v3VertexCount !== 580 ||
      innerPlacement.counts.v3TriangleCount !== 912 ||
      innerPlacement.counts.v3BoundaryVertexCount !== 244 ||
      innerPlacement.counts.v3InteriorVertexCount !== 336
    )
      fail(
        'saved-topology-parity-blocked',
        `Genuine saved refinement is ${String(innerPlacement.counts.v3VertexCount)}V/${String(innerPlacement.counts.v3TriangleCount)}T/${String(innerPlacement.counts.v3BoundaryVertexCount)}B/${String(innerPlacement.counts.v3InteriorVertexCount)}I; exact downstream parity requires 580V/912T/244B/336I before self-orientation, seam/pin, source admission, or runtime handoff.`,
      );

    const mappingSpec = placementFrameSpec(request.authored, placementProjection);
    const selfOrientation = await buildDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_REQUEST_V2,
      expected: request.expected,
      composerV2Owner: request.composerV2Owner,
      composerV3Owner: request.composerV3Owner,
      mappingSpec,
      mappingSnapshot: mappingSnapshot(placementProjection.placement),
    });
    if (signal?.aborted) {
      if (selfOrientation.ok)
        disposeDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(selfOrientation.owner);
      fail('session-cancelled', 'Actual-body bridge was cancelled after self-orientation build.');
    }
    if (!selfOrientation.ok)
      fail(
        'self-orientation-blocked',
        `${selfOrientation.blockers[0].code}: ${selfOrientation.blockers[0].detail}`,
      );
    selfOrientationOwner = selfOrientation.owner;

    const seamRequest: Omit<BetaSkirtCanonicalMediumProductSeamPinRequestV2, 'placementOwner'> = {
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_REQUEST_V2,
      expected: {
        composerV2CanonicalSha256: request.expected.composerV2CanonicalSha256,
        composerV3CanonicalSha256: request.expected.composerV3CanonicalSha256,
        selfOrientationCanonicalSha256: selfOrientation.report.seal.canonicalSha256,
        placementCanonicalSha256: innerPlacement.seal.canonicalSha256,
      },
      composerV2Owner: request.composerV2Owner as PatternImportDxfProductGarmentMeshComposerOwnerV2,
      composerV3Owner: request.composerV3Owner as PatternImportDxfProductGarmentMeshComposerOwnerV3,
      selfOrientationOwner: selfOrientation.owner,
    };
    const seamPin = await buildBetaSkirtCanonicalMediumSavedWriterFrameSeamPinHandoffV2(
      placement.owner,
      seamRequest,
      signal,
    );
    if (signal?.aborted) {
      if (seamPin.ok) disposeBetaSkirtCanonicalMediumProductSeamPinV2(seamPin.owner);
      fail('session-cancelled', 'Actual-body bridge was cancelled after seam/pin build.');
    }
    if (!seamPin.ok)
      fail('seam-pin-blocked', `${seamPin.blockers[0].code}: ${seamPin.blockers[0].detail}`);
    seamPinOwner = seamPin.owner;

    const sourceRequest: Omit<BetaSkirtCanonicalMediumSourceAdmissionRequestV1, 'placementOwner'> =
      {
        schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_REQUEST_V1,
        expected: {
          placementCanonicalSha256: innerPlacement.seal.canonicalSha256,
          selfOrientationCanonicalSha256: selfOrientation.report.seal.canonicalSha256,
          seamPinCanonicalSha256: seamPin.report.seal.canonicalSha256,
          sourcePositionsRawFloat32LeSha256: seamPin.report.bindings.positionsRawFloat32LeSha256,
          collisionInputSha256: innerPlacement.bindings.collisionInputSha256,
        },
        selfOrientationOwner: selfOrientation.owner,
        seamPinOwner: seamPin.owner,
      };
    const sourceAdmission =
      await buildBetaSkirtCanonicalMediumSavedWriterFrameSourceAdmissionHandoffV2(
        placement.owner,
        sourceRequest,
        signal,
      );
    if (signal?.aborted) {
      if (sourceAdmission.ok)
        disposeBetaSkirtCanonicalMediumSourceAdmissionV1(sourceAdmission.owner);
      fail('session-cancelled', 'Actual-body bridge was cancelled after source-admission build.');
    }
    if (!sourceAdmission.ok)
      fail(
        'source-admission-blocked',
        `${sourceAdmission.blockers[0].code}: ${sourceAdmission.blockers[0].detail}`,
      );
    sourceAdmissionOwner = sourceAdmission.owner;
    const sourceProjection = projectBetaSkirtCanonicalMediumSourceAdmissionV1(
      sourceAdmission.owner,
    );
    if (!sourceProjection)
      fail('projection-unavailable', 'Source-admission projection is unavailable.');
    if (signal?.aborted) fail('session-cancelled', 'Actual-body bridge was cancelled.');

    const contact = sourceAdmission.report.collision;
    if (
      innerPlacement.counts.bodyVertexCount !== 13_380 ||
      innerPlacement.counts.bodyTriangleCount !== 26_756 ||
      sourceAdmission.report.counts.garmentVertexCount !== 580 ||
      sourceAdmission.report.counts.garmentTriangleCount !== 912 ||
      sourceAdmission.report.counts.seamPairCount !== 34 ||
      sourceAdmission.report.counts.pinnedVertexCount !== 82 ||
      sourceAdmission.report.counts.selfRawIntersectionCount !== 182 ||
      sourceAdmission.report.counts.selfResidualIntersectionCount !== 0 ||
      contact.status !== 'signed-clearance-measured' ||
      contact.bodyGarmentTriangleIntersectionCount !== 0 ||
      contact.penetratingVertexCount !== 0 ||
      contact.unsafeVertexCount !== 0 ||
      contact.ambiguousSignVertexCount !== 0 ||
      !(contact.minimumSignedClearanceM > 0)
    )
      fail('diagnostic-gate-mismatch', 'Saved actual-body/source-admission gates are not clear.');

    const bindings = objectFreeze({
      rowDxfSha256: placement.snapshot.bindings.rowDxfSha256,
      aggregateCanonicalSha256: placement.snapshot.bindings.aggregateCanonicalSha256,
      sourcePathCoordinateSha256: placement.snapshot.bindings.sourcePathCoordinateSha256,
      writerFrameReceiptCanonicalSha256:
        placement.snapshot.bindings.writerFrameReceiptCanonicalSha256,
      localFramePreflightCanonicalSha256:
        placement.snapshot.bindings.localFramePreflightCanonicalSha256,
      sourceFrameOverrideCanonicalSha256:
        placement.snapshot.bindings.sourceFrameOverrideCanonicalSha256,
      savedPlacementCanonicalSha256: placement.snapshot.seal.canonicalSha256,
      innerPlacementCanonicalSha256: innerPlacement.seal.canonicalSha256,
      composerV2CanonicalSha256: request.expected.composerV2CanonicalSha256,
      composerV3CanonicalSha256: request.expected.composerV3CanonicalSha256,
      phase2ArtifactSha256: request.expected.phase2ArtifactSha256,
      refinedArtifactSha256: request.expected.refinedArtifactSha256,
      semanticsCanonicalSha256: semantics.snapshot.seal.canonicalSha256,
      selfOrientationCanonicalSha256: selfOrientation.report.seal.canonicalSha256,
      seamPinCanonicalSha256: seamPin.report.seal.canonicalSha256,
      sourceAdmissionCanonicalSha256: sourceAdmission.report.seal.canonicalSha256,
      collisionInputSha256: innerPlacement.bindings.collisionInputSha256,
      authoredFrameSha256: innerPlacement.bindings.authoredFrameSha256,
      bodyPositionsSha256: innerPlacement.bindings.bodyPositionsSha256,
      bodyTopologySha256: innerPlacement.bindings.bodyTopologySha256,
    });
    if (arraySome(objectKeys(bindings), (key) => !isSha256(bindings[key as keyof typeof bindings])))
      fail('sha256-unavailable', 'Actual-body bridge produced an invalid SHA-256 binding.');
    const payload = objectFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_V2,
      status: 'saved-writer-frame-actual-body-source-admission-diagnostic' as const,
      bindings,
      counts: objectFreeze({
        bodyVertexCount: 13_380 as const,
        bodyTriangleCount: 26_756 as const,
        garmentVertexCount: 580 as const,
        garmentTriangleCount: 912 as const,
        seamPairCount: 34 as const,
        pinnedVertexCount: 82 as const,
        selfRawIntersectionCount: 182 as const,
        selfResidualIntersectionCount: 0 as const,
      }),
      contact: objectFreeze({
        status: 'signed-clearance-measured' as const,
        bodyGarmentTriangleIntersectionCount: 0 as const,
        penetratingVertexCount: 0 as const,
        unsafeVertexCount: 0 as const,
        ambiguousSignVertexCount: 0 as const,
        minimumSignedClearanceM: contact.minimumSignedClearanceM,
      }),
      sourceAdmissionDecision: sourceAdmission.report.decision,
      claims: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_CLAIMS_V2,
      blockers: BLOCKERS,
    });
    const canonicalSha256 = await sha256(
      'pattern-import-dxf-product-saved-canonical-medium-actual-body-bridge-v2',
      payload,
      authority,
    );
    if (signal?.aborted) fail('session-cancelled', 'Actual-body bridge was cancelled.');
    const snapshot = objectFreeze({
      ...payload,
      seal: objectFreeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-saved-writer-frame-session-diagnostic-only' as const,
      }),
    }) satisfies PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeSnapshotV2;
    const owner = objectFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_OWNER_V2,
      snapshot,
    }) as PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2;
    retainOwnerRecord(owner, {
      semanticsOwner: semantics.owner,
      placementOwner: placement.owner,
      selfOrientationOwner: selfOrientation.owner,
      seamPinOwner: seamPin.owner,
      sourceAdmissionOwner: sourceAdmission.owner,
      runtimeSourceIssuance: 'available',
      disposed: false,
    });
    semanticsOwner = null;
    placementOwner = null;
    selfOrientationOwner = null;
    seamPinOwner = null;
    sourceAdmissionOwner = null;
    return objectFreeze({
      ok: true as const,
      owner,
      snapshot,
      claims: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_CLAIMS_V2,
      blockers: BLOCKERS,
    });
  } catch (error) {
    return blocked(error);
  } finally {
    if (sourceAdmissionOwner)
      disposeBetaSkirtCanonicalMediumSourceAdmissionV1(sourceAdmissionOwner);
    if (seamPinOwner) disposeBetaSkirtCanonicalMediumProductSeamPinV2(seamPinOwner);
    if (selfOrientationOwner)
      disposeDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(selfOrientationOwner);
    if (placementOwner) disposeBetaSkirtCanonicalMediumSavedWriterFramePlacementV2(placementOwner);
    if (semanticsOwner) disposeDxfProductTwoPanelSkirtPlacementSemanticsV1(semanticsOwner);
  }
}

/**
 * Capability-safe runtime handoff. Private self-orientation and source-admission owners never
 * escape; the short-lived normalized-V5 owner is always disposed before this promise settles.
 */
export async function buildPatternImportDxfProductSavedCanonicalMediumActualBodyRuntimeSourceHandoffV2(
  bridgeOwner: unknown,
  input: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtCanonicalMediumWebgpuRuntimeSourceResultV1> {
  let normalizedOwner: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1 | null =
    null;
  let issuanceRecord: OwnerRecord | null = null;
  let ownershipTransferred = false;
  try {
    if (signal?.aborted)
      throw new DOMException(
        'Saved actual-body runtime-source handoff was cancelled.',
        'AbortError',
      );
    const initial = liveOwnerRecord(bridgeOwner);
    if (!initial) throw new TypeError('A live saved actual-body bridge V2 owner is required.');
    const request = exactRuntimeSourceHandoffRequest(input);
    if (initial.record.runtimeSourceIssuance !== 'available')
      throw new TypeError(
        'The saved actual-body bridge V2 runtime source is already issuing or has been issued.',
      );
    initial.record.runtimeSourceIssuance = 'issuing';
    issuanceRecord = initial.record;
    const snapshot = initial.owner.snapshot;
    if (
      request.expected.actualBodyBridgeCanonicalSha256 !== snapshot.seal.canonicalSha256 ||
      request.expected.composerV3CanonicalSha256 !== snapshot.bindings.composerV3CanonicalSha256 ||
      request.expected.phase2ArtifactSha256 !== snapshot.bindings.phase2ArtifactSha256 ||
      request.expected.refinedArtifactSha256 !== snapshot.bindings.refinedArtifactSha256
    )
      throw new TypeError('Runtime-source handoff expected seals differ from the bridge owner.');

    const normalized = await buildDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1({
      schemaVersion:
        DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_REQUEST_V1,
      expected: {
        composerV3CanonicalSha256: snapshot.bindings.composerV3CanonicalSha256,
        phase2ArtifactSha256: snapshot.bindings.phase2ArtifactSha256,
        refinedArtifactSha256: snapshot.bindings.refinedArtifactSha256,
        selfOrientationReportSha256: snapshot.bindings.selfOrientationCanonicalSha256,
      },
      composerV3Owner: request.composerV3Owner,
      selfOrientationOwner: initial.record.selfOrientationOwner,
    });
    if (signal?.aborted) {
      if (normalized.ok)
        disposeDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1(normalized.owner);
      throw new DOMException(
        'Saved actual-body runtime-source handoff was cancelled.',
        'AbortError',
      );
    }
    if (!normalized.ok)
      throw new TypeError(`Normalized-V5 handoff failed: ${normalized.code}: ${normalized.detail}`);
    normalizedOwner = normalized.owner;
    const refreshed = liveOwnerRecord(bridgeOwner);
    if (!refreshed)
      throw new TypeError('The saved actual-body bridge V2 owner became stale during handoff.');
    if (
      refreshed.record !== issuanceRecord ||
      refreshed.record.runtimeSourceIssuance !== 'issuing' ||
      refreshed.owner.snapshot.seal.canonicalSha256 !==
        request.expected.actualBodyBridgeCanonicalSha256
    )
      throw new TypeError('The saved actual-body bridge V2 binding drifted during handoff.');

    const runtimeSource = await buildBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_REQUEST_V1,
      expected: {
        sourceAdmissionCanonicalSha256:
          refreshed.owner.snapshot.bindings.sourceAdmissionCanonicalSha256,
        normalizedV5BridgeCanonicalSha256: normalized.report.seal.canonicalSha256,
      },
      sourceAdmissionOwner: refreshed.record.sourceAdmissionOwner,
      normalizedV5BridgeOwner: normalized.owner,
    });
    const finalLive = liveOwnerRecord(bridgeOwner);
    if (signal?.aborted || !finalLive) {
      if (runtimeSource.ok)
        disposeBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSource.owner);
      if (signal?.aborted)
        throw new DOMException(
          'Saved actual-body runtime-source handoff was cancelled.',
          'AbortError',
        );
      throw new TypeError('The saved actual-body bridge V2 owner became stale during handoff.');
    }
    if (
      finalLive.record !== issuanceRecord ||
      finalLive.record.runtimeSourceIssuance !== 'issuing' ||
      finalLive.owner.snapshot.seal.canonicalSha256 !==
        request.expected.actualBodyBridgeCanonicalSha256
    ) {
      if (runtimeSource.ok)
        disposeBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSource.owner);
      throw new TypeError('The saved actual-body bridge V2 binding drifted during handoff.');
    }
    if (runtimeSource.ok) {
      finalLive.record.runtimeSourceIssuance = 'issued';
      ownershipTransferred = true;
    }
    return runtimeSource;
  } finally {
    if (normalizedOwner)
      disposeDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1(normalizedOwner);
    if (
      issuanceRecord &&
      !ownershipTransferred &&
      !issuanceRecord.disposed &&
      issuanceRecord.runtimeSourceIssuance === 'issuing'
    )
      issuanceRecord.runtimeSourceIssuance = 'available';
  }
}

export function projectPatternImportDxfProductSavedCanonicalMediumActualBodyBridgeV2(
  owner: unknown,
): PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeProjectionV2 | null {
  const live = liveOwnerRecord(owner);
  if (!live) return null;
  const { record, owner: publicOwner } = live;
  const placement = projectBetaSkirtCanonicalMediumSavedWriterFramePlacementV2(
    record.placementOwner,
  );
  const sourceAdmission = projectBetaSkirtCanonicalMediumSourceAdmissionV1(
    record.sourceAdmissionOwner,
  );
  if (!placement || !sourceAdmission) return null;
  return objectFreeze({
    schemaVersion:
      PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_PROJECTION_V2,
    snapshot: publicOwner.snapshot,
    placement,
    sourceAdmission,
    callerOwnedMutableBinaryCopies: true as const,
    placementAuthority: false as const,
    collisionAuthority: false as const,
    initializationAuthority: false as const,
    runtimeAuthority: false as const,
    fitAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposePatternImportDxfProductSavedCanonicalMediumActualBodyBridgeV2(
  owner: unknown,
): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = ownerRecord(owner);
  if (!record || record.disposed) return false;
  disposeRecord(record);
  forgetOwnerRecord(owner);
  return true;
}
