/**
 * THE PATTERN VIEW OF THE DESIGN BAND — «pattern creation», K-13.
 *
 * `PatternStudio` is the whole of the view: hand it the band and it draws the source, the menu, the
 * tiles and the answer to «do I still have to fill in CLOTH». The organs underneath are exported
 * because two of them have readers outside this folder — `patternOutputs` and `pictureFull` are
 * what ARTIFACTS lists its PATTERNS segment from — and because a composer may want the preview
 * alone. They are not meant to be reassembled by hand into the screen the studio already assembles.
 *
 * ONE READ, ONE WRITE, plus two the band already owns. The read is the band's own `useDesignBand`,
 * passed in as a prop and never called a second time here. The write is `StartDesignRun`
 * (`useStartPatternRun`). The two borrowed ones are the band's own seams: the mark «chosen»
 * (`useDesignWrites().setPictureSelected`) and the card's asset shelf
 * (`useAssetWrites().upsertAsset`) — a tile kept as cloth is an ordinary `design_asset` of kind
 * `pattern`, which is exactly what makes it visible to FABRIC RENDER.
 */
export { PatternStudio } from './pattern-studio';
export { PatternInput } from './pattern-input';
export { PatternOutputs } from './pattern-outputs';
export { ClothSource } from './cloth-source';
export { ScaleStrip, SPANS, TileGrid } from './tile-preview';
/* `useStartPatternRun` ЖИЛ ЗДЕСЬ НЕДЕЛЮ И СНЕСЁН. Он минтил СВОЙ ключ идемпотентности по СВОЕМУ
   отпечатку — то есть держал второй ответ на вопрос «то же ли это нажатие, что и прошлое», а
   именно на этом вопросе и разъезжается оплаченный дважды прогон. Плитка стартует тем же
   `useStartDesignRun`, что рендер, перекрас и 3D; параметры собирает вызывающий экран. */
export {
  PATTERN,
  REFUSAL_ADVICE,
  REPEAT_MAX,
  SEAM_CODE,
  SEAM_WORDS,
  assetOfMedia,
  fabricAssets,
  nextPatternName,
  normaliseRepeat,
  patternAssets,
  patternGate,
  patternOutputs,
  patternRuns,
  pictureFull,
  pictureThumb,
  refusalAdvice,
  repeatOfRun,
  seamWarningOf,
  shelfIsFull,
} from './model';
