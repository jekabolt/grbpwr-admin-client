import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
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
  const layout = useMemo(() => layoutFor(projection), [projection]);
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
  useEffect(
    () => setController(createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1()),
    [sourceIdentity],
  );

  const bounds = fitPatternImportDxfPhaseECadTablePieceBoundsV1(layout, 20) ?? {
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
  };
  const phase = patternImportDxfPhaseECadTableZeroConnectControllerPhaseV1(controller);
  const status = patternImportDxfPhaseECadTableZeroConnectControllerStatusV1(controller);
  const selectEdge = (
    segment: PatternImportDxfPhaseECadTableConnectEdgeSegmentV1,
    direction: 'forward' | 'reverse',
  ) => {
    if (disabled) return;
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
      className='grid min-h-[30rem] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-bgColor'
    >
      <div className='flex min-h-11 items-center border-b border-borderColor px-1'>
        <PatternImportDxfPhaseECadTableConnectToolControlV1
          phase={phase}
          disabled={disabled}
          onStart={() =>
            setController((current) =>
              startPatternImportDxfPhaseECadTableZeroConnectControllerV1(current, authority),
            )
          }
          onCancel={() =>
            setController((current) =>
              cancelPatternImportDxfPhaseECadTableZeroConnectControllerV1(current),
            )
          }
        />
      </div>

      <div className='relative min-h-0 overflow-hidden'>
        <SheetViewport
          bbox={bounds}
          tool='pan'
          className='min-h-0'
          onPick={(viewKey, modifiers) => {
            if (!controller.session || controller.session.status === 'ready') return;
            const segment = segments.find((candidate) => candidate.viewKey === viewKey);
            if (segment) selectEdge(segment, modifiers.shiftKey ? 'reverse' : 'forward');
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
                return (
                  <g
                    key={pieceLayout.identity.key}
                    data-cad-zero-connect-piece={piece.pieceId}
                    data-cad-zero-connect-piece-line={piece.pieceLineKey}
                    transform={`translate(${pieceLayout.offsetMm.x} ${vy(pieceLayout.offsetMm.y)})`}
                  >
                    {piece.contours.map((contour) => {
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
                            contour.role === 'sewing-boundary' ? SHEET_INK.ink : SHEET_INK.mut
                          }
                          strokeWidth={1.1}
                          strokeDasharray={
                            contour.role === 'cut-boundary' ? `${unit * 6} ${unit * 3}` : undefined
                          }
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
                    const canSelect = !disabled && controller.session?.status !== 'ready';
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
        {status ?? 'Connect two exact edges to create the first Assembly Order draft.'}
      </div>
    </section>
  );
}
