// FALLBACK NAME OF A PATTERN SHEET — ONE CONSTANT, AND A COMPARISON THAT KNOWS ABOUT THE LEGACY ONE.
//
// The name is not a caption. It travels into `piece.source` inside the marker blob at capture
// time, and at rebuild time it is compared by STRICT equality to decide which file a block came
// from when two files carry blocks of the same name (`marker-rebuild.ts`). So the fallback used
// when a pattern row has neither `name` nor `filename` is a STORED VALUE: markers captured before
// this module carry the legacy Russian fallback in their blobs forever, and a plain rename of the
// literal would silently change the tie-break for exactly those markers.
//
// Hence: one constant for everything written from now on, one constant naming what old blobs
// hold, and `sameSheetName` for every comparison — which treats the two fallbacks as the same
// sheet, because they always were.
//
// This module is deliberately tiny and dependency-free. `marker-rebuild.ts` must not reach the
// constant through `dxf-by-scope.ts`: that one imports `bom-purpose.ts`, which drags in the
// generated proto types and the BOM row picker — weight the rebuild path (and the node probe that
// exercises it) documents that it does not carry. `dxf-by-scope.ts` re-exports these names, so
// importing them from there stays valid for callers that already depend on it.

/** Written into `piece.source` when a pattern row has no name of its own. */
export const FALLBACK_SHEET_NAME = 'pattern.dxf';

/** What the same fallback was called before the admin went English. Lives in old marker blobs. */
export const LEGACY_FALLBACK_SHEET_NAME = 'выкройка.dxf';

/**
 * Do two `piece.source` values name the same sheet? Plain equality, plus the one historical
 * equivalence: a legacy blob's fallback names the same nameless sheet as today's fallback.
 */
export function sameSheetName(a: string, b: string): boolean {
  if (a === b) return true;
  const isFallback = (n: string) => n === FALLBACK_SHEET_NAME || n === LEGACY_FALLBACK_SHEET_NAME;
  return isFallback(a) && isFallback(b);
}

/**
 * Имя листа для движка и для экспорта. Тройной фолбэк («имя» → «файл» → заглушка) существует
 * потому, что имя — это ещё и ключ провенанса в блобе маркера: пустая строка там читалась бы как
 * «источник неизвестен» у листа, у которого источник прекрасно известен.
 */
export function patternSheetName(row: { name?: string; filename?: string }): string {
  return row.name || row.filename || FALLBACK_SHEET_NAME;
}
