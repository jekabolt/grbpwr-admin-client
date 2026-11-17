import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
  type PatternImportDxfProductPhaseEMaterialRevisionOptionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  buildPatternImportDxfProductPhaseEMultiseamChoicesV2,
  type PatternImportDxfProductPhaseEMultiseamChoicesResultV2,
  type PatternImportDxfProductPhaseEMultiseamProposalV2,
  type PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
} from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import type { BoxMm } from 'lib/pattern-import/types';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  Button,
  CalloutBox,
  CheckboxCommon,
  Close,
  Input,
  Pill,
  RulerSquareIcon,
  Select,
  Text,
} from 'ui';

import {
  auditPatternImportDxfPhaseEAssemblyV1,
  navigatePatternImportDxfPhaseEAssemblyAuditV1,
  type PatternImportDxfPhaseEAssemblyAuditIssueV1,
} from './assembly-audit-v1';
import {
  buildPatternImportDxfPhaseEMeasurementV1,
  resolvePatternImportDxfPhaseEVertexV1,
  type PatternImportDxfPhaseEMeasurementKindV1,
  type PatternImportDxfPhaseEMeasurementV1,
  type PatternImportDxfPhaseEVertexAnchorV1,
} from './measurement-v1';
import {
  createPatternImportDxfPhaseECalloutV1,
  deletePatternImportDxfPhaseECalloutV1,
  updatePatternImportDxfPhaseECalloutTextV1,
  type PatternImportDxfPhaseECalloutV1,
} from './callout-session-v1';
import {
  formatPatternImportDxfPhaseEMeasurementValueV1,
  type PatternImportDxfPhaseEMeasurementUnitV1,
} from './measurement-units-v1';
import { PatternImportDxfPhaseECadWorkbenchToolButtonV1 } from './cad-workbench-tool-button-v1';
import { PatternImportDxfPhaseECadWorkbenchObjectSidebarV1 } from './cad-workbench-object-sidebar-v1';
import { usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1 } from './cad-workbench-split-shell-v1';
import {
  resolvePatternImportDxfPhaseECadWorkbenchColorwayContourPreviewV1,
  resolvePatternImportDxfPhaseECadWorkbenchColorwayPreviewV1,
  type PatternImportDxfPhaseECadWorkbenchColorwayOptionV1,
  type PatternImportDxfPhaseECadWorkbenchColorwayPreviewV1,
} from './cad-workbench-bom-visual-authority-v1';
import { PatternImportDxfPhaseECadTableConnectToolControlV1 } from './cad-table-connect-tool-control-v1';
import {
  derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1,
  type PatternImportDxfPhaseECadTableConnectEdgeSegmentV1,
} from './cad-table-connect-edge-segments-v1';
import { type PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1 } from './cad-table-zero-connect-authoring-handoff-v1';
import {
  cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1,
  createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
  patternImportDxfPhaseECadTableZeroConnectControllerPhaseV1,
  patternImportDxfPhaseECadTableZeroConnectControllerStatusV1,
  patternImportDxfPhaseECadTableZeroConnectSelectedSideV1,
  selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1,
  startPatternImportDxfPhaseECadTableZeroConnectControllerV1,
} from './cad-table-zero-connect-controller-v1';
import {
  compactPatternImportDxfPhaseECadTablePieceOffsetsV1,
  createPatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  fitPatternImportDxfPhaseECadTablePieceBoundsV1,
  patternImportDxfPhaseECadTablePieceKeyV1,
  reconcilePatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  selectPatternImportDxfPhaseECadTablePiecesInBoxV1,
  selectPatternImportDxfPhaseECadTablePiecesV1,
  translateSelectedPatternImportDxfPhaseECadTablePiecesV1,
  type PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
} from './cad-table-piece-layout-session-v1';
import {
  fitPatternImportDxfPhaseECadTableViewportAspectV1,
  panPatternImportDxfPhaseECadTableViewportV1,
  patternImportDxfPhaseECadTableZoomPercentV1,
  resolvePatternImportDxfPhaseECadTableHandleHitRadiusV1,
  resolvePatternImportDxfPhaseECadTableHandleRadiusV1,
  zoomPatternImportDxfPhaseECadTableViewportV1,
} from './cad-table-viewport-v1';
import { PatternImportDxfPhaseEDraftCadGridRulersV1 } from './draft-cad-grid-rulers-v1';

type WorkbenchState = PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2;
type SeamIndex = 0 | 1;
type SideIndex = 0 | 1;
type ProjectedPieceV1 = PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number];
type CatalogPieceV1 = PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number];

