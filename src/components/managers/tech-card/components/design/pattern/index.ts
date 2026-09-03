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
/* ═══ `PatternOutputs` И `tile-preview` СНЕСЕНЫ ВМЕСТЕ С БЛОКОМ TILES (J-12) ═══════════════════
   Владелец: «блок TILES вообще не нужен … можно просто оставить блок PATTERNS OF THIS CARD».
   Ушли ВСЕ их органы, потому что все они принадлежали снятому блоку и ни у одного не осталось
   второго читателя: сцена 3×3 (`TileGrid`), линейка (`ScaleStrip`, `SPANS`), полоса плотности
   ряда SCALE (`ClothSwatchStrip`, `swatchTiles`). Вопрос «оно тайлится?» решается теперь на лице
   карточки паттерна (плитка 2×2) и в общем просмотрщике до 8×, а дверь `KEEP` переехала в полосу
   «made earlier, not kept» внутри `pattern-library.tsx` — довод целиком в её шапке. */
/* `ClothSource` СНЕСЁН ВМЕСТЕ СО СВОИМ ФАЙЛОМ (G-15). Он объяснял СЛОВАМИ, какой из двух
   источников ткани сейчас действует, потому что связи «этот паттерн — ткань этого цвета» негде
   было записать: на проводе стоял один `params.colour`, а полка была общей кучей. Связь теперь
   существует (`SetDesignAssetColorway`) и ПОКАЗЫВАЕТСЯ — строкой «worn by ROSSO» в библиотеке
   паттернов и рядом `fabric of` в палитре рендера. Объяснение, заменённое фактом, перестаёт быть
   объяснением и становится вторым мнением. */
export { PatternLibrary } from './pattern-library';
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
