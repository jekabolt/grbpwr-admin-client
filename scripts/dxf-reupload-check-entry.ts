// Вход проверки перезалива DXF (scripts/dxf-reupload-check.mjs): весь путь загрузки — тот же
// модуль, что зовёт панель выкроек (nesting/dxf-reupload.ts), плюс помощники меток и кандидатов.
export {
  RECONCILE_PARSE,
  REUPLOAD_SNAPSHOT_REASON,
  externalPieceRefs,
  isForeignPlan,
  markJumpParams,
  remapIssueNumbers,
  reuploadSheet,
  seamAnchorKeys,
  sheetRowId,
} from 'components/managers/tech-card/components/nesting/dxf-reupload';
export {
  armReuploadSnapshot,
  consumeReuploadSnapshot,
  peekReuploadSnapshot,
  provideSheetRestorer,
  restoreSheetVersion,
} from 'components/managers/tech-card/components/nesting/reupload-session';
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
export { sha256Hex } from 'lib/features/sha256';
export { bytesToLatin1, readInsunits } from 'lib/nesting/dxf/insunits';

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
