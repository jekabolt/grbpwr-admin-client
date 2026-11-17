import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { Button } from 'ui';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_DXF_STAGING_V1 =
  'pattern-import-dxf-phase-e-cad-mannequin-dxf-staging/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_DXF_STAGING_CLAIMS_V1 = Object.freeze({
  exactPreparedProjectionOnly: true,
  allPresentedPreparedPiecesRendered: true,
  deterministicSideStaging: true,
  selectionCallerOwned: true,
  activeMaterialScopeCallerOwned: true,
  activeMaterialScopeVisuallyDistinct: true,
  tableLayoutStateMutated: false,
  createsGeometryOwner: false,
  createsClothSolver: false,
  sewnPreviewAuthorityClaimed: false,
} as const);

export type PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 = Readonly<{
  scopeKey: string;
  label: string;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
}>;

export type PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 = Readonly<{
  scopeKey?: string | null;
  pieceId?: string | null;
  pieceLineKey?: string | null;
  seamId?: string | null;
}>;

type StagedPiece = Readonly<{
  key: string;
  scopeKey: string;
  scopeLabel: string;
  piece: PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number];
}>;

export function buildPatternImportDxfPhaseECadMannequinDxfStagingItemsV1(
  sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[],
): readonly StagedPiece[] {
  return Object.freeze(
    sources.flatMap((source) =>
      source.projection.pieces.map((piece) =>
        Object.freeze({
          key: `${source.scopeKey}:${piece.pieceId}:${piece.pieceLineKey}`,
          scopeKey: source.scopeKey,
          scopeLabel: source.label,
          piece,
        }),
      ),
    ),
  );
}

function PieceSilhouette({ item, active }: Readonly<{ item: StagedPiece; active: boolean }>) {
  const { piece } = item;
  const camera = piece.cameraMm;
  const width = Math.max(camera.maxX - camera.minX, 1);
  const height = Math.max(camera.maxY - camera.minY, 1);
  return (
    <svg
      viewBox={`${camera.minX} ${camera.minY} ${width} ${height}`}
      preserveAspectRatio='xMidYMid meet'
      className='h-14 w-full'
      aria-hidden
    >
      {piece.contours.map((contour) => (
        <polyline
          key={contour.contourId}
          points={contour.vertices.map(({ pointMm }) => `${pointMm.x},${pointMm.y}`).join(' ')}
          fill='none'
          stroke='currentColor'
          strokeWidth={active ? 2 : 1}
          vectorEffect='non-scaling-stroke'
          opacity={contour.role === 'hole' ? 0.45 : 1}
        />
      ))}
    </svg>
  );
}

export function PatternImportDxfPhaseECadMannequinDxfStagingV1({
  sources,
  activeScopeKey = null,
  selection = null,
  disabled = false,
  onFocus,
}: Readonly<{
  sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
  activeScopeKey?: string | null;
  selection?: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null;
  disabled?: boolean;
  onFocus?: (selection: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1) => void;
}>) {
  const items = buildPatternImportDxfPhaseECadMannequinDxfStagingItemsV1(sources);
  const left = items.filter((_, index) => index % 2 === 0);
  const right = items.filter((_, index) => index % 2 === 1);
  const rail = (side: 'left' | 'right', rows: readonly StagedPiece[]) => (
    <ol
      className={`pointer-events-auto absolute top-2 bottom-2 flex w-24 flex-col gap-1 overflow-y-auto ${
        side === 'left' ? 'left-2' : 'right-2'
      }`}
      data-cad-mannequin-dxf-rail={side}
    >
      {rows.map((item) => {
        const activeScope = activeScopeKey === item.scopeKey;
        const selectedScope = selection?.scopeKey || activeScopeKey;
        const active =
          selection?.pieceId === item.piece.pieceId &&
          (!selectedScope || selectedScope === item.scopeKey) &&
          (selection.pieceLineKey == null || selection.pieceLineKey === item.piece.pieceLineKey);
        return (
          <li key={item.key}>
            <Button
              type='button'
              variant={null}
              className={`w-full border p-1 text-left text-micro ${
                active
                  ? 'border-textColor bg-bgColor text-textColor'
                  : activeScope
                    ? 'border-textColor/50 bg-pageBg text-textColor'
                    : 'border-borderColor bg-bgColor/90 text-labelColor opacity-75'
              }`}
              disabled={disabled}
              aria-pressed={active}
              aria-label={`Focus ${item.piece.pieceLineKey}`}
              data-cad-mannequin-staged-piece={item.piece.pieceId}
              data-cad-mannequin-staged-scope={item.scopeKey}
              data-cad-mannequin-active-scope={activeScope || undefined}
              onClick={() =>
                onFocus?.({
                  scopeKey: item.scopeKey,
                  pieceId: item.piece.pieceId,
                  pieceLineKey: item.piece.pieceLineKey,
                  seamId: active ? selection?.seamId ?? null : null,
                })
              }
            >
              <PieceSilhouette item={item} active={active} />
              <span className='block truncate font-bold'>{item.piece.pieceLineKey}</span>
              {sources.length > 1 ? (
                <span className='block truncate text-nano opacity-70'>{item.scopeLabel}</span>
              ) : null}
            </Button>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div
      className='pointer-events-none absolute inset-0 z-10'
      data-cad-mannequin-dxf-staging=''
      data-cad-mannequin-dxf-piece-count={items.length}
      data-cad-mannequin-dxf-active-piece={selection?.pieceId ?? undefined}
      data-cad-mannequin-dxf-active-seam={selection?.seamId ?? undefined}
      data-cad-mannequin-dxf-active-scope={activeScopeKey ?? undefined}
      aria-label='DXF pieces staged around mannequin'
    >
      {rail('left', left)}
      {rail('right', right)}
    </div>
  );
}
