/**
 * THE TWO GENERATIVE SCREENS OF THE DESIGN BAND — `FABRIC RENDER` and `3D`.
 *
 * `RenderStudio` and `ThreedStudio` are the whole of a view: hand one of them the band and it draws
 * its inputs, its menu and its GENERATE. The organs underneath are exported because they are the
 * prototype's own vocabulary and a composer may want them apart — the palette alone in a dialog —
 * not because they are meant to be reassembled by hand into a screen the studios already assemble
 * correctly.
 *
 * ⚠ `RenderInputStrip` СНЯТ ВМЕСТЕ СО СВОИМ ФАЙЛОМ (r3, пул), и с ним `renderPlacements` /
 * `RenderPlacement` из `./model`. Полоса перестала монтироваться откуда бы то ни было кругом r2 —
 * две ленты с верха FABRIC RENDER сняты по слову владельца, разметка уехала к самим картинкам в
 * `outputs.tsx`, — но продолжала жить 1382 строками и утягивать за собой живой реэкспорт. Ноль
 * потребителей проверен грепом по всему `src/` до сноса.
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
export { ClothIsRow } from './cloth-is';
export { ColourStatementRow, COLOUR_NAME_MAX } from './colour-statement';
export { OutputsSection } from './outputs';
export { Palette } from './palette';
export { RenderStudio } from './render-studio';
export { RendersByViewGroup, SidesSection } from './side-row';
export { ThreedStudio } from './threed-studio';
export { BodyPicker, modelCaption, modelFacts, modelName } from './model-picker';
export { WhatModelGetsRenderModal } from './what-model-gets';
export type { WhatModelGetsKind } from './what-model-gets';

export { echoOf, mergeEcho, useCardFit, useColourDraft, useThreedDraft } from './drafts';
export type {
  ColourDraft,
  EchoSource,
  EchoValues,
  OperatorOwned,
  ThreedDraft,
  ThreedDraftState,
  TypedColour,
} from './drafts';
export { useStartDesignRun } from './use-design-run';
export type { StartRunInput, StartRunState } from './use-design-run';
export {
  BODY_TYPES,
  CLOTH_GSM_MAX,
  CLOTH_GSM_MIN,
  CLOTH_OPACITIES,
  EMPTY_CLOTH,
  fabricAuthority,
  RENDER_SHEET_ORDER,
  SELECT_MARK_NOT_STATED,
  SAMPLE_WORD,
  benchKindOf,
  benchName,
  benchSides,
  colourLabel,
  colourSubtitle,
  fabricRenderGate,
  fabricStatement,
  hexIsPaintable,
  madeOfLine,
  normaliseGsm,
  normaliseTypedHex,
  readGsm,
  outputsOfKind,
  pictureIsComposite,
  pictureIsSelected,
  recipeIsStated,
  renderGate,
  renderSheetViews,
  runOfPicture,
  statedWords,
  serverStatesSelected,
  slotOrigin,
  slotOriginLine,
  threedColorwayOptions,
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
  ClothDraft,
  ClothOpacity,
  FabricStatement,
  Gate,
  SlotOrigin,
} from './model';
