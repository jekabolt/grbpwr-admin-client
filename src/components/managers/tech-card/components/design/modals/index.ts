/**
 * THE BAND'S REMAINING DIALOGS — one import surface for the composer.
 *
 * WHAT IS NOT HERE IS AS DELIBERATE AS WHAT IS. Four of the prototype's twelve modals are already
 * built and are NOT re-exported, because a second spelling of a dialog is how two screens come to
 * disagree about the same act:
 *
 *   intake        → `useMediaIntake` + `MediaIntakeDialog`, wired in `uploads-shelf.tsx`. The
 *                   prototype's «pick what the files would depict» is a STAND-IN for a file system
 *                   it does not have; this admin has one, and the receiving dialog (preview, crop,
 *                   confirm) is the real article.
 *   mint          → `mint-dialog.tsx`.
 *   split         → `split-modal.tsx`.
 *   print fork    → `PrintSheetButton` in `sheet-journal.tsx`, which owns the question because it
 *                   owns the journal line and the walk to the paper.
 *
 * Two more are deliberately not ported at all — see the report accompanying this wave:
 *   confirm        → `ui/components/confirmation-modal` IS this dialog; the prototype's version is
 *                    that primitive, written out longhand because the prototype had none.
 *   replaceExplain → a prototype-only note explaining what the prototype does INSTEAD of the re-pin
 *                    procedure. In a build that performs the procedure it explains nothing.
 */

export { CompareModal } from './compare-modal';
export { DiffModal } from './diff-modal';
export { NewDetailModal } from './new-detail-modal';
export { PreconditionsModal } from './preconditions-modal';
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
  DEFAULT_RATIO,
  MAX_STROKES_BYTES,
  STITCHES,
  layerSvg,
  readLayer,
  settleTrace,
  stitchName,
  strokeGeometry,
  writeLayer,
  type LayerDoc,
  type StitchKey,
  type StrokeWeight,
  type VectorStroke,
} from './vector-strokes';
