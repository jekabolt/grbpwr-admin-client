import { isBindingOperation, type BindingOperation } from './binding-step';
import { isTopstitchStep, type OperationKindStep } from './operation-kinds';

type Step = OperationKindStep & BindingOperation;

/**
 * Which owned rows a kind change must take with it. The work picker, the plain selects (operation,
 * machine, topstitch mode, seam class) and the ratify panel all ask this one question, so a step
 * that stops being B1 or A2 never keeps hidden strips or lines that still count in the norm.
 */
export function stepKindFlip(prev: Step, next: Step): { binding: boolean; topstitch: boolean } {
  return {
    binding: isBindingOperation(prev) && !isBindingOperation(next),
    topstitch: isTopstitchStep(prev) && !isTopstitchStep(next),
  };
}
