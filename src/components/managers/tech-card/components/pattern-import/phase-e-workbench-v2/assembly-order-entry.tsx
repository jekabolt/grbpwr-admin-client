import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductMultiseamMappingCompositionResultV2 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-mapping-composition-v2';
import type { PatternImportDxfProductSavedGarmentMeshIngressRequestV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import type { PatternImportDxfProductSavedGarmentMeshCompileResultV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-compile-session-v1';
import type { DxfProductPhaseDSizeSelectionResultV1 } from 'lib/pattern-import/dxf-product-phase-d-size-selection-v1';
import type {
  PatternImportDxfProductPhaseEAssemblyProjectionV1,
  PatternImportDxfProductPhaseEMaterialRevisionOptionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type {
  PatternImportDxfProductPhaseEMultiseamChoicesResultV2,
  PatternImportDxfProductPhaseEMultiseamProposalV2,
  PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
} from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type AssemblyContext,
} from 'lib/pattern-import/types';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button, CalloutBox, EmptyCell, Pill, Text } from 'ui';

import type { TopstitchBomLine } from '../../topstitch-lines';
import { loadPatternImportDxfPhaseEWorkbenchBetaMaterialPresetsV1 } from '../phase-e-workbench-beta-material-presets-v1';
import type { PatternImportDxfPhaseECardSessionV1 } from '../phase-e-workbench-card-session-v1';
import { readPatternImportDxfPhaseECardSessionV1 } from '../phase-e-workbench-card-session-v1';
import {
  derivePatternImportDxfPhaseEDocumentAuthorityV1,
  type PatternImportDxfPhaseEDocumentAuthorityV1,
  type PatternImportDxfPhaseEDocumentEvidenceV1,
} from '../phase-e-workbench-document-authority-v1';
import {
  adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2,
  type PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterResultV2,
} from '../phase-e-workbench-existing-assembly-multiseam-adapter-v2';
import { restorePatternImportDxfPhaseESavedExactPrefillV1 } from './saved-exact-prefill-v1';
import { PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_REQUEST_V3 } from './exact-composite-persistence-v3';
import type { PatternImportDxfPhaseEExactCompositePersistenceAdapterV3 } from './exact-composite-persistence-v3';
import type { PatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1 } from './saved-assembly-authority-transport-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_REQUEST_V1,
  type PatternImportDxfPhaseESavedRowPreparedV1,
} from './saved-row-preparation-owner-v1';
import type { PatternImportDxfPhaseESavedRowProductionRuntimeV1 } from './saved-row-production-runtime-v1';
import type { PatternImportDxfPhaseEStitchVisualV1 } from './stitch-visual-v1';
import { createPatternImportDxfPhaseEBoundDraftCadSessionV1 } from './draft-cad-binding-v1';
import {
  updatePatternImportDxfPhaseEDraftCadArrangementScopeMapV1,
  type PatternImportDxfPhaseEDraftCadArrangementByScopeV1,
} from './draft-cad-arrangement-v1';
import { derivePatternImportDxfPhaseEDraftCadTopologySourceIdentityV1 } from './draft-cad-topology-session-v1';
import {
  reconcilePatternImportDxfPhaseEDraftCadTopologyScopeMapV1,
  updatePatternImportDxfPhaseEDraftCadTopologyScopeMapV1,
  type PatternImportDxfPhaseEDraftCadTopologyByScopeV1,
  type PatternImportDxfPhaseEDraftCadTopologyScopeV1,
} from './draft-cad-topology-scope-v1';
import {
  createPatternImportDxfPhaseEDraftCadCompileSourceV1,
  type PatternImportDxfPhaseEDraftCadCompileSourceV1,
} from './draft-cad-compile-source-v1';
import type {
  PatternImportDxfPhaseEDraftCadBlockerV1,
  PatternImportDxfPhaseEDraftCadSessionV1,
} from './draft-cad-session-v1';
import type {
  PatternImportDxfPhaseECadCommandAuthoringHandoffOwnerV1,
  PatternImportDxfPhaseECadCommandAuthoringHandoffResultV1,
} from './cad-command-draft-authoring-handoff-v1';
import { confirmPatternImportDxfPhaseECadSemanticFreshReimportV1 } from './cad-command-semantic-reimport-session-owner-v1';
import { PatternImportDxfPhaseECadWorkbenchSplitShellV1 } from './cad-workbench-split-shell-v1';
import {
  bindCadWorkbenchPhysicalPreviewSelectionV1,
  type CadWorkbenchPhysicalHostV1,
} from './cad-workbench-physical-host-v1';
import { CadWorkbenchPhysicalHostPanelV1 } from './cad-workbench-physical-host-panel-v1';
import { findCadWorkbenchScopedPieceIndexV1 } from './cad-workbench-piece-selection-v1';
import {
  PatternImportDxfPhaseECad2dToolContextSwitchV1,
  resolvePatternImportDxfPhaseECad2dAvailableToolContextV1,
  type PatternImportDxfPhaseECad2dToolContextV1,
} from './cad-2d-tool-context-switch-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_BLOCKED_V1,
  PatternImportDxfPhaseECadMannequinModelPickerV1,
} from './cad-workbench-mannequin-model-picker-v1';
import type {
  PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1,
  PatternImportDxfPhaseECadMannequinDxfStagingSourceV1,
} from './cad-mannequin-dxf-staging-v1';
import { collectPatternImportDxfPhaseECadMannequinPreparedScopeStagingV1 } from './cad-mannequin-all-scope-staging-v1';
import type { PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1 } from './cad-mannequin-saved-all-scope-staging-v1';
import {
  preparePatternImportDxfPhaseECadMannequinExactNProductionStagingV1,
  type PatternImportDxfPhaseECadMannequinExactNProductionStagingResultV1,
} from './cad-mannequin-exact-n-production-staging-v1';
import { PatternImportDxfPhaseECadMannequinSavedTwoSeamProductionMountV1 } from './cad-mannequin-saved-two-seam-scene-overlay-v1';
import {
  buildPatternImportDxfPhaseECadMaterialScopeCatalogV1,
  buildPatternImportDxfPhaseECadSavedPreparedMaterialScopeCatalogV1,
} from './cad-material-scope-catalog-v1';
import {
  preparePatternImportDxfPhaseECadMaterialScopesV1,
  type PatternImportDxfPhaseECadMaterialScopePreparationResultV1,
  type PatternImportDxfPhaseECadPreparedMaterialScopeV1,
} from './cad-material-scope-preparation-v1';
import type {
  PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationResultV1,
  PatternImportDxfPhaseECadSavedPreparedMaterialScopeEditorV1,
} from './cad-saved-material-scope-editor-preparation-v1';
import {
  matchesPatternImportDxfProductExactNDesktopGeometryV2,
  PatternImportDxfProductExactNSeamProductionMountV2,
  resolvePatternImportDxfProductExactNSeamProductionMountV2,
  type PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  type PatternImportDxfProductExactNDesktopGeometryV2,
} from './exact-n-seam-production-mount-v2';
import type { PatternImportDxfPhaseECadTableCurrentOperationV1 } from './cad-table-draft-operation-planner-v1';
import {
  buildPatternImportDxfPhaseECadCommandDraftOperationsV1,
  buildPatternImportDxfPhaseECadTableDraftOperationSessionV1,
  type PatternImportDxfPhaseECadTableDraftOperationSessionBridgeResultV1,
} from './cad-table-draft-operation-session-bridge-v1';
import { PatternImportDxfPhaseECadTableDraftOperationsPanelV1 } from './cad-table-draft-operations-panel-v1';
import type { PatternImportDxfPhaseECadOperationNavigationV1 } from './cad-operation-navigation-v1';
import type { PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1 } from './cad-workbench-stitch-editor-handoff-v1';
import type { PatternImportDxfPhaseECadWorkbenchStitchEditCapabilitiesV1 } from './cad-workbench-stitch-route-intent-v1';
import type { PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1 } from './cad-table-zero-connect-authoring-handoff-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_AUTHORING_HANDOFF_CLAIMS_V1,
  buildPatternImportDxfPhaseECadTableCrossScopeAuthoringRequestV1,
  type PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffOwnerV1,
  type PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffResultV1,
} from './cad-table-cross-scope-authoring-handoff-v1';
import type { PatternImportDxfPhaseECadTableCrossScopeConnectSideV1 } from './cad-table-cross-scope-connect-v1';
import {
  planPatternImportDxfPhaseECadTablePressCandidateV1,
  type PatternImportDxfPhaseECadTablePressActionV1,
  type PatternImportDxfPhaseECadTablePressAuthoringOwnerV1,
  type PatternImportDxfPhaseECadTablePressAuthoringResultV1,
  type PatternImportDxfPhaseECadTablePressEquipmentV1,
} from './cad-table-press-authoring-v1';
import type { PatternImportDxfProductCompositeSidecarApplicationTransactionV4 } from './composite-sidecar-production-transaction-v4';
import { PatternImportDxfPhaseEExactNTopologyAnnotationEditorV1 } from './exact-n-topology-annotation-editor-v1';
import type { PatternImportDxfPhaseERestoredTopologyAnnotationReaderV1 } from './restored-topology-annotation-reader-v1';
import {
  PatternImportDxfPhaseETopologyAnnotationSaveControlV5,
  type PatternImportDxfPhaseETopologyAnnotationDraftV5,
} from './topology-annotation-save-control-v5';

const LazyPatternImportDxfProductPhaseEMultiseamWorkbenchV2 = lazy(async () => {
  const module = await import('./workbench');
  return { default: module.PatternImportDxfProductPhaseEMultiseamWorkbenchV2 };
});

const LazyPatternImportDxfPhaseEDraftCadWorkspaceV1 = lazy(async () => {
  const module = await import('./draft-cad-workspace-v1');
  return { default: module.PatternImportDxfPhaseEDraftCadWorkspaceV1 };
});

export function resolvePatternImportDxfPhaseEAssemblyOrderTopologyScopeV2(
  input: Readonly<{
    current: PatternImportDxfPhaseEDraftCadTopologyByScopeV1;
    scopeKey: string;
    session: PatternImportDxfPhaseEDraftCadSessionV1;
    projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  }>,
) {
  return reconcilePatternImportDxfPhaseEDraftCadTopologyScopeMapV1(
    input.current,
    input.scopeKey,
    derivePatternImportDxfPhaseEDraftCadTopologySourceIdentityV1(input.session, input.projection),
  );
}

export function isPatternImportDxfPhaseEPreparedGeometryIdentityCurrentV2(
  input: Readonly<{
    preparedIdentity: string;
    currentIdentity: string;
    preparedExactNOwner: unknown;
    currentExactNOwner: unknown;
  }>,
): boolean {
  return (
    input.preparedIdentity === input.currentIdentity &&
    input.preparedExactNOwner === input.currentExactNOwner
  );
}

const LazyDollColumn = lazy(async () => {
  const module = await import('../../assembly-doll/doll-column');
  return { default: module.DollColumn };
});

