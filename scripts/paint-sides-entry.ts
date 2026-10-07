// PAINT THE PARTS · Ф1 — the L/R check on the drawing and the openings, bundled by `paint-sides-probe.mjs`.
export {
  adoptEdges,
  BAND_MAX_WIDTH,
  BAND_MIN_ELONGATION,
  bandShape,
  clearOpenings,
  heldPartsFresh,
  innerLayerPart,
  labelKeys,
  topEndXs,
  partsAskKey,
  dropOpenings,
  fixBands,
  fixSides,
  partAcross,
  partsOf,
  transferable,
  unassignedRegion,
  PARTS_ALGO_REV,
  PARTS_REGIONS_MIN,
} from 'components/managers/tech-card/components/design/paint/parts-model';
export {
  analyseFlat,
  REGIONS_ALGO_REV,
} from 'components/managers/tech-card/components/design/paint/regions';
export { decode as decodePng } from 'fast-png';
