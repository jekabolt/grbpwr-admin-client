import type { StepLayout } from './step-picture';
import type { StepResult } from './step-result';
import type { FormOpLike } from './step-seams-model';

export type SurfacePicture = {
  layout: StepLayout;
  /** Bottom to top. */
  layers: readonly string[];
};

/** The one authoritative picture of an operation, shared by every step surface. */
export function stepPictureOf(
  results: readonly StepResult[] | null | undefined,
  index: number,
): SurfacePicture | null {
  const result = results?.[index];
  return result ? { layout: result.layout, layers: result.layers } : null;
}

/** The latest authoritative picture produced for a unit before its consumer. */
export function unitPictureOf(
  results: readonly StepResult[] | null | undefined,
  ops: readonly FormOpLike[],
  unitKey: string,
  beforeIndex?: number,
): SurfacePicture | null {
  const key = unitKey.trim();
  if (!key) return null;
  const end = beforeIndex == null ? ops.length : Math.max(0, Math.min(beforeIndex, ops.length));
  for (let index = end - 1; index >= 0; index--) {
    if ((ops[index]?.outputUnitKey ?? '').trim() !== key) continue;
    return stepPictureOf(results, index);
  }
  return null;
}
