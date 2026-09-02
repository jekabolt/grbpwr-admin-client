/**
 * THE GENERATIVE ORGANS OF THE DESIGN BAND.
 *
 * Every part is exported on its own so the composer can arrange them; `GenerationStudio` is the
 * prototype's own arrangement of the three that have an assembly rule between them.
 */
export { EmptyStudio } from './empty-studio';
export { FixContext, FixContextProvider, useFixContext, type FixTarget } from './fix-context';
export { GenerationForm, hasAnyPictures, hasFlatRun } from './generation-form';
export { GenerationHistory } from './generation-history';
export { RunPanel } from './run-panel';
export { SlotPicker } from './slot-picker';
export { GenerationStudio } from './studio';

export { formatMoney, decimalToNumber } from './money';
export {
  archiveBlockReason,
  expectedTileCount,
  fixTargetOf,
  hasLiveRun,
  isCancelling,
  isRunLive,
  liveRuns,
  runCaption,
  runOutcomeNote,
  runStatus,
  viewsLine,
} from './run-state';
export {
  useElapsed,
  useGenerationWrites,
  useMoreHistory,
  useRunPolling,
  useStartRun,
  type StartRunInput,
  type StartRunState,
} from './use-generation';
export { Thumb, thumbUrl } from './thumb';
