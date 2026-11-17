import {
  buildPatternImportDxfProductGarmentMeshComposerV2,
  disposePatternImportDxfProductGarmentMeshComposerV2,
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
  type PatternImportDxfProductGarmentMeshComposerProjectionV2,
  type PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V3,
  buildPatternImportDxfProductGarmentMeshComposerV3,
  disposePatternImportDxfProductGarmentMeshComposerV3,
  projectPatternImportDxfProductGarmentMeshComposerV3,
  type PatternImportDxfProductGarmentMeshComposerOwnerV3,
  type PatternImportDxfProductGarmentMeshComposerProjectionV3,
  type PatternImportDxfProductGarmentMeshComposerSnapshotV3,
} from './pattern-import-dxf-product-garment-mesh-composer-v3';
import {
  buildPatternImportDxfProductSavedGarmentMeshIngressV1,
  type PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
  type PatternImportDxfProductSavedGarmentMeshIngressResultV1,
} from './pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import type { PatternImportDxfProductGarmentMeshNativeIngressReportV1 } from './pattern-import-dxf-product-garment-mesh-native-ingress-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_REQUEST_V1,
  evaluatePatternImportDxfProductSavedCanonicalMediumPlacementPreflightV1,
  type PatternImportDxfProductSavedCanonicalMediumPlacementPreflightReportV1,
} from './pattern-import-dxf-product-saved-canonical-medium-placement-preflight-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2,
  evaluatePatternImportDxfProductSavedAnnularLocalFramePreflightV2,
  type PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2,
  type PatternImportDxfProductSavedAnnularWriterFrameReceiptV2,
} from './pattern-import-dxf-product-saved-annular-local-frame-preflight-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_REQUEST_V2,
  buildPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2,
  disposePatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2,
  projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2,
  type PatternImportDxfProductSavedLocalFrameGarmentMeshComposerSnapshotV2,
} from './pattern-import-dxf-product-saved-local-frame-garment-mesh-composer-v2';
import {
  buildPatternImportDxfProductSavedWriterFrameReceiptV1,
  type PatternImportDxfProductSavedWriterFrameReceiptBlockerCodeV1,
  type PatternImportDxfProductSavedWriterFrameReceiptResultV1,
} from './pattern-import-dxf-product-saved-writer-frame-receipt-v1';
import type { DxfProductSavedRowIdentityV1 } from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  buildPatternImportDxfProductConfirmedAnnularIntentV1,
  type PatternImportDxfProductConfirmedAnnularBlockerCodeV1,
  type PatternImportDxfProductConfirmedAnnularRequestV1,
  type PatternImportDxfProductConfirmedAnnularResultV1,
} from './pattern-import-dxf-product-confirmed-annular-intent-v1';

export type PatternImportDxfProductSavedConfirmedPlacementRequestV1 =
  PatternImportDxfProductConfirmedAnnularRequestV1 & Readonly<{ expectedGeneration: number }>;
export type PatternImportDxfProductSavedConfirmedPlacementResultV1 =
  PatternImportDxfProductConfirmedAnnularResultV1 & Readonly<{ generation: number }>;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_SESSION_V1 =
  'pattern-import-dxf-product-saved-garment-mesh-compile-session/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_RESULT_V1 =
  'pattern-import-dxf-product-saved-garment-mesh-compile-result/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_REQUEST_V1 =
  'pattern-import-dxf-product-saved-canonical-medium-refinement-request/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_RESULT_V1 =
  'pattern-import-dxf-product-saved-canonical-medium-refinement-result/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_REQUEST_V2 =
  'pattern-import-dxf-product-saved-canonical-medium-local-frame-refinement-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_RESULT_V2 =
  'pattern-import-dxf-product-saved-canonical-medium-local-frame-refinement-result/2' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_CLAIMS_V1 = Object.freeze(
  {
    detachedComposerPreflightEvaluated: true,
    exactCanonicalMediumGeometryRequired: true,
    liveComposerV2OwnerStayedPrivate: true,
    composerV2RefinementCapabilityConsumed: true,
    composerV3RefinementIntegrated: true,
    composerV3OwnerPrivatelyRetained: true,
    callerReceivesMutableRefinedMeshCopiesOnly: true,
    tableOwnsPhysicalMesh: false,
    authoredGenericPlacementSemanticsPresented: false,
    actualBodyPlacementInputPresented: false,
    placementTransformGenerated: false,
    collisionEvaluated: false,
    initializationAdmitted: false,
    runtimeAuthority: false,
    productionAuthority: false,
  } as const,
);

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_BLOCKERS_V1 =
  Object.freeze([
    'generic-front-back-waist-hem-semantics-not-presented',
    'actual-body-placement-input-not-presented-to-cloth-session',
    'canonical-product-placement-sink-not-integrated',
    'collision-and-self-intersection-not-evaluated',
    'runtime-owner-not-integrated',
    'production-qualification-not-run',
  ] as const);

export type PatternImportDxfProductSavedCanonicalMediumRefinementRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_REQUEST_V1;
  expectedGeneration: number;
}>;

export type PatternImportDxfProductSavedCanonicalMediumRefinementBlockerCodeV1 =
  | 'session-disposed'
  | 'session-busy'
  | 'session-not-ready'
  | 'session-cancelled'
  | 'stale-generation'
  | 'invalid-input'
  | 'canonical-medium-preflight-blocked'
  | 'canonical-medium-geometry-incompatible'
  | 'composer-v3-blocked'
  | 'composer-v3-owner-invalid';

export type PatternImportDxfProductSavedCanonicalMediumRefinementResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_RESULT_V1;
      generation: number;
      preflight: PatternImportDxfProductSavedCanonicalMediumPlacementPreflightReportV1;
      composerV3Snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV3;
      blockers: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_BLOCKERS_V1;
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_RESULT_V1;
      generation: number;
      preflight: PatternImportDxfProductSavedCanonicalMediumPlacementPreflightReportV1 | null;
      composerV3Snapshot: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfProductSavedCanonicalMediumRefinementBlockerCodeV1;
          detail: string;
        }>,
      ];
      claims: Readonly<{
        detachedComposerPreflightEvaluated: boolean;
        exactCanonicalMediumGeometryRequired: true;
        liveComposerV2OwnerStayedPrivate: true;
        composerV2RefinementCapabilityConsumed: boolean;
        composerV3RefinementIntegrated: false;
        composerV3OwnerPrivatelyRetained: false;
        callerReceivesMutableRefinedMeshCopiesOnly: true;
        tableOwnsPhysicalMesh: false;
        authoredGenericPlacementSemanticsPresented: false;
        actualBodyPlacementInputPresented: false;
        placementTransformGenerated: false;
        collisionEvaluated: false;
        initializationAdmitted: false;
        runtimeAuthority: false;
        productionAuthority: false;
      }>;
    }>;

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_CLAIMS_V2 =
  Object.freeze({
    savedWriterFrameReceiptPresented: true,
    localFramePreflightV2Integrated: true,
    globalOriginGeometryCompatibilityRequired: false,
    exactCanonicalMediumLocalGeometryRequired: true,
    liveComposerV2OwnerStayedPrivate: true,
    composerV2RefinementCapabilityConsumed: true,
    composerV3RefinementIntegrated: true,
    composerV3OwnerPrivatelyRetained: true,
    canonical580v912tTopologyParityEstablished: true,
    runtimeAuthority: false,
    productionAuthority: false,
  } as const);

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_BLOCKERS_V2 =
  Object.freeze([
    'authored-garment-semantic-sidecar-not-production-established',
    'runtime-source-handoff-not-executed',
    'production-qualification-not-run',
  ] as const);

export type PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_REQUEST_V2;
  expectedGeneration: number;
  writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
}>;

export type PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementBlockerCodeV2 =
  | 'session-disposed'
  | 'session-busy'
  | 'session-not-ready'
  | 'session-cancelled'
  | 'stale-generation'
  | 'invalid-input'
  | 'writer-frame-binding-mismatch'
  | 'local-frame-preflight-blocked'
  | 'local-frame-geometry-incompatible'
  | 'composer-v3-blocked'
  | 'composer-v3-owner-invalid';

