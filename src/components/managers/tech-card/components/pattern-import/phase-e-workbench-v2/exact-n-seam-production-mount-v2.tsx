import type {
  SavedGenericDurablePhysicalPreviewScopeV1,
  SavedGenericDurablePhysicalPreviewSeamV1,
} from 'components/cloth-simulation-spike/saved-generic-durable-physical-host-v1';
import type { ReactNode } from 'react';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { CadTablePieceFeaturesByKey } from './cad-table-piece-features-v1';
import {
  activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1,
  PatternImportDxfPhaseECadTableZeroConnectCanvasV1,
  useCadTableZeroCanvasOwner,
} from './cad-table-zero-connect-canvas-v1';
import {
  CadTablePieceSelectionPanel,
  handleCadTablePieceSelectionKey,
} from './cad-table-piece-selection-panel-v1';

import {
  PatternImportDxfPhaseECadWorkbenchSplitShellV1,
  type PatternImportDxfPhaseECadWorkbenchSlotContextV1,
  type PatternImportDxfPhaseECadWorkbenchSelectionV1,
  type PatternImportDxfPhaseECadWorkbenchSlotV1,
} from './cad-workbench-split-shell-v1';
import {
  buildPatternImportDxfPhaseECadMannequinProductionSceneOverlayV2,
  type PatternImportDxfPhaseECadMannequinProductionSceneOverlayRequestV2,
} from './cad-mannequin-production-scene-overlay-adapter-v2';
import { buildPatternImportDxfPhaseECadMannequinSavedOneSeamSceneOverlayV1 } from './cad-mannequin-saved-one-seam-scene-overlay-v1';
import { bridgePatternImportDxfPhaseECadMannequinSceneOverlayToRendererV1 } from './cad-mannequin-scene-overlay-renderer-bridge-v1';
import type { PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 } from './cad-table-zero-connect-phase-e-authority-v1';
import type { PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 } from './cad-workbench-mannequin-model-picker-v1';
import { findCadWorkbenchScopedPieceIndexV1 } from './cad-workbench-piece-selection-v1';
import { derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1 } from './cad-table-connect-edge-segments-v1';
import { cadWorkbenchOperationSeamOrdinal } from './cad-workbench-seam-ordinal-v1';
import { matchesPatternImportDxfProductExactNDesktopGeometryV2 } from './durable-exact-session-current-v1';
import {
  usePatternImportDxfPhaseERestoredTopologyAnnotationsV1,
  type PatternImportDxfPhaseERestoredTopologyAnnotationReaderV1,
} from './restored-topology-annotation-reader-v1';
import { PatternImportDxfPhaseESavedTopologyAnnotationEditControlV1 } from './saved-topology-annotation-edit-control-v1';
import type { PatternImportDxfPhaseEWrappedTopologyAnnotationSaveV1 } from './wrapped-topology-annotation-save-v1';
import type { PatternImportDxfProductExactNSeamUiSelectionOwnerV2 } from './exact-n-seam-atomic-ui-selection-v2';
import type { PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1 } from './golden-card-production-v2-snapshot-feed-v1';
import {
  PatternImportDxfProductExactNSeamWorkbenchHostV2,
  resolvePatternImportDxfProductExactNSeamWorkbenchHostV2,
  type PatternImportDxfProductExactNSeamWorkbenchCurrentBindingsV2,
  type PatternImportDxfProductExactNSeamWorkbenchHostResultV2,
} from './exact-n-seam-workbench-host-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PRODUCTION_MOUNT_V2 =
  'pattern-import-dxf-product-exact-n-seam-production-mount/2' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PRODUCTION_MOUNT_CLAIMS_V2 = Object.freeze({
  compositeV4AtomicSelectionOwnerRequired: true,
  freshCurrentBindingsReverifiedByHost: true,
  exactOneOrGreaterThanTwoOnly: true,
  exactTwoRemainsOnV3V1: true,
  existingSplitShellReused: true,
  existingMannequinSlotReused: true,
  existingAssemblyOrderWindowReused: true,
  exactProductionSceneOverlayAdapterReused: true,
  exactSceneOverlayRendererBridgeReused: true,
  missingSceneInputsFailClosed: true,
  activeSeamPointerCallerOwned: true,
  readOnlyHost: true,
  exactNEditOrApplyControlsRendered: false,
  topologyAnnotationAuthoringSlotAvailable: true,
  savedAnnotationReaderCallerOwned: true,
  topologyAnnotationPersistenceCallerOwned: true,
  createsSecondWriter: false,
  fixtureAuthorityAccepted: false,
  persistencePerformed: false,
  networkPerformed: false,
  fakeFallbackRendered: false,
} as const);

