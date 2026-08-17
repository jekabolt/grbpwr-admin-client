// Точка входа зонда читалки: ровно те функции, у которых есть КОНТРАКТ с экраном.
// Компоненты сюда не тянем — вопрос зонда про счётчик совпадений и про подсветку, не про вёрстку.
export {
  buildPageText,
  countsByPage,
  findAcrossPages,
  findInText,
  hasTextLayer,
  isReadablePdf,
  pageForSpread,
  pageOfHit,
  queryPattern,
  sliceMatch,
  stepHit,
  stepPage,
  stepZoom,
  syncHitToPages,
  visiblePages,
  TEXT_LAYER_SAMPLE_PAGES,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from 'components/managers/files/utils/reader-find';