export type PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementResultV2 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_RESULT_V2;
      generation: number;
      localFramePreflight: PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2;
      closedIntegrationBlockers: readonly ['cloth-session-local-frame-preflight-v2-not-integrated'];
      composerV3Snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV3;
      savedLocalFrameComposerSnapshot: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerSnapshotV2;
      blockers: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_BLOCKERS_V2;
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_CLAIMS_V2;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_RESULT_V2;
      generation: number;
      localFramePreflight: PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2 | null;
      composerV3Snapshot: null;
      savedLocalFrameComposerSnapshot: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementBlockerCodeV2;
          detail: string;
        }>,
      ];
      claims: Readonly<{
        savedWriterFrameReceiptPresented: boolean;
        localFramePreflightV2Integrated: boolean;
        globalOriginGeometryCompatibilityRequired: false;
        exactCanonicalMediumLocalGeometryRequired: true;
        liveComposerV2OwnerStayedPrivate: true;
        composerV2RefinementCapabilityConsumed: boolean;
        composerV3RefinementIntegrated: false;
        composerV3OwnerPrivatelyRetained: false;
        canonical580v912tTopologyParityEstablished: false;
        runtimeAuthority: false;
        productionAuthority: false;
      }>;
    }>;

export type PatternImportDxfProductSavedGarmentMeshIngressBuilderV1 = (
  input: PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
) => Promise<PatternImportDxfProductSavedGarmentMeshIngressResultV1>;

export type PatternImportDxfProductSavedWriterFrameSessionReceiptResultV1 =
  | (Extract<PatternImportDxfProductSavedWriterFrameReceiptResultV1, { ok: true }> &
      Readonly<{ generation: number }>)
  | Readonly<{
      ok: false;
      generation: number;
      receipt: null;
      blocker: Readonly<{
        code:
          | PatternImportDxfProductSavedWriterFrameReceiptBlockerCodeV1
          | 'invalid-input'
          | 'session-disposed'
          | 'session-busy'
          | 'session-not-ready'
          | 'session-cancelled'
          | 'stale-generation';
        detail: string;
      }>;
    }>;

export type PatternImportDxfProductSavedRefinedCapabilityContextV1<TInput> = Readonly<{
  generation: number;
  input: TInput;
  /** Exact retained ingress row; null preserves injected legacy capability paths. */
  currentSavedRow: Readonly<DxfProductSavedRowIdentityV1> | null;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  composerV3Owner: PatternImportDxfProductGarmentMeshComposerOwnerV3;
  composerV2Snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
  composerV3Snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV3;
}>;

export type PatternImportDxfProductSavedRefinedCapabilityV1<
  TInput,
  TResult,
  TPrivateOwner extends object,
  TProjection,
> = Readonly<{
  build: (
    context: PatternImportDxfProductSavedRefinedCapabilityContextV1<TInput>,
    signal?: AbortSignal,
  ) => Promise<Readonly<{ owner: TPrivateOwner | null; result: TResult }>>;
  project: (owner: TPrivateOwner) => TProjection | null;
  dispose: (owner: TPrivateOwner) => boolean;
}>;

export type PatternImportDxfProductSavedRefinedCapabilityInfrastructureBlockerCodeV1 =
  | 'session-disposed'
  | 'session-busy'
  | 'session-not-refined'
  | 'session-cancelled'
  | 'stale-generation'
  | 'invalid-expected-generation'
  | 'capability-not-configured'
  | 'capability-owner-invalid'
  | 'capability-failed';

export type PatternImportDxfProductSavedRefinedCapabilityAdvanceResultV1<TResult> =
  | Readonly<{
      ok: true;
      generation: number;
      result: TResult;
    }>
  | Readonly<{
      ok: false;
      generation: number;
      blocker: Readonly<{
        code: PatternImportDxfProductSavedRefinedCapabilityInfrastructureBlockerCodeV1;
        detail: string;
      }>;
    }>;

export type PatternImportDxfProductSavedGarmentMeshCompileBlockerCodeV1 =
  | 'session-disposed'
  | 'session-busy'
  | 'session-cancelled'
  | 'saved-ingress-blocked'
  | 'composer-blocked'
  | 'composer-owner-invalid';

export type PatternImportDxfProductSavedGarmentMeshCompileClaimsV1 = Readonly<{
  savedIngressImplementation: 'production-default' | 'injected-test-seam';
  savedSourceOwnerConsumedByIngress: boolean;
  composerV2Executed: boolean;
  genuineComposerOwnerValidated: boolean;
  composerOwnerPrivatelyRetained: boolean;
  staleComposerOwnerRetainedAfterNewAttempt: false;
  callerReceivesMutableMeshCopiesOnly: true;
  tableOwnsPhysicalMesh: false;
  physicalPackageCompiled: false;
  solverRuntimeImported: false;
  staticPreviewAuthority: false;
  placementAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type PatternImportDxfProductSavedGarmentMeshCompileResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_RESULT_V1;
      generation: number;
      ingressReport: PatternImportDxfProductGarmentMeshNativeIngressReportV1;
      composerSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
      blockers: readonly [];
      claims: PatternImportDxfProductSavedGarmentMeshCompileClaimsV1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_RESULT_V1;
      generation: number;
      ingressReport: null;
      composerSnapshot: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfProductSavedGarmentMeshCompileBlockerCodeV1;
          detail: string;
        }>,
      ];
      claims: PatternImportDxfProductSavedGarmentMeshCompileClaimsV1;
    }>;

type SessionStatus =
  | 'idle'
  | 'compiling'
  | 'ready'
  | 'refining'
  | 'refined'
  | 'blocked'
  | 'disposed';

function refinementClaims(
  progress: Readonly<{
    detachedComposerPreflightEvaluated?: boolean;
    composerV2RefinementCapabilityConsumed?: boolean;
  }> = {},
): Extract<PatternImportDxfProductSavedCanonicalMediumRefinementResultV1, { ok: false }>['claims'] {
  return Object.freeze({
    detachedComposerPreflightEvaluated: false,
    exactCanonicalMediumGeometryRequired: true as const,
    liveComposerV2OwnerStayedPrivate: true as const,
    composerV2RefinementCapabilityConsumed: false,
    composerV3RefinementIntegrated: false as const,
    composerV3OwnerPrivatelyRetained: false as const,
    callerReceivesMutableRefinedMeshCopiesOnly: true as const,
    tableOwnsPhysicalMesh: false as const,
    authoredGenericPlacementSemanticsPresented: false as const,
    actualBodyPlacementInputPresented: false as const,
    placementTransformGenerated: false as const,
    collisionEvaluated: false as const,
    initializationAdmitted: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
    ...progress,
  });
}

function refinementBlocked(
  generation: number,
  code: PatternImportDxfProductSavedCanonicalMediumRefinementBlockerCodeV1,
  detail: string,
  options: Readonly<{
    preflight?: PatternImportDxfProductSavedCanonicalMediumPlacementPreflightReportV1 | null;
    detachedComposerPreflightEvaluated?: boolean;
    composerV2RefinementCapabilityConsumed?: boolean;
  }> = {},
): PatternImportDxfProductSavedCanonicalMediumRefinementResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_RESULT_V1,
    generation,
    preflight: options.preflight ?? null,
    composerV3Snapshot: null,
    blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]) as readonly [
      Readonly<{ code: typeof code; detail: string }>,
    ],
    claims: refinementClaims(options),
  });
}

function refinementRequest(
  input: unknown,
): PatternImportDxfProductSavedCanonicalMediumRefinementRequestV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ArrayBuffer.isView(input)) {
    throw new TypeError('Canonical-medium refinement request must be one exact plain object.');
  }
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch {
    throw new TypeError('Canonical-medium refinement request could not be inspected safely.');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Canonical-medium refinement request must use a plain object prototype.');
  }
  const expected = ['expectedGeneration', 'schemaVersion'];
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== 'string' || !expected.includes(key))
  ) {
    throw new TypeError(
      'Canonical-medium refinement request has missing, hidden, symbol, or unexpected fields.',
    );
  }
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(
        `Canonical-medium refinement request ${key} must be one enumerable data property.`,
      );
    }
  }
  if (
    descriptors.schemaVersion!.value !==
      PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_REQUEST_V1 ||
    !Number.isSafeInteger(descriptors.expectedGeneration!.value) ||
    descriptors.expectedGeneration!.value < 1
  ) {
    throw new TypeError('Canonical-medium refinement request values are invalid.');
  }
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_REQUEST_V1,
    expectedGeneration: descriptors.expectedGeneration!.value as number,
  });
}

