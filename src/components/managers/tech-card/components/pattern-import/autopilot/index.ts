// A10 · AUTOPILOT (rule D5): the policy (an N1 resolver), the probe's drive, the assumption record.
export { autopilotAnswer, autopilotResolver, decide, RESIDUAL_ACCEPT_X } from './policy';
export type {
  AutopilotAction,
  AutopilotAnswer,
  AutopilotDecision,
  AutopilotSnapshot,
  AutopilotStop,
} from './policy';
export { autopilotApply, gateBlocks, generatedReuse, hookDriveCtx, resolverFor } from './run';
export type { ApplyOutcome } from './run';
export { fallbackGrain, angleDiff180, longestStraight, principalAxis } from './grain';
export { deterministicCodes } from './names';
export { cardStrings, modelFromCard, sheetFromCard } from './card-match';
export type { CardPick } from './card-match';
export { assumptionKey, autopilotRecordOf, mergeAssumptions } from './types';
export type { Assumption, AssumptionKind } from './types';
export { priorOf, replayAnswer, replayDrive } from './replay';
export type { Prior, ReplayLog, ReplayMiss, ReplaySource } from './replay';
export { answerRecordOf, isReplayed, REPLAY_RULE } from './replay-record';
