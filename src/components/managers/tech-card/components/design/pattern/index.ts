/**
 * THE PATTERN VIEW OF THE DESIGN BAND — «pattern creation», K-13.
 *
 * `PatternStudio` is the whole of the view, and since round 19 it is ONE `Section` titled
 * `patterns`: hand it the band and it draws the maker row (frame · name · GENERATE), a hairline,
 * and the grid the answers land in. `PatternInput` and `PatternLibrary` are its two halves and are
 * exported because two organs underneath have readers outside this folder — `patternOutputs` and
 * `pictureFull` are what ARTIFACTS lists its PATTERNS segment from. They are not meant to be
 * reassembled by hand into the screen the studio already assembles: `PatternLibrary` in particular
 * no longer carries a `Section` of its own, so mounting it alone yields a body with no head.
 *
 * ONE READ, ONE WRITE, plus two the band already owns. The read is the band's own `useDesignBand`,
 * passed in as a prop and never called a second time here. The write is `StartDesignRun`.
 * The two borrowed ones are the band's own seams: the mark «chosen»
 * (`useDesignWrites().setPictureSelected`) and the card's asset shelf
 * (`useAssetWrites().upsertAsset`).
 *
 * ⚠ NEITHER OF THOSE TWO IS THE SAVE PATH, and the header that said otherwise has been corrected
 * (see `pattern-library.tsx`). A named pattern run files its own `design_asset{kind:pattern}` on
 * the server, inside the transaction that closes the run (`keepPatternTx`), which is what makes it
 * visible to FABRIC RENDER. `upsertAsset` from this folder means `rename`, or the legacy `keep`
 * door that adopts tiles from runs frozen before round 15 and runs that hit `library_full`.
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
   существует (`SetDesignAssetColorway`) и ПОКАЗЫВАЕТСЯ — рядом `worn by` на плитке библиотеки
   паттернов и рядом `fabric of` в палитре рендера. Объяснение, заменённое фактом, перестаёт быть
   объяснением и становится вторым мнением.
   ⚠ ОДИН КРУГ ЭТА ФРАЗА БЫЛА НЕПРАВДОЙ, И ЭТО СТОИТ ЗАПИСАТЬ: E-15 снял чипы носки, и «показывается»
   перестало выполняться, пока абзац продолжал на него ссылаться. B-26 (круг 20, владелец: «также
   что бы во вкладке паттернс мы могли привзать паттерн к колорвею») вернул орган — уже селектом, а
   не строкой, — и фраза снова описывает экран. Название органа здесь поэтому точное, а не общее. */
export { PatternLibrary } from './pattern-library';
/* `WornByChips` И `usePatternColourways` СНЕСЕНЫ (владелец, r3 п.18: «TILES ON THIS CARD: никакой
   связи с колорвеями»). Разбор — в конце `colourways.tsx`; связь плитки с колорвеем решается на оси
   колорвеев, а не на экране, где плитку делают. */
export { PatternColourRow, colourSwatchHex } from './colourways';
export { CornerLabel, GoToStep, TiledFace } from './organs';
export type { PatternColour, PatternGate } from './model';
/* `useStartPatternRun` ЖИЛ ЗДЕСЬ НЕДЕЛЮ И СНЕСЁН. Он минтил СВОЙ ключ идемпотентности по СВОЕМУ
   отпечатку — то есть держал второй ответ на вопрос «то же ли это нажатие, что и прошлое», а
   именно на этом вопросе и разъезжается оплаченный дважды прогон. Плитка стартует тем же
   `useStartDesignRun`, что рендер, перекрас и 3D; параметры собирает вызывающий экран. */
/* `pickableColourways` И `colourwayHex` СНЕСЕНЫ (волна 2). Записка на их месте обещала, что
   вкладка COLOURWAYS их заберёт; она их не забрала — свотч колорвея читается там `dev_hex` с
   фолбэком на словарь (`colourwaySwatchHex` в `colorway-recipe.tsx`), а список «каких колорвеев
   можно выбрать» на оси колорвеев считает `useColorwayChoice`. Читателей не осталось ни одного,
   и держать чистую функцию «на будущее» — это ровно тот мёртвый код, о котором записка и
   предупреждала. */
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
  patternColourKey,
  patternColourRecipe,
  patternGate,
  patternOutputs,
  patternRuns,
  patternTwin,
  pictureFull,
  pictureThumb,
  recentPatternColours,
  refusalAdvice,
  repeatOfRun,
  seamWarningOf,
  shelfIsFull,
} from './model';
