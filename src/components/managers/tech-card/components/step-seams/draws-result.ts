import type { StepResult } from './step-result';

/** Cards without any owner row draw the same apart-piece result as the editor. */
export const ROWLESS_CARDS_FOLLOW_EDITOR = true;

/** One switch for every non-canvas view that may draw the shared sequential step result. */
export function drawsStepResult(
  results: readonly StepResult[] | null | undefined,
  index: number,
): boolean {
  return (
    !!results?.[index] && (ROWLESS_CARDS_FOLLOW_EDITOR || results.some((result) => result.owned))
  );
}
