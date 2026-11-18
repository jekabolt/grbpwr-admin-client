import type { MeasurementSurfaceAcceptedClothPieceV1 } from 'components/shared/measurement-watertight-surface-v1-stage';
import {
  computeDxfProductSavedSourceFileIdV1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { DxfGarmentObservedBoundaryEdgeV1 } from 'components/cloth-simulation-spike/dxf-garment-observed-unsewn-edges-v1';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { BoxMm, PtMm } from 'lib/pattern-import/types';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SetStateAction,
  type ReactNode,
} from 'react';

import { SHEET_INK, SheetViewport, ptsAttr, vy } from '../sheet-viewport';
import {
  derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1,
  visiblePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1,
  type PatternImportDxfPhaseECadTableBoundaryVisibilityV1,
  type PatternImportDxfPhaseECadTableConnectEdgeSegmentV1,
} from './cad-table-connect-edge-segments-v1';
import { PatternImportDxfPhaseECadTableConnectToolControlV1 } from './cad-table-connect-tool-control-v1';
import { CadTableLayoutTools } from './cad-table-layout-tools-v1';
import {
  CAD_TABLE_PIECE_FEATURE_LAYERS,
  hasCadTablePieceFeature,
  type CadTablePieceFeatureLayer,
  type CadTablePieceFeaturesByKey,
} from './cad-table-piece-features-v1';
import { CadTablePieceFeatureMarks } from './cad-table-piece-feature-marks-v1';
import {
  cadTablePieceSvgTransformV1,
  compactPatternImportDxfPhaseECadTablePieceOffsetsV1,
  createPatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  fitPatternImportDxfPhaseECadTablePieceBoundsV1,
  nextPatternImportDxfPhaseECadTablePieceHitV1,
  selectPatternImportDxfPhaseECadTablePiecesInLassoV1,
  selectPatternImportDxfPhaseECadTablePiecesV1,
  translateSelectedPatternImportDxfPhaseECadTablePiecesV1,
  type PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
} from './cad-table-piece-layout-session-v1';
import type {
  PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1,
  PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1,
} from './cad-table-zero-connect-authoring-handoff-v1';
import type { PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 } from './cad-table-zero-connect-phase-e-authority-v1';
import {
  cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1,
  createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
  patternImportDxfPhaseECadTableZeroConnectControllerPhaseV1,
  patternImportDxfPhaseECadTableZeroConnectControllerStatusV1,
  patternImportDxfPhaseECadTableZeroConnectSelectedSideV1,
  selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1,
  startPatternImportDxfPhaseECadTableZeroConnectControllerV1,
} from './cad-table-zero-connect-controller-v1';
import { sameSavedDraftRowV1 } from './draft-cad-saved-source-selection-v1';
import type { CadTableSavedTopstitchOverlayV1 } from './cad-table-saved-topstitch-overlay-v1';
import { PatternImportDxfPhaseEDraftCadGridRulersV1 } from './draft-cad-grid-rulers-v1';
import { PatternImportDxfPhaseECadWorkbenchToolButtonV1 } from './cad-workbench-tool-button-v1';
import { CAD_WORKBENCH_SEAM_SIDE_COLORS } from './cad-workbench-seam-colors-v1';
import { PatternImportDxfPhaseEDraftCadTopologyOverlayV1 } from './draft-cad-topology-overlay-v1';
import { usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1 } from './cad-workbench-split-shell-v1';
import { formatPatternImportDxfPhaseEMeasurementValueV1 } from './measurement-units-v1';
import type { PatternImportDxfPhaseETopologyAnnotationDraftV5 } from './topology-annotation-save-control-v5';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANVAS_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-connect-canvas/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANVAS_CLAIMS_V1 = Object.freeze({
  // Connect reads topology only from these owners. Retained piece features are display-only.
  exactCatalogAndProjectionOnly: true,
  proposalRequired: false,
  selectedOperationRequired: false,
  selectedSeamRequired: false,
  existingSheetViewportReused: true,
  existingAdaptiveGridAndRulersReused: true,
  existingPieceLayoutSessionReused: true,
  existingExactEdgeSegmentsReused: true,
  existingZeroConnectSessionReused: true,
  existingOperationsFieldWriterOnly: true,
  keyboardEdgeSelectionAccessible: true,
  rawDxfExposed: false,
  createsFormOwner: false,
  productionMounted: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseECadTableZeroConnectCanvasPropsV1 = Readonly<{
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  tableSessionOwner?: CadTableZeroCanvasOwner;
  pieceFeatures?: CadTablePieceFeaturesByKey;
  savedTopstitch?: CadTableSavedTopstitchOverlayV1;
  savedTopstitchError?: string;
  topstitchVisible?: boolean;
  onTopstitchVisibilityChange?: (visible: boolean) => void;
  authoringAuthority?: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 | null;
  authoringAuthorityRefresh?: PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1 | null;
  zeroConnectAuthoringHandoff?: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1;
  disabled?: boolean;
  savedAnnotations?: PatternImportDxfPhaseETopologyAnnotationDraftV5;
  savedAnnotationBlocker?: string;
  savedAnnotationEditControl?: ReactNode;
  savedSeam?: Readonly<{
    seamId: string;
    operationNumber: number;
    ordinal: number;
    focusedSideIndex?: 0 | 1 | null;
    onFocusSide?: (sideIndex: 0 | 1) => void;
    onFocusBoundary?: (segment: PatternImportDxfPhaseECadTableConnectEdgeSegmentV1) => void;
    focusedBoundary?: DxfGarmentObservedBoundaryEdgeV1 & Readonly<{ pieceKey: string }>;
    sides: readonly Readonly<{
      pieceId: string;
      pieceLineKey: string;
      contourId: string | null;
      boundaryVertexIds: readonly string[];
      direction?: 'forward' | 'reverse' | null;
    }>[];
  }>;
}>;

type SavedSeam = NonNullable<PatternImportDxfPhaseECadTableZeroConnectCanvasPropsV1['savedSeam']>;

function sameSavedSeamEdge(
  side: SavedSeam['sides'][number],
  segment: PatternImportDxfPhaseECadTableConnectEdgeSegmentV1,
) {
  const [first, second] = side.boundaryVertexIds;
  const [from, to] = segment.boundaryVertexIds;
  return (
    side.pieceId === segment.pieceId &&
    side.pieceLineKey === segment.pieceLineKey &&
    side.contourId === segment.contourId &&
    side.boundaryVertexIds.length === 2 &&
    ((first === from && second === to) || (first === to && second === from))
  );
}

function SavedSeamMeasurements({
  seam,
  projection,
}: {
  seam: SavedSeam;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
}) {
  const unit = usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1()?.unit ?? 'mm';
  const lengths = useMemo(() => {
    if (seam.sides.length !== 2) return [];
    const segments = derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1(projection);
    return seam.sides.flatMap((side) => {
      const matches = segments.filter((segment) => sameSavedSeamEdge(side, segment));
      if (matches.length !== 1) return [];
      const [from, to] = matches[0]!.pointsMm;
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      return Number.isFinite(length) ? [length] : [];
    });
  }, [projection, seam]);
  const [a, b] = lengths;
  if (a === undefined || b === undefined) return null;
  const [sideA, sideB] = seam.sides;
  const same = sideA?.direction === sideB?.direction;
  return (
    <span className='flex flex-wrap items-center gap-x-3' aria-label='Selected seam dimensions'>
      <span>
        Operation {seam.operationNumber} · Seam {seam.ordinal}
      </span>
      <span style={{ color: CAD_WORKBENCH_SEAM_SIDE_COLORS.A }}>
        A {formatPatternImportDxfPhaseEMeasurementValueV1(a, unit).formatted}
      </span>
      <span style={{ color: CAD_WORKBENCH_SEAM_SIDE_COLORS.B }}>
        B {formatPatternImportDxfPhaseEMeasurementValueV1(b, unit).formatted}
      </span>
      <span>
        Difference {formatPatternImportDxfPhaseEMeasurementValueV1(Math.abs(a - b), unit).formatted}
      </span>
      {sideA?.direction && sideB?.direction && <span>{same ? 'Same direction' : 'Reversed'}</span>}
    </span>
  );
}

function layoutFor(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
): PatternImportDxfPhaseECadTablePieceLayoutSessionV1 {
  return compactPatternImportDxfPhaseECadTablePieceOffsetsV1(
    createPatternImportDxfPhaseECadTablePieceLayoutSessionV1(projection.pieces),
  );
}

const FALLBACK_TABLE_BOUNDS = Object.freeze({
  minX: 0,
  minY: 0,
  maxX: 100,
  maxY: 100,
}) satisfies BoxMm;

function boundsFor(layout: PatternImportDxfPhaseECadTablePieceLayoutSessionV1): BoxMm {
  return fitPatternImportDxfPhaseECadTablePieceBoundsV1(layout, 20) ?? FALLBACK_TABLE_BOUNDS;
}

export type PatternImportDxfPhaseECadTableZeroCanvasSessionV1 = Readonly<{
  layout: PatternImportDxfPhaseECadTablePieceLayoutSessionV1;
  savedSeamSide?: Readonly<{ seamId: string; sideIndex: 0 | 1; pieceKey: string }> | null;
  savedBoundary?: (DxfGarmentObservedBoundaryEdgeV1 & Readonly<{ pieceKey: string }>) | null;
  /**
   * Caller-owned fitted view. It intentionally does not follow session-only piece offsets until
   * the operator explicitly asks to fit the table again.
   */
  viewportBounds: BoxMm;
}>;

export function createPatternImportDxfPhaseECadTableZeroCanvasSessionV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
): PatternImportDxfPhaseECadTableZeroCanvasSessionV1 {
  const layout = layoutFor(projection);
  return Object.freeze({ layout, viewportBounds: boundsFor(layout) });
}

export type CadTableZeroCanvasOwner = Readonly<{
  session: PatternImportDxfPhaseECadTableZeroCanvasSessionV1;
  update: (action: SetStateAction<PatternImportDxfPhaseECadTableZeroCanvasSessionV1>) => void;
}>;

/** Maintains presentation and selection for one exact projection. */
export function useCadTableZeroCanvasOwner(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1 | null,
): CadTableZeroCanvasOwner | null {
  const [state, setState] = useState(() => ({
    projection,
    session: projection
      ? createPatternImportDxfPhaseECadTableZeroCanvasSessionV1(projection)
      : null,
  }));
  const update = useCallback<CadTableZeroCanvasOwner['update']>(
    (action) => {
      setState((current) => {
        if (current.projection !== projection || !current.session) return current;
        const session = typeof action === 'function' ? action(current.session) : action;
        return { ...current, session };
      });
    },
    [projection],
  );
  if (state.projection !== projection) {
    setState({
      projection,
      session: projection
        ? createPatternImportDxfPhaseECadTableZeroCanvasSessionV1(projection)
        : null,
    });
    return null;
  }
  return state.session ? { session: state.session, update } : null;
}

export function movePatternImportDxfPhaseECadTableZeroCanvasSessionV1(
  session: PatternImportDxfPhaseECadTableZeroCanvasSessionV1,
  pieceKey: string,
  deltaMm: PtMm,
): PatternImportDxfPhaseECadTableZeroCanvasSessionV1 {
  const selected = session.layout.selectedPieceKeys.includes(pieceKey)
    ? session.layout
    : selectPatternImportDxfPhaseECadTablePiecesV1(session.layout, [pieceKey], 'replace');
  return Object.freeze({
    ...session,
    savedSeamSide: selected === session.layout ? session.savedSeamSide : null,
    savedBoundary: selected === session.layout ? session.savedBoundary : null,
    layout: translateSelectedPatternImportDxfPhaseECadTablePiecesV1(selected, deltaMm),
  });
}

export function fitPatternImportDxfPhaseECadTableZeroCanvasSessionV1(
  session: PatternImportDxfPhaseECadTableZeroCanvasSessionV1,
): PatternImportDxfPhaseECadTableZeroCanvasSessionV1 {
  return Object.freeze({ ...session, viewportBounds: boundsFor(session.layout) });
}

export function activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1(
  session: PatternImportDxfPhaseECadTableZeroCanvasSessionV1,
  pieceKey: string,
  toggle: boolean,
  pointMm?: PtMm,
): PatternImportDxfPhaseECadTableZeroCanvasSessionV1 {
  const resolvedKey =
    pointMm && !toggle
      ? nextPatternImportDxfPhaseECadTablePieceHitV1(session.layout, pieceKey, pointMm)
      : pieceKey;
  return Object.freeze({
    ...session,
    savedSeamSide: null,
    savedBoundary: null,
    layout: selectPatternImportDxfPhaseECadTablePiecesV1(
      session.layout,
      resolvedKey ? [resolvedKey] : [],
      toggle ? 'toggle' : 'replace',
    ),
  });
}

/** A rendered cloth hit may select only the same exact saved row/size in the open table. */
export function selectCadTableAcceptedClothPieceV1(
  session: PatternImportDxfPhaseECadTableZeroCanvasSessionV1,
  row: DxfProductSavedRowIdentityV1,
  projection: Pick<PatternImportDxfProductPhaseEAssemblyProjectionV1, 'sourceFileId' | 'sizeToken'>,
  hit: MeasurementSurfaceAcceptedClothPieceV1,
) {
  if (
    !sameSavedDraftRowV1(row, hit.row) ||
    projection.sizeToken !== hit.sizeToken ||
    projection.sourceFileId !== computeDxfProductSavedSourceFileIdV1(hit.row)
  )
    return session;
  const candidates = session.layout.pieces.filter(
    ({ identity }) =>
      identity.pieceId === hit.pieceId && identity.pieceLineKey === hit.pieceLineKey,
  );
  if (candidates.length !== 1) return session;
  return activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1(
    session,
    candidates[0].identity.key,
    false,
  );
}

export function patternImportDxfPhaseECadTableZeroKeyboardMoveDeltaV1(
  key: string,
  largeStep: boolean,
): PtMm | null {
  const step = largeStep ? 10 : 1;
  switch (key) {
    case 'ArrowLeft':
      return Object.freeze({ x: -step, y: 0 });
    case 'ArrowRight':
      return Object.freeze({ x: step, y: 0 });
    case 'ArrowUp':
      return Object.freeze({ x: 0, y: step });
    case 'ArrowDown':
      return Object.freeze({ x: 0, y: -step });
    default:
      return null;
  }
}

function pieceLayout(
  layout: PatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  segment: PatternImportDxfPhaseECadTableConnectEdgeSegmentV1,
) {
  return layout.pieces.find(
    ({ identity }) =>
      identity.pieceId === segment.pieceId && identity.pieceLineKey === segment.pieceLineKey,
  );
}

/**
 * Proposal-independent exact 2D connection surface. It owns only local viewport and gesture state;
 * the optional handoff remains the sole route into the existing OperationsField writer.
 */
export function PatternImportDxfPhaseECadTableZeroConnectCanvasV1(
  props: PatternImportDxfPhaseECadTableZeroConnectCanvasPropsV1,
) {
  if (props.tableSessionOwner)
    return <CadTableZeroCanvas {...props} owner={props.tableSessionOwner} />;
  return <StandaloneCadTableZeroCanvas {...props} />;
}

function StandaloneCadTableZeroCanvas(
  props: PatternImportDxfPhaseECadTableZeroConnectCanvasPropsV1,
) {
  const owner = useCadTableZeroCanvasOwner(props.projection);
  return owner ? <CadTableZeroCanvas {...props} owner={owner} /> : null;
}

function CadTableZeroCanvas({
  catalog,
  projection,
  pieceFeatures,
  authoringAuthority = null,
  authoringAuthorityRefresh = null,
  zeroConnectAuthoringHandoff,
  disabled = false,
  savedSeam,
  savedAnnotations,
  savedAnnotationBlocker,
  savedAnnotationEditControl,
  savedTopstitch,
  savedTopstitchError,
  topstitchVisible = true,
  onTopstitchVisibilityChange,
  owner,
}: PatternImportDxfPhaseECadTableZeroConnectCanvasPropsV1 & { owner: CadTableZeroCanvasOwner }) {
  const authority = useMemo(
    () => ({ catalog, projection, authoringAuthority, authoringAuthorityRefresh }) as const,
    [authoringAuthority, authoringAuthorityRefresh, catalog, projection],
  );
  const { session: tableSession, update: setTableSession } = owner;
  const { layout, viewportBounds } = tableSession;
  const [activeTool, setActiveTool] = useState<'select' | 'lasso' | 'pan' | 'move' | 'connect'>(
    'select',
  );
  const [fitRequest, setFitRequest] = useState(0);
  const [measurementsVisible, setMeasurementsVisible] = useState(true);
  const [calloutsVisible, setCalloutsVisible] = useState(true);
  const [hiddenFeatureLayers, setHiddenFeatureLayers] = useState<
    ReadonlySet<CadTablePieceFeatureLayer>
  >(() => new Set());
  const availableFeatureLayers = useMemo(
    () =>
      CAD_TABLE_PIECE_FEATURE_LAYERS.filter(({ key }) =>
        [...(pieceFeatures?.values() ?? [])].some((features) =>
          hasCadTablePieceFeature(features, key),
        ),
      ),
    [pieceFeatures],
  );
  const [hoveredPieceKey, setHoveredPieceKey] = useState<string | null>(null);
  const [focusedPieceKey, setFocusedPieceKey] = useState<string | null>(null);
  const [boundaryVisibility, setBoundaryVisibility] =
    useState<PatternImportDxfPhaseECadTableBoundaryVisibilityV1>({
      'cut-boundary': true,
      'sewing-boundary': true,
    });
  const segments = useMemo(
    () =>
      visiblePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1(projection, boundaryVisibility),
    [boundaryVisibility, projection],
  );
  const [controller, setController] = useState(() =>
    createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1(),
  );
  const sourceIdentity = `${catalog.canonicalSha256}|${catalog.sizeSelectionCanonicalSha256}|${projection.expectedCatalogCanonicalSha256}|${projection.sizeSelectionCanonicalSha256}|${projection.sourceFileId}|${projection.sizeToken}`;
  useEffect(() => {
    setController(createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1());
    setActiveTool('select');
    setHoveredPieceKey(null);
    setFocusedPieceKey(null);
    setFitRequest((current) => current + 1);
  }, [projection, sourceIdentity]);
  const phase = patternImportDxfPhaseECadTableZeroConnectControllerPhaseV1(controller);
  const status = patternImportDxfPhaseECadTableZeroConnectControllerStatusV1(controller);
  const selectsPieces = activeTool === 'select' || activeTool === 'lasso';
  const connectDisabled = disabled || zeroConnectAuthoringHandoff?.status === 'unavailable';
  const toggleBoundary = (role: keyof PatternImportDxfPhaseECadTableBoundaryVisibilityV1) => {
    const visible = !boundaryVisibility[role];
    setBoundaryVisibility({ ...boundaryVisibility, [role]: visible });
    const firstSide = controller.session?.sides[0];
    if (
      !visible &&
      controller.session?.status === 'select-side-b' &&
      firstSide &&
      segments.some(
        (segment) =>
          segment.contourRole === role &&
          segment.pieceId === firstSide.pieceId &&
          segment.pieceLineKey === firstSide.pieceLineKey &&
          segment.contourId === firstSide.contourId,
      )
    ) {
      setController((current) =>
        startPatternImportDxfPhaseECadTableZeroConnectControllerV1(
          cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1(current),
          authority,
        ),
      );
    }
  };
  const selectEdge = (
    segment: PatternImportDxfPhaseECadTableConnectEdgeSegmentV1,
    direction: 'forward' | 'reverse',
  ) => {
    if (connectDisabled) return;
    // The second edge may call the caller-owned form handoff. Keep that side effect out of a
    // functional state updater because Strict Mode is allowed to invoke updater functions twice.
    setController(
      selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
        controller,
        authority,
        segment,
        direction,
        zeroConnectAuthoringHandoff,
      ),
    );
  };

  return (
    <section
      data-cad-zero-connect-canvas-v1=''
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented || activeTool !== 'connect') return;
        event.preventDefault();
        setController((current) =>
          cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1(current),
        );
        setActiveTool('select');
      }}
      data-cad-zero-connect-phase={phase}
      data-cad-zero-connect-proposal='absent'
      data-cad-zero-connect-operation='absent'
      data-cad-zero-connect-apply={
        controller.handoffResult?.ok
          ? 'inserted'
          : controller.handoffResult
            ? 'refused'
            : controller.candidate?.apply.eligible === false
              ? 'blocked'
              : undefined
      }
      className='grid min-h-[30rem] min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-bgColor'
    >
      <div className='relative min-h-0 overflow-hidden'>
        <CadTableLayoutTools owner={owner} />
        <div
          className='absolute right-2 top-1/2 z-20 flex max-h-[calc(100%-1rem)] -translate-y-1/2 flex-col gap-0.5 overflow-y-auto border border-borderColor bg-bgColor p-0.5'
          role='toolbar'
          aria-label='2D table tools'
          data-cad-zero-connect-toolbar=''
        >
          <PatternImportDxfPhaseECadWorkbenchToolButtonV1
            icon='select'
            label='Select pieces'
            active={activeTool === 'select'}
            pressed={activeTool === 'select'}
            dataAttributes={{ 'data-cad-zero-connect-select-tool': '' }}
            onClick={() => {
              if (phase !== 'idle')
                setController((current) =>
                  cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1(current),
                );
              setActiveTool('select');
            }}
          />
          <PatternImportDxfPhaseECadWorkbenchToolButtonV1
            icon='guideline'
            label='Lasso pieces'
            active={activeTool === 'lasso'}
            pressed={activeTool === 'lasso'}
            onClick={() => {
              if (phase !== 'idle')
                setController((current) =>
                  cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1(current),
                );
              setActiveTool('lasso');
            }}
          />
          <PatternImportDxfPhaseECadWorkbenchToolButtonV1
            icon='hand'
            label='Pan canvas'
            active={activeTool === 'pan'}
            pressed={activeTool === 'pan'}
            dataAttributes={{ 'data-cad-zero-connect-pan-tool': '' }}
            onClick={() => {
              if (phase !== 'idle')
                setController((current) =>
                  cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1(current),
                );
              setActiveTool('pan');
            }}
          />
          <PatternImportDxfPhaseECadWorkbenchToolButtonV1
            icon='move'
            label='Move selected pieces'
            active={activeTool === 'move'}
            pressed={activeTool === 'move'}
            dataAttributes={{ 'data-cad-zero-connect-move-tool': '' }}
            onClick={() => {
              if (phase !== 'idle')
                setController((current) =>
                  cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1(current),
                );
              setActiveTool('move');
            }}
          />
          {!savedSeam && (
            <PatternImportDxfPhaseECadTableConnectToolControlV1
              phase={phase}
              disabled={connectDisabled}
              onStart={() => {
                setActiveTool('connect');
                setController((current) =>
                  startPatternImportDxfPhaseECadTableZeroConnectControllerV1(current, authority),
                );
              }}
              onCancel={() => {
                setController((current) =>
                  cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1(current),
                );
                setActiveTool('select');
              }}
            />
          )}
          <PatternImportDxfPhaseECadWorkbenchToolButtonV1
            icon='fit'
            label='Fit all pieces'
            dataAttributes={{ 'data-cad-zero-connect-fit-tool': '' }}
            onClick={() => {
              setTableSession((current) =>
                fitPatternImportDxfPhaseECadTableZeroCanvasSessionV1(current),
              );
              setFitRequest((current) => current + 1);
            }}
          />
          <PatternImportDxfPhaseECadWorkbenchToolButtonV1
            icon='reset-layout'
            label='Reset piece layout'
            dataAttributes={{ 'data-cad-zero-connect-reset-layout': '' }}
            onClick={() => {
              setTableSession(createPatternImportDxfPhaseECadTableZeroCanvasSessionV1(projection));
              setHoveredPieceKey(null);
              setFocusedPieceKey(null);
              setFitRequest((current) => current + 1);
            }}
          />
          <PatternImportDxfPhaseECadWorkbenchToolButtonV1
            icon='pattern-line'
            label='Show cut outlines'
            active={boundaryVisibility['cut-boundary']}
            pressed={boundaryVisibility['cut-boundary']}
            onClick={() => toggleBoundary('cut-boundary')}
          />
          <PatternImportDxfPhaseECadWorkbenchToolButtonV1
            icon='connect'
            label='Show sewing outlines'
            active={boundaryVisibility['sewing-boundary']}
            pressed={boundaryVisibility['sewing-boundary']}
            onClick={() => toggleBoundary('sewing-boundary')}
          />
          {savedTopstitch && onTopstitchVisibilityChange ? (
            <PatternImportDxfPhaseECadWorkbenchToolButtonV1
              icon='internal-line'
              label='Show topstitch'
              active={topstitchVisible}
              pressed={topstitchVisible}
              onClick={() => onTopstitchVisibilityChange(!topstitchVisible)}
            />
          ) : null}
          {savedAnnotationEditControl}
          {!!savedAnnotations?.measurements.length && (
            <PatternImportDxfPhaseECadWorkbenchToolButtonV1
              icon='measure-line'
              label='Show measurements'
              active={measurementsVisible}
              pressed={measurementsVisible}
              onClick={() => setMeasurementsVisible((visible) => !visible)}
            />
          )}
          {!!savedAnnotations?.callouts.length && (
            <PatternImportDxfPhaseECadWorkbenchToolButtonV1
              icon='callout'
              label='Show callouts'
              active={calloutsVisible}
              pressed={calloutsVisible}
              onClick={() => setCalloutsVisible((visible) => !visible)}
            />
          )}
          {availableFeatureLayers.map(({ key, label, icon }) => (
            <PatternImportDxfPhaseECadWorkbenchToolButtonV1
              key={key}
              icon={icon}
              label={label}
              active={!hiddenFeatureLayers.has(key)}
              pressed={!hiddenFeatureLayers.has(key)}
              onClick={() =>
                setHiddenFeatureLayers((current) => {
                  const next = new Set(current);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
            />
          ))}
        </div>
        <SheetViewport
          bbox={viewportBounds}
          tool={activeTool === 'select' ? 'marquee' : activeTool === 'connect' ? 'pan' : activeTool}
          fitRequest={fitRequest}
          className='min-h-0'
          onPick={(viewKey, modifiers) => {
            if (activeTool === 'select' && savedSeam) {
              const segment = segments.find((candidate) => candidate.viewKey === viewKey);
              const sideIndex = segment
                ? savedSeam.sides.findIndex((side) => sameSavedSeamEdge(side, segment))
                : -1;
              if ((sideIndex === 0 || sideIndex === 1) && savedSeam.onFocusSide) {
                savedSeam.onFocusSide(sideIndex);
                return;
              }
              if (
                sideIndex < 0 &&
                segment?.contourRole === 'sewing-boundary' &&
                savedSeam.onFocusBoundary
              ) {
                savedSeam.onFocusBoundary(segment);
                return;
              }
            }
            if (selectsPieces || activeTool === 'move') {
              setTableSession((current) =>
                activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1(
                  current,
                  viewKey,
                  modifiers.shiftKey,
                  selectsPieces ? modifiers.pointMm : undefined,
                ),
              );
              return;
            }
            if (!controller.session || controller.session.status === 'ready') return;
            const segment = segments.find((candidate) => candidate.viewKey === viewKey);
            if (segment) selectEdge(segment, modifiers.shiftKey ? 'reverse' : 'forward');
          }}
          onLasso={(points, modifiers) =>
            setTableSession((current) => ({
              ...current,
              savedSeamSide: null,
              savedBoundary: null,
              layout: selectPatternImportDxfPhaseECadTablePiecesInLassoV1(
                current.layout,
                points,
                modifiers.shiftKey ? 'toggle' : 'replace',
              ),
            }))
          }
          onMove={(pieceKey, deltaMm) => {
            setTableSession((current) =>
              movePatternImportDxfPhaseECadTableZeroCanvasSessionV1(current, pieceKey, deltaMm),
            );
          }}
        >
          {({ box, unit }) => (
            <>
              <PatternImportDxfPhaseEDraftCadGridRulersV1 box={box} unit={unit} layer='grid' />
              {projection.pieces.map((piece) => {
                const pieceLayout = layout.pieces.find(
                  ({ identity }) =>
                    identity.pieceId === piece.pieceId &&
                    identity.pieceLineKey === piece.pieceLineKey,
                );
                if (!pieceLayout) return null;
                const selected = layout.selectedPieceKeys.includes(pieceLayout.identity.key);
                const hovered = hoveredPieceKey === pieceLayout.identity.key;
                const focused = focusedPieceKey === pieceLayout.identity.key;
                const keyboardEnabled = selectsPieces || activeTool === 'move';
                const features = pieceFeatures?.get(pieceLayout.identity.key);
                return (
                  <g
                    key={pieceLayout.identity.key}
                    data-key={pieceLayout.identity.key}
                    data-cad-zero-connect-piece={piece.pieceId}
                    data-cad-zero-connect-piece-line={piece.pieceLineKey}
                    data-cad-zero-connect-piece-selected={selected || undefined}
                    data-cad-zero-connect-piece-hovered={hovered || undefined}
                    data-cad-zero-connect-piece-focused={focused || undefined}
                    transform={cadTablePieceSvgTransformV1(pieceLayout, 'inverted')}
                    role='button'
                    tabIndex={keyboardEnabled ? 0 : -1}
                    aria-disabled={!keyboardEnabled}
                    aria-pressed={selected}
                    aria-label={`${features?.pieceLabel ?? piece.pieceLineKey} pattern piece`}
                    aria-keyshortcuts='Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight'
                    onPointerEnter={() => setHoveredPieceKey(pieceLayout.identity.key)}
                    onPointerLeave={() => setHoveredPieceKey(null)}
                    onFocus={() => setFocusedPieceKey(pieceLayout.identity.key)}
                    onBlur={() => setFocusedPieceKey(null)}
                    onKeyDown={(event) => {
                      if (!keyboardEnabled) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setTableSession((current) =>
                          activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1(
                            current,
                            pieceLayout.identity.key,
                            event.shiftKey,
                          ),
                        );
                        return;
                      }
                      if (activeTool !== 'move') return;
                      const deltaMm = patternImportDxfPhaseECadTableZeroKeyboardMoveDeltaV1(
                        event.key,
                        event.shiftKey,
                      );
                      if (!deltaMm) return;
                      event.preventDefault();
                      setTableSession((current) =>
                        movePatternImportDxfPhaseECadTableZeroCanvasSessionV1(
                          current,
                          pieceLayout.identity.key,
                          deltaMm,
                        ),
                      );
                    }}
                  >
                    {pieceLayout.sourceMaterialRings.length ? (
                      <path
                        data-cad-zero-connect-material=''
                        fillRule='evenodd'
                        d={pieceLayout.sourceMaterialRings
                          .map((ring) => `M ${ptsAttr(ring)} Z`)
                          .join(' ')}
                        fill={selected ? SHEET_INK.pick : SHEET_INK.fill}
                        pointerEvents={keyboardEnabled ? 'fill' : 'none'}
                      />
                    ) : null}
                    {piece.contours.map((contour) => {
                      const visibilityRole =
                        contour.role === 'hole' ? 'cut-boundary' : contour.role;
                      if (!boundaryVisibility[visibilityRole]) return null;
                      const points = contour.vertices.map(({ pointMm }) => pointMm);
                      const closed =
                        contour.closed && points.length > 0 ? [...points, points[0]] : points;
                      return (
                        <polyline
                          key={contour.contourId}
                          data-cad-zero-connect-contour={contour.contourId}
                          points={ptsAttr(closed)}
                          fill='none'
                          stroke={
                            focused
                              ? SHEET_INK.blue
                              : contour.role === 'hole'
                                ? SHEET_INK.mut
                                : selected || hovered
                                  ? SHEET_INK.ink
                                  : SHEET_INK.mut
                          }
                          strokeWidth={focused || selected ? 1.6 : hovered ? 1.4 : 1.2}
                          strokeDasharray={contour.role === 'sewing-boundary' ? '4 3' : undefined}
                          vectorEffect='non-scaling-stroke'
                          pointerEvents={
                            keyboardEnabled &&
                            !contour.closed &&
                            !pieceLayout.sourceMaterialRings.length
                              ? 'stroke'
                              : 'none'
                          }
                        />
                      );
                    })}
                    {features ? (
                      <CadTablePieceFeatureMarks
                        features={features}
                        hiddenLayers={hiddenFeatureLayers}
                        unit={unit}
                        materialRings={pieceLayout.sourceMaterialRings}
                      />
                    ) : null}
                    {topstitchVisible && savedTopstitch?.pieceKey === pieceLayout.identity.key ? (
                      <polyline
                        data-cad-saved-topstitch={savedTopstitch.lineKey}
                        data-cad-saved-topstitch-operation={savedTopstitch.operationNumber}
                        data-cad-saved-topstitch-offset-mm={savedTopstitch.widthMm}
                        points={ptsAttr(savedTopstitch.pointsMm)}
                        fill='none'
                        stroke='var(--color-highlightColor)'
                        strokeWidth={1.6}
                        strokeDasharray='3 2'
                        vectorEffect='non-scaling-stroke'
                        pointerEvents='none'
                      />
                    ) : null}
                    {savedAnnotations ? (
                      <PatternImportDxfPhaseEDraftCadTopologyOverlayV1
                        projection={projection}
                        state={{
                          sourceIdentity,
                          unit: 'mm',
                          measurements: measurementsVisible ? savedAnnotations.measurements : [],
                          callouts: calloutsVisible ? savedAnnotations.callouts : [],
                        }}
                        pieceId={piece.pieceId}
                        pieceLineKey={piece.pieceLineKey}
                        unit={unit}
                      />
                    ) : null}
                  </g>
                );
              })}
              {controller.session || savedSeam
                ? segments.map((segment) => {
                    const placed = pieceLayout(layout, segment);
                    if (!placed) return null;
                    const savedSideIndex = savedSeam?.sides.findIndex((side) =>
                      sameSavedSeamEdge(side, segment),
                    );
                    const savedSide =
                      savedSideIndex === 0 ? 'A' : savedSideIndex === 1 ? 'B' : null;
                    const selectedSide =
                      savedSideIndex === 0 || savedSideIndex === 1
                        ? savedSideIndex
                        : patternImportDxfPhaseECadTableZeroConnectSelectedSideV1(
                            controller,
                            segment,
                          );
                    const canFocusBoundary =
                      activeTool === 'select' &&
                      !savedSide &&
                      segment.contourRole === 'sewing-boundary' &&
                      !!savedSeam?.onFocusBoundary;
                    if (!controller.session && selectedSide === null && !canFocusBoundary)
                      return null;
                    const [from, to] = segment.pointsMm;
                    const canSelect =
                      !!controller.session &&
                      !connectDisabled &&
                      controller.session.status !== 'ready';
                    const canFocusSavedSide =
                      activeTool === 'select' &&
                      !!savedSeam?.onFocusSide &&
                      (savedSideIndex === 0 || savedSideIndex === 1);
                    const savedSideFocused =
                      !!savedSide && savedSideIndex === savedSeam?.focusedSideIndex;
                    const savedBoundaryFocused =
                      savedSeam?.focusedBoundary?.pieceKey === placed.identity.key &&
                      savedSeam.focusedBoundary.contourId === segment.contourId &&
                      savedSeam.focusedBoundary.boundaryVertexIds.every(
                        (id, index) => id === segment.boundaryVertexIds[index],
                      );
                    const canActivateEdge = canSelect || canFocusSavedSide || canFocusBoundary;
                    const savedSideColor = savedSide
                      ? CAD_WORKBENCH_SEAM_SIDE_COLORS[savedSide]
                      : 'currentColor';
                    const labelX = (from.x + to.x) / 2;
                    const labelY = vy((from.y + to.y) / 2);
                    return (
                      <g
                        key={segment.viewKey}
                        transform={cadTablePieceSvgTransformV1(placed, 'inverted')}
                        data-cad-zero-connect-edge={segment.viewKey}
                        data-cad-zero-connect-boundary-focused={savedBoundaryFocused || undefined}
                        data-cad-zero-connect-seam-id={savedSide ? savedSeam?.seamId : undefined}
                        data-cad-zero-connect-saved-side-focused={
                          savedSideFocused ? savedSide : undefined
                        }
                        data-cad-zero-connect-seam-operation={
                          savedSide ? savedSeam?.operationNumber : undefined
                        }
                        data-cad-zero-connect-seam-ordinal={
                          savedSide ? savedSeam?.ordinal : undefined
                        }
                        data-cad-zero-connect-side={
                          selectedSide === null ? undefined : selectedSide === 0 ? 'a' : 'b'
                        }
                      >
                        <line
                          x1={from.x}
                          y1={vy(from.y)}
                          x2={to.x}
                          y2={vy(to.y)}
                          stroke={
                            savedBoundaryFocused ? 'var(--color-highlightColor)' : savedSideColor
                          }
                          strokeWidth={
                            savedSideFocused || savedBoundaryFocused
                              ? 5
                              : selectedSide === null
                                ? 1
                                : 3
                          }
                          strokeDasharray={selectedSide === 1 ? '6 3' : undefined}
                          opacity={selectedSide === null && !savedBoundaryFocused ? 0.18 : 1}
                          vectorEffect='non-scaling-stroke'
                          pointerEvents='none'
                        />
                        <line
                          data-key={segment.viewKey}
                          x1={from.x}
                          y1={vy(from.y)}
                          x2={to.x}
                          y2={vy(to.y)}
                          stroke='transparent'
                          strokeWidth='12'
                          vectorEffect='non-scaling-stroke'
                          pointerEvents={canActivateEdge ? 'stroke' : 'none'}
                          role='button'
                          tabIndex={canActivateEdge ? 0 : -1}
                          aria-disabled={!canActivateEdge}
                          aria-pressed={
                            canFocusSavedSide
                              ? savedSideFocused
                              : canFocusBoundary
                                ? savedBoundaryFocused
                                : undefined
                          }
                          aria-label={
                            canFocusSavedSide
                              ? `Select seam ${savedSeam.ordinal} side ${savedSide}`
                              : canFocusBoundary
                                ? `Select ${segment.pieceLineKey} edge ${segment.boundaryVertexIds.join(' → ')}`
                                : `Choose ${segment.pieceLineKey} edge ${segment.boundaryVertexIds.join(' → ')}; hold Shift for reverse`
                          }
                          onKeyDown={(event) => {
                            if (!canActivateEdge || (event.key !== 'Enter' && event.key !== ' '))
                              return;
                            event.preventDefault();
                            event.stopPropagation();
                            if (canFocusSavedSide) savedSeam.onFocusSide?.(savedSideIndex);
                            else if (canFocusBoundary) savedSeam.onFocusBoundary?.(segment);
                            else selectEdge(segment, event.shiftKey ? 'reverse' : 'forward');
                          }}
                        />
                        {savedSeam && savedSide ? (
                          <text
                            data-cad-zero-connect-seam-label=''
                            x={labelX}
                            y={labelY - 4 * unit}
                            transform={
                              placed.rotationDegrees
                                ? `rotate(${placed.rotationDegrees} ${labelX} ${labelY})`
                                : undefined
                            }
                            fill={savedSideColor}
                            stroke='var(--color-bgColor)'
                            strokeWidth={2 * unit}
                            paintOrder='stroke'
                            textAnchor='middle'
                            fontSize={11 * unit}
                            fontWeight='bold'
                            pointerEvents='none'
                            aria-label={`Operation ${savedSeam.operationNumber}, seam ${savedSeam.ordinal} side ${savedSide}`}
                          >
                            {`${savedSeam.ordinal} ${savedSide}`}
                          </text>
                        ) : null}
                      </g>
                    );
                  })
                : null}
              <PatternImportDxfPhaseEDraftCadGridRulersV1 box={box} unit={unit} layer='rulers' />
            </>
          )}
        </SheetViewport>
      </div>

      <div
        role='status'
        aria-live='polite'
        data-cad-zero-connect-status={controller.session?.status ?? 'idle'}
        className='min-h-8 border-t border-borderColor px-2 py-1 text-micro text-labelColor'
      >
        {savedSeam ? <SavedSeamMeasurements seam={savedSeam} projection={projection} /> : null}
        {savedTopstitchError ? <p>{savedTopstitchError}</p> : null}
        {savedAnnotationBlocker ??
          status ??
          (selectsPieces
            ? `${layout.selectedPieceKeys.length} selected · click or drag to select; Shift toggles. Wheel zooms and double-click fits.`
            : activeTool === 'pan'
              ? 'Drag to pan. Wheel zooms at the pointer; double-click or use Fit to show all pieces.'
              : activeTool === 'move'
                ? `${layout.selectedPieceKeys.length} selected · drag a piece to move the selection.`
                : 'Choose two exact edges to create the first Assembly Order draft.')}
      </div>
    </section>
  );
}
