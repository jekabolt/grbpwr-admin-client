import { useSavedClothPhysicalHostV1 } from '../phase-e-workbench-v2/use-saved-cloth-physical-host-v1';
import { SavedClothPhysicalControlsV1 } from 'components/cloth-simulation-spike/saved-cloth-physical-controls-v1';
import type { CadWorkbenchPhysicalHostV1 } from '../phase-e-workbench-v2/cad-workbench-physical-host-v1';
import type { TechCardFormData } from 'components/managers/tech-card/components/schema';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import {
  rowsOf,
  useSeamsStore,
} from 'components/managers/tech-card/components/assembly-seams/seams-store';
import type { StoredSeam } from 'lib/seams';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAuthoringChoicesV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-producer-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type AssemblyContext,
  type CardDraft,
} from 'lib/pattern-import/types';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useWatch } from 'react-hook-form';
import { Button, CalloutBox, Pill, Row, Text } from 'ui';

import {
  adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyV1,
  type PatternImportDxfPhaseEWorkbenchExistingAssemblyAdapterResultV1,
} from '../phase-e-workbench-existing-assembly-adapter-v1';
import type {
  PatternImportDxfProductPhaseEWorkbenchEntryRequestV1,
  PatternImportDxfProductPhaseEWorkbenchEntryResultV1,
} from '../product-semantic-sidecar-card-controller-v1';
import {
  derivePatternImportDxfPhaseEDocumentAuthorityV1,
  type PatternImportDxfPhaseEDocumentEvidenceV1,
} from '../phase-e-workbench-document-authority-v1';
import {
  readPatternImportDxfPhaseECardSessionV1,
  subscribePatternImportDxfPhaseECardSessionV1,
  type PatternImportDxfPhaseECardSessionV1,
} from '../phase-e-workbench-card-session-v1';
import { loadPatternImportDxfPhaseEWorkbenchBetaMaterialPresetsV1 } from '../phase-e-workbench-beta-material-presets-v1';
import {
  PatternImportDxfPhaseEMultiseamAssemblyOrderEntryV2,
  persistPatternImportDxfPhaseEMultiseamExactChoicesV2,
  type PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2,
  type PatternImportDxfPhaseEMultiseamFreshConfirmV2,
  type PatternImportDxfPhaseEMultiseamSavedConfirmV2,
  type PatternImportDxfPhaseEMultiseamSavedDownstreamV2,
  type PatternImportDxfPhaseEMultiseamSavedSessionV2,
} from '../phase-e-workbench-v2/assembly-order-entry';
import { createPatternImportDxfPhaseEExactCompositeProductionPersistenceV3 } from '../phase-e-workbench-v2/exact-composite-persistence-v3';
import { createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1 } from '../phase-e-workbench-v2/saved-assembly-snapshot-production-rpc-v1';
import { buildPatternImportDxfPhaseESavedCardProductionProjectionV1 } from '../phase-e-workbench-v2/saved-card-production-projection-v1';
import { createPatternImportDxfPhaseESavedRowProductionRuntimeV1 } from '../phase-e-workbench-v2/saved-row-production-runtime-v1';
import { buildPatternImportDxfPhaseEStitchVisualV1 } from '../phase-e-workbench-v2/stitch-visual-v1';
import { projectPatternImportDxfPhaseECadTableCurrentOperationV1 } from '../phase-e-workbench-v2/cad-table-current-operation-projection-v1';
import type { PatternImportDxfPhaseECadCommandAuthoringHandoffOwnerV1 } from '../phase-e-workbench-v2/cad-command-draft-authoring-handoff-v1';
import type { PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1 } from '../phase-e-workbench-v2/cad-table-zero-connect-authoring-handoff-v1';
import type { PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffOwnerV1 } from '../phase-e-workbench-v2/cad-table-cross-scope-authoring-handoff-v1';
import type { PatternImportDxfPhaseECadTablePressAuthoringOwnerV1 } from '../phase-e-workbench-v2/cad-table-press-authoring-v1';
import type { PatternImportDxfPhaseECadOperationNavigationV1 } from '../phase-e-workbench-v2/cad-operation-navigation-v1';
import type { PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1 } from '../phase-e-workbench-v2/cad-workbench-stitch-editor-handoff-v1';
import type { PatternImportDxfPhaseECadWorkbenchStitchEditCapabilitiesV1 } from '../phase-e-workbench-v2/cad-workbench-stitch-route-intent-v1';
import type { PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 } from '../phase-e-workbench-v2/exact-n-seam-production-mount-v2';
import { clearPatternImportDxfProductExactNSeamProductionSessionV2 } from '../phase-e-workbench-v2/exact-n-seam-production-session-v2';
import type { PatternImportDxfProductCompositeSidecarApplicationTransactionV4 } from '../phase-e-workbench-v2/composite-sidecar-production-transaction-v4';
import {
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1,
  createPatternImportDxfPhaseEZeroConnectProductionDurableBridgeV1,
} from '../phase-e-workbench-v2/zero-connect-durable-composite-v4';
import { projectPatternImportDxfPhaseECadWorkbenchColorwaysV1 } from '../phase-e-workbench-v2/cad-workbench-bom-visual-authority-v1';
import { PatternImportDxfPhaseECadTableZeroOperationProductionMountV1 } from '../phase-e-workbench-v2/cad-table-zero-operation-production-mount-v1';
import { preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1 } from '../phase-e-workbench-v2/cad-mannequin-saved-all-scope-staging-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_SAVED_MATERIAL_SCOPE_EDITOR_PREPARATION_CLAIMS_V1,
  preparePatternImportDxfPhaseECadSavedMaterialScopeEditorsV1,
} from '../phase-e-workbench-v2/cad-saved-material-scope-editor-preparation-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from '../phase-e-workbench-v2/cad-table-zero-operation-generation-owner-v1';
import {
  beginPatternImportDxfPhaseEDurableRestoreAttemptV1,
  completePatternImportDxfPhaseEDurableRestoreAttemptV1,
  releasePatternImportDxfPhaseEDurableRestoreAttemptV1,
  type PatternImportDxfPhaseEDurableRestoreAttemptSlotV1,
} from '../phase-e-workbench-v2/durable-restore-attempt-v1';
import {
  blockPatternImportDxfPhaseEDurableReloadRetryV1,
  createPatternImportDxfPhaseEDurableReloadRetryV1,
  retryPatternImportDxfPhaseEDurableReloadRetryV1,
  startPatternImportDxfPhaseEDurableReloadRetryV1,
  type PatternImportDxfPhaseEDurableReloadBlockerV1,
  type PatternImportDxfPhaseEDurableReloadRetryStateV1,
} from '../phase-e-workbench-v2/durable-reload-retry-v1';
import {
  matchesPatternImportDxfProductExactNSessionFreshAuthorityV1,
  matchesPatternImportDxfProductExactNSessionSavedBindingV1,
  patternImportDxfProductExactNSessionValidationKeyV1,
} from '../phase-e-workbench-v2/durable-exact-session-current-v1';
import { preparePatternImportDxfPhaseECadTableZeroOperationSavedV1 } from '../phase-e-workbench-v2/cad-table-zero-operation-saved-preparation-v1';
import { createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1 } from '../phase-e-workbench-v2/zero-operation-saved-card-authority-v1';
import { PatternImportDxfPhaseECadTableDraftOperationsPanelV1 } from '../phase-e-workbench-v2/cad-table-draft-operations-panel-v1';
import type { PatternImportDxfPhaseECadTableDraftOperationSessionBridgeResultV1 } from '../phase-e-workbench-v2/cad-table-draft-operation-session-bridge-v1';
import type { PatternImportDxfProductPhaseEMaterialRevisionOptionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { PatternImportDxfProductPhaseEWorkbenchResultV1 } from './contract';
import {
  PatternImportDxfProductPhaseEWorkbenchV1,
  type PatternImportDxfProductPhaseEInspectorSideV1,
} from './workbench';

type FormOperation = NonNullable<TechCardFormData['operations']>[number];

export function routePatternImportDxfPhaseEAssemblyOrderEntryV2(
  seamKeys: readonly string[],
): 'v1' | 'v2' {
  return seamKeys.map((key) => key.trim()).filter(Boolean).length === 1 ? 'v1' : 'v2';
}

export function keepPatternImportDxfPhaseECadWorkbenchHostV1(
  entryRoute: 'v1' | 'v2' | null,
  workbenchOpen: boolean,
): boolean {
  return entryRoute === 'v2' || workbenchOpen;
}

export function resolvePatternImportDxfPhaseEWorkbenchRequestedV1(
  workbenchOpen: boolean,
  autoOpen: boolean,
): boolean {
  return workbenchOpen || autoOpen;
}

export function shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
  workbenchOpen,
  exactNSessionAvailable,
  savedProjectionBlockerCode,
  selectedSeamCount,
}: Readonly<{
  workbenchOpen: boolean;
  exactNSessionAvailable: boolean;
  savedProjectionBlockerCode: string | null;
  selectedSeamCount: number;
}>): boolean {
  const operationCanBeCompletedOnTable =
    (selectedSeamCount === 1 && savedProjectionBlockerCode === null) ||
    savedProjectionBlockerCode === 'saved-operation-missing' ||
    savedProjectionBlockerCode === 'saved-operation-not-two-seam';
  return workbenchOpen && !exactNSessionAvailable && operationCanBeCompletedOnTable;
}