export const PATTERN_IMPORT_DXF_PHASE_E_MULTISEAM_ASSEMBLY_ORDER_ENTRY_CONTRACT_V2 = Object.freeze({
  mountedFromSelectedAssemblyOrderOperation: true,
  boundedSeamCardinality: 2,
  existingAssemblyOrderIsSoleTopologyAuthority: true,
  createsSecondTopologyEditor: false,
  oneTwoDimensionalDesktop: true,
  assemblyAndPatternModesSharePreparedSource: true,
  existingAssemblyDollOwnerReused: true,
  techCardBaseModelPickerReused: true,
  mannequinModelPickerMountedBeforeGeometryPreparation: true,
  measurementDrivenModelPreviewReused: true,
  mannequinModelPickerCreatesSecondFormOwner: false,
  mannequinAllPreparedDxfPiecesStaged: true,
  mannequinAllCurrentMaterialScopeDxfPiecesStaged: true,
  savedReloadAllCurrentMaterialScopeDxfPiecesStaged: true,
  mannequinStagingUsesExactPreparedProjection: true,
  mannequinStagingBoundToCurrentImportGeneration: true,
  staleImportGenerationGeometryRendered: false,
  mannequinStagingCreatesSecondGeometryOwner: false,
  mannequinStagingClaimsSewnPreviewAuthority: false,
  savedTwoSeamSceneOverlayIntegrated: true,
  savedTwoSeamSceneOverlayUsesVerifiedV3Carrier: true,
  savedTwoSeamSceneOverlaySynthesizesFullGraph: false,
  savedTwoSeamSceneOverlayReusesLiveBomThread: true,
  freshUnconfirmedSceneOverlayFailsClosed: true,
  materialScopePreparationProductionMounted: true,
  exactPreparedMaterialScopeSwitchingMounted: true,
  savedReloadMaterialScopeEditorsUseOperationIndependentPreparation: true,
  savedReloadMaterialScopeEditorsRawFree: true,
  savedReloadCrossScopeSewDisabled: true,
  savedReloadPressDisabled: true,
  savedReloadAoCadHandoffLimitedToPrimaryScope: true,
  topologyStateCallerOwnedPerMaterialScope: true,
  topologyStateRetainedAcrossWorkspaceRemount: true,
  topologyStaleSourceResetsOnlyActiveScope: true,
  topologyStateMutatesAssemblyOperations: false,
  contextualPressAuthoringMounted: true,
  operationsFieldIsSolePressAuthoringOwner: true,
  contextualPressRequestsAutosave: false,
  crossMaterialSeamInferenceDisabled: true,
  physicalPackageAdapterIntegrated: true,
  physicalPreviewStatusFailClosed: true,
  physicalSolverExecuted: false,
  physicalPreviewAuthorityGranted: false,
  physicalStatusCreatesSecondPreparationOwner: false,
  twoDimensionalAndMannequinZonesResizable: true,
  desktopMannequinFocusModesAvailable: true,
  assemblyOrderWindowDockedFloatingCollapsed: true,
  assemblyOrderWindowCreatesSecondOperationOwner: false,
  assemblyOrderWindowReusesExistingOperationEditorOwner: true,
  activeAssemblyTableOpensWithoutIntermediateDoor: true,
  assemblyTableEntryStripRemoved: true,
  selectedOperationEditorRenderedOnce: true,
  operationNavigationOwnedByOperationsField: true,
  operationSwitchKeepsWorkbenchShellOpen: true,
  operationSwitchResetsPreparedAndDraftState: true,
  cadSelectionTracksCurrentOperationPieceAndSeam: true,
  stitchEditCapabilitiesUseExistingOperationEditor: true,
  stitchEditRouteCreatesSecondFormOwner: false,
  stitchEditRouteRequestsAutosave: false,
  cadDraftOperationsPlannerIntegratedReadOnly: true,
  cadDraftOperationsApplyUnavailable: false,
  cadDraftOperationsExistingFormOwnerHandoff: true,
  cadDraftOperationsHandoffRequestsAutosave: false,
  patternModeUsesExistingPhaseDAndCatalogIdentity: true,
  patternModeCreatesSeamAuthority: false,
  runtimeCatalogAndPhaseDSelectionLazyLoaded: true,
  pureMultiseamWorkbenchLazyLoaded: true,
  prepareSerializedPerCardSessionOwner: true,
  exactCardSessionImportGenerationRequired: true,
  exactSavedDocumentEvidenceRequired: true,
  verifiedSavedRowExactReloadSupported: true,
  freshCardSessionPreferredWhenGenuine: true,
  savedExactTopologyOnlyPrefilled: true,
  savedConfirmationCallbackOptionalAndFailClosed: true,
  stalePrepareOrSubmitPublishesUiState: false,
  atomicCompositionOwnerCalledOnce: true,
  savedNativeSourceConsumedBySubmission: false,
  savedNativeSourceConsumerInjected: false,
  verifiedPersistenceReportedWithoutLegacyDownstream: true,
  v1SidecarPersistenceUsed: false,
  inMemoryMappingAuthorityOnly: false,
  previewRequiresPhase1Proofs: true,
  persistenceIntegrated: true,
  reloadWithoutFreshCardSessionFailsClosedUnlessVerifiedSavedExact: true,
  arbitraryGarmentSupported: false,
  exactNCompositeV4OptionalBoundaryIntegrated: true,
  exactNBoundaryRequiresGenuineAtomicSelectionOwner: true,
  exactNBoundaryReadOnly: false,
  exactNWorkbenchGeometryHostReadOnly: true,
  exactNMannequinCoordinatesReuseCurrentPhaseDOwner: true,
  exactNMannequinSceneOverlayProductionMounted: true,
  exactNMannequinSnapshotGeometrySynthesized: false,
  exactNExplicitRestoredConfirmIntegrated: true,
  exactNBoundaryCreatesSecondWriter: false,
  exactNBoundaryPerformsNetworkOrPersistence: true,
  exactNBoundaryUsesExistingCompositeV4ApplicationOwner: true,
  exactTwoStillUsesExistingV3V1Workbench: true,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEMultiseamAssemblyOrderSourceV2 = Readonly<{
  assembly: AssemblyContext;
  selectedOperationNumber: number;
}>;

export function resolvePatternImportDxfPhaseEOperationSwitchTransitionV2(open: boolean) {
  return Object.freeze({
    keepWorkbenchOpen: open,
    resetOperationState: true as const,
    prepareSelectedOperation: open,
  });
}

/** Optional capability from the current preparation owner; the entry never creates another one. */
export type PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2 = Readonly<{
  code: string;
  detail: string;
}>;

export type PatternImportDxfPhaseEMultiseamSavedSubmissionV2 =
  | Readonly<{
      status: 'verified-exact-topology-persisted';
      previewReady: false;
      persistence: 'verified';
      composition: null;
      blockers: readonly [];
    }>
  | Readonly<{
      status: 'verified-exact-topology-persisted-downstream-blocked';
      previewReady: false;
      persistence: 'verified';
      composition: null;
      blockers: readonly PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2[];
    }>
  | Readonly<{
      status: 'blocked';
      previewReady: false;
      persistence: 'not-attempted' | 'unknown' | 'acknowledged-unverified';
      composition: null;
      blockers: readonly PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2[];
    }>;

/** Typed persistence seam; optional consumers remain fail-closed, while the real mount wires Wave M. */
export type PatternImportDxfPhaseEMultiseamSavedConfirmV2 = (
  prepared: PatternImportDxfPhaseESavedRowPreparedV1,
  choices: Extract<PatternImportDxfProductPhaseEMultiseamChoicesResultV2, { ok: true }>,
  signal: AbortSignal,
) => Promise<PatternImportDxfPhaseEMultiseamSavedSubmissionV2>;

export type PatternImportDxfPhaseEMultiseamFreshConfirmV2 = (
  prepared: PatternImportDxfPhaseEMultiseamAssemblyOrderPreparedV2,
  choices: Extract<PatternImportDxfProductPhaseEMultiseamChoicesResultV2, { ok: true }>,
  signal: AbortSignal,
) => Promise<PatternImportDxfPhaseEMultiseamSavedSubmissionV2>;

export type PatternImportDxfPhaseEMultiseamSavedDownstreamConsumerV2 = (
  request: PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
  signal: AbortSignal,
) => Promise<PatternImportDxfProductSavedGarmentMeshCompileResultV1>;

export type PatternImportDxfPhaseEMultiseamSavedDownstreamV2 = Readonly<{
  targetEdgeMm: number;
  ready: (signal: AbortSignal) => Promise<void>;
  consume: PatternImportDxfPhaseEMultiseamSavedDownstreamConsumerV2;
}>;

export type PatternImportDxfPhaseEMultiseamSavedSessionV2 = Readonly<{
  runtime: PatternImportDxfPhaseESavedRowProductionRuntimeV1;
  row: PatternImportDxfPhaseESavedRowPreparedV1['row'];
  selectedOperationNumber: number;
  prepareAllMaterialScopeStaging?: (
    input: Readonly<{
      current: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1;
      sizeToken: string;
      signal: AbortSignal;
    }>,
  ) => Promise<PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1>;
  prepareAllMaterialScopeEditors?: (
    input: Readonly<{
      scopeKey: string;
      sizeToken: string;
      signal: AbortSignal;
    }>,
  ) => Promise<PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationResultV1>;
  onConfirm?: PatternImportDxfPhaseEMultiseamSavedConfirmV2;
}>;

export type PatternImportDxfPhaseEMultiseamSavedPreparationResultV2 =
  | Readonly<{
      ok: true;
      prepared: PatternImportDxfPhaseESavedRowPreparedV1;
      state: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      prepared: null;
      state: null;
      blockers: readonly PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2[];
    }>;

type SuccessfulSelection = Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>;

export type PatternImportDxfPhaseEMultiseamAssemblyOrderPreflightV2 =
  | Readonly<{
      ok: true;
      adapted: Extract<
        PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterResultV2,
        { ok: true }
      >;
      cardSession: PatternImportDxfPhaseECardSessionV1;
      scopeKey: string;
      sizeToken: string;
      pieceLineKeys: readonly [string, string];
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      adapted: null;
      cardSession: null;
      scopeKey: null;
      sizeToken: null;
      pieceLineKeys: null;
      blocker: PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2;
    }>;

export type PatternImportDxfPhaseEMultiseamAssemblyOrderPreparedV2 = Readonly<{
  source: PatternImportDxfPhaseEMultiseamAssemblyOrderSourceV2;
  cardSession: PatternImportDxfPhaseECardSessionV1;
  importGeneration: number;
  scopeKey: string;
  sizeToken: string;
  pieceLineKeys: readonly [string, string];
  pieceIds: readonly [string, string];
  draftCadCompileSource: PatternImportDxfPhaseEDraftCadCompileSourceV1;
  selection: SuccessfulSelection;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  initialState: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2;
  materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[];
  documentEvidence: PatternImportDxfPhaseEDocumentEvidenceV1;
  documentAuthority: PatternImportDxfPhaseEDocumentAuthorityV1;
}>;

export type PatternImportDxfPhaseEMultiseamAssemblyOrderPreparationResultV2 =
  | Readonly<{
      ok: true;
      prepared: PatternImportDxfPhaseEMultiseamAssemblyOrderPreparedV2;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      prepared: null;
      blockers: readonly PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2[];
    }>;

type PreparedForDesktop =
  | PatternImportDxfPhaseEMultiseamAssemblyOrderPreparedV2
  | PatternImportDxfPhaseESavedRowPreparedV1;

export function createPatternImportDxfPhaseEBoundDraftCadForPreparedV1(
  prepared: PreparedForDesktop,
): ReturnType<typeof createPatternImportDxfPhaseEBoundDraftCadSessionV1> {
  return createPatternImportDxfPhaseEBoundDraftCadSessionV1({
    source: {
      phaseD: {
        sourceFileId: prepared.selection.phaseD.source.sourceFileId,
        sourceSha256: prepared.selection.phaseD.sourceSha256,
        selectedGeometrySha256: prepared.selection.selection.selectedGeometrySha256,
      },
      catalog: {
        canonicalSha256: prepared.catalog.canonicalSha256,
        sizeSelectionCanonicalSha256: prepared.catalog.sizeSelectionCanonicalSha256,
        pieces: prepared.catalog.pieces,
      },
      revision:
        'importGeneration' in prepared ? prepared.importGeneration : prepared.preparationGeneration,
    },
    projection: prepared.projection,
  });
}

export function createPatternImportDxfPhaseEBoundDraftCadForMaterialScopeV1(
  prepared: Pick<
    PatternImportDxfPhaseECadPreparedMaterialScopeV1,
    'sourceRevision' | 'selection' | 'catalog' | 'projection'
  >,
): ReturnType<typeof createPatternImportDxfPhaseEBoundDraftCadSessionV1> {
  return createPatternImportDxfPhaseEBoundDraftCadSessionV1({
    source: {
      phaseD: {
        sourceFileId: prepared.selection.phaseD.source.sourceFileId,
        sourceSha256: prepared.selection.phaseD.sourceSha256,
        selectedGeometrySha256: prepared.selection.selection.selectedGeometrySha256,
      },
      catalog: {
        canonicalSha256: prepared.catalog.canonicalSha256,
        sizeSelectionCanonicalSha256: prepared.catalog.sizeSelectionCanonicalSha256,
        pieces: prepared.catalog.pieces,
      },
      revision: prepared.sourceRevision,
    },
    projection: prepared.projection,
  });
}

export type PatternImportDxfPhaseEMultiseamAssemblyOrderSubmissionV2 =
  | Readonly<{
      status: 'in-memory-mapping-authority-ready';
      previewReady: false;
      persistence: 'not-implemented';
      composition: Extract<
        PatternImportDxfProductMultiseamMappingCompositionResultV2,
        { ok: true }
      >;
      blockers: readonly [];
    }>
  | Readonly<{
      status: 'blocked';
      previewReady: false;
      persistence: 'not-attempted' | 'unknown' | 'acknowledged-unverified';
      composition: null;
      blockers: readonly PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2[];
    }>
  | PatternImportDxfPhaseEMultiseamSavedSubmissionV2;

function preflightBlocked(
  blocker: PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2,
): PatternImportDxfPhaseEMultiseamAssemblyOrderPreflightV2 {
  return Object.freeze({
    ok: false as const,
    adapted: null,
    cardSession: null,
    scopeKey: null,
    sizeToken: null,
    pieceLineKeys: null,
    blocker: Object.freeze(blocker),
  });
}

function preparationBlocked(
  blocker: PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2,
): PatternImportDxfPhaseEMultiseamAssemblyOrderPreparationResultV2 {
  return Object.freeze({
    ok: false as const,
    prepared: null,
    blockers: Object.freeze([Object.freeze(blocker)]),
  });
}

function submissionBlocked(
  blockers: readonly PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2[],
): PatternImportDxfPhaseEMultiseamAssemblyOrderSubmissionV2 {
  return Object.freeze({
    status: 'blocked' as const,
    previewReady: false as const,
    persistence: 'not-attempted' as const,
    composition: null,
    blockers: Object.freeze(blockers.map((blocker) => Object.freeze({ ...blocker }))),
  });
}

function savedSubmissionBlocked(
  blockers: readonly PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2[],
  persistence: Extract<
    PatternImportDxfPhaseEMultiseamSavedSubmissionV2,
    { status: 'blocked' }
  >['persistence'] = 'not-attempted',
): PatternImportDxfPhaseEMultiseamSavedSubmissionV2 {
  return Object.freeze({
    status: 'blocked' as const,
    previewReady: false as const,
    persistence,
    composition: null,
    blockers: Object.freeze(blockers.map((blocker) => Object.freeze({ ...blocker }))),
  });
}

type SavedExactRestore = typeof restorePatternImportDxfPhaseESavedExactPrefillV1;

/** Prepares a saved row through its owner, then restores only its sealed four exact topology sides. */
export async function preparePatternImportDxfPhaseEMultiseamSavedEntryV2(
  savedSession: PatternImportDxfPhaseEMultiseamSavedSessionV2,
  restoreExact: SavedExactRestore = restorePatternImportDxfPhaseESavedExactPrefillV1,
): Promise<PatternImportDxfPhaseEMultiseamSavedPreparationResultV2> {
  try {
    const preparation = await savedSession.runtime.preparationOwner.prepare({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PREPARATION_REQUEST_V1,
      row: savedSession.row,
      selectedOperationNumber: savedSession.selectedOperationNumber,
    });
    if (!preparation.ok)
      return Object.freeze({
        ok: false as const,
        prepared: null,
        state: null,
        blockers: preparation.blockers,
      });
    const restored = await restoreExact(preparation.prepared);
    if (!restored.ok)
      return Object.freeze({
        ok: false as const,
        prepared: null,
        state: null,
        blockers: restored.blockers,
      });
    return Object.freeze({
      ok: true as const,
      prepared: preparation.prepared,
      state: restored.state,
      blockers: Object.freeze([]) as readonly [],
    });
  } catch (error) {
    return Object.freeze({
      ok: false as const,
      prepared: null,
      state: null,
      blockers: Object.freeze([
        Object.freeze({
          code: 'saved-exact-reload-failed',
          detail:
            error instanceof Error
              ? `Verified saved reload failed: ${error.message}`
              : 'Verified saved reload failed.',
        }),
      ]),
    });
  }
}

/** Saved confirmation remains a typed integration seam and refuses by default until Wave M owns it. */
export async function submitPatternImportDxfPhaseEMultiseamSavedChoicesV2(
  savedSession: PatternImportDxfPhaseEMultiseamSavedSessionV2,
  prepared: PatternImportDxfPhaseESavedRowPreparedV1,
  result: PatternImportDxfProductPhaseEMultiseamChoicesResultV2,
  signal: AbortSignal,
): Promise<PatternImportDxfPhaseEMultiseamSavedSubmissionV2> {
  if (!result.ok)
    return savedSubmissionBlocked(
      result.blockers.length
        ? result.blockers
        : [
            {
              code: 'atomic-two-seam-choices-incomplete',
              detail: 'Both exact saved seam choices must be complete before submission.',
            },
          ],
    );
  if (!savedSession.onConfirm)
    return savedSubmissionBlocked([
      {
        code: 'saved-exact-persistence-not-integrated',
        detail:
          'Verified saved topology is open, but saved-card confirmation is not connected to persistence yet.',
      },
    ]);
  let persisted: PatternImportDxfPhaseEMultiseamSavedSubmissionV2;
  try {
    persisted = await savedSession.onConfirm(prepared, result, signal);
  } catch (error) {
    return savedSubmissionBlocked(
      [
        {
          code: 'saved-exact-submission-failed',
          detail:
            error instanceof Error
              ? `Saved exact confirmation failed with an unknown write outcome: ${error.message}`
              : 'Saved exact confirmation failed with an unknown write outcome.',
        },
      ],
      'unknown',
    );
  }
  return persisted;
}

export type PatternImportDxfPhaseEMultiseamExactPersistenceCapabilitiesV2 = Readonly<{
  authorityAdapter: Pick<
    PatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1,
    'readCurrentAssemblyTopology'
  >;
  exactComposite: Pick<PatternImportDxfPhaseEExactCompositePersistenceAdapterV3, 'persist'>;
}>;

export type PatternImportDxfPhaseEMultiseamExactPersistenceRequestV2 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  selectedOperationNumber: number;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  choices: Extract<PatternImportDxfProductPhaseEMultiseamChoicesResultV2, { ok: true }>;
}>;

function sameSavedRow(
  left: DxfProductSavedRowIdentityV1,
  right: DxfProductSavedRowIdentityV1,
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

/** Shared fresh/saved persistence boundary: current transactional topology, then verified V3 PUT. */
export async function persistPatternImportDxfPhaseEMultiseamExactChoicesV2(
  capabilities: PatternImportDxfPhaseEMultiseamExactPersistenceCapabilitiesV2,
  request: PatternImportDxfPhaseEMultiseamExactPersistenceRequestV2,
  signal: AbortSignal,
): Promise<PatternImportDxfPhaseEMultiseamSavedSubmissionV2> {
  if (signal.aborted)
    return savedSubmissionBlocked([
      {
        code: 'exact-topology-persistence-cancelled',
        detail: 'Exact topology persistence was cancelled before the authority read.',
      },
    ]);
  let authority;
  try {
    authority = await capabilities.authorityAdapter.readCurrentAssemblyTopology(
      {
        row: request.row,
        selectedOperationNumber: request.selectedOperationNumber,
      },
      signal,
    );
  } catch (error) {
    return savedSubmissionBlocked([
      {
        code: signal.aborted
          ? 'exact-topology-persistence-cancelled'
          : 'current-assembly-topology-read-failed',
        detail: signal.aborted
          ? 'Exact topology persistence was cancelled during the authority read.'
          : error instanceof Error
            ? `Current Assembly topology could not be verified: ${error.message}`
            : 'Current Assembly topology could not be verified.',
      },
    ]);
  }
  if (
    signal.aborted ||
    authority.selectedOperationNumber !== request.selectedOperationNumber ||
    !sameSavedRow(authority.row, request.row)
  )
    return savedSubmissionBlocked([
      {
        code: signal.aborted
          ? 'exact-topology-persistence-cancelled'
          : 'current-assembly-topology-stale',
        detail: signal.aborted
          ? 'Exact topology persistence was cancelled after the authority read.'
          : 'The current saved row or selected Assembly operation changed before persistence.',
      },
    ]);
  let persisted;
  try {
    persisted = await capabilities.exactComposite.persist(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_REQUEST_V3,
        currentAuthority: {
          row: authority.row,
          serverAssemblyRevision: authority.serverAssemblyRevision,
          assemblyTopologySha256: authority.assemblyTopologySha256,
        },
        selectedOperationNumber: authority.selectedOperationNumber,
        catalog: request.catalog,
        proposal: request.proposal,
        choices: request.choices.choices,
      },
      signal,
    );
  } catch (error) {
    return savedSubmissionBlocked(
      [
        {
          code: signal.aborted
            ? 'exact-topology-persistence-cancelled'
            : 'exact-composite-persistence-threw',
          detail: signal.aborted
            ? 'Exact topology persistence was cancelled.'
            : error instanceof Error
              ? `Exact Composite V3 persistence failed: ${error.message}`
              : 'Exact Composite V3 persistence failed.',
        },
      ],
      // The persistence boundary may throw after dispatching its PUT. Without a verified read-back
      // receipt the caller must assume the write could have committed, even when not cancelled.
      'unknown',
    );
  }
  if (signal.aborted)
    return savedSubmissionBlocked(
      [
        {
          code: 'exact-topology-persistence-cancelled',
          detail:
            'Exact topology persistence was cancelled before publication; the write may have committed.',
        },
      ],
      'unknown',
    );
  if (!persisted.ok || persisted.persistence !== 'verified')
    return savedSubmissionBlocked(
      persisted.blockers.length
        ? persisted.blockers.map((blocker) => ({
            code: `exact-composite-${blocker.code}`,
            detail: blocker.detail,
          }))
        : [
            {
              code: 'exact-composite-persistence-unverified',
              detail: 'Exact Composite V3 persistence did not return a verified receipt.',
            },
          ],
      persisted.persistence === 'verified' ? 'unknown' : persisted.persistence,
    );
  return Object.freeze({
    status: 'verified-exact-topology-persisted' as const,
    previewReady: false as const,
    persistence: 'verified' as const,
    composition: null,
    blockers: Object.freeze([]) as readonly [],
  });
}

/** Strictly resolves the one fresh card scope shared by both exact StoredSeam rows. */
export function preflightPatternImportDxfPhaseEMultiseamAssemblyOrderEntryV2(
  source: PatternImportDxfPhaseEMultiseamAssemblyOrderSourceV2,
  cardSession: PatternImportDxfPhaseECardSessionV1 | null,
): PatternImportDxfPhaseEMultiseamAssemblyOrderPreflightV2 {
  const adapted = adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2(
    source.assembly,
    source.selectedOperationNumber,
  );
  if (!adapted.ok) return preflightBlocked(adapted.blockers[0]);
  if (
    !cardSession ||
    !Number.isSafeInteger(cardSession.importGeneration) ||
    cardSession.importGeneration <= 0 ||
    !cardSession.draft.dxfProvenance?.pipelineIntegrated ||
    !cardSession.draft.dxfProvenance.carrier ||
    !cardSession.draft.dxfProvenance.contentBinding ||
    !cardSession.draft.dxfPhaseDReplay?.replayReady ||
    !cardSession.draft.dxfPhaseDReplay.carrier
  )
    return preflightBlocked({
      code: 'fresh-card-session-unavailable',
      detail:
        'Bounded V2 requires the fresh card session from the confirmed DXF import. A saved-card reload cannot reconstruct exact Phase-D contour and vertex authority.',
    });

  const seams = adapted.existingAssembly.seams;
  const pieceLineKeys = [
    ...new Set(seams.flatMap((seam) => [seam.sideA[0]?.pieceLineKey, seam.sideB[0]?.pieceLineKey])),
  ].filter((value): value is string => !!value);
  if (pieceLineKeys.length !== 2)
    return preflightBlocked({
      code: 'fresh-piece-pair-binding-unavailable',
      detail: 'Both exact seams must retain the same two distinct card piece-line identities.',
    });
  const sizeTokens = [...new Set(seams.map(({ anchoredSize }) => anchoredSize.trim()))].filter(
    Boolean,
  );
  if (sizeTokens.length !== 1)
    return preflightBlocked({
      code: 'fresh-size-binding-unavailable',
      detail: 'Both exact seams must retain one identical anchored size token.',
    });
  const scopeKeys = [
    ...new Set(cardSession.draft.scopes.map(({ target }) => target.scopeKey).filter(Boolean)),
  ].filter((scopeKey) => {
    const scopes = cardSession.draft.scopes.filter(({ target }) => target.scopeKey === scopeKey);
    return (
      scopes.length === 1 &&
      scopes[0].writerReplay?.schemaVersion ===
        PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1 &&
      pieceLineKeys.every((pieceLineKey) =>
        cardSession.draft.aliases.some(
          (alias) => alias.scopeKey === scopeKey && alias.pieceLineKey === pieceLineKey,
        ),
      )
    );
  });
  if (scopeKeys.length !== 1)
    return preflightBlocked({
      code: 'fresh-scope-binding-unavailable',
      detail:
        'The fresh import draft must expose exactly one writer-replay scope whose aliases cover both StoredSeam piece identities.',
    });
  const pair = [...pieceLineKeys].sort() as [string, string];
  return Object.freeze({
    ok: true as const,
    adapted,
    cardSession,
    scopeKey: scopeKeys[0],
    sizeToken: sizeTokens[0],
    pieceLineKeys: Object.freeze(pair) as readonly [string, string],
    blocker: null,
  });
}

/** Explicit-open preparation. All heavy Phase-D/catalog/V2 modules stay cold during normal load/save. */
export async function preparePatternImportDxfPhaseEMultiseamAssemblyOrderEntryV2(
  source: PatternImportDxfPhaseEMultiseamAssemblyOrderSourceV2,
  preflight: Extract<PatternImportDxfPhaseEMultiseamAssemblyOrderPreflightV2, { ok: true }>,
): Promise<PatternImportDxfPhaseEMultiseamAssemblyOrderPreparationResultV2> {
  try {
    const selectionModule = await import(
      'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1'
    );
    const selected = await selectionModule.selectPatternImportDxfProductDraftPhaseDSizeV1(
      preflight.cardSession.draft,
      preflight.scopeKey,
      preflight.sizeToken,
    );
    if (!selected.ok) return preparationBlocked(selected.blockers[0]);

    const catalogModule = await import(
      'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1'
    );
    const catalogResult = await catalogModule.buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
      preflight.cardSession.draft,
      preflight.scopeKey,
      preflight.sizeToken,
    );
    if (!catalogResult.ok) return preparationBlocked(catalogResult.blockers[0]);
    const catalog = catalogResult.catalog;

    const [documentResult, projectionModule, workbenchModule, materialOptions] = await Promise.all([
      preflight.cardSession.loadDocumentEvidence(preflight.scopeKey),
      import('lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1'),
      import('lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2'),
      loadPatternImportDxfPhaseEWorkbenchBetaMaterialPresetsV1(),
    ]);
    if (!documentResult.ok) return preparationBlocked(documentResult.blocker);
    const authorityResult = await derivePatternImportDxfPhaseEDocumentAuthorityV1(
      documentResult.evidence,
      selected.selection.selection.canonicalSha256,
      catalog.canonicalSha256,
    );
    if (!authorityResult.ok) return preparationBlocked(authorityResult.blockers[0]);
    const proposalResult = workbenchModule.proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(
      catalog,
      preflight.adapted.existingAssembly,
    );
    if (!proposalResult.ok) return preparationBlocked(proposalResult.blockers[0]);
    const projectionResult = projectionModule.projectPatternImportDxfProductPhaseEAssemblyV1(
      catalog,
      selected.selection,
    );
    if (!projectionResult.ok) return preparationBlocked(projectionResult.blockers[0]);
    const catalogPieceLineKeys = catalog.pieces.map(({ pieceLineKey }) => pieceLineKey).sort();
    if (
      catalogPieceLineKeys[0] !== preflight.pieceLineKeys[0] ||
      catalogPieceLineKeys[1] !== preflight.pieceLineKeys[1]
    )
      return preparationBlocked({
        code: 'catalog-piece-pair-binding-mismatch',
        detail: 'The fresh catalog piece pair no longer matches both selected StoredSeam rows.',
      });
    const pieceIds = catalog.pieces.map(({ pieceId }) => pieceId).sort() as [string, string];
    const initialState =
      workbenchModule.createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2(
        catalog,
        proposalResult.proposal,
        authorityResult.authority,
        preflight.cardSession.importGeneration,
      );
    const draftCadCompileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(
      preflight.cardSession.draft,
    );
    if (!draftCadCompileSource)
      return preparationBlocked({
        code: 'draft-cad-compile-source-blocked',
        detail: 'The current card draft could not expose a raw-free Pattern/Draft compile source.',
      });
    return Object.freeze({
      ok: true as const,
      prepared: Object.freeze({
        source,
        cardSession: preflight.cardSession,
        importGeneration: preflight.cardSession.importGeneration,
        scopeKey: preflight.scopeKey,
        sizeToken: preflight.sizeToken,
        pieceLineKeys: preflight.pieceLineKeys,
        pieceIds: Object.freeze(pieceIds) as readonly [string, string],
        draftCadCompileSource,
        selection: selected.selection,
        catalog,
        proposal: proposalResult.proposal,
        projection: projectionResult.projection,
        initialState,
        materialOptions,
        documentEvidence: documentResult.evidence,
        documentAuthority: authorityResult.authority,
      }),
      blockers: Object.freeze([]) as readonly [],
    });
  } catch (error) {
    return preparationBlocked({
      code: 'multiseam-workbench-load-failed',
      detail: error instanceof Error ? error.message : 'The bounded V2 workbench could not open.',
    });
  }
}

