import type { KeyboardEvent } from 'react';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { areaOf, perimeter } from 'lib/pattern-import/semantics/geom';

import { PatternImportDxfPhaseECadWorkbenchObjectSidebarV1 } from './cad-workbench-object-sidebar-v1';
import { usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1 } from './cad-workbench-split-shell-v1';
import {
  formatPatternImportDxfPhaseEMeasurementAreaV1,
  formatPatternImportDxfPhaseEMeasurementValueV1,
} from './measurement-units-v1';
import {
  patternImportDxfPhaseECadTablePieceKeyV1,
  selectPatternImportDxfPhaseECadTablePiecesV1,
} from './cad-table-piece-layout-session-v1';
import type { CadTablePieceFeaturesByKey } from './cad-table-piece-features-v1';
import {
  activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1,
  type CadTableZeroCanvasOwner,
} from './cad-table-zero-connect-canvas-v1';

export function handleCadTablePieceSelectionKey(
  event: KeyboardEvent<HTMLElement>,
  owner: CadTableZeroCanvasOwner,
) {
  if (event.defaultPrevented) return;
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest('input,textarea,select,[contenteditable],[role="textbox"]')
  )
    return;
  const selectAll = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a';
  if (!selectAll && (event.key !== 'Escape' || !owner.session.layout.selectedPieceKeys.length))
    return;
  event.preventDefault();
  owner.update((current) => ({
    ...current,
    savedSeamSide: null,
    layout: selectPatternImportDxfPhaseECadTablePiecesV1(
      current.layout,
      selectAll ? current.layout.pieces.map(({ identity }) => identity.key) : [],
      'replace',
    ),
  }));
}

export function CadTablePieceSelectionPanel({
  owner,
  projection,
  features,
}: Readonly<{
  owner: CadTableZeroCanvasOwner;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  features?: CadTablePieceFeaturesByKey;
}>) {
  const { selectedPieceKeys } = owner.session.layout;
  const unit = usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1()?.unit ?? 'mm';
  const rows = projection.pieces.map((piece) => {
    const objectKey = patternImportDxfPhaseECadTablePieceKeyV1(piece.pieceId, piece.pieceLineKey);
    const feature = features?.get(objectKey);
    return {
      piece,
      objectKey,
      pieceId: piece.pieceId,
      label: feature?.pieceLabel || piece.pieceId,
      material: feature?.materialLabel,
      quantity: feature?.quantity,
      statusLabel: feature?.quantity == null ? '—' : undefined,
    };
  });
  const active =
    selectedPieceKeys.length === 1
      ? rows.find(({ objectKey }) => objectKey === selectedPieceKeys[0])
      : undefined;

  let measurements: { areaMm2: number; perimeterMm: number; sewingOnly: boolean } | null = null;
  if (active) {
    const closed = active.piece.contours.filter(
      ({ closed, vertices }) => closed && vertices.length >= 3,
    );
    const outer = closed.some(({ role }) => role === 'cut-boundary')
      ? 'cut-boundary'
      : 'sewing-boundary';
    const contours = closed.filter(({ role }) => role === outer || role === 'hole');
    if (contours.length) {
      let areaMm2 = 0;
      let perimeterMm = 0;
      for (const { role, vertices } of contours) {
        const points = vertices.map(({ pointMm }) => pointMm);
        areaMm2 += (role === 'hole' ? -1 : 1) * areaOf(points);
        perimeterMm += perimeter(points);
      }
      if (areaMm2 > 0)
        measurements = { areaMm2, perimeterMm, sewingOnly: outer === 'sewing-boundary' };
    }
  }

  return (
    <PatternImportDxfPhaseECadWorkbenchObjectSidebarV1
      pieces={rows}
      selectedPieceIds={selectedPieceKeys}
      onFocusPiece={(key, { toggle }) =>
        owner.update((current) =>
          activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1(current, key, toggle),
        )
      }
      selectionDetails={
        active ? (
          <section
            className='shrink-0 space-y-1 border-t border-borderColor p-2 text-micro'
            aria-label='Piece inspector'
            data-cad-selected-piece-inspector={active.objectKey}
          >
            <p className='font-bold'>{active.label}</p>
            {active.material ? <p className='text-labelColor'>{active.material}</p> : null}
            {measurements ? (
              <dl className='grid grid-cols-[1fr_auto] gap-x-2 tabular-nums'>
                <dt>{measurements.sewingOnly ? 'Sewing area' : 'Area'}</dt>
                <dd>{formatPatternImportDxfPhaseEMeasurementAreaV1(measurements.areaMm2, unit)}</dd>
                <dt>{measurements.sewingOnly ? 'Sewing perimeter' : 'Perimeter'}</dt>
                <dd>
                  {
                    formatPatternImportDxfPhaseEMeasurementValueV1(measurements.perimeterMm, unit)
                      .formatted
                  }
                </dd>
              </dl>
            ) : null}
          </section>
        ) : selectedPieceKeys.length > 1 ? (
          <p className='shrink-0 border-t border-borderColor p-2 text-micro' aria-live='polite'>
            {selectedPieceKeys.length} pieces selected
          </p>
        ) : null
      }
    />
  );
}