export const PATTERN_IMPORT_DXF_PHASE_E_ASSEMBLY_ORDER_ENTRY_CONTRACT_V1 = Object.freeze({
  mountedFromSelectedAssemblyOrderOperation: true,
  existingOperationsAreSoleOrderAuthority: true,
  existingStoredSeamIsSoleTopologyAuthority: true,
  createsSecondAssemblyEditor: false,
  patternsTabOwnsEntry: false,
  edgeHintOrRangeUsedAsExactGeometry: false,
  reloadWithoutSavedPhaseDReplayFailsClosed: true,
  requiredSavedReplayCarrier: 'DxfProductPhaseDReplayCarrierV1',
  requiredSavedWriterCarrier: 'DraftWriterReplayV1',
  stateResetUsesExactSeamAndCarrierEvidence: true,
  prepareSerializedPerControllerOwner: true,
  stalePrepareOrSubmitPublishesUiState: false,
  authorityAcceptanceIndependentFromAttachmentVerification: true,
  unverifiedAttachmentClaimsConfirmedReceipt: false,
  freshSavedRowRevalidatedBeforeAuthoring: true,
  freshSavedRowRevalidatedBeforeConfirmedCommitBinding: true,
  authoredAuthorityBoundToExactConfirmedCommitBeforeAttachment: true,
  importGenerationIncludedInResetAndAuthoredChoices: true,
  physicalClothCompilationOwnedByAssemblyTable: false,
  physicalClothRuntimeOwnedByAssemblyTable: false,
  syntheticPhysicalRequestCreated: false,
  stitchEditCapabilitiesForwardedFromExistingOperationEditor: true,
  stitchEditRouteCreatesSecondFormOwner: false,
  stitchEditRouteRequestsAutosave: false,
  colorwayOptionsProjectedFromExactSavedCard: true,
  staleOrAmbiguousColorwayFailsClosed: true,
  stitchThreadRequiresUniqueBomLineIdentity: true,
  exactNCompositeV4OptionalBoundaryForwarded: true,
  exactNFixtureOrFallbackOwnerCreated: false,
  savedGarmentMeshDownstreamProductionInjected: true,
  savedGarmentCompileSessionLazyLoadedAfterVerifiedPersistence: true,
  savedGarmentCompilerReadyBeforeOneShotSourceHandoff: true,
  savedGarmentCompileSessionKeyedToSavedRowAndOperation: true,
  previewLoadsOrConsumesSavedCompilerSource: false,
} as const);

// Match the qualified canonical local-frame/actual-body discretization (244 boundary vertices).
export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_GARMENT_TARGET_EDGE_MM_V1 = 12.5;

type BaseSavedGarmentCompileSessionV1 = ReturnType<
  (typeof import('lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-compile-session-v1'))['createPatternImportDxfProductSavedGarmentMeshCompileSessionV1']
>;
type SavedCompiledResultV1 = Extract<
  Awaited<ReturnType<BaseSavedGarmentCompileSessionV1['consume']>>,
  { ok: true }
>;
type SavedPhysicalSessionV1 = ReturnType<
  (typeof import('components/cloth-simulation-spike/pattern-import-dxf-product-saved-physical-session-v1'))['createPatternImportDxfProductSavedPhysicalSessionV1']
>;
type SavedGarmentCompileSessionV1 = Pick<
  BaseSavedGarmentCompileSessionV1,
  'consume' | 'projectLatest' | 'snapshot' | 'dispose'
> &
  Partial<
    Pick<
      SavedPhysicalSessionV1,
      | 'projectLatestRefined'
      | 'projectLatestActualBody'
      | 'physicalStage'
      | 'buildLatestConfirmedPlacementSidecar'
      | 'advanceActualBody'
      | 'invalidateActualBody'
      | 'buildLatestRuntimeSource'
      | 'runBetaPreview'
      | 'stopBetaPreview'
    >
  >;

export type PatternImportDxfPhaseESavedGarmentMeshCompileSessionLoaderV1 = () => Promise<{
  createPatternImportDxfProductSavedGarmentMeshCompileSessionV1: () => SavedGarmentCompileSessionV1;
}>;

export type PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1 = Readonly<{
  downstream: PatternImportDxfPhaseEMultiseamSavedDownstreamV2;
  projectLatest: SavedGarmentCompileSessionV1['projectLatest'];
  snapshot: () => ReturnType<SavedGarmentCompileSessionV1['snapshot']> | null;
  latestCompile: () => SavedCompiledResultV1 | null;
  subscribe: (listener: () => void) => () => void;
  version: () => number;
  projectLatestRefined: () => ReturnType<SavedPhysicalSessionV1['projectLatestRefined']>;
  projectLatestActualBody: () => ReturnType<SavedPhysicalSessionV1['projectLatestActualBody']>;
  physicalStage: () => ReturnType<SavedPhysicalSessionV1['physicalStage']> | null;
  buildLatestConfirmedPlacementSidecar: SavedPhysicalSessionV1['buildLatestConfirmedPlacementSidecar'];
  advanceActualBody: SavedPhysicalSessionV1['advanceActualBody'];
  invalidateActualBody: SavedPhysicalSessionV1['invalidateActualBody'];
  buildLatestRuntimeSource: SavedPhysicalSessionV1['buildLatestRuntimeSource'];
  runBetaPreview: SavedPhysicalSessionV1['runBetaPreview'];
  stopBetaPreview: SavedPhysicalSessionV1['stopBetaPreview'];
  dispose: () => void;
}>;

export function patternImportDxfPhaseESavedGarmentMeshOwnerKeyV1(
  row: DxfProductSavedRowIdentityV1,
  selectedOperationNumber: number,
): string {
  return JSON.stringify([
    row.techCardId,
    row.scopeKey,
    row.patternLineKey,
    row.revision,
    row.cardLockVersion,
    row.url,
    row.sizeBytes,
    row.sha256,
    selectedOperationNumber,
  ]);
}