const multiseamPrepareTails = new WeakMap<object, Promise<void>>();

/** Serializes the immutable V2 prepared envelope by the card-session controller owner. */
export async function runPatternImportDxfPhaseEMultiseamSerializedPrepareV2(
  source: PatternImportDxfPhaseEMultiseamAssemblyOrderSourceV2,
  preflight: Extract<PatternImportDxfPhaseEMultiseamAssemblyOrderPreflightV2, { ok: true }>,
): Promise<PatternImportDxfPhaseEMultiseamAssemblyOrderPreparationResultV2> {
  const owner = preflight.cardSession.controller;
  const previous = multiseamPrepareTails.get(owner) ?? Promise.resolve();
  const run = previous.then(() =>
    preparePatternImportDxfPhaseEMultiseamAssemblyOrderEntryV2(source, preflight),
  );
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  multiseamPrepareTails.set(owner, tail);
  try {
    return await run;
  } finally {
    if (multiseamPrepareTails.get(owner) === tail) multiseamPrepareTails.delete(owner);
  }
}

export type PatternImportDxfPhaseEMultiseamCompositionLoaderV2 = () => Promise<
  typeof import('lib/cloth/domain/pattern-import-dxf-product-multiseam-mapping-composition-v2')
>;

/** One atomic confirm owner. Incomplete choices return before the composition module is loaded. */
export async function submitPatternImportDxfPhaseEMultiseamAssemblyOrderChoicesV2(
  prepared: PatternImportDxfPhaseEMultiseamAssemblyOrderPreparedV2,
  result: PatternImportDxfProductPhaseEMultiseamChoicesResultV2,
  currentCardSession: PatternImportDxfPhaseECardSessionV1 | null,
  loadComposition: PatternImportDxfPhaseEMultiseamCompositionLoaderV2 = () =>
    import('lib/cloth/domain/pattern-import-dxf-product-multiseam-mapping-composition-v2'),
): Promise<PatternImportDxfPhaseEMultiseamAssemblyOrderSubmissionV2> {
  if (!result.ok)
    return submissionBlocked(
      result.blockers.length
        ? result.blockers
        : [
            {
              code: 'atomic-two-seam-choices-incomplete',
              detail: 'Both exact seam choices must be complete before atomic submission.',
            },
          ],
    );
  if (
    !currentCardSession ||
    currentCardSession !== prepared.cardSession ||
    currentCardSession.importGeneration !== prepared.importGeneration
  )
    return submissionBlocked([
      {
        code: 'card-session-generation-stale',
        detail:
          'The fresh card import session changed after preparation. Reopen bounded V2 from current Assembly Order evidence.',
      },
    ]);

  let currentDocument;
  try {
    currentDocument = await currentCardSession.loadDocumentEvidence(prepared.scopeKey);
  } catch (error) {
    return submissionBlocked([
      {
        code: 'document-evidence-read-failed',
        detail:
          error instanceof Error
            ? `Current saved DXF evidence could not be verified: ${error.message}`
            : 'Current saved DXF evidence could not be verified.',
      },
    ]);
  }
  if (!currentDocument.ok) return submissionBlocked([currentDocument.blocker]);
  const currentAuthority = await derivePatternImportDxfPhaseEDocumentAuthorityV1(
    currentDocument.evidence,
    prepared.selection.selection.canonicalSha256,
    prepared.catalog.canonicalSha256,
  );
  if (!currentAuthority.ok) return submissionBlocked(currentAuthority.blockers);
  if (
    currentAuthority.authority.documentId !== prepared.documentAuthority.documentId ||
    currentAuthority.authority.revision !== prepared.documentAuthority.revision ||
    result.choices.documentId !== prepared.documentAuthority.documentId ||
    result.choices.revision !== prepared.documentAuthority.revision
  )
    return submissionBlocked([
      {
        code: 'document-revision-binding-stale',
        detail:
          'The saved row, card lock or exact Phase-D/catalog binding changed after V2 preparation.',
      },
    ]);

  let composition: PatternImportDxfProductMultiseamMappingCompositionResultV2;
  try {
    const compositionModule = await loadComposition();
    composition = await compositionModule.buildPatternImportDxfProductMultiseamMappingCompositionV2(
      {
        schemaVersion:
          compositionModule.PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2,
        draft: currentCardSession.draft,
        selection: prepared.selection,
        catalog: prepared.catalog,
        proposal: prepared.proposal,
        choices: result.choices,
        prepared: {
          importGeneration: prepared.importGeneration,
          row: prepared.documentEvidence,
          sizeSelectionSha256: prepared.selection.selection.canonicalSha256,
          catalogCanonicalSha256: prepared.catalog.canonicalSha256,
          proposalFingerprint: prepared.proposal.deterministicFingerprint,
          phaseEPlanSha256: result.choices.aggregatePlanSeal.canonicalSha256,
          documentId: prepared.documentAuthority.documentId,
          revision: prepared.documentAuthority.revision,
        },
        current: {
          importGeneration: currentCardSession.importGeneration,
          row: currentDocument.evidence,
        },
      },
    );
  } catch (error) {
    return submissionBlocked([
      {
        code: 'multiseam-composition-failed',
        detail:
          error instanceof Error
            ? `Atomic two-seam composition failed: ${error.message}`
            : 'Atomic two-seam composition failed.',
      },
    ]);
  }
  if (!composition.ok) return submissionBlocked(composition.blockers);
  return Object.freeze({
    status: 'in-memory-mapping-authority-ready' as const,
    previewReady: false as const,
    persistence: 'not-implemented' as const,
    composition,
    blockers: Object.freeze([]) as readonly [],
  });
}

