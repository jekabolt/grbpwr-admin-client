/**
 * THE PATTERN VIEW OF THE DESIGN BAND — STEP 3, «a fabric swatch for every colourway and slot».
 *
 * `PatternStudio` is the whole of the view: ONE `Section` with a `GroupLabel` per colourway, a row
 * per cloth slot (BOM roll-goods line) under it, and the IMAGE TO FABRIC group with the one history
 * of the step — the LAST FABRICS carousel — at the end. Hand it the band, the composer's colourways
 * and the composer's cloth slots (`clothSlots` over `bomItems`, read ONCE in `studio-tab.tsx`).
 *
 * ONE READ, TWO WRITES, plus the shelf's own. The read is the band's `useDesignBand`, passed in as
 * a prop and never called a second time here. The writes are `StartDesignRun` (a swatch for a pair,
 * or a fabric out of a photograph) and `SetDesignAssetBinding` (`use for ▸` in the carousel). The
 * shelf's own are `UpsertDesignAsset` (rename; a picture that is already a tile) and
 * `DeleteDesignAsset`.
 *
 * ⚠ NONE OF THEM IS THE SAVE PATH OF A SWATCH. A run made for a pair files its own
 * `design_asset{kind:pattern}` on the server, inside the transaction that closes the run
 * (`keepPatternTx`), AND makes it the fabric of that pair (the binding upsert) — which is what makes
 * it the cloth of FABRIC RENDER for that colourway. Nothing is written by the client after a run.
 *
 * `patternOutputs` and `pictureFull` stay exported for ARTIFACTS (its PATTERNS segment reads them
 * from `./pattern/model` directly — the index pulls the screen in); the slot model is exported for
 * the composer and for FABRIC RENDER, which seeds its cloths from the same bindings.
 */
export { PatternStudio, type PatternStudioProps } from './pattern-studio';
export { PatternInput } from './pattern-input';
export { ImageToFabric } from './image-to-fabric';
export { FabricCarousel } from './fabric-carousel';
/* ═══ `PatternLibrary` И `PatternColourRow` СНЕСЕНЫ ВМЕСТЕ СО СВОИМИ ФАЙЛАМИ (STEP 3, 2026-09-26) ══
   `pattern-library.tsx` держал две полки («tiles on this card», «made earlier, not kept») и
   дверь `keep it`; `colourways.tsx` — ряд COLOUR «ничьего» цвета плитки (r2 §26) и
   `colourSwatchHex`. Экран шага переписан владельцем: цвет — свойство пары (колорвей, слот), полка
   и история стали одной каруселью (`fabric-carousel.tsx`), а легаси-сироты `keep it` больше не
   рождаются — полная полка теперь ворота, а не примечание (`swatchGate` / `imageGate`). Читателей
   у снесённого не осталось ни одного (проверено поиском по `src`). */
export { CornerLabel, FABRIC_CELL_ASPECT, PendingTile, TiledFace } from './organs';
export {
  PATTERN,
  REFUSAL_ADVICE,
  REPEAT_MAX,
  SEAM_CODE,
  SEAM_WORDS,
  normaliseRepeat,
  patternAssets,
  patternOutputs,
  patternRuns,
  pictureFull,
  pictureThumb,
  refusalAdvice,
  repeatOfRun,
  seamWarningOf,
  shelfIsFull,
} from './model';
export {
  READ_ONLY_RUN_REASON,
  READ_ONLY_SHELF_REASON,
  SILENT_SERVER_REASON,
  SLOT_WORDS_MAX,
  bindingOf,
  bindingsOf,
  boundAsset,
  boundAssetsByPair,
  clothSlots,
  clothTwin,
  colourIsStated,
  imageGate,
  mintFabricName,
  mintSlotName,
  pairKey,
  pairOfRun,
  pairsOfAsset,
  recentFabrics,
  rowColour,
  shelfCeiling,
  slotSuggestions,
  slotUsage,
  slotUsageRow,
  swatchColour,
  swatchGate,
  type BomLineLike,
  type ClothSlot,
  type ClothSlots,
  type ShelfCeiling,
  type SlotUsage,
  type SwatchColour,
} from './slot-fabrics';
