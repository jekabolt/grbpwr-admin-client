import { isBindingOperation, type BindingOperation } from './binding-step';
import { isTopstitchStep, type OperationKindStep } from './operation-kinds';
import { operationHasSeam } from './operation-options';

type Step = OperationKindStep & BindingOperation;

/**
 * Verbs that sew. A step's own seam class outlives a kind change (no writer clears it, and a press
 * step does not even show it), so once the verb itself changes the class says nothing: a machine
 * step with «SS» that becomes pressing has stopped sewing (Р3, card 145 step 370).
 */
const SEWING_TYPES: ReadonlySet<string> = new Set([
  'TECH_CARD_OPERATION_TYPE_MACHINE',
  'TECH_CARD_OPERATION_TYPE_HANDWORK',
  'TECH_CARD_OPERATION_TYPE_LOCKSTITCH',
  'TECH_CARD_OPERATION_TYPE_OVERLOCK',
  'TECH_CARD_OPERATION_TYPE_COVERSTITCH',
  'TECH_CARD_OPERATION_TYPE_CHAINSTITCH',
  'TECH_CARD_OPERATION_TYPE_DOUBLE_NEEDLE',
  'TECH_CARD_OPERATION_TYPE_BLINDHEM',
  'TECH_CARD_OPERATION_TYPE_BARTACK',
]);

const stillSews = (prev: Step, next: Step): boolean =>
  (prev.operationType === next.operationType || SEWING_TYPES.has(next.operationType ?? '')) &&
  operationHasSeam(next.operationType, next.seamClass);

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
    seams: operationHasSeam(prev.operationType, prev.seamClass) && !stillSews(prev, next),
  };
}
