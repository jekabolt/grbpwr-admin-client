import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_REQUEST_V2,
  createPatternImportDxfProductSavedGarmentMeshCompileSessionV1,
  type PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementResultV2,
  type PatternImportDxfProductSavedGarmentMeshCompileResultV1,
  type PatternImportDxfProductSavedRefinedCapabilityContextV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-compile-session-v1';
import type { PatternImportDxfProductSavedGarmentMeshIngressRequestV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import type { PatternImportDxfProductSavedAnnularWriterFrameReceiptV2 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-local-frame-preflight-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1,
  buildPatternImportDxfProductSavedAnnularGarmentV1,
  disposePatternImportDxfProductSavedAnnularGarmentV1,
  getPatternImportDxfProductSavedAnnularGarmentLifetimeV1,
  projectPatternImportDxfProductSavedAnnularGarmentV1,
  type PatternImportDxfProductSavedAnnularGarmentOwnerV1,
  type PatternImportDxfProductSavedAnnularGarmentProjectionV1,
  type PatternImportDxfProductSavedAnnularGarmentReportV1,
  type PatternImportDxfProductSavedAnnularGarmentRequestV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-garment-v1';
import type {
  SavedModelDisplayedTriangleBodyOwnerV2,
  SavedModelDisplayedTriangleBodyBindingV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import type { BetaSkirtSavedAnnularDisplayedBodyProductPlacementResultV1 } from './beta-skirt-saved-annular-displayed-body-product-placement-v1';

import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_V1,
  buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1,
  disposePatternImportDxfProductSavedAnnularObservedPlacementGarmentV1,
  getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1,
  projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentOwnerV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentReportV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentRequestV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import type { BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementResultV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';

import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
  buildDxfProductTwoPanelSkirtGarmentSemanticsV1,
  getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1,
  disposeDxfProductTwoPanelSkirtGarmentSemanticsV1,
  type DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1,
  type DxfProductTwoPanelSkirtGarmentSemanticsRequestV1,
} from 'lib/cloth/domain/dxf-product-two-panel-skirt-garment-semantics-v1';
import {
  issueObservedPlacementSidecarV3,
  projectObservedPlacementSidecarIssuedV3,
  getObservedPlacementSidecarIssuedLifetimeV3,
  disposeObservedPlacementSidecarIssuedV3,
  type ObservedPlacementSidecarIssueRequestV3,
  type ObservedPlacementSidecarIssuedOwnerV3,
} from './observed-placement-sidecar-issuer-v3';

import type { BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementOwnerV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import type {
  BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightResultV1,
  BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightOwnerV1,
} from './beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1';
import type { PatternImportDxfProductGarmentMeshComposerProjectionV2 } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import type { BetaSkirtSavedAnnularObservedPlacementRuntimeSourceResultV1 } from './beta-skirt-saved-annular-observed-placement-runtime-source-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_SESSION_V1 =
  'pattern-import-dxf-product-saved-annular-garment-session/1' as const;

const CLAIMS = Object.freeze({
  productionDefaultSavedCompilerUsed: true,
  sourceAndGarmentOwnersStayedPrivate: true,
  bodyOwnerRequired: false,
  bodyTargetConsumed: false,
  worldPlacementAuthority: false,
  runtimeAuthority: false,
} as const);
type CompileSuccess = Extract<PatternImportDxfProductSavedGarmentMeshCompileResultV1, { ok: true }>;
type LocalSuccess = Extract<
  PatternImportDxfProductSavedCanonicalMediumLocalFrameRefinementResultV2,
  { ok: true }
>;
type Stage = 'compile' | 'writer-receipt' | 'local-frame' | 'garment';
type Blocked = Readonly<{
  ok: false;
  generation: number;
  stage: Stage;
  code: string;
  detail: string;
  claims: typeof CLAIMS;
}>;
export type PatternImportDxfProductSavedAnnularGarmentConsumeResultV1 =
  | Readonly<{
      ok: true;
      generation: number;
      compile: CompileSuccess;
      localFrame: LocalSuccess;
      claims: typeof CLAIMS;
    }>
  | Blocked;
export type PatternImportDxfProductSavedAnnularGarmentAdvanceRequestV1 = Readonly<{
  /** Compare-and-swap expectation only. The private compile context supplies actual generation. */
  expectedGeneration: number;
  readCurrentPlacement: PatternImportDxfProductSavedAnnularGarmentRequestV1['readCurrentPlacement'];
}>;
export type PatternImportDxfProductSavedAnnularGarmentAdvanceResultV1 =
  | Readonly<{
      ok: true;
      generation: number;
      report: PatternImportDxfProductSavedAnnularGarmentReportV1;
      claims: typeof CLAIMS;
    }>
  | Blocked;
export type PatternImportDxfProductSavedAnnularGarmentSessionProjectionV1 = Readonly<{
  generation: number;
  projection: PatternImportDxfProductSavedAnnularGarmentProjectionV1;
}>;
export type PatternImportDxfProductSavedAnnularGarmentSessionSnapshotV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_SESSION_V1;
  generation: number;
  disposed: boolean;
  running: boolean;
  status:
    | 'idle'
    | 'compiling'
    | 'local-frame-ready'
    | 'building-garment'
    | 'garment-local-material-qualified'
    | 'garment-local-physical-blocked'
    | 'blocked'
    | 'disposed';
  composerCanonicalSha256: string | null;
  composerV3CanonicalSha256: string | null;
  garmentReportSha256: string | null;
  blocker: Readonly<{ stage: Stage; code: string; detail: string }> | null;
  claims: typeof CLAIMS;
}>;
export type PatternImportDxfProductSavedAnnularGarmentSessionV1 = Readonly<{
  consume: (
    request: PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductSavedAnnularGarmentConsumeResultV1>;
  advanceSavedGarment: (
    request: PatternImportDxfProductSavedAnnularGarmentAdvanceRequestV1,
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductSavedAnnularGarmentAdvanceResultV1>;
  projectLatestGarment: (
    expectedGeneration: number,
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductSavedAnnularGarmentSessionProjectionV1 | null>;
  snapshot: () => PatternImportDxfProductSavedAnnularGarmentSessionSnapshotV1;
  dispose: () => void;
}>;

export type PatternImportDxfProductSavedAnnularGarmentObservedBodyPairRequestV1 = Readonly<{
  expectedGeneration: number;
  displayedBodyOwner: SavedModelDisplayedTriangleBodyOwnerV2;
  displayedBodyBinding: SavedModelDisplayedTriangleBodyBindingV2;
}>;
export type PatternImportDxfProductSavedAnnularGarmentObservedBodyPairResultV1 =
  | (Extract<BetaSkirtSavedAnnularDisplayedBodyProductPlacementResultV1, { ok: true }> &
      Readonly<{ generation: number; sourceContextBound: true }>)
  | (Extract<BetaSkirtSavedAnnularDisplayedBodyProductPlacementResultV1, { ok: false }> &
      Readonly<{
        generation: number;
        /** Only this registry-checked handoff binds generation to the private compiler context. */
        sourceContextBound: boolean;
      }>);
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_SESSION_V1 =
  'pattern-import-dxf-product-saved-annular-observed-placement-garment-session/1' as const;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentAdvanceRequestV1 = Readonly<{
  expectedGeneration: number;
  readCurrentPlacement: PatternImportDxfProductSavedAnnularObservedPlacementGarmentRequestV1['readCurrentPlacement'];
}>;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentAdvanceResultV1 =
  | Readonly<{
      ok: true;
      generation: number;
      report: PatternImportDxfProductSavedAnnularObservedPlacementGarmentReportV1;
      claims: typeof CLAIMS;
    }>
  | Blocked;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentConsumeResultV1 =
  PatternImportDxfProductSavedAnnularGarmentConsumeResultV1;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionProjectionV1 =
  Readonly<{
    generation: number;
    projection: PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1;
  }>;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionSnapshotV1 = Omit<
  PatternImportDxfProductSavedAnnularGarmentSessionSnapshotV1,
  'schemaVersion' | 'status'
> &
  Readonly<{
    schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_SESSION_V1;
    status:
      | PatternImportDxfProductSavedAnnularGarmentSessionSnapshotV1['status']
      | 'building-observed-placement'
      | 'observed-placement-issued';
    issuedPlacementCanonicalSha256: string | null;
  }>;
export type PatternImportDxfProductSavedAnnularObservedPlacementMeshProjectionV1 = Readonly<{
  generation: number;
  /** Detached exact compiler output for authoring spans, never a private mesh owner. */
  projection: PatternImportDxfProductGarmentMeshComposerProjectionV2;
}>;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1 = Readonly<{
  consume: PatternImportDxfProductSavedAnnularGarmentSessionV1['consume'];
  advanceSavedGarment: (
    request: PatternImportDxfProductSavedAnnularObservedPlacementGarmentAdvanceRequestV1,
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductSavedAnnularObservedPlacementGarmentAdvanceResultV1>;
  projectLatestGarment: (
    expectedGeneration: number,
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionProjectionV1 | null>;
  projectLatestMesh: (
    expectedGeneration: number,
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductSavedAnnularObservedPlacementMeshProjectionV1 | null>;
  snapshot: () => PatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionSnapshotV1;
  dispose: () => void;
}>;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairRequestV1 =
  PatternImportDxfProductSavedAnnularGarmentObservedBodyPairRequestV1;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairResultV1 =
  | (Extract<
      BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementResultV1,
      { ok: true }
    > &
      Readonly<{ generation: number; sourceContextBound: true }>)
  | (Extract<
      BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementResultV1,
      { ok: false }
    > &
      Readonly<{ generation: number; sourceContextBound: boolean }>);

/** Explicit first-save intent. The fixed body consumer supplies the two private body fields. */
export type PatternImportDxfProductSavedAnnularObservedPlacementIssueRequestV3 = Readonly<{
  expectedGeneration: number;
  confirmed: true;
  garment: DxfProductTwoPanelSkirtGarmentSemanticsRequestV1['garment'];
  policy: DxfProductTwoPanelSkirtGarmentSemanticsRequestV1['policy'];
  annularParameters: ObservedPlacementSidecarIssueRequestV3['annularParameters'];
  confirmedTargetSha256: string;
  readCurrentEvidence: ObservedPlacementSidecarIssueRequestV3['readCurrentEvidence'];
  displayedBodyOwner: SavedModelDisplayedTriangleBodyOwnerV2;
  displayedBodyBinding: SavedModelDisplayedTriangleBodyBindingV2;
}>;
export type PatternImportDxfProductSavedAnnularObservedPlacementIssueResultV3 =
  | Readonly<{
      ok: true;
      owner: ObservedPlacementSidecarIssuedOwnerV3;
      generation: number;
      sourceContextBound: true;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      generation: number;
      sourceContextBound: boolean;
      code: string;
      detail: string;
    }>;
type IssueRequest = PatternImportDxfProductSavedAnnularObservedPlacementIssueRequestV3;
type IssueResult = PatternImportDxfProductSavedAnnularObservedPlacementIssueResultV3;
const observedPlacementIssuers = new WeakMap<
  object,
  (input: unknown, signal?: AbortSignal) => Promise<IssueResult>
>();
/** The registry partition is checked before reading any supplied request fields. */
export function issuePatternImportDxfProductSavedAnnularObservedPlacementV3(
  session: unknown,
  request: IssueRequest,
  signal?: AbortSignal,
): Promise<IssueResult> {
  const issue =
    session && typeof session === 'object' ? observedPlacementIssuers.get(session) : undefined;
  return issue
    ? issue(request, signal)
    : Promise.resolve(
        issueRefused(
          0,
          false,
          'invalid-saved-garment-session',
          'A genuine observed-placement source session is required.',
        ),
      );
}
function issueRefused(
  generation: number,
  sourceContextBound: boolean,
  code: string,
  detail: string,
): IssueResult {
  return Object.freeze({
    ok: false,
    owner: null,
    generation,
    sourceContextBound,
    code,
    detail: detail.slice(0, 2048),
  });
}
const nativeSignalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
function issueSignalAborted(signal?: AbortSignal): boolean {
  return signal === undefined ? false : Reflect.apply(nativeSignalAborted, signal, []);
}

export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightRequestV1 =
  Readonly<{
    expectedGeneration: number;
    observedPairOwner: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementOwnerV1;
    expectedPairReportSha256: string;
  }>;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightResultV1 =

    | (Extract<
        BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightResultV1,
        { ok: true }
      > &
        Readonly<{ generation: number; sourceContextBound: true }>)
    | (Extract<
        BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightResultV1,
        { ok: false }
      > &
        Readonly<{ generation: number; sourceContextBound: boolean }>);
type WorldRequest =
  PatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightRequestV1;
type WorldResult =
  PatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightResultV1;
type WorldApi =
  typeof import('./beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1');
const observedWorldHandoffs = new WeakMap<
  object,
  (input: unknown, signal?: AbortSignal) => Promise<WorldResult>
>();
/** Session registry authentication precedes all caller field access. */
export function buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentWorldInitialPreflightV1(
  session: unknown,
  request: WorldRequest,
  signal?: AbortSignal,
): Promise<WorldResult> {
  const build =
    session && typeof session === 'object' ? observedWorldHandoffs.get(session) : undefined;
  return build
    ? build(request, signal)
    : Promise.resolve(
        worldRefused(
          0,
          false,
          'invalid-saved-garment-session',
          'A genuine observed-placement source session is required.',
        ),
      );
}
function worldRefused(
  generation: number,
  sourceContextBound: boolean,
  code: string,
  detail: string,
): WorldResult {
  return Object.freeze({
    ok: false,
    owner: null,
    generation,
    sourceContextBound,
    code,
    detail: detail.slice(0, 2048),
  });
}

export type PatternImportDxfProductSavedAnnularObservedPlacementRuntimeSourceRequestV1 = Readonly<{
  expectedGeneration: number;
  observedPairOwner: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementOwnerV1;
  expectedPairReportSha256: string;
  worldInitialOwner: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightOwnerV1;
  expectedWorldReportSha256: string;
}>;
export type PatternImportDxfProductSavedAnnularObservedPlacementRuntimeSourceResultV1 =
  | (Extract<BetaSkirtSavedAnnularObservedPlacementRuntimeSourceResultV1, { ok: true }> &
      Readonly<{ generation: number; sourceContextBound: true }>)
  | (Extract<BetaSkirtSavedAnnularObservedPlacementRuntimeSourceResultV1, { ok: false }> &
      Readonly<{ generation: number; sourceContextBound: boolean }>);
type RuntimeSourceRequest =
  PatternImportDxfProductSavedAnnularObservedPlacementRuntimeSourceRequestV1;
type RuntimeSourceResult =
  PatternImportDxfProductSavedAnnularObservedPlacementRuntimeSourceResultV1;
type RuntimeSourceApi =
  typeof import('./beta-skirt-saved-annular-observed-placement-runtime-source-v1');
const observedRuntimeSourceHandoffs = new WeakMap<
  object,
  (input: unknown, signal?: AbortSignal) => Promise<RuntimeSourceResult>
>();
const observedMeshProjectors = new WeakMap<
  object,
  (
    expectedGeneration: number,
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductSavedAnnularObservedPlacementMeshProjectionV1 | null>
>();

/** Both inputs must have been published by this exact private compiler session. */
export function buildPatternImportDxfProductSavedAnnularObservedPlacementRuntimeSourceV1(
  session: unknown,
  request: RuntimeSourceRequest,
  signal?: AbortSignal,
): Promise<RuntimeSourceResult> {
  const build =
    session && typeof session === 'object' ? observedRuntimeSourceHandoffs.get(session) : undefined;
  return build
    ? build(request, signal)
    : Promise.resolve(
        runtimeSourceRefused(
          0,
          false,
          'invalid-saved-garment-session',
          'A genuine observed-placement source session is required.',
        ),
      );
}
/** The observed session registry supplies a detached projection, never a compiler owner getter. */
export function projectPatternImportDxfProductSavedAnnularObservedPlacementMeshV1(
  session: unknown,
  expectedGeneration: number,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductSavedAnnularObservedPlacementMeshProjectionV1 | null> {
  const project =
    session && typeof session === 'object' ? observedMeshProjectors.get(session) : undefined;
  return project ? project(expectedGeneration, signal) : Promise.resolve(null);
}
function runtimeSourceRefused(
  generation: number,
  sourceContextBound: boolean,
  code: string,
  detail: string,
): RuntimeSourceResult {
  return Object.freeze({
    ok: false,
    owner: null,
    generation,
    sourceContextBound,
    code,
    detail: detail.slice(0, 2048),
  });
}

type Kind = 'legacy' | 'observed';
type GarmentOwner =
  | PatternImportDxfProductSavedAnnularGarmentOwnerV1
  | PatternImportDxfProductSavedAnnularObservedPlacementGarmentOwnerV1;
type AdvanceRequest =
  | PatternImportDxfProductSavedAnnularGarmentAdvanceRequestV1
  | PatternImportDxfProductSavedAnnularObservedPlacementGarmentAdvanceRequestV1;
type AdvanceResult =
  | Readonly<{
      ok: true;
      generation: number;
      report:
        | PatternImportDxfProductSavedAnnularGarmentReportV1
        | PatternImportDxfProductSavedAnnularObservedPlacementGarmentReportV1;
      claims: typeof CLAIMS;
    }>
  | Blocked;
type SessionProjection = Readonly<{
  generation: number;
  projection:
    | PatternImportDxfProductSavedAnnularGarmentProjectionV1
    | PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1;
}>;
type Session =
  | PatternImportDxfProductSavedAnnularGarmentSessionV1
  | PatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1;
type PairRequest = PatternImportDxfProductSavedAnnularGarmentObservedBodyPairRequestV1;
type PairResult =
  | PatternImportDxfProductSavedAnnularGarmentObservedBodyPairResultV1
  | PatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairResultV1;
type DomainPairResult =
  | BetaSkirtSavedAnnularDisplayedBodyProductPlacementResultV1
  | BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementResultV1;
type PairApi = Readonly<{
  build: (input: unknown, signal?: AbortSignal) => Promise<DomainPairResult>;
  dispose: (owner: unknown) => boolean;
  lifetime: (owner: unknown) => AbortSignal | null;
  schemaVersion: string;
  garmentKey: 'savedAnnularGarmentOwner' | 'savedAnnularObservedPlacementGarmentOwner';
}>;
const observedPairHandoffs = new WeakMap<
  object,
  Readonly<{
    kind: Kind;
    build: (input: unknown, signal?: AbortSignal) => Promise<PairResult>;
  }>
>();

/** Authenticate the fixed registry partition before touching caller fields or methods. */
async function dispatchPair(
  session: unknown,
  request: unknown,
  kind: Kind,
  signal?: AbortSignal,
): Promise<PairResult> {
  const handoff =
    session && typeof session === 'object' ? observedPairHandoffs.get(session) : undefined;
  return handoff?.kind === kind
    ? handoff.build(request, signal)
    : pairRefused(
        0,
        false,
        'invalid-saved-garment-session',
        'A genuine private saved garment session is required.',
      );
}
export function buildPatternImportDxfProductSavedAnnularGarmentObservedBodyPairV1(
  session: unknown,
  request: PairRequest,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductSavedAnnularGarmentObservedBodyPairResultV1> {
  return dispatchPair(
    session,
    request,
    'legacy',
    signal,
  ) as Promise<PatternImportDxfProductSavedAnnularGarmentObservedBodyPairResultV1>;
}
export function buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairV1(
  session: unknown,
  request: PairRequest,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairResultV1> {
  return dispatchPair(
    session,
    request,
    'observed',
    signal,
  ) as Promise<PatternImportDxfProductSavedAnnularObservedPlacementGarmentObservedBodyPairResultV1>;
}
async function loadPairApi(kind: Kind): Promise<PairApi> {
  if (kind === 'observed') {
    const api = await import(
      './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1'
    );
    return {
      build: api.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1,
      dispose: api.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1,
      lifetime:
        api.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1,
      schemaVersion:
        api.BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
      garmentKey: 'savedAnnularObservedPlacementGarmentOwner',
    };
  }
  const api = await import('./beta-skirt-saved-annular-displayed-body-product-placement-v1');
  return {
    build: api.buildBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1,
    dispose: api.disposeBetaSkirtSavedAnnularDisplayedBodyProductPlacementV1,
    lifetime: api.getBetaSkirtSavedAnnularDisplayedBodyProductPlacementLifetimeV1,
    schemaVersion: api.BETA_SKIRT_SAVED_ANNULAR_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
    garmentKey: 'savedAnnularGarmentOwner',
  };
}
function pairRefused(
  generation: number,
  sourceContextBound: boolean,
  code: string,
  detail: string,
): PairResult {
  return Object.freeze({
    ok: false,
    owner: null,
    generation,
    sourceContextBound,
    code,
    detail: detail.slice(0, 2_048),
  });
}

type Scope = Readonly<{ controller: AbortController; unlink: () => void }>;
type RetainedSource = Readonly<{
  epoch: number;
  generation: number;
  composerSha: string;
  compositionRequest: PatternImportDxfProductSavedGarmentMeshIngressRequestV1['compositionRequest'];
  receipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
  scope: Scope;
}>;
type CapabilityInput = Readonly<{ source: RetainedSource; scope: Scope }> &
  (
    | Readonly<{
        operation: 'build-garment';
        readCurrentPlacement: AdvanceRequest['readCurrentPlacement'];
      }>
    | Readonly<{ operation: 'issue-observed-placement'; request: IssueRequest }>
  );
type CapabilityResult =
  | Readonly<{ operation: 'build-garment'; value: AdvanceResult }>
  | Readonly<{ operation: 'issue-observed-placement'; value: IssueResult }>;
/** The compiler only sees this private holder. Its borrowed source owners never escape. */
type PrivateCapability = Readonly<{ generation: number; source: RetainedSource; scope: Scope }> &
  (
    | Readonly<{ kind: 'garment'; garment: GarmentOwner }>
    | Readonly<{
        kind: 'observed-placement';
        d0: DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1;
        issued: ObservedPlacementSidecarIssuedOwnerV3;
        unlinkIssued: () => void;
      }>
  );
type IssueInput = Extract<CapabilityInput, { operation: 'issue-observed-placement' }>;

function linkSignals(signals: readonly (AbortSignal | undefined)[], onAbort: () => void): Scope {
  const controller = new AbortController();
  const abort = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    onAbort();
  };
  for (const signal of signals) signal?.addEventListener('abort', abort, { once: true });
  if (signals.some((signal) => signal?.aborted)) abort();
  return {
    controller,
    unlink: () => {
      for (const signal of signals) signal?.removeEventListener('abort', abort);
    },
  };
}
const nativeIssueAdd = EventTarget.prototype.addEventListener;
const nativeIssueRemove = EventTarget.prototype.removeEventListener;
/** New issuer lifetimes never invoke caller-owned signal members. Partial links are removed. */
function linkIssueSignals(
  signals: readonly (AbortSignal | undefined)[],
  onAbort: () => void,
): Scope {
  const controller = new AbortController();
  const linked: AbortSignal[] = [];
  const unlink = () => {
    for (const signal of linked.splice(0))
      Reflect.apply(nativeIssueRemove, signal, ['abort', abort]);
  };
  const abort = () => {
    if (issueSignalAborted(controller.signal)) return;
    controller.abort();
    onAbort();
  };
  try {
    for (const signal of signals) {
      if (signal === undefined) continue;
      issueSignalAborted(signal);
      Reflect.apply(nativeIssueAdd, signal, ['abort', abort, { once: true }]);
      linked.push(signal);
    }
    if (signals.some(issueSignalAborted)) abort();
    return { controller, unlink };
  } catch (error) {
    unlink();
    controller.abort();
    throw error;
  }
}

/** A cancelled handoff stops its own wait; it does not cancel a borrowed owner's fresh read. */
function waitForWorldRead<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (done: () => void) => {
      if (settled) return;
      settled = true;
      Reflect.apply(nativeIssueRemove, signal, ['abort', cancel]);
      done();
    };
    const cancel = () =>
      finish(() => reject(new DOMException('World handoff cancelled.', 'AbortError')));
    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
    Reflect.apply(nativeIssueAdd, signal, ['abort', cancel, { once: true }]);
    if (issueSignalAborted(signal)) cancel();
  });
}

function closeScope(scope: Scope | null): void {
  scope?.controller.abort();
  scope?.unlink();
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw new TypeError('An exact plain request record is required.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some((key) => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))
  )
    throw new TypeError('The request must contain exact own data fields.');
  return Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value]));
}
/** Detaches composition before source consumption; no caller accessor is executed while cloning. */
function detachComposition<T>(value: T): T {
  let nodes = 0;
  const check = (item: unknown, depth: number) => {
    if (++nodes > 1_000_000 || depth > 96)
      throw new TypeError('Composition exceeds its plain-data bound.');
    if (
      item === null ||
      item === undefined ||
      typeof item === 'string' ||
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))
    )
      return;
    if (!item || typeof item !== 'object')
      throw new TypeError('Composition contains non-data values.');
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (
      prototype !== (array ? Array.prototype : Object.prototype) &&
      !(prototype === null && !array)
    )
      throw new TypeError('Composition requires plain data.');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors).filter((key) => !(array && key === 'length'));
    if (
      array &&
      (keys.length !== descriptors.length?.value ||
        keys.some((key, index) => key !== String(index)))
    )
      throw new TypeError('Composition arrays must be dense.');
    for (const key of keys) {
      const descriptor = typeof key === 'string' ? descriptors[key] : null;
      if (!descriptor?.enumerable || !('value' in descriptor))
        throw new TypeError('Composition cannot contain accessors, hidden fields or symbols.');
      check(descriptor.value, depth + 1);
    }
  };
  check(value, 0);
  return structuredClone(value);
}

/**
 * Uses the existing generic compile session's private refined capability. This is a garment-local
 * composition, with no body admission, world placement or runtime source. A consume signal remains
 * the lifetime of that accepted source generation after return. Aborting an advance signal revokes
 * only its garment, leaving the compiled/local source available for another explicit advance.
 * Invalid/cancelled source replacement makes the previous source inaccessible. The generic
 * compiler's private buffers are released on its next consume or dispose; its generation is
 * never reset or invented by this wrapper.
 */
function createSession(kind: Kind): Session {
  // Fixed internal selection, never a caller-supplied compiler/owner adapter.
  const buildGarment = (value: unknown, signal?: AbortSignal) =>
    kind === 'legacy'
      ? buildPatternImportDxfProductSavedAnnularGarmentV1(value, signal)
      : buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(value, signal);
  const projectGarment = (owner: unknown, signal?: AbortSignal) =>
    kind === 'legacy'
      ? projectPatternImportDxfProductSavedAnnularGarmentV1(owner, signal)
      : projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(owner, signal);
  const garmentLifetime = (owner: unknown) =>
    kind === 'legacy'
      ? getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(owner)
      : getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1(owner);
  const disposeGarment = (owner: unknown) =>
    kind === 'legacy'
      ? disposePatternImportDxfProductSavedAnnularGarmentV1(owner)
      : disposePatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(owner);
  let disposed = false;
  let running = false;
  let epoch = 0;
  let sourceScope: Scope | null = null;
  let childScope: Scope | null = null;
  let source: RetainedSource | null = null;
  let capability: PrivateCapability | null = null;
  let pendingPair: Scope | null = null;
  // Neither public result flags nor low-level host metadata can populate this session registry.
  const mintedObservedPairs = new WeakMap<
    object,
    Readonly<{
      capability: Extract<PrivateCapability, { kind: 'garment' }>;
      generation: number;
      reportSha256: string;
    }>
  >();
  const mintedObservedWorlds = new WeakMap<
    object,
    Readonly<{
      capability: Extract<PrivateCapability, { kind: 'garment' }>;
      generation: number;
      pairOwner: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementOwnerV1;
      pairRecord: NonNullable<ReturnType<typeof mintedObservedPairs.get>>;
      reportSha256: string;
    }>
  >();
  let status: PatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionSnapshotV1['status'] =
    'idle';
  let blocker: PatternImportDxfProductSavedAnnularGarmentSessionSnapshotV1['blocker'] = null;

  const releaseCapability = (owner: PrivateCapability | null) => {
    if (!owner) return false;
    if (capability === owner) capability = null;
    if (owner.kind === 'observed-placement') owner.unlinkIssued();
    closeScope(owner.scope);
    if (owner.kind === 'garment') return disposeGarment(owner.garment);
    disposeObservedPlacementSidecarIssuedV3(owner.issued);
    return disposeDxfProductTwoPanelSkirtGarmentSemanticsV1(owner.d0);
  };
  const revokeGarment = () => {
    closeScope(childScope);
    childScope = null;
    releaseCapability(capability);
  };
  const publishBlocked = (stage: Stage, code: string, detail: string) => {
    if (disposed) return;
    status = 'blocked';
    blocker = Object.freeze({ stage, code, detail: detail.slice(0, 2_048) });
  };
  const sourceCurrent = (captured: RetainedSource) =>
    !disposed &&
    source === captured &&
    epoch === captured.epoch &&
    !captured.scope.controller.signal.aborted;
  const capabilityCurrent = (owner: PrivateCapability) => {
    if (!sourceCurrent(owner.source) || owner.scope.controller.signal.aborted) return false;
    const current =
      owner.kind === 'garment'
        ? garmentLifetime(owner.garment) !== null
        : getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1(owner.d0) !== null &&
          getObservedPlacementSidecarIssuedLifetimeV3(owner.issued) !== null;
    return current && sourceCurrent(owner.source) && !owner.scope.controller.signal.aborted;
  };

  async function buildIssuedCapability(
    context: PatternImportDxfProductSavedRefinedCapabilityContextV1<CapabilityInput>,
    input: IssueInput,
    signal?: AbortSignal,
  ): Promise<Readonly<{ owner: PrivateCapability | null; result: CapabilityResult }>> {
    const { source: captured, scope, request } = input;
    let d0: DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1 | null = null;
    let issued: ObservedPlacementSidecarIssuedOwnerV3 | null = null;
    let retained: PrivateCapability | null = null;
    let published = false;
    const blocked = (code: string, detail: string) => ({
      owner: null,
      result: {
        operation: 'issue-observed-placement' as const,
        value: issueRefused(context.generation, true, code, detail),
      },
    });
    const current = () => {
      if (
        kind !== 'observed' ||
        !sourceCurrent(captured) ||
        scope !== childScope ||
        scope.controller.signal.aborted ||
        issueSignalAborted(signal) ||
        context.generation !== captured.generation ||
        context.composerV2Snapshot.seal.canonicalSha256 !== captured.composerSha
      )
        throw new Error('Private first-save context was replaced, cancelled or revoked.');
    };
    try {
      current();
      if (context.currentSavedRow === null)
        return blocked(
          'missing-saved-row',
          'First issuance requires the exact saved row retained by production ingress.',
        );
      const semantics = await buildDxfProductTwoPanelSkirtGarmentSemanticsV1(
        {
          schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
          origin: context.composerV2Snapshot.origin,
          composerOwner: context.composerV2Owner,
          expectedComposerCanonicalSha256: context.composerV2Snapshot.seal.canonicalSha256,
          garment: request.garment,
          policy: request.policy,
        },
        { signal: scope.controller.signal },
      );
      if (semantics.ok) d0 = semantics.owner;
      current();
      if (!semantics.ok)
        return blocked('observed-placement-semantics-failed', JSON.stringify(semantics.blockers));
      const result = await issueObservedPlacementSidecarV3(
        {
          confirmed: true,
          composerV2Owner: context.composerV2Owner,
          garmentSemanticsOwner: semantics.owner,
          compositionRequest: captured.compositionRequest,
          savedRow: context.currentSavedRow,
          displayedBodyOwner: request.displayedBodyOwner,
          displayedBodyBinding: request.displayedBodyBinding,
          confirmedTargetSha256: request.confirmedTargetSha256,
          annularParameters: request.annularParameters,
          readCurrentEvidence: request.readCurrentEvidence,
        },
        scope.controller.signal,
      );
      if (result.ok) issued = result.owner;
      current();
      if (!result.ok) return blocked('observed-placement-issue-failed', result.detail);
      const projection = await projectObservedPlacementSidecarIssuedV3(
        result.owner,
        scope.controller.signal,
      );
      current();
      if (!projection || !getObservedPlacementSidecarIssuedLifetimeV3(result.owner))
        return blocked(
          'observed-placement-owner-unavailable',
          'Issued placement failed its fresh source/target validation.',
        );
      current();
      const issuedLifetime = getObservedPlacementSidecarIssuedLifetimeV3(result.owner);
      if (!issuedLifetime) throw new Error('Issued owner was revoked before retention.');
      const releaseIssued = () => releaseCapability(holder);
      const holder: PrivateCapability = Object.freeze({
        kind: 'observed-placement',
        d0: semantics.owner,
        issued: result.owner,
        generation: context.generation,
        source: captured,
        scope,
        unlinkIssued: () =>
          Reflect.apply(nativeIssueRemove, issuedLifetime, ['abort', releaseIssued]),
      });
      if (!capabilityCurrent(holder)) throw new Error('Issued placement expired before retention.');
      current();
      capability = holder;
      retained = holder;
      d0 = null;
      issued = null;
      Reflect.apply(nativeIssueAdd, issuedLifetime, ['abort', releaseIssued, { once: true }]);
      if (issueSignalAborted(issuedLifetime) || !capabilityCurrent(holder))
        throw new Error('Issued placement was revoked while retaining its lifetime.');
      current();
      published = true;
      return {
        owner: holder,
        result: {
          operation: 'issue-observed-placement',
          value: Object.freeze({
            ok: true,
            owner: result.owner,
            generation: context.generation,
            sourceContextBound: true,
          }),
        },
      };
    } finally {
      if (retained && !published) releaseCapability(retained);
      if (issued) disposeObservedPlacementSidecarIssuedV3(issued);
      if (d0) disposeDxfProductTwoPanelSkirtGarmentSemanticsV1(d0);
    }
  }

  const compile = createPatternImportDxfProductSavedGarmentMeshCompileSessionV1<
    CapabilityInput,
    CapabilityResult,
    PrivateCapability,
    PrivateCapability
  >({
    refinedCapability: {
      async build(
        context,
        signal,
      ): Promise<
        Readonly<{
          owner: PrivateCapability | null;
          result: CapabilityResult;
        }>
      > {
        if (context.input.operation === 'issue-observed-placement')
          return buildIssuedCapability(context, context.input, signal);
        const { source: captured, scope, readCurrentPlacement } = context.input;
        let candidate: GarmentOwner | null = null;
        try {
          if (
            !sourceCurrent(captured) ||
            scope !== childScope ||
            scope.controller.signal.aborted ||
            signal?.aborted ||
            context.generation !== captured.generation ||
            context.composerV2Snapshot.seal.canonicalSha256 !== captured.composerSha
          )
            throw new Error('Private refined context no longer matches the retained source.');
          const built = await buildGarment(
            {
              schemaVersion:
                kind === 'legacy'
                  ? PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1
                  : PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_V1,
              composerV2Owner: context.composerV2Owner,
              savedLocalFrameOwner: context.composerV3Owner,
              compositionRequest: captured.compositionRequest,
              writerFrameReceipt: captured.receipt,
              readCurrentPlacement,
            },
            scope.controller.signal,
          );
          if (built.ok) candidate = built.owner;
          if (
            !sourceCurrent(captured) ||
            scope !== childScope ||
            scope.controller.signal.aborted ||
            signal?.aborted
          )
            throw new Error('Garment build was revoked before publication.');
          if (!built.ok)
            return {
              owner: null,
              result: {
                operation: 'build-garment',
                value: refusal('garment', built.code, built.detail, context.generation),
              },
            };
          const owner: PrivateCapability = Object.freeze({
            kind: 'garment',
            garment: built.owner,
            generation: context.generation,
            source: captured,
            scope,
          });
          if (!capabilityCurrent(owner))
            throw new Error('Garment source became unavailable before publication.');
          capability = owner;
          candidate = null;
          return {
            owner,
            result: {
              operation: 'build-garment',
              value: Object.freeze({
                ok: true,
                generation: context.generation,
                report: built.report,
                claims: CLAIMS,
              }),
            },
          };
        } finally {
          if (candidate) disposeGarment(candidate);
        }
      },
      project(owner) {
        return capabilityCurrent(owner) ? owner : null;
      },
      dispose: releaseCapability,
    },
  });

  function refusal(
    stage: Stage,
    code: string,
    detail: string,
    generation: number = compile.snapshot().generation,
  ): Blocked {
    return Object.freeze({
      ok: false,
      generation,
      stage,
      code,
      detail: detail.slice(0, 2_048),
      claims: CLAIMS,
    });
  }
  const enterFailure = (stage: Stage, signal?: AbortSignal): Blocked | null =>
    disposed
      ? refusal(stage, 'session-disposed', 'The saved garment session is disposed.')
      : running
        ? refusal(stage, 'session-busy', 'Another saved garment operation is running.')
        : signal?.aborted
          ? refusal(stage, 'session-cancelled', 'The operation was cancelled before admission.')
          : null;
  const checkAttempt = (capturedEpoch: number, scope: Scope) => {
    if (disposed) throw new Error('session-disposed');
    if (epoch !== capturedEpoch || sourceScope !== scope) throw new Error('stale-generation');
    if (scope.controller.signal.aborted) throw new Error('session-cancelled');
  };

  const consume: PatternImportDxfProductSavedAnnularGarmentSessionV1['consume'] = async (
    value,
    signal,
  ) => {
    const refused = enterFailure('compile', signal);
    if (refused) return refused;
    // Admission of a replacement attempt revokes the previous garment, even if its new data
    // cannot be detached. Busy/pre-aborted calls above were refused before this boundary.
    running = true;
    epoch += 1;
    const ticket = epoch;
    revokeGarment();
    closeScope(sourceScope);
    sourceScope = null;
    source = null;
    if (disposed) {
      running = false;
      return refusal(
        'compile',
        'session-disposed',
        'Session disposed while revoking the old source.',
      );
    }
    status = 'compiling';
    blocker = null;
    let request: PatternImportDxfProductSavedGarmentMeshIngressRequestV1;
    let composition: PatternImportDxfProductSavedGarmentMeshIngressRequestV1['compositionRequest'];
    try {
      const data = exactRecord(value, [
        'schemaVersion',
        'sourceOwner',
        'compositionRequest',
        'targetEdgeMm',
      ]);
      composition = detachComposition(
        data.compositionRequest as PatternImportDxfProductSavedGarmentMeshIngressRequestV1['compositionRequest'],
      );
      request = {
        schemaVersion:
          data.schemaVersion as PatternImportDxfProductSavedGarmentMeshIngressRequestV1['schemaVersion'],
        sourceOwner:
          data.sourceOwner as PatternImportDxfProductSavedGarmentMeshIngressRequestV1['sourceOwner'],
        // The one-shot native source authenticates the exact saved draft object, not a clone.
        // Detached replay data is retained separately and authenticated again by the producer.
        compositionRequest:
          data.compositionRequest as PatternImportDxfProductSavedGarmentMeshIngressRequestV1['compositionRequest'],
        targetEdgeMm: data.targetEdgeMm as number,
      };
    } catch (error) {
      running = false;
      const detail = error instanceof Error ? error.message : 'Invalid saved source request.';
      publishBlocked('compile', 'invalid-input', detail);
      return refusal('compile', disposed ? 'session-disposed' : 'invalid-input', detail);
    }
    if (disposed) {
      running = false;
      return refusal(
        'compile',
        'session-disposed',
        'Session disposed while detaching the new source.',
      );
    }
    let scope: Scope;
    scope = linkSignals([signal], () => {
      if (sourceScope !== scope || epoch !== ticket) return;
      revokeGarment();
      source = null;
      publishBlocked(
        'compile',
        'session-cancelled',
        'The accepted saved source generation was cancelled.',
      );
    });
    sourceScope = scope;
    status = 'compiling';
    blocker = null;
    let stage: Stage = 'compile';
    try {
      const compiled = await compile.consume(request, scope.controller.signal);
      checkAttempt(ticket, scope);
      if (!compiled.ok) {
        publishBlocked(stage, compiled.blockers[0].code, compiled.blockers[0].detail);
        return refusal(
          stage,
          compiled.blockers[0].code,
          compiled.blockers[0].detail,
          compiled.generation,
        );
      }
      stage = 'writer-receipt';
      const writer = await compile.deriveLatestSavedWriterFrameReceipt(
        compiled.generation,
        scope.controller.signal,
      );
      checkAttempt(ticket, scope);
      if (!writer.ok) {
        publishBlocked(stage, writer.blocker.code, writer.blocker.detail);
        return refusal(stage, writer.blocker.code, writer.blocker.detail, writer.generation);
      }
      stage = 'local-frame';
      const local = await compile.advanceCanonicalMediumLocalFrameRefinement(
        {
          schemaVersion:
            PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_REQUEST_V2,
          expectedGeneration: compiled.generation,
          writerFrameReceipt: writer.receipt,
        },
        scope.controller.signal,
      );
      checkAttempt(ticket, scope);
      if (!local.ok) {
        publishBlocked(stage, local.blockers[0].code, local.blockers[0].detail);
        return refusal(stage, local.blockers[0].code, local.blockers[0].detail, local.generation);
      }
      source = Object.freeze({
        epoch: ticket,
        generation: compiled.generation,
        composerSha: compiled.composerSnapshot.seal.canonicalSha256,
        compositionRequest: composition,
        receipt: writer.receipt,
        scope,
      });
      status = 'local-frame-ready';
      return Object.freeze({
        ok: true,
        generation: compiled.generation,
        compile: compiled,
        localFrame: local,
        claims: CLAIMS,
      });
    } catch (error) {
      const code = disposed
        ? 'session-disposed'
        : scope.controller.signal.aborted
          ? 'session-cancelled'
          : 'source-composition-failed';
      const detail =
        error instanceof Error ? error.message : 'Saved source composition failed closed.';
      if (ticket === epoch) publishBlocked(stage, code, detail);
      return refusal(stage, code, detail);
    } finally {
      running = false;
    }
  };

  const advanceSavedGarment = async (
    value: AdvanceRequest,
    signal?: AbortSignal,
  ): Promise<AdvanceResult> => {
    const refused = enterFailure('garment', signal);
    if (refused) return refused;
    let request: AdvanceRequest;
    try {
      const data = exactRecord(value, ['expectedGeneration', 'readCurrentPlacement']);
      if (
        !Number.isSafeInteger(data.expectedGeneration) ||
        (data.expectedGeneration as number) < 1 ||
        typeof data.readCurrentPlacement !== 'function'
      )
        throw new TypeError(
          'A positive generation expectation and fresh placement reader are required.',
        );
      request = data as AdvanceRequest;
    } catch (error) {
      return refusal(
        'garment',
        'invalid-input',
        error instanceof Error ? error.message : 'Invalid garment request.',
      );
    }
    if (request.expectedGeneration !== compile.snapshot().generation)
      return refusal(
        'garment',
        'stale-generation',
        'The requested generation is not the current compiled source.',
      );
    const captured = source;
    if (!captured || !sourceCurrent(captured))
      return refusal(
        'garment',
        'session-not-ready',
        'A current saved local-frame source is required.',
      );
    running = true;
    revokeGarment();
    if (disposed || !sourceCurrent(captured)) {
      running = false;
      return refusal(
        'garment',
        disposed ? 'session-disposed' : 'session-cancelled',
        'Source revoked while replacing the previous garment.',
      );
    }
    let scope: Scope;
    scope = linkSignals([captured.scope.controller.signal, signal], () => {
      if (childScope !== scope) return;
      releaseCapability(capability);
      publishBlocked(
        'garment',
        'session-cancelled',
        'The garment lifetime was cancelled; the compiled source can be advanced again.',
      );
    });
    childScope = scope;
    status = 'building-garment';
    blocker = null;
    try {
      const built = await compile.advanceCanonicalMediumRefinedCapability(
        request.expectedGeneration,
        {
          operation: 'build-garment',
          source: captured,
          scope,
          readCurrentPlacement: request.readCurrentPlacement,
        },
        scope.controller.signal,
      );
      if (
        disposed ||
        !sourceCurrent(captured) ||
        scope !== childScope ||
        scope.controller.signal.aborted
      ) {
        releaseCapability(capability);
        publishBlocked(
          'garment',
          'session-cancelled',
          'Garment composition was revoked before publication.',
        );
        return refusal(
          'garment',
          disposed ? 'session-disposed' : 'session-cancelled',
          'Garment composition was revoked before publication.',
        );
      }
      if (!built.ok) {
        publishBlocked('garment', built.blocker.code, built.blocker.detail);
        return refusal('garment', built.blocker.code, built.blocker.detail, built.generation);
      }
      if (built.result.operation !== 'build-garment')
        throw new Error('Private capability operation mismatch.');
      if (!built.result.value.ok) {
        publishBlocked('garment', built.result.value.code, built.result.value.detail);
        return built.result.value;
      }
      if (
        !capability ||
        capability.kind !== 'garment' ||
        compile.projectLatestRefinedCapability() !== capability ||
        !capabilityCurrent(capability)
      ) {
        revokeGarment();
        publishBlocked(
          'garment',
          'garment-owner-unavailable',
          'The private garment failed its final currentness check.',
        );
        return refusal(
          'garment',
          'garment-owner-unavailable',
          'The private garment failed its final currentness check.',
        );
      }
      status = built.result.value.report.decision;
      return built.result.value;
    } finally {
      running = false;
    }
  };

  const projectLatestGarment = async (
    expectedGeneration: number,
    signal?: AbortSignal,
  ): Promise<SessionProjection | null> => {
    // Refused reads must not revoke a different/current generation.
    if (
      disposed ||
      running ||
      signal?.aborted ||
      !Number.isSafeInteger(expectedGeneration) ||
      expectedGeneration !== compile.snapshot().generation
    )
      return null;
    const captured = compile.projectLatestRefinedCapability();
    if (
      !captured ||
      captured.kind !== 'garment' ||
      captured !== capability ||
      captured.generation !== expectedGeneration
    )
      return null;
    const scope = linkSignals(
      [signal, captured.source.scope.controller.signal, captured.scope.controller.signal],
      () => {},
    );
    try {
      const projection = await projectGarment(captured.garment, scope.controller.signal);
      if (
        disposed ||
        signal?.aborted ||
        scope.controller.signal.aborted ||
        captured !== capability ||
        captured.generation !== compile.snapshot().generation
      )
        return null;
      if (!projection || !capabilityCurrent(captured)) {
        releaseCapability(captured);
        publishBlocked(
          'garment',
          'garment-owner-unavailable',
          'Fresh garment projection no longer matches the saved source or placement.',
        );
        return null;
      }
      return Object.freeze({ generation: captured.generation, projection });
    } finally {
      // Completion is not cancellation: detach parent listeners without aborting a finished read.
      scope.unlink();
    }
  };

  const issueObservedPlacement = async (
    value: unknown,
    signal?: AbortSignal,
  ): Promise<IssueResult> => {
    const generation = compile.snapshot().generation;
    if (disposed)
      return issueRefused(
        generation,
        false,
        'session-disposed',
        'The observed source session is disposed.',
      );
    if (running || pendingPair)
      return issueRefused(
        generation,
        false,
        'session-busy',
        'Another source operation is pending.',
      );
    let request: IssueRequest;
    try {
      if (issueSignalAborted(signal))
        return issueRefused(
          generation,
          false,
          'session-cancelled',
          'Issuance was cancelled before admission.',
        );
      const data = exactRecord(value, [
        'expectedGeneration',
        'confirmed',
        'garment',
        'policy',
        'annularParameters',
        'confirmedTargetSha256',
        'readCurrentEvidence',
        'displayedBodyOwner',
        'displayedBodyBinding',
      ]);
      if (
        !Number.isSafeInteger(data.expectedGeneration) ||
        (data.expectedGeneration as number) < 1 ||
        data.confirmed !== true ||
        typeof data.readCurrentEvidence !== 'function' ||
        typeof data.confirmedTargetSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(data.confirmedTargetSha256)
      )
        throw new TypeError('Exact confirmed intent, target SHA and fresh evidence are required.');
      request = {
        expectedGeneration: data.expectedGeneration as number,
        confirmed: true,
        garment: detachComposition(data.garment as IssueRequest['garment']),
        policy: detachComposition(data.policy as IssueRequest['policy']),
        annularParameters: detachComposition(
          data.annularParameters as IssueRequest['annularParameters'],
        ),
        confirmedTargetSha256: data.confirmedTargetSha256,
        readCurrentEvidence: data.readCurrentEvidence as IssueRequest['readCurrentEvidence'],
        displayedBodyOwner: data.displayedBodyOwner as SavedModelDisplayedTriangleBodyOwnerV2,
        displayedBodyBinding: detachComposition(
          data.displayedBodyBinding as SavedModelDisplayedTriangleBodyBindingV2,
        ),
      };
    } catch (error) {
      return issueRefused(
        generation,
        false,
        'invalid-input',
        error instanceof Error ? error.message : 'Invalid observed placement intent.',
      );
    }
    if (request.expectedGeneration !== generation)
      return issueRefused(
        generation,
        false,
        'stale-generation',
        'The expected generation differs from the private compiler.',
      );
    const captured = source;
    if (!captured || !sourceCurrent(captured))
      return issueRefused(
        generation,
        false,
        'session-not-ready',
        'A current saved local-frame source is required.',
      );
    running = true;
    revokeGarment();
    let scope: Scope | null = null;
    try {
      if (!sourceCurrent(captured) || issueSignalAborted(signal))
        return issueRefused(
          generation,
          true,
          disposed ? 'session-disposed' : 'session-cancelled',
          'Source revoked during capability replacement.',
        );
      scope = linkIssueSignals([captured.scope.controller.signal, signal], () => {
        if (!scope || childScope !== scope) return;
        releaseCapability(capability);
        publishBlocked(
          'garment',
          'session-cancelled',
          'Issued placement was cancelled; source remains available for another explicit issue.',
        );
      });
      childScope = scope;
      status = 'building-observed-placement';
      blocker = null;
      const current = () => {
        if (
          !sourceCurrent(captured) ||
          childScope !== scope ||
          issueSignalAborted(scope!.controller.signal) ||
          issueSignalAborted(signal) ||
          compile.snapshot().generation !== generation
        )
          throw new Error('First-save context was revoked before publication.');
      };
      current();
      const built = await compile.advanceCanonicalMediumRefinedCapability(
        generation,
        { operation: 'issue-observed-placement', source: captured, scope, request },
        scope.controller.signal,
      );
      current();
      if (!built.ok) {
        publishBlocked('garment', built.blocker.code, built.blocker.detail);
        return issueRefused(generation, true, built.blocker.code, built.blocker.detail);
      }
      if (built.result.operation !== 'issue-observed-placement')
        throw new Error('Private capability operation mismatch.');
      if (!built.result.value.ok) {
        publishBlocked('garment', built.result.value.code, built.result.value.detail);
        return built.result.value;
      }
      const holder = compile.projectLatestRefinedCapability();
      if (
        !holder ||
        holder.kind !== 'observed-placement' ||
        holder !== capability ||
        holder.issued !== built.result.value.owner ||
        !capabilityCurrent(holder)
      )
        throw new Error('Issued private capability unavailable.');
      const projection = await projectObservedPlacementSidecarIssuedV3(
        holder.issued,
        scope.controller.signal,
      );
      current();
      if (!projection || !capabilityCurrent(holder))
        throw new Error('Issued placement no longer matches fresh source or body target.');
      current();
      status = 'observed-placement-issued';
      return built.result.value;
    } catch (error) {
      const cancelled =
        issueSignalAborted(signal) || (scope ? issueSignalAborted(scope.controller.signal) : false);
      if (capability?.scope === scope) releaseCapability(capability);
      const code = disposed
        ? 'session-disposed'
        : cancelled
          ? 'session-cancelled'
          : 'observed-placement-issue-failed';
      const detail = error instanceof Error ? error.message : 'First issuance failed closed.';
      publishBlocked('garment', code, detail);
      return issueRefused(generation, true, code, detail);
    } finally {
      running = false;
      if (scope && capability?.scope !== scope) {
        if (childScope === scope) childScope = null;
        closeScope(scope);
      }
    }
  };

  const buildObservedBodyPair = async (
    value: unknown,
    signal?: AbortSignal,
  ): Promise<PairResult> => {
    const generation = compile.snapshot().generation;
    if (disposed)
      return pairRefused(
        generation,
        false,
        'session-disposed',
        'The saved garment session is disposed.',
      );
    if (running || pendingPair)
      return pairRefused(
        generation,
        false,
        'session-busy',
        'A saved garment operation or pair handoff is already pending.',
      );
    if (signal?.aborted)
      return pairRefused(
        generation,
        false,
        'session-cancelled',
        'Pair handoff was cancelled before admission.',
      );
    let request: PairRequest;
    try {
      const data = exactRecord(value, [
        'expectedGeneration',
        'displayedBodyOwner',
        'displayedBodyBinding',
      ]);
      if (!Number.isSafeInteger(data.expectedGeneration) || (data.expectedGeneration as number) < 1)
        throw new TypeError('A positive exact compiler generation expectation is required.');
      if (data.expectedGeneration !== generation)
        return pairRefused(
          generation,
          false,
          'stale-generation',
          'The expected generation differs from the current private compiler.',
        );
      request = {
        expectedGeneration: data.expectedGeneration as number,
        displayedBodyOwner: data.displayedBodyOwner as SavedModelDisplayedTriangleBodyOwnerV2,
        displayedBodyBinding: detachComposition(
          data.displayedBodyBinding as SavedModelDisplayedTriangleBodyBindingV2,
        ),
      };
    } catch (error) {
      return pairRefused(
        generation,
        false,
        'invalid-input',
        error instanceof Error ? error.message : 'Invalid observed pair request.',
      );
    }
    const captured = compile.projectLatestRefinedCapability();
    if (
      !captured ||
      captured.kind !== 'garment' ||
      captured !== capability ||
      captured.generation !== request.expectedGeneration ||
      !capabilityCurrent(captured)
    )
      return pairRefused(
        generation,
        false,
        'garment-owner-unavailable',
        'A current privately retained saved garment is required.',
      );
    const lifetime = garmentLifetime(captured.garment);
    if (!lifetime)
      return pairRefused(
        generation,
        false,
        'garment-owner-unavailable',
        'The saved garment lifetime expired.',
      );
    let api: PairApi | null = null;
    let created: Extract<DomainPairResult, { ok: true }> | null = null;
    let retained = false;
    let removeChildListener: (() => void) | null = null;
    const scope = linkSignals(
      [captured.source.scope.controller.signal, captured.scope.controller.signal, lifetime, signal],
      () => {
        if (created && api) api.dispose(created.owner);
      },
    );
    pendingPair = scope;
    const unlink = () => {
      scope.unlink();
      removeChildListener?.();
      removeChildListener = null;
    };
    const requireCaptured = () => {
      if (
        disposed ||
        scope.controller.signal.aborted ||
        signal?.aborted ||
        captured !== capability ||
        captured.generation !== compile.snapshot().generation ||
        !capabilityCurrent(captured)
      )
        throw new Error('The captured saved garment context was replaced, cancelled or revoked.');
    };
    const freshGarment = async () => {
      requireCaptured();
      const projected = await projectGarment(captured.garment, scope.controller.signal);
      requireCaptured();
      if (
        !projected ||
        projected.report.canonicalSha256 !== captured.garment.report.canonicalSha256
      )
        throw new Error('Fresh persisted garment no longer matches the captured owner.');
    };
    try {
      await freshGarment();
      requireCaptured();
      api = await loadPairApi(kind);
      requireCaptured();
      const result = await api.build(
        {
          schemaVersion: api.schemaVersion,
          [api.garmentKey]: captured.garment,
          displayedBodyOwner: request.displayedBodyOwner,
          displayedBodyBinding: request.displayedBodyBinding,
          // The request's expectedGeneration is never copied into the pair's source binding.
          hostCompileGeneration: captured.generation,
        },
        scope.controller.signal,
      );
      if (result.ok) created = result;
      requireCaptured();
      if (!result.ok)
        return Object.freeze({
          ...result,
          generation: captured.generation,
          sourceContextBound: true,
        });
      await freshGarment();
      requireCaptured();
      const childLifetime = api.lifetime(result.owner);
      if (!childLifetime || childLifetime.aborted)
        throw new Error('Observed pair expired before publication.');
      childLifetime.addEventListener('abort', unlink, { once: true });
      removeChildListener = () => childLifetime.removeEventListener('abort', unlink);
      requireCaptured();
      if (kind === 'observed') {
        const forgetMintedPair = () => mintedObservedPairs.delete(result.owner);
        Reflect.apply(nativeIssueAdd, childLifetime, ['abort', forgetMintedPair, { once: true }]);
        if (issueSignalAborted(childLifetime)) {
          Reflect.apply(nativeIssueRemove, childLifetime, ['abort', forgetMintedPair]);
          throw new Error('Observed pair expired before its session registry publication.');
        }
        mintedObservedPairs.set(
          result.owner,
          Object.freeze({
            capability: captured,
            generation: captured.generation,
            reportSha256: result.report.reportSha256,
          }),
        );
        requireCaptured();
        if (issueSignalAborted(childLifetime))
          throw new Error('Observed pair revoked during registry publication.');
      }
      retained = true;
      return Object.freeze({
        ...result,
        generation: captured.generation,
        sourceContextBound: true,
      });
    } catch (error) {
      const wasCancelled = signal?.aborted || scope.controller.signal.aborted;
      scope.controller.abort();
      if (created && api) api.dispose(created.owner);
      return pairRefused(
        captured.generation,
        true,
        disposed
          ? 'session-disposed'
          : wasCancelled
            ? 'session-cancelled'
            : 'saved-observed-pair-handoff-failed',
        error instanceof Error ? error.message : 'Saved observed-body handoff failed closed.',
      );
    } finally {
      if (pendingPair === scope) pendingPair = null;
      if (!retained) {
        closeScope(scope);
        unlink();
      }
    }
  };

  const buildWorldInitialPreflight = async (
    value: unknown,
    signal?: AbortSignal,
  ): Promise<WorldResult> => {
    const generation = compile.snapshot().generation;
    if (disposed)
      return worldRefused(
        generation,
        false,
        'session-disposed',
        'The observed source session is disposed.',
      );
    if (running || pendingPair)
      return worldRefused(generation, false, 'session-busy', 'Another source handoff is pending.');
    let request: WorldRequest;
    try {
      if (issueSignalAborted(signal))
        return worldRefused(
          generation,
          false,
          'session-cancelled',
          'World handoff cancelled before admission.',
        );
      const data = exactRecord(value, [
        'expectedGeneration',
        'observedPairOwner',
        'expectedPairReportSha256',
      ]);
      if (
        !Number.isSafeInteger(data.expectedGeneration) ||
        (data.expectedGeneration as number) < 1 ||
        typeof data.expectedPairReportSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(data.expectedPairReportSha256)
      )
        throw new TypeError('An exact compiler generation and pair report SHA are required.');
      request = {
        expectedGeneration: data.expectedGeneration as number,
        observedPairOwner: data.observedPairOwner as WorldRequest['observedPairOwner'],
        expectedPairReportSha256: data.expectedPairReportSha256,
      };
    } catch (error) {
      return worldRefused(
        generation,
        false,
        'invalid-input',
        error instanceof Error ? error.message : 'Invalid world preflight request.',
      );
    }
    if (request.expectedGeneration !== generation)
      return worldRefused(
        generation,
        false,
        'stale-generation',
        'The expected generation differs from the private compiler.',
      );
    const pairOwner = request.observedPairOwner;
    const minted =
      pairOwner && typeof pairOwner === 'object' ? mintedObservedPairs.get(pairOwner) : undefined;
    if (!minted)
      return worldRefused(
        generation,
        false,
        'unissued-observed-pair',
        'The exact pair was not published by this observed source session.',
      );
    const captured = minted.capability;
    if (
      minted.generation !== generation ||
      captured !== capability ||
      compile.projectLatestRefinedCapability() !== captured ||
      !capabilityCurrent(captured)
    )
      return worldRefused(
        generation,
        false,
        'stale-pair-capability',
        'The pair belongs to a replaced private garment capability.',
      );
    if (request.expectedPairReportSha256 !== minted.reportSha256)
      return worldRefused(
        generation,
        true,
        'pair-report-mismatch',
        'The expected report differs from the pair published by this session.',
      );
    let scope: Scope | null = null;
    let api: WorldApi | null = null;
    let created: Extract<
      BetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightResultV1,
      { ok: true }
    > | null = null;
    let retained = false;
    let removeChildListener: (() => void) | null = null;
    const upstreamLinks: AbortSignal[] = [];
    const revokeUpstream = () => {
      scope?.controller.abort();
      if (created && api)
        api.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
          created.owner,
        );
    };
    const unlink = () => {
      scope?.unlink();
      for (const parent of upstreamLinks.splice(0))
        Reflect.apply(nativeIssueRemove, parent, ['abort', revokeUpstream]);
      removeChildListener?.();
      removeChildListener = null;
    };
    try {
      scope = linkIssueSignals(
        [captured.source.scope.controller.signal, captured.scope.controller.signal, signal],
        () => {
          if (created && api)
            api.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
              created.owner,
            );
        },
      );
      pendingPair = scope;
      const pairApi = await import(
        './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1'
      );
      if (
        disposed ||
        issueSignalAborted(signal) ||
        captured !== capability ||
        generation !== compile.snapshot().generation ||
        !capabilityCurrent(captured)
      )
        throw new Error('Source changed while loading the fixed observed pair projector.');
      const garmentLife = garmentLifetime(captured.garment);
      const pairLife =
        pairApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
          pairOwner,
        );
      if (!garmentLife || !pairLife)
        throw new Error('The borrowed garment or pair lifetime expired.');
      for (const parent of [garmentLife, pairLife]) {
        Reflect.apply(nativeIssueAdd, parent, ['abort', revokeUpstream, { once: true }]);
        upstreamLinks.push(parent);
      }
      if (issueSignalAborted(garmentLife) || issueSignalAborted(pairLife)) revokeUpstream();
      const operationScope = scope;
      const terminal = () => {
        if (
          disposed ||
          issueSignalAborted(signal) ||
          issueSignalAborted(operationScope.controller.signal) ||
          captured !== capability ||
          generation !== compile.snapshot().generation ||
          !sourceCurrent(captured.source) ||
          issueSignalAborted(captured.scope.controller.signal) ||
          mintedObservedPairs.get(pairOwner) !== minted
        )
          throw new Error('The private world handoff source was replaced, cancelled or revoked.');
      };
      const current = () => {
        terminal();
        if (
          compile.projectLatestRefinedCapability() !== captured ||
          !capabilityCurrent(captured) ||
          pairApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
            pairOwner,
          ) !== pairLife
        )
          throw new Error('Borrowed world handoff owners no longer match the private capability.');
        // Genuine parent polls may synchronously call the host. Recheck own/caller state last.
        terminal();
        if (issueSignalAborted(garmentLife) || issueSignalAborted(pairLife))
          throw new Error('Borrowed world handoff lifetime expired.');
      };
      const garmentSha = captured.garment.report.canonicalSha256;
      const fresh = async () => {
        current();
        const garment = await waitForWorldRead(
          projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(captured.garment),
          operationScope.controller.signal,
        );
        current();
        if (!garment || garment.report.canonicalSha256 !== garmentSha)
          throw new Error('Fresh garment differs from the session-retained source.');
        const pair = await waitForWorldRead(
          pairApi.projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
            pairOwner,
          ),
          operationScope.controller.signal,
        );
        current();
        if (
          !pair ||
          pair.report.reportSha256 !== minted.reportSha256 ||
          pair.report.source.garmentReport.canonicalSha256 !== garmentSha
        )
          throw new Error(
            'Fresh pair differs from the exact garment/report binding retained by this session.',
          );
      };
      await fresh();
      current();
      api = await import(
        './beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1'
      );
      current();
      const result =
        await api.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
          {
            schemaVersion:
              api.BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1,
            savedAnnularObservedPlacementGarmentOwner: captured.garment,
            observedPairOwner: pairOwner,
            expected: { garmentReportSha256: garmentSha, pairReportSha256: minted.reportSha256 },
          },
          operationScope.controller.signal,
        );
      if (result.ok) created = result;
      current();
      if (!result.ok)
        return Object.freeze({
          ...result,
          generation: captured.generation,
          sourceContextBound: true,
        });
      await fresh();
      current();
      const childLife =
        api.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
          result.owner,
        );
      if (!childLife || issueSignalAborted(childLife))
        throw new Error('Owned world preflight expired before publication.');
      Reflect.apply(nativeIssueAdd, childLife, ['abort', unlink, { once: true }]);
      removeChildListener = () => Reflect.apply(nativeIssueRemove, childLife, ['abort', unlink]);
      current();
      if (issueSignalAborted(childLife))
        throw new Error('Owned world preflight was revoked by a final source poll.');
      const forgetMintedWorld = () => mintedObservedWorlds.delete(result.owner);
      Reflect.apply(nativeIssueAdd, childLife, ['abort', forgetMintedWorld, { once: true }]);
      if (issueSignalAborted(childLife)) {
        Reflect.apply(nativeIssueRemove, childLife, ['abort', forgetMintedWorld]);
        throw new Error('World preflight expired before its session registry publication.');
      }
      mintedObservedWorlds.set(
        result.owner,
        Object.freeze({
          capability: captured,
          generation: captured.generation,
          pairOwner,
          pairRecord: minted,
          reportSha256: result.report.reportSha256,
        }),
      );
      current();
      if (issueSignalAborted(childLife))
        throw new Error('World preflight was revoked during registry publication.');
      retained = true;
      return Object.freeze({
        ...result,
        generation: captured.generation,
        sourceContextBound: true,
      });
    } catch (error) {
      const cancelled =
        issueSignalAborted(signal) || (scope ? issueSignalAborted(scope.controller.signal) : false);
      if (created && api)
        api.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
          created.owner,
        );
      return worldRefused(
        captured.generation,
        true,
        disposed
          ? 'session-disposed'
          : cancelled
            ? 'session-cancelled'
            : 'saved-world-preflight-handoff-failed',
        error instanceof Error ? error.message : 'World preflight handoff failed closed.',
      );
    } finally {
      if (pendingPair === scope) pendingPair = null;
      if (!retained) {
        if (scope) closeScope(scope);
        unlink();
      }
    }
  };

  const buildRuntimeSource = async (
    value: unknown,
    signal?: AbortSignal,
  ): Promise<RuntimeSourceResult> => {
    const generation = compile.snapshot().generation;
    if (disposed)
      return runtimeSourceRefused(
        generation,
        false,
        'session-disposed',
        'The observed source session is disposed.',
      );
    if (running || pendingPair)
      return runtimeSourceRefused(
        generation,
        false,
        'session-busy',
        'Another source handoff is pending.',
      );
    let request: RuntimeSourceRequest;
    try {
      if (issueSignalAborted(signal))
        return runtimeSourceRefused(
          generation,
          false,
          'session-cancelled',
          'Runtime-source handoff cancelled before admission.',
        );
      const data = exactRecord(value, [
        'expectedGeneration',
        'observedPairOwner',
        'expectedPairReportSha256',
        'worldInitialOwner',
        'expectedWorldReportSha256',
      ]);
      if (
        !Number.isSafeInteger(data.expectedGeneration) ||
        (data.expectedGeneration as number) < 1 ||
        typeof data.expectedPairReportSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(data.expectedPairReportSha256) ||
        typeof data.expectedWorldReportSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(data.expectedWorldReportSha256)
      )
        throw new TypeError(
          'An exact compiler generation and pair/world report SHAs are required.',
        );
      request = {
        expectedGeneration: data.expectedGeneration as number,
        observedPairOwner: data.observedPairOwner as RuntimeSourceRequest['observedPairOwner'],
        expectedPairReportSha256: data.expectedPairReportSha256,
        worldInitialOwner: data.worldInitialOwner as RuntimeSourceRequest['worldInitialOwner'],
        expectedWorldReportSha256: data.expectedWorldReportSha256,
      };
    } catch (error) {
      return runtimeSourceRefused(
        generation,
        false,
        'invalid-input',
        error instanceof Error ? error.message : 'Invalid runtime-source request.',
      );
    }
    if (request.expectedGeneration !== generation)
      return runtimeSourceRefused(
        generation,
        false,
        'stale-generation',
        'The expected generation differs from the private compiler.',
      );
    const pairOwner = request.observedPairOwner;
    const worldOwner = request.worldInitialOwner;
    const mintedPair =
      pairOwner && typeof pairOwner === 'object' ? mintedObservedPairs.get(pairOwner) : undefined;
    if (!mintedPair)
      return runtimeSourceRefused(
        generation,
        false,
        'unissued-observed-pair',
        'The exact pair was not published by this observed source session.',
      );
    const mintedWorld =
      worldOwner && typeof worldOwner === 'object'
        ? mintedObservedWorlds.get(worldOwner)
        : undefined;
    if (!mintedWorld)
      return runtimeSourceRefused(
        generation,
        false,
        'unissued-world-preflight',
        'The exact world preflight was not published by this observed source session.',
      );
    const captured = mintedPair.capability;
    if (
      mintedWorld.pairOwner !== pairOwner ||
      mintedWorld.pairRecord !== mintedPair ||
      mintedWorld.capability !== captured
    )
      return runtimeSourceRefused(
        generation,
        false,
        'world-pair-mismatch',
        'The world preflight belongs to another exact minted pair/capability.',
      );
    if (
      mintedPair.generation !== generation ||
      mintedWorld.generation !== generation ||
      captured !== capability ||
      compile.projectLatestRefinedCapability() !== captured ||
      !capabilityCurrent(captured)
    )
      return runtimeSourceRefused(
        generation,
        false,
        'stale-runtime-capability',
        'The pair/world belong to a replaced private garment capability.',
      );
    if (request.expectedPairReportSha256 !== mintedPair.reportSha256)
      return runtimeSourceRefused(
        generation,
        false,
        'pair-report-mismatch',
        'The expected pair report differs from the one published by this session.',
      );
    if (request.expectedWorldReportSha256 !== mintedWorld.reportSha256)
      return runtimeSourceRefused(
        generation,
        false,
        'world-report-mismatch',
        'The expected world report differs from the one published by this session.',
      );
    let scope: Scope | null = null;
    let api: RuntimeSourceApi | null = null;
    let created: Extract<
      BetaSkirtSavedAnnularObservedPlacementRuntimeSourceResultV1,
      { ok: true }
    > | null = null;
    let retained = false;
    let completed = false;
    let removeChildListener: (() => void) | null = null;
    const upstreamLinks: AbortSignal[] = [];
    const disposeCreated = () => {
      if (created && api)
        api.disposeBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1(created.owner);
    };
    const revokeUpstream = () => {
      scope?.controller.abort();
      disposeCreated();
    };
    const unlink = () => {
      scope?.unlink();
      for (const parent of upstreamLinks.splice(0))
        Reflect.apply(nativeIssueRemove, parent, ['abort', revokeUpstream]);
      removeChildListener?.();
      removeChildListener = null;
    };
    try {
      scope = linkIssueSignals(
        [captured.source.scope.controller.signal, captured.scope.controller.signal, signal],
        disposeCreated,
      );
      pendingPair = scope;
      const operation = scope;
      const terminal = () => {
        if (
          disposed ||
          issueSignalAborted(signal) ||
          issueSignalAborted(operation.controller.signal) ||
          captured !== capability ||
          generation !== compile.snapshot().generation ||
          !sourceCurrent(captured.source) ||
          issueSignalAborted(captured.scope.controller.signal) ||
          mintedObservedPairs.get(pairOwner) !== mintedPair ||
          mintedObservedWorlds.get(worldOwner) !== mintedWorld
        )
          throw new Error('The private runtime handoff source was replaced, cancelled or revoked.');
      };
      terminal();
      const [pairApi, worldApi] = await Promise.all([
        import('./beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1'),
        import(
          './beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1'
        ),
      ]);
      terminal();
      const garmentLife = garmentLifetime(captured.garment);
      const pairLife =
        pairApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
          pairOwner,
        );
      const worldLife =
        worldApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
          worldOwner,
        );
      terminal();
      if (!garmentLife || !pairLife || !worldLife)
        throw new Error('Borrowed garment, pair or world preflight lifetime expired.');
      for (const parent of [garmentLife, pairLife, worldLife]) {
        if (issueSignalAborted(parent))
          throw new Error('Borrowed runtime parent was revoked before linking.');
        upstreamLinks.push(parent);
        Reflect.apply(nativeIssueAdd, parent, ['abort', revokeUpstream, { once: true }]);
      }
      const current = () => {
        terminal();
        if (
          compile.projectLatestRefinedCapability() !== captured ||
          !capabilityCurrent(captured) ||
          pairApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
            pairOwner,
          ) !== pairLife ||
          worldApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
            worldOwner,
          ) !== worldLife
        )
          throw new Error('Borrowed runtime owners no longer match the private capability.');
        terminal();
        if ([garmentLife, pairLife, worldLife].some(issueSignalAborted))
          throw new Error('Borrowed runtime parent lifetime expired.');
      };
      const garmentSha = captured.garment.report.canonicalSha256;
      const fresh = async () => {
        current();
        const garment = await waitForWorldRead(
          projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(captured.garment),
          operation.controller.signal,
        );
        current();
        if (!garment || garment.report.canonicalSha256 !== garmentSha)
          throw new Error('Fresh garment differs from the session-retained source.');
        const pair = await waitForWorldRead(
          pairApi.projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
            pairOwner,
          ),
          operation.controller.signal,
        );
        current();
        if (
          !pair ||
          pair.report.reportSha256 !== mintedPair.reportSha256 ||
          pair.report.source.garmentReport.canonicalSha256 !== garmentSha
        )
          throw new Error('Fresh pair differs from the exact private garment/report binding.');
        const world = await waitForWorldRead(
          worldApi.projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
            worldOwner,
          ),
          operation.controller.signal,
        );
        current();
        if (
          !world ||
          world.report.reportSha256 !== mintedWorld.reportSha256 ||
          world.report.bindings.garmentReportSha256 !== garmentSha ||
          world.report.bindings.pairReportSha256 !== mintedPair.reportSha256
        )
          throw new Error(
            'Fresh world preflight differs from the exact private garment/pair binding.',
          );
      };
      await fresh();
      current();
      api = await import('./beta-skirt-saved-annular-observed-placement-runtime-source-v1');
      current();
      const runtimeApi = api;
      const result = await waitForWorldRead(
        runtimeApi
          .buildBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1(
            {
              schemaVersion:
                runtimeApi.BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_RUNTIME_SOURCE_V1,
              garmentOwner: captured.garment,
              pairOwner,
              worldInitialOwner: worldOwner,
              expected: {
                garmentReportSha256: garmentSha,
                pairReportSha256: mintedPair.reportSha256,
                worldReportSha256: mintedWorld.reportSha256,
              },
            },
            operation.controller.signal,
          )
          .then((value) => {
            if (value.ok) {
              if (completed || disposed || issueSignalAborted(operation.controller.signal))
                runtimeApi.disposeBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1(
                  value.owner,
                );
              else created = value;
            }
            return value;
          }),
        operation.controller.signal,
      );
      current();
      // Even a physical refusal must describe the currently retained exact parent reports.
      await fresh();
      current();
      if (!result.ok)
        return Object.freeze({
          ...result,
          generation: captured.generation,
          sourceContextBound: true,
        });
      const childProjection = await waitForWorldRead(
        runtimeApi.projectBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1(result.owner),
        operation.controller.signal,
      );
      current();
      if (!childProjection || childProjection.report.reportSha256 !== result.report.reportSha256)
        throw new Error('Runtime source changed before publication.');
      const childLife = runtimeApi.getBetaSkirtSavedAnnularObservedPlacementRuntimeSourceLifetimeV1(
        result.owner,
      );
      current();
      if (!childLife || issueSignalAborted(childLife))
        throw new Error('Owned runtime source expired before publication.');
      removeChildListener = () => Reflect.apply(nativeIssueRemove, childLife, ['abort', unlink]);
      Reflect.apply(nativeIssueAdd, childLife, ['abort', unlink, { once: true }]);
      current();
      if (issueSignalAborted(childLife))
        throw new Error('Owned runtime source was revoked by a final source poll.');
      retained = true;
      return Object.freeze({
        ...result,
        generation: captured.generation,
        sourceContextBound: true,
      });
    } catch (error) {
      const cancelled =
        issueSignalAborted(signal) || (scope ? issueSignalAborted(scope.controller.signal) : false);
      disposeCreated();
      return runtimeSourceRefused(
        captured.generation,
        true,
        disposed
          ? 'session-disposed'
          : cancelled
            ? 'session-cancelled'
            : 'saved-runtime-source-handoff-failed',
        error instanceof Error ? error.message : 'Runtime source handoff failed closed.',
      );
    } finally {
      completed = true;
      if (pendingPair === scope) pendingPair = null;
      if (!retained) {
        if (scope) closeScope(scope);
        unlink();
      }
    }
  };

  const projectLatestMesh = async (
    expectedGeneration: number,
    signal?: AbortSignal,
  ): Promise<PatternImportDxfProductSavedAnnularObservedPlacementMeshProjectionV1 | null> => {
    const captured = source;
    const current = () => {
      if (
        kind !== 'observed' ||
        !captured ||
        disposed ||
        running ||
        issueSignalAborted(signal) ||
        !Number.isSafeInteger(expectedGeneration) ||
        expectedGeneration < 1 ||
        expectedGeneration !== captured.generation ||
        !sourceCurrent(captured) ||
        compile.snapshot().generation !== captured.generation
      )
        throw new Error('The observed compiler projection is no longer current.');
    };
    try {
      current();
      const projection = compile.projectLatest();
      current();
      if (!projection || projection.composerCanonicalSha256 !== captured!.composerSha) return null;
      // Keep publication current across this Promise-returning API's final continuation.
      await Promise.resolve();
      current();
      return Object.freeze({ generation: captured!.generation, projection });
    } catch {
      return null;
    }
  };

  const session = Object.freeze({
    consume,
    advanceSavedGarment,
    projectLatestGarment,
    ...(kind === 'observed' ? { projectLatestMesh } : {}),
    snapshot() {
      if (!running && capability && !capabilityCurrent(capability)) {
        releaseCapability(capability);
        publishBlocked(
          'garment',
          'garment-owner-unavailable',
          'The private garment source is no longer current.',
        );
      }
      const compiled = compile.snapshot();
      return Object.freeze({
        schemaVersion:
          kind === 'legacy'
            ? PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_SESSION_V1
            : PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_SESSION_V1,
        generation: compiled.generation,
        disposed,
        running,
        status,
        composerCanonicalSha256: compiled.composerCanonicalSha256,
        composerV3CanonicalSha256: compiled.composerV3CanonicalSha256,
        garmentReportSha256:
          capability?.kind === 'garment' ? capability.garment.report.canonicalSha256 : null,
        ...(kind === 'observed'
          ? {
              issuedPlacementCanonicalSha256:
                capability?.kind === 'observed-placement'
                  ? capability.issued.seal.canonicalSha256
                  : null,
            }
          : {}),
        blocker,
        claims: CLAIMS,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch += 1;
      status = 'disposed';
      blocker = null;
      revokeGarment();
      closeScope(sourceScope);
      sourceScope = null;
      source = null;
      compile.dispose();
    },
  });
  observedPairHandoffs.set(session, Object.freeze({ kind, build: buildObservedBodyPair }));
  if (kind === 'observed') {
    observedPlacementIssuers.set(session, issueObservedPlacement);
    observedWorldHandoffs.set(session, buildWorldInitialPreflight);
    observedRuntimeSourceHandoffs.set(session, buildRuntimeSource);
    observedMeshProjectors.set(session, projectLatestMesh);
  }
  return session as Session;
}

/** Existing default stays the historical Placement V2 session. */
export function createPatternImportDxfProductSavedAnnularGarmentSessionV1(): PatternImportDxfProductSavedAnnularGarmentSessionV1 {
  return createSession('legacy') as PatternImportDxfProductSavedAnnularGarmentSessionV1;
}
/** Fixed Placement V3 entry; no historical body target is synthesized or consumed. */
export function createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1(): PatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1 {
  return createSession(
    'observed',
  ) as PatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1;
}