/**
 * The production route can only obtain this session from the existing
 * Composite V4 transaction -> restore -> projection -> atomic-selection chain. The owner is
 * opaque and the mount rechecks the fresh card/Assembly/catalog/plan tuple before rendering.
 */
export type PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 = Readonly<{
  selectionOwner: PatternImportDxfProductExactNSeamUiSelectionOwnerV2;
  current: PatternImportDxfProductExactNSeamWorkbenchCurrentBindingsV2;
  /** Sanitized caller-owned reconstruction evidence; never derived from rendered UI state. */
  productionFeed?: PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1;
}>;

export type PatternImportDxfProductExactNSeamProductionSceneOverlayInputV2 = Pick<
  PatternImportDxfPhaseECadMannequinProductionSceneOverlayRequestV2,
  'staging' | 'stitchVisuals' | 'bomItems'
>;

export type PatternImportDxfProductExactNSeamProductionMannequinContextV2 =
  PatternImportDxfPhaseECadWorkbenchSlotContextV1 &
    Readonly<{
      sceneOverlay: PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1;
      previewScope: SavedGenericDurablePhysicalPreviewScopeV1 | null;
      previewSeam?: SavedGenericDurablePhysicalPreviewSeamV1;
    }>;

export type PatternImportDxfProductExactNSeamProductionMannequinSlotV2 =
  | ReactNode
  | ((context: PatternImportDxfProductExactNSeamProductionMannequinContextV2) => ReactNode);

export type PatternImportDxfProductExactNDesktopGeometryV2 = Readonly<{
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  annotationSource: Readonly<{ identity: string; revision: string; sha256: string }> | null;
  pieceFeatures?: CadTablePieceFeaturesByKey;
  savedSceneAuthority?: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
}>;

export { matchesPatternImportDxfProductExactNDesktopGeometryV2 } from './durable-exact-session-current-v1';

export type PatternImportDxfProductExactNSeamProductionMountPropsV2 = Readonly<{
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
  activeSeamIndex: number;
  onActiveSeamIndexChange: (index: number) => void;
  mannequin: PatternImportDxfProductExactNSeamProductionMannequinSlotV2;
  operationsPanel: PatternImportDxfPhaseECadWorkbenchSlotV1;
  desktopGeometry?: PatternImportDxfProductExactNDesktopGeometryV2 | null;
  objectSidebar?: PatternImportDxfPhaseECadWorkbenchSlotV1;
  sceneOverlayInput?: PatternImportDxfProductExactNSeamProductionSceneOverlayInputV2 | null;
  sceneOverlayBlocker?: Readonly<{ code: string; detail: string }> | null;
  /** Mounted only by the caller that owns the genuine V4/V5 annotation transaction. */
  topologyAnnotationAuthoring?: ReactNode;
  readSavedTopologyAnnotations?: PatternImportDxfPhaseERestoredTopologyAnnotationReaderV1;
  saveWrappedTopologyAnnotations?: PatternImportDxfPhaseEWrappedTopologyAnnotationSaveV1;
}>;

function sceneOverlayBlocked(
  detail: string,
): PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 {
  return Object.freeze({
    status: 'blocked' as const,
    bridge: null,
    blocker: Object.freeze({
      code: 'authoritative-scene-overlay-invalid' as const,
      detail: detail.slice(0, 2_048),
    }),
  });
}