/** Lazy cloth-owned boundary. `ready` loads the chunk before the one-shot source is handed off. */
export function createPatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1(
  loadCompileSession: PatternImportDxfPhaseESavedGarmentMeshCompileSessionLoaderV1 = () =>
    import(
      'components/cloth-simulation-spike/pattern-import-dxf-product-saved-physical-session-v1'
    ),
): PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1 {
  let disposed = false;
  let modulePromise: ReturnType<PatternImportDxfPhaseESavedGarmentMeshCompileSessionLoaderV1> | null =
    null;
  let session: SavedGarmentCompileSessionV1 | null = null;
  let latestCompile: SavedCompiledResultV1 | null = null;
  let version = 0;
  const listeners = new Set<() => void>();
  const publish = () => {
    version += 1;
    for (const listener of listeners) listener();
  };

  const ready = async (signal: AbortSignal) => {
    if (disposed) throw new Error('The saved garment compile owner is disposed.');
    if (signal.aborted) throw new Error('The saved garment compile owner was cancelled.');
    if (session) return;
    modulePromise ??= loadCompileSession();
    let module: Awaited<ReturnType<PatternImportDxfPhaseESavedGarmentMeshCompileSessionLoaderV1>>;
    try {
      module = await modulePromise;
    } catch (error) {
      modulePromise = null;
      throw error;
    }
    if (disposed) throw new Error('The saved garment compile owner was disposed while loading.');
    if (signal.aborted)
      throw new Error('The saved garment compile owner was cancelled while loading.');
    session ??= module.createPatternImportDxfProductSavedGarmentMeshCompileSessionV1();
  };

  const downstream: PatternImportDxfPhaseEMultiseamSavedDownstreamV2 = Object.freeze({
    targetEdgeMm: PATTERN_IMPORT_DXF_PHASE_E_SAVED_GARMENT_TARGET_EDGE_MM_V1,
    physicalStage: () => session?.physicalStage?.() ?? null,
    ready,
    consume: async (request, signal) => {
      if (disposed) throw new Error('The saved garment compile owner is disposed.');
      if (!session)
        throw new Error('The saved garment compiler must be ready before source handoff.');
      latestCompile = null;
      publish();
      try {
        const result = await session.consume(request, signal);
        if (!disposed && result.ok) latestCompile = result;
        return result;
      } finally {
        if (!disposed) publish();
      }
    },
  });

  return Object.freeze({
    downstream,
    projectLatest: () => session?.projectLatest() ?? null,
    snapshot: () => session?.snapshot() ?? null,
    latestCompile: () => (latestCompile ? structuredClone(latestCompile) : null),
    subscribe: (listener) => {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => version,
    projectLatestRefined: () => session?.projectLatestRefined?.() ?? null,
    projectLatestActualBody: () => session?.projectLatestActualBody?.() ?? null,
    physicalStage: () => session?.physicalStage?.() ?? null,
    buildLatestConfirmedPlacementSidecar: async (input, signal) => {
      if (disposed || !session?.buildLatestConfirmedPlacementSidecar)
        throw new Error('The saved placement authoring session is unavailable.');
      return session.buildLatestConfirmedPlacementSidecar(input, signal);
    },
    advanceActualBody: async (input, signal) => {
      if (disposed || !session?.advanceActualBody)
        throw new Error('The saved actual-body session is unavailable.');
      try {
        return await session.advanceActualBody(input, signal);
      } finally {
        if (!disposed) publish();
      }
    },
    buildLatestRuntimeSource: async (generation, signal) => {
      if (disposed || !session?.buildLatestRuntimeSource)
        throw new Error('The saved runtime-source session is unavailable.');
      try {
        return await session.buildLatestRuntimeSource(generation, signal);
      } finally {
        if (!disposed) publish();
      }
    },
    invalidateActualBody: (generation) => {
      if (disposed) return false;
      const changed = session?.invalidateActualBody?.(generation) ?? false;
      if (changed) publish();
      return changed;
    },
    runBetaPreview: async (generation, computeCanvas, displayCanvas, signal) => {
      if (disposed || !session?.runBetaPreview)
        throw new Error('The saved physical preview session is unavailable.');
      try {
        return await session.runBetaPreview(generation, computeCanvas, displayCanvas, signal);
      } finally {
        if (!disposed) publish();
      }
    },
    stopBetaPreview: () => {
      if (disposed) return false;
      const stopped = session?.stopBetaPreview?.() ?? false;
      if (stopped) publish();
      return stopped;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      session?.dispose();
      session = null;
      latestCompile = null;
      publish();
      listeners.clear();
    },
  });
}

export type PatternImportDxfPhaseEAssemblyOrderSourceV1 = Readonly<{
  assembly: AssemblyContext;
  selectedOperationNumber: number;
  selectedSeamKey: string;
}>;

export type PatternImportDxfPhaseEAssemblyOrderFreshSessionV1 = Readonly<{
  draft: CardDraft;
  importGeneration: number;
  scopeKey: string;
  sizeToken: string;
  /** Optional persisted identity. Never substitute the operation display number. */
  authoringOperationId: string | null;
  /** Stable card-controller owner used only to serialize its one prepared-context slot. */
  prepareOwner: object;
  loadDocumentEvidence: (scopeKey: string) => Promise<
    | Readonly<{ ok: true; evidence: PatternImportDxfPhaseEDocumentEvidenceV1; blocker: null }>
    | Readonly<{
        ok: false;
        evidence: null;
        blocker: Readonly<{ code: string; detail: string }>;
      }>
  >;
  loadMaterialOptions: () => Promise<
    readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[]
  >;
  preparePhaseEWorkbench: (
    draft: CardDraft,
    request: PatternImportDxfProductPhaseEWorkbenchEntryRequestV1,
  ) => Promise<PatternImportDxfProductPhaseEWorkbenchEntryResultV1>;
  submitChoices: (
    catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
    choices: PatternImportDxfProductPhaseEAuthoringChoicesV1,
  ) => Promise<PatternImportDxfPhaseEAssemblyOrderSubmitResultV1>;
}>;

export type PatternImportDxfPhaseEAssemblyOrderSubmitBlockerV1 = Readonly<{
  code: string;
  detail: string;
}>;

export type PatternImportDxfPhaseEAssemblyOrderAttachmentStatusV1 =
  | 'not-attempted'
  | 'verified'
  | 'retryable'
  | 'rebuild-required'
  | 'blocked'
  | 'not-requested'
  | 'failed'
  | 'threw';

/**
 * Phase-E authority and the post-save attachment are deliberately independent outcomes. Once the
 * authority is accepted, an attachment failure must remain visible without pretending to undo it.
 */
export type PatternImportDxfPhaseEAssemblyOrderSubmitResultV1 =
  | Readonly<{
      authorityStatus: 'refused';
      attachmentStatus: 'not-attempted';
      blockers: readonly PatternImportDxfPhaseEAssemblyOrderSubmitBlockerV1[];
    }>
  | Readonly<{
      authorityStatus: 'accepted';
      attachmentStatus: Exclude<
        PatternImportDxfPhaseEAssemblyOrderAttachmentStatusV1,
        'not-attempted'
      >;
      blockers: readonly PatternImportDxfPhaseEAssemblyOrderSubmitBlockerV1[];
    }>;

export type PatternImportDxfPhaseEAssemblyOrderAsyncTicketV1 = Readonly<{
  generation: number;
  signal: AbortSignal;
  isCurrent: () => boolean;
}>;

/**
 * Component-local cancellation/generation gate. The controller API has no AbortSignal yet, so the
 * signal cancels publication rather than pretending it can stop work already running elsewhere.
 */
export function createPatternImportDxfPhaseEAssemblyOrderAsyncGateV1() {
  let generation = 0;
  let active: AbortController | null = null;
  const invalidate = () => {
    generation += 1;
    active?.abort();
    active = null;
  };
  return Object.freeze({
    begin(): PatternImportDxfPhaseEAssemblyOrderAsyncTicketV1 {
      invalidate();
      const controller = new AbortController();
      active = controller;
      const ownGeneration = generation;
      return Object.freeze({
        generation: ownGeneration,
        signal: controller.signal,
        isCurrent: () =>
          !controller.signal.aborted && active === controller && generation === ownGeneration,
      });
    },
    invalidate,
  });
}

const prepareTails = new WeakMap<object, Promise<void>>();

/**
 * The card controller owns one prepared-authoring context. Serializing by that owner guarantees a
 * late older prepare cannot finish after a newer prepare and replace the context the UI will use.
 */
export async function runPatternImportDxfPhaseEAssemblyOrderSerializedPrepareV1(
  freshSession: PatternImportDxfPhaseEAssemblyOrderFreshSessionV1,
  request: PatternImportDxfProductPhaseEWorkbenchEntryRequestV1,
): Promise<PatternImportDxfProductPhaseEWorkbenchEntryResultV1> {
  const previous = prepareTails.get(freshSession.prepareOwner) ?? Promise.resolve();
  const run = previous.then(() => freshSession.preparePhaseEWorkbench(freshSession.draft, request));
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  prepareTails.set(freshSession.prepareOwner, tail);
  try {
    return await run;
  } finally {
    if (prepareTails.get(freshSession.prepareOwner) === tail)
      prepareTails.delete(freshSession.prepareOwner);
  }
}

export type PatternImportDxfPhaseEAssemblyOrderEntryBlockerV1 = Readonly<{
  code:
    | PatternImportDxfPhaseEWorkbenchExistingAssemblyAdapterResultV1['blockers'][number]['code']
    | 'saved-dxf-phase-d-replay-carrier-unavailable'
    | 'saved-dxf-writer-replay-carrier-unavailable'
    | 'fresh-dxf-scope-binding-unavailable'
    | 'fresh-dxf-size-token-unavailable';
  detail: string;
}>;

function exactAssemblyEvidence(
  source: PatternImportDxfPhaseEAssemblyOrderSourceV1,
): Readonly<Record<string, unknown>> {
  const operation = source.assembly.ops.find(
    ({ number }) => number === source.selectedOperationNumber,
  );
  const seam = source.assembly.seams.find(
    (candidate) => 'seamKey' in candidate && candidate.seamKey === source.selectedSeamKey,
  );
  const anchor = (value: {
    pieceLineKey: string;
    edgeHint: string;
    range: readonly [number, number];
    lenMm: number;
    contourSig: string;
  }) => ({
    pieceLineKey: value.pieceLineKey,
    edgeHint: value.edgeHint,
    range: [value.range[0], value.range[1]],
    lenMm: value.lenMm,
    contourSig: value.contourSig,
  });
  return {
    selectedOperationNumber: source.selectedOperationNumber,
    selectedSeamKey: source.selectedSeamKey,
    operation: operation
      ? {
          number: operation.number,
          work: operation.work,
          inputKeys: operation.inputKeys,
          outputUnitKey: operation.outputUnitKey,
          outputUnitName: operation.outputUnitName,
          seamKeys: operation.seamKeys,
        }
      : null,
    seam:
      seam && 'seamKey' in seam
        ? {
            seamKey: seam.seamKey,
            confirmed: seam.confirmed,
            stale: seam.stale,
            kind: seam.kind,
            direction: seam.direction,
            anchoredSize: seam.anchoredSize,
            sideA: seam.sideA.map(anchor),
            sideB: seam.sideB.map(anchor),
          }
        : null,
  };
}

function exactSessionEvidence(
  freshSession: PatternImportDxfPhaseEAssemblyOrderFreshSessionV1 | null,
): Readonly<Record<string, unknown>> | null {
  if (!freshSession) return null;
  const draft = freshSession.draft;
  const binding = draft.dxfProvenance?.contentBinding;
  const replay = draft.dxfPhaseDReplay?.carrier;
  const scope = draft.scopes.find(({ target }) => target.scopeKey === freshSession.scopeKey);
  const writer = scope?.writerReplay;
  return {
    techCardId: draft.techCardId,
    importGeneration: freshSession.importGeneration,
    scopeKey: freshSession.scopeKey,
    sizeToken: freshSession.sizeToken,
    authoringOperationId: freshSession.authoringOperationId,
    contentBinding: binding
      ? {
          schemaVersion: binding.schemaVersion,
          sourceFileId: binding.sourceFileId,
          sourceSha256: binding.sourceSha256,
          selectedGeometrySha256: binding.selectedGeometrySha256,
        }
      : null,
    replay: replay
      ? {
          schemaVersion: replay.schemaVersion,
          sourceFileId: replay.sourceFileId,
          sourceSha256: replay.sourceSha256,
          selectedGeometrySha256: replay.selectedGeometrySha256,
        }
      : null,
    writer: writer
      ? {
          schemaVersion: writer.schemaVersion,
          createdAt: writer.createdAt,
          techCardId: writer.job.techCardId ?? null,
          scopeKey: writer.job.scope?.scopeKey ?? null,
          dialect: writer.job.dialect,
          generator: writer.job.generator,
          pieces: writer.job.pieces?.map(({ identity }) => identity) ?? [],
          sizes: writer.job.sizes?.map(({ token }) => token) ?? [],
          sourceFiles:
            writer.job.source?.files?.map(({ kind, sha256, bytes }) => ({
              kind,
              sha256,
              bytes,
            })) ?? [],
        }
      : null,
    manifestCreatedAt: scope?.manifest?.createdAt ?? null,
  };
}

/** React reset key only; authority remains in the controller and sealed Phase-D catalog. */
export function patternImportDxfPhaseEAssemblyOrderEntryIdentityV1(
  source: PatternImportDxfPhaseEAssemblyOrderSourceV1,
  freshSession: PatternImportDxfPhaseEAssemblyOrderFreshSessionV1 | null,
): string {
  return JSON.stringify({
    assembly: exactAssemblyEvidence(source),
    session: exactSessionEvidence(freshSession),
  });
}

export type PatternImportDxfPhaseEAssemblyOrderPreparationV1 =
  | Readonly<{
      ok: true;
      request: Omit<PatternImportDxfProductPhaseEWorkbenchEntryRequestV1, 'documentEvidence'>;
      proposalSource: Readonly<{ confirmed: boolean; stale: boolean }>;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      request: null;
      proposalSource: null;
      blocker: PatternImportDxfPhaseEAssemblyOrderEntryBlockerV1;
    }>;

function operationNumber(operation: FormOperation | undefined): number {
  const value = Number(operation?.operationNumber ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function exactSeamContext(seam: StoredSeam): AssemblyContext['seams'][number] {
  const anchor = (value: StoredSeam['sideA'][number]) => ({
    pieceLineKey: value.piece,
    edgeHint: value.edgeHint,
    range: [value.range[0], value.range[1]] as [number, number],
    lenMm: value.lenMm,
    contourSig: value.contourSig,
    samples: value.samples.map(([u, v]) => [u, v] as [number, number]),
    ...(value.layer ? { layer: value.layer } : {}),
  });
  return {
    seamKey: seam.seamKey,
    pieces: [...new Set([...seam.sideA, ...seam.sideB].map(({ piece }) => piece))],
    confirmed: seam.status === 'confirmed',
    stale: !!seam.stale,
    kind: seam.kind,
    direction: seam.direction,
    source: seam.source,
    anchoredSize: seam.anchoredSize,
    sideA: seam.sideA.map(anchor),
    sideB: seam.sideB.map(anchor),
  };
}

export function buildPatternImportDxfPhaseEAssemblyOrderSourceV1(
  operations: readonly FormOperation[],
  seams: readonly StoredSeam[],
  selectedIndex: number,
): PatternImportDxfPhaseEAssemblyOrderSourceV1 | null {
  const selected = operations[selectedIndex];
  if (!selected) return null;
  const selectedSeamKeys = (selected.seamKeys ?? []).map((key) => key.trim()).filter(Boolean);
  return Object.freeze({
    assembly: Object.freeze({
      ops: Object.freeze(
        operations.map((operation) =>
          Object.freeze({
            number: operationNumber(operation),
            work: operation.work ?? '',
            inputKeys: Object.freeze(
              (operation.inputKeys ?? []).map((key) => key.trim()).filter(Boolean),
            ) as string[],
            outputUnitKey: (operation.outputUnitKey ?? '').trim(),
            outputUnitName: (operation.outputUnitName ?? '').trim(),
            seamKeys: Object.freeze(
              (operation.seamKeys ?? []).map((key) => key.trim()).filter(Boolean),
            ) as string[],
          }),
        ),
      ) as AssemblyContext['ops'],
      seams: Object.freeze(seams.map(exactSeamContext)) as AssemblyContext['seams'],
    }),
    selectedOperationNumber: operationNumber(selected),
    selectedSeamKey: selectedSeamKeys.length === 1 ? selectedSeamKeys[0] : '',
  });
}

function blocked(
  blocker: PatternImportDxfPhaseEAssemblyOrderEntryBlockerV1,
): PatternImportDxfPhaseEAssemblyOrderPreparationV1 {
  return Object.freeze({ ok: false as const, request: null, proposalSource: null, blocker });
}

export function preparePatternImportDxfPhaseEAssemblyOrderEntryV1(
  source: PatternImportDxfPhaseEAssemblyOrderSourceV1,
  freshSession: PatternImportDxfPhaseEAssemblyOrderFreshSessionV1 | null,
): PatternImportDxfPhaseEAssemblyOrderPreparationV1 {
  const adapted = adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyV1(
    source.assembly,
    source.selectedOperationNumber,
    source.selectedSeamKey,
    freshSession?.authoringOperationId ?? null,
  );
  if (!adapted.ok) return blocked(adapted.blockers[0]);

  const exactSeam = source.assembly.seams.find(
    (seam) => 'seamKey' in seam && seam.seamKey === source.selectedSeamKey,
  );
  if (!exactSeam || !('stale' in exactSeam))
    return blocked({
      code: 'selected-seam-not-exact',
      detail: 'The selected Assembly Order seam is not one exact StoredSeam row.',
    });

  if (
    !freshSession ||
    !Number.isSafeInteger(freshSession.importGeneration) ||
    freshSession.importGeneration <= 0 ||
    !freshSession.draft.dxfProvenance?.pipelineIntegrated ||
    !freshSession.draft.dxfProvenance.carrier ||
    !freshSession.draft.dxfProvenance.contentBinding ||
    !freshSession.draft.dxfPhaseDReplay?.replayReady ||
    !freshSession.draft.dxfPhaseDReplay.carrier
  )
    return blocked({
      code: 'saved-dxf-phase-d-replay-carrier-unavailable',
      detail:
        'This saved card has Assembly Order operations and saved seams, but its original DXF edge identifiers are unavailable. Re-import the DXF to restore exact edge selection.',
    });

  const scopes = freshSession.draft.scopes.filter(
    ({ target }) => target.scopeKey === freshSession.scopeKey,
  );
  if (
    scopes.length !== 1 ||
    scopes[0].writerReplay?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1
  )
    return blocked({
      code: 'saved-dxf-writer-replay-carrier-unavailable',
      detail:
        'The selected material slot no longer has its original DXF piece data. Re-import the DXF before editing edges.',
    });

  return Object.freeze({
    ok: true as const,
    request: Object.freeze({
      scopeKey: freshSession.scopeKey,
      sizeToken: freshSession.sizeToken,
      importGeneration: freshSession.importGeneration,
      selectedOperationNumber: adapted.selectedOperationNumber,
      existingAssembly: adapted.existingAssembly,
    }),
    proposalSource: Object.freeze({
      confirmed: exactSeam.confirmed,
      stale: exactSeam.stale,
    }),
    blocker: null,
  });
}

export type PatternImportDxfPhaseEAssemblyOrderSessionResolutionV1 =
  | Readonly<{
      ok: true;
      freshSession: PatternImportDxfPhaseEAssemblyOrderFreshSessionV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      freshSession: null;
      blocker: PatternImportDxfPhaseEAssemblyOrderEntryBlockerV1;
    }>;

type CardAttachmentResult = Awaited<
  ReturnType<PatternImportDxfPhaseECardSessionV1['controller']['afterConfirmedSave']>
>;

function attachmentBlockers(
  blockers: readonly Readonly<{ code: string; detail: string }>[],
  fallback: PatternImportDxfPhaseEAssemblyOrderSubmitBlockerV1,
): readonly PatternImportDxfPhaseEAssemblyOrderSubmitBlockerV1[] {
  return Object.freeze(
    blockers.length
      ? blockers.map(({ code, detail }) => Object.freeze({ code, detail }))
      : [Object.freeze(fallback)],
  );
}

/** Fail-closed projection of the runtime result: only a verified attempt may claim attachment. */
export function projectPatternImportDxfPhaseEAssemblyOrderAttachmentResultV1(
  result: CardAttachmentResult,
): Extract<PatternImportDxfPhaseEAssemblyOrderSubmitResultV1, { authorityStatus: 'accepted' }> {
  if (result.status === 'not-requested')
    return Object.freeze({
      authorityStatus: 'accepted' as const,
      attachmentStatus: 'not-requested' as const,
      blockers: Object.freeze([
        Object.freeze({
          code: 'semantic-attachment-not-requested',
          detail: 'The assembly update was saved, but no pattern metadata update was requested.',
        }),
      ]),
    });
  if (result.status === 'blocked')
    return Object.freeze({
      authorityStatus: 'accepted' as const,
      attachmentStatus: 'blocked' as const,
      blockers: Object.freeze([
        Object.freeze({
          code: result.blocker.code,
          detail: result.blocker.detail,
        }),
      ]),
    });

  const snapshotStatus = result.snapshot?.status;
  if (
    result.attempt.ok &&
    snapshotStatus === 'verified' &&
    result.snapshot.attachmentStatus === 'verified'
  )
    return Object.freeze({
      authorityStatus: 'accepted' as const,
      attachmentStatus: 'verified' as const,
      blockers: Object.freeze([]),
    });

  const runtimeBlockers = result.attempt.ok ? [] : result.attempt.blockers;
  if (snapshotStatus === 'retryable')
    return Object.freeze({
      authorityStatus: 'accepted' as const,
      attachmentStatus: 'retryable' as const,
      blockers: attachmentBlockers(runtimeBlockers, {
        code: 'semantic-attachment-retryable',
        detail:
          'The assembly update was saved, but pattern metadata could not be verified. Retry from the card.',
      }),
    });
  if (snapshotStatus === 'rebuild-required')
    return Object.freeze({
      authorityStatus: 'accepted' as const,
      attachmentStatus: 'rebuild-required' as const,
      blockers: attachmentBlockers(runtimeBlockers, {
        code: 'semantic-attachment-rebuild-required',
        detail:
          'The assembly update was saved, but pattern metadata must be rebuilt from the current card.',
      }),
    });
  if (
    !result.attempt.ok &&
    result.attempt.blockers.some(
      ({ code }) => code === 'invalid-owner' || code === 'reentrant-attempt',
    )
  )
    return Object.freeze({
      authorityStatus: 'accepted' as const,
      attachmentStatus: 'blocked' as const,
      blockers: attachmentBlockers(runtimeBlockers, {
        code: 'semantic-attachment-blocked',
        detail: 'The assembly update was saved, but pattern metadata could not be updated.',
      }),
    });
  return Object.freeze({
    authorityStatus: 'accepted' as const,
    attachmentStatus: 'failed' as const,
    blockers: attachmentBlockers(runtimeBlockers, {
      code: 'semantic-attachment-unverified',
      detail: 'The assembly update was saved, but the pattern metadata update was not verified.',
    }),
  });
}

async function verifyPatternImportDxfPhaseEAssemblyOrderDocumentBindingV1(
  cardSession: PatternImportDxfPhaseECardSessionV1,
  scopeKey: string,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  choices: PatternImportDxfProductPhaseEAuthoringChoicesV1,
): Promise<
  | Readonly<{
      ok: true;
      evidence: PatternImportDxfPhaseEDocumentEvidenceV1;
      blocker: null;
    }>
  | Readonly<{ ok: false; blocker: PatternImportDxfPhaseEAssemblyOrderSubmitBlockerV1 }>
> {
  try {
    const current = await cardSession.loadDocumentEvidence(scopeKey);
    if (!current.ok)
      return Object.freeze({
        ok: false as const,
        blocker: Object.freeze({ ...current.blocker }),
      });
    const authority = await derivePatternImportDxfPhaseEDocumentAuthorityV1(
      current.evidence,
      catalog.sizeSelectionCanonicalSha256,
      catalog.canonicalSha256,
    );
    if (!authority.ok)
      return Object.freeze({
        ok: false as const,
        blocker: Object.freeze({ ...authority.blockers[0] }),
      });
    if (
      authority.authority.documentId !== choices.documentId ||
      authority.authority.revision !== choices.revision
    )
      return Object.freeze({
        ok: false as const,
        blocker: Object.freeze({
          code: 'document-revision-binding-stale',
          detail:
            'The saved DXF or card version changed while the workbench was open. Reopen the Assembly workbench.',
        }),
      });
    return Object.freeze({ ok: true as const, evidence: current.evidence, blocker: null });
  } catch (error) {
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'document-evidence-read-failed',
        detail:
          error instanceof Error
            ? `The current saved DXF could not be verified: ${error.message}`
            : 'The current saved DXF could not be verified.',
      }),
    });
  }
}

