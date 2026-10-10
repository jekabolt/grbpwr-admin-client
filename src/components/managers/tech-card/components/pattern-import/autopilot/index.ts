// A10 · AUTOPILOT (rule D5): the policy (an N1 resolver), the probe's drive, the assumption record.
export { autopilotAnswer, autopilotResolver, decide, RESIDUAL_ACCEPT_X } from './policy';
export type {
  AutopilotAction,
  AutopilotAnswer,
  AutopilotDecision,
  AutopilotSnapshot,
  AutopilotStop,
} from './policy';
export { autopilotTick, newAutopilotRun } from './run';
export type { AutopilotRun, TickOpts, TickResult } from './run';
export { fallbackGrain, angleDiff180, longestStraight, principalAxis } from './grain';
export { deterministicCodes } from './names';
export { assumptionKey, autopilotRecordOf, mergeAssumptions } from './types';
export type { Assumption, AssumptionKind } from './types';