export function resolvePatternImportDxfProductExactNSeamProductionSceneOverlayV2(
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  activeSeamIndex: number,
  input: PatternImportDxfProductExactNSeamProductionSceneOverlayInputV2 | null | undefined,
  unavailableBlocker?: Readonly<{ code: string; detail: string }> | null,
  focus?: Pick<
    PatternImportDxfPhaseECadWorkbenchSelectionV1,
    'scopeKey' | 'pieceId' | 'pieceLineKey'
  >,
): PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 {
  if (!input)
    return sceneOverlayBlocked(
      unavailableBlocker
        ? `${unavailableBlocker.code}: ${unavailableBlocker.detail}`
        : 'exact-n-coordinate-staging-unavailable: The current Exact-N mount has no exact all-scope coordinate staging and current stitch/BOM scene input.',
    );
  const resolved = resolvePatternImportDxfProductExactNSeamProductionMountV2(
    session,
    activeSeamIndex,
  );
  if (!resolved.ok)
    return sceneOverlayBlocked(
      `The current Exact-N production selection is unavailable: ${resolved.blockers[0].code}.`,
    );
  const activeSeam = resolved.model.state.seams[activeSeamIndex];
  const scene = buildPatternImportDxfPhaseECadMannequinProductionSceneOverlayV2({
    session,
    importGeneration: input.staging.importGeneration,
    staging: input.staging,
    selection: {
      ...(focus ?? {
        scopeKey: session.current.row.scopeKey,
        pieceId: activeSeam.sides[0]?.pieceId ?? null,
        pieceLineKey: activeSeam.sides[0]?.pieceLineKey ?? null,
      }),
      seamId: activeSeam.seamId,
    },
    stitchVisuals: input.stitchVisuals,
    bomItems: input.bomItems,
  });
  if (!scene.ok) return sceneOverlayBlocked(`${scene.blocker.code}: ${scene.blocker.detail}`);
  const bridge = bridgePatternImportDxfPhaseECadMannequinSceneOverlayToRendererV1(scene.overlay);
  if (!bridge.ok) return sceneOverlayBlocked(`${bridge.blocker.code}: ${bridge.blocker.detail}`);
  return Object.freeze({ status: 'available' as const, bridge: bridge.bridge, blocker: null });
}

export function resolvePatternImportDxfProductExactNSeamProductionMountV2(
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  activeSeamIndex: number,
): PatternImportDxfProductExactNSeamWorkbenchHostResultV2 {
  return resolvePatternImportDxfProductExactNSeamWorkbenchHostV2({
    selectionOwner: session.selectionOwner,
    current: session.current,
    activeSeamIndex,
  });
}

/**
 * Mounts the already verified Exact-N selection. The optional annotation readback supplies only
 * the saved presentation layer for its matching desktop geometry.
 */
