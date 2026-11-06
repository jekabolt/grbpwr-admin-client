// docs/pattern-pdf-etalon.md — мусор is a file with no curves. A page that is only a picture
// (Skirt-Pocket.pdf) is junk whatever the image encoding. Curves beside a picture are a different
// status (не эталон) and are not decided here.

/** True when the PDF drew nothing: every page has an empty path list, or the file has no pages. */
export function pdfHasNoCurves(pages: readonly { paths: readonly unknown[] }[]): boolean {
  return pages.length === 0 || pages.every((p) => p.paths.length === 0);
}