export function resolvePatternImportDxfPhaseEAssemblyOrderSessionV1(
  source: PatternImportDxfPhaseEAssemblyOrderSourceV1,
  cardSession: PatternImportDxfPhaseECardSessionV1,
): PatternImportDxfPhaseEAssemblyOrderSessionResolutionV1 {
  const seam = source.assembly.seams.find(
    (candidate) => 'seamKey' in candidate && candidate.seamKey === source.selectedSeamKey,
  );
  const pieceLineKeys =
    seam && 'sideA' in seam
      ? [...new Set([...seam.sideA, ...seam.sideB].map(({ pieceLineKey }) => pieceLineKey))]
      : [];
  const scopeKeys = [
    ...new Set(cardSession.draft.scopes.map(({ target }) => target.scopeKey).filter(Boolean)),
  ].filter((scopeKey) =>
    pieceLineKeys.every((pieceLineKey) =>
      cardSession.draft.aliases.some(
        (alias) => alias.scopeKey === scopeKey && alias.pieceLineKey === pieceLineKey,
      ),
    ),
  );
  if (pieceLineKeys.length !== 2 || scopeKeys.length !== 1)
    return Object.freeze({
      ok: false as const,
      freshSession: null,
      blocker: Object.freeze({
        code: 'fresh-dxf-scope-binding-unavailable' as const,
        detail:
          'The fresh import draft must expose exactly one scope whose aliases cover both selected StoredSeam piece identities.',
      }),
    });
  if (!seam || !('anchoredSize' in seam) || !seam.anchoredSize.trim())
    return Object.freeze({
      ok: false as const,
      freshSession: null,
      blocker: Object.freeze({
        code: 'fresh-dxf-size-token-unavailable' as const,
        detail: 'The selected saved seam needs a size before exact edge selection can open.',
      }),
    });

  const freshSession: PatternImportDxfPhaseEAssemblyOrderFreshSessionV1 = Object.freeze({
    draft: cardSession.draft,
    importGeneration: cardSession.importGeneration,
    scopeKey: scopeKeys[0],
    sizeToken: seam.anchoredSize,
    authoringOperationId: null,
    prepareOwner: cardSession.controller,
    loadDocumentEvidence: cardSession.loadDocumentEvidence,
    loadMaterialOptions: loadPatternImportDxfPhaseEWorkbenchBetaMaterialPresetsV1,
    preparePhaseEWorkbench: (draft, request) =>
      cardSession.controller.preparePhaseEWorkbench(draft, request),
    submitChoices: async (catalog, choices) => {
      const beforeAuthor = await verifyPatternImportDxfPhaseEAssemblyOrderDocumentBindingV1(
        cardSession,
        scopeKeys[0],
        catalog,
        choices,
      );
      if (!beforeAuthor.ok)
        return Object.freeze({
          authorityStatus: 'refused' as const,
          attachmentStatus: 'not-attempted' as const,
          blockers: Object.freeze([beforeAuthor.blocker]),
        });
      const authored = await cardSession.controller.authorChoices(
        cardSession.draft,
        catalog,
        choices,
      );
      if (!authored.ok) {
        const blockers =
          authored.stage === 'prepared-context'
            ? authored.blockers
            : authored.stage === 'produce'
              ? authored.produce.blockers
              : authored.stage === 'compile'
                ? authored.compile.blockers
                : authored.author.blockers;
        return Object.freeze({
          authorityStatus: 'refused' as const,
          attachmentStatus: 'not-attempted' as const,
          blockers: Object.freeze(
            blockers.map(({ code, detail }) => Object.freeze({ code, detail })),
          ),
        });
      }
      const beforeAttachment = await verifyPatternImportDxfPhaseEAssemblyOrderDocumentBindingV1(
        cardSession,
        scopeKeys[0],
        catalog,
        choices,
      );
      if (!beforeAttachment.ok)
        return Object.freeze({
          authorityStatus: 'accepted' as const,
          attachmentStatus: 'blocked' as const,
          blockers: Object.freeze([beforeAttachment.blocker]),
        });
      const binding = cardSession.controller.bindAuthoredAuthorityToConfirmedCommit(
        cardSession.draft,
        cardSession.confirmedApply,
      );
      if (binding.status !== 'bound' && binding.status !== 'unchanged')
        return Object.freeze({
          authorityStatus: 'accepted' as const,
          attachmentStatus: 'blocked' as const,
          blockers: Object.freeze([
            Object.freeze({
              code: binding.blocker?.code ?? 'phase-e-authority-commit-binding-refused',
              detail:
                binding.blocker?.detail ??
                'The assembly update was saved, but it could not be linked to the confirmed DXF.',
            }),
          ]),
        });
      try {
        const attachment = await cardSession.controller.afterConfirmedSave(
          cardSession.draft,
          cardSession.confirmedApply,
          beforeAttachment.evidence,
        );
        return projectPatternImportDxfPhaseEAssemblyOrderAttachmentResultV1(attachment);
      } catch (error) {
        return Object.freeze({
          authorityStatus: 'accepted' as const,
          attachmentStatus: 'threw' as const,
          blockers: Object.freeze([
            Object.freeze({
              code: 'semantic-attachment-threw',
              detail:
                error instanceof Error
                  ? `The assembly update was saved, but pattern metadata failed: ${error.message}`
                  : 'The assembly update was saved, but pattern metadata failed.',
            }),
          ]),
        });
      }
    },
  });
  return Object.freeze({ ok: true as const, freshSession, blocker: null });
}