type LocalFrameReceiptSnapshotState = Readonly<{
  active: Set<object>;
  counters: { nodes: number; properties: number };
}>;

function snapshotLocalFrameReceiptData(
  value: unknown,
  path: string,
  depth: number,
  state: LocalFrameReceiptSnapshotState,
): unknown {
  if (value === null || typeof value === 'boolean' || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > 16_384) throw new TypeError(`${path} exceeds receipt string bounds.`);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new TypeError(`${path} must contain finite canonical numbers.`);
    return value;
  }
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value))
    throw new TypeError(`${path} must contain plain receipt data only.`);
  if (depth > 12) throw new TypeError(`${path} exceeds receipt depth bounds.`);
  if (state.active.has(value)) throw new TypeError(`${path} contains a cycle.`);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new TypeError(`${path} could not be inspected safely.`);
  }
  const isArray = Array.isArray(value);
  if (prototype !== (isArray ? Array.prototype : Object.prototype) && prototype !== null)
    throw new TypeError(`${path} has an unsupported prototype.`);
  const ownKeys = Reflect.ownKeys(descriptors);
  const dataKeys: string[] = [];
  for (const key of ownKeys) {
    if (typeof key !== 'string') throw new TypeError(`${path} contains symbol fields.`);
    if (!(isArray && key === 'length')) dataKeys.push(key);
  }
  state.counters.nodes += 1;
  state.counters.properties += dataKeys.length;
  if (state.counters.nodes > 256 || state.counters.properties > 2_048)
    throw new TypeError(`${path} exceeds receipt graph bounds.`);
  state.active.add(value);
  try {
    if (isArray) {
      const length = descriptors.length;
      if (
        !length ||
        !('value' in length) ||
        !Number.isSafeInteger(length.value) ||
        length.value < 0 ||
        length.value > 256 ||
        dataKeys.length !== length.value
      )
        throw new TypeError(`${path} must be one bounded dense array.`);
      const output: unknown[] = [];
      for (let index = 0; index < dataKeys.length; index += 1) {
        const key = dataKeys[index]!;
        const descriptor = descriptors[key];
        if (
          key !== String(index) ||
          !descriptor ||
          !descriptor.enumerable ||
          !('value' in descriptor)
        )
          throw new TypeError(`${path} must contain enumerable dense data only.`);
        output[index] = snapshotLocalFrameReceiptData(
          descriptor.value,
          `${path}[${key}]`,
          depth + 1,
          state,
        );
      }
      return Object.freeze(output);
    }
    const output: Record<string, unknown> = {};
    for (const key of dataKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
        throw new TypeError(`${path}.${key} must be one enumerable data property.`);
      output[key] = snapshotLocalFrameReceiptData(
        descriptor.value,
        `${path}.${key}`,
        depth + 1,
        state,
      );
    }
    return Object.freeze(output);
  } finally {
    state.active.delete(value);
  }
}

function snapshotLocalFrameReceipt(
  value: unknown,
): PatternImportDxfProductSavedAnnularWriterFrameReceiptV2 {
  return snapshotLocalFrameReceiptData(value, 'writerFrameReceipt', 0, {
    active: new Set<object>(),
    counters: { nodes: 0, properties: 0 },
  }) as PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
}

function canonicalLocalFrameReceiptData(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const values: string[] = [];
    for (let index = 0; index < value.length; index += 1)
      values[index] = canonicalLocalFrameReceiptData(value[index]);
    return `[${values.join(',')}]`;
  }
  if (!value || typeof value !== 'object')
    throw new TypeError('Writer-frame receipt canonical data is invalid.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  const fields: string[] = [];
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new TypeError('Writer-frame receipt canonical data contains hidden fields.');
    fields.push(`${JSON.stringify(key)}:${canonicalLocalFrameReceiptData(descriptor.value)}`);
  }
  return `{${fields.join(',')}}`;
}

function localFrameRefinementRequest(
  input: unknown,
): PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementRequestV2 {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ArrayBuffer.isView(input))
    throw new TypeError('Local-frame refinement request must be one exact plain object.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch {
    throw new TypeError('Local-frame refinement request could not be inspected safely.');
  }
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError('Local-frame refinement request must use a plain object prototype.');
  const expected = ['expectedGeneration', 'schemaVersion', 'writerFrameReceipt'];
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== 'string' || !expected.includes(key))
  )
    throw new TypeError(
      'Local-frame refinement request has missing, hidden, symbol, or unexpected fields.',
    );
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new TypeError(
        `Local-frame refinement request ${key} must be one enumerable data property.`,
      );
  }
  if (
    descriptors.schemaVersion!.value !==
      PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_REQUEST_V2 ||
    !Number.isSafeInteger(descriptors.expectedGeneration!.value) ||
    descriptors.expectedGeneration!.value < 1
  )
    throw new TypeError('Local-frame refinement request values are invalid.');
  return Object.freeze({
    schemaVersion:
      PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_REQUEST_V2,
    expectedGeneration: descriptors.expectedGeneration!.value as number,
    writerFrameReceipt: snapshotLocalFrameReceipt(descriptors.writerFrameReceipt!.value),
  });
}

function localFrameRefinementBlocked(
  generation: number,
  code: PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementBlockerCodeV2,
  detail: string,
  options: Readonly<{
    localFramePreflight?: PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2 | null;
    receiptPresented?: boolean;
    preflightIntegrated?: boolean;
    refinementConsumed?: boolean;
  }> = {},
): PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementResultV2 {
  return Object.freeze({
    ok: false as const,
    schemaVersion:
      PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_RESULT_V2,
    generation,
    localFramePreflight: options.localFramePreflight ?? null,
    composerV3Snapshot: null,
    savedLocalFrameComposerSnapshot: null,
    blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]) as readonly [
      Readonly<{ code: typeof code; detail: string }>,
    ],
    claims: Object.freeze({
      savedWriterFrameReceiptPresented: options.receiptPresented ?? false,
      localFramePreflightV2Integrated: options.preflightIntegrated ?? false,
      globalOriginGeometryCompatibilityRequired: false as const,
      exactCanonicalMediumLocalGeometryRequired: true as const,
      liveComposerV2OwnerStayedPrivate: true as const,
      composerV2RefinementCapabilityConsumed: options.refinementConsumed ?? false,
      composerV3RefinementIntegrated: false as const,
      composerV3OwnerPrivatelyRetained: false as const,
      canonical580v912tTopologyParityEstablished: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    }),
  });
}

function claims(
  savedIngressImplementation: PatternImportDxfProductSavedGarmentMeshCompileClaimsV1['savedIngressImplementation'],
  progress: Partial<PatternImportDxfProductSavedGarmentMeshCompileClaimsV1> = {},
): PatternImportDxfProductSavedGarmentMeshCompileClaimsV1 {
  return Object.freeze({
    savedIngressImplementation,
    savedSourceOwnerConsumedByIngress: false,
    composerV2Executed: false,
    genuineComposerOwnerValidated: false,
    composerOwnerPrivatelyRetained: false,
    staleComposerOwnerRetainedAfterNewAttempt: false as const,
    callerReceivesMutableMeshCopiesOnly: true as const,
    tableOwnsPhysicalMesh: false as const,
    physicalPackageCompiled: false as const,
    solverRuntimeImported: false as const,
    staticPreviewAuthority: false as const,
    placementAuthority: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
    ...progress,
  });
}

function blocked(
  generation: number,
  code: PatternImportDxfProductSavedGarmentMeshCompileBlockerCodeV1,
  detail: string,
  savedIngressImplementation: PatternImportDxfProductSavedGarmentMeshCompileClaimsV1['savedIngressImplementation'],
  progress: Partial<PatternImportDxfProductSavedGarmentMeshCompileClaimsV1> = {},
): PatternImportDxfProductSavedGarmentMeshCompileResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_RESULT_V1,
    generation,
    ingressReport: null,
    composerSnapshot: null,
    blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]) as readonly [
      Readonly<{ code: typeof code; detail: string }>,
    ],
    claims: claims(savedIngressImplementation, progress),
  });
}

