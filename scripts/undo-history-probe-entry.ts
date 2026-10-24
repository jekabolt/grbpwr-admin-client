export {
  UNDO_HISTORY_BYTE_LIMIT,
  UNDO_HISTORY_LIMIT,
  applyHistoryPatches,
  diffHistoryValues,
  emptyUndoHistory,
  historyBarrier,
  historyArrayIdentityChanged,
  recordUndoPatches,
  recordUndoStep,
  redoHistoryStep,
  undoHistoryStep,
} from '../src/components/managers/tech-card/components/undo-history-core';
export { restoredLabel } from '../src/components/managers/tech-card/components/version-history';
