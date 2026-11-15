import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { DxfProductPhaseDSizeSelectionResultV1 } from 'lib/pattern-import/dxf-product-phase-d-size-selection-v1';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { Button, Input, Pill, Select, Text } from 'ui';

import { PRESS_EQUIPMENT_LABELS } from '../../equipment-options';
import { PRESS_ACTION_LABELS } from '../../operation-options';

import { PatternImportDxfPhaseEDraftCadCanvasV1 } from './draft-cad-canvas-v1';
import {
  applyPatternImportDxfPhaseEDraftCadArrangementActionV1,
  reconcilePatternImportDxfPhaseEDraftCadArrangementScopeV1,
  selectPatternImportDxfPhaseEDraftCadArrangementPiecesV1,
  updatePatternImportDxfPhaseEDraftCadArrangementScopeMapV1,
  type PatternImportDxfPhaseEDraftCadArrangementByScopeV1,
  type PatternImportDxfPhaseEDraftCadArrangementScopeV1,
} from './draft-cad-arrangement-v1';
import type { PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 } from './cad-material-scope-catalog-v1';
import type { PatternImportDxfPhaseECadMaterialScopePreparationResultV1 } from './cad-material-scope-preparation-v1';
import { PatternImportDxfPhaseECadMaterialScopeProductionControlV1 } from './cad-material-scope-production-control-v1';
import { usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1 } from './cad-workbench-split-shell-v1';
import type { PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffResultV1 } from './cad-table-cross-scope-authoring-handoff-v1';
import type { PatternImportDxfPhaseECadTableCrossScopeConnectSideV1 } from './cad-table-cross-scope-connect-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_ACTIONS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_EQUIPMENT_V1,
  type PatternImportDxfPhaseECadTablePressActionV1,
  type PatternImportDxfPhaseECadTablePressAuthoringResultV1,
  type PatternImportDxfPhaseECadTablePressEquipmentV1,
} from './cad-table-press-authoring-v1';
import { stagePatternImportDxfPhaseECadSemanticCompiledArtifactV1 } from './cad-command-semantic-reimport-session-owner-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
  guardPatternImportDxfPhaseECadCommandCompiledReimportCurrentV1,
  readPatternImportDxfPhaseECadCommandCompiledReimportCapabilityV1,
  refusePatternImportDxfPhaseECadCommandCompiledReimportV1,
  requestPatternImportDxfPhaseECadCommandCompiledReimportV1,
  subscribePatternImportDxfPhaseECadCommandCompiledReimportOwnerV1,
  type PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1,
} from './cad-command-compiled-reimport-handoff-v1';
import type { PatternImportDxfPhaseEDraftCadCompileSourceV1 } from './draft-cad-compile-source-v1';
import {
  executePatternImportDxfPhaseEDraftCadCompileUiActionV1,
  type PatternImportDxfPhaseEDraftCadCompileUiStateV1,
} from './draft-cad-compile-ui-v1';
import { PatternImportDxfPhaseEDraftCadEditorShellV1 } from './draft-cad-editor-shell-v1';
import type { PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 } from './draft-cad-geometry-compile-v1';
import {
  redoPatternImportDxfPhaseEDraftCadSessionV1,
  undoPatternImportDxfPhaseEDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadToolV1,
} from './draft-cad-session-v1';
import {
  deletePatternImportDxfPhaseEDraftCadCalloutV1,
  deletePatternImportDxfPhaseEDraftCadMeasurementV1,
  derivePatternImportDxfPhaseEDraftCadTopologySourceIdentityV1,
  formatPatternImportDxfPhaseEDraftCadMeasurementV1,
  selectPatternImportDxfPhaseEDraftCadTopologyAnchorV1,
  selectPatternImportDxfPhaseEDraftCadTopologyToolV1,
  setPatternImportDxfPhaseEDraftCadTopologyUnitV1,
  type PatternImportDxfPhaseEDraftCadTopologySessionV1,
  updatePatternImportDxfPhaseEDraftCadCalloutV1,
} from './draft-cad-topology-session-v1';
import {
  publishPatternImportDxfPhaseEDraftCadTopologyScopeV1,
  reconcilePatternImportDxfPhaseEDraftCadTopologyScopeV1,
  updatePatternImportDxfPhaseEDraftCadTopologyScopeMapV1,
  type PatternImportDxfPhaseEDraftCadTopologyByScopeV1,
  type PatternImportDxfPhaseEDraftCadTopologyScopeV1,
} from './draft-cad-topology-scope-v1';
import { PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CLAIMS_V1 } from './topology-annotation-persistence-capability-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_WORKSPACE_CONTRACT_V1 = Object.freeze({
  existingProjectionRendered: true,
  existingSessionHistoryUsed: true,
  existingSheetViewportUsed: true,
  explicitCompileActionIntegrated: true,
  compileReceiptSessionOnlyAndReleaseable: true,
  compileReceiptRetainsRawDxf: false,
  compileWritesProduction: false,
  compiledDxfHandoffUsesExistingImportReview: true,
  compiledDxfHandoffRequiresExplicitUserAction: true,
  compiledDxfHandoffExactSourceAndGenerationGuarded: true,
  compiledDxfHandoffAutosaves: false,
  exactTopologyMeasurementsAndCalloutsSessionOnly: true,
  workbenchMeasurementUnitReused: true,
  duplicateMeasurementUnitControlHiddenWhenEmbedded: true,
  exactProjectionVertexAnchorsOnly: true,
  topologyNearestPickAllowed: false,
  topologySessionResetsOnSourceIdentity: true,
  topologyScopeControlledWithLocalFallback: true,
  topologyCallerOwnedPerMaterialScope: true,
  topologyPersistenceCapabilityExplicit:
    PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CLAIMS_V1.capabilityExplicit,
  topologyPersistenceIntegrated:
    PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CLAIMS_V1.durablePersistenceClaimed,
  topologyPersistenceSaveActionExposed:
    PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_PERSISTENCE_CLAIMS_V1.manualSaveActionAllowed,
  materialSlotsUseCurrentDraftScopes: true,
  linkedUnpreparedMaterialSlotsAreReadOnlyContext: true,
  materialSlotSwitchRequiresPreparedOwner: true,
  arrangementCallerOwnedPerMaterialScope: true,
  arrangementChangesGeometry: false,
  arrangementCreatesCadCommands: false,
  contextualPressOnlyDuringArrangeSelection: true,
  contextualPressCreatesOperationOwner: false,
  separateSeamAuthorityCreated: false,
  applyEnabled: false,
  productionReady: false,
} as const);