function Blockers({
  blockers,
  title = '! Assembly workbench unavailable',
}: {
  blockers: readonly Readonly<{ code: string; detail: string }>[];
  title?: string;
}) {
  return (
    <CalloutBox tone='error'>
      <Text component='p' className='font-bold'>
        {title}
      </Text>
      <ul className='mt-1 list-square space-y-1 pl-4'>
        {blockers.map((blocker) => (
          <li key={blocker.code}>
            <Text component='span' size='micro'>
              {blocker.detail} [{blocker.code}]
            </Text>
          </li>
        ))}
      </ul>
    </CalloutBox>
  );
}

export function PatternImportDxfPhaseEAssemblyOrderEntryV1({
  source,
  freshSession,
  preflightBlocker = null,
  frozen = false,
}: {
  source: PatternImportDxfPhaseEAssemblyOrderSourceV1;
  freshSession: PatternImportDxfPhaseEAssemblyOrderFreshSessionV1 | null;
  preflightBlocker?: PatternImportDxfPhaseEAssemblyOrderEntryBlockerV1 | null;
  frozen?: boolean;
}) {
  const preparation = useMemo(
    () =>
      preflightBlocker
        ? blocked(preflightBlocker)
        : preparePatternImportDxfPhaseEAssemblyOrderEntryV1(source, freshSession),
    [freshSession, preflightBlocker, source],
  );
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState<PatternImportDxfProductPhaseEWorkbenchEntryResultV1 | null>(
    null,
  );
  const [state, setState] = useState<
    | Extract<PatternImportDxfProductPhaseEWorkbenchEntryResultV1, { ok: true }>['initialState']
    | null
  >(null);
  const [materialOptions, setMaterialOptions] = useState<
    readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[] | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] =
    useState<PatternImportDxfPhaseEAssemblyOrderSubmitResultV1 | null>(null);
  const [submitBlockers, setSubmitBlockers] = useState<
    readonly Readonly<{ code: string; detail: string }>[]
  >([]);
  const [activeSide, setActiveSide] = useState<PatternImportDxfProductPhaseEInspectorSideV1>('A');
  const asyncGateRef = useRef<ReturnType<
    typeof createPatternImportDxfPhaseEAssemblyOrderAsyncGateV1
  > | null>(null);
  if (!asyncGateRef.current)
    asyncGateRef.current = createPatternImportDxfPhaseEAssemblyOrderAsyncGateV1();
  const asyncGate = asyncGateRef.current;
  const identity = useMemo(
    () => patternImportDxfPhaseEAssemblyOrderEntryIdentityV1(source, freshSession),
    [freshSession, source],
  );

  useEffect(() => {
    asyncGate.invalidate();
    setOpen(false);
    setLoading(false);
    setEntry(null);
    setState(null);
    setMaterialOptions(null);
    setSubmitting(false);
    setSubmission(null);
    setSubmitBlockers([]);
    setActiveSide('A');
    return () => asyncGate.invalidate();
  }, [asyncGate, identity]);

  const openWorkbench = async () => {
    setOpen(true);
    if (!preparation.ok || !freshSession) return;
    const ticket = asyncGate.begin();
    setLoading(true);
    setEntry(null);
    setState(null);
    try {
      const [result, options] = await Promise.all([
        freshSession.loadDocumentEvidence(freshSession.scopeKey).then((document) => {
          if (!document.ok)
            return Object.freeze({
              ok: false as const,
              stage: 'preflight' as const,
              catalog: null,
              proposal: null,
              projection: null,
              initialState: null,
              blockers: Object.freeze([document.blocker]),
            });
          return runPatternImportDxfPhaseEAssemblyOrderSerializedPrepareV1(freshSession, {
            ...preparation.request,
            documentEvidence: document.evidence,
          });
        }),
        freshSession.loadMaterialOptions(),
      ]);
      if (!ticket.isCurrent()) return;
      setEntry(result);
      setState(result.ok ? result.initialState : null);
      setMaterialOptions(options);
    } catch (error) {
      if (!ticket.isCurrent()) return;
      setEntry({
        ok: false,
        stage: 'workbench-load',
        catalog: null,
        proposal: null,
        projection: null,
        initialState: null,
        blockers: [
          {
            code: 'workbench-entry-failed',
            detail:
              error instanceof Error ? error.message : 'The Assembly workbench could not open.',
          },
        ],
      });
    } finally {
      if (ticket.isCurrent()) setLoading(false);
    }
  };

  const closeWorkbench = () => {
    asyncGate.invalidate();
    setOpen(false);
    setLoading(false);
    setEntry(null);
    setState(null);
    setMaterialOptions(null);
    setSubmitting(false);
    setSubmission(null);
    setSubmitBlockers([]);
  };

  const confirmChoices = async (result: PatternImportDxfProductPhaseEWorkbenchResultV1) => {
    if (
      !result.ok ||
      !entry?.ok ||
      !freshSession ||
      submitting ||
      submission?.authorityStatus === 'accepted'
    )
      return;
    const ticket = asyncGate.begin();
    setSubmitting(true);
    setSubmission(null);
    setSubmitBlockers([]);
    try {
      const submittedResult = await freshSession.submitChoices(entry.catalog, result.choices);
      if (!ticket.isCurrent()) return;
      setSubmission(submittedResult);
    } catch (error) {
      if (!ticket.isCurrent()) return;
      setSubmitBlockers([
        {
          code: 'phase-e-submit-failed',
          detail: error instanceof Error ? error.message : 'The assembly update was refused.',
        },
      ]);
    } finally {
      if (ticket.isCurrent()) setSubmitting(false);
    }
  };

  return (
    <div
      className='mt-block border-t border-hairline pt-stack'
      data-phase-e-assembly-order-entry=''
      data-selected-operation-number={source.selectedOperationNumber}
      data-selected-seam-key={source.selectedSeamKey}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <Text component='p' size='micro' variant='label' tracking='label'>
            Assembly workbench
          </Text>
          <Pill tone={preparation.ok ? 'ok' : 'attention'}>
            {preparation.ok ? 'DXF geometry ready' : '! DXF refresh required'}
          </Pill>
        </div>
        {preparation.ok && !open && (
          <Button
            type='button'
            variant='underline'
            size='xs'
            disabled={frozen}
            onClick={openWorkbench}
          >
            Open assembly workbench
          </Button>
        )}
        {open && (
          <Button type='button' variant='underline' size='xs' onClick={closeWorkbench}>
            close
          </Button>
        )}
      </div>
      <div className='mt-1'>
        <Row label='selected operation' value={`#${source.selectedOperationNumber}`} />
        <Row label='existing seam' value={source.selectedSeamKey || '! unsupported selection'} />
      </div>

      {!preparation.ok && <Blockers blockers={[preparation.blocker]} />}
      {open && loading && (
        <Text component='p' size='micro' variant='label'>
          Loading exact DXF geometry…
        </Text>
      )}
      {open && entry && !entry.ok && <Blockers blockers={entry.blockers} />}
      {submitBlockers.length > 0 && <Blockers blockers={submitBlockers} />}
      {submission && submission.blockers.length > 0 && (
        <Blockers
          blockers={submission.blockers}
          title={
            submission.authorityStatus === 'accepted'
              ? `! Assembly saved; pattern metadata not verified (${submission.attachmentStatus})`
              : '! Assembly update refused'
          }
        />
      )}
      {submission?.authorityStatus === 'accepted' && (
        <Text component='p' size='micro' variant='label'>
          {submission.attachmentStatus === 'verified'
            ? '✓ Assembly update saved; pattern metadata verified.'
            : `✓ Assembly update saved; pattern metadata is not verified (${submission.attachmentStatus}).`}
        </Text>
      )}
      {open && entry?.ok && state && materialOptions && freshSession && preparation.ok && (
        <PatternImportDxfProductPhaseEWorkbenchV1
          catalog={entry.catalog}
          projection={entry.projection}
          proposal={entry.proposal}
          proposalSource={preparation.proposalSource}
          state={state}
          materialOptions={materialOptions}
          activeSide={activeSide}
          onActiveSideChange={setActiveSide}
          onStateChange={setState}
          onConfirm={(result) => void confirmChoices(result)}
          disabled={frozen || submitting || submission?.authorityStatus === 'accepted'}
        />
      )}
    </div>
  );
}