export function PatternImportDxfProductExactNSeamProductionMountV2({
  session,
  activeSeamIndex,
  onActiveSeamIndexChange,
  mannequin,
  operationsPanel,
  desktopGeometry = null,
  objectSidebar,
  sceneOverlayInput = null,
  sceneOverlayBlocker = null,
  topologyAnnotationAuthoring = null,
  readSavedTopologyAnnotations,
  saveWrappedTopologyAnnotations,
}: PatternImportDxfProductExactNSeamProductionMountPropsV2): ReactNode {
  const resolved = resolvePatternImportDxfProductExactNSeamProductionMountV2(
    session,
    activeSeamIndex,
  );
  const exactDesktop =
    resolved.ok &&
    !topologyAnnotationAuthoring &&
    resolved.model.seamCount === 1 &&
    matchesPatternImportDxfProductExactNDesktopGeometryV2(desktopGeometry, session)
      ? desktopGeometry
      : null;
  const tableSessionOwner = useCadTableZeroCanvasOwner(exactDesktop?.projection ?? null);
  const annotationRead = usePatternImportDxfPhaseERestoredTopologyAnnotationsV1(
    session,
    exactDesktop,
    readSavedTopologyAnnotations,
  );
  const savedAnnotations = annotationRead.current;
  if (!resolved.ok) return null;
  const activeSeam = resolved.model.state.seams[activeSeamIndex];
  const activeSeamChoice = resolved.model.choices.seams[activeSeamIndex]!;
  const operation = resolved.model.state.bindings.selectedOperation;
  const seamOrdinal = cadWorkbenchOperationSeamOrdinal(operation.seamIds, activeSeam.seamId);
  const selectedPieceKeys = tableSessionOwner?.session.layout.selectedPieceKeys ?? [];
  const activePiece =
    selectedPieceKeys.length === 1
      ? tableSessionOwner?.session.layout.pieces.find(
          ({ identity }) => identity.key === selectedPieceKeys[0],
        )
      : null;
  const savedSideFocus = tableSessionOwner?.session.savedSeamSide;
  const savedBoundary = tableSessionOwner?.session.savedBoundary;
  const focusedBoundary =
    savedBoundary && activePiece?.identity.key === savedBoundary.pieceKey
      ? savedBoundary
      : undefined;
  const focusedSeamSide =
    savedSideFocus?.seamId === activeSeam.seamId &&
    activePiece?.identity.key === savedSideFocus.pieceKey
      ? savedSideFocus.sideIndex
      : null;
  const selection = Object.freeze({
    operationNumber: session.current.selectedOperation.sourceOperationNumber,
    scopeKey: session.current.row.scopeKey,
    pieceId: exactDesktop
      ? activePiece?.identity.pieceId ?? null
      : activeSeam.sides[0]?.pieceId ?? null,
    pieceLineKey: exactDesktop
      ? activePiece?.identity.pieceLineKey ?? null
      : activeSeam.sides[0]?.pieceLineKey ?? null,
    seamId: activeSeam.seamId,
    seamSideIndex: focusedSeamSide,
    ...(focusedBoundary && {
      boundaryEdge: {
        contourId: focusedBoundary.contourId,
        boundaryVertexIds: focusedBoundary.boundaryVertexIds,
      },
    }),
  });
  const sceneOverlay =
    !session.productionFeed && exactDesktop?.savedSceneAuthority
      ? buildPatternImportDxfPhaseECadMannequinSavedOneSeamSceneOverlayV1({
          session,
          prepared: exactDesktop.savedSceneAuthority,
          projection: exactDesktop.projection,
          focusedPieceId: selection.pieceId,
          focusedPieceLineKey: selection.pieceLineKey,
        })
      : resolvePatternImportDxfProductExactNSeamProductionSceneOverlayV2(
          session,
          activeSeamIndex,
          sceneOverlayInput,
          sceneOverlayBlocker,
          selection,
        );
  const previewScope = exactDesktop
    ? {
        row: session.current.row,
        sourceFileId: exactDesktop.projection.sourceFileId,
        sizeToken: exactDesktop.projection.sizeToken,
      }
    : null;
  const previewSeam = previewScope
    ? {
        operationNumber: operation.sourceOperationNumber,
        seamId: activeSeam.seamId,
        sides: activeSeamChoice.sides,
      }
    : undefined;
  const mannequinSlot: PatternImportDxfPhaseECadWorkbenchSlotV1 =
    typeof mannequin === 'function'
      ? (context) =>
          mannequin(Object.freeze({ ...context, sceneOverlay, previewScope, previewSeam }))
      : mannequin;

  const focusSelection = (nextSelection: PatternImportDxfPhaseECadWorkbenchSelectionV1 | null) => {
    if ((nextSelection?.pieceId || nextSelection?.pieceLineKey) && tableSessionOwner) {
      const pieces = tableSessionOwner.session.layout.pieces;
      const index = findCadWorkbenchScopedPieceIndexV1(
        nextSelection,
        session.current.row.scopeKey,
        pieces.map(({ identity }) => identity),
      );
      if (index < 0) return;
      const pieceKey = pieces[index]!.identity.key;
      const sideIndex = nextSelection.seamSideIndex;
      const edge = nextSelection.boundaryEdge;
      if (edge) {
        if (
          !exactDesktop ||
          edge.boundaryVertexIds.length !== 2 ||
          sideIndex != null ||
          nextSelection.operationNumber !== operation.sourceOperationNumber
        )
          return;
        const matches = derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1(
          exactDesktop.projection,
        ).filter(
          (segment) =>
            segment.contourRole === 'sewing-boundary' &&
            segment.pieceId === nextSelection.pieceId &&
            segment.pieceLineKey === nextSelection.pieceLineKey &&
            segment.contourId === edge.contourId &&
            segment.boundaryVertexIds.every(
              (id, ordinal) => id === edge.boundaryVertexIds[ordinal],
            ),
        );
        if (matches.length !== 1) return;
      }
      if (sideIndex != null) {
        const side = activeSeam.sides[sideIndex];
        if (
          !side ||
          nextSelection.seamId !== activeSeam.seamId ||
          nextSelection.operationNumber !== operation.sourceOperationNumber ||
          side.pieceId !== nextSelection.pieceId ||
          side.pieceLineKey !== nextSelection.pieceLineKey
        )
          return;
      }
      tableSessionOwner.update((current) => {
        const activated = activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1(
          current,
          pieceKey,
          false,
        );
        if (edge)
          return Object.freeze({
            ...activated,
            savedBoundary: { ...edge, pieceKey },
          });
        return sideIndex == null
          ? activated
          : Object.freeze({
              ...activated,
              savedSeamSide: { seamId: activeSeam.seamId, sideIndex, pieceKey },
            });
      });
    }
    if (!nextSelection?.seamId) return;
    const nextIndex = resolved.model.state.seams.findIndex(
      ({ seamId }) => seamId === nextSelection.seamId,
    );
    if (nextIndex >= 0) onActiveSeamIndexChange(nextIndex);
  };

  return (
    <PatternImportDxfPhaseECadWorkbenchSplitShellV1
      objectSidebar={
        objectSidebar ??
        (exactDesktop && tableSessionOwner ? (
          <CadTablePieceSelectionPanel
            owner={tableSessionOwner}
            projection={exactDesktop.projection}
            features={exactDesktop.pieceFeatures}
          />
        ) : null)
      }
      onContentKeyDown={(event) => {
        if (tableSessionOwner) handleCadTablePieceSelectionKey(event, tableSessionOwner);
      }}
      selection={selection}
      onSelectionFocus={({ selection: nextSelection }) => focusSelection(nextSelection)}
      desktop={
        exactDesktop && tableSessionOwner && seamOrdinal !== null ? (
          <PatternImportDxfPhaseECadTableZeroConnectCanvasV1
            catalog={exactDesktop.catalog}
            projection={exactDesktop.projection}
            pieceFeatures={exactDesktop.pieceFeatures}
            tableSessionOwner={tableSessionOwner}
            savedAnnotations={
              savedAnnotations?.status === 'ready' ? savedAnnotations.readback.draft : undefined
            }
            savedAnnotationBlocker={
              savedAnnotations?.status === 'blocked' ? savedAnnotations.detail : undefined
            }
            savedAnnotationEditControl={
              !session.productionFeed &&
              saveWrappedTopologyAnnotations &&
              savedAnnotations?.status === 'ready' ? (
                <PatternImportDxfPhaseESavedTopologyAnnotationEditControlV1
                  session={session}
                  geometry={exactDesktop}
                  saved={savedAnnotations.readback}
                  save={saveWrappedTopologyAnnotations}
                  onReadback={annotationRead.publish}
                  onReload={annotationRead.reload}
                />
              ) : null
            }
            savedSeam={{
              seamId: activeSeam.seamId,
              operationNumber: operation.sourceOperationNumber,
              ordinal: seamOrdinal,
              focusedSideIndex: focusedSeamSide,
              focusedBoundary,
              onFocusBoundary: (segment) =>
                focusSelection({
                  operationNumber: operation.sourceOperationNumber,
                  scopeKey: session.current.row.scopeKey,
                  pieceId: segment.pieceId,
                  pieceLineKey: segment.pieceLineKey,
                  boundaryEdge: {
                    contourId: segment.contourId,
                    boundaryVertexIds: segment.boundaryVertexIds,
                  },
                }),
              sides: activeSeamChoice.sides,
              onFocusSide: (sideIndex) => {
                const { pieceId, pieceLineKey } = activeSeamChoice.sides[sideIndex];
                focusSelection({
                  operationNumber: operation.sourceOperationNumber,
                  scopeKey: session.current.row.scopeKey,
                  pieceId,
                  pieceLineKey,
                  seamId: activeSeam.seamId,
                  seamSideIndex: sideIndex,
                });
              },
            }}
            disabled
          />
        ) : (
          <PatternImportDxfProductExactNSeamWorkbenchHostV2
            selectionOwner={session.selectionOwner}
            current={session.current}
            activeSeamIndex={activeSeamIndex}
            onActiveSeamIndexChange={onActiveSeamIndexChange}
            operationWindow={topologyAnnotationAuthoring}
          />
        )
      }
      mannequin={mannequinSlot}
      operationsPanel={operationsPanel}
    />
  );
}