export type PatternImportDxfProductPhaseEMultiseamWorkbenchPropsV2 = Readonly<{
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  state: WorkbenchState;
  materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[];
  colorwayOptions?: readonly PatternImportDxfPhaseECadWorkbenchColorwayOptionV1[];
  activeSeamIndex: SeamIndex;
  activePieceIndex: SideIndex;
  onActiveSeamIndexChange: (index: SeamIndex) => void;
  onActivePieceIndexChange: (index: SideIndex) => void;
  onStateChange: (next: WorkbenchState) => void;
  onConfirm: (result: PatternImportDxfProductPhaseEMultiseamChoicesResultV2) => void;
  disabled?: boolean;
  workspaceContextControl?: ReactNode;
  /** Existing OperationsField owner. It returns a receipt; the canvas never writes RHF itself. */
  zeroConnectAuthoringHandoff?: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_MULTISEAM_WORKBENCH_UI_CONTRACT_V2 = Object.freeze({
  oneTwoDimensionalDesktop: true,
  existingAssemblyTopologyReadOnly: true,
  bothStoredSeamProposalsVisible: true,
  proposalHighlightIsAuthority: false,
  exactContourAndOrderedBoundaryVerticesRequired: true,
  nearestGeometryRecoveryAllowed: false,
  atomicTwoSeamConfirmOnly: true,
  exactPointLineEdgeMeasurements: true,
  exactSessionCallouts: true,
  calloutPersistenceIntegrated: false,
  geometryValidationAdvancedDisclosure: false,
  compactActionableIssueEntry: true,
  contextualValidationActionOnly: true,
  exactValidationSemanticsPreserved: true,
  fixedObjectBrowserWithIndependentScroll: true,
  sessionOnlyMultiPieceSelection: true,
  sessionOnlyPieceArrangement: true,
  compactInitialPieceArrangement: true,
  authoritativeGeometryUnchangedByArrangement: true,
  wheelZoomAndHandPan: true,
  viewBoxOwnsPanAndZoom: true,
  adaptiveMillimetreGridAndRulers: true,
  wholeViewportBoxSelection: true,
  directExactEdgeConnectTool: true,
  directConnectRequiresExistingSeamProposal: false,
  directConnectCreatesPersistenceOwner: false,
  measurementVariantsGrouped: true,
  proposalEvidenceOwnedByViewOptions: true,
  savedColorwaySelectionPreviewsExactCutContours: true,
  rawDxfExposed: false,
  arbitraryGarmentSupported: false,
  mountedInAssemblyOrder: true,
  productionReady: false,
} as const);

/** Each completed connection is one independent append; sequence only distinguishes its key. */
export { createPatternImportDxfPhaseECadTableZeroConnectOperationDraftV1 } from './cad-table-zero-connect-controller-v1';

function replaceSide(
  state: WorkbenchState,
  seamIndex: SeamIndex,
  sideIndex: SideIndex,
  side: WorkbenchState['seams'][number]['sides'][number],
): WorkbenchState {
  const currentSeam = state.seams[seamIndex];
  const nextSeam = {
    ...currentSeam,
    confirmed: false,
    sides:
      sideIndex === 0
        ? ([side, currentSeam.sides[1]] as const)
        : ([currentSeam.sides[0], side] as const),
  };
  return {
    ...state,
    seams:
      seamIndex === 0
        ? ([nextSeam, state.seams[1]] as const)
        : ([state.seams[0], nextSeam] as const),
  };
}

/** Exact UI selection only. Changing a contour burns the prior span and confirmations. */
export function selectPatternImportDxfProductPhaseEMultiseamCanvasContourV2(
  state: WorkbenchState,
  seamIndex: SeamIndex,
  sideIndex: SideIndex,
  contourId: string,
): WorkbenchState {
  const side = state.seams[seamIndex].sides[sideIndex];
  return replaceSide(state, seamIndex, sideIndex, {
    ...side,
    contourId,
    boundaryVertexIds: side.contourId === contourId ? side.boundaryVertexIds : [],
    confirmed: false,
  });
}

/**
 * Builds an ordered explicit span. Selecting an already-used vertex starts a fresh span at it;
 * this permits the exact closing edge `[lastVertex, vertex0]` without duplicate or epsilon IDs.
 */
export function selectPatternImportDxfProductPhaseEMultiseamCanvasVertexV2(
  state: WorkbenchState,
  seamIndex: SeamIndex,
  sideIndex: SideIndex,
  contourId: string,
  vertexId: string,
): WorkbenchState {
  const side = state.seams[seamIndex].sides[sideIndex];
  const boundaryVertexIds =
    side.contourId !== contourId ||
    side.boundaryVertexIds.includes(vertexId) ||
    side.boundaryVertexIds.length >= 2
      ? [vertexId]
      : [...side.boundaryVertexIds, vertexId];
  return replaceSide(state, seamIndex, sideIndex, {
    ...side,
    contourId,
    boundaryVertexIds,
    confirmed: false,
  });
}

export function derivePatternImportDxfProductPhaseEMultiseamWorkbenchResultV2(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
  state: WorkbenchState,
  materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[],
  crypto?: Pick<Crypto, 'subtle'>,
): Promise<PatternImportDxfProductPhaseEMultiseamChoicesResultV2> {
  return buildPatternImportDxfProductPhaseEMultiseamChoicesV2(
    catalog,
    proposal,
    state,
    materialOptions,
    crypto,
  );
}

export function createPatternImportDxfPhaseEMultiseamValidationGateV2() {
  let generation = 0;
  let inFlight = false;
  return Object.freeze({
    begin() {
      if (inFlight) return null;
      generation += 1;
      inFlight = true;
      const ownGeneration = generation;
      return Object.freeze({
        isCurrent: () => inFlight && generation === ownGeneration,
        end() {
          if (generation !== ownGeneration) return false;
          inFlight = false;
          return true;
        },
      });
    },
    reset() {
      generation += 1;
      inFlight = false;
    },
  });
}

/** Synchronously admits at most one async validation and publishes only its current result. */
export function launchPatternImportDxfPhaseEMultiseamValidationOnceV2<Result>(
  gate: ReturnType<typeof createPatternImportDxfPhaseEMultiseamValidationGateV2>,
  validate: () => Promise<Result>,
  publish: (result: Result) => void,
  settle: () => void,
): boolean {
  const ticket = gate.begin();
  if (!ticket) return false;
  let validation: Promise<Result>;
  try {
    validation = validate();
  } catch {
    ticket.end();
    settle();
    return false;
  }
  void validation
    .then((result) => {
      if (ticket.isCurrent()) publish(result);
    })
    .catch(() => {
      // Validation is fail-closed. The pure producer normally returns a blocker instead of throwing.
    })
    .finally(() => {
      const current = ticket.isCurrent();
      ticket.end();
      if (current) settle();
    });
  return true;
}

function projectionMatches(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
): boolean {
  return (
    projection?.schemaVersion === PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1 &&
    projection.expectedCatalogCanonicalSha256 === catalog.canonicalSha256 &&
    projection.sizeSelectionCanonicalSha256 === catalog.sizeSelectionCanonicalSha256 &&
    projection.sourceFileId === catalog.sourceFileId &&
    projection.sizeToken === catalog.sizeToken &&
    projection.geometryPlacementApplied === false &&
    projection.pieces.length === catalog.pieces.length &&
    projection.pieces.length >= 2 &&
    catalog.pieces.every(
      (piece) =>
        projection.pieces.filter(
          (projected) =>
            projected.pieceId === piece.pieceId && projected.pieceLineKey === piece.pieceLineKey,
        ).length === 1,
    )
  );
}

function synchronouslyReady(state: WorkbenchState): boolean {
  return (
    state.documentRevisionConfirmed &&
    state.physicalSurfaceConfirmed &&
    !!state.physicalSurface &&
    state.operationConfirmed &&
    Number.isSafeInteger(state.operationStage) &&
    state.seams.every(
      (seam) =>
        seam.confirmed &&
        seam.mapping === 'equal' &&
        seam.lengthRatio === 1 &&
        seam.sides.every(
          (side) =>
            side.confirmed &&
            !!side.contourId &&
            side.boundaryVertexIds.length === 2 &&
            !!side.direction,
        ),
    ) &&
    state.materialSelections.every((selection) => selection.confirmed && !!selection.optionId) &&
    state.tolerance.confirmed &&
    state.tolerance.endpointMm !== null &&
    state.tolerance.fullLengthMm !== null &&
    state.tolerance.fullLengthRelative !== null
  );
}

function measurementDisplayLabel(
  measurement: PatternImportDxfPhaseEMeasurementV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  unit: PatternImportDxfPhaseEMeasurementUnitV1,
): string {
  if (measurement.kind === 'point') {
    const vertex = measurement.anchors[0]
      ? resolvePatternImportDxfPhaseEVertexV1(projection, measurement.anchors[0])
      : null;
    if (!vertex) return measurement.label;
    const x = formatPatternImportDxfPhaseEMeasurementValueV1(vertex.pointMm.x, unit);
    const y = formatPatternImportDxfPhaseEMeasurementValueV1(vertex.pointMm.y, unit);
    return `x ${x.formatted} · y ${y.formatted}`;
  }
  return measurement.valueMm === null
    ? measurement.label
    : formatPatternImportDxfPhaseEMeasurementValueV1(measurement.valueMm, unit).formatted;
}

function ProjectedPiece({
  piece,
  catalogPiece,
  projection,
  proposal,
  state,
  activeSeamIndex,
  active,
  colorwayPreview,
  showProposals,
  showVertices,
  showSewingBoundaries,
  showCutBoundaries,
  showMeasurementLabels,
  showCalloutText,
  measurementUnit,
  measurementTool,
  calloutToolActive,
  measurementDraft,
  measurements,
  callouts,
  layoutKey,
  sourceBounds,
  displayOffset,
  unit,
  disabled,
  onSelect,
  onArrangePointerDown,
  onArrangePointerMove,
  onArrangePointerUp,
  onArrangePointerCancel,
  onSelectSeam,
  onMeasurementVertex,
  onStateChange,
}: {
  piece: ProjectedPieceV1;
  catalogPiece: CatalogPieceV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  state: WorkbenchState;
  activeSeamIndex: SeamIndex;
  active: boolean;
  colorwayPreview: PatternImportDxfPhaseECadWorkbenchColorwayPreviewV1 | null;
  showProposals: boolean;
  showVertices: boolean;
  showSewingBoundaries: boolean;
  showCutBoundaries: boolean;
  showMeasurementLabels: boolean;
  showCalloutText: boolean;
  measurementUnit: PatternImportDxfPhaseEMeasurementUnitV1;
  measurementTool: PatternImportDxfPhaseEMeasurementKindV1 | null;
  calloutToolActive: boolean;
  measurementDraft: readonly PatternImportDxfPhaseEVertexAnchorV1[];
  measurements: readonly PatternImportDxfPhaseEMeasurementV1[];
  callouts: readonly PatternImportDxfPhaseECalloutV1[];
  layoutKey: string;
  sourceBounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;
  displayOffset: Readonly<{ x: number; y: number }>;
  unit: number;
  disabled?: boolean;
  onSelect: (toggle?: boolean) => void;
  onArrangePointerDown?: (event: ReactPointerEvent<SVGGElement>) => void;
  onArrangePointerMove?: (event: ReactPointerEvent<SVGGElement>) => void;
  onArrangePointerUp?: (event: ReactPointerEvent<SVGGElement>) => void;
  onArrangePointerCancel?: (event: ReactPointerEvent<SVGGElement>) => void;
  onSelectSeam: (index: SeamIndex) => void;
  onMeasurementVertex: (anchor: PatternImportDxfPhaseEVertexAnchorV1) => void;
  onStateChange: (state: WorkbenchState) => void;
}) {
  const activeProposalSeam = proposal.seams[activeSeamIndex];
  const activeSideIndex = activeProposalSeam.sides.findIndex(
    ({ pieceId, pieceLineKey }) => pieceId === piece.pieceId && pieceLineKey === piece.pieceLineKey,
  );
  const editableSideIndex = activeSideIndex === 0 || activeSideIndex === 1 ? activeSideIndex : null;
  const activeSide =
    editableSideIndex === null ? null : state.seams[activeSeamIndex].sides[editableSideIndex];
  const expectedRole =
    state.physicalSurface?.mode === 'sewing-surface'
      ? 'sewing-boundary'
      : state.physicalSurface?.mode === 'cut-surface'
        ? 'cut-boundary'
        : null;
  const measurementEnabled = !disabled && measurementTool !== null;
  const calloutEnabled = !disabled && calloutToolActive;
  const topologyToolEnabled = measurementEnabled || calloutEnabled;

  return (
    <g
      role='group'
      aria-label={`Exact geometry for piece ${piece.pieceId}`}
      data-v2-piece-id={piece.pieceId}
      data-v2-piece-active={active}
      data-v2-piece-offset-x={displayOffset.x}
      data-v2-piece-offset-y={displayOffset.y}
      data-v2-piece-layout-key={layoutKey}
      data-v2-piece-seam-authority={editableSideIndex === null ? 'read-only' : 'bounded-pair'}
      data-v2-piece-colorway-swatch={colorwayPreview?.swatchHex ?? undefined}
      onClick={(event) => !disabled && onSelect(event.shiftKey)}
      onPointerDown={onArrangePointerDown}
      onPointerMove={onArrangePointerMove}
      onPointerUp={onArrangePointerUp}
      onPointerCancel={onArrangePointerCancel}
      className='cursor-pointer'
      transform={`translate(${displayOffset.x} ${displayOffset.y})`}
    >
      <title>{`Piece ${piece.pieceId}; bounded proposal layers appear only when this piece participates in the active operation.`}</title>
      <rect
        x={sourceBounds.minX}
        y={sourceBounds.minY}
        width={Math.max(sourceBounds.maxX - sourceBounds.minX, 1)}
        height={Math.max(sourceBounds.maxY - sourceBounds.minY, 1)}
        fill='transparent'
        stroke={active ? 'var(--color-textColor)' : 'transparent'}
        strokeDasharray='6 4'
        vectorEffect='non-scaling-stroke'
        pointerEvents='all'
        data-v2-piece-hit-area=''
      />
      {piece.contours.map((contour) => {
        if (contour.role === 'sewing-boundary' && !showSewingBoundaries) return null;
        if (contour.role === 'cut-boundary' && !showCutBoundaries) return null;
        const catalogContour = catalogPiece.contours.find(
          ({ contourId }) => contourId === contour.contourId,
        );
        if (
          !catalogContour ||
          contour.vertices.some(
            ({ pointMm }) => !Number.isFinite(pointMm.x) || !Number.isFinite(pointMm.y),
          )
        )
          return null;
        const coordinates = contour.vertices.map(({ pointMm }) => `${pointMm.x},${pointMm.y}`);
        const points =
          contour.closed && coordinates.length
            ? [...coordinates, coordinates[0]].join(' ')
            : coordinates.join(' ');
        const exactContour = activeSide?.contourId === contour.contourId;
        const exactEnabled =
          editableSideIndex !== null &&
          !topologyToolEnabled &&
          !disabled &&
          !!expectedRole &&
          contour.role === expectedRole;
        const selectContour = () => {
          if (!exactEnabled) return;
          onSelect();
          onStateChange(
            selectPatternImportDxfProductPhaseEMultiseamCanvasContourV2(
              state,
              activeSeamIndex,
              editableSideIndex!,
              contour.contourId,
            ),
          );
        };
        const proposalSides = proposal.seams.map((seam) => ({
          seam,
          side: seam.sides.find(({ pieceId }) => pieceId === piece.pieceId),
        }));
        const colorwayContourPreview =
          resolvePatternImportDxfPhaseECadWorkbenchColorwayContourPreviewV1(
            colorwayPreview,
            contour,
          );
        return (
          <g key={contour.contourId} data-v2-contour-id={contour.contourId}>
            <polyline
              points={points}
              fill={colorwayContourPreview.fill}
              fillOpacity={colorwayContourPreview.fillOpacity}
              stroke='currentColor'
              strokeWidth={exactContour ? 2 : 1}
              opacity={exactContour ? 1 : 0.4}
              vectorEffect='non-scaling-stroke'
            />
            <polyline
              points={points}
              fill='none'
              stroke='transparent'
              strokeWidth='12'
              vectorEffect='non-scaling-stroke'
              pointerEvents='stroke'
              role='button'
              tabIndex={exactEnabled ? 0 : -1}
              aria-disabled={!exactEnabled}
              aria-label={`Select exact contour ${contour.contourId} for seam ${activeProposalSeam.id}`}
              onClick={(event) => {
                event.stopPropagation();
                selectContour();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  selectContour();
                }
              }}
            />
            {showProposals
              ? proposalSides.map(({ seam, side }, seamIndex) => {
                  if (!side || contour.role === 'hole') return null;
                  const [from, to] = side.evidence.range;
                  const dash = `${Math.max(0.001, to - from)} ${Math.max(0.001, 1 - (to - from))}`;
                  return (
                    <g key={seam.id}>
                      <polyline
                        points={points}
                        pathLength='1'
                        fill='none'
                        stroke='transparent'
                        strokeWidth='12'
                        strokeDasharray={dash}
                        strokeDashoffset={-from}
                        vectorEffect='non-scaling-stroke'
                        pointerEvents='stroke'
                        role='button'
                        tabIndex={0}
                        aria-label={`Select seam ${seam.id}`}
                        data-v2-seam-select={seam.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectSeam(seamIndex as SeamIndex);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            onSelectSeam(seamIndex as SeamIndex);
                          }
                        }}
                      />
                      <polyline
                        points={points}
                        pathLength='1'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth={seamIndex === activeSeamIndex ? 2 : 1}
                        strokeDasharray={dash}
                        strokeDashoffset={-from}
                        opacity={seamIndex === activeSeamIndex ? 0.82 : 0.22}
                        vectorEffect='non-scaling-stroke'
                        pointerEvents='none'
                        data-v2-proposal-highlight={seam.id}
                        data-authority='evidence-only'
                      />
                    </g>
                  );
                })
              : null}
            {exactContour || topologyToolEnabled || showVertices
              ? contour.vertices.map(({ vertexId, pointMm }) => {
                  const anchor = {
                    pieceId: piece.pieceId,
                    pieceLineKey: piece.pieceLineKey,
                    contourId: contour.contourId,
                    vertexId,
                  } satisfies PatternImportDxfPhaseEVertexAnchorV1;
                  const selected = topologyToolEnabled
                    ? measurementDraft.some(
                        (candidate) =>
                          candidate.pieceId === anchor.pieceId &&
                          candidate.contourId === anchor.contourId &&
                          candidate.vertexId === anchor.vertexId,
                      )
                    : activeSide?.boundaryVertexIds.includes(vertexId) ?? false;
                  const selectVertex = () => {
                    if (topologyToolEnabled) {
                      onSelect();
                      onMeasurementVertex(anchor);
                      return;
                    }
                    if (!exactEnabled) return;
                    onSelect();
                    onStateChange(
                      selectPatternImportDxfProductPhaseEMultiseamCanvasVertexV2(
                        state,
                        activeSeamIndex,
                        editableSideIndex!,
                        contour.contourId,
                        vertexId,
                      ),
                    );
                  };
                  return (
                    <g key={vertexId}>
                      <circle
                        cx={pointMm.x}
                        cy={pointMm.y}
                        r={resolvePatternImportDxfPhaseECadTableHandleRadiusV1(unit)}
                        fill='var(--color-bgColor)'
                        stroke={selected ? 'var(--color-textColor)' : 'currentColor'}
                        strokeWidth={selected ? 2 : 1}
                        vectorEffect='non-scaling-stroke'
                        pointerEvents='none'
                        data-v2-exact-vertex-visual={vertexId}
                      />
                      <circle
                        cx={pointMm.x}
                        cy={pointMm.y}
                        r={resolvePatternImportDxfPhaseECadTableHandleHitRadiusV1(unit)}
                        fill='transparent'
                        stroke='transparent'
                        pointerEvents='all'
                        role='button'
                        tabIndex={exactEnabled || topologyToolEnabled ? 0 : -1}
                        aria-disabled={!exactEnabled && !topologyToolEnabled}
                        aria-label={
                          calloutEnabled
                            ? `Place callout at exact vertex ${vertexId}`
                            : measurementEnabled
                              ? `Measure from exact vertex ${vertexId}`
                              : `Append exact vertex ${vertexId} to seam ${activeProposalSeam.id}`
                        }
                        data-v2-exact-vertex-id={vertexId}
                        data-v2-exact-vertex-selected={selected}
                        data-v2-exact-vertex-hit-radius-px='10'
                        onClick={(event) => {
                          event.stopPropagation();
                          selectVertex();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            selectVertex();
                          }
                        }}
                      />
                    </g>
                  );
                })
              : null}
          </g>
        );
      })}
      {measurements.map((measurement) => {
        if (measurement.anchors[0]?.pieceId !== piece.pieceId) return null;
        const vertices = measurement.anchors.map((anchor) =>
          resolvePatternImportDxfPhaseEVertexV1(projection, anchor),
        );
        if (vertices.some((vertex) => vertex === null)) return null;
        const first = vertices[0]!;
        const second = vertices[1] ?? null;
        const labelX = second ? (first.pointMm.x + second.pointMm.x) / 2 : first.pointMm.x;
        const labelY = second ? (first.pointMm.y + second.pointMm.y) / 2 : first.pointMm.y;
        const displayLabel = showMeasurementLabels
          ? measurementDisplayLabel(measurement, projection, measurementUnit)
          : null;
        return (
          <g key={measurement.id} data-v2-measurement={measurement.kind} pointerEvents='none'>
            {second ? (
              <line
                x1={first.pointMm.x}
                y1={first.pointMm.y}
                x2={second.pointMm.x}
                y2={second.pointMm.y}
                stroke='var(--color-error)'
                strokeWidth='2'
                vectorEffect='non-scaling-stroke'
              />
            ) : (
              <circle cx={first.pointMm.x} cy={first.pointMm.y} r='3%' fill='var(--color-error)' />
            )}
            {displayLabel ? (
              <text
                x={labelX}
                y={labelY - 5}
                textAnchor='middle'
                fill='var(--color-error)'
                fontSize='10'
                fontWeight='700'
                paintOrder='stroke'
                stroke='var(--color-bgColor)'
                strokeWidth='3'
              >
                {displayLabel}
              </text>
            ) : null}
          </g>
        );
      })}
      {callouts.map((callout, index) => {
        if (callout.anchor.pieceId !== piece.pieceId) return null;
        const vertex = resolvePatternImportDxfPhaseEVertexV1(projection, callout.anchor);
        if (!vertex) return null;
        const labelX = vertex.pointMm.x + 36;
        const labelY = vertex.pointMm.y - 28;
        return (
          <g key={callout.id} data-v2-callout={callout.id} pointerEvents='none'>
            <line
              x1={vertex.pointMm.x}
              y1={vertex.pointMm.y}
              x2={labelX}
              y2={labelY}
              stroke='currentColor'
              strokeWidth='1.5'
              vectorEffect='non-scaling-stroke'
            />
            <circle cx={vertex.pointMm.x} cy={vertex.pointMm.y} r='3%' fill='currentColor' />
            <circle cx={labelX} cy={labelY} r='12' fill='var(--color-textColor)' />
            <text
              x={labelX}
              y={labelY + 3}
              textAnchor='middle'
              fill='var(--color-bgColor)'
              fontSize='9'
              fontWeight='700'
            >
              {index + 1}
            </text>
            {showCalloutText ? (
              <text x={labelX + 16} y={labelY + 3} fill='currentColor' fontSize='9'>
                {callout.text.length > 24 ? `${callout.text.slice(0, 24)}…` : callout.text}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function ExactSpanInspector({
  seamIndex,
  sideIndex,
  catalog,
  proposal,
  state,
  disabled,
  onChange,
}: {
  seamIndex: SeamIndex;
  sideIndex: SideIndex;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  state: WorkbenchState;
  disabled?: boolean;
  onChange: (state: WorkbenchState) => void;
}) {
  const proposed = proposal.seams[seamIndex].sides[sideIndex];
  const side = state.seams[seamIndex].sides[sideIndex];
  const piece = catalog.pieces.find(({ pieceId }) => pieceId === proposed.pieceId);
  const expectedRole =
    state.physicalSurface?.mode === 'sewing-surface'
      ? 'sewing-boundary'
      : state.physicalSurface?.mode === 'cut-surface'
        ? 'cut-boundary'
        : null;
  const contours = piece?.contours.filter(({ role }) => role === expectedRole) ?? [];
  return (
    <div
      className='flex min-w-0 flex-wrap items-center gap-2 text-micro'
      data-v2-contextual-edge-action=''
      data-v2-side={proposed.sourceSide}
    >
      <span className='font-bold'>
        {proposed.sourceSide} · {proposed.pieceLineKey}
      </span>
      <label className='flex items-center gap-1'>
        <span className='sr-only'>Exact contour</span>
        <Select
          name={`phase-e-v2-exact-contour-${seamIndex}-${sideIndex}`}
          aria-label='Exact contour'
          placeholder='Select exact contour'
          size='sm'
          className='min-w-40'
          value={side.contourId ?? ''}
          disabled={disabled || !expectedRole}
          items={[
            { value: '', label: 'Select exact contour' },
            ...contours.map(({ contourId }) => ({ value: contourId, label: contourId })),
          ]}
          onValueChange={(value) =>
            onChange(
              selectPatternImportDxfProductPhaseEMultiseamCanvasContourV2(
                state,
                seamIndex,
                sideIndex,
                value,
              ),
            )
          }
        />
      </label>
      <span className='text-labelColor' data-v2-span-ids=''>
        {side.boundaryVertexIds.join(' → ') || 'Select edge'}
      </span>
      <label className='flex items-center gap-2'>
        <CheckboxCommon
          name={`phase-e-v2-side-${seamIndex}-${sideIndex}`}
          checked={side.confirmed}
          disabled={disabled || !side.contourId || side.boundaryVertexIds.length !== 2}
          onChange={(confirmed) =>
            onChange(
              replaceSide(state, seamIndex, sideIndex, {
                ...side,
                confirmed,
              }),
            )
          }
        />
        Confirm {proposed.requiredDirection}
      </label>
    </div>
  );
}

function parseNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ContextualValidationControl({
  issue,
  catalog,
  proposal,
  state,
  materialOptions,
  disabled,
  onStateChange,
}: Readonly<{
  issue: PatternImportDxfPhaseEAssemblyAuditIssueV1 | null;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  state: WorkbenchState;
  materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[];
  disabled?: boolean;
  onStateChange: (next: WorkbenchState) => void;
}>) {
  if (!state.documentRevisionConfirmed)
    return (
      <label className='flex items-center gap-2 text-micro' data-v2-contextual-document-action=''>
        <CheckboxCommon
          name='phase-e-v2-document'
          checked={state.documentRevisionConfirmed}
          disabled={disabled}
          onChange={(documentRevisionConfirmed) =>
            onStateChange({ ...state, documentRevisionConfirmed })
          }
        />
        Use document {state.documentId} · {state.revision}
      </label>
    );

  if (!issue) return null;

  const seamIndex = proposal.seams.findIndex(({ id }) => id === issue.anchor.seamId);
  const exactSeamIndex = seamIndex === 0 || seamIndex === 1 ? (seamIndex as SeamIndex) : null;
  const sideIndex = issue.anchor.sideIndex;

  if (
    (issue.code === 'missing-side-assignment' || issue.code === 'stale-topology-anchor') &&
    exactSeamIndex !== null &&
    (sideIndex === 0 || sideIndex === 1)
  )
    return (
      <ExactSpanInspector
        seamIndex={exactSeamIndex}
        sideIndex={sideIndex}
        catalog={catalog}
        proposal={proposal}
        state={state}
        disabled={disabled}
        onChange={onStateChange}
      />
    );

  if (issue.code === 'unfinished-seam-recipe' && exactSeamIndex !== null) {
    const seam = state.seams[exactSeamIndex];
    return (
      <label className='flex items-center gap-2 text-micro' data-v2-contextual-seam-action=''>
        <CheckboxCommon
          name={`phase-e-v2-seam-${exactSeamIndex}`}
          checked={seam.confirmed}
          disabled={disabled || seam.sides.some(({ confirmed }) => !confirmed)}
          onChange={(confirmed) => {
            const next = {
              ...seam,
              mapping: confirmed ? ('equal' as const) : null,
              lengthRatio: confirmed ? (1 as const) : null,
              confirmed,
            };
            onStateChange({
              ...state,
              seams:
                exactSeamIndex === 0
                  ? ([next, state.seams[1]] as const)
                  : ([state.seams[0], next] as const),
            });
          }}
        />
        Confirm equal mapping · ratio 1
      </label>
    );
  }

  if (issue.code === 'unfinished-operation')
    return (
      <div
        className='flex flex-wrap items-center gap-2 text-micro'
        data-v2-contextual-stage-action=''
      >
        <label className='flex items-center gap-1'>
          <span>Stage</span>
          <Input
            aria-label='Local operation stage'
            type='number'
            min='0'
            step='1'
            className='h-7 w-16'
            value={state.operationStage ?? ''}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onStateChange({
                ...state,
                operationStage: parseNumber(event.target.value),
                operationConfirmed: false,
              })
            }
          />
        </label>
        <label className='flex items-center gap-2'>
          <CheckboxCommon
            name='phase-e-v2-operation-confirmed'
            checked={state.operationConfirmed}
            disabled={disabled || state.operationStage === null}
            onChange={(operationConfirmed) => onStateChange({ ...state, operationConfirmed })}
          />
          Confirm
        </label>
      </div>
    );

  if (issue.code === 'unfinished-surface-recipe')
    return (
      <div
        className='flex flex-wrap items-center gap-2 text-micro'
        data-v2-contextual-surface-action=''
      >
        <Select
          name='phase-e-v2-physical-surface'
          aria-label='Physical surface'
          placeholder='Surface'
          size='sm'
          value={state.physicalSurface?.mode ?? ''}
          disabled={disabled}
          items={[
            { value: '', label: 'Surface' },
            { value: 'sewing-surface', label: 'Sewing' },
            { value: 'cut-surface', label: 'Cut' },
          ]}
          onValueChange={(value) =>
            onStateChange({
              ...state,
              physicalSurface:
                value === 'sewing-surface'
                  ? { mode: 'sewing-surface', seamAllowancePhysical: false }
                  : value === 'cut-surface'
                    ? { mode: 'cut-surface', seamAllowancePhysical: true }
                    : null,
              physicalSurfaceConfirmed: false,
            })
          }
        />
        <label className='flex items-center gap-2'>
          <CheckboxCommon
            name='phase-e-v2-surface-confirmed'
            checked={state.physicalSurfaceConfirmed}
            disabled={disabled || !state.physicalSurface}
            onChange={(physicalSurfaceConfirmed) =>
              onStateChange({ ...state, physicalSurfaceConfirmed })
            }
          />
          Confirm
        </label>
      </div>
    );

  if (issue.code === 'missing-material-assignment') {
    const selectionIndex = state.materialSelections.findIndex(
      ({ pieceId }) => pieceId === issue.anchor.pieceId,
    );
    const selection = state.materialSelections[selectionIndex];
    if (!selection || (selectionIndex !== 0 && selectionIndex !== 1)) return null;
    return (
      <div
        className='flex flex-wrap items-center gap-2 text-micro'
        data-v2-contextual-material-action=''
      >
        <Select
          name={`phase-e-v2-material-${selectionIndex}-revision`}
          aria-label={`${selection.pieceId} material`}
          placeholder='Material revision'
          size='sm'
          className='min-w-40'
          value={selection.optionId ?? ''}
          disabled={disabled}
          items={[
            { value: '', label: 'Material revision' },
            ...materialOptions.map((option) => ({
              value: option.id,
              label: `${option.label} · ${option.materialRevision}`,
            })),
          ]}
          onValueChange={(value) => {
            const next = { ...selection, optionId: value || null, confirmed: false };
            onStateChange({
              ...state,
              materialSelections:
                selectionIndex === 0
                  ? ([next, state.materialSelections[1]] as const)
                  : ([state.materialSelections[0], next] as const),
            });
          }}
        />
        <label className='flex items-center gap-2'>
          <CheckboxCommon
            name={`phase-e-v2-material-${selectionIndex}`}
            checked={selection.confirmed}
            disabled={disabled || !selection.optionId}
            onChange={(confirmed) => {
              const next = { ...selection, confirmed };
              onStateChange({
                ...state,
                materialSelections:
                  selectionIndex === 0
                    ? ([next, state.materialSelections[1]] as const)
                    : ([state.materialSelections[0], next] as const),
              });
            }}
          />
          Confirm
        </label>
      </div>
    );
  }

  if (issue.code === 'unfinished-tolerance-recipe')
    return (
      <div
        className='flex flex-wrap items-center gap-2 text-micro'
        data-v2-contextual-tolerance-action=''
      >
        {(
          [
            ['endpointMm', 'End mm', 0.01],
            ['fullLengthMm', 'Length mm', 0.01],
            ['fullLengthRelative', 'Relative', 0.001],
          ] as const
        ).map(([key, label, step]) => (
          <label key={key} className='flex items-center gap-1'>
            <span>{label}</span>
            <Input
              aria-label={label}
              type='number'
              min='0'
              step={step}
              className='h-7 w-20'
              value={state.tolerance[key] ?? ''}
              disabled={disabled}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onStateChange({
                  ...state,
                  tolerance: {
                    ...state.tolerance,
                    [key]: parseNumber(event.target.value),
                    confirmed: false,
                  },
                })
              }
            />
          </label>
        ))}
        <label className='flex items-center gap-2'>
          <CheckboxCommon
            name='phase-e-v2-tolerance-confirmed'
            checked={state.tolerance.confirmed}
            disabled={disabled}
            onChange={(confirmed) =>
              onStateChange({ ...state, tolerance: { ...state.tolerance, confirmed } })
            }
          />
          Confirm
        </label>
      </div>
    );

  return (
    <Text component='p' size='micro' variant='label'>
      Reopen the table from the current saved Assembly Order before editing this item.
    </Text>
  );
}

export function PatternImportDxfProductPhaseEMultiseamWorkbenchV2({
  catalog,
  projection,
  proposal,
  state,
  materialOptions,
  colorwayOptions = [],
  activeSeamIndex,
  activePieceIndex,
  onActiveSeamIndexChange,
  onActivePieceIndexChange,
  onStateChange,
  onConfirm,
  disabled,
  workspaceContextControl,
  zeroConnectAuthoringHandoff,
}: PatternImportDxfProductPhaseEMultiseamWorkbenchPropsV2) {
  const initialActivePiece = proposal.seams[activeSeamIndex]?.sides[activePieceIndex];
  const initialActivePieceKey = initialActivePiece
    ? patternImportDxfPhaseECadTablePieceKeyV1(
        initialActivePiece.pieceId,
        initialActivePiece.pieceLineKey,
      )
    : null;
  const [lastResult, setLastResult] =
    useState<PatternImportDxfProductPhaseEMultiseamChoicesResultV2 | null>(null);
  const [validationInFlight, setValidationInFlight] = useState(false);
  const [pieceLayoutSession, setPieceLayoutSession] =
    useState<PatternImportDxfPhaseECadTablePieceLayoutSessionV1>(() =>
      compactPatternImportDxfPhaseECadTablePieceOffsetsV1(
        createPatternImportDxfPhaseECadTablePieceLayoutSessionV1(
          projection.pieces,
          initialActivePieceKey ? [initialActivePieceKey] : [],
        ),
      ),
    );
  const [canvasViewBounds, setCanvasViewBounds] = useState(() =>
    fitPatternImportDxfPhaseECadTablePieceBoundsV1(pieceLayoutSession, 20),
  );
  const [canvasViewportSize, setCanvasViewportSize] = useState<
    Readonly<{ width: number; height: number }>
  >(Object.freeze({ width: 1440, height: 800 }));
  const [canvasSelectionBox, setCanvasSelectionBox] = useState<Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> | null>(null);
  const measurementUnit =
    usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1()?.unit ??
    ('mm' satisfies PatternImportDxfPhaseEMeasurementUnitV1);
  const [panToolActive, setPanToolActive] = useState(false);
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [showProposals, setShowProposals] = useState(true);
  const [showVertices, setShowVertices] = useState(false);
  const [showSewingBoundaries, setShowSewingBoundaries] = useState(true);
  const [showCutBoundaries, setShowCutBoundaries] = useState(true);
  const [showMeasurementLabels, setShowMeasurementLabels] = useState(true);
  const [showCalloutText, setShowCalloutText] = useState(true);
  const [measurementTool, setMeasurementTool] =
    useState<PatternImportDxfPhaseEMeasurementKindV1 | null>(null);
  const [measureMenuOpen, setMeasureMenuOpen] = useState(false);
  const measureToolId = useId();
  const measureMenuSummaryRef = useRef<HTMLElement | null>(null);
  const measureFlyoutRef = useRef<HTMLDivElement | null>(null);
  const keyboardOpenedMeasureRef = useRef(false);
  const [calloutToolActive, setCalloutToolActive] = useState(false);
  const [measurementDraft, setMeasurementDraft] = useState<
    readonly PatternImportDxfPhaseEVertexAnchorV1[]
  >([]);
  const [measurements, setMeasurements] = useState<readonly PatternImportDxfPhaseEMeasurementV1[]>(
    [],
  );
  const [measurementError, setMeasurementError] = useState<string | null>(null);
  const [callouts, setCallouts] = useState<readonly PatternImportDxfPhaseECalloutV1[]>([]);
  const [calloutError, setCalloutError] = useState<string | null>(null);
  const [zeroConnectController, setZeroConnectController] = useState(() =>
    createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1(),
  );
  const [activeColorwayId, setActiveColorwayId] = useState<number | null>(
    colorwayOptions[0]?.id ?? null,
  );
  const activeColorwayPreview = resolvePatternImportDxfPhaseECadWorkbenchColorwayPreviewV1(
    colorwayOptions,
    activeColorwayId,
  );
  const measurementSequenceRef = useRef(0);
  const calloutSequenceRef = useRef(0);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const canvasSvgRef = useRef<SVGSVGElement | null>(null);
  const validationActionRef = useRef<HTMLDivElement | null>(null);
  const canvasDisplayBoundsRef = useRef<BoxMm>({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  const canvasFitBoundsRef = useRef<BoxMm>({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  const panGestureRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    originBounds: BoxMm;
  } | null>(null);

  useEffect(() => {
    if (!measureMenuOpen || !keyboardOpenedMeasureRef.current) return;
    keyboardOpenedMeasureRef.current = false;
    measureFlyoutRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [measureMenuOpen]);

  const closeMeasureFlyoutFromKeyboard = () => {
    keyboardOpenedMeasureRef.current = false;
    measureMenuSummaryRef.current?.focus();
    setMeasureMenuOpen(false);
  };
  const pieceArrangeGestureRef = useRef<{
    pieceKey: string;
    pointerId: number;
    startMm: Readonly<{ x: number; y: number }>;
    origin: PatternImportDxfPhaseECadTablePieceLayoutSessionV1;
    moved: boolean;
  } | null>(null);
  const suppressPieceSelectClickRef = useRef<string | null>(null);
  const selectionGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    shiftKey: boolean;
  } | null>(null);
  const validationGateRef = useRef<ReturnType<
    typeof createPatternImportDxfPhaseEMultiseamValidationGateV2
  > | null>(null);
  if (!validationGateRef.current)
    validationGateRef.current = createPatternImportDxfPhaseEMultiseamValidationGateV2();
  const validationGate = validationGateRef.current;
  useEffect(() => {
    validationGate.reset();
    setValidationInFlight(false);
    setLastResult(null);
  }, [catalog, materialOptions, proposal, state, validationGate]);
  useEffect(() => {
    setMeasurementTool(null);
    setCalloutToolActive(false);
    setPanToolActive(false);
    setActiveIssueId(null);
    setMeasurementDraft([]);
    setMeasurements([]);
    setMeasurementError(null);
    setCallouts([]);
    setCalloutError(null);
    setZeroConnectController(createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1());
    setPieceLayoutSession((current) => {
      const reconciled = reconcilePatternImportDxfPhaseECadTablePieceLayoutSessionV1(
        current,
        projection.pieces,
      );
      setCanvasViewBounds(fitPatternImportDxfPhaseECadTablePieceBoundsV1(reconciled, 20));
      return reconciled;
    });
    setCanvasSelectionBox(null);
    measurementSequenceRef.current = 0;
    calloutSequenceRef.current = 0;
  }, [projection]);
  useEffect(() => {
    setActiveColorwayId((current) =>
      colorwayOptions.some(({ id }) => id === current) ? current : colorwayOptions[0]?.id ?? null,
    );
  }, [colorwayOptions]);
  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const updateViewportSize = () => {
      const { width, height } = viewport.getBoundingClientRect();
      if (width > 0 && height > 0)
        setCanvasViewportSize((current) =>
          Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
            ? current
            : Object.freeze({ width, height }),
        );
    };
    updateViewportSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const zoomWithWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      setCanvasViewBounds(
        zoomPatternImportDxfPhaseECadTableViewportV1(
          canvasDisplayBoundsRef.current,
          canvasFitBoundsRef.current,
          { x: event.clientX, y: event.clientY },
          rect,
          event.deltaY > 0 ? 1.12 : 1 / 1.12,
        ),
      );
    };
    viewport.addEventListener('wheel', zoomWithWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', zoomWithWheel);
  }, []);
  const projectionReady = projectionMatches(catalog, projection);
  const ready = projectionReady && synchronouslyReady(state);
  const auditReport = auditPatternImportDxfPhaseEAssemblyV1({ projection, proposal, state });
  const geometryValidationCheckCount = ready
    ? 0
    : Math.max(
        1,
        auditReport.issues.length +
          (projectionReady ? 0 : 1) +
          (state.documentRevisionConfirmed ? 0 : 1) +
          (lastResult && !lastResult.ok ? lastResult.blockers.length : 0),
      );
  const activeAuditIssue =
    auditReport.issues.find(({ id }) => id === activeIssueId) ?? auditReport.issues[0] ?? null;
  const zeroConnectAuthority = { catalog, projection } as const;
  const zeroConnectSegments = derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1(
    projection,
  ).filter(({ contourRole }) => contourRole !== 'hole');
  const cancelZeroConnect = () => {
    setZeroConnectController((current) =>
      cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1(current),
    );
  };
  const startZeroConnect = () => {
    setMeasurementTool(null);
    setCalloutToolActive(false);
    setPanToolActive(false);
    setMeasurementDraft([]);
    setZeroConnectController((current) =>
      startPatternImportDxfPhaseECadTableZeroConnectControllerV1(current, zeroConnectAuthority),
    );
  };
  const selectZeroConnectEdge = (
    segment: PatternImportDxfPhaseECadTableConnectEdgeSegmentV1,
    direction: 'forward' | 'reverse',
  ) => {
    // The controller performs the existing OperationsField handoff when the second edge completes.
    // Compute it at the event boundary, never inside a functional state updater: React Strict Mode
    // may invoke updater functions more than once to detect impurities, which would append twice.
    setZeroConnectController(
      selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
        zeroConnectController,
        zeroConnectAuthority,
        segment,
        direction,
        zeroConnectAuthoringHandoff,
      ),
    );
  };
  const selectMeasurementTool = (tool: PatternImportDxfPhaseEMeasurementKindV1 | null) => {
    cancelZeroConnect();
    setMeasurementTool(tool);
    setCalloutToolActive(false);
    setPanToolActive(false);
    setMeasurementDraft([]);
    setMeasurementError(null);
  };
  const selectMeasurementVertex = (anchor: PatternImportDxfPhaseEVertexAnchorV1) => {
    if (calloutToolActive) {
      calloutSequenceRef.current += 1;
      const result = createPatternImportDxfPhaseECalloutV1(projection, callouts, {
        id: `callout-${calloutSequenceRef.current}`,
        anchor,
        text: `Callout ${calloutSequenceRef.current}`,
      });
      if (!result.ok) {
        setCalloutError(result.blockers[0].detail);
        return;
      }
      setCallouts(result.callouts);
      setCalloutError(null);
      return;
    }
    if (!measurementTool) return;
    const required = measurementTool === 'point' ? 1 : 2;
    const anchors = required === 1 ? [anchor] : [...measurementDraft, anchor].slice(-2);
    if (anchors.length < required) {
      setMeasurementDraft(anchors);
      setMeasurementError(null);
      return;
    }
    measurementSequenceRef.current += 1;
    const result = buildPatternImportDxfPhaseEMeasurementV1(
      projection,
      `measurement-${measurementSequenceRef.current}`,
      measurementTool,
      anchors,
    );
    if (!result.ok) {
      setMeasurementDraft([anchor]);
      setMeasurementError(result.detail);
      return;
    }
    setMeasurements((current) => [...current, result.measurement]);
    setMeasurementDraft([]);
    setMeasurementError(null);
  };
  const selectCalloutTool = () => {
    cancelZeroConnect();
    setMeasurementTool(null);
    setCalloutToolActive(true);
    setPanToolActive(false);
    setMeasurementDraft([]);
    setMeasurementError(null);
    setCalloutError(null);
  };
  const selectPanTool = () => {
    cancelZeroConnect();
    setMeasurementTool(null);
    setCalloutToolActive(false);
    setPanToolActive(true);
    setMeasurementDraft([]);
    setMeasurementError(null);
    setCalloutError(null);
  };
  const navigateAudit = (direction: 'previous' | 'next') => {
    const navigation = navigatePatternImportDxfPhaseEAssemblyAuditV1(
      auditReport.issues,
      activeAuditIssue?.id ?? null,
      direction,
    );
    if (!navigation) return;
    setActiveIssueId(navigation.issue.id);
    const seamIndex = proposal.seams.findIndex(({ id }) => id === navigation.issue.anchor.seamId);
    if (seamIndex === 0 || seamIndex === 1) onActiveSeamIndexChange(seamIndex);
    const targetSeamIndex = seamIndex === 0 || seamIndex === 1 ? seamIndex : activeSeamIndex;
    const pieceIndex = proposal.seams[targetSeamIndex].sides.findIndex(
      ({ pieceId }) => pieceId === navigation.issue.anchor.pieceId,
    );
    if (pieceIndex === 0 || pieceIndex === 1) onActivePieceIndexChange(pieceIndex);
    const targetLayout = pieceLayoutSession.pieces.find(
      ({ identity }) => identity.pieceId === navigation.issue.anchor.pieceId,
    );
    if (targetLayout)
      setPieceLayoutSession((current) =>
        selectPatternImportDxfPhaseECadTablePiecesV1(
          current,
          [targetLayout.identity.key],
          'replace',
        ),
      );
  };
  const focusNextIssue = () => {
    navigateAudit('next');
    requestAnimationFrame(() => validationActionRef.current?.focus({ preventScroll: true }));
  };
  const canvasSelectActive =
    measurementTool === null &&
    !calloutToolActive &&
    !panToolActive &&
    !zeroConnectController.session;
  const selectCanvasPiece = (pieceKey: string, toggle = false) => {
    setPieceLayoutSession((current) =>
      selectPatternImportDxfPhaseECadTablePiecesV1(
        current,
        [pieceKey],
        toggle ? 'toggle' : 'replace',
      ),
    );
    const identity = pieceLayoutSession.pieces.find(
      ({ identity }) => identity.key === pieceKey,
    )?.identity;
    const sideIndex = identity
      ? proposal.seams[activeSeamIndex].sides.findIndex(
          (side) =>
            side.pieceId === identity.pieceId && side.pieceLineKey === identity.pieceLineKey,
        )
      : -1;
    if (sideIndex === 0 || sideIndex === 1) onActivePieceIndexChange(sideIndex);
  };
  const canvasPoint = (event: Readonly<{ clientX: number; clientY: number }>) => {
    const svg = canvasSvgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  };
  const beginPieceArrange = (pieceKey: string, event: ReactPointerEvent<SVGGElement>) => {
    if (!canvasSelectActive) return;
    const startMm = canvasPoint(event);
    if (!startMm) return;
    event.stopPropagation();
    const alreadySelected = pieceLayoutSession.selectedPieceKeys.includes(pieceKey);
    const next = selectPatternImportDxfPhaseECadTablePiecesV1(
      pieceLayoutSession,
      [pieceKey],
      event.shiftKey ? 'toggle' : alreadySelected ? 'add' : 'replace',
    );
    setPieceLayoutSession(next);
    const identity = next.pieces.find(({ identity }) => identity.key === pieceKey)?.identity;
    const sideIndex = identity
      ? proposal.seams[activeSeamIndex].sides.findIndex(
          (side) =>
            side.pieceId === identity.pieceId && side.pieceLineKey === identity.pieceLineKey,
        )
      : -1;
    if (sideIndex === 0 || sideIndex === 1) onActivePieceIndexChange(sideIndex);
    if (!next.selectedPieceKeys.includes(pieceKey)) return;
    pieceArrangeGestureRef.current = {
      pieceKey,
      pointerId: event.pointerId,
      startMm,
      origin: next,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePieceArrange = (event: ReactPointerEvent<SVGGElement>) => {
    const gesture = pieceArrangeGestureRef.current;
    const currentMm = canvasPoint(event);
    if (!gesture || gesture.pointerId !== event.pointerId || !currentMm) return;
    event.stopPropagation();
    if (Math.abs(currentMm.x - gesture.startMm.x) + Math.abs(currentMm.y - gesture.startMm.y) > 0.5)
      gesture.moved = true;
    setPieceLayoutSession(
      translateSelectedPatternImportDxfPhaseECadTablePiecesV1(gesture.origin, {
        x: currentMm.x - gesture.startMm.x,
        y: currentMm.y - gesture.startMm.y,
      }),
    );
  };
  const endPieceArrange = (event: ReactPointerEvent<SVGGElement>) => {
    const gesture = pieceArrangeGestureRef.current;
    if (gesture?.pointerId !== event.pointerId) return;
    if (gesture.moved) {
      suppressPieceSelectClickRef.current = gesture.pieceKey;
      window.setTimeout(() => {
        if (suppressPieceSelectClickRef.current === gesture.pieceKey)
          suppressPieceSelectClickRef.current = null;
      }, 0);
    }
    pieceArrangeGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const fitPieceBounds =
    fitPatternImportDxfPhaseECadTablePieceBoundsV1(pieceLayoutSession, 20) ??
    ({ minX: 0, minY: 0, maxX: 100, maxY: 100 } as const);
  const viewportAspect = canvasViewportSize.width / Math.max(canvasViewportSize.height, 1);
  const fittedCanvasBounds = fitPatternImportDxfPhaseECadTableViewportAspectV1(
    canvasViewBounds ?? fitPieceBounds,
    viewportAspect,
  );
  const fittedAllPieceBounds = fitPatternImportDxfPhaseECadTableViewportAspectV1(
    fitPieceBounds,
    viewportAspect,
  );
  canvasDisplayBoundsRef.current = fittedCanvasBounds;
  canvasFitBoundsRef.current = fittedAllPieceBounds;
  const canvasWidthMm = Math.max(fittedCanvasBounds.maxX - fittedCanvasBounds.minX, 1);
  const canvasHeightMm = Math.max(fittedCanvasBounds.maxY - fittedCanvasBounds.minY, 1);
  const canvasViewBox = `${fittedCanvasBounds.minX} ${fittedCanvasBounds.minY} ${Math.max(
    canvasWidthMm,
    1,
  )} ${Math.max(canvasHeightMm, 1)}`;
  const canvasMmPerPixel = canvasWidthMm / Math.max(canvasViewportSize.width, 1);
  const canvasZoomPercent = patternImportDxfPhaseECadTableZoomPercentV1(
    fittedCanvasBounds,
    fittedAllPieceBounds,
  );
  const fitCanvas = () => {
    setCanvasViewBounds(fitPieceBounds);
  };
  const zeroConnectToolPhase =
    patternImportDxfPhaseECadTableZeroConnectControllerPhaseV1(zeroConnectController);
  const selectedZeroConnectSide = (
    segment: PatternImportDxfPhaseECadTableConnectEdgeSegmentV1,
  ): 0 | 1 | null =>
    patternImportDxfPhaseECadTableZeroConnectSelectedSideV1(zeroConnectController, segment);

  return (
    <div
      data-phase-e-multiseam-workbench-v2=''
      data-v2-ready={ready}
      className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-pageBg'
    >
      <div className='min-h-0 flex-1'>
        <div className='grid h-full min-h-0 grid-cols-[auto_minmax(0,1fr)] gap-0'>
          <PatternImportDxfPhaseECadWorkbenchObjectSidebarV1
            pieces={catalog.pieces.map((piece) => ({
              objectKey: patternImportDxfPhaseECadTablePieceKeyV1(
                piece.pieceId,
                piece.pieceLineKey,
              ),
              pieceId: piece.pieceId,
              label: piece.pieceLineKey,
              quantity: 1,
            }))}
            seams={proposal.seams.map((seam, index) => ({
              seamId: seam.id,
              label: seam.id,
              active: index === activeSeamIndex,
            }))}
            selectedPieceIds={pieceLayoutSession.selectedPieceKeys}
            seamCount={proposal.seams.length}
            issueCount={geometryValidationCheckCount}
            onFocusNextIssue={focusNextIssue}
            onFocusPiece={(pieceKey, { toggle }) => selectCanvasPiece(pieceKey, toggle)}
            onFocusSeam={(seamId) => {
              const nextIndex = proposal.seams.findIndex(({ id }) => id === seamId);
              if (nextIndex === 0 || nextIndex === 1)
                onActiveSeamIndexChange(nextIndex as SeamIndex);
            }}
          />
          <div className='relative flex h-full min-h-0 min-w-0 flex-col'>
            <div
              className='absolute right-2 top-1/2 z-30 flex h-[calc(100%-1rem)] w-12 -translate-y-1/2 items-center overflow-visible'
              data-cad-assembly-tool-rail-wrapper=''
            >
              <nav
                className='flex max-h-full w-12 flex-col gap-0.5 overflow-y-auto border border-borderColor bg-bgColor/95 p-0.5'
                aria-label='Assembly tools'
                data-cad-assembly-tool-rail=''
              >
                <PatternImportDxfPhaseECadWorkbenchToolButtonV1
                  icon='select'
                  label='Select'
                  active={measurementTool === null && !calloutToolActive && !panToolActive}
                  pressed={measurementTool === null && !calloutToolActive && !panToolActive}
                  onClick={() => selectMeasurementTool(null)}
                />
                <PatternImportDxfPhaseECadWorkbenchToolButtonV1
                  icon='hand'
                  label='Hand'
                  active={panToolActive}
                  pressed={panToolActive}
                  onClick={selectPanTool}
                />
                <PatternImportDxfPhaseECadTableConnectToolControlV1
                  phase={zeroConnectToolPhase}
                  disabled={disabled || !projectionReady}
                  onStart={startZeroConnect}
                  onCancel={cancelZeroConnect}
                />
                <details
                  className='group relative border-t border-hairline pt-1'
                  open={measureMenuOpen}
                  data-draft-cad-tool-group='measure'
                  data-tool-group-open={measureMenuOpen}
                  onToggle={(event) => setMeasureMenuOpen(event.currentTarget.open)}
                >
                  <summary
                    id={`${measureToolId}-summary`}
                    ref={measureMenuSummaryRef}
                    className={`flex h-10 w-10 cursor-pointer list-none items-center justify-center marker:hidden ${
                      measurementTool
                        ? 'bg-textColor text-bgColor'
                        : 'bg-transparent text-textColor hover:bg-pageBg'
                    }`}
                    aria-label='Measure tools'
                    aria-controls={`${measureToolId}-flyout`}
                    aria-expanded={measureMenuOpen}
                    title='Measure tools'
                    onPointerDown={() => {
                      keyboardOpenedMeasureRef.current = false;
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && !measureMenuOpen)
                        keyboardOpenedMeasureRef.current = true;
                    }}
                  >
                    <RulerSquareIcon aria-hidden width='16' height='16' />
                  </summary>
                </details>
                <PatternImportDxfPhaseECadWorkbenchToolButtonV1
                  icon='callout'
                  label='Callout'
                  active={calloutToolActive}
                  pressed={calloutToolActive}
                  onClick={selectCalloutTool}
                />
                <div className='flex flex-col gap-1 border-t border-hairline pt-1'>
                  <PatternImportDxfPhaseECadWorkbenchToolButtonV1
                    icon='view-options'
                    label='View options'
                    active={viewOptionsOpen}
                    expanded={viewOptionsOpen}
                    onClick={() => setViewOptionsOpen((value) => !value)}
                  />
                </div>
                {workspaceContextControl ? (
                  <div
                    className='flex flex-col gap-1 border-t border-hairline pt-1'
                    data-cad-2d-tool-context-slot=''
                  >
                    {workspaceContextControl}
                  </div>
                ) : null}
              </nav>
              {measureMenuOpen ? (
                <div
                  id={`${measureToolId}-flyout`}
                  ref={measureFlyoutRef}
                  className='absolute top-1/2 right-[calc(100%+0.5rem)] z-30 grid w-40 -translate-y-1/2 grid-cols-3 gap-1 border border-borderColor bg-bgColor p-1.5'
                  data-cad-tool-flyout='measure'
                  role='group'
                  aria-labelledby={`${measureToolId}-summary`}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      closeMeasureFlyoutFromKeyboard();
                    }
                  }}
                >
                  <Text component='p' size='micro' className='col-span-3 px-1 font-bold'>
                    Measure
                  </Text>
                  {(['point', 'line', 'edge'] as const).map((tool) => (
                    <PatternImportDxfPhaseECadWorkbenchToolButtonV1
                      key={tool}
                      icon={`measure-${tool}`}
                      label={`Measure ${tool}`}
                      active={measurementTool === tool}
                      pressed={measurementTool === tool}
                      onClick={() => {
                        selectMeasurementTool(tool);
                        setMeasureMenuOpen(false);
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
            {!ready ? (
              <div
                ref={validationActionRef}
                tabIndex={-1}
                className='flex min-w-0 flex-wrap items-center gap-2 border-b border-hairline bg-bgColor px-2 py-1.5'
                data-v2-contextual-validation=''
                title={
                  !state.documentRevisionConfirmed
                    ? 'This binds edits to the exact imported revision.'
                    : activeAuditIssue?.action ??
                      'Reopen the table from the current Assembly Order.'
                }
              >
                <Pill tone='attention'>Fix</Pill>
                <Text component='p' size='micro' className='min-w-0 font-bold'>
                  {!state.documentRevisionConfirmed
                    ? 'Confirm the current document'
                    : activeAuditIssue?.message ?? 'Current geometry cannot be confirmed.'}
                </Text>
                <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
                  <ContextualValidationControl
                    issue={activeAuditIssue}
                    catalog={catalog}
                    proposal={proposal}
                    state={state}
                    materialOptions={materialOptions}
                    disabled={disabled}
                    onStateChange={onStateChange}
                  />
                </div>
                {auditReport.issues.length ? (
                  <Button type='button' size='xs' variant='underline' onClick={focusNextIssue}>
                    Next
                  </Button>
                ) : null}
              </div>
            ) : null}

            {!projectionReady ? (
              <CalloutBox tone='error'>
                <Text component='p'>
                  ! Exact Phase-D projection does not match this sealed catalog.
                </Text>
              </CalloutBox>
            ) : (
              <div className='min-h-0 flex-1'>
                <div
                  className='relative h-full min-h-0 min-w-0 overflow-hidden bg-bgColor'
                  data-v2-geometry-desktop=''
                >
                  <div
                    ref={canvasViewportRef}
                    className='relative h-full min-h-0 min-w-0 overflow-hidden bg-bgColor'
                    data-v2-pan-enabled={panToolActive}
                    onPointerDown={(event) => {
                      if (!panToolActive) return;
                      const viewport = canvasViewportRef.current;
                      if (!viewport) return;
                      event.preventDefault();
                      viewport.setPointerCapture(event.pointerId);
                      panGestureRef.current = {
                        pointerId: event.pointerId,
                        x: event.clientX,
                        y: event.clientY,
                        originBounds: canvasDisplayBoundsRef.current,
                      };
                    }}
                    onPointerMove={(event) => {
                      const viewport = canvasViewportRef.current;
                      const gesture = panGestureRef.current;
                      if (!viewport || !gesture || gesture.pointerId !== event.pointerId) return;
                      setCanvasViewBounds(
                        panPatternImportDxfPhaseECadTableViewportV1(
                          gesture.originBounds,
                          { x: event.clientX - gesture.x, y: event.clientY - gesture.y },
                          viewport.getBoundingClientRect(),
                        ),
                      );
                    }}
                    onPointerUp={(event) => {
                      const viewport = canvasViewportRef.current;
                      if (panGestureRef.current?.pointerId !== event.pointerId) return;
                      panGestureRef.current = null;
                      if (viewport?.hasPointerCapture(event.pointerId))
                        viewport.releasePointerCapture(event.pointerId);
                    }}
                    onPointerCancel={(event) => {
                      if (panGestureRef.current?.pointerId === event.pointerId)
                        panGestureRef.current = null;
                    }}
                    style={{ cursor: panToolActive ? 'grab' : undefined }}
                  >
                    <svg
                      ref={canvasSvgRef}
                      viewBox={canvasViewBox}
                      preserveAspectRatio='xMidYMid meet'
                      className='absolute inset-0 block h-full w-full touch-none select-none'
                      role='img'
                      aria-label='Pattern pieces with bounded seam proposals and session-only table placement'
                      data-v2-canvas-zoom={canvasZoomPercent}
                      data-v2-active-colorway-id={activeColorwayPreview?.colorwayId}
                      data-v2-active-colorway-label={activeColorwayPreview?.label}
                      data-v2-selected-piece-count={pieceLayoutSession.selectedPieceKeys.length}
                      onDoubleClick={fitCanvas}
                      onPointerDown={(event) => {
                        if (!canvasSelectActive || event.target !== event.currentTarget) return;
                        const point = canvasPoint(event);
                        if (!point) return;
                        selectionGestureRef.current = {
                          pointerId: event.pointerId,
                          startX: point.x,
                          startY: point.y,
                          shiftKey: event.shiftKey,
                        };
                        setCanvasSelectionBox({ x: point.x, y: point.y, width: 0, height: 0 });
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) => {
                        const gesture = selectionGestureRef.current;
                        const point = canvasPoint(event);
                        if (!gesture || gesture.pointerId !== event.pointerId || !point) return;
                        setCanvasSelectionBox({
                          x: Math.min(gesture.startX, point.x),
                          y: Math.min(gesture.startY, point.y),
                          width: Math.abs(point.x - gesture.startX),
                          height: Math.abs(point.y - gesture.startY),
                        });
                      }}
                      onPointerUp={(event) => {
                        const gesture = selectionGestureRef.current;
                        const box = canvasSelectionBox;
                        if (!gesture || gesture.pointerId !== event.pointerId) return;
                        const next =
                          !box || box.width + box.height < 4
                            ? selectPatternImportDxfPhaseECadTablePiecesV1(
                                pieceLayoutSession,
                                [],
                                gesture.shiftKey ? 'add' : 'replace',
                              )
                            : selectPatternImportDxfPhaseECadTablePiecesInBoxV1(
                                pieceLayoutSession,
                                {
                                  minX: box.x,
                                  minY: box.y,
                                  maxX: box.x + box.width,
                                  maxY: box.y + box.height,
                                },
                                gesture.shiftKey ? 'toggle' : 'replace',
                              );
                        setPieceLayoutSession(next);
                        const firstSelected = next.pieces.find(({ identity }) =>
                          next.selectedPieceKeys.includes(identity.key),
                        )?.identity;
                        const sideIndex = firstSelected
                          ? proposal.seams[activeSeamIndex].sides.findIndex(
                              (side) =>
                                side.pieceId === firstSelected.pieceId &&
                                side.pieceLineKey === firstSelected.pieceLineKey,
                            )
                          : -1;
                        if (sideIndex === 0 || sideIndex === 1) onActivePieceIndexChange(sideIndex);
                        selectionGestureRef.current = null;
                        setCanvasSelectionBox(null);
                        if (event.currentTarget.hasPointerCapture(event.pointerId))
                          event.currentTarget.releasePointerCapture(event.pointerId);
                      }}
                      onPointerCancel={() => {
                        selectionGestureRef.current = null;
                        setCanvasSelectionBox(null);
                      }}
                    >
                      <PatternImportDxfPhaseEDraftCadGridRulersV1
                        box={{
                          x: fittedCanvasBounds.minX,
                          y: fittedCanvasBounds.minY,
                          w: canvasWidthMm,
                          h: canvasHeightMm,
                        }}
                        unit={canvasMmPerPixel}
                        layer='grid'
                        yAxisDirection='down'
                      />
                      {canvasSelectionBox ? (
                        <rect
                          data-v2-selection-box=''
                          x={canvasSelectionBox.x}
                          y={canvasSelectionBox.y}
                          width={canvasSelectionBox.width}
                          height={canvasSelectionBox.height}
                          fill='var(--color-textColor)'
                          fillOpacity='0.06'
                          stroke='var(--color-textColor)'
                          strokeDasharray='8 5'
                          vectorEffect='non-scaling-stroke'
                          pointerEvents='none'
                        />
                      ) : null}
                      {projection.pieces.map((piece) => {
                        const catalogPiece = catalog.pieces.find(
                          (candidate) =>
                            candidate.pieceId === piece.pieceId &&
                            candidate.pieceLineKey === piece.pieceLineKey,
                        );
                        const layout = pieceLayoutSession.pieces.find(
                          ({ identity }) =>
                            identity.pieceId === piece.pieceId &&
                            identity.pieceLineKey === piece.pieceLineKey,
                        );
                        if (!catalogPiece || !layout) return null;
                        const proposalBound = proposal.seams.some((seam) =>
                          seam.sides.some(
                            (side) =>
                              side.pieceId === piece.pieceId &&
                              side.pieceLineKey === piece.pieceLineKey,
                          ),
                        );
                        return (
                          <ProjectedPiece
                            key={layout.identity.key}
                            piece={piece}
                            catalogPiece={catalogPiece}
                            projection={projection}
                            proposal={proposal}
                            state={state}
                            activeSeamIndex={activeSeamIndex}
                            active={pieceLayoutSession.selectedPieceKeys.includes(
                              layout.identity.key,
                            )}
                            colorwayPreview={activeColorwayPreview}
                            showProposals={proposalBound && showProposals}
                            showVertices={proposalBound && showVertices}
                            showSewingBoundaries={showSewingBoundaries}
                            showCutBoundaries={showCutBoundaries}
                            showMeasurementLabels={proposalBound && showMeasurementLabels}
                            showCalloutText={proposalBound && showCalloutText}
                            measurementUnit={measurementUnit}
                            measurementTool={proposalBound ? measurementTool : null}
                            calloutToolActive={proposalBound && calloutToolActive}
                            measurementDraft={proposalBound ? measurementDraft : []}
                            measurements={proposalBound ? measurements : []}
                            callouts={proposalBound ? callouts : []}
                            layoutKey={layout.identity.key}
                            sourceBounds={layout.sourceBounds}
                            displayOffset={layout.offsetMm}
                            unit={canvasMmPerPixel}
                            disabled={disabled || panToolActive}
                            onSelect={(toggle) => {
                              if (suppressPieceSelectClickRef.current === layout.identity.key) {
                                suppressPieceSelectClickRef.current = null;
                                return;
                              }
                              selectCanvasPiece(layout.identity.key, toggle);
                            }}
                            onArrangePointerDown={(event) =>
                              beginPieceArrange(layout.identity.key, event)
                            }
                            onArrangePointerMove={movePieceArrange}
                            onArrangePointerUp={endPieceArrange}
                            onArrangePointerCancel={endPieceArrange}
                            onSelectSeam={onActiveSeamIndexChange}
                            onMeasurementVertex={selectMeasurementVertex}
                            onStateChange={onStateChange}
                          />
                        );
                      })}
                      {zeroConnectController.session
                        ? zeroConnectSegments.map((segment) => {
                            const layout = pieceLayoutSession.pieces.find(
                              ({ identity }) =>
                                identity.pieceId === segment.pieceId &&
                                identity.pieceLineKey === segment.pieceLineKey,
                            );
                            if (!layout) return null;
                            const selectedSide = selectedZeroConnectSide(segment);
                            const [from, to] = segment.pointsMm;
                            const canSelect =
                              !disabled && zeroConnectController.session?.status !== 'ready';
                            const select = (reverse: boolean) =>
                              selectZeroConnectEdge(segment, reverse ? 'reverse' : 'forward');
                            return (
                              <g
                                key={segment.viewKey}
                                transform={`translate(${layout.offsetMm.x} ${layout.offsetMm.y})`}
                                data-cad-zero-connect-edge={segment.viewKey}
                                data-cad-zero-connect-piece={segment.pieceId}
                                data-cad-zero-connect-contour={segment.contourId}
                                data-cad-zero-connect-side={
                                  selectedSide === null ? undefined : selectedSide === 0 ? 'a' : 'b'
                                }
                              >
                                <line
                                  x1={from.x}
                                  y1={from.y}
                                  x2={to.x}
                                  y2={to.y}
                                  stroke='currentColor'
                                  strokeWidth={selectedSide === null ? 1 : 3}
                                  strokeDasharray={selectedSide === 1 ? '6 3' : undefined}
                                  opacity={selectedSide === null ? 0.18 : 1}
                                  vectorEffect='non-scaling-stroke'
                                  pointerEvents='none'
                                  data-cad-zero-connect-edge-preview=''
                                />
                                <line
                                  x1={from.x}
                                  y1={from.y}
                                  x2={to.x}
                                  y2={to.y}
                                  stroke='transparent'
                                  strokeWidth='12'
                                  vectorEffect='non-scaling-stroke'
                                  pointerEvents={canSelect ? 'stroke' : 'none'}
                                  role='button'
                                  tabIndex={canSelect ? 0 : -1}
                                  aria-disabled={!canSelect}
                                  aria-label={`Choose ${segment.pieceLineKey} edge ${segment.boundaryVertexIds.join(' → ')}; hold Shift for reverse`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    select(event.shiftKey);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      select(event.shiftKey);
                                    }
                                  }}
                                />
                              </g>
                            );
                          })
                        : null}
                      <PatternImportDxfPhaseEDraftCadGridRulersV1
                        box={{
                          x: fittedCanvasBounds.minX,
                          y: fittedCanvasBounds.minY,
                          w: canvasWidthMm,
                          h: canvasHeightMm,
                        }}
                        unit={canvasMmPerPixel}
                        layer='rulers'
                        yAxisDirection='down'
                      />
                    </svg>
                  </div>
                  {zeroConnectController.session ? (
                    <div
                      className='absolute top-2 left-1/2 z-20 -translate-x-1/2 border border-borderColor bg-bgColor px-2 py-1 text-micro'
                      role='status'
                      data-cad-zero-connect-status={zeroConnectController.session.status}
                      data-cad-zero-connect-apply={
                        zeroConnectController.handoffResult?.ok
                          ? 'inserted'
                          : zeroConnectController.handoffResult
                            ? 'refused'
                            : zeroConnectController.candidate?.apply.eligible === false
                              ? 'blocked'
                              : undefined
                      }
                    >
                      <span className='font-bold'>Connect edges · </span>
                      {patternImportDxfPhaseECadTableZeroConnectControllerStatusV1(
                        zeroConnectController,
                      )}
                    </div>
                  ) : null}
                  {viewOptionsOpen ? (
                    <div
                      className='absolute top-8 left-3 z-30 w-52 space-y-2 border border-borderColor bg-bgColor p-2'
                      data-v2-view-options=''
                    >
                      <div className='flex items-center justify-between gap-2 border-b border-hairline pb-1'>
                        <Text component='p' size='micro' className='font-bold'>
                          View options
                        </Text>
                        <Close
                          size='sm'
                          aria-label='Close view options'
                          onClick={() => setViewOptionsOpen(false)}
                        />
                      </div>
                      {(
                        [
                          ['Seam proposals', showProposals, setShowProposals],
                          ['Exact vertices', showVertices, setShowVertices],
                          ['Sewing boundaries', showSewingBoundaries, setShowSewingBoundaries],
                          ['Cut boundaries', showCutBoundaries, setShowCutBoundaries],
                          ['Measurement labels', showMeasurementLabels, setShowMeasurementLabels],
                          ['Callout text', showCalloutText, setShowCalloutText],
                        ] as const
                      ).map(([label, checked, setChecked]) => (
                        <label key={label} className='flex items-center gap-2 text-micro'>
                          <CheckboxCommon
                            name={`phase-e-v2-view-${label.toLowerCase().replaceAll(' ', '-')}`}
                            checked={checked}
                            onChange={setChecked}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  ) : null}
                  <div className='absolute right-8 bottom-10 z-20 flex items-center gap-1 border border-borderColor bg-bgColor p-1'>
                    <Text
                      component='span'
                      size='micro'
                      className='min-w-12 text-center tabular-nums'
                    >
                      {canvasZoomPercent}%
                    </Text>
                    <Button
                      type='button'
                      size='xs'
                      variant='underline'
                      aria-label='Fit geometry to canvas'
                      onClick={fitCanvas}
                    >
                      Fit
                    </Button>
                  </div>
                  <div className='absolute bottom-10 left-3 z-20 flex items-center gap-2 border border-borderColor bg-bgColor px-2 py-1 text-micro'>
                    {colorwayOptions.length ? (
                      <Select
                        name='phase-e-v2-active-colorway'
                        placeholder='Colorway'
                        size='sm'
                        className='font-bold'
                        value={activeColorwayId ?? undefined}
                        items={colorwayOptions.map((option) => ({
                          value: option.id,
                          label: option.label,
                        }))}
                        onValueChange={(value) => setActiveColorwayId(Number(value))}
                      />
                    ) : null}
                    <span className='font-bold'>Size {catalog.sizeToken}</span>
                    <span className='text-labelColor'>exact Phase-D</span>
                  </div>

                  {measurementTool ||
                  calloutToolActive ||
                  measurements.length ||
                  callouts.length ||
                  measurementError ||
                  calloutError ? (
                    <div
                      className='absolute right-3 bottom-20 z-20 w-72 space-y-1 border border-borderColor bg-bgColor p-2 text-micro'
                      data-v2-session-annotations=''
                    >
                      {measurementTool ? (
                        <Text component='p' size='micro' variant='label'>
                          {measurementDraft.length
                            ? 'Choose the second exact vertex.'
                            : `Choose ${measurementTool === 'point' ? 'an exact vertex' : 'the first exact vertex'}.`}
                        </Text>
                      ) : null}
                      {measurementError ? (
                        <Text component='p' size='micro' variant='errorLabel'>
                          {measurementError}
                        </Text>
                      ) : null}
                      {measurements.map((measurement, index) => (
                        <div key={measurement.id} className='flex items-center gap-2'>
                          <span className='min-w-0 flex-1 truncate'>
                            {index + 1}. {measurement.kind}
                          </span>
                          <span className='font-bold tabular-nums'>
                            {measurementDisplayLabel(measurement, projection, measurementUnit)}
                          </span>
                          <Close
                            size='sm'
                            aria-label={`Delete measurement ${index + 1}`}
                            className='text-labelColor hover:text-textColor'
                            onClick={() =>
                              setMeasurements((current) =>
                                current.filter((candidate) => candidate.id !== measurement.id),
                              )
                            }
                          />
                        </div>
                      ))}
                      {calloutToolActive && !callouts.length ? (
                        <Text component='p' size='micro' variant='label'>
                          Choose an exact vertex for the callout.
                        </Text>
                      ) : null}
                      {calloutError ? (
                        <Text component='p' size='micro' variant='errorLabel'>
                          {calloutError}
                        </Text>
                      ) : null}
                      {callouts.map((callout, index) => (
                        <div key={callout.id} className='flex items-center gap-1'>
                          <span className='font-bold'>{index + 1}</span>
                          <Input
                            type='text'
                            aria-label={`Callout ${index + 1} text`}
                            className='min-w-0 flex-1'
                            value={callout.text}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => {
                              const result = updatePatternImportDxfPhaseECalloutTextV1(
                                projection,
                                callouts,
                                callout.id,
                                event.target.value,
                              );
                              if (!result.ok) {
                                setCalloutError(result.blockers[0].detail);
                                return;
                              }
                              setCallouts(result.callouts);
                              setCalloutError(null);
                            }}
                          />
                          <Close
                            size='sm'
                            aria-label={`Delete callout ${index + 1}`}
                            className='px-1 text-labelColor hover:text-textColor'
                            onClick={() => {
                              const result = deletePatternImportDxfPhaseECalloutV1(
                                projection,
                                callouts,
                                callout.id,
                              );
                              if (!result.ok) {
                                setCalloutError(result.blockers[0].detail);
                                return;
                              }
                              setCallouts(result.callouts);
                              setCalloutError(null);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {lastResult && !lastResult.ok ? (
        <CalloutBox tone='error'>
          <Text component='p' className='font-bold'>
            ! Atomic two-seam choices blocked
          </Text>
          <ul className='mt-1 list-square pl-4'>
            {lastResult.blockers.map((blocker, index) => (
              <li key={`${blocker.code}:${index}`}>
                <Text component='span' size='micro'>
                  {blocker.detail} [{blocker.code}]
                </Text>
              </li>
            ))}
          </ul>
        </CalloutBox>
      ) : null}

      <div className='flex shrink-0 items-center justify-between gap-2 border-t border-hairline pt-2'>
        <Text component='p' size='micro' variant={ready ? 'label' : 'errorLabel'}>
          {ready
            ? '✓ Both seams are explicitly complete; validate one atomic aggregate.'
            : '! Complete and confirm both exact seam spans before validation.'}
        </Text>
        {ready ? (
          <Button
            type='button'
            variant='main'
            size='sm'
            disabled={disabled || validationInFlight}
            onClick={() => {
              const launched = launchPatternImportDxfPhaseEMultiseamValidationOnceV2(
                validationGate,
                () =>
                  derivePatternImportDxfProductPhaseEMultiseamWorkbenchResultV2(
                    catalog,
                    proposal,
                    state,
                    materialOptions,
                  ),
                (result) => {
                  setLastResult(result);
                  onConfirm(result);
                },
                () => setValidationInFlight(false),
              );
              if (launched) setValidationInFlight(true);
            }}
          >
            Confirm both exact seams atomically
          </Button>
        ) : null}
      </div>
    </div>
  );
}
