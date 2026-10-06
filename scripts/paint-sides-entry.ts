// PAINT THE PARTS · Ф1 — the L/R check on the drawing and the openings, bundled by `paint-sides-probe.mjs`.
export {
  BAND_MAX_WIDTH,
  BAND_MIN_ELONGATION,
  bandShape,
  clearOpenings,
  heldPartsFresh,
  partsAskKey,
  dropOpenings,
  fixBands,
  fixSides,
  partAcross,
  partsOf,
  transferable,
  PARTS_ALGO_REV,
} from 'components/managers/tech-card/components/design/paint/parts-model';
export { analyseFlat } from 'components/managers/tech-card/components/design/paint/regions';
export { decode as decodePng } from 'fast-png';
