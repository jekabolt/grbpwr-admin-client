/**
 * THE BAND'S REMAINING DIALOGS — one import surface for the composer.
 *
 * WHAT IS NOT HERE IS AS DELIBERATE AS WHAT IS. Two of the prototype's twelve modals are built
 * elsewhere and are NOT re-exported, because a second spelling of a dialog is how two screens come
 * to disagree about the same act:
 *
 *   intake        → `useMediaIntake` + `MediaIntakeDialog`, wired in `media/utils/useMediaIntake.tsx`
 *                   and reached from every media slot. (It used to be named as living in
 *                   `uploads-shelf.tsx`; that organ was removed with R-18 and the pointer rotted
 *                   with it — a reference to a deleted file reads as «this is not built here»,
 *                   which is the opposite of true.) The
 *                   prototype's «pick what the files would depict» is a STAND-IN for a file system
 *                   it does not have; this admin has one, and the receiving dialog (preview, crop,
 *                   confirm) is the real article.
 *   split         → `split-modal.tsx`.
 *
 * TWO MORE ARE NOT BUILT ANYWHERE ANY MORE, and they are named here so the absence reads as a
 * decision rather than as an oversight. `mint` and the `print fork` were built, and both were
 * REMOVED with the sheet's versions on the owner's word: there is no minting a sheet into a
 * numbered signed version, no journal of issues, and so no fork to ask which one goes to paper.
 * The SHEET itself is untouched — it is the live composition on ARTIFACTS. Naming their old files
 * here would be worse than saying nothing: a pointer to a deleted file reads as «this is not built
 * here», which is the opposite of true for the sheet and stale for the mint.
 *
 * Two more are deliberately not ported at all — see the report accompanying this wave:
 *   confirm        → `ui/components/confirmation-modal` IS this dialog; the prototype's version is
 *                    that primitive, written out longhand because the prototype had none.
 *   replaceExplain → a prototype-only note explaining what the prototype does INSTEAD of the re-pin
 *                    procedure. In a build that performs the procedure it explains nothing.
 */

// `CompareModal` жила здесь и умерла вместе с циклом починки (S-15): её единственная дверь —
// «compare ▸» на полосе «fix is in» — снята, а модалка без двери — это экспорт в никуда.
export { NewDetailModal } from './new-detail-modal';
export { VectorModal } from './vector-modal';
export { WhatModelGetsModal } from './what-model-gets-modal';

export {
  findLayerForMedia,
  layerRefusalText,
  uploadRaster,
  useDesignEditLayer,
  useEditLayerWrites,
  type LayerHandle,
} from './use-edit-layer';

export {
  CONTROL_REACH,
  DEFAULT_RATIO,
  FORMAT_VERSION,
  MAX_STROKES_BYTES,
  STITCHES,
  cubicAt,
  hasSegments,
  layerSvg,
  readLayer,
  settleTrace,
  stitchName,
  strokeGeometry,
  strokePolyline,
  writeLayer,
  type CubicSeg,
  type LayerDoc,
  type StitchKey,
  type StrokeWeight,
  type VectorStroke,
} from './vector-strokes';

export {
  RASTER_FALLBACK_W,
  RASTER_MAX_W,
  rasteriseStrokesOverBase,
} from './rasterise-layer';

export { SvgImportDoor } from './svg-import-door';
export {
  arcToCubics,
  importSvg,
  parsePathData,
  type SvgImportReading,
  type SvgImportRefusal,
  type SvgImportResult,
} from './svg-import';
