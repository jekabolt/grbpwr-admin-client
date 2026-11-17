import {
  createPatternImportDxfProductSavedGarmentMeshCompileSessionV1,
  type PatternImportDxfProductSavedRefinedCapabilityInfrastructureBlockerCodeV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-compile-session-v1';
import type { PatternImportDxfProductGarmentMeshComposerOwnerV3 } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v3';
import type { PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';
import { buildPatternImportDxfProductSavedPlacementAuthoredInputV1 } from './pattern-import-dxf-product-saved-placement-authored-input-v1';

import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_REQUEST_V2,
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_HANDOFF_REQUEST_V2,
  buildPatternImportDxfProductSavedCanonicalMediumActualBodyBridgeV2,
  buildPatternImportDxfProductSavedCanonicalMediumActualBodyRuntimeSourceHandoffV2,
  disposePatternImportDxfProductSavedCanonicalMediumActualBodyBridgeV2,
  projectPatternImportDxfProductSavedCanonicalMediumActualBodyBridgeV2,
  type PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2,
  type PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeProjectionV2,
  type PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2,
  type PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeSnapshotV2,
  type PatternImportDxfProductSavedActualBodyInputV2,
} from './pattern-import-dxf-product-saved-canonical-medium-actual-body-bridge-v2';
import { disposeBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1 } from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';
import {
  BETA_SKIRT_CANONICAL_MEDIUM_SAVED_RUNTIME_SOURCE_REQUEST_V1,
  buildBetaSkirtCanonicalMediumSavedRuntimeSourceV1,
  disposeBetaSkirtCanonicalMediumSavedRuntimeSourceV1,
  type BetaSkirtCanonicalMediumSavedRuntimeSourceResultV1,
} from './beta-skirt-canonical-medium-saved-runtime-source-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_SESSION_V2 =
  'pattern-import-dxf-product-saved-canonical-medium-actual-body-session/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_SESSION_REQUEST_V2 =
  'pattern-import-dxf-product-saved-canonical-medium-actual-body-session-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_SESSION_RESULT_V2 =
  'pattern-import-dxf-product-saved-canonical-medium-actual-body-session-result/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_SESSION_REQUEST_V2 =
  'pattern-import-dxf-product-saved-canonical-medium-actual-body-runtime-source-session-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_VERIFIED_PLACEMENT_ACTUAL_BODY_REQUEST_V1 =
  'pattern-import-dxf-product-saved-verified-placement-actual-body-request/1' as const;

export type PatternImportDxfProductSavedCanonicalMediumActualBodySessionRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_SESSION_REQUEST_V2;
  expectedGeneration: number;
  compositionRequest: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['compositionRequest'];
  writerFrameReceipt: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['writerFrameReceipt'];
  authored: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['authored'];
}> &
  PatternImportDxfProductSavedActualBodyInputV2;

export type PatternImportDxfProductSavedCanonicalMediumActualBodyRuntimeSourceSessionRequestV2 =
  Readonly<{
    schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_SESSION_REQUEST_V2;
    expectedGeneration: number;
  }>;

export type PatternImportDxfProductSavedVerifiedPlacementActualBodyRequestV1 = Omit<
  PatternImportDxfProductSavedCanonicalMediumActualBodySessionRequestV2,
  'schemaVersion' | 'authored' | 'mannequin' | 'canonicalDisplayedBodyOwner'
> &
  PatternImportDxfProductSavedActualBodyInputV2 &
  Readonly<{
    schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_VERIFIED_PLACEMENT_ACTUAL_BODY_REQUEST_V1;
    placementReadOwner: PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2;
  }>;

const objectFreeze = Object.freeze;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectPrototype = Object.prototype;
const arrayIsArray = Array.isArray;
const arrayBufferIsView = ArrayBuffer.isView;
const numberIsSafeInteger = Number.isSafeInteger;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const CapturedWeakMap = WeakMap;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const weakMapDelete = WeakMap.prototype.delete;
const stringSlice = String.prototype.slice;

export type PatternImportDxfProductSavedCanonicalMediumRuntimeSourceIssuanceStateV2 =
  | 'available'
  | 'issuing'
  | 'issued'
  | 'invalidated';

export type PatternImportDxfProductSavedCanonicalMediumRuntimeSourceTransferV2<T> = Readonly<{
  value: T;
  ownershipTransferred: boolean;
  terminalWithoutTransfer?: boolean;
  rollbackTransferredOwnership: () => void;
}>;