function refinedCapabilityInfrastructureBlocked<TResult>(
  generation: number,
  code: PatternImportDxfProductSavedRefinedCapabilityInfrastructureBlockerCodeV1,
  detail: string,
): PatternImportDxfProductSavedRefinedCapabilityAdvanceResultV1<TResult> {
  return Object.freeze({
    ok: false as const,
    generation,
    blocker: Object.freeze({ code, detail: detail.slice(0, 2_048) }),
  });
}

/**
 * Cloth-owned saved-row sink. The Assembly table only invokes `consume`; the genuine Composer V2
 * owner never leaves this session. A new verified handoff first revokes the previous candidate so a
 * failed recompilation cannot leave a stale garment projected as current.
 */
export function createPatternImportDxfProductSavedGarmentMeshCompileSessionV1<
  TCapabilityInput = never,
  TCapabilityResult = never,
  TCapabilityOwner extends object = object,
  TCapabilityProjection = never,
>(
  options: Readonly<{
    buildIngress?: PatternImportDxfProductSavedGarmentMeshIngressBuilderV1;
    refinedCapability?: PatternImportDxfProductSavedRefinedCapabilityV1<
      TCapabilityInput,
      TCapabilityResult,
      TCapabilityOwner,
      TCapabilityProjection
    >;
  }> = {},
) {
  const buildIngress =
    options.buildIngress ?? buildPatternImportDxfProductSavedGarmentMeshIngressV1;
  const savedIngressImplementation = options.buildIngress
    ? ('injected-test-seam' as const)
    : ('production-default' as const);
  const savedSourceOwnerConsumedByIngress = savedIngressImplementation === 'production-default';
  const refinedCapability = options.refinedCapability;
  let disposed = false;
  let running = false;
  let generation = 0;
  let status: SessionStatus = 'idle';
  let currentOwner: PatternImportDxfProductGarmentMeshComposerOwnerV2 | null = null;
  let currentSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2 | null = null;
  let currentSavedRow: DxfProductSavedRowIdentityV1 | null = null;
  let currentCompositionRequest:
    | PatternImportDxfProductSavedGarmentMeshIngressRequestV1['compositionRequest']
    | null = null;
  let currentRefinedOwner: PatternImportDxfProductGarmentMeshComposerOwnerV3 | null = null;
  let currentRefinedSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV3 | null = null;
  let currentRefinementResult: Extract<
    PatternImportDxfProductSavedCanonicalMediumRefinementResultV1,
    { ok: true }
  > | null = null;
  let currentLocalFrameRefinementResult: Extract<
    PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementResultV2,
    { ok: true }
  > | null = null;
  let currentLocalFrameReceiptCanonical: string | null = null;
  let currentCapabilityOwner: TCapabilityOwner | null = null;

  const revokeCapability = () => {
    if (currentCapabilityOwner && refinedCapability)
      refinedCapability.dispose(currentCapabilityOwner);
    currentCapabilityOwner = null;
  };

  const revokeCurrent = () => {
    revokeCapability();
    if (currentRefinedOwner) {
      if (currentLocalFrameRefinementResult)
        disposePatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(currentRefinedOwner);
      else disposePatternImportDxfProductGarmentMeshComposerV3(currentRefinedOwner);
    } else if (currentOwner) {
      disposePatternImportDxfProductGarmentMeshComposerV2(currentOwner);
    }
    currentRefinedOwner = null;
    currentRefinedSnapshot = null;
    currentRefinementResult = null;
    currentLocalFrameRefinementResult = null;
    currentLocalFrameReceiptCanonical = null;
    currentOwner = null;
    currentSnapshot = null;
    currentSavedRow = null;
    currentCompositionRequest = null;
  };

  const deriveLatestSavedWriterFrameReceipt = async (
    expectedGeneration: number,
    signal?: AbortSignal,
  ): Promise<PatternImportDxfProductSavedWriterFrameSessionReceiptResultV1> => {
    const refuse = (
      code: Extract<
        PatternImportDxfProductSavedWriterFrameSessionReceiptResultV1,
        { ok: false }
      >['blocker']['code'],
      detail: string,
    ): PatternImportDxfProductSavedWriterFrameSessionReceiptResultV1 =>
      Object.freeze({
        ok: false as const,
        generation,
        receipt: null,
        blocker: Object.freeze({ code, detail }),
      });
    if (disposed)
      return refuse('session-disposed', 'The saved garment compile session is disposed.');
    if (running)
      return refuse('session-busy', 'A saved garment session operation is already running.');
    if (signal?.aborted)
      return refuse('session-cancelled', 'Writer-frame receipt derivation was cancelled.');
    if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration <= 0)
      return refuse('invalid-input', 'A positive exact saved generation is required.');
    if (expectedGeneration !== generation)
      return refuse(
        'stale-generation',
        'Writer-frame receipt requested for a different saved generation.',
      );
    if (
      (status !== 'ready' && status !== 'refined') ||
      !currentOwner ||
      !currentCompositionRequest ||
      !currentSavedRow ||
      savedIngressImplementation !== 'production-default'
    )
      return refuse(
        'session-not-ready',
        'A current saved Composer V2 and composition are required.',
      );
    const ownerAtStart = currentOwner;
    const compositionAtStart = currentCompositionRequest;
    const rowAtStart = currentSavedRow;
    running = true;
    try {
      const result = await buildPatternImportDxfProductSavedWriterFrameReceiptV1({
        composerV2Owner: ownerAtStart,
        compositionRequest: compositionAtStart,
        savedRow: rowAtStart,
      });
      if (disposed)
        return refuse('session-disposed', 'Session was disposed during receipt derivation.');
      if (signal?.aborted)
        return refuse('session-cancelled', 'Receipt derivation was cancelled before publication.');
      if (
        generation !== expectedGeneration ||
        currentOwner !== ownerAtStart ||
        currentCompositionRequest !== compositionAtStart ||
        currentSavedRow !== rowAtStart
      )
        return refuse('stale-generation', 'Saved source changed during receipt derivation.');
      return Object.freeze({ ...result, generation });
    } finally {
      running = false;
    }
  };

  const buildLatestConfirmedPlacementSidecar = async (
    input: PatternImportDxfProductSavedConfirmedPlacementRequestV1,
    signal?: AbortSignal,
  ): Promise<PatternImportDxfProductSavedConfirmedPlacementResultV1> => {
    const refuse = (
      code: PatternImportDxfProductConfirmedAnnularBlockerCodeV1,
      detail: string,
    ): PatternImportDxfProductSavedConfirmedPlacementResultV1 =>
      Object.freeze({
        ok: false,
        generation,
        owner: null,
        blocker: Object.freeze({ code, detail }),
      });
    if (disposed)
      return refuse('session-disposed', 'The saved garment compile session is disposed.');
    if (running)
      return refuse('session-busy', 'A saved garment session operation is already running.');
    if (signal?.aborted) return refuse('session-cancelled', 'Placement authoring was cancelled.');
    try {
      const keys = [
        'expectedGeneration',
        'confirmed',
        'garment',
        'body',
        'policy',
        'annularParameters',
        'bodyIntent',
        'operation',
        'readCurrentEvidence',
      ];
      if (!input || Object.getPrototypeOf(input) !== Object.prototype)
        return refuse('invalid-input', 'Placement authoring requires one plain request.');
      const fields = Object.getOwnPropertyDescriptors(input);
      if (
        Reflect.ownKeys(fields).length !== keys.length ||
        keys.some((key) => !fields[key]?.enumerable || !('value' in fields[key]!))
      )
        return refuse('invalid-input', 'Placement authoring requires exact own data fields.');
    } catch {
      return refuse('invalid-input', 'Placement authoring request could not be read safely.');
    }
    if (!Number.isSafeInteger(input.expectedGeneration) || input.expectedGeneration <= 0)
      return refuse('invalid-input', 'A positive exact saved generation is required.');
    const { expectedGeneration, ...request } = input;
    if (expectedGeneration !== generation)
      return refuse(
        'stale-generation',
        'Placement authoring requested for a different saved generation.',
      );
    if (
      (status !== 'ready' && status !== 'refined') ||
      !currentOwner ||
      !currentCompositionRequest ||
      !currentSavedRow ||
      savedIngressImplementation !== 'production-default'
    )
      return refuse(
        'session-not-ready',
        'A current genuine saved Composer V2 and source row are required.',
      );
    const ownerAtStart = currentOwner;
    const compositionAtStart = currentCompositionRequest;
    const rowAtStart = currentSavedRow;
    running = true;
    try {
      const result = await buildPatternImportDxfProductConfirmedAnnularIntentV1(
        {
          composerV2Owner: ownerAtStart,
          compositionRequest: compositionAtStart,
          savedRow: rowAtStart,
          request,
        },
        signal,
      );
      if (disposed)
        return refuse('session-disposed', 'Session was disposed during placement authoring.');
      if (signal?.aborted)
        return refuse('session-cancelled', 'Placement authoring was cancelled before publication.');
      if (
        generation !== expectedGeneration ||
        currentOwner !== ownerAtStart ||
        currentCompositionRequest !== compositionAtStart ||
        currentSavedRow !== rowAtStart
      )
        return refuse('stale-generation', 'Saved source changed during placement authoring.');
      return Object.freeze({ ...result, generation });
    } finally {
      running = false;
    }
  };

  const consume = async (
    input: PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
    signal?: AbortSignal,
  ): Promise<PatternImportDxfProductSavedGarmentMeshCompileResultV1> => {
    if (disposed)
      return blocked(
        generation,
        'session-disposed',
        'The saved garment compile session is disposed.',
        savedIngressImplementation,
      );
    if (running)
      return blocked(
        generation,
        'session-busy',
        'A saved garment compilation is already running.',
        savedIngressImplementation,
      );
    if (signal?.aborted)
      return blocked(
        generation,
        'session-cancelled',
        'The saved garment compilation was cancelled before source handoff.',
        savedIngressImplementation,
      );

    running = true;
    generation += 1;
    const attempt = generation;
    status = 'compiling';
    revokeCurrent();
    let candidate: PatternImportDxfProductGarmentMeshComposerOwnerV2 | null = null;
    try {
      const ingress = await buildIngress(input);
      if (disposed) {
        status = 'disposed';
        return blocked(
          attempt,
          'session-disposed',
          'The saved garment compile session was disposed during ingress.',
          savedIngressImplementation,
        );
      }
      if (signal?.aborted) {
        status = 'blocked';
        return blocked(
          attempt,
          'session-cancelled',
          'The saved garment compilation was cancelled after source handoff.',
          savedIngressImplementation,
        );
      }
      if (!ingress.ok) {
        status = 'blocked';
        return blocked(
          attempt,
          'saved-ingress-blocked',
          `${ingress.blockers[0].code}: ${ingress.blockers[0].detail}`,
          savedIngressImplementation,
          {
            savedSourceOwnerConsumedByIngress:
              savedIngressImplementation === 'production-default' &&
              ingress.claims.savedSourceOwnerConsumedOnce === true,
          },
        );
      }

      const composed = await buildPatternImportDxfProductGarmentMeshComposerV2(ingress.request);
      if (composed.ok) candidate = composed.owner;
      if (disposed) {
        status = 'disposed';
        return blocked(
          attempt,
          'session-disposed',
          'The saved garment compile session was disposed during Composer V2 execution.',
          savedIngressImplementation,
          { savedSourceOwnerConsumedByIngress, composerV2Executed: true },
        );
      }
      if (signal?.aborted) {
        status = 'blocked';
        return blocked(
          attempt,
          'session-cancelled',
          'The saved garment compilation was cancelled during Composer V2 execution.',
          savedIngressImplementation,
          { savedSourceOwnerConsumedByIngress, composerV2Executed: true },
        );
      }
      if (!composed.ok) {
        status = 'blocked';
        return blocked(
          attempt,
          'composer-blocked',
          `${composed.blockers[0].code}: ${composed.blockers[0].detail}`,
          savedIngressImplementation,
          { savedSourceOwnerConsumedByIngress, composerV2Executed: true },
        );
      }
      const projection = projectPatternImportDxfProductGarmentMeshComposerV2(candidate);
      if (
        !projection ||
        projection.composerCanonicalSha256 !== composed.snapshot.seal.canonicalSha256 ||
        projection.phase2ArtifactSha256 !== composed.snapshot.seals.phase2ArtifactSha256 ||
        projection.mesh.restPositions2Mm.length / 2 !== composed.snapshot.mesh.vertexCount ||
        projection.mesh.triangles.length / 3 !== composed.snapshot.mesh.triangleCount
      ) {
        status = 'blocked';
        return blocked(
          attempt,
          'composer-owner-invalid',
          'Composer V2 did not publish an exact projectable owner for its sealed snapshot.',
          savedIngressImplementation,
          { savedSourceOwnerConsumedByIngress, composerV2Executed: true },
        );
      }

      currentOwner = candidate;
      candidate = null;
      currentSnapshot = composed.snapshot;
      currentCompositionRequest = ingress.request.compositionRequest;
      currentSavedRow = ingress.sourceRow ? Object.freeze({ ...ingress.sourceRow }) : null;
      status = 'ready';
      return Object.freeze({
        ok: true as const,
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_RESULT_V1,
        generation: attempt,
        ingressReport: ingress.report,
        composerSnapshot: composed.snapshot,
        blockers: Object.freeze([]) as readonly [],
        claims: claims(savedIngressImplementation, {
          savedSourceOwnerConsumedByIngress,
          composerV2Executed: true,
          genuineComposerOwnerValidated: true,
          composerOwnerPrivatelyRetained: true,
        }),
      });
    } catch (error) {
      status = disposed ? 'disposed' : 'blocked';
      return blocked(
        attempt,
        disposed ? 'session-disposed' : signal?.aborted ? 'session-cancelled' : 'composer-blocked',
        disposed
          ? 'The saved garment compile session was disposed during compilation.'
          : signal?.aborted
            ? 'The saved garment compilation was cancelled.'
            : error instanceof Error
              ? `Saved garment compilation failed closed: ${error.message}`
              : 'Saved garment compilation failed closed.',
        savedIngressImplementation,
      );
    } finally {
      if (candidate) disposePatternImportDxfProductGarmentMeshComposerV2(candidate);
      running = false;
    }
  };

  const advanceCanonicalMediumRefinement = async (
    input: unknown,
    signal?: AbortSignal,
  ): Promise<PatternImportDxfProductSavedCanonicalMediumRefinementResultV1> => {
    if (disposed) {
      return refinementBlocked(
        generation,
        'session-disposed',
        'The saved garment compile session is disposed.',
      );
    }
    if (running) {
      return refinementBlocked(
        generation,
        'session-busy',
        'The saved garment compile session is already running an exclusive operation.',
      );
    }
    let request: PatternImportDxfProductSavedCanonicalMediumRefinementRequestV1;
    try {
      request = refinementRequest(input);
    } catch (error) {
      return refinementBlocked(
        generation,
        'invalid-input',
        error instanceof Error ? error.message : 'The refinement request is invalid.',
      );
    }
    if (request.expectedGeneration !== generation) {
      return refinementBlocked(
        generation,
        'stale-generation',
        `Expected generation ${String(request.expectedGeneration)} differs from current generation ${String(generation)}.`,
      );
    }
    if (signal?.aborted) {
      return refinementBlocked(
        generation,
        'session-cancelled',
        'Canonical-medium refinement was cancelled before preflight.',
      );
    }
    if (status === 'refined' && currentRefinementResult && currentRefinedOwner) {
      const projection = projectPatternImportDxfProductGarmentMeshComposerV3(currentRefinedOwner);
      if (
        projection &&
        projection.composerCanonicalSha256 ===
          currentRefinementResult.composerV3Snapshot.seal.canonicalSha256
      ) {
        return currentRefinementResult;
      }
      revokeCurrent();
      status = 'blocked';
      return refinementBlocked(
        generation,
        'composer-v3-owner-invalid',
        'The privately retained refined owner became unavailable.',
        {
          detachedComposerPreflightEvaluated: true,
          composerV2RefinementCapabilityConsumed: true,
        },
      );
    }
    if (status !== 'ready' || !currentOwner || !currentSnapshot) {
      return refinementBlocked(
        generation,
        'session-not-ready',
        'A ready privately retained Composer V2 owner is required before refinement.',
      );
    }

    running = true;
    status = 'refining';
    const ownerAtStart = currentOwner;
    const snapshotAtStart = currentSnapshot;
    let candidate: PatternImportDxfProductGarmentMeshComposerOwnerV3 | null = null;
    let preflightReport: PatternImportDxfProductSavedCanonicalMediumPlacementPreflightReportV1 | null =
      null;
    try {
      const projection = projectPatternImportDxfProductGarmentMeshComposerV2(ownerAtStart);
      if (!projection) {
        revokeCurrent();
        status = 'blocked';
        return refinementBlocked(
          generation,
          'canonical-medium-preflight-blocked',
          'The privately retained Composer V2 owner could not be projected for preflight.',
        );
      }
      const preflight = evaluatePatternImportDxfProductSavedCanonicalMediumPlacementPreflightV1({
        schemaVersion:
          PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_REQUEST_V1,
        composerSnapshot: snapshotAtStart,
        projection,
      });
      if (!preflight.ok) {
        revokeCurrent();
        status = 'blocked';
        return refinementBlocked(
          generation,
          'canonical-medium-preflight-blocked',
          `${preflight.blocker.code}: ${preflight.blocker.detail}`,
        );
      }
      preflightReport = preflight.report;
      if (preflight.report.status !== 'canonical-medium-geometry-compatible') {
        status = 'ready';
        return refinementBlocked(
          generation,
          'canonical-medium-geometry-incompatible',
          preflight.report.mismatchReasons.join(', ') ||
            'The saved garment is not the exact canonical-medium annular geometry.',
          {
            preflight: preflight.report,
            detachedComposerPreflightEvaluated: true,
          },
        );
      }
      if (signal?.aborted) {
        status = 'ready';
        return refinementBlocked(
          generation,
          'session-cancelled',
          'Canonical-medium refinement was cancelled after preflight.',
          {
            preflight: preflight.report,
            detachedComposerPreflightEvaluated: true,
          },
        );
      }

      const refined = await buildPatternImportDxfProductGarmentMeshComposerV3({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V3,
        composerV2Owner: ownerAtStart,
      });
      if (refined.ok) candidate = refined.owner;

      if (
        disposed ||
        signal?.aborted ||
        generation !== request.expectedGeneration ||
        currentOwner !== ownerAtStart ||
        currentSnapshot !== snapshotAtStart
      ) {
        if (candidate) {
          disposePatternImportDxfProductGarmentMeshComposerV3(candidate);
          candidate = null;
          currentOwner = null;
          currentSnapshot = null;
        } else if (currentOwner === ownerAtStart) {
          revokeCurrent();
        }
        if (!disposed) status = 'blocked';
        return refinementBlocked(
          generation,
          disposed
            ? 'session-disposed'
            : signal?.aborted
              ? 'session-cancelled'
              : 'stale-generation',
          disposed
            ? 'The saved garment compile session was disposed during refinement.'
            : signal?.aborted
              ? 'Canonical-medium refinement was cancelled during refinement.'
              : 'The saved garment generation changed during refinement.',
          {
            preflight: preflight.report,
            detachedComposerPreflightEvaluated: true,
            composerV2RefinementCapabilityConsumed: true,
          },
        );
      }
      if (!refined.ok) {
        revokeCurrent();
        status = 'blocked';
        return refinementBlocked(
          generation,
          'composer-v3-blocked',
          `${refined.blockers[0].code}: ${refined.blockers[0].detail}`,
          {
            preflight: preflight.report,
            detachedComposerPreflightEvaluated: true,
            composerV2RefinementCapabilityConsumed: true,
          },
        );
      }
      const refinedProjection = projectPatternImportDxfProductGarmentMeshComposerV3(candidate);
      if (
        !refinedProjection ||
        refined.snapshot.bindings.composerV2CanonicalSha256 !==
          snapshotAtStart.seal.canonicalSha256 ||
        refinedProjection.composerV2CanonicalSha256 !== snapshotAtStart.seal.canonicalSha256 ||
        refinedProjection.phase2ArtifactSha256 !== snapshotAtStart.seals.phase2ArtifactSha256 ||
        refinedProjection.composerCanonicalSha256 !== refined.snapshot.seal.canonicalSha256 ||
        refinedProjection.mesh.restPositions2Mm.length / 2 !== refined.snapshot.mesh.vertexCount ||
        refinedProjection.mesh.triangles.length / 3 !== refined.snapshot.mesh.triangleCount
      ) {
        disposePatternImportDxfProductGarmentMeshComposerV3(candidate);
        candidate = null;
        currentOwner = null;
        currentSnapshot = null;
        status = 'blocked';
        return refinementBlocked(
          generation,
          'composer-v3-owner-invalid',
          'Composer V3 did not publish an exact projectable owner for the retained V2 source.',
          {
            preflight: preflight.report,
            detachedComposerPreflightEvaluated: true,
            composerV2RefinementCapabilityConsumed: true,
          },
        );
      }
      const success = Object.freeze({
        ok: true as const,
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_RESULT_V1,
        generation,
        preflight: preflight.report,
        composerV3Snapshot: refined.snapshot,
        blockers: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_BLOCKERS_V1,
        claims: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_REFINEMENT_CLAIMS_V1,
      });
      currentRefinedOwner = candidate;
      candidate = null;
      currentRefinedSnapshot = refined.snapshot;
      currentRefinementResult = success;
      status = 'refined';
      return success;
    } catch (error) {
      if (currentOwner === ownerAtStart) revokeCurrent();
      if (!disposed) status = 'blocked';
      return refinementBlocked(
        generation,
        'composer-v3-blocked',
        error instanceof Error
          ? `Canonical-medium refinement failed closed: ${error.message}`
          : 'Canonical-medium refinement failed closed.',
        {
          preflight: preflightReport,
          detachedComposerPreflightEvaluated: preflightReport !== null,
          composerV2RefinementCapabilityConsumed: preflightReport !== null,
        },
      );
    } finally {
      if (candidate) {
        disposePatternImportDxfProductGarmentMeshComposerV3(candidate);
        if (currentOwner === ownerAtStart) {
          currentOwner = null;
          currentSnapshot = null;
        }
      }
      running = false;
    }
  };

  const advanceCanonicalMediumLocalFrameRefinement = async (
    input: unknown,
    signal?: AbortSignal,
  ): Promise<PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementResultV2> => {
    if (disposed)
      return localFrameRefinementBlocked(
        generation,
        'session-disposed',
        'The saved garment compile session is disposed.',
      );
    if (running)
      return localFrameRefinementBlocked(
        generation,
        'session-busy',
        'The saved garment compile session is already running an exclusive operation.',
      );
    let request: PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementRequestV2;
    let requestReceiptCanonical: string;
    try {
      request = localFrameRefinementRequest(input);
      requestReceiptCanonical = canonicalLocalFrameReceiptData(request.writerFrameReceipt);
    } catch (error) {
      return localFrameRefinementBlocked(
        generation,
        'invalid-input',
        error instanceof Error ? error.message : 'The local-frame refinement request is invalid.',
      );
    }
    if (request.expectedGeneration !== generation)
      return localFrameRefinementBlocked(
        generation,
        'stale-generation',
        `Expected generation ${String(request.expectedGeneration)} differs from current generation ${String(generation)}.`,
        { receiptPresented: true },
      );
    if (signal?.aborted)
      return localFrameRefinementBlocked(
        generation,
        'session-cancelled',
        'Local-frame refinement was cancelled before preflight.',
        { receiptPresented: true },
      );
    if (status === 'refined' && currentLocalFrameRefinementResult && currentRefinedOwner) {
      if (
        currentLocalFrameReceiptCanonical === null ||
        requestReceiptCanonical !== currentLocalFrameReceiptCanonical
      )
        return localFrameRefinementBlocked(
          generation,
          'writer-frame-binding-mismatch',
          'The repeated local-frame request differs from the receipt bound to this refined owner.',
          {
            receiptPresented: true,
            preflightIntegrated: true,
            refinementConsumed: false,
          },
        );
      const projection = projectPatternImportDxfProductGarmentMeshComposerV3(currentRefinedOwner);
      const savedProjection =
        projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(currentRefinedOwner);
      if (
        projection &&
        savedProjection &&
        projection.composerCanonicalSha256 ===
          currentLocalFrameRefinementResult.composerV3Snapshot.seal.canonicalSha256 &&
        savedProjection.snapshot.seal.canonicalSha256 ===
          currentLocalFrameRefinementResult.savedLocalFrameComposerSnapshot.seal.canonicalSha256
      )
        return currentLocalFrameRefinementResult;
      revokeCurrent();
      status = 'blocked';
      return localFrameRefinementBlocked(
        generation,
        'composer-v3-owner-invalid',
        'The privately retained local-frame refined owner became unavailable.',
        {
          receiptPresented: true,
          preflightIntegrated: true,
          refinementConsumed: true,
        },
      );
    }
    if (status !== 'ready' || !currentOwner || !currentSnapshot || !currentCompositionRequest)
      return localFrameRefinementBlocked(
        generation,
        'session-not-ready',
        'A ready privately retained Composer V2 owner is required before local-frame refinement.',
        { receiptPresented: true },
      );

    running = true;
    status = 'refining';
    const ownerAtStart = currentOwner;
    const snapshotAtStart = currentSnapshot;
    const compositionRequestAtStart = currentCompositionRequest;
    let candidate: PatternImportDxfProductGarmentMeshComposerOwnerV3 | null = null;
    let localFrameReport: PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2 | null =
      null;
    try {
      const projection = projectPatternImportDxfProductGarmentMeshComposerV2(ownerAtStart);
      if (!projection) {
        revokeCurrent();
        status = 'blocked';
        return localFrameRefinementBlocked(
          generation,
          'local-frame-preflight-blocked',
          'The privately retained Composer V2 owner could not be projected for local-frame preflight.',
          { receiptPresented: true },
        );
      }
      const localFrame = evaluatePatternImportDxfProductSavedAnnularLocalFramePreflightV2({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2,
        composerSnapshot: snapshotAtStart,
        projection,
        writerFrameReceipt: request.writerFrameReceipt,
      });
      if (!localFrame.ok) {
        revokeCurrent();
        status = 'blocked';
        return localFrameRefinementBlocked(
          generation,
          'local-frame-preflight-blocked',
          `${localFrame.blocker.code}: ${localFrame.blocker.detail}`,
          { receiptPresented: true },
        );
      }
      localFrameReport = localFrame.report;
      if (
        localFrame.report.origin !== 'verified-saved-row' ||
        localFrame.report.status !== 'canonical-medium-local-geometry-compatible' ||
        localFrame.report.mismatchReasons.length !== 0
      ) {
        status = 'ready';
        return localFrameRefinementBlocked(
          generation,
          'local-frame-geometry-incompatible',
          localFrame.report.mismatchReasons.join(', ') ||
            'The saved garment is not exact canonical-medium geometry in its persisted writer frame.',
          {
            localFramePreflight: localFrame.report,
            receiptPresented: true,
            preflightIntegrated: true,
          },
        );
      }
      if (signal?.aborted) {
        status = 'ready';
        return localFrameRefinementBlocked(
          generation,
          'session-cancelled',
          'Local-frame refinement was cancelled after preflight.',
          {
            localFramePreflight: localFrame.report,
            receiptPresented: true,
            preflightIntegrated: true,
          },
        );
      }

      const refined = await buildPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2({
        schemaVersion:
          PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_REQUEST_V2,
        composerV2Owner: ownerAtStart,
        compositionRequest: compositionRequestAtStart,
        writerFrameReceipt: request.writerFrameReceipt,
      });
      if (refined.ok) candidate = refined.owner;
      if (
        disposed ||
        signal?.aborted ||
        generation !== request.expectedGeneration ||
        currentOwner !== ownerAtStart ||
        currentSnapshot !== snapshotAtStart ||
        currentCompositionRequest !== compositionRequestAtStart
      ) {
        if (candidate) {
          disposePatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(candidate);
          candidate = null;
          currentOwner = null;
          currentSnapshot = null;
          currentCompositionRequest = null;
        } else if (currentOwner === ownerAtStart) revokeCurrent();
        if (!disposed) status = 'blocked';
        return localFrameRefinementBlocked(
          generation,
          disposed
            ? 'session-disposed'
            : signal?.aborted
              ? 'session-cancelled'
              : 'stale-generation',
          disposed
            ? 'The saved garment compile session was disposed during local-frame refinement.'
            : signal?.aborted
              ? 'Local-frame refinement was cancelled during Composer V3 execution.'
              : 'The saved garment generation changed during local-frame refinement.',
          {
            localFramePreflight: localFrame.report,
            receiptPresented: true,
            preflightIntegrated: true,
            refinementConsumed: true,
          },
        );
      }
      if (!refined.ok) {
        revokeCurrent();
        status = 'blocked';
        return localFrameRefinementBlocked(
          generation,
          'composer-v3-blocked',
          `${refined.blockers[0].code}: ${refined.blockers[0].detail}`,
          {
            localFramePreflight: localFrame.report,
            receiptPresented: true,
            preflightIntegrated: true,
            refinementConsumed: true,
          },
        );
      }
      const refinedProjection = projectPatternImportDxfProductGarmentMeshComposerV3(candidate);
      const savedLocalFrameProjection =
        projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(candidate);
      const composerV3Snapshot = refined.owner.snapshot;
      if (
        !refinedProjection ||
        !savedLocalFrameProjection ||
        refined.snapshot.bindings.composerV2CanonicalSha256 !==
          snapshotAtStart.seal.canonicalSha256 ||
        savedLocalFrameProjection.snapshot.seal.canonicalSha256 !==
          refined.snapshot.seal.canonicalSha256 ||
        savedLocalFrameProjection.snapshot.bindings.composerV3CanonicalSha256 !==
          composerV3Snapshot.seal.canonicalSha256 ||
        refinedProjection.composerV2CanonicalSha256 !== snapshotAtStart.seal.canonicalSha256 ||
        refinedProjection.phase2ArtifactSha256 !== snapshotAtStart.seals.phase2ArtifactSha256 ||
        refinedProjection.composerCanonicalSha256 !== composerV3Snapshot.seal.canonicalSha256 ||
        refinedProjection.mesh.restPositions2Mm.length / 2 !== 580 ||
        refinedProjection.mesh.triangles.length / 3 !== 912 ||
        composerV3Snapshot.mesh.vertexCount !== 580 ||
        composerV3Snapshot.mesh.interiorVertexCount !== 336 ||
        composerV3Snapshot.mesh.triangleCount !== 912 ||
        composerV3Snapshot.mesh.seamPairCount !== 34
      ) {
        disposePatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(candidate);
        candidate = null;
        currentOwner = null;
        currentSnapshot = null;
        currentCompositionRequest = null;
        status = 'blocked';
        return localFrameRefinementBlocked(
          generation,
          'composer-v3-owner-invalid',
          'Composer V3 did not publish an exact projectable owner for the local-frame-qualified V2 source.',
          {
            localFramePreflight: localFrame.report,
            receiptPresented: true,
            preflightIntegrated: true,
            refinementConsumed: true,
          },
        );
      }
      const success = Object.freeze({
        ok: true as const,
        schemaVersion:
          PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_RESULT_V2,
        generation,
        localFramePreflight: localFrame.report,
        closedIntegrationBlockers: Object.freeze([
          'cloth-session-local-frame-preflight-v2-not-integrated',
        ] as const),
        composerV3Snapshot,
        savedLocalFrameComposerSnapshot: refined.snapshot,
        blockers:
          PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_BLOCKERS_V2,
        claims: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_CLAIMS_V2,
      });
      currentRefinedOwner = candidate;
      candidate = null;
      currentRefinedSnapshot = composerV3Snapshot;
      currentLocalFrameRefinementResult = success;
      currentLocalFrameReceiptCanonical = requestReceiptCanonical;
      status = 'refined';
      return success;
    } catch (error) {
      if (currentOwner === ownerAtStart) revokeCurrent();
      if (!disposed) status = 'blocked';
      return localFrameRefinementBlocked(
        generation,
        'composer-v3-blocked',
        error instanceof Error
          ? `Local-frame refinement failed closed: ${error.message}`
          : 'Local-frame refinement failed closed.',
        {
          localFramePreflight: localFrameReport,
          receiptPresented: true,
          preflightIntegrated: localFrameReport !== null,
          refinementConsumed: localFrameReport !== null,
        },
      );
    } finally {
      if (candidate) {
        disposePatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(candidate);
        if (currentOwner === ownerAtStart) {
          currentOwner = null;
          currentSnapshot = null;
          currentCompositionRequest = null;
        }
      }
      running = false;
    }
  };

  const advanceCanonicalMediumRefinedCapability = async (
    expectedGeneration: number,
    input: TCapabilityInput,
    signal?: AbortSignal,
  ): Promise<PatternImportDxfProductSavedRefinedCapabilityAdvanceResultV1<TCapabilityResult>> => {
    if (disposed)
      return refinedCapabilityInfrastructureBlocked(
        generation,
        'session-disposed',
        'The saved garment compile session is disposed.',
      );
    if (running)
      return refinedCapabilityInfrastructureBlocked(
        generation,
        'session-busy',
        'The saved garment compile session is already running an exclusive operation.',
      );
    if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 1)
      return refinedCapabilityInfrastructureBlocked(
        generation,
        'invalid-expected-generation',
        'The refined capability expectedGeneration must be a positive safe integer.',
      );
    if (expectedGeneration !== generation)
      return refinedCapabilityInfrastructureBlocked(
        generation,
        'stale-generation',
        `Expected generation ${String(expectedGeneration)} differs from current generation ${String(generation)}.`,
      );
    if (signal?.aborted)
      return refinedCapabilityInfrastructureBlocked(
        generation,
        'session-cancelled',
        'The refined capability was cancelled before owner handoff.',
      );
    if (!refinedCapability)
      return refinedCapabilityInfrastructureBlocked(
        generation,
        'capability-not-configured',
        'No refined-owner capability was configured for this cloth compile session.',
      );
    if (
      status !== 'refined' ||
      !currentOwner ||
      !currentSnapshot ||
      !currentRefinedOwner ||
      !currentRefinedSnapshot
    )
      return refinedCapabilityInfrastructureBlocked(
        generation,
        'session-not-refined',
        'Privately retained Composer V2 and V3 owners are required before capability handoff.',
      );

    running = true;
    const ownerV2AtStart = currentOwner;
    const snapshotV2AtStart = currentSnapshot;
    const ownerV3AtStart = currentRefinedOwner;
    const snapshotV3AtStart = currentRefinedSnapshot;
    const savedRowAtStart = currentSavedRow;
    const savedRowForCapability = savedRowAtStart ? Object.freeze({ ...savedRowAtStart }) : null;
    revokeCapability();
    let candidate: TCapabilityOwner | null = null;
    try {
      const built = await refinedCapability.build(
        Object.freeze({
          generation,
          input,
          currentSavedRow: savedRowForCapability,
          composerV2Owner: ownerV2AtStart,
          composerV3Owner: ownerV3AtStart,
          composerV2Snapshot: snapshotV2AtStart,
          composerV3Snapshot: snapshotV3AtStart,
        }),
        signal,
      );
      candidate = built.owner;
      if (
        disposed ||
        signal?.aborted ||
        generation !== expectedGeneration ||
        currentOwner !== ownerV2AtStart ||
        currentSnapshot !== snapshotV2AtStart ||
        currentRefinedOwner !== ownerV3AtStart ||
        currentRefinedSnapshot !== snapshotV3AtStart ||
        currentSavedRow !== savedRowAtStart
      ) {
        if (candidate) {
          refinedCapability.dispose(candidate);
          candidate = null;
        }
        return refinedCapabilityInfrastructureBlocked(
          generation,
          disposed
            ? 'session-disposed'
            : signal?.aborted
              ? 'session-cancelled'
              : 'stale-generation',
          disposed
            ? 'The saved garment compile session was disposed during capability handoff.'
            : signal?.aborted
              ? 'The refined capability was cancelled during owner handoff.'
              : 'The saved garment generation changed during capability handoff.',
        );
      }
      if (candidate) {
        const projection = refinedCapability.project(candidate);
        if (!projection) {
          refinedCapability.dispose(candidate);
          candidate = null;
          return refinedCapabilityInfrastructureBlocked(
            generation,
            'capability-owner-invalid',
            'The refined capability did not publish a projectable private owner.',
          );
        }
        currentCapabilityOwner = candidate;
        candidate = null;
      }
      return Object.freeze({
        ok: true as const,
        generation,
        result: built.result,
      });
    } catch (error) {
      return refinedCapabilityInfrastructureBlocked(
        generation,
        'capability-failed',
        error instanceof Error
          ? `The refined capability failed closed: ${error.message}`
          : 'The refined capability failed closed.',
      );
    } finally {
      if (candidate) refinedCapability.dispose(candidate);
      running = false;
    }
  };

  const projectLatest = (): PatternImportDxfProductGarmentMeshComposerProjectionV2 | null => {
    if (
      disposed ||
      running ||
      (status !== 'ready' && status !== 'refined') ||
      !currentOwner ||
      !currentSnapshot
    )
      return null;
    const projection = projectPatternImportDxfProductGarmentMeshComposerV2(currentOwner);
    if (
      !projection ||
      projection.composerCanonicalSha256 !== currentSnapshot.seal.canonicalSha256 ||
      projection.phase2ArtifactSha256 !== currentSnapshot.seals.phase2ArtifactSha256
    ) {
      revokeCurrent();
      status = 'blocked';
      return null;
    }
    return projection;
  };

  const projectLatestRefined =
    (): PatternImportDxfProductGarmentMeshComposerProjectionV3 | null => {
      if (
        disposed ||
        running ||
        status !== 'refined' ||
        !currentRefinedOwner ||
        !currentRefinedSnapshot
      )
        return null;
      const projection = projectPatternImportDxfProductGarmentMeshComposerV3(currentRefinedOwner);
      if (
        !projection ||
        projection.composerCanonicalSha256 !== currentRefinedSnapshot.seal.canonicalSha256 ||
        projection.composerV2CanonicalSha256 !==
          currentRefinedSnapshot.bindings.composerV2CanonicalSha256 ||
        projection.refinedArtifactSha256 !== currentRefinedSnapshot.bindings.refinedArtifactSha256
      ) {
        revokeCurrent();
        status = 'blocked';
        return null;
      }
      return projection;
    };

  const projectLatestRefinedCapability = (): TCapabilityProjection | null => {
    if (
      disposed ||
      running ||
      status !== 'refined' ||
      !refinedCapability ||
      !currentCapabilityOwner
    )
      return null;
    const projection = refinedCapability.project(currentCapabilityOwner);
    if (!projection) {
      revokeCapability();
      return null;
    }
    return projection;
  };

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_COMPILE_SESSION_V1,
    consume,
    deriveLatestSavedWriterFrameReceipt,
    buildLatestConfirmedPlacementSidecar,
    advanceCanonicalMediumRefinement,
    advanceCanonicalMediumLocalFrameRefinement,
    advanceCanonicalMediumRefinedCapability,
    projectLatest,
    projectLatestRefined,
    projectLatestRefinedCapability,
    dispose() {
      if (disposed) return;
      disposed = true;
      status = 'disposed';
      revokeCurrent();
    },
    snapshot() {
      return Object.freeze({
        disposed,
        running,
        generation,
        status,
        composerCanonicalSha256: currentSnapshot?.seal.canonicalSha256 ?? null,
        phase2ArtifactSha256: currentSnapshot?.seals.phase2ArtifactSha256 ?? null,
        composerV3CanonicalSha256: currentRefinedSnapshot?.seal.canonicalSha256 ?? null,
        refinedArtifactSha256: currentRefinedSnapshot?.bindings.refinedArtifactSha256 ?? null,
      });
    },
  });
}
