/**
 * THE TWO GENERATIVE SCREENS OF THE DESIGN BAND — `FABRIC RENDER` and `3D`.
 *
 * `RenderStudio` and `ThreedStudio` are the whole of a view: hand one of them the band and it draws
 * its inputs, its menu and its GENERATE. The organs underneath are exported because they are the
 * prototype's own vocabulary and a composer may want them apart — the input strip alone above a
 * different menu, the palette alone in a dialog — not because they are meant to be reassembled by
 * hand into a screen the studios already assemble correctly.
 *
 * COLOUR HISTORY IS GONE, ON THE OWNER'S WORD («COLOUR HISTORY нам не нужен», round 4 / T-19), and
 * with it the whole restore-a-recipe-by-chip mechanism: the chips, their staleness mark, the recipe
 * key they were identified by and the draft's `restore`. What remains of the past is the seed —
 * `useColourDraft` opens on the recipe the card last rendered with — because that costs no organ on
 * screen and answers the only question the chips were ever pressed for.
 *
 * WHAT THEY READ AND WRITE. One read (`GetDesignBand`, through the band's own `useDesignBand`, whose
 * result is passed in as a prop — never a second call) and one write (`StartDesignRun`). The bench
 * writes of the input strip go through the band's frozen seam, `useDesignWrites`. Two dictionaries
 * are consulted for pickers that are windows into existing admin entities rather than lists invented
 * here: the colour dictionary (through `DictionaryProvider`, already loaded once at startup) and the
 * fit models (`ListModels`, through the models manager's own `useAllModels`).
 */
export { OutputsSection } from './outputs';
export { Palette } from './palette';
export { RenderInputStrip } from './render-input-strip';
export { RenderStudio } from './render-studio';
export { ThreedInputStrip } from './threed-input-strip';
export { ThreedStudio } from './threed-studio';
export { BodyPicker, modelCaption, modelFacts, modelName } from './model-picker';
export { WhatModelGetsRenderModal } from './what-model-gets';
export type { WhatModelGetsKind } from './what-model-gets';

export { useCardFit, useColourDraft, useThreedDraft } from './drafts';
export type { ColourDraft, ThreedDraft, ThreedDraftState } from './drafts';
export { useStartDesignRun } from './use-design-run';
export type { StartRunInput, StartRunState } from './use-design-run';
export {
  BODY_TYPES,
  FABRIC_AUTHORITY,
  RENDER_SHEET_ORDER,
  SELECT_MARK_NOT_STATED,
  benchKindOf,
  benchSides,
  colourLabel,
  colourSubtitle,
  fabricRenderGate,
  fabricStatement,
  hexIsPaintable,
  outputsOfKind,
  pictureIsComposite,
  pictureIsSelected,
  recipeIsStated,
  renderGate,
  renderSheetViews,
  runOfPicture,
  serverStatesSelected,
  threedCandidates,
  threedGate,
  threedRevisions,
  threedSides,
  turntableSourceIds,
  unmarkedFlats,
  wireColourSource,
} from './model';
export type {
  BenchKind,
  BenchSide,
  BodyType,
  FabricStatement,
  Gate,
  ThreedCandidate,
} from './model';
