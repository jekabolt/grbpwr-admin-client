// DXF WARNING TEXTS — PRODUCED AND MATCHED IN ONE PLACE.
//
// A warning used to be assembled ad hoc at every producer and recognised by a hand-written
// `w.includes('…')` at every consumer. That coupling is invisible to both sides: reword a
// producer and every matcher stops matching, silently, with no type error and no failing test.
// So the rule is structural — producers build their strings from the constants below, matchers
// call the predicate below, and nothing else compares warning text.
//
// WHAT THE PREDICATE ANSWERS. `isFetchFailure` answers exactly one question: did a pattern sheet
// fail to DOWNLOAD? That question is expensive to answer, which is why it is worth centralising:
// `nesting-modal` BLOCKS saving the marker on it (a partially fetched pack nests as a SUBSET —
// placed == total still holds, because the missing pieces never parsed, and the marker would read
// as a clean complete norm), and `dxf-recheck` hides the per-piece consumption table on it (the
// table would be built from the sheets that did download — the previous revision, say — and a
// per-piece area is a lie no eye can catch).
//
// WHAT IT DELIBERATELY DOES NOT ANSWER: a PARSE failure. The matchers this module replaced also
// tested for a 'didn't parse' substring, but no producer has ever emitted it — the parse errors
// read 'couldn't parse DXF…', which does not contain that substring. The branch never fired once,
// so it is deleted rather than translated. Teaching the predicate to catch parse failures too
// would START blocking marker saves and hiding the table in cases that are not blocked today.
// That is a behaviour change and therefore the owner's call — not a translation's.

/** Prefix every download-failure text is built from, and the substring the predicate matches. */
export const DOWNLOAD_FAILED = "couldn't download";

/** One sheet of the pack did not fetch. Goes into the warnings array, next to the sheet's name. */
export function sheetDownloadFailed(sheetName: string): string {
  return `${sheetName}: ${DOWNLOAD_FAILED}`;
}

/** Not one sheet fetched — there is nothing to parse at all. Reported as an error, not a warning. */
export const NO_DXF_DOWNLOADED = `${DOWNLOAD_FAILED} any DXF from the CDN`;

/** True when the warning says a pattern sheet did not download. The only legal way to ask. */
export function isFetchFailure(w: string): boolean {
  return w.includes(DOWNLOAD_FAILED);
}