export type PatternImportDxfPhaseEMultiseamFreshCompositionSubmitterV2 = (
  prepared: PatternImportDxfPhaseEMultiseamAssemblyOrderPreparedV2,
  result: PatternImportDxfProductPhaseEMultiseamChoicesResultV2,
  currentCardSession: PatternImportDxfPhaseECardSessionV1 | null,
) => Promise<PatternImportDxfPhaseEMultiseamAssemblyOrderSubmissionV2>;

/** Fresh confirmation composes first, but publishes success only after verified exact persistence. */
export async function submitPatternImportDxfPhaseEMultiseamFreshPersistedChoicesV2(
  prepared: PatternImportDxfPhaseEMultiseamAssemblyOrderPreparedV2,
  result: PatternImportDxfProductPhaseEMultiseamChoicesResultV2,
  currentCardSession: PatternImportDxfPhaseECardSessionV1 | null,
  onFreshConfirm: PatternImportDxfPhaseEMultiseamFreshConfirmV2 | undefined,
  signal: AbortSignal,
  submitComposition: PatternImportDxfPhaseEMultiseamFreshCompositionSubmitterV2 = submitPatternImportDxfPhaseEMultiseamAssemblyOrderChoicesV2,
): Promise<PatternImportDxfPhaseEMultiseamAssemblyOrderSubmissionV2> {
  const composed = await submitComposition(prepared, result, currentCardSession);
  if (composed.status !== 'in-memory-mapping-authority-ready') return composed;
  if (!result.ok)
    return submissionBlocked([
      {
        code: 'atomic-two-seam-choices-incomplete',
        detail: 'Both exact seam choices must be complete before persistence.',
      },
    ]);
  if (!onFreshConfirm)
    return submissionBlocked([
      {
        code: 'exact-composite-persistence-not-integrated',
        detail: 'Atomic mapping was prepared, but exact Composite V3 persistence is unavailable.',
      },
    ]);
  try {
    return await onFreshConfirm(prepared, result, signal);
  } catch (error) {
    return savedSubmissionBlocked(
      [
        {
          code: signal.aborted
            ? 'exact-topology-persistence-cancelled'
            : 'exact-topology-persistence-threw',
          detail: signal.aborted
            ? 'Exact topology persistence was cancelled; the write outcome is unknown.'
            : error instanceof Error
              ? `Exact topology persistence failed with an unknown write outcome: ${error.message}`
              : 'Exact topology persistence failed with an unknown write outcome.',
        },
      ],
      'unknown',
    );
  }
}

export type PatternImportDxfPhaseEMultiseamAsyncTicketV2 = Readonly<{
  generation: number;
  signal: AbortSignal;
  isCurrent: () => boolean;
}>;