/**
 * One-shot issuance gate used by the session capability. A successful value is caller-owned and
 * survives later invalidation; a value produced after abort/staleness is rolled back exactly once.
 */
export function createPatternImportDxfProductSavedCanonicalMediumRuntimeSourceIssuanceV2<T>() {
  let state: PatternImportDxfProductSavedCanonicalMediumRuntimeSourceIssuanceStateV2 = 'available';
  let revision = 0;

  const issue = async (
    build: () => Promise<PatternImportDxfProductSavedCanonicalMediumRuntimeSourceTransferV2<T>>,
    isCurrent: () => boolean,
    signal?: AbortSignal,
  ): Promise<T> => {
    if (signal?.aborted)
      throw new DOMException('Runtime-source issuance was cancelled.', 'AbortError');
    if (state !== 'available')
      throw new TypeError('Runtime-source issuance is already running, issued, or invalidated.');
    state = 'issuing';
    revision += 1;
    const ticket = revision;
    let attempt: PatternImportDxfProductSavedCanonicalMediumRuntimeSourceTransferV2<T> | null =
      null;
    let rolledBack = false;
    const rollback = () => {
      if (!attempt?.ownershipTransferred || rolledBack) return;
      rolledBack = true;
      attempt.rollbackTransferredOwnership();
    };
    try {
      attempt = await build();
      const current = isCurrent();
      if (signal?.aborted || state !== 'issuing' || revision !== ticket || !current) {
        rollback();
        const aborted = signal?.aborted === true;
        if (state === 'issuing' && revision === ticket)
          state = aborted ? 'available' : 'invalidated';
        if (aborted) throw new DOMException('Runtime-source issuance was cancelled.', 'AbortError');
        throw new TypeError('Runtime-source issuance became stale before ownership transfer.');
      }
      if (!attempt.ownershipTransferred) {
        state = attempt.terminalWithoutTransfer ? 'invalidated' : 'available';
        return attempt.value;
      }
      state = 'issued';
      return attempt.value;
    } catch (error) {
      if (attempt?.ownershipTransferred && state !== 'issued') rollback();
      if (state === 'issuing' && revision === ticket) state = 'available';
      throw error;
    }
  };

  return objectFreeze({
    issue,
    invalidate() {
      if (state === 'issued' || state === 'invalidated') return;
      revision += 1;
      state = 'invalidated';
    },
    snapshot() {
      return objectFreeze({ state, revision });
    },
  });
}

const SUCCESS_CLAIMS = objectFreeze({
  explicitAuthoredSemanticsPresented: true,
  genuineSavedWriterReplayAndLocalFrameIntegrated: true,
  persistedWrittenPieceApexConsumed: true,
  savedGeometryReplayAndSourcePathAuthenticityEstablished: true,
  liveComposerAndBridgeOwnersStayedPrivate: true,
  actualBodyBridgeIntegrated: true,
  actualBodyContactDiagnosticEvaluated: true,
  selfOrientationQualified: true,
  seamPinQualified: true,
  sourceAdmissionQualified: true,
  productionAuthoredGarmentSemanticAuthorityEstablished: false,
  placementAuthority: false,
  collisionAuthority: false,
  initializationAuthority: false,
  runtimeAuthority: false,
  productionAuthority: false,
} as const);

type SessionBlockerCode =
  | 'session-disposed'
  | 'session-busy'
  | 'session-not-refined'
  | 'session-cancelled'
  | 'stale-generation'
  | 'invalid-input'
  | 'runtime-source-generation-consumed'
  | 'actual-body-bridge-blocked'
  | 'actual-body-input-invalidated'
  | 'actual-body-bridge-owner-invalid';

export type PatternImportDxfProductSavedCanonicalMediumActualBodySessionResultV2 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_SESSION_RESULT_V2;
      generation: number;
      snapshot: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeSnapshotV2;
      blockers: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeSnapshotV2['blockers'];
      claims: typeof SUCCESS_CLAIMS;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_SESSION_RESULT_V2;
      generation: number;
      snapshot: null;
      blockers: readonly [Readonly<{ code: SessionBlockerCode; detail: string }>];
      claims: Readonly<{
        explicitAuthoredSemanticsPresented: boolean;
        genuineSavedWriterReplayAndLocalFrameIntegrated: false;
        persistedWrittenPieceApexConsumed: false;
        savedGeometryReplayAndSourcePathAuthenticityEstablished: false;
        liveComposerAndBridgeOwnersStayedPrivate: true;
        actualBodyBridgeIntegrated: false;
        actualBodyContactDiagnosticEvaluated: false;
        selfOrientationQualified: false;
        seamPinQualified: false;
        sourceAdmissionQualified: false;
        productionAuthoredGarmentSemanticAuthorityEstablished: false;
        placementAuthority: false;
        collisionAuthority: false;
        initializationAuthority: false;
        runtimeAuthority: false;
        productionAuthority: false;
      }>;
    }>;

