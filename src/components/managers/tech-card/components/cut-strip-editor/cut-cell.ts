/**
 * Is a strip's cut cell for one size closed to typing? A binding strip's cut follows its seam, but a
 * size the pattern does not grade has no seam length, and without a typed cut it would never get a
 * norm (E5). The red «—» in the seam cell stays: the size is still missing from the pattern.
 */
export function cutCellLocked({
  readOnly,
  binding,
  mode,
  seamMm,
}: {
  readOnly: boolean;
  binding: boolean;
  mode: string;
  seamMm: number | undefined;
}): boolean {
  if (readOnly || mode === 'one_length') return true;
  return binding && seamMm != null;
}