export function createPatternImportDxfPhaseEMultiseamAsyncGateV2() {
  let generation = 0;
  let active: AbortController | null = null;
  const invalidate = () => {
    generation += 1;
    active?.abort();
    active = null;
  };
  return Object.freeze({
    begin(): PatternImportDxfPhaseEMultiseamAsyncTicketV2 {
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

export function isPatternImportDxfPhaseEMultiseamPersistenceTerminalV2(
  submission: PatternImportDxfPhaseEMultiseamAssemblyOrderSubmissionV2 | null,
): boolean {
  return (
    submission?.status === 'verified-exact-topology-persisted-downstream-blocked' ||
    (submission?.status === 'blocked' &&
      (submission.persistence === 'unknown' ||
        submission.persistence === 'acknowledged-unverified'))
  );
}

function Blockers({
  blockers,
  title = '! Assembly workbench unavailable',
}: {
  blockers: readonly PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2[];
  title?: string;
}) {
  return (
    <CalloutBox tone='error'>
      <Text component='p' className='font-bold'>
        {title}
      </Text>
      <ul className='mt-1 list-square space-y-1 pl-4'>
        {blockers.map((blocker, index) => (
          <li key={`${blocker.code}:${index}`}>
            <Text component='span' size='micro'>
              {blocker.detail} [{blocker.code}]
            </Text>
          </li>
        ))}
      </ul>
    </CalloutBox>
  );
}

/** The only V2 desktop mount: under the selected existing Assembly Order operation. */
export function PatternImportDxfPhaseEMultiseamAssemblyOrderEntryV2({
  source,
  cardSession,
  savedSession = null,
  physicalHost,
  savedBlocker = null,
  onFreshConfirm,
  stitchVisual = null,
  bomItems = [],
  currentOperation = null,
  colorwayOptions = [],
  operationsPanel,
  operationNavigation = null,
  onSelectOperation,
  cadCommandAuthoringHandoff,
  zeroConnectAuthoringHandoff,
  crossScopeAuthoringHandoff,
  pressAuthoringHandoff,
  stitchEditCapabilities,
  onEditStitchField,
  operationRouteBlocker = null,
  exactNSession = null,
  exactNDesktop = null,
  readSavedTopologyAnnotations,
  exactNApplicationOwner,
  autoOpen = false,
  onOpenChange,
  frozen = false,
}: {
  source: PatternImportDxfPhaseEMultiseamAssemblyOrderSourceV2;
  cardSession: PatternImportDxfPhaseECardSessionV1 | null;
  savedSession?: PatternImportDxfPhaseEMultiseamSavedSessionV2 | null;
  /** Route-local displayed-body observer and physical controls; never owns another form. */
  physicalHost?: CadWorkbenchPhysicalHostV1;
  savedBlocker?: PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2 | null;
  onFreshConfirm?: PatternImportDxfPhaseEMultiseamFreshConfirmV2;
  stitchVisual?: PatternImportDxfPhaseEStitchVisualV1 | null;
  /** Existing live BOM rows; used only to resolve the selected operation's thread visual. */
  bomItems?: readonly TopstitchBomLine[];
  /** Read-only projection of the same live RHF row rendered by operationsPanel. */
  currentOperation?: PatternImportDxfPhaseECadTableCurrentOperationV1 | null;
  colorwayOptions?: readonly Readonly<{ id: number; label: string; swatchHex?: string }>[];
  /** The one existing OperationsField editor node; no second form or field-array owner is created. */
  operationsPanel?: ReactNode;
  operationNavigation?: PatternImportDxfPhaseECadOperationNavigationV1 | null;
  /** The sole OperationsField owner callback; this component never stores a selected index. */
  onSelectOperation?: (index: number) => void;
  /** Existing OperationsField writer capability; absent means no handoff control is rendered. */
  cadCommandAuthoringHandoff?: PatternImportDxfPhaseECadCommandAuthoringHandoffOwnerV1;
  /** Existing OperationsField writer for one exact from-scratch connection draft. */
  zeroConnectAuthoringHandoff?: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1;
  /** OperationsField ingress for one exact cross-material seam on the selected saved operation. */
  crossScopeAuthoringHandoff?: PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffOwnerV1;
  /** OperationsField owner for a contextual exact-piece Press draft. */
  pressAuthoringHandoff?: PatternImportDxfPhaseECadTablePressAuthoringOwnerV1;
  /** Exact targets currently exposed by the selected caller-owned OperationEditor. */
  stitchEditCapabilities?: PatternImportDxfPhaseECadWorkbenchStitchEditCapabilitiesV1;
  /** Navigation-only route intent into that same editor owner. */
  onEditStitchField?: (field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1) => void;
  /** Keeps the shell mounted with an honest blocker for an operation outside the V2 route. */
  operationRouteBlocker?: PatternImportDxfPhaseEMultiseamAssemblyOrderBlockerV2 | null;
  /** Optional production-only owner minted by the Composite V4 restore/projection/selection chain. */
  exactNSession?: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 | null;
  exactNDesktop?: PatternImportDxfProductExactNDesktopGeometryV2 | null;
  readSavedTopologyAnnotations?: PatternImportDxfPhaseERestoredTopologyAnnotationReaderV1;
  /** The one application-level Composite V4 writer/readback owner, created by OperationsField. */
  exactNApplicationOwner?: PatternImportDxfProductCompositeSidecarApplicationTransactionV4;
  /** The visible production Assembly Table prepares this single owner without an extra open door. */
  autoOpen?: boolean;
  /** Lets OperationsField move its selected editor between inline and CAD without a duplicate. */
  onOpenChange?: (open: boolean) => void;
  frozen?: boolean;
}) {
  const preflight = useMemo(
    () => preflightPatternImportDxfPhaseEMultiseamAssemblyOrderEntryV2(source, cardSession),
    [cardSession, source],
  );
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preparedResult, setPreparedResult] =
    useState<PatternImportDxfPhaseEMultiseamAssemblyOrderPreparationResultV2 | null>(null);
  const [savedPreparedResult, setSavedPreparedResult] =
    useState<PatternImportDxfPhaseEMultiseamSavedPreparationResultV2 | null>(null);
  const [state, setState] = useState<PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2 | null>(
    null,
  );
  const [activeSeamIndex, setActiveSeamIndex] = useState<0 | 1>(0);
  const [exactNActiveSeamIndex, setExactNActiveSeamIndex] = useState(0);
  const [activePieceIndex, setActivePieceIndex] = useState<0 | 1>(0);
  const [desktopMode, setDesktopMode] =
    useState<PatternImportDxfPhaseECad2dToolContextV1>('assembly');
  const [draftCadSession, setDraftCadSession] =
    useState<PatternImportDxfPhaseEDraftCadSessionV1 | null>(null);
  const effectiveDesktopMode = resolvePatternImportDxfPhaseECad2dAvailableToolContextV1(
    desktopMode,
    draftCadSession !== null,
  );
  useEffect(() => {
    if (desktopMode !== effectiveDesktopMode) setDesktopMode(effectiveDesktopMode);
  }, [desktopMode, effectiveDesktopMode]);
  const draftCadSessionRef = useRef(draftCadSession);
  draftCadSessionRef.current = draftCadSession;
  const [materialScopePreparation, setMaterialScopePreparation] =
    useState<PatternImportDxfPhaseECadMaterialScopePreparationResultV1 | null>(null);
  const [savedMaterialScopePreparation, setSavedMaterialScopePreparation] =
    useState<PatternImportDxfPhaseECadSavedMaterialScopeEditorPreparationResultV1 | null>(null);
  const [activeDraftMaterialScopeKey, setActiveDraftMaterialScopeKey] = useState<string | null>(
    null,
  );
  const [materialScopeDraftSessions, setMaterialScopeDraftSessions] = useState<
    Readonly<Record<string, PatternImportDxfPhaseEDraftCadSessionV1>>
  >({});
  const [materialScopeDraftArrangements, setMaterialScopeDraftArrangements] =
    useState<PatternImportDxfPhaseEDraftCadArrangementByScopeV1>({});
  const [materialScopeDraftTopology, setMaterialScopeDraftTopology] =
    useState<PatternImportDxfPhaseEDraftCadTopologyByScopeV1>({});
  const [draftCadBlocker, setDraftCadBlocker] =
    useState<PatternImportDxfPhaseEDraftCadBlockerV1 | null>(null);
  const [cadCommandHandoff, setCadCommandHandoff] =
    useState<PatternImportDxfPhaseECadCommandAuthoringHandoffResultV1 | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] =
    useState<PatternImportDxfPhaseEMultiseamAssemblyOrderSubmissionV2 | null>(null);
  const [exactNConfirmation, setExactNConfirmation] = useState<
    | Readonly<{ status: 'idle' | 'confirming'; detail: null }>
    | Readonly<{ status: 'verified' | 'blocked'; detail: string }>
  >(Object.freeze({ status: 'idle', detail: null }));
  const [exactNMannequinStaging, setExactNMannequinStaging] =
    useState<PatternImportDxfPhaseECadMannequinExactNProductionStagingResultV1 | null>(null);
  const [savedAllScopeMannequinStaging, setSavedAllScopeMannequinStaging] = useState<Readonly<{
    key: string;
    result: PatternImportDxfPhaseECadMannequinSavedAllScopeStagingResultV1;
  }> | null>(null);
  const [exactNAnnotationDraft, setExactNAnnotationDraft] =
    useState<PatternImportDxfPhaseETopologyAnnotationDraftV5>(() =>
      Object.freeze({ measurements: Object.freeze([]), callouts: Object.freeze([]) }),
    );
  const publishExactNAnnotationReadback = useCallback(
    (draft: PatternImportDxfPhaseETopologyAnnotationDraftV5) => setExactNAnnotationDraft(draft),
    [],
  );
  const exactNConfirmControllerRef = useRef<AbortController | null>(null);
  const gateRef = useRef<ReturnType<
    typeof createPatternImportDxfPhaseEMultiseamAsyncGateV2
  > | null>(null);
  if (!gateRef.current) gateRef.current = createPatternImportDxfPhaseEMultiseamAsyncGateV2();
  const gate = gateRef.current;
  const exactNResolution = useMemo(
    () =>
      exactNSession
        ? resolvePatternImportDxfProductExactNSeamProductionMountV2(
            exactNSession,
            exactNActiveSeamIndex,
          )
        : null,
    [exactNActiveSeamIndex, exactNSession],
  );
  useEffect(() => {
    if (!open || !exactNSession || !exactNResolution?.ok) {
      setExactNMannequinStaging(null);
      return;
    }
    let current = true;
    setExactNMannequinStaging(null);
    void preparePatternImportDxfPhaseECadMannequinExactNProductionStagingV1({
      session: exactNSession,
      cardSession,
    }).then((result) => {
      if (current) setExactNMannequinStaging(result);
    });
    return () => {
      current = false;
    };
  }, [cardSession, exactNResolution?.ok, exactNSession, open]);
  const useFreshSession = exactNSession === null && preflight.ok;
  const canOpen =
    operationRouteBlocker === null &&
    (exactNSession !== null
      ? exactNResolution?.ok === true
      : useFreshSession || savedSession !== null);
  const identity = useMemo(
    () =>
      JSON.stringify({
        source,
        techCardId: cardSession?.techCardId ?? null,
        importGeneration: cardSession?.importGeneration ?? null,
        savedRow: savedSession?.row ?? null,
        savedOperationNumber: savedSession?.selectedOperationNumber ?? null,
        exactNCurrent: exactNSession?.current ?? null,
        selectedIndex: operationNavigation?.selectedIndex ?? null,
        operationRouteBlocker: operationRouteBlocker?.code ?? null,
      }),
    [
      cardSession,
      exactNSession?.current,
      operationNavigation?.selectedIndex,
      operationRouteBlocker?.code,
      savedSession,
      source,
    ],
  );
  const openRef = useRef(open);
  openRef.current = open;
  const preparedIdentityRef = useRef(identity);
  const preparedExactNOwnerRef = useRef(exactNSession?.selectionOwner ?? null);
  const prepareCurrentRef = useRef<() => Promise<void>>(async () => undefined);

  const prepareCurrentWorkbench = async () => {
    if (!canOpen) return;
    const ticket = gate.begin();
    setLoading(true);
    setPreparedResult(null);
    setSavedPreparedResult(null);
    setDesktopMode('assembly');
    setDraftCadSession(null);
    setMaterialScopePreparation(null);
    setSavedMaterialScopePreparation(null);
    setActiveDraftMaterialScopeKey(null);
    setMaterialScopeDraftSessions({});
    setDraftCadBlocker(null);
    setCadCommandHandoff(null);
    setSubmission(null);
    if (exactNSession) {
      if (!exactNResolution?.ok || !ticket.isCurrent()) {
        setLoading(false);
        return;
      }
      setState(null);
      setLoading(false);
      return;
    }
    if (preflight.ok) {
      const result = await runPatternImportDxfPhaseEMultiseamSerializedPrepareV2(source, preflight);
      if (!ticket.isCurrent()) return;
      setPreparedResult(result);
      setState(result.ok ? result.prepared.initialState : null);
      if (result.ok) {
        const draft = createPatternImportDxfPhaseEBoundDraftCadForPreparedV1(result.prepared);
        setDraftCadSession(draft.ok ? draft.session : null);
        setDraftCadBlocker(draft.ok ? null : draft.blocker);
        setActiveDraftMaterialScopeKey(result.prepared.scopeKey);
        setMaterialScopeDraftSessions(
          draft.ok ? Object.freeze({ [result.prepared.scopeKey]: draft.session }) : {},
        );
      }
      setLoading(false);
      return;
    }
    if (!savedSession) {
      setLoading(false);
      return;
    }
    const result = await preparePatternImportDxfPhaseEMultiseamSavedEntryV2(savedSession);
    if (!ticket.isCurrent()) return;
    setSavedPreparedResult(result);
    setState(result.ok ? result.state : null);
    if (result.ok) {
      setActiveDraftMaterialScopeKey(result.prepared.scopeKey);
    }
    setLoading(false);
  };
  prepareCurrentRef.current = prepareCurrentWorkbench;

  useEffect(() => {
    // OperationsField has already transferred its one editor into this host while auto-opening.
    // Publishing the initial `false` would briefly return the editor to the outer rail and, for a
    // one-seam route, unmount this host before its preparation effect can run.
    if (autoOpen && !open) return;
    onOpenChange?.(open);
  }, [autoOpen, onOpenChange, open]);
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);
  useEffect(
    () => () => {
      gate.invalidate();
      savedSession?.runtime.preparationOwner.cancel();
      exactNConfirmControllerRef.current?.abort();
    },
    [gate, savedSession],
  );

  useEffect(() => {
    const exactNOwner = exactNSession?.selectionOwner ?? null;
    if (preparedIdentityRef.current === identity && preparedExactNOwnerRef.current === exactNOwner)
      return;
    preparedIdentityRef.current = identity;
    preparedExactNOwnerRef.current = exactNOwner;
    const transition = resolvePatternImportDxfPhaseEOperationSwitchTransitionV2(openRef.current);
    gate.invalidate();
    savedSession?.runtime.preparationOwner.cancel();
    setLoading(false);
    setPreparedResult(null);
    setSavedPreparedResult(null);
    setState(null);
    setActiveSeamIndex(0);
    setExactNActiveSeamIndex(0);
    setActivePieceIndex(0);
    setDesktopMode('assembly');
    setDraftCadSession(null);
    setMaterialScopePreparation(null);
    setSavedMaterialScopePreparation(null);
    setActiveDraftMaterialScopeKey(null);
    setMaterialScopeDraftSessions({});
    setDraftCadBlocker(null);
    setCadCommandHandoff(null);
    setSubmitting(false);
    setSubmission(null);
    exactNConfirmControllerRef.current?.abort();
    exactNConfirmControllerRef.current = null;
    setExactNConfirmation(Object.freeze({ status: 'idle', detail: null }));
    setExactNAnnotationDraft(
      Object.freeze({ measurements: Object.freeze([]), callouts: Object.freeze([]) }),
    );
    if (transition.prepareSelectedOperation) void prepareCurrentRef.current();
  }, [exactNSession?.selectionOwner, gate, identity, savedSession]);

  const confirmRestoredExactNSelection = async () => {
    if (
      frozen ||
      exactNConfirmation.status === 'confirming' ||
      !exactNSession?.productionFeed ||
      !exactNResolution?.ok ||
      !exactNApplicationOwner
    )
      return;
    exactNConfirmControllerRef.current?.abort();
    const controller = new AbortController();
    exactNConfirmControllerRef.current = controller;
    setExactNConfirmation(Object.freeze({ status: 'confirming', detail: null }));
    const result = await exactNApplicationOwner.confirmRestoredSelection(
      exactNSession,
      exactNSession.productionFeed,
      controller.signal,
    );
    if (controller.signal.aborted || exactNConfirmControllerRef.current !== controller) return;
    exactNConfirmControllerRef.current = null;
    setExactNConfirmation(
      result.ok
        ? Object.freeze({
            status: 'verified' as const,
            detail:
              'Exact operation was verified by canonical readback and published to V2 preflight.',
          })
        : Object.freeze({ status: 'blocked' as const, detail: result.blocker.detail }),
    );
  };

  useEffect(() => {
    if (!autoOpen || !canOpen || openRef.current) return;
    openRef.current = true;
    setOpen(true);
    void prepareCurrentRef.current();
  }, [autoOpen, canOpen, identity]);

  const selectOperationFromWorkbench = (index: number) => {
    if (!onSelectOperation || index === operationNavigation?.selectedIndex) return;
    // Invalidate before the owner selection update commits: an older prepare/submit must not get a
    // publication window between the click and the identity effect for the newly selected row.
    gate.invalidate();
    savedSession?.runtime.preparationOwner.cancel();
    setLoading(openRef.current);
    setPreparedResult(null);
    setSavedPreparedResult(null);
    setState(null);
    setActiveSeamIndex(0);
    setExactNActiveSeamIndex(0);
    setActivePieceIndex(0);
    setDesktopMode('assembly');
    setDraftCadSession(null);
    setMaterialScopePreparation(null);
    setSavedMaterialScopePreparation(null);
    setActiveDraftMaterialScopeKey(null);
    setMaterialScopeDraftSessions({});
    setDraftCadBlocker(null);
    setCadCommandHandoff(null);
    setSubmitting(false);
    setSubmission(null);
    onSelectOperation(index);
  };

  const confirm = async (result: PatternImportDxfProductPhaseEMultiseamChoicesResultV2) => {
    if (
      (!preparedResult?.ok && !savedPreparedResult?.ok) ||
      submitting ||
      submission?.status === 'in-memory-mapping-authority-ready' ||
      submission?.status === 'verified-exact-topology-persisted' ||
      submission?.status === 'verified-exact-topology-persisted-downstream-blocked'
    )
      return;
    if (!result.ok) {
      setSubmission(submissionBlocked(result.blockers));
      return;
    }
    const ticket = gate.begin();
    setSubmitting(true);
    setSubmission(null);
    let submitted: PatternImportDxfPhaseEMultiseamAssemblyOrderSubmissionV2;
    if (preparedResult?.ok) {
      submitted = await submitPatternImportDxfPhaseEMultiseamFreshPersistedChoicesV2(
        preparedResult.prepared,
        result,
        readPatternImportDxfPhaseECardSessionV1(cardSession?.techCardId),
        onFreshConfirm,
        ticket.signal,
      );
    } else if (savedPreparedResult?.ok && savedSession) {
      submitted = await submitPatternImportDxfPhaseEMultiseamSavedChoicesV2(
        savedSession,
        savedPreparedResult.prepared,
        result,
        ticket.signal,
      );
    } else {
      submitted = submissionBlocked([
        {
          code: 'prepared-context-unavailable',
          detail: 'The exact two-seam prepared context is no longer current.',
        },
      ]);
    }
    if (!ticket.isCurrent()) return;
    setSubmission(submitted);
    setSubmitting(false);
  };

  const preparedIdentityCurrent = isPatternImportDxfPhaseEPreparedGeometryIdentityCurrentV2({
    preparedIdentity: preparedIdentityRef.current,
    currentIdentity: identity,
    preparedExactNOwner: preparedExactNOwnerRef.current,
    currentExactNOwner: exactNSession?.selectionOwner ?? null,
  });
  const prepared = preparedIdentityCurrent
    ? preparedResult?.ok
      ? preparedResult.prepared
      : savedPreparedResult?.ok
        ? savedPreparedResult.prepared
        : null
    : null;
  useEffect(() => {
    if (!preparedResult?.ok || !cardSession) return;
    const fresh = preparedResult.prepared;
    confirmPatternImportDxfPhaseECadSemanticFreshReimportV1({
      importGeneration: cardSession.importGeneration,
      reimported: {
        techCardId: cardSession.techCardId,
        scopeKey: fresh.scopeKey,
        sizeToken: fresh.sizeToken,
        sourceFileId: fresh.selection.phaseD.source.sourceFileId,
        sourceSha256: fresh.selection.phaseD.sourceSha256,
        catalogCanonicalSha256: fresh.catalog.canonicalSha256,
        sizeSelectionCanonicalSha256: fresh.catalog.sizeSelectionCanonicalSha256,
      },
    });
  }, [cardSession, preparedResult]);
  useEffect(() => {
    if (!preparedResult?.ok) {
      setMaterialScopePreparation(null);
      return;
    }
    const currentPrepared = preparedResult.prepared;
    let current = true;
    void preparePatternImportDxfPhaseECadMaterialScopesV1({
      cardSession: currentPrepared.cardSession,
      expectedImportGeneration: currentPrepared.importGeneration,
      sizeToken: currentPrepared.sizeToken,
      active: {
        scopeKey: currentPrepared.scopeKey,
        sizeToken: currentPrepared.sizeToken,
        sourceRevision: currentPrepared.importGeneration,
        selection: currentPrepared.selection,
        catalog: currentPrepared.catalog,
        projection: currentPrepared.projection,
        documentEvidence: currentPrepared.documentEvidence,
        documentAuthority: currentPrepared.documentAuthority,
      },
    }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setMaterialScopePreparation(result);
        return;
      }
      const sessions: Record<string, PatternImportDxfPhaseEDraftCadSessionV1> = {};
      for (const scope of result.scopes) {
        if (scope.scopeKey === currentPrepared.scopeKey && draftCadSessionRef.current) {
          sessions[scope.scopeKey] = draftCadSessionRef.current;
          continue;
        }
        const bound = createPatternImportDxfPhaseEBoundDraftCadForMaterialScopeV1(scope);
        if (!bound.ok) {
          setDraftCadBlocker(bound.blocker);
          setMaterialScopePreparation(null);
          return;
        }
        sessions[scope.scopeKey] = bound.session;
      }
      setMaterialScopeDraftSessions(Object.freeze(sessions));
      setMaterialScopePreparation(result);
    });
    return () => {
      current = false;
    };
  }, [preparedResult]);
  useEffect(() => {
    if (!savedPreparedResult?.ok || !savedSession?.prepareAllMaterialScopeEditors) {
      setSavedMaterialScopePreparation(null);
      return;
    }
    const saved = savedPreparedResult.prepared;
    let current = true;
    const controller = new AbortController();
    setSavedMaterialScopePreparation(null);
    void savedSession
      .prepareAllMaterialScopeEditors({
        scopeKey: saved.scopeKey,
        sizeToken: saved.sizeToken,
        signal: controller.signal,
      })
      .then((result) => {
        if (!current || controller.signal.aborted) return;
        if (!result.ok) {
          setSavedMaterialScopePreparation(result);
          setDraftCadSession(null);
          setMaterialScopeDraftSessions({});
          setDraftCadBlocker({
            code: 'invalid-source-binding',
            detail: `${result.blocker.detail} [${result.blocker.code}]`,
          });
          return;
        }
        const sessions: Record<string, PatternImportDxfPhaseEDraftCadSessionV1> = {};
        for (const scope of result.scopes) {
          const bound = createPatternImportDxfPhaseEBoundDraftCadForMaterialScopeV1(scope);
          if (!bound.ok) {
            setDraftCadBlocker(bound.blocker);
            setSavedMaterialScopePreparation(null);
            setDraftCadSession(null);
            setMaterialScopeDraftSessions({});
            return;
          }
          sessions[scope.scopeKey] = bound.session;
        }
        const active = result.scopes[0];
        const activeSession = active ? sessions[active.scopeKey] : null;
        if (!active || !activeSession) return;
        setSavedMaterialScopePreparation(result);
        setMaterialScopeDraftSessions(Object.freeze(sessions));
        setActiveDraftMaterialScopeKey(active.scopeKey);
        setDraftCadSession(activeSession);
        setDraftCadBlocker(null);
      })
      .catch((error) => {
        if (!current || controller.signal.aborted) return;
        setSavedMaterialScopePreparation(null);
        setDraftCadSession(null);
        setMaterialScopeDraftSessions({});
        setDraftCadBlocker({
          code: 'invalid-source-binding',
          detail:
            error instanceof Error
              ? `Saved material editors could not be prepared: ${error.message}`
              : 'Saved material editors could not be prepared.',
        });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [savedPreparedResult, savedSession]);
  const materialScopeCatalog = useMemo(() => {
    if (preparedResult?.ok)
      return buildPatternImportDxfPhaseECadMaterialScopeCatalogV1(
        preparedResult.prepared.cardSession.draft,
      );
    if (savedMaterialScopePreparation?.ok) return savedMaterialScopePreparation.catalog;
    if (!savedPreparedResult?.ok) return null;
    const saved = savedPreparedResult.prepared;
    const scope = saved.draftCadCompileSource.scopes.find(
      ({ target }) => target.scopeKey === saved.scopeKey,
    );
    if (!scope) return null;
    return buildPatternImportDxfPhaseECadSavedPreparedMaterialScopeCatalogV1({
      techCardId: saved.draftCadCompileSource.techCardId,
      scope: {
        scopeKey: scope.target.scopeKey,
        label: scope.target.label,
        fabricPurpose: scope.target.fabricPurpose,
        bomLineKey: scope.target.bomLineKey,
        isInterlining: scope.target.isInterlining,
        writerReplaySchemaVersion: scope.writerReplay?.schemaVersion ?? null,
      },
      pieces: saved.catalog.pieces,
    });
  }, [preparedResult, savedMaterialScopePreparation, savedPreparedResult]);
  const savedAllScopeMannequinStagingKey = savedPreparedResult?.ok
    ? JSON.stringify({
        row: savedPreparedResult.prepared.row,
        operationNumber: savedPreparedResult.prepared.selectedOperationNumber,
        scopeKey: savedPreparedResult.prepared.scopeKey,
        sizeToken: savedPreparedResult.prepared.sizeToken,
      })
    : '';
  useEffect(() => {
    if (
      !savedPreparedResult?.ok ||
      !savedSession?.prepareAllMaterialScopeStaging ||
      !savedAllScopeMannequinStagingKey
    ) {
      setSavedAllScopeMannequinStaging(null);
      return;
    }
    const saved = savedPreparedResult.prepared;
    const scope = materialScopeCatalog?.ok
      ? materialScopeCatalog.scopes.find(({ scopeKey }) => scopeKey === saved.scopeKey)
      : null;
    const current = Object.freeze({
      scopeKey: saved.scopeKey,
      label: scope?.label ?? saved.scopeKey,
      projection: saved.projection,
    });
    let live = true;
    const controller = new AbortController();
    setSavedAllScopeMannequinStaging(null);
    void savedSession
      .prepareAllMaterialScopeStaging({
        current,
        sizeToken: saved.sizeToken,
        signal: controller.signal,
      })
      .then((result) => {
        if (!live || controller.signal.aborted) return;
        setSavedAllScopeMannequinStaging(
          Object.freeze({ key: savedAllScopeMannequinStagingKey, result }),
        );
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [materialScopeCatalog, savedAllScopeMannequinStagingKey, savedPreparedResult, savedSession]);
  const mannequinDxfSources = useMemo<
    readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[]
  >(() => {
    if (exactNSession) {
      if (exactNMannequinStaging?.ok) return exactNMannequinStaging.staging.sources;
      if (
        exactNResolution?.ok &&
        matchesPatternImportDxfProductExactNDesktopGeometryV2(exactNDesktop, exactNSession)
      ) {
        const { scopeKey } = exactNSession.current.row;
        return Object.freeze([{ scopeKey, label: scopeKey, projection: exactNDesktop.projection }]);
      }
      return Object.freeze([]);
    }
    if (!prepared) return Object.freeze([]);
    const scope = materialScopeCatalog?.ok
      ? materialScopeCatalog.scopes.find(({ scopeKey }) => scopeKey === prepared.scopeKey)
      : null;
    const current = Object.freeze({
      scopeKey: prepared.scopeKey,
      label: scope?.label ?? prepared.scopeKey,
      projection: prepared.projection,
    });
    if (
      savedPreparedResult?.ok &&
      savedAllScopeMannequinStaging?.key === savedAllScopeMannequinStagingKey
    )
      return savedAllScopeMannequinStaging.result.sources;
    if (!preparedResult?.ok || !materialScopePreparation?.ok || !materialScopeCatalog?.ok)
      return Object.freeze([current]);
    return collectPatternImportDxfPhaseECadMannequinPreparedScopeStagingV1({
      techCardId: preparedResult.prepared.cardSession.techCardId,
      importGeneration: preparedResult.prepared.importGeneration,
      catalogScopes: materialScopeCatalog.scopes,
      preparedScopes: materialScopePreparation.scopes,
      current,
    }).sources;
  }, [
    exactNDesktop,
    exactNMannequinStaging,
    exactNResolution,
    exactNSession,
    materialScopeCatalog,
    materialScopePreparation,
    prepared,
    preparedResult,
    savedAllScopeMannequinStaging,
    savedAllScopeMannequinStagingKey,
    savedPreparedResult,
  ]);
  const savedTwoSeamSceneOverlayRequest = (
    selection: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null | undefined,
  ) =>
    savedPreparedResult?.ok && prepared === savedPreparedResult.prepared
      ? {
          prepared: savedPreparedResult.prepared,
          sources: mannequinDxfSources,
          selection,
          stitchVisual,
          bomItems,
        }
      : null;
  const activeFreshPreparedMaterialScope = materialScopePreparation?.ok
    ? materialScopePreparation.scopes.find(
        ({ scopeKey }) => scopeKey === activeDraftMaterialScopeKey,
      ) ?? null
    : null;
  const activeSavedPreparedMaterialScope = savedMaterialScopePreparation?.ok
    ? savedMaterialScopePreparation.scopes.find(
        ({ scopeKey }) => scopeKey === activeDraftMaterialScopeKey,
      ) ?? null
    : null;
  const activePreparedMaterialScope:
    | PatternImportDxfPhaseECadPreparedMaterialScopeV1
    | PatternImportDxfPhaseECadSavedPreparedMaterialScopeEditorV1
    | null = activeFreshPreparedMaterialScope ?? activeSavedPreparedMaterialScope;
  const activeDraftTopologyScopeKey =
    activePreparedMaterialScope?.scopeKey ?? prepared?.scopeKey ?? null;
  const activeDraftTopologyProjection =
    activePreparedMaterialScope?.projection ?? prepared?.projection ?? null;
  const activeDraftTopologyResolution = useMemo(
    () =>
      activeDraftTopologyScopeKey && activeDraftTopologyProjection && draftCadSession
        ? resolvePatternImportDxfPhaseEAssemblyOrderTopologyScopeV2({
            current: materialScopeDraftTopology,
            scopeKey: activeDraftTopologyScopeKey,
            session: draftCadSession,
            projection: activeDraftTopologyProjection,
          })
        : null,
    [
      activeDraftTopologyProjection,
      activeDraftTopologyScopeKey,
      draftCadSession,
      materialScopeDraftTopology,
    ],
  );
  useEffect(() => {
    if (
      activeDraftTopologyResolution &&
      activeDraftTopologyResolution.map !== materialScopeDraftTopology
    )
      setMaterialScopeDraftTopology(activeDraftTopologyResolution.map);
  }, [activeDraftTopologyResolution, materialScopeDraftTopology]);
  const publishDraftTopologyScope = (
    scope: PatternImportDxfPhaseEDraftCadTopologyScopeV1,
  ): void => {
    if (
      !activeDraftTopologyResolution ||
      scope.scopeKey !== activeDraftTopologyResolution.scope.scopeKey ||
      scope.sourceIdentity !== activeDraftTopologyResolution.scope.sourceIdentity
    )
      return;
    setMaterialScopeDraftTopology((current) =>
      updatePatternImportDxfPhaseEDraftCadTopologyScopeMapV1(current, scope),
    );
  };
  const selectableMaterialScopePreparation =
    materialScopePreparation ?? savedMaterialScopePreparation;
  const preparedMaterialScopeKeys = selectableMaterialScopePreparation?.ok
    ? selectableMaterialScopePreparation.scopes
        .map(({ scopeKey }) => scopeKey)
        .filter((scopeKey) => Boolean(materialScopeDraftSessions[scopeKey]))
    : prepared?.scopeKey
      ? [prepared.scopeKey]
      : [];
  const selectDraftMaterialScope = (scopeKey: string) => {
    if (!selectableMaterialScopePreparation?.ok || scopeKey === activeDraftMaterialScopeKey) return;
    const next = materialScopeDraftSessions[scopeKey];
    if (!next) return;
    const currentScopeKey = activeDraftMaterialScopeKey ?? prepared?.scopeKey ?? '';
    const currentSession = draftCadSessionRef.current;
    if (currentScopeKey && currentSession)
      setMaterialScopeDraftSessions((sessions) =>
        Object.freeze({ ...sessions, [currentScopeKey]: currentSession }),
      );
    setActiveDraftMaterialScopeKey(scopeKey);
    setDraftCadSession(next);
    setDraftCadBlocker(null);
    setCadCommandHandoff(null);
  };
  const linkCrossScopeConnection = async (
    sides: readonly [
      PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
      PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
    ],
    direction: 'same' | 'reversed',
  ): Promise<PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffResultV1> => {
    const fail = (
      blocker: NonNullable<
        Extract<
          PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffResultV1,
          { ok: false }
        >['blocker']
      >,
    ): PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffResultV1 =>
      Object.freeze({
        ok: false as const,
        operationIndex: null,
        operationNumber: source.selectedOperationNumber || null,
        historyKey: null,
        seamKey: null,
        seamKeys: null,
        blocker,
        claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_AUTHORING_HANDOFF_CLAIMS_V1,
      });
    if (!preparedResult?.ok || !materialScopePreparation?.ok)
      return fail({
        code: 'cross-scope-authoring-owner-unavailable',
        detail: 'Both exact material scopes must finish preparing before they can be connected.',
      });
    if (!crossScopeAuthoringHandoff || crossScopeAuthoringHandoff.status !== 'available')
      return fail(
        crossScopeAuthoringHandoff?.blocker ?? {
          code: 'cross-scope-authoring-owner-unavailable',
          detail: 'The existing Assembly Order seam writer is unavailable.',
        },
      );
    const built = buildPatternImportDxfPhaseECadTableCrossScopeAuthoringRequestV1({
      preparation: materialScopePreparation,
      techCardId: preparedResult.prepared.draftCadCompileSource.techCardId,
      importGeneration: preparedResult.prepared.importGeneration,
      sizeToken: preparedResult.prepared.sizeToken,
      expectedOperationNumber: source.selectedOperationNumber,
      direction,
      sides,
    });
    if (!built.ok) return fail(built.blocker);
    return crossScopeAuthoringHandoff.link(built.request);
  };
  const createPressDraft = (
    selectedPieceIds: readonly string[],
    pressAction: PatternImportDxfPhaseECadTablePressActionV1,
    pressEquipment: PatternImportDxfPhaseECadTablePressEquipmentV1,
  ): PatternImportDxfPhaseECadTablePressAuthoringResultV1 => {
    const refused = (
      code: Extract<
        PatternImportDxfPhaseECadTablePressAuthoringResultV1,
        { ok: false }
      >['blocker']['code'],
      detail: string,
    ): PatternImportDxfPhaseECadTablePressAuthoringResultV1 =>
      Object.freeze({
        ok: false as const,
        inserted: 0 as const,
        historyKey: null,
        blocker: Object.freeze({ code, detail }),
      });
    if (!prepared || !materialScopePreparation?.ok)
      return refused(
        'press-exact-selection-unavailable',
        'Prepare the current exact material scope before creating a Press draft.',
      );
    if (!pressAuthoringHandoff || pressAuthoringHandoff.status !== 'available')
      return pressAuthoringHandoff?.status === 'unavailable'
        ? Object.freeze({
            ok: false as const,
            inserted: 0 as const,
            historyKey: null,
            blocker: pressAuthoringHandoff.blocker,
          })
        : refused(
            'press-authoring-owner-unavailable',
            'The existing Assembly Order form owner is unavailable.',
          );
    const activeScope =
      activePreparedMaterialScope ??
      materialScopePreparation.scopes.find(({ scopeKey }) => scopeKey === prepared.scopeKey);
    if (!activeScope)
      return refused(
        'press-exact-selection-unavailable',
        'The active exact material scope is unavailable.',
      );
    const planned = planPatternImportDxfPhaseECadTablePressCandidateV1({
      preparation: materialScopePreparation,
      projection: activeScope.projection,
      techCardId: prepared.draftCadCompileSource.techCardId,
      scopeKey: activeScope.scopeKey,
      selectedPieceIds,
      pressAction,
      pressEquipment,
    });
    if (!planned.ok)
      return Object.freeze({
        ok: false as const,
        inserted: 0 as const,
        historyKey: null,
        blocker: planned.blocker,
      });
    return pressAuthoringHandoff.ingest(planned.candidate);
  };
  const publishDraftCadSession = (session: PatternImportDxfPhaseEDraftCadSessionV1) => {
    setDraftCadSession(session);
    if (!activeDraftMaterialScopeKey) return;
    setMaterialScopeDraftSessions((sessions) =>
      Object.freeze({ ...sessions, [activeDraftMaterialScopeKey]: session }),
    );
  };
  const draftOperationSession = useMemo(
    () =>
      prepared && state
        ? buildPatternImportDxfPhaseECadTableDraftOperationSessionV1({
            catalog: prepared.catalog,
            proposal: prepared.proposal,
            state,
            materialOptions: prepared.materialOptions,
            currentOperation,
            stitch: stitchVisual,
          })
        : null,
    [currentOperation, prepared, state, stitchVisual],
  );
  const cadCommandDrafts = useMemo(
    () =>
      prepared &&
      draftCadSession &&
      (!activeDraftMaterialScopeKey || activeDraftMaterialScopeKey === prepared.scopeKey)
        ? buildPatternImportDxfPhaseECadCommandDraftOperationsV1({
            catalog: prepared.catalog,
            proposal: prepared.proposal,
            currentOperation,
            session: draftCadSession,
          })
        : null,
    [activeDraftMaterialScopeKey, currentOperation, draftCadSession, prepared],
  );
  const persistenceTerminal = isPatternImportDxfPhaseEMultiseamPersistenceTerminalV2(submission);
  const exactNBlocker =
    exactNSession && exactNResolution && !exactNResolution.ok ? exactNResolution.blockers[0] : null;
  const availabilityBlocker =
    operationRouteBlocker ?? exactNBlocker ?? savedBlocker ?? preflight.blocker;
  const preparationBlocker =
    preparedResult && !preparedResult.ok
      ? preparedResult.blockers[0]
      : savedPreparedResult && !savedPreparedResult.ok
        ? savedPreparedResult.blockers[0]
        : null;
  const currentOperationBlocker = preparationBlocker ?? availabilityBlocker;
  const cadCommandSourceLocked =
    cadCommandHandoff?.ok === true ||
    (cadCommandAuthoringHandoff?.status === 'unavailable' &&
      cadCommandAuthoringHandoff.blocker.code === 'authoring-source-immutable');
  const draftPanelResult: PatternImportDxfPhaseECadTableDraftOperationSessionBridgeResultV1 =
    draftOperationSession ?? {
      ok: false,
      plan: null,
      blocker: {
        code: 'current-operation-unavailable',
        detail: loading
          ? 'Preparing exact geometry for the selected Assembly Order operation.'
          : currentOperationBlocker
            ? `${currentOperationBlocker.detail} [${currentOperationBlocker.code}]`
            : 'Prepare the selected Assembly Order operation before planning its session draft.',
        operationNumber: source.selectedOperationNumber || null,
        processKind: 'connect',
      },
    };
  const workspaceContextControl = draftCadSession ? (
    <PatternImportDxfPhaseECad2dToolContextSwitchV1
      context={effectiveDesktopMode}
      patternAvailable
      onContextChange={setDesktopMode}
    />
  ) : null;
  const linkedOperationsEditor = operationsPanel ?? (
    <div className='space-y-3 p-3' data-cad-assembly-order-context=''>
      <div>
        <Text component='p' size='micro' variant='label' tracking='label'>
          LINKED ASSEMBLY ORDER
        </Text>
        <Text component='p' className='font-bold tabular-nums'>
          Operation #{source.selectedOperationNumber}
        </Text>
      </div>
      <div className='space-y-1 border-y border-hairline py-2'>
        <Text component='p' size='micro' variant='label'>
          Workspace
        </Text>
        <Text component='p' size='micro' className='font-bold'>
          {exactNSession
            ? 'Assembly geometry'
            : effectiveDesktopMode === 'assembly'
              ? 'Sew & assemble'
              : 'Edit patterns'}
        </Text>
        <Text component='p' size='micro' variant='label'>
          {exactNResolution?.ok
            ? `${exactNResolution.model.seamCount}/${exactNResolution.model.seamCount} exact seams verified`
            : `${state?.seams.filter((seam) => seam.confirmed).length ?? 0}/2 exact seams confirmed`}
        </Text>
      </div>
      {stitchVisual ? (
        <div className='space-y-1'>
          <Text component='p' size='micro' variant='label'>
            Current operation stitch
          </Text>
          <Text component='p' size='micro' className='font-bold'>
            {stitchVisual.seam.classLabel ?? stitchVisual.seam.kind ?? 'Not set'}
          </Text>
          <Text component='p' size='micro' variant='label'>
            {stitchVisual.topstitch.modeLabel ?? 'No topstitch mode'} ·{' '}
            {stitchVisual.topstitch.offsetMm ?? <EmptyCell />} mm offset · thread{' '}
            {stitchVisual.thread.bomLineKey ?? <EmptyCell />}
          </Text>
        </div>
      ) : null}
    </div>
  );
  return (
    <div
      className='min-h-0'
      data-phase-e-multiseam-assembly-order-entry=''
      data-selected-operation-number={source.selectedOperationNumber}
    >
      {!canOpen && availabilityBlocker ? (
        <Blockers
          blockers={[availabilityBlocker]}
          title={
            open && exactNSession && !exactNResolution?.ok
              ? '! Exact-N production owner is no longer current'
              : undefined
          }
        />
      ) : null}
      {submission?.status === 'blocked' ? (
        <Blockers
          blockers={submission.blockers}
          title={
            submission.persistence === 'unknown'
              ? '! Persistence outcome unknown — the write may have committed'
              : submission.persistence === 'acknowledged-unverified'
                ? '! Persistence was acknowledged but read-back is unverified'
                : '! Exact two-seam submission blocked'
          }
        />
      ) : null}
      {submission?.status === 'verified-exact-topology-persisted' ? (
        <CalloutBox tone='note'>
          <Text component='p' className='font-bold'>
            ✓ Exact two-seam topology persisted and verified
          </Text>
          <Text component='p' size='micro'>
            Composite V3 now carries the exact four-side topology. Preview remains blocked here
            until its independent proof gate is integrated.
          </Text>
        </CalloutBox>
      ) : null}
      {submission?.status === 'verified-exact-topology-persisted-downstream-blocked' ? (
        <Blockers
          blockers={submission.blockers}
          title='! Exact topology persisted; garment-mesh ingress blocked'
        />
      ) : null}
      {open && exactNSession?.productionFeed && exactNResolution?.ok && exactNApplicationOwner ? (
        <div
          className='flex items-center justify-between gap-3 border-b border-hairline px-3 py-2'
          data-exact-n-restored-confirm=''
        >
          <Text component='p' size='micro'>
            {exactNConfirmation.status === 'blocked'
              ? exactNConfirmation.detail
              : exactNConfirmation.status === 'verified'
                ? exactNConfirmation.detail
                : 'Restored exact edges are complete and ready for canonical verification.'}
          </Text>
          <Button
            type='button'
            size='xs'
            variant='main'
            disabled={
              frozen ||
              exactNConfirmation.status === 'confirming' ||
              exactNConfirmation.status === 'verified'
            }
            onClick={() => void confirmRestoredExactNSelection()}
          >
            {exactNConfirmation.status === 'confirming'
              ? 'Verifying…'
              : exactNConfirmation.status === 'verified'
                ? 'Verified'
                : 'Confirm exact operation'}
          </Button>
        </div>
      ) : null}
      {open && exactNSession && exactNResolution?.ok ? (
        <PatternImportDxfProductExactNSeamProductionMountV2
          session={exactNSession}
          activeSeamIndex={exactNActiveSeamIndex}
          onActiveSeamIndexChange={setExactNActiveSeamIndex}
          desktopGeometry={exactNDesktop}
          readSavedTopologyAnnotations={readSavedTopologyAnnotations}
          saveWrappedTopologyAnnotations={
            frozen ? undefined : exactNApplicationOwner?.saveWrappedTopologyAnnotations
          }
          sceneOverlayInput={
            exactNMannequinStaging?.ok
              ? {
                  staging: {
                    techCardId: exactNMannequinStaging.staging.techCardId,
                    importGeneration: exactNMannequinStaging.staging.importGeneration,
                    sources: exactNMannequinStaging.staging.sources,
                  },
                  stitchVisuals: stitchVisual
                    ? [
                        {
                          operationNumber: source.selectedOperationNumber,
                          visual: stitchVisual,
                        },
                      ]
                    : [],
                  bomItems,
                }
              : null
          }
          sceneOverlayBlocker={
            exactNMannequinStaging?.ok
              ? null
              : exactNMannequinStaging?.blocker ?? {
                  code: 'exact-n-coordinate-staging-pending',
                  detail:
                    'Reopening exact Phase-D coordinates for the restored material scopes and size.',
                }
          }
          topologyAnnotationAuthoring={
            exactNApplicationOwner &&
            exactNMannequinStaging?.ok &&
            exactNConfirmation.status === 'verified' ? (
              <>
                <PatternImportDxfPhaseEExactNTopologyAnnotationEditorV1
                  source={exactNMannequinStaging.staging.annotationSource}
                  draft={exactNAnnotationDraft}
                  onDraftChange={publishExactNAnnotationReadback}
                  disabled={frozen}
                />
                <PatternImportDxfPhaseETopologyAnnotationSaveControlV5
                  transaction={exactNApplicationOwner.topologyAnnotations}
                  session={exactNSession}
                  source={exactNMannequinStaging.staging.annotationSource}
                  draft={exactNAnnotationDraft}
                  onReadback={publishExactNAnnotationReadback}
                  disabled={frozen}
                />
              </>
            ) : null
          }
          mannequin={({ selection, focusSelection, sceneOverlay, previewScope }) => (
            <div className='flex h-full min-h-0 flex-col'>
              <div className='relative min-h-0 flex-1'>
                <PatternImportDxfPhaseECadMannequinModelPickerV1
                  disabled={frozen}
                  onDisplayedBodyInputV1={physicalHost?.onDisplayedBodyInputV1}
                  onSaveMannequinArrangement={physicalHost?.onSaveMannequinArrangement}
                  onReadMannequinArrangement={physicalHost?.onReadMannequinArrangement}
                  onReadSavedMannequinModelId={physicalHost?.onReadSavedMannequinModelId}
                  arrangementSourceKey={physicalHost?.arrangementSourceKey}
                  patternPieceScene={{
                    annotationSource: exactNMannequinStaging?.ok
                      ? exactNMannequinStaging.staging.annotationSource
                      : matchesPatternImportDxfProductExactNDesktopGeometryV2(
                            exactNDesktop,
                            exactNSession,
                          )
                        ? exactNDesktop.annotationSource ?? undefined
                        : undefined,
                    sources: mannequinDxfSources,
                    sceneOverlay: sceneOverlay,
                    activeScopeKey: exactNMannequinStaging?.ok
                      ? exactNMannequinStaging.staging.activeScopeKey
                      : mannequinDxfSources[0]?.scopeKey ?? null,
                    selection,
                    onFocus: (nextSelection) =>
                      focusSelection({
                        operationNumber:
                          selection?.operationNumber ?? source.selectedOperationNumber,
                        ...nextSelection,
                      }),
                  }}
                  paperDoll={
                    <Suspense
                      fallback={
                        <div className='flex h-full items-center justify-center'>
                          <Text component='p' size='micro' variant='label'>
                            Loading sewn cloth preview…
                          </Text>
                        </div>
                      }
                    >
                      <LazyDollColumn
                        variant='workbench'
                        selection={
                          selection
                            ? {
                                operationNumber: selection.operationNumber,
                                pieceId: selection.pieceId,
                                seamId: selection.seamId,
                              }
                            : null
                        }
                      />
                    </Suspense>
                  }
                />
                {physicalHost?.viewport ? (
                  <CadWorkbenchPhysicalHostPanelV1>
                    {physicalHost.viewport(
                      bindCadWorkbenchPhysicalPreviewSelectionV1(
                        previewScope,
                        source.selectedOperationNumber,
                        focusSelection,
                        selection,
                      ),
                    )}
                  </CadWorkbenchPhysicalHostPanelV1>
                ) : null}
              </div>
            </div>
          )}
          operationsPanel={({ selection, focusSelection }) => (
            <PatternImportDxfPhaseECadTableDraftOperationsPanelV1
              editor={linkedOperationsEditor}
              result={draftPanelResult}
              operationNumber={source.selectedOperationNumber}
              navigation={operationNavigation}
              stitchVisual={stitchVisual}
              stitchEditCapabilities={stitchEditCapabilities}
              onEditStitchField={onEditStitchField}
              cadCommandDrafts={null}
              onSelectOperation={selectOperationFromWorkbench}
              onFocusOperation={(operationNumber) =>
                focusSelection({
                  ...selection,
                  operationNumber,
                })
              }
            />
          )}
        />
      ) : open && !exactNSession ? (
        <PatternImportDxfPhaseECadWorkbenchSplitShellV1
          selection={
            prepared && state
              ? {
                  operationNumber: source.selectedOperationNumber,
                  scopeKey: prepared.scopeKey,
                  pieceId: prepared.projection.pieces[activePieceIndex]?.pieceId,
                  pieceLineKey: prepared.projection.pieces[activePieceIndex]?.pieceLineKey,
                  seamId: state.seams[activeSeamIndex]?.seamId,
                }
              : { operationNumber: source.selectedOperationNumber }
          }
          onSelectionFocus={({ selection }) => {
            if (!selection || !prepared || !state) return;
            if (selection.pieceId || selection.pieceLineKey) {
              const nextPieceIndex = findCadWorkbenchScopedPieceIndexV1(
                selection,
                prepared.scopeKey,
                prepared.projection.pieces,
              );
              if (nextPieceIndex !== 0 && nextPieceIndex !== 1) return;
              setActivePieceIndex(nextPieceIndex);
            }
            const nextSeamIndex = state.seams.findIndex(
              ({ seamId }) => seamId === selection.seamId,
            );
            if (nextSeamIndex === 0 || nextSeamIndex === 1) setActiveSeamIndex(nextSeamIndex);
          }}
          desktop={
            prepared && state ? (
              <div className='flex min-h-full flex-col'>
                {draftCadBlocker ? (
                  <Blockers
                    blockers={[draftCadBlocker]}
                    title='! Pattern/Draft binding unavailable'
                  />
                ) : null}

                <div className='min-h-0 flex-1 overflow-auto'>
                  {effectiveDesktopMode === 'assembly' ? (
                    <Suspense fallback={<Text component='p'>Loading the 2D desktop…</Text>}>
                      <LazyPatternImportDxfProductPhaseEMultiseamWorkbenchV2
                        catalog={prepared.catalog}
                        projection={prepared.projection}
                        proposal={prepared.proposal}
                        state={state}
                        materialOptions={prepared.materialOptions}
                        colorwayOptions={colorwayOptions}
                        activeSeamIndex={activeSeamIndex}
                        activePieceIndex={activePieceIndex}
                        onActiveSeamIndexChange={setActiveSeamIndex}
                        onActivePieceIndexChange={setActivePieceIndex}
                        onStateChange={setState}
                        onConfirm={(result) => void confirm(result)}
                        workspaceContextControl={workspaceContextControl}
                        zeroConnectAuthoringHandoff={zeroConnectAuthoringHandoff}
                        disabled={
                          frozen ||
                          submitting ||
                          persistenceTerminal ||
                          submission?.status === 'in-memory-mapping-authority-ready' ||
                          submission?.status === 'verified-exact-topology-persisted'
                        }
                      />
                    </Suspense>
                  ) : draftCadSession ? (
                    cadCommandSourceLocked ? (
                      <div
                        className='flex min-h-[24rem] items-center justify-center p-4'
                        data-cad-command-source-immutable=''
                      >
                        <CalloutBox tone='note' className='max-w-md'>
                          <Text component='p' className='font-bold'>
                            Pattern edits added to Assembly Order
                          </Text>
                          <Text component='p' size='micro'>
                            This CAD source revision is now immutable. Edit the new draft operations
                            in the existing operation panel, then save the tech card normally.
                          </Text>
                        </CalloutBox>
                      </div>
                    ) : (
                      <Suspense fallback={<Text component='p'>Loading Pattern/Draft…</Text>}>
                        <LazyPatternImportDxfPhaseEDraftCadWorkspaceV1
                          key={`draft:${source.selectedOperationNumber}`}
                          session={draftCadSession}
                          projection={
                            activePreparedMaterialScope?.projection ?? prepared.projection
                          }
                          selection={activePreparedMaterialScope?.selection ?? prepared.selection}
                          compileSource={
                            activePreparedMaterialScope?.compileSource ??
                            prepared.draftCadCompileSource
                          }
                          materialScopeCatalog={materialScopeCatalog}
                          materialScopePreparation={selectableMaterialScopePreparation}
                          preparedMaterialScopeKeys={preparedMaterialScopeKeys}
                          activeMaterialScopeKey={
                            activePreparedMaterialScope?.scopeKey ?? prepared.scopeKey
                          }
                          confirmedImportGeneration={cardSession?.importGeneration ?? 0}
                          arrangementScope={
                            materialScopeDraftArrangements[
                              activePreparedMaterialScope?.scopeKey ?? prepared.scopeKey
                            ] ?? null
                          }
                          onArrangementScopeChange={(arrangement) =>
                            setMaterialScopeDraftArrangements((current) =>
                              updatePatternImportDxfPhaseEDraftCadArrangementScopeMapV1(
                                current,
                                arrangement,
                              ),
                            )
                          }
                          topologyScope={activeDraftTopologyResolution?.scope ?? null}
                          onTopologyScopeChange={publishDraftTopologyScope}
                          onSelectMaterialScope={selectDraftMaterialScope}
                          crossScopeConnectDisabled={
                            frozen ||
                            !preparedResult?.ok ||
                            source.selectedOperationNumber <= 0 ||
                            crossScopeAuthoringHandoff?.status !== 'available' ||
                            !materialScopePreparation?.ok ||
                            materialScopePreparation.scopes.length < 2
                          }
                          onCrossScopeConnect={linkCrossScopeConnection}
                          pressDraftDisabled={
                            frozen ||
                            !preparedResult?.ok ||
                            pressAuthoringHandoff?.status !== 'available'
                          }
                          onCreatePressDraft={preparedResult?.ok ? createPressDraft : undefined}
                          onSessionChange={publishDraftCadSession}
                          workspaceContextControl={workspaceContextControl}
                        />
                      </Suspense>
                    )
                  ) : null}
                </div>
              </div>
            ) : (
              <div
                className='flex h-full min-h-[24rem] items-center justify-center bg-pageBg p-6'
                data-cad-operation-preparation-state={loading ? 'loading' : 'blocked'}
              >
                <div className='max-w-sm space-y-2 text-center'>
                  <Pill tone={loading ? 'attention' : 'warn'}>
                    {loading ? 'preparing operation' : 'geometry unavailable'}
                  </Pill>
                  <Text component='p' size='micro' variant='label'>
                    {loading
                      ? 'Loading exact geometry for the selected operation…'
                      : currentOperationBlocker?.detail ??
                        'This operation does not have a prepared exact CAD source.'}
                  </Text>
                </div>
              </div>
            )
          }
          mannequin={({ selection, focusSelection }) => (
            <div
              className='flex h-full min-h-0 flex-col gap-2'
              data-cad-saved-all-scope-staging={
                savedPreparedResult?.ok
                  ? savedAllScopeMannequinStaging?.key === savedAllScopeMannequinStagingKey
                    ? savedAllScopeMannequinStaging.result.ok
                      ? 'ready'
                      : 'blocked'
                    : 'loading'
                  : undefined
              }
              data-cad-saved-all-scope-staging-blocker={
                savedAllScopeMannequinStaging?.key === savedAllScopeMannequinStagingKey &&
                !savedAllScopeMannequinStaging.result.ok
                  ? savedAllScopeMannequinStaging.result.blocker.code
                  : undefined
              }
            >
              <div className='relative min-h-0 flex-1'>
                <PatternImportDxfPhaseECadMannequinSavedTwoSeamProductionMountV1
                  request={savedTwoSeamSceneOverlayRequest(selection)}
                  fallback={
                    PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_BLOCKED_V1
                  }
                >
                  {(sceneOverlay) => (
                    <PatternImportDxfPhaseECadMannequinModelPickerV1
                      disabled={frozen}
                      onDisplayedBodyInputV1={physicalHost?.onDisplayedBodyInputV1}
                      onSaveMannequinArrangement={physicalHost?.onSaveMannequinArrangement}
                      onReadMannequinArrangement={physicalHost?.onReadMannequinArrangement}
                      onReadSavedMannequinModelId={physicalHost?.onReadSavedMannequinModelId}
                      arrangementSourceKey={physicalHost?.arrangementSourceKey}
                      patternPieceScene={{
                        sources: mannequinDxfSources,
                        sceneOverlay,
                        activeScopeKey:
                          activePreparedMaterialScope?.scopeKey ?? prepared?.scopeKey ?? null,
                        selection,
                        onFocus: (nextSelection) =>
                          focusSelection({
                            operationNumber:
                              selection?.operationNumber ?? source.selectedOperationNumber,
                            ...nextSelection,
                          }),
                      }}
                      paperDoll={
                        prepared && state ? (
                          <Suspense
                            fallback={
                              <div className='flex h-full items-center justify-center'>
                                <Text component='p' size='micro' variant='label'>
                                  Loading sewn cloth preview…
                                </Text>
                              </div>
                            }
                          >
                            <LazyDollColumn
                              variant='workbench'
                              selection={
                                selection
                                  ? {
                                      operationNumber: selection.operationNumber,
                                      pieceId: selection.pieceId,
                                      seamId: selection.seamId,
                                    }
                                  : null
                              }
                            />
                          </Suspense>
                        ) : null
                      }
                    />
                  )}
                </PatternImportDxfPhaseECadMannequinSavedTwoSeamProductionMountV1>
                {physicalHost?.viewport ? (
                  <CadWorkbenchPhysicalHostPanelV1>
                    {physicalHost.viewport(
                      bindCadWorkbenchPhysicalPreviewSelectionV1(
                        effectiveDesktopMode === 'assembly' &&
                          savedPreparedResult?.ok &&
                          prepared === savedPreparedResult.prepared
                          ? {
                              row: savedPreparedResult.prepared.row,
                              sourceFileId: prepared.projection.sourceFileId,
                              sizeToken: prepared.projection.sizeToken,
                            }
                          : null,
                        source.selectedOperationNumber,
                        focusSelection,
                        selection,
                      ),
                    )}
                  </CadWorkbenchPhysicalHostPanelV1>
                ) : null}
              </div>
              {savedAllScopeMannequinStaging?.key === savedAllScopeMannequinStagingKey &&
              !savedAllScopeMannequinStaging.result.ok ? (
                <Text
                  component='p'
                  size='micro'
                  variant='errorLabel'
                  role='alert'
                  className='shrink-0 border-t border-borderColor px-2 py-1'
                >
                  Some saved pattern sets could not be opened. Only the active set is shown.
                </Text>
              ) : null}
            </div>
          )}
          operationsPanel={({ selection, focusSelection }) => (
            <PatternImportDxfPhaseECadTableDraftOperationsPanelV1
              editor={linkedOperationsEditor}
              result={draftPanelResult}
              operationNumber={source.selectedOperationNumber}
              navigation={operationNavigation}
              stitchVisual={stitchVisual}
              stitchEditCapabilities={stitchEditCapabilities}
              onEditStitchField={onEditStitchField}
              cadCommandDrafts={cadCommandDrafts}
              cadCommandAuthoringHandoff={cadCommandAuthoringHandoff}
              cadCommandSourceLocked={cadCommandSourceLocked}
              onCadCommandAuthoringHandoff={setCadCommandHandoff}
              onSelectOperation={selectOperationFromWorkbench}
              onFocusOperation={(operationNumber) =>
                focusSelection({
                  ...selection,
                  operationNumber,
                })
              }
            />
          )}
        />
      ) : null}
    </div>
  );
}
