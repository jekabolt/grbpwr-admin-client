// Вход проверки перезалива DXF (scripts/dxf-reupload-check.mjs): весь путь загрузки — тот же
// модуль, что зовёт панель выкроек (nesting/dxf-reupload.ts), плюс помощники меток и кандидатов.
export {
  RECONCILE_PARSE,
  REUPLOAD_SNAPSHOT_REASON,
  externalPieceRefs,
  inheritedCut,
  isForeignPlan,
  markJumpParams,
  planForeignReplacement,
  planOccupiedFiles,
  remapIssueNumbers,
  reuploadSheet,
  seamAnchorKeys,
  sheetRowId,
  uploadForeignSheet,
} from 'components/managers/tech-card/components/nesting/dxf-reupload';
export {
  DELETE_SNAPSHOT_REASON,
  planSheetDelete,
} from 'components/managers/tech-card/components/nesting/dxf-delete';
export {
  armDeleteSnapshot,
  armReuploadSnapshot,
  consumeReuploadSnapshot,
  peekReuploadSnapshot,
  provideSheetRestorer,
  restoreSheetVersion,
  swapSheetFile,
} from 'components/managers/tech-card/components/nesting/reupload-session';
export { applyDraft } from 'lib/pattern-import/fabrics/apply';
export {
  clearReview,
  firstMarkedOperation,
  ghostCandidates,
  ghostSwapBreaksAssembly,
  nextMarkedOperation,
  removeGhostFromStep,
  replaceGhost,
  reviewAfterEdit,
  shapesByPiece,
  shapesOfIdentity,
  unaliasedPieceKeys,
  unplacedPieceKeys,
} from 'lib/dxf-reconcile';
export { applyPlan, reconcile } from 'lib/dxf-reconcile';
export {
  pieceShapeReferences,
  proposePieceShapes,
  SHAPE_PROPOSAL_THRESHOLDS,
} from 'lib/dxf-reconcile';
export { markersBehindSheets } from 'components/managers/tech-card/components/nesting/marker-sheets';
export { sha256Hex } from 'lib/features/sha256';
export { bytesToLatin1, readInsunits } from 'lib/nesting/dxf/insunits';
export {
  autoPieceMatchRows,
  CREATE_PIECE_CHOICE,
  pieceMatchActionDisabled,
} from 'components/managers/tech-card/components/nesting/piece-match-auto';
export { planOldPieceOps } from 'components/managers/tech-card/components/nesting/old-pieces-ops';

export {
  IDENTICAL,
  MIRRORED,
  balanceProbeSeam,
  cardFromSheet,
  parseSheets,
  pieceKey,
  probeSeam,
  sweepOf,
} from './dxf-reconcile-probe-entry';
