import { isBindingOperation, type BindingOperation } from './binding-step';
import { isTopstitchStep, type OperationKindStep } from './operation-kinds';
import { operationHasSeam } from './operation-options';

type Step = OperationKindStep & BindingOperation;

/**
 * Which owned rows a kind change must take with it. The work picker, the plain selects (operation,
 * machine, topstitch mode, seam class) and the ratify panel all ask this one question, so a step
 * that stops being B1 or A2 never keeps hidden strips or lines that still count in the norm, and a
 * step that stops sewing (Р3: it became pressing, fusing, a button) lets go of its seams unasked.
 */
export function stepKindFlip(
  prev: Step,
  next: Step,
): { binding: boolean; topstitch: boolean; seams: boolean } {
  return {
    binding: isBindingOperation(prev) && !isBindingOperation(next),
    topstitch: isTopstitchStep(prev) && !isTopstitchStep(next),
    seams:
      operationHasSeam(prev.operationType, prev.seamClass) &&
      !operationHasSeam(next.operationType, next.seamClass),
  };
}
