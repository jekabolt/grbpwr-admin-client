// A10 · AUTOPILOT (rule D5): the policy, its driver and the assumption record.
export { decide, RESIDUAL_ACCEPT_X } from './policy';
export type {
  AutopilotAction,
  AutopilotDecision,
  AutopilotSnapshot,
  AutopilotStop,
} from './policy';
export { autopilotRecord, autopilotTick, newAutopilotRun } from './run';
export type { AutopilotRun, TickOpts, TickResult } from './run';
export { fallbackGrain, angleDiff180 } from './grain';
export { deterministicCodes } from './names';
export { assumptionKey } from './types';
export type { Assumption, AssumptionKind } from './types';
