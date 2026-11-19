import type { common_TechCardPiece } from 'api/proto-http/admin';
import { Fragment, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Button, Input } from 'ui';
import type { GuardedSavedPieceRename } from '../../guarded-piece-rename';
import { cutSymmetryBadge, grainlineText } from '../../piece-codes';
import { normalizeTechCardPieceRename } from 'utils/pattern';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { areaOf, perimeter } from 'lib/pattern-import/semantics/geom';

import {
  PatternImportDxfPhaseECadWorkbenchObjectSidebarV1,
  type PatternImportDxfPhaseECadWorkbenchObjectSidebarPropsV1,
} from './cad-workbench-object-sidebar-v1';
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
    savedBoundary: null,
    layout: selectPatternImportDxfPhaseECadTablePiecesV1(
      current.layout,
      selectAll ? current.layout.pieces.map(({ identity }) => identity.key) : [],
      'replace',
    ),
  }));
}

type SavedPieceMetadata = Readonly<
  Pick<
    common_TechCardPiece,
    'lineKey' | 'name' | 'piecesPerGarment' | 'grainline' | 'cutSymmetry' | 'note'
  >
>;

type RenamePiece = Readonly<{
  row: GuardedSavedPieceRename['row'];
  save: (intent: GuardedSavedPieceRename) => Promise<void>;
}>;

function SavedPieceNameEditor({
  intent,
  save,
}: Readonly<{
  intent: Omit<GuardedSavedPieceRename, 'nextName'>;
  save: RenamePiece['save'];
}>) {
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (name === null) {
    return (
      <Button
        variant='underline'
        size='xs'
        type='button'
        onClick={() => setName(intent.expectedName)}
      >
        Rename piece
      </Button>
    );
  }
  const nextName = normalizeTechCardPieceRename(name);
  return (
    <div className='space-y-1'>
      <label className='block'>
        Piece name
        <Input
          disabled={busy}
          value={name}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </label>
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='underline'
          size='xs'
          type='button'
          disabled={busy || !nextName || nextName === intent.expectedName}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await save({ ...intent, nextName });
              setName(null);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'The rename was refused.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving…' : 'Save name'}
        </Button>
        <Button
          variant='underline'
          size='xs'
          type='button'
          disabled={busy}
          onClick={() => {
            setName(null);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {error ? <p role='alert'>{error}</p> : null}
    </div>
  );
}

export function CadTablePieceSelection({
  owner,
  projection,
  features,
  savedPieces,
  renamePiece,
  operationIssueCount,
  seams,
  onFocusSeam,
}: Readonly<{
  owner: CadTableZeroCanvasOwner;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  features?: CadTablePieceFeaturesByKey;
  savedPieces?: readonly SavedPieceMetadata[];
  renamePiece?: RenamePiece;
  operationIssueCount?: number;
}> &
  Pick<PatternImportDxfPhaseECadWorkbenchObjectSidebarPropsV1, 'seams' | 'onFocusSeam'>) {
  const { selectedPieceKeys } = owner.session.layout;
  const unit = usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1()?.unit ?? 'mm';
  const savedMetadata = new Map<string, SavedPieceMetadata | null>();
  for (const metadata of savedPieces ?? []) {
    if (!metadata.lineKey) continue;
    savedMetadata.set(metadata.lineKey, savedMetadata.has(metadata.lineKey) ? null : metadata);
  }
  const rows = projection.pieces.map((piece) => {
    const objectKey = patternImportDxfPhaseECadTablePieceKeyV1(piece.pieceId, piece.pieceLineKey);
    const feature = features?.get(objectKey);
    const metadata = savedMetadata.get(piece.pieceLineKey);
    const savedName = metadata?.name?.trim() ? metadata.name : null;
    const quantity = metadata?.piecesPerGarment ?? feature?.quantity;
    return {
      piece,
      objectKey,
      pieceId: piece.pieceId,
      metadata,
      feature,
      savedName,
      label: savedName || feature?.pieceLabel || piece.pieceId,
      material: feature?.materialLabel,
      quantity,
      statusLabel: quantity == null ? '—' : undefined,
    };
  });
  const active =
    selectedPieceKeys.length === 1
      ? rows.find(({ objectKey }) => objectKey === selectedPieceKeys[0])
      : undefined;
  const renameLineKey = active?.piece.pieceLineKey;
  const grainAngle = active?.feature?.grain?.angleDeg;
  const grainDirection = grainlineText(active?.metadata?.grainline);
  const symmetry = active?.metadata
    ? cutSymmetryBadge(active.metadata.cutSymmetry, active.quantity)
    : null;

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

  const details: readonly (readonly [string, string | number | null | undefined])[] = [
    ['Material', active?.material],
    ['Cut quantity', active?.quantity],
    [
      'Grain angle',
      typeof grainAngle === 'number' && Number.isFinite(grainAngle)
        ? `${grainAngle.toFixed(1)}°`
        : null,
    ],
    ['Grain direction', grainDirection],
    ['Cut symmetry', symmetry?.label],
    [
      measurements?.sewingOnly ? 'Sewing area' : 'Area',
      measurements && formatPatternImportDxfPhaseEMeasurementAreaV1(measurements.areaMm2, unit),
    ],
    [
      measurements?.sewingOnly ? 'Sewing perimeter' : 'Perimeter',
      measurements &&
        formatPatternImportDxfPhaseEMeasurementValueV1(measurements.perimeterMm, unit).formatted,
    ],
  ];
  const note = active?.metadata?.note?.trim();

  return (
    <PatternImportDxfPhaseECadWorkbenchObjectSidebarV1
      pieces={rows}
      seams={seams}
      onFocusSeam={onFocusSeam}
      selectedPieceIds={selectedPieceKeys}
      issueCount={operationIssueCount}
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
            {renamePiece && renameLineKey && active.savedName ? (
              <SavedPieceNameEditor
                key={`${renamePiece.row.cardLockVersion}:${renamePiece.row.revision}:${renameLineKey}`}
                intent={{
                  row: renamePiece.row,
                  pieceLineKey: renameLineKey,
                  expectedName: active.savedName,
                }}
                save={renamePiece.save}
              />
            ) : null}
            <dl className='grid grid-cols-[1fr_auto] gap-x-2 tabular-nums'>
              {details.map(([label, value]) =>
                value == null || value === '' ? null : (
                  <Fragment key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ),
              )}
            </dl>
            {note && <p className='whitespace-pre-wrap text-labelColor'>{note}</p>}
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
