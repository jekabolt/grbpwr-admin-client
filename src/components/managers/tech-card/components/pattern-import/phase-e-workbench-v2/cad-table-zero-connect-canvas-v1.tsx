import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { BoxMm, PtMm } from 'lib/pattern-import/types';
import { useEffect, useMemo, useState } from 'react';

import { SHEET_INK, SheetViewport, ptsAttr, vy } from '../sheet-viewport';
import {
  derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1,
  type PatternImportDxfPhaseECadTableConnectEdgeSegmentV1,
} from './cad-table-connect-edge-segments-v1';
import { PatternImportDxfPhaseECadTableConnectToolControlV1 } from './cad-table-connect-tool-control-v1';
import {
  compactPatternImportDxfPhaseECadTablePieceOffsetsV1,
  createPatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  fitPatternImportDxfPhaseECadTablePieceBoundsV1,
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
import { PatternImportDxfPhaseEDraftCadGridRulersV1 } from './draft-cad-grid-rulers-v1';
import { PatternImportDxfPhaseECadWorkbenchToolButtonV1 } from './cad-workbench-tool-button-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANVAS_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-connect-canvas/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANVAS_CLAIMS_V1 = Object.freeze({
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
  authoringAuthority?: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 | null;
  authoringAuthorityRefresh?: PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1 | null;
  zeroConnectAuthoringHandoff?: PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1;
  disabled?: boolean;
}>;

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
): PatternImportDxfPhaseECadTableZeroCanvasSessionV1 {
  return Object.freeze({
    ...session,
    layout: selectPatternImportDxfPhaseECadTablePiecesV1(
      session.layout,
      [pieceKey],
      toggle ? 'toggle' : 'replace',
    ),
  });
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
export function PatternImportDxfPhaseECadTableZeroConnectCanvasV1({
  catalog,
  projection,
  authoringAuthority = null,
  authoringAuthorityRefresh = null,
  zeroConnectAuthoringHandoff,
  disabled = false,
}: PatternImportDxfPhaseECadTableZeroConnectCanvasPropsV1) {
  const authority = useMemo(
    () => ({ catalog, projection, authoringAuthority, authoringAuthorityRefresh }) as const,
    [authoringAuthority, authoringAuthorityRefresh, catalog, projection],
  );
  const [tableSession, setTableSession] = useState(() =>
    createPatternImportDxfPhaseECadTableZeroCanvasSessionV1(projection),
  );
  const { layout, viewportBounds } = tableSession;
  const [activeTool, setActiveTool] = useState<'select' | 'pan' | 'move' | 'connect'>('select');
  const [fitRequest, setFitRequest] = useState(0);
  const [hoveredPieceKey, setHoveredPieceKey] = useState<string | null>(null);
  const [focusedPieceKey, setFocusedPieceKey] = useState<string | null>(null);
  const segments = useMemo(
    () =>
      derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1(projection).filter(
        ({ contourRole }) => contourRole !== 'hole',
      ),
    [projection],
  );
  const [controller, setController] = useState(() =>
    createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1(),
  );
  const sourceIdentity = `${catalog.canonicalSha256}|${catalog.sizeSelectionCanonicalSha256}|${projection.expectedCatalogCanonicalSha256}|${projection.sizeSelectionCanonicalSha256}|${projection.sourceFileId}|${projection.sizeToken}`;
  useEffect(() => {
    setController(createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1());
    setTableSession(createPatternImportDxfPhaseECadTableZeroCanvasSessionV1(projection));
    setActiveTool('select');
    setHoveredPieceKey(null);
    setFocusedPieceKey(null);
    setFitRequest((current) => current + 1);
  }, [projection, sourceIdentity]);
  const phase = patternImportDxfPhaseECadTableZeroConnectControllerPhaseV1(controller);
  const status = patternImportDxfPhaseECadTableZeroConnectControllerStatusV1(controller);
  const connectDisabled = disabled || zeroConnectAuthoringHandoff?.status === 'unavailable';
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
        <div
          className='absolute left-2 top-2 z-20 flex flex-col gap-0.5 border border-borderColor bg-bgColor p-0.5'
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
        </div>
        <SheetViewport
          bbox={viewportBounds}
          tool={activeTool === 'select' ? 'lasso' : activeTool === 'move' ? 'move' : 'pan'}
          fitRequest={fitRequest}
          className='min-h-0'
          onPick={(viewKey, modifiers) => {
            if (activeTool === 'select' || activeTool === 'move') {
              setTableSession((current) => ({
                ...current,
                layout: selectPatternImportDxfPhaseECadTablePiecesV1(
                  current.layout,
                  viewKey ? [viewKey] : [],
                  modifiers.shiftKey ? 'toggle' : 'replace',
                ),
              }));
              return;
            }
            if (!controller.session || controller.session.status === 'ready') return;
            const segment = segments.find((candidate) => candidate.viewKey === viewKey);
            if (segment) selectEdge(segment, modifiers.shiftKey ? 'reverse' : 'forward');
          }}
          onLasso={(points, modifiers) =>
            setTableSession((current) => ({
              ...current,
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
                const keyboardEnabled = activeTool === 'select' || activeTool === 'move';
                return (
                  <g
                    key={pieceLayout.identity.key}
                    data-key={pieceLayout.identity.key}
                    data-cad-zero-connect-piece={piece.pieceId}
                    data-cad-zero-connect-piece-line={piece.pieceLineKey}
                    data-cad-zero-connect-piece-selected={selected || undefined}
                    data-cad-zero-connect-piece-hovered={hovered || undefined}
                    data-cad-zero-connect-piece-focused={focused || undefined}
                    transform={`translate(${pieceLayout.offsetMm.x} ${vy(pieceLayout.offsetMm.y)})`}
                    role='button'
                    tabIndex={keyboardEnabled ? 0 : -1}
                    aria-disabled={!keyboardEnabled}
                    aria-pressed={selected}
                    aria-label={`${piece.pieceLineKey} pattern piece`}
                    aria-keyshortcuts='Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight'
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
                    <rect
                      x={pieceLayout.sourceBounds.minX}
                      y={vy(pieceLayout.sourceBounds.maxY)}
                      width={pieceLayout.sourceBounds.maxX - pieceLayout.sourceBounds.minX}
                      height={pieceLayout.sourceBounds.maxY - pieceLayout.sourceBounds.minY}
                      fill='transparent'
                      pointerEvents={
                        activeTool === 'select' || activeTool === 'move' ? 'all' : 'none'
                      }
                      onPointerEnter={() => setHoveredPieceKey(pieceLayout.identity.key)}
                      onPointerLeave={() => setHoveredPieceKey(null)}
                    />
                    {piece.contours.map((contour) => {
                      const points = contour.vertices.map(({ pointMm }) => pointMm);
                      const closed =
                        contour.closed && points.length > 0 ? [...points, points[0]] : points;
                      return (
                        <polyline
                          key={contour.contourId}
                          data-cad-zero-connect-contour={contour.contourId}
                          points={ptsAttr(closed)}
                          fill={
                            contour.closed
                              ? contour.role === 'hole'
                                ? 'var(--color-bgColor)'
                                : selected
                                  ? SHEET_INK.pick
                                  : SHEET_INK.fill
                              : 'none'
                          }
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
                          vectorEffect='non-scaling-stroke'
                          pointerEvents='none'
                        />
                      );
                    })}
                  </g>
                );
              })}
              {controller.session
                ? segments.map((segment) => {
                    const placed = pieceLayout(layout, segment);
                    if (!placed) return null;
                    const selectedSide = patternImportDxfPhaseECadTableZeroConnectSelectedSideV1(
                      controller,
                      segment,
                    );
                    const [from, to] = segment.pointsMm;
                    const canSelect = !connectDisabled && controller.session?.status !== 'ready';
                    return (
                      <g
                        key={segment.viewKey}
                        transform={`translate(${placed.offsetMm.x} ${vy(placed.offsetMm.y)})`}
                        data-cad-zero-connect-edge={segment.viewKey}
                        data-cad-zero-connect-side={
                          selectedSide === null ? undefined : selectedSide === 0 ? 'a' : 'b'
                        }
                      >
                        <line
                          x1={from.x}
                          y1={vy(from.y)}
                          x2={to.x}
                          y2={vy(to.y)}
                          stroke='currentColor'
                          strokeWidth={selectedSide === null ? 1 : 3}
                          strokeDasharray={selectedSide === 1 ? '6 3' : undefined}
                          opacity={selectedSide === null ? 0.18 : 1}
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
                          pointerEvents={canSelect ? 'stroke' : 'none'}
                          role='button'
                          tabIndex={canSelect ? 0 : -1}
                          aria-disabled={!canSelect}
                          aria-label={`Choose ${segment.pieceLineKey} edge ${segment.boundaryVertexIds.join(' → ')}; hold Shift for reverse`}
                          onKeyDown={(event) => {
                            if (!canSelect || (event.key !== 'Enter' && event.key !== ' ')) return;
                            event.preventDefault();
                            event.stopPropagation();
                            selectEdge(segment, event.shiftKey ? 'reverse' : 'forward');
                          }}
                        />
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
        {status ??
          (activeTool === 'select'
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