/** Real Assembly Order mount. No fresh session is invented after a saved-card reload. */
export function PatternImportDxfPhaseEAssemblyOrderEntryMountV1({
  techCardId,
  selectedIndex,
  operationsPanel,
  operationNavigation,
  onSelectOperation,
  cadCommandAuthoringHandoff,
  zeroConnectAuthoringHandoff,
  crossScopeAuthoringHandoff,
  pressAuthoringHandoff,
  stitchEditCapabilities,
  onEditStitchField,
  exactNSession = null,
  exactNApplicationOwner,
  workbenchOpen = false,
  autoOpen = false,
  onOpenChange,
  frozen = false,
}: {
  techCardId?: number;
  selectedIndex: number;
  operationsPanel?: ReactNode;
  operationNavigation?: PatternImportDxfPhaseECadOperationNavigationV1;
  onSelectOperation?: (index: number) => void;
  cadCommandAuthoringHandoff?: PatternImportDxfPhaseECadCommandAuthoringHandoffOwnerV1;
  zeroConnectAuthoringHandoff?: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1;
  crossScopeAuthoringHandoff?: PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffOwnerV1;
  pressAuthoringHandoff?: PatternImportDxfPhaseECadTablePressAuthoringOwnerV1;
  /** Exact targets currently exposed by the one selected OperationsField editor. */
  stitchEditCapabilities?: PatternImportDxfPhaseECadWorkbenchStitchEditCapabilitiesV1;
  /** Query-only route intent back to that editor; never writes or saves an operation. */
  onEditStitchField?: (field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1) => void;
  /** Genuine optional owner from the Composite V4 restore/projection/atomic-selection chain. */
  exactNSession?: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 | null;
  /** Existing Composite V4 application transaction; never recreated by the workbench. */
  exactNApplicationOwner?: PatternImportDxfProductCompositeSidecarApplicationTransactionV4;
  workbenchOpen?: boolean;
  /** Visible production tab opens the one CAD owner immediately; no intermediate door is needed. */
  autoOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  frozen?: boolean;
}) {
  const savedCard = useTechCard(techCardId);
  const sizeNameById = useSizeNames();
  const orderSizeIds = useSizeOrdering();
  const savedAllScopeAuthority = useMemo(
    () =>
      createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
        orderSizeIds,
        sizeNameById,
      }),
    [orderSizeIds, sizeNameById],
  );
  const operations = (useWatch<TechCardFormData>({ name: 'operations' }) ?? []) as FormOperation[];
  const selected = operations[selectedIndex];
  const bomItems = (useWatch<TechCardFormData>({ name: 'bomItems' }) ?? []) as NonNullable<
    TechCardFormData['bomItems']
  >;
  const cardDefaultSeamClass = (useWatch<TechCardFormData>({
    name: 'construction.defaultSeamClass',
  }) ?? '') as string;
  const server = useSeamsStore((value) => value.server);
  const pending = useSeamsStore((value) => value.pending);
  const seams = useMemo(() => rowsOf({ server, pending }), [pending, server]);
  const source = useMemo(
    () => buildPatternImportDxfPhaseEAssemblyOrderSourceV1(operations, seams, selectedIndex),
    [operations, seams, selectedIndex],
  );
  const subscribeSession = useCallback(
    (listener: () => void) => subscribePatternImportDxfPhaseECardSessionV1(techCardId, listener),
    [techCardId],
  );
  const readSession = useCallback(
    () => readPatternImportDxfPhaseECardSessionV1(techCardId),
    [techCardId],
  );
  const cardSession = useSyncExternalStore(subscribeSession, readSession, readSession);
  const selectedSeamKeys = useMemo(
    () => (selected?.seamKeys ?? []).map((key) => key.trim()).filter(Boolean),
    [selected?.seamKeys],
  );
  const selectedOperationNumber = selected?.operationNumber ?? 0;
  const stitchVisual = useMemo(
    () =>
      selected
        ? buildPatternImportDxfPhaseEStitchVisualV1({
            operation: selected,
            bomItems,
            cardDefaultSeamClass,
          })
        : null,
    [bomItems, cardDefaultSeamClass, selected],
  );
  const currentOperation = useMemo(
    () => (selected ? projectPatternImportDxfPhaseECadTableCurrentOperationV1(selected) : null),
    [selected],
  );
  const colorwayProjection = useMemo(
    () =>
      projectPatternImportDxfPhaseECadWorkbenchColorwaysV1({
        expectedTechCardId: techCardId,
        card: savedCard.data,
      }),
    [savedCard.data, techCardId],
  );
  const colorwayOptions = colorwayProjection.options;
  const savedProjection = useMemo(
    () =>
      buildPatternImportDxfPhaseESavedCardProductionProjectionV1({
        techCard: savedCard.data,
        selectedOperationNumber,
        orderSizeIds,
        sizeNameById,
      }),
    [orderSizeIds, savedCard.data, selectedOperationNumber, sizeNameById],
  );
  const savedRuntimeResolution = useMemo(() => {
    if (!savedProjection.ok) return Object.freeze({ runtime: null, blocker: null });
    try {
      return Object.freeze({
        runtime: createPatternImportDxfPhaseESavedRowProductionRuntimeV1({
          selectedOperationNumber: savedProjection.selectedOperationNumber,
          projection: savedProjection.projection,
        }),
        blocker: null,
      });
    } catch (error) {
      return Object.freeze({
        runtime: null,
        blocker: Object.freeze({
          code: 'saved-runtime-unavailable',
          detail:
            error instanceof Error
              ? `Verified saved-row runtime is unavailable: ${error.message}`
              : 'Verified saved-row runtime is unavailable.',
        }) satisfies PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2,
      });
    }
  }, [savedProjection]);
  useEffect(
    () => () => savedRuntimeResolution.runtime?.dispose(),
    [savedRuntimeResolution.runtime],
  );
  const exactPersistenceCapabilities = useMemo(() => {
    if (!savedProjection.ok) return null;
    try {
      const snapshot = createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(
        savedProjection.selectedOperationNumber,
      );
      const exactComposite = createPatternImportDxfPhaseEExactCompositeProductionPersistenceV3();
      return Object.freeze({
        authorityAdapter: snapshot.authorityAdapter,
        exactComposite,
      });
    } catch {
      return null;
    }
  }, [savedProjection]);
  const savedBindingExactNSession =
    (selectedSeamKeys.length === 1 || selectedSeamKeys.length > 2) &&
    savedProjection.ok &&
    exactNSession &&
    matchesPatternImportDxfProductExactNSessionSavedBindingV1(
      exactNSession,
      savedProjection.row,
      savedProjection.selectedOperationNumber,
      selectedSeamKeys,
    )
      ? exactNSession
      : null;
  const exactNSessionValidationKey = savedBindingExactNSession
    ? patternImportDxfProductExactNSessionValidationKeyV1(savedBindingExactNSession)
    : null;
  const [validatedExactNSessionKey, setValidatedExactNSessionKey] = useState<string | null>(null);
  const durableRestoredValidationKeyRef = useRef<string | null>(null);
  const durableRestoreAttemptRef = useRef<PatternImportDxfPhaseEDurableRestoreAttemptSlotV1>({
    current: null,
  });
  useEffect(() => {
    if (exactNSession && !savedBindingExactNSession) {
      durableRestoredValidationKeyRef.current = null;
      setValidatedExactNSessionKey(null);
      clearPatternImportDxfProductExactNSeamProductionSessionV2(techCardId);
      return;
    }
    if (
      !savedBindingExactNSession ||
      !exactNSessionValidationKey ||
      !savedProjection.ok ||
      !exactPersistenceCapabilities
    )
      return;
    if (durableRestoredValidationKeyRef.current === exactNSessionValidationKey) {
      durableRestoredValidationKeyRef.current = null;
      setValidatedExactNSessionKey(exactNSessionValidationKey);
      return;
    }
    setValidatedExactNSessionKey(null);
    const controller = new AbortController();
    void exactPersistenceCapabilities.authorityAdapter
      .readCurrentAssemblyTopology(
        {
          row: savedProjection.row,
          selectedOperationNumber: savedProjection.selectedOperationNumber,
        },
        controller.signal,
      )
      .then((current) => {
        if (controller.signal.aborted) return;
        if (
          matchesPatternImportDxfProductExactNSessionFreshAuthorityV1(
            savedBindingExactNSession,
            current,
          )
        ) {
          setValidatedExactNSessionKey(exactNSessionValidationKey);
          return;
        }
        clearPatternImportDxfProductExactNSeamProductionSessionV2(techCardId);
      })
      .catch(() => {
        // A cache that could not be freshly authenticated never routes. The durable restore below
        // owns retry/publication and may replace it with a newly verified session.
      });
    return () => controller.abort();
  }, [
    exactNSession,
    exactNSessionValidationKey,
    exactPersistenceCapabilities,
    savedBindingExactNSession,
    savedProjection,
    techCardId,
  ]);
  const exactNBoundarySession =
    savedBindingExactNSession && validatedExactNSessionKey === exactNSessionValidationKey
      ? savedBindingExactNSession
      : null;
  const durableReloadBinding = useMemo(() => {
    if (
      selectedSeamKeys.length !== 1 ||
      !savedProjection.ok ||
      !savedCard.data ||
      !exactNApplicationOwner ||
      !exactPersistenceCapabilities
    )
      return null;
    const seamKey = selectedSeamKeys[0]!;
    const sizeToken =
      savedCard.data.seams
        ?.find(({ seamKey: candidate }) => candidate?.trim() === seamKey)
        ?.anchoredSize?.trim() ?? '';
    if (!sizeToken) return null;
    const key = [
      savedProjection.row.techCardId,
      savedProjection.row.patternLineKey,
      savedProjection.row.revision,
      savedProjection.row.cardLockVersion,
      savedProjection.selectedOperationNumber,
      seamKey,
    ].join(':');
    return Object.freeze({ key, seamKey, sizeToken });
  }, [
    exactNApplicationOwner,
    exactPersistenceCapabilities,
    savedCard.data,
    savedProjection,
    selectedSeamKeys,
  ]);
  const [durableReloadRetry, setDurableReloadRetry] =
    useState<PatternImportDxfPhaseEDurableReloadRetryStateV1 | null>(null);
  const durableReloadRetryRef = useRef(durableReloadRetry);
  const durableReloadGenerationRef = useRef(0);
  durableReloadRetryRef.current = durableReloadRetry;
  useEffect(() => {
    const current = durableReloadRetryRef.current;
    const next =
      !durableReloadBinding || exactNBoundarySession
        ? null
        : current?.key === durableReloadBinding.key
          ? current
          : createPatternImportDxfPhaseEDurableReloadRetryV1(
              durableReloadBinding.key,
              ++durableReloadGenerationRef.current,
            );
    durableReloadRetryRef.current = next;
    setDurableReloadRetry(next);
  }, [durableReloadBinding, exactNBoundarySession]);
  useEffect(() => {
    if (
      exactNBoundarySession ||
      !durableReloadBinding ||
      !durableReloadRetry ||
      durableReloadRetry.key !== durableReloadBinding.key ||
      !savedProjection.ok ||
      !savedCard.data ||
      !exactNApplicationOwner ||
      !exactPersistenceCapabilities
    )
      return;
    if (durableReloadRetry.status === 'ready') {
      const started = startPatternImportDxfPhaseEDurableReloadRetryV1(durableReloadRetry);
      if (started) {
        durableReloadRetryRef.current = started;
        setDurableReloadRetry(started);
      }
      return;
    }
    if (durableReloadRetry.status !== 'restoring') return;
    const attemptKey = `${durableReloadBinding.key}:generation:${durableReloadRetry.generation}:attempt:${durableReloadRetry.attempt}`;
    const ticket = beginPatternImportDxfPhaseEDurableRestoreAttemptV1(
      durableRestoreAttemptRef.current,
      attemptKey,
    );
    if (!ticket) return;
    const controller = ticket.controller;
    const generationOwner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    const generation = generationOwner.beginSaved(`durable-n1-restore:${attemptKey}`);
    const publishBlocker = (blocker: PatternImportDxfPhaseEDurableReloadBlockerV1) => {
      const current = durableReloadRetryRef.current;
      const next = blockPatternImportDxfPhaseEDurableReloadRetryV1(
        current,
        {
          key: durableReloadBinding.key,
          generation: durableReloadRetry.generation,
          attempt: durableReloadRetry.attempt,
          signal: controller.signal,
        },
        blocker,
      );
      if (next !== current) {
        durableReloadRetryRef.current = next;
        setDurableReloadRetry(next);
      }
      releasePatternImportDxfPhaseEDurableRestoreAttemptV1(
        durableRestoreAttemptRef.current,
        ticket,
      );
    };
    void preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
      {
        techCard: savedCard.data,
        orderSizeIds,
        sizeNameById,
        scopeKey: savedProjection.row.scopeKey,
        sizeToken: durableReloadBinding.sizeToken,
        authority: savedAllScopeAuthority,
        generation,
      },
      controller.signal,
    )
      .then(async (prepared) => {
        if (controller.signal.aborted) return;
        if (!prepared.ok) {
          publishBlocker({
            code: 'durable-restore-prepare-blocked',
            detail: prepared.blocker.detail,
            retryable: true,
          });
          return;
        }
        const durable = createPatternImportDxfPhaseEZeroConnectProductionDurableBridgeV1(
          savedProjection.selectedOperationNumber,
          exactNApplicationOwner,
          exactPersistenceCapabilities.authorityAdapter,
        );
        const restored = await durable.restore(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1,
            row: savedProjection.row,
            selectedOperationNumber: savedProjection.selectedOperationNumber,
            catalog: prepared.catalog,
          },
          controller.signal,
        );
        if (restored.ok) {
          const restoredValidationKey = patternImportDxfProductExactNSessionValidationKeyV1(
            restored.session,
          );
          durableRestoredValidationKeyRef.current = restoredValidationKey;
          setValidatedExactNSessionKey(restoredValidationKey);
          completePatternImportDxfPhaseEDurableRestoreAttemptV1(
            durableRestoreAttemptRef.current,
            ticket,
          );
        } else
          publishBlocker({
            code: restored.blocker.code,
            detail:
              restored.blocker.code === 'durable-restore-sidecar-missing'
                ? 'No durable exact connection is saved yet. Continue on the 2D table and select the two exact edges to create it.'
                : restored.blocker.detail,
            retryable: restored.blocker.code === 'durable-restore-failed',
          });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        publishBlocker({
          code: 'durable-restore-failed',
          detail:
            error instanceof Error
              ? `The durable exact connection could not be reloaded: ${error.message}`
              : 'The durable exact connection could not be reloaded.',
          retryable: true,
        });
      })
      .finally(() => generationOwner.dispose());
    return () => {
      controller.abort();
      generationOwner.dispose();
      releasePatternImportDxfPhaseEDurableRestoreAttemptV1(
        durableRestoreAttemptRef.current,
        ticket,
      );
    };
  }, [
    exactNApplicationOwner,
    exactNBoundarySession,
    exactPersistenceCapabilities,
    durableReloadBinding,
    durableReloadRetry,
    orderSizeIds,
    savedAllScopeAuthority,
    savedCard.data,
    savedProjection,
    sizeNameById,
  ]);
  const retryDurableReload = useCallback(() => {
    setDurableReloadRetry((current) => {
      if (!current) return null;
      const next = retryPatternImportDxfPhaseEDurableReloadRetryV1(current);
      durableReloadRetryRef.current = next;
      return next;
    });
  }, []);
  const savedConfirm = useMemo<PatternImportDxfPhaseEMultiseamSavedConfirmV2 | undefined>(
    () =>
      savedProjection.ok && exactPersistenceCapabilities
        ? (prepared, choices, signal) =>
            persistPatternImportDxfPhaseEMultiseamExactChoicesV2(
              exactPersistenceCapabilities,
              {
                row: prepared.row,
                selectedOperationNumber: prepared.selectedOperationNumber,
                catalog: prepared.catalog,
                proposal: prepared.proposal,
                choices,
              },
              signal,
            )
        : undefined,
    [exactPersistenceCapabilities, savedProjection],
  );
  const freshConfirm = useMemo<PatternImportDxfPhaseEMultiseamFreshConfirmV2 | undefined>(
    () =>
      savedProjection.ok && exactPersistenceCapabilities
        ? (prepared, choices, signal) =>
            persistPatternImportDxfPhaseEMultiseamExactChoicesV2(
              exactPersistenceCapabilities,
              {
                row: savedProjection.row,
                selectedOperationNumber: savedProjection.selectedOperationNumber,
                catalog: prepared.catalog,
                proposal: prepared.proposal,
                choices,
              },
              signal,
            )
        : undefined,
    [exactPersistenceCapabilities, savedProjection],
  );
  const physicalRow =
    savedProjection.ok && selectedSeamKeys.length === 2 ? savedProjection.row : null;
  const savedClothPhysicalHost = useSavedClothPhysicalHostV1({
    row: physicalRow,
    selectedOperationNumber: savedProjection.ok ? savedProjection.selectedOperationNumber : 0,
    createCanonicalOwner: createPatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1,
  });
  const savedPhysicalDownstream = savedClothPhysicalHost.selected?.owner.downstream;
  const physicalHost: CadWorkbenchPhysicalHostV1 = {
    onDisplayedBodyInputV1: savedClothPhysicalHost.onDisplayedBodyInputV1,
    panel: (
      <SavedClothPhysicalControlsV1
        host={savedClothPhysicalHost}
        row={physicalRow}
        disabled={frozen}
      />
    ),
  };
  const prepareSavedAllMaterialScopeStaging = useCallback<
    NonNullable<PatternImportDxfPhaseEMultiseamSavedSessionV2['prepareAllMaterialScopeStaging']>
  >(
    ({ current, sizeToken, signal }) => {
      if (!savedProjection.ok || !savedCard.data)
        return Promise.resolve(
          Object.freeze({
            ok: false as const,
            sources: Object.freeze([current]),
            blocker: Object.freeze({
              code: 'saved-material-scope-set-invalid' as const,
              detail: 'The current saved card projection is unavailable.',
            }),
          }),
        );
      return preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1({
        techCard: savedCard.data,
        orderSizeIds,
        sizeNameById,
        sizeToken,
        current,
        authority: savedAllScopeAuthority,
        preparationKey: `saved-ao:${savedProjection.row.techCardId}:${savedProjection.row.cardLockVersion}:${savedProjection.selectedOperationNumber}`,
        signal,
      });
    },
    [orderSizeIds, savedAllScopeAuthority, savedCard.data, savedProjection, sizeNameById],
  );
  const prepareSavedAllMaterialScopeEditors = useCallback<
    NonNullable<PatternImportDxfPhaseEMultiseamSavedSessionV2['prepareAllMaterialScopeEditors']>
  >(
    async ({ scopeKey, sizeToken, signal }) => {
      const unavailable = (detail: string) =>
        Object.freeze({
          ok: false as const,
          techCardId: savedCard.data?.id ?? null,
          sizeToken: sizeToken || null,
          catalog: null,
          scopes: Object.freeze([]) as readonly [],
          crossScopeSeamingAvailable: false as const,
          pressAuthoringAvailable: false as const,
          blocker: Object.freeze({
            scopeKey: scopeKey || null,
            code: 'saved-editor-scope-preparation-blocked' as const,
            detail,
          }),
          claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_SAVED_MATERIAL_SCOPE_EDITOR_PREPARATION_CLAIMS_V1,
        });
      if (!savedProjection.ok || !savedCard.data)
        return unavailable('The current saved card projection is unavailable.');
      const generationOwner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
      try {
        const generation = generationOwner.beginSaved(
          `saved-editor-active:${savedCard.data.id}:${savedCard.data.lockVersion}:${sizeToken}:${scopeKey}`,
        );
        const active = await preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
          {
            techCard: savedCard.data,
            orderSizeIds,
            sizeNameById,
            scopeKey,
            sizeToken,
            authority: savedAllScopeAuthority,
            generation,
          },
          signal,
        );
        if (!active.ok)
          return unavailable(
            `The active saved material slot could not be reconstructed: ${active.blocker.detail}`,
          );
        return preparePatternImportDxfPhaseECadSavedMaterialScopeEditorsV1({
          techCard: savedCard.data,
          orderSizeIds,
          sizeNameById,
          sizeToken,
          active: {
            scopeKey: active.scopeKey,
            sizeToken: active.sizeToken,
            sourceRevision: active.preparationGeneration,
            selection: active.selection,
            catalog: active.catalog,
            projection: active.projection,
            compileSource: active.draftCadCompileSource,
          },
          authority: savedAllScopeAuthority,
          signal,
        });
      } catch (error) {
        return unavailable(
          error instanceof Error
            ? `Saved material editors could not be prepared: ${error.message}`
            : 'Saved material editors could not be prepared.',
        );
      } finally {
        generationOwner.dispose();
      }
    },
    [orderSizeIds, savedAllScopeAuthority, savedCard.data, savedProjection, sizeNameById],
  );
  const savedSession = useMemo<PatternImportDxfPhaseEMultiseamSavedSessionV2 | null>(
    () =>
      savedProjection.ok && savedRuntimeResolution.runtime
        ? Object.freeze({
            runtime: savedRuntimeResolution.runtime,
            row: savedProjection.row,
            selectedOperationNumber: savedProjection.selectedOperationNumber,
            prepareAllMaterialScopeStaging: prepareSavedAllMaterialScopeStaging,
            prepareAllMaterialScopeEditors: prepareSavedAllMaterialScopeEditors,
            ...(savedPhysicalDownstream ? { downstream: savedPhysicalDownstream } : {}),
            ...(savedConfirm ? { onConfirm: savedConfirm } : {}),
          })
        : null,
    [
      prepareSavedAllMaterialScopeStaging,
      prepareSavedAllMaterialScopeEditors,
      savedConfirm,
      savedPhysicalDownstream,
      savedProjection,
      savedRuntimeResolution.runtime,
    ],
  );
  const savedBlocker = savedProjection.ok
    ? savedRuntimeResolution.blocker
    : savedProjection.blockers[0];
  const workbenchRequested = resolvePatternImportDxfPhaseEWorkbenchRequestedV1(
    workbenchOpen,
    autoOpen,
  );
  const savedBrowseFallback = shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
    workbenchOpen: workbenchRequested,
    exactNSessionAvailable: exactNBoundarySession !== null,
    selectedSeamCount: selectedSeamKeys.length,
    savedProjectionBlockerCode: savedProjection.ok
      ? null
      : savedProjection.blockers[0]?.code ?? null,
  });
  const durableReloadBlocker =
    durableReloadRetry &&
    durableReloadRetry.key === durableReloadBinding?.key &&
    durableReloadRetry.status === 'blocked'
      ? durableReloadRetry.blocker
      : null;
  const sessionResolution = useMemo(
    () =>
      source && cardSession && selectedSeamKeys.length === 1
        ? resolvePatternImportDxfPhaseEAssemblyOrderSessionV1(source, cardSession)
        : null,
    [cardSession, selectedSeamKeys.length, source],
  );
  const entryRoute =
    source && selected
      ? exactNBoundarySession
        ? 'v2'
        : routePatternImportDxfPhaseEAssemblyOrderEntryV2(selectedSeamKeys)
      : null;
  useEffect(() => {
    if (entryRoute !== 'v2' && !workbenchRequested) onOpenChange?.(false);
  }, [entryRoute, onOpenChange, workbenchRequested]);
  if (!source || !selected) return null;
  if (savedBrowseFallback) {
    const fallbackResult: PatternImportDxfPhaseECadTableDraftOperationSessionBridgeResultV1 = {
      ok: false,
      plan: null,
      blocker: {
        code: 'exact-connection-incomplete',
        detail:
          'The table is open for this operation. Select exact edges to create or refine its connection drafts.',
        operationNumber: source.selectedOperationNumber,
        processKind: 'connect',
      },
    };
    return (
      <PatternImportDxfPhaseECadTableZeroOperationProductionMountV1
        techCardId={techCardId}
        physicalHost={physicalHost}
        zeroConnectAuthoringHandoff={zeroConnectAuthoringHandoff}
        disabled={frozen}
        selection={{ operationNumber: source.selectedOperationNumber }}
        defaultOperationsMode='docked'
        operationsPanel={
          <>
            {durableReloadBlocker ? (
              <CalloutBox
                tone={durableReloadBlocker.retryable ? 'error' : 'note'}
                className='mb-2'
                data-durable-reload-blocker={durableReloadBlocker.code}
              >
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <Text component='p' size='micro' className='min-w-0 flex-1'>
                    {durableReloadBlocker.detail}
                  </Text>
                  {durableReloadBlocker.retryable ? (
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      onClick={retryDurableReload}
                    >
                      Retry reload
                    </Button>
                  ) : null}
                </div>
              </CalloutBox>
            ) : null}
            <PatternImportDxfPhaseECadTableDraftOperationsPanelV1
              editor={operationsPanel}
              result={fallbackResult}
              operationNumber={source.selectedOperationNumber}
              navigation={operationNavigation}
              stitchVisual={stitchVisual}
              onSelectOperation={onSelectOperation}
              stitchEditCapabilities={stitchEditCapabilities}
              onEditStitchField={onEditStitchField}
            />
          </>
        }
      />
    );
  }
  if (keepPatternImportDxfPhaseECadWorkbenchHostV1(entryRoute, workbenchRequested))
    return (
      <PatternImportDxfPhaseEMultiseamAssemblyOrderEntryV2
        source={{
          assembly: source.assembly,
          selectedOperationNumber: source.selectedOperationNumber,
        }}
        cardSession={cardSession}
        savedSession={savedSession}
        physicalHost={physicalHost}
        savedBlocker={savedBlocker}
        onFreshConfirm={freshConfirm}
        stitchVisual={stitchVisual}
        bomItems={bomItems}
        currentOperation={currentOperation}
        colorwayOptions={colorwayOptions}
        operationsPanel={operationsPanel}
        operationNavigation={operationNavigation}
        onSelectOperation={onSelectOperation}
        cadCommandAuthoringHandoff={cadCommandAuthoringHandoff}
        zeroConnectAuthoringHandoff={zeroConnectAuthoringHandoff}
        crossScopeAuthoringHandoff={crossScopeAuthoringHandoff}
        pressAuthoringHandoff={pressAuthoringHandoff}
        stitchEditCapabilities={stitchEditCapabilities}
        onEditStitchField={onEditStitchField}
        exactNSession={exactNBoundarySession}
        exactNApplicationOwner={exactNApplicationOwner}
        operationRouteBlocker={
          selectedSeamKeys.length > 2 && !exactNBoundarySession
            ? {
                code: 'exact-n-composite-v4-owner-unavailable',
                detail:
                  'This operation needs a current Composite V4 restore/projection/atomic-selection owner before its exact-N table can open.',
              }
            : entryRoute === 'v2'
              ? null
              : {
                  code: 'selected-operation-route-unsupported',
                  detail:
                    'This operation has one Assembly seam. The CAD shell stays open, but its exact geometry must be prepared by the one-seam route before editing.',
                }
        }
        autoOpen={autoOpen}
        onOpenChange={onOpenChange}
        frozen={frozen}
      />
    );
  return (
    <PatternImportDxfPhaseEAssemblyOrderEntryV1
      source={source}
      freshSession={sessionResolution?.ok ? sessionResolution.freshSession : null}
      preflightBlocker={
        sessionResolution && !sessionResolution.ok ? sessionResolution.blocker : null
      }
      frozen={frozen}
    />
  );
}