type CapabilityInput = Readonly<{
  compositionRequest: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['compositionRequest'];
  writerFrameReceipt: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['writerFrameReceipt'];
  bodyInput: PatternImportDxfProductSavedActualBodyInputV2;
}> &
  (
    | Readonly<{
        authored: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['authored'];
      }>
    | Readonly<{
        placementReadOwner: PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2;
      }>
  );

type CapabilityResult =
  | Readonly<{
      ok: true;
      snapshot: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeSnapshotV2;
    }>
  | Readonly<{ ok: false; code: string; detail: string }>;

function exactRecord(
  input: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (!input || typeof input !== 'object' || arrayIsArray(input) || arrayBufferIsView(input))
    throw new TypeError(`${label} must be one exact plain object.`);
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
  if (keys.length !== expectedKeys.length)
    throw new TypeError(`${label} has missing or unexpected fields.`);
  for (const key of keys) {
    if (typeof key !== 'string') throw new TypeError(`${label} contains a symbol field.`);
  }
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new TypeError(`${label} ${key} must be enumerable data.`);
  }
  const record: Record<string, unknown> = {};
  for (const key of expectedKeys) record[key] = descriptors[key]!.value;
  return objectFreeze(record);
}

function request(
  input: unknown,
):
  | PatternImportDxfProductSavedCanonicalMediumActualBodySessionRequestV2
  | PatternImportDxfProductSavedVerifiedPlacementActualBodyRequestV1 {
  const schemaDescriptor =
    input && typeof input === 'object'
      ? objectGetOwnPropertyDescriptor(input, 'schemaVersion')
      : undefined;
  const restored =
    schemaDescriptor &&
    'value' in schemaDescriptor &&
    schemaDescriptor.value ===
      PATTERN_IMPORT_DXF_PRODUCT_SAVED_VERIFIED_PLACEMENT_ACTUAL_BODY_REQUEST_V1;
  const bodyKey =
    input &&
    typeof input === 'object' &&
    objectGetOwnPropertyDescriptor(input, 'canonicalDisplayedBodyOwner')
      ? 'canonicalDisplayedBodyOwner'
      : 'mannequin';
  const record = exactRecord(
    input,
    [
      restored ? 'placementReadOwner' : 'authored',
      'compositionRequest',
      'expectedGeneration',
      bodyKey,
      'schemaVersion',
      'writerFrameReceipt',
    ],
    'Actual-body session V2 request',
  );
  if (
    record.schemaVersion !==
      (restored
        ? PATTERN_IMPORT_DXF_PRODUCT_SAVED_VERIFIED_PLACEMENT_ACTUAL_BODY_REQUEST_V1
        : PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_SESSION_REQUEST_V2) ||
    !numberIsSafeInteger(record.expectedGeneration) ||
    (record.expectedGeneration as number) < 1
  )
    throw new TypeError('Actual-body session V2 request values are invalid.');
  const common = {
    expectedGeneration: record.expectedGeneration as number,
    compositionRequest:
      record.compositionRequest as PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['compositionRequest'],
    writerFrameReceipt:
      record.writerFrameReceipt as PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['writerFrameReceipt'],
    ...((bodyKey === 'canonicalDisplayedBodyOwner'
      ? { canonicalDisplayedBodyOwner: record[bodyKey] }
      : { mannequin: record[bodyKey] }) as PatternImportDxfProductSavedActualBodyInputV2),
  };
  return restored
    ? objectFreeze({
        ...common,
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_VERIFIED_PLACEMENT_ACTUAL_BODY_REQUEST_V1,
        placementReadOwner:
          record.placementReadOwner as PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2,
      })
    : objectFreeze({
        ...common,
        schemaVersion:
          PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_SESSION_REQUEST_V2,
        authored:
          record.authored as PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeRequestV2['authored'],
      });
}

