/**
 * THE GENERATIVE ORGANS OF THE DESIGN BAND.
 *
 * Every part is exported on its own so the composer can arrange them; `Workbench` is the
 * one block of the last run and the generation history (T30).
 */
export { EmptyStudio } from './empty-studio';
export { FixContext, FixContextProvider, useFixContext, type FixTarget } from './fix-context';
export { hasAnyPictures } from './generation-form';
export { GenerationHistory } from './generation-history';
export { LatestGeneration } from './latest-generation';
export { RunPanel } from './run-panel';
export { useSlotMenu } from './slot-picker';
export { Workbench } from './studio';

export { formatMoney, decimalToNumber } from './money';
export {
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
