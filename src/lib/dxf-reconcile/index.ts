// Сверка перезалитого DXF с карточкой: reconcile → план, applyPlan → новые строки формы.
export { reconcile } from './diff';
export { applyPlan } from './rewrite';
export { REVIEW_RANK, THRESH } from './defaults';
export {
  clearReview,
  ghostCandidates,
  ghostSwapBreaksAssembly,
  removeGhostFromStep,
  replaceGhost,
  shapesByPiece,
  shapesOfIdentity,
} from './candidates';
export type { GhostCandidate, GhostQuery, ShapedPiece } from './candidates';
export {
  firstMarkedOperation,
  nextMarkedOperation,
  reviewAfterEdit,
  unaliasedPieceKeys,
  unplacedPieceKeys,
} from './marks';
export { removeSheetCascade } from './cascade';
export { pieceShapeReferences, proposePieceShapes, SHAPE_PROPOSAL_THRESHOLDS } from './piece-shape';
export type { PieceShapeProposal, PieceShapeReference } from './piece-shape';
export type {
  CascadeBlock,
  CascadeInput,
  CascadeIssue,
  CascadeRef,
  CascadeResult,
  CascadeSeam,
  CascadeSheet,
} from './cascade';
export type * from './types';
