import type { common_TechCard } from 'api/proto-http/admin';
import { isGenerated } from 'lib/fusing-dxf/generated-pattern';
import type {
  MeasurementSurfaceAcceptedClothPieceV1,
  MeasurementSurfaceAcceptedClothV1,
} from 'components/shared/measurement-watertight-surface-v1-stage';
import type { DxfProductPhaseDReplayCarrierV1 } from 'lib/pattern-import/dxf-product-phase-d-replay-v1';
import type { CadWorkbenchSavedReviewSizeV1 } from './cad-workbench-physical-host-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1 } from './cad-table-zero-operation-saved-preparation-v1';
import { sameSavedDraftRowV1 } from './draft-cad-saved-source-selection-v1';
import { assertExactZeroOperationSavedPatternRowV1 } from './zero-operation-saved-card-authority-v1';

type Cloth = MeasurementSurfaceAcceptedClothV1;
type Hit = MeasurementSurfaceAcceptedClothPieceV1;

export function isCurrentCadTableClothHitV1(
  frame: Cloth,
  current: Cloth | undefined,
  hit: Hit,
): boolean {
  return (
    current !== undefined &&
    frame.frameNumber === current.frameNumber &&
    frame.positionsM === current.positionsM &&
    frame.ranges === current.ranges &&
    frame.isCurrent === current.isCurrent &&
    current.isCurrent() &&
    current.ranges.filter(({ sourcePiece }) => sourcePiece === hit).length === 1
  );
}

export function resolveCadTableClothFocusScopeV1(input: {
  card: common_TechCard | null;
  choices: PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1;
  review: CadWorkbenchSavedReviewSizeV1;
  hit: Hit;
}): string | null {
  const { card, choices, review, hit } = input;
  if (
    !card ||
    !choices.ok ||
    choices.techCardId !== card.id ||
    review.row.techCardId !== hit.row.techCardId ||
    review.row.cardLockVersion !== hit.row.cardLockVersion ||
    review.sizeToken !== hit.sizeToken
  )
    return null;
  const scopes = choices.choices.filter(({ scopeKey }) => scopeKey === hit.row.scopeKey);
  if (
    scopes.length !== 1 ||
    scopes[0].sizes.filter(
      ({ sizeId, sizeToken }) => sizeId === review.sizeId && sizeToken === hit.sizeToken,
    ).length !== 1
  )
    return null;
  if (
    card.techCard?.patterns?.some(
      (pattern) => pattern.lineKey === hit.row.patternLineKey && isGenerated(pattern),
    )
  )
    return null;
  try {
    assertExactZeroOperationSavedPatternRowV1(card, hit.row);
    return hit.row.scopeKey;
  } catch {
    return null;
  }
}

/** Match the prepared table's original cut occurrence, using its saved native lineage. */
export function matchesCadTableClothFocusInstanceV1(
  row: Hit['row'],
  carrier: DxfProductPhaseDReplayCarrierV1 | null | undefined,
  hit: Hit,
): boolean {
  if (!carrier || !sameSavedDraftRowV1(row, hit.row) || carrier.sourceSha256 !== hit.row.sha256)
    return false;
  const contours = carrier.contours.filter(
    ({ pieceId, role, sizeToken }) =>
      pieceId === hit.pieceId && role === 'cut-boundary' && sizeToken === hit.sizeToken,
  );
  const [cut] = contours;
  if (contours.length !== 1 || !cut.closed || cut.lineage.sourcePathIds.length !== 1) return false;
  const paths = carrier.source.paths.filter(
    ({ pathId }) => pathId === cut.lineage.sourcePathIds[0],
  );
  const [path] = paths;
  return (
    paths.length === 1 &&
    path.closed &&
    path.provenance.instancePath.length === hit.sourceInstancePath.length &&
    path.provenance.instancePath.every((part, index) => part === hit.sourceInstancePath[index])
  );
}