export function resolvePatternImportDxfPhaseEDraftCadWorkspaceTopologyScopeV1(
  input: Readonly<{
    controlled: PatternImportDxfPhaseEDraftCadTopologyScopeV1 | null | undefined;
    local: PatternImportDxfPhaseEDraftCadTopologyScopeV1 | null | undefined;
    scopeKey: string;
    sourceIdentity: string;
  }>,
): PatternImportDxfPhaseEDraftCadTopologyScopeV1 {
  return reconcilePatternImportDxfPhaseEDraftCadTopologyScopeV1(
    input.controlled ?? input.local,
    input.scopeKey,
    input.sourceIdentity,
  );
}

export function showPatternImportDxfPhaseECadContextualPressV1(
  arrangeActive: boolean,
  selectedPieceIds: readonly string[],
  ownerMounted: boolean,
): boolean {
  return arrangeActive && selectedPieceIds.length > 0 && ownerMounted;
}

export type PatternImportDxfPhaseEDraftCadWorkspacePropsV1 = Readonly<{
  session: PatternImportDxfPhaseEDraftCadSessionV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  selection: Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>;
  compileSource: PatternImportDxfPhaseEDraftCadCompileSourceV1;
  materialScopeCatalog?: PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 | null;
  materialScopePreparation?: PatternImportDxfPhaseECadMaterialScopePreparationResultV1 | null;
  preparedMaterialScopeKeys?: readonly string[];
  activeMaterialScopeKey?: string;
  /** Confirmed import generation visible when this compile starts; zero for saved-only sources. */
  confirmedImportGeneration?: number;
  onSelectMaterialScope?: (scopeKey: string) => void;
  workspaceContextControl?: ReactNode;
  arrangementScope?: PatternImportDxfPhaseEDraftCadArrangementScopeV1 | null;
  onArrangementScopeChange?: (
    arrangement: PatternImportDxfPhaseEDraftCadArrangementScopeV1,
  ) => void;
  topologyScope?: PatternImportDxfPhaseEDraftCadTopologyScopeV1 | null;
  onTopologyScopeChange?: (scope: PatternImportDxfPhaseEDraftCadTopologyScopeV1) => void;
  onSessionChange: (session: PatternImportDxfPhaseEDraftCadSessionV1) => void;
  crossScopeConnectDisabled?: boolean;
  onCrossScopeConnect?: (
    sides: readonly [
      PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
      PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
    ],
    direction: 'same' | 'reversed',
  ) => Promise<PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffResultV1>;
  pressDraftDisabled?: boolean;
  onCreatePressDraft?: (
    selectedPieceIds: readonly string[],
    pressAction: PatternImportDxfPhaseECadTablePressActionV1,
    pressEquipment: PatternImportDxfPhaseECadTablePressEquipmentV1,
  ) => PatternImportDxfPhaseECadTablePressAuthoringResultV1;
}>;

