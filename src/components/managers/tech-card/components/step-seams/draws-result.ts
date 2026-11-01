import type { StepResult } from './step-result';

/** Cards without any owner row: owner 01.11 wants them apart like the editor; on once their tests follow. */
export const ROWLESS_CARDS_FOLLOW_EDITOR = false;

/** One switch for every non-canvas view that may draw the shared sequential step result. */
export function drawsStepResult(
  results: readonly StepResult[] | null | undefined,
  index: number,
): boolean {
  return (
    !!results?.[index] && (ROWLESS_CARDS_FOLLOW_EDITOR || results.some((result) => result.owned))
  );
}
