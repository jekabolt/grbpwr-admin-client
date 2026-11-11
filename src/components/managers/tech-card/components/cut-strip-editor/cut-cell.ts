/**
 * Is a strip's cut cell for one size closed to typing? A binding strip's cut follows its seam, but a
 * size the pattern does not grade has no seam length, and without a typed cut it would never get a
 * norm (E5). The red «—» in the seam cell stays: the size is still missing from the pattern. A strip on
 * a rejected or stale seam has no seam length either, whatever `seamMm` the row still stores.
 */
export function cutCellLocked({
  readOnly,
  binding,
  mode,
  seamMm,
  seamGone = false,
}: {
  readOnly: boolean;
  binding: boolean;
  mode: string;
  seamMm: number | undefined;
  seamGone?: boolean;
}): boolean {
  if (readOnly || mode === 'one_length') return true;
  return binding && !seamGone && seamMm != null;
}