function runtimeRequest(
  input: unknown,
): PatternImportDxfProductSavedCanonicalMediumActualBodyRuntimeSourceSessionRequestV2 {
  const record = exactRecord(
    input,
    ['expectedGeneration', 'schemaVersion'],
    'Actual-body runtime-source session request',
  );
  if (
    record.schemaVersion !==
      PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_SESSION_REQUEST_V2 ||
    !numberIsSafeInteger(record.expectedGeneration) ||
    (record.expectedGeneration as number) < 1
  )
    throw new TypeError('Actual-body runtime-source session request values are invalid.');
  return objectFreeze({
    schemaVersion:
      PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_SESSION_REQUEST_V2,
    expectedGeneration: record.expectedGeneration as number,
  });
}

function blocked(
  generation: number,
  code: SessionBlockerCode,
  detail: string,
  explicitAuthoredSemanticsPresented = false,
): PatternImportDxfProductSavedCanonicalMediumActualBodySessionResultV2 {
  return objectFreeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_SESSION_RESULT_V2,
    generation,
    snapshot: null,
    blockers: objectFreeze([
      objectFreeze({
        code,
        detail: reflectApply(stringSlice, detail, [0, 2_048]) as string,
      }),
    ]) as readonly [Readonly<{ code: typeof code; detail: string }>],
    claims: objectFreeze({
      explicitAuthoredSemanticsPresented,
      genuineSavedWriterReplayAndLocalFrameIntegrated: false as const,
      persistedWrittenPieceApexConsumed: false as const,
      savedGeometryReplayAndSourcePathAuthenticityEstablished: false as const,
      liveComposerAndBridgeOwnersStayedPrivate: true as const,
      actualBodyBridgeIntegrated: false as const,
      actualBodyContactDiagnosticEvaluated: false as const,
      selfOrientationQualified: false as const,
      seamPinQualified: false as const,
      sourceAdmissionQualified: false as const,
      productionAuthoredGarmentSemanticAuthorityEstablished: false as const,
      placementAuthority: false as const,
      collisionAuthority: false as const,
      initializationAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    }),
  });
}

function infrastructureCode(
  code: PatternImportDxfProductSavedRefinedCapabilityInfrastructureBlockerCodeV1,
): SessionBlockerCode {
  if (code === 'invalid-expected-generation') return 'invalid-input';
  if (code === 'capability-owner-invalid') return 'actual-body-bridge-owner-invalid';
  if (code === 'capability-not-configured' || code === 'capability-failed')
    return 'actual-body-bridge-blocked';
  return code;
}

/**
 * Production-default saved compile/reprocess session. Composer V2/V3 and the actual-body bridge
 * stay private; callers receive detached projections and may request only the narrow runtime-source
 * capability.
 */