export function PatternImportDxfPhaseEDraftCadWorkspaceV1({
  session,
  projection,
  selection,
  compileSource,
  materialScopeCatalog = null,
  materialScopePreparation = null,
  preparedMaterialScopeKeys,
  activeMaterialScopeKey,
  confirmedImportGeneration = 0,
  onSelectMaterialScope,
  workspaceContextControl,
  arrangementScope = null,
  onArrangementScopeChange,
  topologyScope = null,
  onTopologyScopeChange,
  onSessionChange,
  crossScopeConnectDisabled = false,
  onCrossScopeConnect,
  pressDraftDisabled = false,
  onCreatePressDraft,
}: PatternImportDxfPhaseEDraftCadWorkspacePropsV1) {
  const workbenchMeasurementUnit = usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1();
  const [activeTool, setActiveTool] =
    useState<PatternImportDxfPhaseEDraftCadToolV1>('internal-line');
  const [activePieceIndex, setActivePieceIndex] = useState(0);
  const [arrangeActive, setArrangeActive] = useState(false);
  const [panActive, setPanActive] = useState(false);
  const [crossScopeConnectActive, setCrossScopeConnectActive] = useState(false);
  const [crossScopeSides, setCrossScopeSides] = useState<
    readonly [
      PatternImportDxfPhaseECadTableCrossScopeConnectSideV1 | null,
      PatternImportDxfPhaseECadTableCrossScopeConnectSideV1 | null,
    ]
  >([null, null]);
  const [crossScopeConnecting, setCrossScopeConnecting] = useState(false);
  const [crossScopeResult, setCrossScopeResult] =
    useState<PatternImportDxfPhaseECadTableCrossScopeAuthoringHandoffResultV1 | null>(null);
  const [pressAction, setPressAction] = useState<string>('');
  const [pressEquipment, setPressEquipment] = useState<string>('');
  const [pressResult, setPressResult] =
    useState<PatternImportDxfPhaseECadTablePressAuthoringResultV1 | null>(null);
  const pressSubmitLocked = useRef(false);
  const [localArrangements, setLocalArrangements] =
    useState<PatternImportDxfPhaseEDraftCadArrangementByScopeV1>({});
  const [compileState, setCompileState] =
    useState<PatternImportDxfPhaseEDraftCadCompileUiStateV1 | null>(null);
  const [pendingCompiledReimport, setPendingCompiledReimport] = useState<Readonly<{
    artifact: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1;
    confirmedImportGenerationAtCompile: number;
    sessionCursorAtCompile: number;
  }> | null>(null);
  const [compiledReimportResult, setCompiledReimportResult] =
    useState<PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1 | null>(null);
  const compiledReimportEpoch = useRef(0);
  const compiledReimportRequestLocked = useRef(false);
  const subscribeCompiledReimportOwner = useCallback(
    (listener: () => void) =>
      subscribePatternImportDxfPhaseECadCommandCompiledReimportOwnerV1(
        compileSource.techCardId,
        listener,
      ),
    [compileSource.techCardId],
  );
  const readCompiledReimportCapability = useCallback(
    () =>
      readPatternImportDxfPhaseECadCommandCompiledReimportCapabilityV1(compileSource.techCardId),
    [compileSource.techCardId],
  );
  const compiledReimportCapability = useSyncExternalStore(
    subscribeCompiledReimportOwner,
    readCompiledReimportCapability,
    readCompiledReimportCapability,
  );
  useEffect(
    () => () => {
      compiledReimportEpoch.current += 1;
      compiledReimportRequestLocked.current = true;
    },
    [],
  );
  const materialScopeKey =
    activeMaterialScopeKey ??
    (compileSource.scopes.length === 1 ? compileSource.scopes[0]?.target.scopeKey : undefined) ??
    '';
  const arrangementKey = materialScopeKey || '__default__';
  const pieceIds = useMemo(() => projection.pieces.map(({ pieceId }) => pieceId), [projection]);
  const arrangement = useMemo(
    () =>
      reconcilePatternImportDxfPhaseEDraftCadArrangementScopeV1(
        arrangementScope ?? localArrangements[arrangementKey],
        arrangementKey,
        pieceIds,
      ),
    [arrangementKey, arrangementScope, localArrangements, pieceIds],
  );
  const selectedPieceIds = arrangement.selectedPieceIds;
  const selectedPieceIdentity = selectedPieceIds.join('\u0000');
  useEffect(() => {
    pressSubmitLocked.current = false;
    setPressResult(null);
  }, [selectedPieceIdentity]);
  const publishArrangement = (next: PatternImportDxfPhaseEDraftCadArrangementScopeV1): void => {
    if (onArrangementScopeChange) onArrangementScopeChange(next);
    else
      setLocalArrangements((current) =>
        updatePatternImportDxfPhaseEDraftCadArrangementScopeMapV1(current, next),
      );
  };
  const topologySourceIdentity = useMemo(
    () => derivePatternImportDxfPhaseEDraftCadTopologySourceIdentityV1(session, projection),
    [projection, session],
  );
  const topologyScopeKey = materialScopeKey || 'default';
  const [localTopologyScopes, setLocalTopologyScopes] =
    useState<PatternImportDxfPhaseEDraftCadTopologyByScopeV1>({});
  const currentTopologyScope = useMemo(
    () =>
      resolvePatternImportDxfPhaseEDraftCadWorkspaceTopologyScopeV1({
        controlled: topologyScope,
        local: localTopologyScopes[topologyScopeKey],
        scopeKey: topologyScopeKey,
        sourceIdentity: topologySourceIdentity,
      }),
    [localTopologyScopes, topologyScope, topologyScopeKey, topologySourceIdentity],
  );
  const topologySession = currentTopologyScope.session;
  const updateTopologySession = (
    update: (
      current: PatternImportDxfPhaseEDraftCadTopologySessionV1,
    ) => PatternImportDxfPhaseEDraftCadTopologySessionV1,
  ) => {
    const nextScope = publishPatternImportDxfPhaseEDraftCadTopologyScopeV1(
      currentTopologyScope,
      update(topologySession),
    );
    if (onTopologyScopeChange) onTopologyScopeChange(nextScope);
    else
      setLocalTopologyScopes((current) =>
        updatePatternImportDxfPhaseEDraftCadTopologyScopeMapV1(current, nextScope),
      );
  };

  useEffect(() => {
    const unit = workbenchMeasurementUnit?.unit;
    if (!unit || currentTopologyScope.session.unit === unit) return;

    const nextScope = publishPatternImportDxfPhaseEDraftCadTopologyScopeV1(
      currentTopologyScope,
      setPatternImportDxfPhaseEDraftCadTopologyUnitV1(currentTopologyScope.session, unit),
    );
    if (onTopologyScopeChange) onTopologyScopeChange(nextScope);
    else
      setLocalTopologyScopes((current) =>
        updatePatternImportDxfPhaseEDraftCadTopologyScopeMapV1(current, nextScope),
      );
  }, [currentTopologyScope, onTopologyScopeChange, workbenchMeasurementUnit?.unit]);

  useEffect(() => {
    compiledReimportEpoch.current += 1;
    compiledReimportRequestLocked.current = false;
    setCompileState(null);
    setPendingCompiledReimport(null);
    setCompiledReimportResult(null);
  }, [
    compileSource.techCardId,
    confirmedImportGeneration,
    projection.expectedCatalogCanonicalSha256,
    projection.sizeSelectionCanonicalSha256,
    selection.selection.canonicalSha256,
    selection.selection.scopeKey,
    selection.selection.sizeToken,
    session.cursor,
    session.source.phaseD.selectedGeometrySha256,
    session.source.phaseD.sourceFileId,
    session.source.phaseD.sourceSha256,
    session.source.revision,
  ]);

  const publishSession = (next: PatternImportDxfPhaseEDraftCadSessionV1) => {
    compiledReimportEpoch.current += 1;
    compiledReimportRequestLocked.current = false;
    setCompileState(null);
    setPendingCompiledReimport(null);
    setCompiledReimportResult(null);
    onSessionChange(next);
  };

  const undo = () => {
    const result = undoPatternImportDxfPhaseEDraftCadSessionV1(session);
    if (result.ok) publishSession(result.session);
  };
  const redo = () => {
    const result = redoPatternImportDxfPhaseEDraftCadSessionV1(session);
    if (result.ok) publishSession(result.session);
  };
  const changeCrossScopeConnect = (active: boolean) => {
    setCrossScopeConnectActive(active);
    setCrossScopeSides([null, null]);
    setCrossScopeResult(null);
    setCrossScopeConnecting(false);
    if (active) {
      setArrangeActive(false);
      setPanActive(false);
      updateTopologySession((current) =>
        selectPatternImportDxfPhaseEDraftCadTopologyToolV1(current, null),
      );
    }
  };
  const selectCrossScopeEdge = (side: PatternImportDxfPhaseECadTableCrossScopeConnectSideV1) => {
    setCrossScopeResult(null);
    setCrossScopeSides((current) => {
      if (!current[0]) return [side, null];
      if (current[0].scopeKey === side.scopeKey) return current;
      return [current[0], side];
    });
  };
  const submitCrossScopeConnect = async (direction: 'same' | 'reversed') => {
    if (crossScopeConnecting || !onCrossScopeConnect || !crossScopeSides[0] || !crossScopeSides[1])
      return;
    setCrossScopeConnecting(true);
    try {
      const result = await onCrossScopeConnect([crossScopeSides[0], crossScopeSides[1]], direction);
      setCrossScopeResult(result);
      if (result.ok) {
        setCrossScopeConnectActive(false);
        setCrossScopeSides([null, null]);
      }
    } finally {
      setCrossScopeConnecting(false);
    }
  };
  const submitPressDraft = () => {
    if (
      pressSubmitLocked.current ||
      !onCreatePressDraft ||
      pressDraftDisabled ||
      !PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_ACTIONS_V1.includes(pressAction as never) ||
      !PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_EQUIPMENT_V1.includes(pressEquipment as never)
    )
      return;
    pressSubmitLocked.current = true;
    const result = onCreatePressDraft(
      selectedPieceIds,
      pressAction as PatternImportDxfPhaseECadTablePressActionV1,
      pressEquipment as PatternImportDxfPhaseECadTablePressEquipmentV1,
    );
    if (!result.ok) pressSubmitLocked.current = false;
    setPressResult(result);
  };
  const compileDraft = () => {
    const epoch = compiledReimportEpoch.current + 1;
    compiledReimportEpoch.current = epoch;
    compiledReimportRequestLocked.current = false;
    setPendingCompiledReimport(null);
    setCompiledReimportResult(null);
    let compiledArtifact: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 | null = null;
    const nextCompileState = executePatternImportDxfPhaseEDraftCadCompileUiActionV1(
      {
        session,
        projection,
        selection,
        compileSource,
      },
      undefined,
      (artifact) => {
        compiledArtifact = artifact;
      },
    );
    setCompileState(nextCompileState);
    if (!compiledArtifact) return;
    const artifact = compiledArtifact;
    const confirmedImportGenerationAtCompile = confirmedImportGeneration;
    const sessionCursorAtCompile = session.cursor;
    void stagePatternImportDxfPhaseECadSemanticCompiledArtifactV1(artifact, {
      confirmedImportGenerationAtCompile,
    })
      .then((staged) => {
        if (compiledReimportEpoch.current !== epoch) return;
        if (!staged) {
          setCompiledReimportResult(
            refusePatternImportDxfPhaseECadCommandCompiledReimportV1(
              'reimport-request-invalid',
              'Compiled DXF correlation could not be staged. Compile the current source again.',
            ),
          );
          return;
        }
        setPendingCompiledReimport(
          Object.freeze({
            artifact,
            confirmedImportGenerationAtCompile,
            sessionCursorAtCompile,
          }),
        );
      })
      .catch(() => {
        if (compiledReimportEpoch.current !== epoch) return;
        setCompiledReimportResult(
          refusePatternImportDxfPhaseECadCommandCompiledReimportV1(
            'reimport-request-invalid',
            'Compiled DXF correlation failed. Compile the current source again.',
          ),
        );
      });
  };
  const releaseCompile = () => {
    compiledReimportEpoch.current += 1;
    compiledReimportRequestLocked.current = false;
    setCompileState(null);
    setPendingCompiledReimport(null);
    setCompiledReimportResult(null);
  };
  const requestCompiledReimport = () => {
    if (compiledReimportRequestLocked.current || !pendingCompiledReimport) return;
    compiledReimportRequestLocked.current = true;
    const request = {
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
      artifact: pendingCompiledReimport.artifact,
      confirmedImportGenerationAtCompile:
        pendingCompiledReimport.confirmedImportGenerationAtCompile,
      cadSessionCursorAtCompile: pendingCompiledReimport.sessionCursorAtCompile,
    } as const;
    const stale = guardPatternImportDxfPhaseECadCommandCompiledReimportCurrentV1(request, {
      techCardId: compileSource.techCardId,
      confirmedImportGeneration,
      cadSessionCursor: session.cursor,
      sourceRevision: session.source.revision,
      sourceFileId: session.source.phaseD.sourceFileId,
      sourceSha256: session.source.phaseD.sourceSha256,
      selectedGeometrySha256: session.source.phaseD.selectedGeometrySha256,
      catalogCanonicalSha256: projection.expectedCatalogCanonicalSha256,
      sizeSelectionCanonicalSha256: selection.selection.canonicalSha256,
      scopeKey: selection.selection.scopeKey,
      sizeToken: selection.selection.sizeToken,
    });
    const result = stale ?? requestPatternImportDxfPhaseECadCommandCompiledReimportV1(request);
    setCompiledReimportResult(result);
    if (result.ok) setPendingCompiledReimport(null);
    compiledReimportRequestLocked.current = result.ok;
  };

  return (
    <PatternImportDxfPhaseEDraftCadEditorShellV1
      session={session}
      activeTool={activeTool}
      activeTopologyTool={topologySession.activeTool}
      arrangeActive={arrangeActive}
      panActive={panActive}
      onPanChange={setPanActive}
      connectActive={crossScopeConnectActive}
      onConnectChange={
        onCrossScopeConnect && !crossScopeConnectDisabled ? changeCrossScopeConnect : undefined
      }
      selectedPieceIds={selectedPieceIds}
      onArrangeSelectionAction={(action) =>
        publishArrangement(
          applyPatternImportDxfPhaseEDraftCadArrangementActionV1(arrangement, action),
        )
      }
      materialScopes={
        materialScopeCatalog?.ok
          ? materialScopeCatalog.scopes.map((scope) => ({
              scopeKey: scope.scopeKey,
              label: scope.label,
              pieceCount: scope.pieceLineKeys.length,
              active: scope.scopeKey === materialScopeKey,
            }))
          : []
      }
      onFocusPiece={(pieceId, toggle) => {
        const index = projection.pieces.findIndex((piece) => piece.pieceId === pieceId);
        if (index < 0) return;
        const next = !toggle
          ? [pieceId]
          : selectedPieceIds.includes(pieceId)
            ? selectedPieceIds.filter((candidate) => candidate !== pieceId)
            : [...selectedPieceIds, pieceId];
        publishArrangement(
          selectPatternImportDxfPhaseEDraftCadArrangementPiecesV1(arrangement, next, pieceIds),
        );
        setActivePieceIndex(index);
      }}
      onArrangeChange={(active) => {
        setArrangeActive(active);
        if (active && selectedPieceIds.length === 0) {
          const activePieceId = projection.pieces[activePieceIndex]?.pieceId;
          if (activePieceId)
            publishArrangement(
              selectPatternImportDxfPhaseEDraftCadArrangementPiecesV1(
                arrangement,
                [activePieceId],
                pieceIds,
              ),
            );
        }
      }}
      onToolChange={(tool) => {
        setActiveTool(tool);
        updateTopologySession((current) =>
          selectPatternImportDxfPhaseEDraftCadTopologyToolV1(current, null),
        );
      }}
      onTopologyToolChange={(tool) =>
        updateTopologySession((current) =>
          selectPatternImportDxfPhaseEDraftCadTopologyToolV1(current, tool),
        )
      }
      onUndo={undo}
      onRedo={redo}
      canCompile={session.cursor > 0}
      compileState={compileState}
      onCompile={compileDraft}
      compiledReimportAction={
        compileState?.status === 'compiled-reimport-required'
          ? {
              available: compiledReimportCapability.available,
              ready: Boolean(pendingCompiledReimport),
              result: compiledReimportResult,
              onRequest: requestCompiledReimport,
            }
          : undefined
      }
      onReleaseCompile={releaseCompile}
      workspaceContextControl={workspaceContextControl}
      renderDraft={() => (
        <div className='grid h-full min-h-[30rem] grid-rows-[auto_minmax(0,1fr)_auto]'>
          <div className='flex flex-wrap items-center gap-2 border-b border-borderColor bg-bgColor px-2 py-1'>
            <PatternImportDxfPhaseECadMaterialScopeProductionControlV1
              catalog={materialScopeCatalog}
              preparation={materialScopePreparation}
              active={{
                techCardId: compileSource.techCardId,
                scopeKey: materialScopeKey,
              }}
              preparedScopeKeys={
                preparedMaterialScopeKeys ?? (materialScopeKey ? [materialScopeKey] : [])
              }
              onSelectPreparedScope={onSelectMaterialScope}
              crossScopeOperationBindingAvailable={Boolean(
                onCrossScopeConnect && !crossScopeConnectDisabled,
              )}
            />
            {showPatternImportDxfPhaseECadContextualPressV1(
              arrangeActive,
              selectedPieceIds,
              Boolean(onCreatePressDraft),
            ) ? (
              <div
                className='flex min-w-0 items-center gap-1 border-l border-hairline pl-2'
                data-cad-contextual-press-authoring=''
              >
                <Text component='span' size='micro' className='whitespace-nowrap font-bold'>
                  Press · {selectedPieceIds.length}
                </Text>
                <Select
                  name='cad-contextual-press-action'
                  size='sm'
                  value={pressAction}
                  placeholder='action'
                  items={PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_ACTIONS_V1.map((value) => ({
                    value,
                    label: PRESS_ACTION_LABELS[value],
                  }))}
                  onValueChange={(value) => {
                    pressSubmitLocked.current = false;
                    setPressAction(value);
                    setPressResult(null);
                  }}
                  readOnly={pressDraftDisabled}
                />
                <Select
                  name='cad-contextual-press-equipment'
                  size='sm'
                  value={pressEquipment}
                  placeholder='equipment'
                  items={PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_EQUIPMENT_V1.map((value) => ({
                    value,
                    label: PRESS_EQUIPMENT_LABELS[value],
                  }))}
                  onValueChange={(value) => {
                    pressSubmitLocked.current = false;
                    setPressEquipment(value);
                    setPressResult(null);
                  }}
                  readOnly={pressDraftDisabled}
                />
                <Button
                  type='button'
                  size='xs'
                  variant='main'
                  disabled={
                    pressDraftDisabled ||
                    !pressAction ||
                    !pressEquipment ||
                    Boolean(pressResult?.ok)
                  }
                  onClick={submitPressDraft}
                >
                  Add draft
                </Button>
                {pressResult ? (
                  <Text
                    component='span'
                    size='micro'
                    variant={pressResult.ok ? 'label' : 'errorLabel'}
                    className='max-w-48 truncate'
                    title={pressResult.blocker?.detail}
                    data-cad-contextual-press-result={pressResult.ok ? 'inserted' : 'refused'}
                  >
                    {pressResult.ok ? 'draft added' : pressResult.blocker.detail}
                  </Text>
                ) : null}
              </div>
            ) : null}
            {crossScopeConnectActive ? (
              <div
                className='flex min-w-0 items-center gap-1 border-l border-hairline pl-2'
                data-cad-cross-scope-connect-ingress=''
              >
                <Text component='span' size='micro' className='truncate font-bold'>
                  {!crossScopeSides[0]
                    ? 'Choose edge A'
                    : !crossScopeSides[1]
                      ? `${crossScopeSides[0].scopeKey} · ${crossScopeSides[0].pieceLineKey} → choose another material`
                      : `${crossScopeSides[0].scopeKey} ↔ ${crossScopeSides[1].scopeKey}`}
                </Text>
                {crossScopeSides[0] && crossScopeSides[1] ? (
                  <>
                    <Button
                      type='button'
                      size='xs'
                      variant='underline'
                      disabled={crossScopeConnecting}
                      onClick={() => void submitCrossScopeConnect('reversed')}
                    >
                      Reversed
                    </Button>
                    <Button
                      type='button'
                      size='xs'
                      variant='underline'
                      disabled={crossScopeConnecting}
                      onClick={() => void submitCrossScopeConnect('same')}
                    >
                      Same
                    </Button>
                  </>
                ) : null}
                <Button
                  type='button'
                  size='xs'
                  variant='underline'
                  onClick={() => changeCrossScopeConnect(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : crossScopeResult ? (
              <Text
                component='span'
                size='micro'
                variant='label'
                data-cad-cross-scope-connect-result={crossScopeResult.ok ? 'linked' : 'refused'}
                title={crossScopeResult.blocker?.detail}
              >
                {crossScopeResult.ok
                  ? 'cross-material seam linked'
                  : crossScopeResult.blocker.detail}
              </Text>
            ) : null}
            {!workbenchMeasurementUnit ? (
              <div
                className='ml-auto flex items-center'
                role='group'
                aria-label='Draft measurement unit'
              >
                {(['mm', 'cm', 'in'] as const).map((unit) => (
                  <Button
                    key={unit}
                    type='button'
                    size='xs'
                    variant={topologySession.unit === unit ? 'main' : 'underline'}
                    aria-pressed={topologySession.unit === unit}
                    onClick={() =>
                      updateTopologySession((current) =>
                        setPatternImportDxfPhaseEDraftCadTopologyUnitV1(current, unit),
                      )
                    }
                  >
                    {unit}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
          <PatternImportDxfPhaseEDraftCadCanvasV1
            session={session}
            projection={projection}
            scopeKey={topologyScopeKey}
            activePieceIndex={activePieceIndex}
            activeTool={activeTool}
            arrangeActive={arrangeActive}
            panActive={panActive}
            crossScopeConnectActive={crossScopeConnectActive}
            onActivePieceIndexChange={setActivePieceIndex}
            selectedPieceIds={selectedPieceIds}
            onSelectedPieceIdsChange={(next) =>
              publishArrangement(
                selectPatternImportDxfPhaseEDraftCadArrangementPiecesV1(
                  arrangement,
                  next,
                  pieceIds,
                ),
              )
            }
            arrangement={arrangement}
            onArrangementChange={publishArrangement}
            topologySession={topologySession}
            activeTopologyTool={topologySession.activeTool}
            onSessionChange={publishSession}
            onTopologyAnchor={(anchor) =>
              updateTopologySession((current) =>
                selectPatternImportDxfPhaseEDraftCadTopologyAnchorV1(projection, current, anchor),
              )
            }
            onCrossScopeEdge={selectCrossScopeEdge}
          />
          <details
            className='border-t border-borderColor bg-bgColor'
            open={Boolean(topologySession.activeTool || topologySession.blocker)}
            data-draft-cad-topology-session=''
          >
            <summary className='cursor-pointer list-none px-2 py-1.5 text-micro font-bold uppercase marker:hidden'>
              Measurements · {topologySession.measurements.length} / Callouts ·{' '}
              {topologySession.callouts.length}
            </summary>
            <div className='grid gap-2 border-t border-hairline p-2 lg:grid-cols-2'>
              <section className='space-y-1.5' aria-label='Draft measurements'>
                <div className='flex items-center justify-between gap-2'>
                  <Text component='p' size='micro' className='font-bold'>
                    Measurements
                  </Text>
                  <Pill tone='ink'>Unsaved</Pill>
                </div>
                {topologySession.activeTool?.startsWith('measure-') ? (
                  <Text component='p' size='micro' variant='label'>
                    {topologySession.pendingAnchors.length
                      ? 'Choose the second exact vertex.'
                      : 'Choose an exact vertex from the sealed projection.'}
                  </Text>
                ) : null}
                {!topologySession.measurements.length ? (
                  <Text component='p' size='micro' variant='label'>
                    Point, line and adjacent-edge readouts reuse the exact measurement owner.
                  </Text>
                ) : null}
                {topologySession.measurements.map((measurement, index) => (
                  <div
                    key={measurement.id}
                    className='flex items-center gap-2 border-t border-hairline pt-1 text-micro'
                  >
                    <span className='text-labelColor'>
                      {index + 1}. {measurement.kind}
                    </span>
                    <span className='ml-auto font-bold tabular-nums'>
                      {formatPatternImportDxfPhaseEDraftCadMeasurementV1(
                        projection,
                        measurement,
                        topologySession.unit,
                      )}
                    </span>
                    <Button
                      type='button'
                      size='xs'
                      variant='underline'
                      aria-label={`Delete draft measurement ${index + 1}`}
                      onClick={() =>
                        updateTopologySession((current) =>
                          deletePatternImportDxfPhaseEDraftCadMeasurementV1(
                            current,
                            measurement.id,
                          ),
                        )
                      }
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </section>

              <section className='space-y-1.5' aria-label='Draft callouts'>
                <div className='flex items-center justify-between gap-2'>
                  <Text component='p' size='micro' className='font-bold'>
                    Callouts
                  </Text>
                  <Pill tone='ink'>Unsaved</Pill>
                </div>
                {topologySession.activeTool === 'callout' ? (
                  <Text component='p' size='micro' variant='label'>
                    Choose one exact topology vertex for the leader anchor.
                  </Text>
                ) : null}
                {!topologySession.callouts.length ? (
                  <Text component='p' size='micro' variant='label'>
                    No callouts in this Draft source session.
                  </Text>
                ) : null}
                {topologySession.callouts.map((callout, index) => (
                  <div
                    key={callout.id}
                    className='flex items-center gap-1 border-t border-hairline pt-1'
                  >
                    <span className='inline-flex h-5 w-5 flex-none items-center justify-center bg-textColor text-nano text-bgColor'>
                      {index + 1}
                    </span>
                    <Input
                      type='text'
                      aria-label={`Draft callout ${index + 1} text`}
                      className='min-w-0 flex-1 text-micro'
                      value={callout.text}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateTopologySession((current) =>
                          updatePatternImportDxfPhaseEDraftCadCalloutV1(
                            projection,
                            current,
                            callout.id,
                            event.target.value,
                          ),
                        )
                      }
                    />
                    <Button
                      type='button'
                      size='xs'
                      variant='underline'
                      aria-label={`Delete draft callout ${index + 1}`}
                      onClick={() =>
                        updateTopologySession((current) =>
                          deletePatternImportDxfPhaseEDraftCadCalloutV1(
                            projection,
                            current,
                            callout.id,
                          ),
                        )
                      }
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </section>
              {topologySession.blocker ? (
                <Text component='p' size='micro' variant='errorLabel' className='lg:col-span-2'>
                  {topologySession.blocker}
                </Text>
              ) : null}
            </div>
          </details>
        </div>
      )}
    />
  );
}