export function createPatternImportDxfProductSavedCanonicalMediumActualBodySessionV2() {
  let currentBridgeOwner: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2 | null =
    null;
  let currentComposerV3Owner: PatternImportDxfProductGarmentMeshComposerOwnerV3 | null = null;
  const pendingComposerV3Owners = new CapturedWeakMap<
    PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2,
    PatternImportDxfProductGarmentMeshComposerOwnerV3
  >();
  let runtimeSourceIssuance =
    createPatternImportDxfProductSavedCanonicalMediumRuntimeSourceIssuanceV2<BetaSkirtCanonicalMediumSavedRuntimeSourceResultV1>();
  let runtimeSourceBridgeOwner: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2 | null =
    null;
  let runtimeSourceConsumedGeneration: number | null = null;
  let actualBodyInputEpoch = 0;

  const bindRuntimeSourceIssuance = (
    owner: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2,
  ) => {
    if (runtimeSourceBridgeOwner === owner) return;
    runtimeSourceIssuance.invalidate();
    runtimeSourceIssuance =
      createPatternImportDxfProductSavedCanonicalMediumRuntimeSourceIssuanceV2<BetaSkirtCanonicalMediumSavedRuntimeSourceResultV1>();
    runtimeSourceBridgeOwner = owner;
  };

  const invalidateRuntimeSourceIssuance = (
    owner?: PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2,
  ) => {
    if (owner && runtimeSourceBridgeOwner !== owner) return;
    runtimeSourceIssuance.invalidate();
    runtimeSourceBridgeOwner = null;
  };

  const session = createPatternImportDxfProductSavedGarmentMeshCompileSessionV1<
    CapabilityInput,
    CapabilityResult,
    PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeOwnerV2,
    PatternImportDxfProductSavedCanonicalMediumActualBodyBridgeProjectionV2
  >({
    refinedCapability: objectFreeze({
      async build(context, signal) {
        const authored =
          'placementReadOwner' in context.input
            ? await buildPatternImportDxfProductSavedPlacementAuthoredInputV1({
                placementReadOwner: context.input.placementReadOwner,
                composerOwner: context.composerV2Owner,
                ...context.input.bodyInput,
              })
            : { ok: true as const, authored: context.input.authored };
        if (!authored.ok)
          return objectFreeze({
            owner: null,
            result: objectFreeze({
              ok: false as const,
              code: authored.code,
              detail: authored.detail,
            }),
          });
        const bridge = await buildPatternImportDxfProductSavedCanonicalMediumActualBodyBridgeV2(
          {
            schemaVersion:
              PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_BRIDGE_REQUEST_V2,
            expected: {
              composerV2CanonicalSha256: context.composerV2Snapshot.seal.canonicalSha256,
              composerV3CanonicalSha256: context.composerV3Snapshot.seal.canonicalSha256,
              phase2ArtifactSha256: context.composerV2Snapshot.seals.phase2ArtifactSha256,
              refinedArtifactSha256: context.composerV3Snapshot.bindings.refinedArtifactSha256,
            },
            composerV2Owner: context.composerV2Owner,
            composerV3Owner: context.composerV3Owner,
            compositionRequest: context.input.compositionRequest,
            writerFrameReceipt: context.input.writerFrameReceipt,
            authored: authored.authored,
            ...context.input.bodyInput,
          },
          signal,
        );
        if (!bridge.ok)
          return objectFreeze({
            owner: null,
            result: objectFreeze({
              ok: false as const,
              code: bridge.blockers[0].code,
              detail: bridge.blockers[0].detail,
            }),
          });
        reflectApply(weakMapSet, pendingComposerV3Owners, [bridge.owner, context.composerV3Owner]);
        return objectFreeze({
          owner: bridge.owner,
          result: objectFreeze({ ok: true as const, snapshot: bridge.snapshot }),
        });
      },
      project(owner) {
        const projection =
          projectPatternImportDxfProductSavedCanonicalMediumActualBodyBridgeV2(owner);
        const composerV3Owner = reflectApply(weakMapGet, pendingComposerV3Owners, [owner]) as
          | PatternImportDxfProductGarmentMeshComposerOwnerV3
          | undefined;
        if (!projection || !composerV3Owner) return null;
        bindRuntimeSourceIssuance(owner);
        currentBridgeOwner = owner;
        currentComposerV3Owner = composerV3Owner;
        return projection;
      },
      dispose(owner) {
        reflectApply(weakMapDelete, pendingComposerV3Owners, [owner]);
        invalidateRuntimeSourceIssuance(owner);
        if (currentBridgeOwner === owner) {
          currentBridgeOwner = null;
          currentComposerV3Owner = null;
        }
        return disposePatternImportDxfProductSavedCanonicalMediumActualBodyBridgeV2(owner);
      },
    }),
  });

  const invalidateActualBody = (expectedGeneration: number): boolean => {
    const state = session.snapshot();
    if (state.disposed || expectedGeneration < 1 || state.generation !== expectedGeneration)
      return false;
    actualBodyInputEpoch += 1;
    const changed = Boolean(
      currentBridgeOwner || state.running || runtimeSourceIssuance.snapshot().state === 'issuing',
    );
    const bridge = currentBridgeOwner;
    invalidateRuntimeSourceIssuance();
    currentBridgeOwner = null;
    currentComposerV3Owner = null;
    if (bridge) {
      reflectApply(weakMapDelete, pendingComposerV3Owners, [bridge]);
      disposePatternImportDxfProductSavedCanonicalMediumActualBodyBridgeV2(bridge);
      // The generic session drops its now-revoked capability, retaining the compiled/local mesh.
      session.projectLatestRefinedCapability();
    }
    return changed;
  };

  const advanceCanonicalMediumActualBody = async (
    input: unknown,
    signal?: AbortSignal,
  ): Promise<PatternImportDxfProductSavedCanonicalMediumActualBodySessionResultV2> => {
    let parsed: ReturnType<typeof request>;
    try {
      parsed = request(input);
    } catch (error) {
      return blocked(
        session.snapshot().generation,
        'invalid-input',
        error instanceof Error ? error.message : 'Actual-body session V2 request is invalid.',
      );
    }
    const beforeAdvance = session.snapshot();
    const beforeAdvanceIssuance = runtimeSourceIssuance.snapshot();
    if (
      !beforeAdvance.disposed &&
      beforeAdvance.generation === parsed.expectedGeneration &&
      beforeAdvanceIssuance.state === 'issuing'
    )
      return blocked(
        beforeAdvance.generation,
        'session-busy',
        'This session generation is issuing its one-shot runtime source.',
        true,
      );
    if (
      !beforeAdvance.disposed &&
      beforeAdvance.generation === parsed.expectedGeneration &&
      runtimeSourceConsumedGeneration === parsed.expectedGeneration
    )
      return blocked(
        beforeAdvance.generation,
        'runtime-source-generation-consumed',
        'This session generation already consumed its one-shot runtime-source handoff.',
        true,
      );
    const inputEpoch = actualBodyInputEpoch;
    const advanced = await session.advanceCanonicalMediumRefinedCapability(
      parsed.expectedGeneration,
      objectFreeze({
        compositionRequest: parsed.compositionRequest,
        writerFrameReceipt: parsed.writerFrameReceipt,
        ...('placementReadOwner' in parsed
          ? { placementReadOwner: parsed.placementReadOwner }
          : { authored: parsed.authored }),
        bodyInput:
          'canonicalDisplayedBodyOwner' in parsed
            ? { canonicalDisplayedBodyOwner: parsed.canonicalDisplayedBodyOwner! }
            : { mannequin: parsed.mannequin },
      }),
      signal,
    );
    if (inputEpoch !== actualBodyInputEpoch) {
      invalidateActualBody(parsed.expectedGeneration);
      return blocked(
        parsed.expectedGeneration,
        'actual-body-input-invalidated',
        'Placement or displayed body changed while actual-body qualification was running.',
        true,
      );
    }
    if (!advanced.ok)
      return blocked(
        advanced.generation,
        infrastructureCode(advanced.blocker.code),
        advanced.blocker.detail,
        true,
      );
    if (!advanced.result.ok)
      return blocked(
        advanced.generation,
        'actual-body-bridge-blocked',
        `${advanced.result.code}: ${advanced.result.detail}`,
        true,
      );
    const projection = session.projectLatestRefinedCapability();
    const snapshot = advanced.result.snapshot;
    if (
      !projection ||
      projection.snapshot.seal.canonicalSha256 !== snapshot.seal.canonicalSha256 ||
      projection.snapshot.bindings.composerV2CanonicalSha256 !==
        snapshot.bindings.composerV2CanonicalSha256 ||
      projection.snapshot.bindings.composerV3CanonicalSha256 !==
        snapshot.bindings.composerV3CanonicalSha256 ||
      projection.snapshot.bindings.phase2ArtifactSha256 !==
        snapshot.bindings.phase2ArtifactSha256 ||
      projection.snapshot.bindings.refinedArtifactSha256 !==
        snapshot.bindings.refinedArtifactSha256 ||
      !currentBridgeOwner ||
      !currentComposerV3Owner
    )
      return blocked(
        advanced.generation,
        'actual-body-bridge-owner-invalid',
        'The privately retained actual-body bridge V2 owner lost an exact upstream binding.',
        true,
      );
    return objectFreeze({
      ok: true as const,
      schemaVersion:
        PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_SESSION_RESULT_V2,
      generation: advanced.generation,
      snapshot,
      blockers: snapshot.blockers,
      claims: SUCCESS_CLAIMS,
    });
  };

  const buildLatestRuntimeSource = async (input: unknown, signal?: AbortSignal) => {
    const state = session.snapshot();
    let parsed: PatternImportDxfProductSavedCanonicalMediumActualBodyRuntimeSourceSessionRequestV2;
    try {
      parsed = runtimeRequest(input);
    } catch (error) {
      throw new TypeError(
        error instanceof Error ? error.message : 'Runtime-source session request is invalid.',
      );
    }
    if (
      parsed.expectedGeneration !== state.generation ||
      state.disposed ||
      state.running ||
      state.status !== 'refined' ||
      !currentBridgeOwner ||
      !currentComposerV3Owner
    )
      throw new TypeError(
        'A matching live refined actual-body session generation is required for runtime handoff.',
      );
    const owner = currentBridgeOwner;
    const composerV3Owner = currentComposerV3Owner;
    const issuanceAtStart = runtimeSourceIssuance;
    if (runtimeSourceBridgeOwner !== owner)
      throw new TypeError('The refined actual-body owner has no live runtime issuance capability.');
    let bridgeRuntimeSourceConsumed = false;
    try {
      const issued = await issuanceAtStart.issue(
        async () => {
          const base =
            await buildPatternImportDxfProductSavedCanonicalMediumActualBodyRuntimeSourceHandoffV2(
              owner,
              {
                schemaVersion:
                  PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_HANDOFF_REQUEST_V2,
                expected: {
                  actualBodyBridgeCanonicalSha256: owner.snapshot.seal.canonicalSha256,
                  composerV3CanonicalSha256: owner.snapshot.bindings.composerV3CanonicalSha256,
                  phase2ArtifactSha256: owner.snapshot.bindings.phase2ArtifactSha256,
                  refinedArtifactSha256: owner.snapshot.bindings.refinedArtifactSha256,
                },
                composerV3Owner,
              },
              signal,
            );
          if (!base.ok)
            throw new TypeError(`Base runtime-source handoff failed: ${base.code}: ${base.detail}`);
          bridgeRuntimeSourceConsumed = true;
          runtimeSourceConsumedGeneration = parsed.expectedGeneration;
          const wrapped = await (async () => {
            try {
              return await buildBetaSkirtCanonicalMediumSavedRuntimeSourceV1(
                {
                  schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_RUNTIME_SOURCE_REQUEST_V1,
                  expectedGeneration: parsed.expectedGeneration,
                  expected: {
                    actualBodyBridgeCanonicalSha256: owner.snapshot.seal.canonicalSha256,
                    savedPlacementCanonicalSha256:
                      owner.snapshot.bindings.savedPlacementCanonicalSha256,
                    runtimeSourceCanonicalSha256: base.report.seal.canonicalSha256,
                  },
                  actualBodyBridgeOwner: owner,
                  runtimeSourceOwner: base.owner,
                },
                signal,
              );
            } catch (error) {
              disposeBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(base.owner);
              throw error;
            }
          })();
          if (!wrapped.ok) disposeBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(base.owner);
          return objectFreeze({
            value: wrapped,
            ownershipTransferred: wrapped.ownershipTransferred,
            terminalWithoutTransfer: !wrapped.ok,
            rollbackTransferredOwnership() {
              if (wrapped.ok) disposeBetaSkirtCanonicalMediumSavedRuntimeSourceV1(wrapped.owner);
            },
          });
        },
        () => {
          const refreshed = session.snapshot();
          return (
            !refreshed.disposed &&
            !refreshed.running &&
            refreshed.status === 'refined' &&
            refreshed.generation === parsed.expectedGeneration &&
            currentBridgeOwner === owner &&
            currentComposerV3Owner === composerV3Owner &&
            runtimeSourceBridgeOwner === owner &&
            runtimeSourceIssuance === issuanceAtStart
          );
        },
        signal,
      );
      return issued;
    } catch (error) {
      if (bridgeRuntimeSourceConsumed) issuanceAtStart.invalidate();
      throw error;
    }
  };

  const dispose = () => {
    invalidateRuntimeSourceIssuance();
    session.dispose();
  };

  return objectFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_SESSION_V2,
    consume: session.consume,
    deriveLatestSavedWriterFrameReceipt: session.deriveLatestSavedWriterFrameReceipt,
    buildLatestConfirmedPlacementSidecar: session.buildLatestConfirmedPlacementSidecar,
    advanceCanonicalMediumRefinement: session.advanceCanonicalMediumLocalFrameRefinement,
    advanceCanonicalMediumLocalFrameRefinement: session.advanceCanonicalMediumLocalFrameRefinement,
    advanceCanonicalMediumActualBody,
    invalidateActualBody,
    buildLatestRuntimeSource,
    runtimeSourceConsumed: () => runtimeSourceConsumedGeneration === session.snapshot().generation,
    projectLatest: session.projectLatest,
    projectLatestRefined: session.projectLatestRefined,
    projectLatestActualBody: session.projectLatestRefinedCapability,
    dispose,
    snapshot: session.snapshot,
  });
}
